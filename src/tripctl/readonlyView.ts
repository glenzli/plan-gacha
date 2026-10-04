import { readonlyViewInputSchema } from './linkageSchema';
import { parseState, hash } from './engine';
import { TripError } from './schema';
import { analyseEvidenceImpact } from './evidenceImpact';
import { assessRouteEstimate } from './reminders';
import { reconcileReminders } from './reminderReconcile';
import { analyseItinerary } from './itinerary';
import { preparePlanningContext } from '../domain/planningTools';
/** Private derived projection, never a second authoritative journey or a live provider connection. */
export async function exportReadonlyView(input: unknown, request: unknown) {
  const p = readonlyViewInputSchema.safeParse(request); if (!p.success) throw new TripError('invalid_view_request', 'Supply explicit asOf and generatedAt, with optional retrieved source identity/version');
  const q = p.data; if (Date.parse(q.generatedAt) < Date.parse(q.asOf) || q.source && Date.parse(q.source.retrievedAt) > Date.parse(q.generatedAt)) throw new TripError('invalid_view_time', 'Generation must not precede analysis or source retrieval');
  const state = parseState(input); const content = state.content; const context = preparePlanningContext(content.snapshot);
  const impact = await analyseEvidenceImpact(state, { asOf: q.asOf }); const reminders = reconcileReminders(state, q.asOf);
  const analysis = content.itinerary ? analyseItinerary(content.itinerary, { asOf: q.asOf }, content) : null;
  const recent = state.history.slice(-10).map((h) => ({ id: h.id, revision: h.revision, at: h.at, reason: h.reason, operationType: h.operation.type }));
  return { projectionSchemaVersion: 1, readOnly: true, derived: true, saved: false, audience: 'private_owner',
    source: { journeyId: content.snapshot.trip.id, revision: state.revision, stateHash: hash(state), library: q.source || null, metadataIsCallerSupplied: true },
    freshness: { asOf: q.asOf, generatedAt: q.generatedAt, sourceRetrievedAt: q.source?.retrievedAt || null, automaticRefresh: false, providerSyncAt: null },
    organized: organizeView(state, impact),
    trip: { name: content.snapshot.trip.name || '', archived: content.snapshot.trip.archived, todayId: content.snapshot.todayId, dates: context.tripDates.map((d) => d.id), timeZone: content.itinerary?.timeZone || content.snapshot.trip.timeZone || content.snapshot.trip.timezone || content.snapshot.trip.time_zone || null },
    current: context.tripDates.map((d) => { const entry = content.snapshot.trip.schedule[d.id]; const plan = context.plans.find((p) => p.id === entry?.planId); return { dateId: d.id, assignment: entry || null, plan: plan ? { id: plan.id, name: plan.name, stops: plan.stops, bookings: plan.bookings } : null, typedDay: content.itinerary?.current.find((day) => day.dateId === d.id) || null }; }),
    actual: content.itinerary?.actual || [], lodgings: content.snapshot.trip.lodgings,
    alternatives: impact.options?.options || [], unassessedAlternatives: impact.options?.unassessedOptions || [], inactiveAlternatives: impact.options?.inactiveOptions || [],
    decisions: analysis?.decisions || [], pendingQuestions: impact.questions,
    evidence: impact.impacts.map(({ proposal, ...row }) => ({ ...row, proposedChange: proposal ? { operation: proposal.operation, canApply: proposal.canApply, reasonCodes: proposal.reasonCodes } : null })),
    reminders, recentChanges: { total: state.history.length, returned: recent.length, truncated: state.history.length > recent.length, items: recent },
    checklist: { text: content.snapshot.trip.checklistText, state: content.snapshot.trip.checklistState },
    refreshContract: ['Materialize the one authoritative current journey and retain its native version', 'After an authorized same-identity CAS and readback, regenerate this projection from those exact bytes', 'Publishing/refreshing a private Site is a separate host action; this export performs neither', 'Display source revision/hash and generation/retrieval timestamps; a cached view may be stale'],
    limitations: impact.limitations,
  };
}

/** Only explicit IDs/date fields organize data. Free text is displayed, never parsed into state. */
function organizeView(state: ReturnType<typeof parseState>, impact: Awaited<ReturnType<typeof analyseEvidenceImpact>>) {
  const c = state.content; const tripId = c.snapshot.trip.id; const context = preparePlanningContext(c.snapshot);
  const dates = context.tripDates.map((d) => d.id);
  const bindings = new Map((c.linkage?.contextBindings || []).map((b) => [b.subjectType + ':' + b.subjectId, b]));
  const gaps: { code: string; ref: string; detail: string }[] = [];
  const ref = (kind: string, ...ids: string[]) => kind + ':' + ids.map(encodeURIComponent).join(':');
  const linkage = (kind: 'fact' | 'preference' | 'option' | 'issue', id: string, dateIds: string[] = [], planId?: string, activityId?: string) => {
    const b = bindings.get(kind + ':' + id); const value = { dateIds: b ? b.dateIds : dateIds, planId: (b ? b.planId : planId) || null, activityId: (b ? b.activityId : activityId) || null, reportedActualId: b?.reportedActualId || null, bindingId: b?.id || null, bindingSource: b?.source || null, role: b?.role || 'context' };
    const activityCurrent = Boolean(value.activityId && (value.reportedActualId ? c.linkage?.actualChanges?.filter((r) => r.actualId === value.reportedActualId).at(-1)?.replacementActivities.some((a) => a.id === value.activityId) : context.plans.some((p) => p.id === value.planId && p.stops.some((a) => a.id === value.activityId))));
    if (value.activityId && !activityCurrent) gaps.push({ code: 'historical_activity_reference', ref: ref(kind, id), detail: 'This reference names a historical activity; it does not lock the current itinerary or assert the activity still exists.' });
    if (!value.dateIds.length || !value.planId && !value.reportedActualId || kind === 'fact' && !value.activityId) gaps.push({ code: 'missing_typed_link', ref: ref(kind, id), detail: 'Known content remains visible; date/plan/activity association is incomplete. Use bind_context after explicit confirmation.' });
    return { ...value, activityRef: value.activityId ? value.reportedActualId ? ref('reported-activity', value.activityId) : ref('activity', value.planId!, value.activityId) : null, activityCurrent };
  };
  const superseded = new Set(c.memory.facts.flatMap((f) => f.experience?.supersedesFactId ? [f.experience.supersedesFactId] : []));
  const facts = c.memory.facts.filter((f) => !superseded.has(f.id)).map((f) => ({ ref: ref('fact', f.id), journeyId: tripId, ...f, association: linkage('fact', f.id, f.experience?.eventDateId ? [f.experience.eventDateId] : [], f.experience?.planId, f.experience?.activityId) }));
  const preferences = c.memory.preferences.map((p) => ({ ref: ref('preference', p.id), journeyId: tripId, ...p, association: linkage('preference', p.id) }));
  const optionRows = [...(impact.options?.options || []), ...(impact.options?.unassessedOptions || []), ...(impact.options?.inactiveOptions || [])];
  const options = optionRows.map((o) => {
    const b = bindings.get('option:' + o.id); const stale = Boolean(b && (b.dateIds.some((d) => !o.dateIds.includes(d)) || b.planId && o.requirements?.plans.some((p) => b.dateIds.includes(p.dateId) && p.planId !== b.planId)));
    if (stale) gaps.push({ code: 'stale_context_binding', ref: ref('option', o.id), detail: 'Display association no longer matches current option requirements; review the explicit link before treating it as a current backup.' });
    return { ref: ref('option', o.id), ...o, active: o.active && !stale, eligibility: stale && o.eligibility.status !== 'inactive' ? { ...o.eligibility, status: 'unassessed', reasonCodes: [...o.eligibility.reasonCodes, 'stale_context_binding'] } : o.eligibility, association: linkage('option', o.id, o.dateIds), dateMeaning: stale ? 'stale_context_binding' : b ? 'explicit_context_binding' : 'candidate_dates_not_assignment', role: stale ? 'stale_binding' : b?.role || 'alternative', scheduleApplied: false };
  });
  const issues = c.memory.issues.map((i) => ({ ref: ref('issue', i.id), ...i, association: linkage('issue', i.id, [], i.relatedPlanId) }));
  const activities = context.plans.flatMap((p) => p.stops.map((s) => ({ ref: ref('activity', p.id, s.id), planId: p.id, activityId: s.id, current: true, title: s.title, location: s.location, time: s.time, typed: c.itinerary?.current.find((d) => d.planId === p.id)?.activities.find((a) => a.id === s.id) || null })));
  for (const old of [c, ...state.history.flatMap((h) => [h.before, h.after])]) for (const day of [...(old.itinerary?.baseline.days || []), ...(old.itinerary?.current || [])]) for (const a of day.activities) {
    const key = ref('activity', day.planId, a.id);
    if (!activities.some((row) => row.ref === key)) activities.push({ ref: key, planId: day.planId, activityId: a.id, current: false, title: a.title, location: { label: '', query: '', address: '', ...a.location }, time: a.timing.start || '', typed: a });
  }
  const actualReports = (c.itinerary?.actual || []).map((a) => ({ ref: ref('actual', a.id), ...a, exactTimeKnown: Boolean(a.at) }));
  const latestChanges = new Map((c.linkage?.actualChanges || []).map((r) => [r.actualId, r]));
  const actualChanges = [...latestChanges.values()].map((r) => ({ ref: ref('actual-change', r.id), ...r, reportRef: ref('actual', r.actualId), replacementActivityRefs: r.replacementActivities.map((a) => ref('reported-activity', a.id)) }));
  const reportedActivities = actualChanges.flatMap((r) => r.replacementActivities.map((a) => ({ ref: ref('reported-activity', a.id), dateId: r.dateId, reportRef: r.reportRef, ...a, planned: false, completionVerified: false, exactTimeKnown: Boolean(a.timing.start) })));
  const plans = context.plans.map((p) => ({ ref: ref('plan', p.id), id: p.id, name: p.name, description: p.description, priority: p.priority, location: p.location, availableDates: p.available_dates, closedDates: p.closed_dates, activityRefs: activities.filter((a) => a.current && a.planId === p.id).map((a) => a.ref) }));
  const assignedPlanIds = new Set(Object.values(c.snapshot.trip.schedule).filter((a) => a.status !== 'abandoned').map((a) => a.planId));
  const bookings = context.plans.flatMap((p) => p.bookings.map((b) => ({ ref: ref('booking', p.id, b.id), planId: p.id, ...b, association: { dateIds: b.dateId ? [b.dateId] : dates.filter((d) => c.snapshot.trip.schedule[d]?.planId === p.id), activityIds: b.stopIds || [] }, liveStatusVerified: false })));
  const commitments = (c.itinerary?.commitments || []).map((r) => ({ ref: ref('commitment', r.id), ...r, liveStatusVerified: false }));
  const lodgings = c.snapshot.trip.lodgings.map((l) => {
    const stays = l.reservations?.filter((r) => r.status !== 'cancelled') || [];
    const hasDates = Boolean(stays.length || l.checkIn && l.checkOut);
    const nightDates = dates.filter((d) => stays.length ? stays.some((r) => d >= r.checkIn && d < r.checkOut) : Boolean(l.checkIn && l.checkOut && d >= l.checkIn && d < l.checkOut));
    const assignedDates = dates.filter((d) => c.snapshot.trip.schedule[d]?.lodgingId === l.id);
    if (hasDates && assignedDates.some((d) => !nightDates.includes(d))) gaps.push({ code: 'lodging_night_assignment_conflict', ref: ref('lodging', l.id), detail: 'A saved day assignment disagrees with explicit check-in/night dates; explicit stay nights control this view.' });
    return { ref: ref('lodging', l.id), ...l, dateIds: hasDates ? nightDates : assignedDates, nightDates: hasDates ? nightDates : null, dateBasis: hasDates ? 'explicit_stay_nights' : 'schedule_only_night_unverified', liveStatusVerified: false };
  });
  const decisions = new Map(c.memory.decisions.map((d) => [d.planId + ':' + (d.dateId || '*'), d]));
  const exclusions = [...decisions.values()].filter((d) => d.disposition === 'excluded').map((d) => ({ ref: ref('exclusion', d.id), ...d, dateIds: d.dateId ? [d.dateId] : dates, scope: d.dateId ? 'journey_date' : 'this_journey', permanentPreference: false }));
  const evidence = impact.impacts.map((i) => ({ ref: ref('evidence', i.streamId), observationIds: i.headIds, scope: i.observation.scope, publishedAt: i.observation.publishedAt, observedAt: i.observation.source.observedAt, expiresAt: i.observation.expiresAt, basis: i.observation.basis, status: i.status, claim: i.observation.claim, reasonCodes: i.reasonCodes, summary: i.observation.summary, source: i.observation.source }));
  const weather = Object.entries(c.snapshot.weatherData).flatMap(([key, value]) => Object.entries(value.dailyByDate || {}).filter(([, day]) => day).map(([dateId, day]) => ({ ref: ref('weather', key, dateId), datasetKey: key, dateId, values: day, fetchedAt: value.fetchedAt ?? null, freshness: 'not_validated', planBinding: null })));
  const pending = impact.questions.map((q) => { const issue = issues.find((i) => q.id === 'issue:' + i.id); const option = options.find((o) => o.uncertainties.some((_, n) => q.id === 'option:' + o.id + ':' + n)); const ev = evidence.filter((e) => e.observationIds.some((id) => q.observationIds.includes(id))); return { ref: ref('question', q.id), ...q, dateIds: [...new Set(issue?.association.dateIds || option?.association.dateIds || ev.map((e) => e.scope.dateId))] }; });
  const confirmedRoutes = new Map((c.linkage?.dayRoutes || []).filter((r) => Date.parse(r.source.observedAt) <= Date.parse(impact.asOf)).map((r) => [r.dateId, r]));
  const routeEntries = [...confirmedRoutes.values()].flatMap((r) => r.entries.map((e, index) => ({ ref: ref('route-entry', r.id, e.id), routeId: r.id, dateId: r.dateId, position: index, ...e, type: e.purpose === 'scenic_route' ? 'route_scenery' : e.activitySnapshot.kind, title: e.activitySnapshot.title, timing: e.timing || (e.status === 'planned' ? e.activitySnapshot.timing : {}), timingBasis: e.timing ? 'explicit_route_report' : e.status === 'planned' ? 'planned_activity' : 'actual_time_unknown', ...assessRouteEstimate(c, e, r.dateId, impact.asOf), source: r.source })));
  for (const e of routeEntries) if (e.status !== 'skipped') {
    if (['transfer', 'route_scenery'].includes(e.type) && ['missing', 'stale', 'future', 'unusable', 'scenic_stop_range_needed'].includes(e.estimateStatus)) pending.push({ ref: ref('question', 'route-estimate', e.routeId, e.id), id: ref('route-estimate', e.routeId, e.id), code: 'route_estimate_needed', text: 'Query the map travel duration for ' + e.title + ' using its explicit endpoints; add a separate viewing/stop range for a scenic route. If tools are unavailable, retain a labeled planning assumption and ask only decision-critical missing endpoints.', observationIds: [], dateIds: [e.dateId] });
    if (e.type === 'lodging' && !e.lodgingId) pending.push({ ref: ref('question', 'lodging-identity', e.routeId, e.id), id: ref('lodging-identity', e.routeId, e.id), code: 'lodging_identity_needed', text: 'Confirm the hotel identity for the night of ' + e.dateId + ' so the final drive can be estimated.', observationIds: [], dateIds: [e.dateId] });
  }
  const days = dates.map((dateId) => {
    const assignment = c.snapshot.trip.schedule[dateId]; const active = options.filter((o) => o.association.dateIds.includes(dateId) && o.eligibility.status !== 'inactive');
    const plannedPrimary = assignment && assignment.status !== 'abandoned' ? { planId: assignment.planId, activityRefs: activities.filter((a) => a.current && a.planId === assignment.planId).map((a) => a.ref) } : null;
    const dayReports = actualReports.filter((a) => a.dateId === dateId && Date.parse(a.source.observedAt) <= Date.parse(impact.asOf));
    const reports = dayReports.filter((a) => ['changed_plan', 'skipped'].includes(a.kind));
    const changes = actualChanges.filter((r) => r.dateId === dateId && Date.parse(r.source.observedAt) <= Date.parse(impact.asOf));
    const conflicts = changes.filter((r) => changes.some((other) => other.id !== r.id && r.previousActivityIds.some((id) => other.previousActivityIds.includes(id))));
    const applicable = changes.filter((r) => !conflicts.includes(r));
    const skipped = reports.filter((a) => a.kind === 'skipped' && a.activityId);
    const unlinked = reports.filter((a) => a.kind !== 'skipped' && !applicable.some((r) => r.actualId === a.id));
    const replaced = new Set([...applicable.flatMap((r) => r.previousActivityIds), ...skipped.map((a) => a.activityId!)]);
    const broadChange = unlinked.some((r) => !r.activityId); const scopedUnlinked = new Set(unlinked.flatMap((r) => r.activityId ? [r.activityId] : []));
    const priorRefs = (plannedPrimary?.activityRefs || []).filter((key) => broadChange || activities.some((a) => a.ref === key && (replaced.has(a.activityId) || scopedUnlinked.has(a.activityId))));
    const replacementRefs = applicable.flatMap((r) => r.replacementActivityRefs);
    const activityRefs = [...(broadChange ? [] : (plannedPrimary?.activityRefs || []).filter((key) => !priorRefs.includes(key))), ...replacementRefs];
    const primary = { planId: plannedPrimary?.planId || null, activityRefs, basis: unlinked.length ? 'reported_change_needs_binding' : applicable.length || skipped.length ? 'explicit_actual_change' : 'current_planned_schedule', actualReportRefs: dayReports.map((a) => a.ref), activityRefsOrder: applicable.length ? 'reported_order_unknown' : 'planned_order', reportedActivityRefs: replacementRefs };
    const confirmedRoute = confirmedRoutes.get(dateId); const orderedEntries = routeEntries.filter((e) => e.dateId === dateId);
    if (confirmedRoute) { primary.activityRefs = orderedEntries.filter((e) => e.status !== 'skipped').map((e) => e.ref); primary.basis = 'confirmed_day_route'; primary.activityRefsOrder = 'explicit_route_order'; }
    const routeNeedsReview = Boolean(confirmedRoute && dayReports.some((a) => Date.parse(a.source.observedAt) > Date.parse(confirmedRoute.source.observedAt)));
    if (routeNeedsReview) gaps.push({ code: 'day_route_new_reports', ref: 'day:' + dateId, detail: 'New actual reports arrived after the confirmed route; keep the visible route and reconcile its affected entries now.' });
    const route = { needsReview: routeNeedsReview, pendingActualReportRefs: confirmedRoute ? dayReports.filter((a) => Date.parse(a.source.observedAt) > Date.parse(confirmedRoute.source.observedAt)).map((a) => a.ref) : [], basis: confirmedRoute ? 'confirmed_day_route' : primary.basis, routeId: confirmedRoute?.id || null, orderStatus: confirmedRoute ? 'explicit' : primary.activityRefsOrder, source: confirmedRoute?.source || null, entryRefs: confirmedRoute ? orderedEntries.filter((e) => e.status !== 'skipped').map((e) => e.ref) : primary.activityRefs, skippedEntryRefs: orderedEntries.filter((e) => e.status === 'skipped').map((e) => e.ref), planningEstimatesAreActuals: false };
    if (unlinked.length && !confirmedRoute) gaps.push({ code: 'unlinked_actual_change', ref: 'day:' + dateId, detail: 'Show the actual change report first. Older planned rows are provisional history until explicit activity links are supplied; do not infer a replacement or time from prose.' });
    return { dateId, primary, route, priorPlannedActivityRefs: confirmedRoute ? plannedPrimary?.activityRefs || [] : priorRefs, unlinkedChangeReportRefs: unlinked.map((a) => a.ref), actualChangeRefs: applicable.map((r) => r.ref), alternativeRefs: active.map((o) => o.ref), backupActivityRefs: [...new Set(active.flatMap((o) => {
      if (o.role === 'stale_binding') return [];
      const planIds = [o.association.planId, ...(o.requirements?.plans.filter((p) => p.dateId === dateId).map((p) => p.planId) || [])].filter(Boolean);
      return activities.filter((a) => a.current && planIds.includes(a.planId) && a.planId !== primary?.planId).map((a) => a.ref);
    }))], bookingRefs: bookings.filter((b) => b.association.dateIds.includes(dateId)).map((b) => b.ref),
      commitmentRefs: commitments.filter((r) => r.dateId === dateId).map((r) => r.ref), lodgingRefs: lodgings.filter((l) => l.dateIds.includes(dateId)).map((l) => l.ref),
      weatherRefs: weather.filter((w) => w.dateId === dateId).map((w) => w.ref), evidenceRefs: evidence.filter((e) => e.scope.dateId === dateId).map((e) => e.ref),
      factRefs: facts.filter((f) => f.association.dateIds.includes(dateId)).map((f) => f.ref), preferenceRefs: preferences.filter((p) => p.association.dateIds.includes(dateId)).map((p) => p.ref),
      exclusionRefs: exclusions.filter((e) => e.dateIds.includes(dateId)).map((e) => e.ref), pendingQuestionRefs: pending.filter((p) => p.dateIds.includes(dateId)).map((p) => p.ref) };
  });
  return { organizationSchemaVersion: 1, tripId, days, catalog: { plans, activities, routeEntries, actualReports, actualChanges, reportedActivities, options, bookings, commitments, lodgings, facts, preferences, exclusions, evidence, weather, pending, issues },
    unplaced: { planRefs: plans.filter((p) => !assignedPlanIds.has(p.id)).map((p) => p.ref), backupPlanRefs: plans.filter((p) => p.priority === 'backup' && !assignedPlanIds.has(p.id)).map((p) => p.ref), factRefs: facts.filter((f) => !f.association.dateIds.some((d) => dates.includes(d))).map((f) => f.ref), preferenceRefs: preferences.filter((p) => !p.association.dateIds.length).map((p) => p.ref), optionRefs: options.filter((o) => !o.association.dateIds.length).map((o) => o.ref), pendingQuestionRefs: pending.filter((p) => !p.dateIds.length).map((p) => p.ref) },
    inactiveAlternativeRefs: options.filter((o) => o.eligibility.status === 'inactive').map((o) => o.ref), gaps,
    deduplication: { identity: 'current-state stable IDs plus explicit experience supersedesFactId; never fuzzy text', supersededFactIds: [...superseded], crossCategoryMerge: false, note: 'Bookings and prose facts with no explicit shared identity remain separate records, not assumed duplicate reservations.' },
    renderingContract: 'Render catalog records once and use day/activity references. Always show known alternatives and unplaced records with gaps; do not infer a current branch, ticket count, hotel identity, date or permanent preference from prose.' };
}


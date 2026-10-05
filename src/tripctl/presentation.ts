import { hash, parseState } from './engine';
import { TripError } from './schema';
import { exportReadonlyView } from './readonlyView';
import { presentationInputSchema, presentationOutputSchema, presentationOutputV2Schema, type Presentation, type PresentationV2 } from './presentationSchema';
import { exportTripDisplay } from './arrangements';
import { reservationBindingSchema } from './arrangementSchema';
const ref = (kind: string, ...parts: string[]) => kind + ':' + parts.map(encodeURIComponent).join(':');
const text = (x: unknown) => typeof x === 'string' ? x : '';
const object = (x: unknown): Record<string, unknown> => x && typeof x === 'object' ? x as Record<string, unknown> : {};
/** One typed read-only interface. Historical views are reconstructed from the same audit prefix. */
export async function exportPresentationView(input: unknown, request: unknown): Promise<Presentation | PresentationV2> {
  const parsed = presentationInputSchema.safeParse(request); if (!parsed.success) throw new TripError('invalid_presentation_request', 'Use explicit view basis, asOf/generatedAt and an optional complete Library source');
  const q = parsed.data; const authority = parseState(input); const revision = q.view.basis === 'as_recorded' ? q.view.revision : authority.revision;
  if (revision > authority.revision) throw new TripError('unknown_revision', 'Historical revision is outside the authoritative audit');
  const state = revision === authority.revision ? authority : parseState({ ...authority, revision, content: revision === 0 ? authority.history[0]?.before || authority.content : authority.history[revision - 1].after, history: authority.history.slice(0, revision) });
  const captureTimes: string[] = state.history.map((e) => e.at);
  const collectCaptures = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(collectCaptures); return; }
    for (const [key, item] of Object.entries(value)) {
      if (key === 'observedAt' && typeof item === 'string' && Number.isFinite(Date.parse(item))) captureTimes.push(item);
      else collectCaptures(item);
    }
  };
  [state.content.memory, state.content.itinerary, state.content.linkage, state.content.displayMetadata, state.content.snapshot.trip.lodgings].forEach(collectCaptures);
  const knownAt = captureTimes.reduce<string | null>((last, at) => !last || Date.parse(at) > Date.parse(last) ? at : last, null);
  if (knownAt && Date.parse(knownAt) > Date.parse(q.asOf)) throw new TripError('future_projection_revision', 'Select a revision already recorded by asOf; do not mix later corrections into an earlier view');
  const view = await exportReadonlyView(state, { asOf: q.asOf, generatedAt: q.generatedAt, ...(q.source ? { source: q.source } : {}) });
  const organized = view.organized; const c = state.content; const projectedHash = hash(state);
  const catalog: Presentation['presentationCatalog']['items'] = [];
  for (const [category, entries] of Object.entries(organized.catalog)) for (const row of entries) {
    const r = row as unknown as Record<string, unknown>; const association = object(r.association); const scope = object(r.scope);
    const dates = Array.isArray(r.dateIds) ? r.dateIds : Array.isArray(association.dateIds) ? association.dateIds : [r.dateId || scope.dateId].filter(Boolean);
    catalog.push({ ref: text(r.ref), category: (category === 'routeActivities' ? 'activities' : category) as Presentation['presentationCatalog']['items'][number]['category'], id: text(r.id || r.activityId) || null,
      title: text(r.title || r.name || r.text || r.summary || r.proposal || r.id), summary: text(r.note || r.text || r.summary || r.proposal || r.description), dateIds: dates.filter((d): d is string => typeof d === 'string' && view.trip.dates.includes(d)),
      status: text(r.status || r.role || r.disposition || object(r.eligibility).status) || null, source: r.source ? r.source as Presentation['presentationCatalog']['items'][number]['source'] : null,
      dateRestrictions: category === 'plans' ? { closedDates: (r.closedDates || []) as string[], availableDates: (r.availableDates || []) as string[] } : null,
      evidence: category === 'evidence' ? { basis: text(r.basis), scopeDate: text(scope.dateId), scopeComponent: scope.component as 'whole_plan' | 'part', claimKind: text(object(r.claim).kind) || null, claimValue: text(object(r.claim).state || object(r.claim).risk) || null, assessmentStatus: text(r.status), reasonCodes: r.reasonCodes as string[], publishedAt: text(r.publishedAt) || null, observedAt: text(r.observedAt), expiresAt: text(r.expiresAt) } : null });
  }
  const routeEntries = new Map(organized.catalog.routeEntries.map((r) => [r.ref, r]));
  const planned = new Map(organized.catalog.activities.map((r) => [r.ref, r])); const reported = new Map(organized.catalog.reportedActivities.map((r) => [r.ref, r]));
  const entry = (key: string, position: number | null): Presentation['historicalDailyRouteProjections'][number]['entries'][number] => {
    const r = routeEntries.get(key); const a = planned.get(key); const actual = reported.get(key);
    if (!r && !a && !actual) throw new TripError('invalid_presentation_reference', 'Effective route references an unknown activity');
    const typed = r?.activitySnapshot || a?.typed || actual;
    const activityRef = r ? r.activity.kind === 'planned' ? ref('activity', r.activity.planId, r.activity.activityId) : r.activity.kind === 'context' ? ref('context-activity', r.activity.contextId, r.activity.activityId) : ref('reported-activity', r.activity.activityId) : key;
    return { ref: key, position, activityRef, title: r?.title ?? a?.title ?? actual?.title ?? '', kind: r ? r.type as 'route_scenery' : typed?.kind || 'unknown', status: r?.status || (actual ? 'reported' : 'planned'), completionVerified: false,
      timing: r?.timing || typed?.timing || {}, timingBasis: r ? r.timingBasis as 'planned_activity' : actual ? 'reported_activity' : 'planned_activity',
      planningEstimate: r?.planningEstimate || null, estimateStatus: r?.estimateStatus || 'missing', planningEstimatesAreActuals: false, route: typed?.route || null,
      nightDate: r?.nightDate || null, lodgingId: r?.lodgingId || null, source: r?.source || typed?.source || null };
  };
  const nights: Presentation['nightDatedLodgingArrangements'] = [];
  for (const l of c.snapshot.trip.lodgings) {
    const reservations = l.reservations || []; const hasReservations = reservations.length > 0;
    for (const dateId of view.trip.dates) {
      const matches = reservations.filter((r) => dateId >= r.checkIn && dateId < r.checkOut);
      const routeEntry = organized.catalog.routeEntries.find((r) => r.dateId === dateId && r.lodgingId === l.id && r.status !== 'skipped');
      if (hasReservations) for (const r of matches) nights.push({ ref: ref('lodging-night', l.id, r.id, dateId), dateId, nightDate: dateId, timeZone: view.trip.timeZone,
        lodgingRef: ref('lodging', l.id), lodgingId: l.id, reservationId: r.id, routeEntryRef: routeEntry?.ref || null, title: l.name, status: r.status === 'booked' ? 'reservation_reported' : r.status === 'cancelled' ? 'cancelled' : 'planned', active: r.status !== 'cancelled', nightBasis: 'reservation', liveStatusVerified: false, sourceRevision: revision, sourceStateHash: projectedHash });
      if (!hasReservations) {
        const explicit = Boolean(l.checkIn && l.checkOut); const covered = explicit ? dateId >= l.checkIn! && dateId < l.checkOut! : c.snapshot.trip.schedule[dateId]?.lodgingId === l.id;
        if (covered) nights.push({ ref: ref('lodging-night', l.id, dateId), dateId, nightDate: dateId, timeZone: view.trip.timeZone, lodgingRef: ref('lodging', l.id), lodgingId: l.id, reservationId: null, routeEntryRef: routeEntry?.ref || null, title: l.name,
          status: explicit ? 'planned' : 'unknown', active: true, nightBasis: explicit ? 'explicit_stay_nights' : 'schedule_only_night_unverified', liveStatusVerified: false, sourceRevision: revision, sourceStateHash: projectedHash });
      }
    }
  }
  for (const r of organized.catalog.routeEntries.filter((r) => r.type === 'lodging' && r.status !== 'skipped')) {
    if (nights.some((n) => n.nightDate === r.dateId && (n.routeEntryRef === r.ref || r.lodgingId && n.lodgingId === r.lodgingId))) continue;
    nights.push({ ref: ref('lodging-night', r.routeId, r.id), dateId: r.dateId, nightDate: r.nightDate!, timeZone: view.trip.timeZone, lodgingRef: r.lodgingId ? ref('lodging', r.lodgingId) : null, lodgingId: r.lodgingId || null, reservationId: null, routeEntryRef: r.ref, title: r.title, status: 'unknown', active: true, nightBasis: 'explicit_route_night', liveStatusVerified: false, sourceRevision: revision, sourceStateHash: projectedHash });
  }
  const questions = organized.catalog.pending.map((p) => ({ ref: p.ref, code: p.code, text: p.text, dateIds: p.dateIds }));
  for (const gap of organized.gaps.filter((g) => ['unlinked_actual_change', 'day_route_new_reports', 'lodging_night_assignment_conflict'].includes(g.code))) {
    const dateIds = organized.days.filter((d) => gap.ref === 'day:' + d.dateId || d.lodgingRefs.includes(gap.ref)).map((d) => d.dateId);
    const key = ref('question', gap.code, gap.ref); questions.push({ ref: key, code: gap.code, text: gap.detail, dateIds });
    catalog.push({ ref: key, category: 'pending', id: null, title: gap.detail, summary: gap.detail, dateIds, status: 'unresolved', source: null, dateRestrictions: null, evidence: null });
  }
  for (const n of nights.filter((n) => n.status === 'cancelled' && n.routeEntryRef)) {
    const key = ref('question', 'cancelled-route-lodging', n.ref); const message = 'The visible route names a hotel whose recorded reservation for this night is cancelled; confirm the intended hotel or replacement reservation without changing the provider order.';
    questions.push({ ref: key, code: 'cancelled_route_lodging', text: message, dateIds: [n.nightDate] });
    catalog.push({ ref: key, category: 'pending', id: null, title: message, summary: message, dateIds: [n.nightDate], status: 'unresolved', source: null, dateRestrictions: null, evidence: null });
  }
  const output: Presentation = { presentationContractVersion: 1, readOnly: true, derived: true, saved: false, audience: 'private_owner',
    source: { journeyId: c.snapshot.trip.id, authorityRevision: authority.revision, authorityStateHash: hash(authority), projectedRevision: revision, projectedStateHash: projectedHash, hashScope: 'canonical-format-1-state', library: q.source || null, metadataIsCallerSupplied: true },
    freshness: { asOf: q.asOf, generatedAt: q.generatedAt, knownAt, automaticRefresh: false, providerSyncAt: null, knowledgeBasis: 'selected_revision', asOfUsage: 'evidence_freshness_after_known_sources' }, trip: { name: view.trip.name, dateIds: view.trip.dates, timeZone: view.trip.timeZone },
    presentationCatalog: { version: 1, items: catalog, unplacedRefs: [...new Set(Object.values(organized.unplaced).flat())], inactiveAlternativeRefs: organized.inactiveAlternativeRefs },
    historicalDailyRouteProjections: organized.days.map((d) => ({ dateId: d.dateId, viewBasis: q.view.basis, sourceRevision: revision, sourceStateHash: projectedHash,
      routeId: d.route.routeId, basis: d.route.basis, orderStatus: d.route.orderStatus as 'explicit', entries: d.route.entryRefs.map((r, i) => entry(r, d.route.orderStatus === 'reported_order_unknown' ? null : i)), skippedEntries: d.route.skippedEntryRefs.map((r) => entry(r, routeEntries.get(r)!.position)),
      priorPlannedRefs: d.priorPlannedActivityRefs, actualReportRefs: d.primary.actualReportRefs, pendingActualReportRefs: d.route.pendingActualReportRefs, needsReview: d.route.needsReview || d.unlinkedChangeReportRefs.length > 0,
      backupRefs: [...new Set([...d.alternativeRefs, ...d.backupActivityRefs])], bookingRefs: d.bookingRefs, evidenceRefs: d.evidenceRefs, questionRefs: questions.filter((q) => q.dateIds.includes(d.dateId)).map((q) => q.ref), nightArrangementRefs: nights.filter((n) => n.nightDate === d.dateId).map((n) => n.ref) })),
    nightDatedLodgingArrangements: nights, pendingQuestions: questions, gaps: organized.gaps,
    limitations: ['Read-only projection; no automatic external lookup, reminder dispatch or Site refresh', 'Catalog is a typed display summary; readonly-view organized.catalog retains complete domain details using the same refs', 'Historical source Library version belongs to the authority file; projected revision/hash identifies the selected audit prefix', 'Actual/reported entries do not prove completion; planning estimates are not actual clocks'],
  };
  const result = presentationOutputSchema.safeParse(output); if (!result.success) throw new TripError('invalid_presentation', 'Derived presentation violated its schema or reference/revision contract: ' + result.error.issues.map((i) => i.message).join('; '));
  if (q.contractVersion !== 2) return result.data;
  const coverage: PresentationV2['reservationCommitmentCoverage'] = (c.itinerary?.commitments || []).filter((r) => r.kind === 'reservation').map((row) => {
    const matches: PresentationV2['reservationCommitmentCoverage'][number]['matches'] = [];
    for (const hotel of c.snapshot.trip.lodgings) for (const reservation of hotel.reservations || []) {
      const b = reservationBindingSchema.safeParse(reservation.tripctlArrangement);
      if (b.success && b.data.commitmentIds.includes(row.id)) matches.push({ lodgingId: hotel.id, reservationId: reservation.id, nightRefs: nights.filter((n) => n.lodgingId === hotel.id && n.reservationId === reservation.id).map((n) => n.ref), source: b.data.source, bindingSource: b.data.bindingSource, paymentStatus: 'unknown', checkInStatus: 'unknown' });
    }
    return { commitmentId: row.id, commitmentRef: ref('commitment', row.id), dateId: row.dateId, originalText: row.text, status: matches.length === 1 ? 'explicitly_mapped' : matches.length ? 'conflict' : 'unmapped', matches };
  });
  const v2 = { ...result.data, presentationContractVersion: 2 as const, tripDisplayMetadata: exportTripDisplay(state), routeActivityContexts: c.linkage?.routeActivities || [], reservationCommitmentCoverage: coverage, adapterReplacement: { automatic: false as const, requiresHostEquivalenceCheck: true as const, preserveUnknownFields: true as const, catalogScope: 'single_journey_entities' as const, displayMetadataScope: 'one_entry_for_host_trip_index' as const } };
  for (const row of coverage.filter((r) => r.status !== 'explicitly_mapped')) {
    const key = ref('question', 'reservation-commitment-unmapped', row.commitmentId); const message = 'This reservation commitment has no explicit canonical hotel/reservation mapping. Preserve its original text; confirm its kind and identity before mapping it to nights.';
    v2.pendingQuestions.push({ ref: key, code: 'reservation_commitment_unmapped', text: message, dateIds: [row.dateId] });
    v2.presentationCatalog.items.push({ ref: key, category: 'pending', id: null, title: message, summary: message, dateIds: [row.dateId], status: 'unresolved', source: null, dateRestrictions: null, evidence: null });
    v2.historicalDailyRouteProjections.find((d) => d.dateId === row.dateId)?.questionRefs.push(key);
  }
  return presentationOutputV2Schema.parse(v2);
}

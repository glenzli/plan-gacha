import { canonical, hash } from './identity';
import { appendObservation } from './observations';
import { analyseItinerary } from './itinerary';
import { assessWalkingFact } from './routeEvidence';
import { preparePlanningContext } from '../domain/planningTools';
import { TripError, type TripState, type TripContent } from './schema';
import { reconcileReminders } from './reminderReconcile';
import type * as z from 'zod/v4';
import type { dayRouteSchema } from './linkageSchema';
import type { LinkageOperation } from './linkageSchema';
const fail = (code: string, message: string): never => { throw new TripError(code, message); };
const nightMatches = (stay: TripContent['snapshot']['trip']['lodgings'][number], date: string) => { const rows = stay.reservations?.filter((r) => r.status !== 'cancelled') || []; return rows.length ? rows.some((r) => date >= r.checkIn && date < r.checkOut) : stay.checkIn && stay.checkOut ? date >= stay.checkIn && date < stay.checkOut : true; };
const human = (source: { kind: string }) => { if (source.kind === 'provider') fail('unconfirmed_reminder_intent', 'Provider reports cannot establish user reminder intent'); };
export function changeReminders(state: TripState, next: TripContent, op: LinkageOperation, validatingHistory = false) {
  const l = next.linkage!;

  if (op.type === 'set_day_route') {
    const r = op.record; human(r.source); l.dayRoutes ||= [];
    if (!preparePlanningContext(next.snapshot).tripDates.some((d) => d.id === r.dateId)) fail('unknown_date', 'Route date is outside this journey');
    if (l.dayRoutes.some((d) => d.id === r.id)) fail('duplicate_id', 'Day route revision ID already exists');
    if (l.dayRoutes.some((d) => d.dateId === r.dateId && Date.parse(d.source.observedAt) >= Date.parse(r.source.observedAt))) fail('stale_day_route', 'A day route correction needs a newer explicit source');
    const entries = r.entries.map((e) => {
      const a = e.activity; let activity;
      if (a.kind === 'planned') {
        activity = next.itinerary?.current.find((d) => d.dateId === r.dateId && d.planId === a.planId)?.activities.find((x) => x.id === a.activityId);
        if (!activity) activity = [next, ...state.history.flatMap((h) => [h.before, h.after])].flatMap((c) => [...(c.itinerary?.baseline.days || []), ...(c.itinerary?.current || [])]).find((d) => d.dateId === r.dateId && d.planId === a.planId && d.activities.some((x) => x.id === a.activityId))?.activities.find((x) => x.id === a.activityId);
      } else {
        const change = l.actualChanges?.filter((x) => x.actualId === a.actualId && x.dateId === r.dateId).at(-1);
        activity = change?.replacementActivities.find((x) => x.id === a.activityId);
      }
      if (!activity) fail('unknown_id', 'Each ordered route entry needs an existing typed planned or reported activity on this day');
      if (e.purpose === 'scenic_route' && activity!.kind !== 'transfer') fail('route_purpose_mismatch', 'Scenic route purpose requires a transfer activity');
      if (Date.parse(activity!.source.observedAt) > Date.parse(r.source.observedAt)) fail('future_route_source', 'A route cannot predate its referenced activity evidence');
      if (activity!.kind === 'lodging' ? e.nightDate !== r.dateId : e.nightDate !== undefined || e.lodgingId !== undefined) fail('route_night_mismatch', 'Lodging entries require nightDate equal to this route date; other activities have no lodging night');
      if (e.lodgingId) {
        const stay = next.snapshot.trip.lodgings.find((x) => x.id === e.lodgingId) || fail('unknown_id', 'Unknown lodging identity');
        const reservations = stay.reservations?.filter((x) => x.status !== 'cancelled') || [];
        if (reservations.length ? !reservations.some((x) => r.dateId >= x.checkIn && r.dateId < x.checkOut) : stay.checkIn && stay.checkOut && !(r.dateId >= stay.checkIn && r.dateId < stay.checkOut)) fail('route_night_mismatch', 'Explicit lodging stay dates do not include this route night');
      }
      if (e.planningEstimate && Date.parse(e.planningEstimate.asOf) > Date.parse(r.source.observedAt)) fail('future_route_estimate', 'A route cannot cite an estimate formed after its confirmation');
      for (const ref of e.planningEstimate?.evidenceRefs || []) {
        const list = ref.kind === 'map_fact' ? next.memory.mapFacts : ref.kind === 'itinerary_evidence' ? next.itinerary?.evidence || [] : l.observations;
        if (!list.some((x) => x.id === ref.id)) fail('unknown_id', 'Planning estimate references missing saved transport/weather evidence');
      }
      return { ...e, activitySnapshot: structuredClone(activity!), ...(e.lodgingId ? { lodgingSnapshot: structuredClone(next.snapshot.trip.lodgings.find((l) => l.id === e.lodgingId)!) } : {}) };
    });
    l.dayRoutes.push({ ...r, entries }); return { kind: 'day_route', dateId: r.dateId, routeId: r.id, order: 'explicit', scheduleChanged: false, providerActions: false };
  }

  if (op.type === 'link_actual_change') {
    const r = op.record; human(r.source);
    const actual = next.itinerary?.actual.find((a) => a.id === r.actualId);
    if (!actual || actual.dateId !== r.dateId || !['changed_plan', 'skipped'].includes(actual.kind)) fail('actual_change_mismatch', 'Bind an existing changed_plan or skipped report on its exact day');
    if (actual!.activityId && !r.previousActivityIds.includes(actual!.activityId) || Date.parse(r.source.observedAt) < Date.parse(actual!.source.observedAt)) fail('actual_change_mismatch', 'Binding must respect the reported activity and observation time');
    const all = [next, ...state.history.flatMap((h) => [h.before, h.after])];
    const days = all.flatMap((c) => [...(c.itinerary?.baseline.days || []), ...(c.itinerary?.current || [])]);
    if (r.previousActivityIds.some((id) => !days.some((d) => d.dateId === r.dateId && d.activities.some((a) => a.id === id)))) fail('unknown_id', 'Each replaced activity must belong to this day in current or historical planning');
    if (new Set(r.replacementActivities.map((a) => a.id)).size !== r.replacementActivities.length || r.replacementActivities.some((a) => next.itinerary?.registeredActivityIds.includes(a.id))) fail('duplicate_id', 'Replacement report activities need new stable IDs distinct from planned activities');
    l.actualChanges ||= [];
    if (l.actualChanges.some((a) => a.id === r.id)) fail('duplicate_id', 'Actual change link already exists');
    if (l.actualChanges.some((a) => a.actualId === r.actualId && Date.parse(a.source.observedAt) >= Date.parse(r.source.observedAt))) fail('stale_actual_change', 'A correction needs a newer explicit source');
    if (l.actualChanges.some((a) => a.actualId !== r.actualId && a.replacementActivities.some((old) => r.replacementActivities.some((n) => n.id === old.id)))) fail('duplicate_id', 'Replacement activity identity belongs to another report');
    if (r.replacementActivities.some((a) => a.source.kind === 'provider' || Date.parse(a.source.observedAt) > Date.parse(r.source.observedAt))) fail('unconfirmed_actual_change', 'Replacement activities require explicit user provenance known at binding time');
    l.actualChanges.push(r); return { kind: 'actual_change_link', reportId: r.actualId, scheduleChanged: false, orderChanged: false };
  }
  if (op.type === 'bind_context') {
    const r = op.record; human(r.source);
    const subjects = r.subjectType === 'fact' ? next.memory.facts : r.subjectType === 'preference' ? next.memory.preferences : r.subjectType === 'issue' ? next.memory.issues : next.itinerary?.options || [];
    if (!subjects.some((s) => s.id === r.subjectId)) fail('unknown_id', 'Context binding needs an existing structured subject');
    if (r.subjectType === 'option' && !validatingHistory) {
      const option = next.itinerary!.options.find((o) => o.id === r.subjectId)!;
      if (r.dateIds.some((d) => !option.dateIds.includes(d)) || r.planId && option.requirements?.plans.some((p) => r.dateIds.includes(p.dateId) && p.planId !== r.planId)) fail('context_binding_conflict', 'Option display binding can only narrow declared candidate dates and must respect their existing plan requirements');
    }
    const context = preparePlanningContext(next.snapshot);
    if (r.dateIds.some((d) => !context.tripDates.some((x) => x.id === d))) fail('unknown_date', 'Binding dates must be in this journey');
    if (r.planId && !context.plans.some((p) => p.id === r.planId)) fail('unknown_id', 'Binding plan is unknown');
    if (r.reportedActualId && !l.actualChanges?.some((a) => a.actualId === r.reportedActualId && (!r.dateIds.length || r.dateIds.includes(a.dateId)) && a.replacementActivities.some((x) => x.id === r.activityId))) fail('unknown_id', 'Reported activity binding requires its exact actual report and day');
    if (r.activityId && !r.reportedActualId && ![next, ...state.history.flatMap((h) => [h.before, h.after])].some((c) => [...(c.itinerary?.current || []), ...(c.itinerary?.baseline.days || [])].some((d) => d.planId === r.planId && d.activities.some((a) => a.id === r.activityId)) || c.snapshot.trip.plans.some((p) => p.id === r.planId && [...(p.stops || []), ...(Array.isArray(p.itinerary) ? p.itinerary : [])].some((a) => a && typeof a === 'object' && a.id === r.activityId)))) fail('unknown_id', 'Activity must belong to the bound plan');
    l.contextBindings ||= [];
    if (l.contextBindings.some((b) => b.id === r.id)) fail('duplicate_id', 'Context binding ID already exists');
    if (l.contextBindings.some((b) => b.subjectType === r.subjectType && b.subjectId === r.subjectId && Date.parse(b.source.observedAt) >= Date.parse(r.source.observedAt))) fail('stale_context_binding', 'Corrections require newer explicit binding evidence');
    l.contextBindings.push(r); return { kind: 'context_binding', bindingId: r.id };
  }
  if (op.type === 'set_reminder_intent') {
    human(op.record.source); const record = op.record;
    if (!next.itinerary?.decisionPoints.some((p) => p.id === record.decisionPointId)) fail('unknown_id', 'Reminder must bind an existing decision point');
    const old = l.reminderIntents.find((i) => i.id === record.id);
    if (l.reminderIntents.some((i) => i.id !== record.id && i.decisionPointId === record.decisionPointId && i.purpose === record.purpose)) fail('duplicate_reminder_intent', 'Use the existing logical reminder identity for this matter');
    if ((old?.version || 0) !== op.expectedVersion) fail('reminder_version_conflict', 'Read current reminder version before changing it');
    if (old) {
      if (old.decisionPointId !== record.decisionPointId || old.provider !== record.provider || old.accountRef !== record.accountRef) fail('reminder_binding_mismatch', 'Reminder target and provider/account are stable identities');
      if (Date.parse(record.source.observedAt) <= Date.parse(old.source.observedAt)) fail('stale_reminder_intent', 'Reminder content changes require newer explicit source evidence');
      Object.assign(old, record, { version: old.version + 1 }); // status/resume intent stays sticky.
    } else l.reminderIntents.push({ ...record, version: 1, status: 'active', statusSource: record.source });
    return { kind: 'reminder_intent', intentId: record.id };
  }
  if (op.type === 'set_reminder_status') {
    human(op.source); const intent = l.reminderIntents.find((i) => i.id === op.intentId) || fail('unknown_id', 'Unknown reminder intent');
    if (Date.parse(op.source.observedAt) <= Math.max(Date.parse(intent.statusSource.observedAt), Date.parse(intent.source.observedAt))) fail('stale_reminder_intent', 'Status/resume requires newer explicit user evidence');
    intent.status = op.status; intent.statusSource = op.source; intent.version++;
    if (op.status === 'active') intent.explicitResumeAt = op.source.observedAt;
    return { kind: 'reminder_status', intentId: intent.id, status: intent.status };
  }
  if (op.type === 'record_reminder_readback') {
    const r = op.record; const intent = l.reminderIntents.find((i) => i.id === r.intentId) || fail('unknown_id', 'Readback must bind an existing reminder');
    if (r.journeyId !== next.snapshot.trip.id) fail('reminder_journey_mismatch', 'Readback must name this exact journey');
    if (intent.provider !== r.provider || intent.accountRef !== r.accountRef) fail('reminder_binding_mismatch', 'Provider/account do not match the reminder');
    const old = l.reminderReadbacks.find((x) => x.id === r.id);
    if (old) { if (canonical(old) !== canonical(r)) fail('readback_identity_conflict', 'Readback ID has different content'); return { kind: 'reminder_readback', added: false }; }
    const bound = l.reminderReadbacks.find((x) => x.intentId === r.intentId && x.providerTaskId);
    if (r.correlation.kind === 'lookup' && r.providerTaskId || r.correlation.kind === 'bound_task' && (!bound || !r.providerTaskId)) fail('reminder_correlation_required', 'A lookup cannot adopt a task; bound_task requires an existing exact binding');
    if (r.correlation.kind === 'authorized_existing') { human(r.correlation.authorization); if (!r.providerTaskId) fail('reminder_correlation_required', 'Adoption must name an explicitly authorized task'); }
    if (r.correlation.kind === 'attempt') {
      const correlation = r.correlation; const attempt = l.reminderAttempts.find((a) => a.id === correlation.attemptId);
      if (!attempt || attempt.intentId !== r.intentId || attempt.actionKey !== correlation.actionKey || attempt.provider !== r.provider || attempt.accountRef !== r.accountRef || attempt.providerTaskId && attempt.providerTaskId !== r.providerTaskId || !r.providerTaskId || Date.parse(r.source.observedAt) < Date.parse(attempt.startedAt)) fail('reminder_correlation_required', 'Readback must correlate the exact attempt and provider task');
    }
    if (bound && r.providerTaskId !== bound.providerTaskId) fail('reminder_binding_mismatch', 'Never replace or drop a known provider task ID through a lookup');
    if (r.providerTaskId && l.reminderReadbacks.some((x) => x.intentId !== r.intentId && x.provider === r.provider && x.accountRef === r.accountRef && x.providerTaskId === r.providerTaskId)) fail('duplicate_provider_binding', 'Provider task is already bound to another reminder');
    l.reminderReadbacks.push(r); return { kind: 'reminder_readback', added: true };
  }
  if (op.type === 'begin_reminder_action') {
    if (l.reminderAttempts.some((a) => a.id === op.attemptId)) fail('attempt_exists', 'Existing attempts require readback, never another dispatch');
    const row = reconcileReminders(state, op.asOf).items.find((r) => r.intentId === op.intentId) || fail('unknown_id', 'Unknown reminder intent');
    const a = row.action || fail('stale_reminder_action', 'Reconcile current state and resolve pending outcomes first');
    if (a.actionKey !== op.actionKey) fail('stale_reminder_action', 'Reconcile current state and resolve pending outcomes first');
    l.reminderAttempts.push({ id: op.attemptId, intentId: op.intentId, actionKey: a.actionKey, action: a.kind, desiredHash: a.desiredHash, desired: a.configuration, provider: row.provider, accountRef: row.accountRef, providerTaskId: a.providerTaskId, startedAt: op.asOf, outcome: 'unknown' });
    return { kind: 'reminder_attempt', attemptId: op.attemptId, outcome: 'unknown', externalActionPerformed: false, requiresAuthoritativeSaveAndReadback: true };
  }
  if (op.type === 'resolve_reminder_attempt') {
    const a = l.reminderAttempts.find((a) => a.id === op.attemptId) || fail('unknown_id', 'Unknown attempt');
    if (a.outcome !== 'unknown') {
      if (a.outcome === op.outcome && a.readbackId === op.readbackId && canonical(a.resultSource) === canonical(op.source)) return { kind: 'reminder_result', added: false };
      fail('attempt_already_resolved', 'A resolved attempt cannot be downgraded or rewritten');
    }
    if (Date.parse(op.source.observedAt) < Date.parse(a.startedAt) || a.resultSource && Date.parse(op.source.observedAt) <= Date.parse(a.resultSource.observedAt)) fail('stale_reminder_result', 'A result must follow its attempt and any prior unresolved result');
    if (op.outcome === 'applied') {
      const r = l.reminderReadbacks.find((r) => r.id === op.readbackId) || fail('readback_required', 'Confirmed outcome needs an exact saved readback');
      if (r.correlation.kind !== 'attempt' || r.correlation.attemptId !== a.id || r.correlation.actionKey !== a.actionKey) fail('reminder_correlation_required', 'Confirmation needs the original attempt correlation, not a matching title or configuration');
      if (r.intentId !== a.intentId || r.provider !== a.provider || r.accountRef !== a.accountRef || a.providerTaskId && r.providerTaskId !== a.providerTaskId || Date.parse(r.source.observedAt) < Date.parse(a.startedAt) || Date.parse(r.source.observedAt) > Date.parse(op.source.observedAt)) fail('reminder_binding_mismatch', 'Readback does not confirm this exact attempt/provider binding');
      if (a.action === 'cancel' ? r.status !== 'absent' || !r.providerTaskId : r.status !== 'present' || !r.providerTaskId || canonical(r.configuration) !== canonical(a.desired)) fail('readback_mismatch', 'Observed configuration must match the attempted change, including its old desired version');
      a.providerTaskId = r.providerTaskId; a.readbackId = r.id;
    } else if (op.readbackId) fail('invalid_reminder_result', 'Only an applied outcome can cite its confirming readback');
    a.outcome = op.outcome; a.resultSource = op.source;
    return { kind: 'reminder_result', added: true, attemptId: a.id, outcome: a.outcome };
  }
  return fail('invalid_operation', 'Not a reminder operation');
}
/** Revalidates persisted references. Expired or changed-place observations remain valid historical data. */
export function validateLinkage(state: TripState) {
  const l = state.content.linkage; if (!l) return;
  const routeTimes = new Map<string, number>();
  for (const route of l.dayRoutes || []) {
    human(route.source);
    if (!preparePlanningContext(state.content.snapshot).tripDates.some((d) => d.id === route.dateId) || new Set(route.entries.map((e) => e.id)).size !== route.entries.length || new Set(route.entries.map((e) => e.activity.kind + ':' + e.activity.activityId)).size !== route.entries.length) fail('invalid_day_route', 'Invalid route date or duplicate entries');
    if ((routeTimes.get(route.dateId) ?? -Infinity) >= Date.parse(route.source.observedAt)) fail('invalid_day_route', 'Route revisions must be ordered per date'); routeTimes.set(route.dateId, Date.parse(route.source.observedAt));
    for (const e of route.entries) {
      if (e.purpose === 'scenic_route' && e.activitySnapshot.kind !== 'transfer') fail('invalid_day_route', 'Scenic route purpose requires a transfer');
      if (e.planningEstimate && Date.parse(e.planningEstimate.asOf) > Date.parse(route.source.observedAt)) fail('invalid_day_route', 'Route confirmation predates its planning estimate');
      if (e.activitySnapshot.id !== e.activity.activityId || Date.parse(e.activitySnapshot.source.observedAt) > Date.parse(route.source.observedAt) || (e.activitySnapshot.kind === 'lodging' ? e.nightDate !== route.dateId : e.nightDate !== undefined || e.lodgingId !== undefined)) fail('invalid_day_route', 'Route snapshot or night binding mismatch');
      const ref = e.activity;
      const known = ref.kind === 'reported' ? l.actualChanges?.some((r) => r.actualId === ref.actualId && r.dateId === route.dateId && r.replacementActivities.some((a) => canonical(a) === canonical(e.activitySnapshot))) : [state.content, ...state.history.flatMap((h) => [h.before, h.after])].some((c) => [...(c.itinerary?.baseline.days || []), ...(c.itinerary?.current || [])].some((d) => d.dateId === route.dateId && d.planId === ref.planId && d.activities.some((a) => canonical(a) === canonical(e.activitySnapshot))));
      for (const ref of e.planningEstimate?.evidenceRefs || []) { const list = ref.kind === 'map_fact' ? state.content.memory.mapFacts : ref.kind === 'itinerary_evidence' ? state.content.itinerary?.evidence || [] : l.observations; if (!list.some((x) => x.id === ref.id)) fail('invalid_day_route', 'Estimate references missing evidence'); }
      if (e.lodgingId && (!e.lodgingSnapshot || e.lodgingSnapshot.id !== e.lodgingId || !nightMatches(e.lodgingSnapshot, route.dateId) || ![state.content, ...state.history.flatMap((h) => [h.before, h.after])].some((c) => c.snapshot.trip.lodgings.some((l) => canonical(l) === canonical(e.lodgingSnapshot)))) || !e.lodgingId && e.lodgingSnapshot) fail('invalid_day_route', 'Route lodging identity and night must match the saved source snapshot');
      if (!known) fail('invalid_day_route', 'Route references an unknown or altered source activity');
    }
  }
  const targets = new Set<string>();
  for (const intent of l.reminderIntents) {
    human(intent.source); human(intent.statusSource);
    if (!state.content.itinerary?.decisionPoints.some((p) => p.id === intent.decisionPointId)) fail('invalid_linkage', 'Reminder decision point is missing');
    const target = canonical([intent.decisionPointId, intent.purpose]);
    if (targets.has(target)) fail('invalid_linkage', 'Duplicate logical reminder matter'); targets.add(target);
  }
  const copy = structuredClone(state.content); copy.linkage!.observations = []; copy.linkage!.reminderReadbacks = []; copy.linkage!.contextBindings = []; copy.linkage!.actualChanges = [];
  for (const r of l.actualChanges || []) changeReminders(state, copy, { type: 'link_actual_change', record: r });
  for (const r of l.contextBindings || []) changeReminders(state, copy, { type: 'bind_context', record: r }, true);
  for (const r of l.observations) if (!appendObservation(copy, r).added) fail('invalid_linkage', 'Duplicate persisted source message');
  for (const r of l.reminderReadbacks) changeReminders(state, copy, { type: 'record_reminder_readback', record: r });
  const keys = new Set<string>(); const unknown = new Set<string>();
  for (const a of l.reminderAttempts) {
    const intent = l.reminderIntents.find((i) => i.id === a.intentId);
    if (!intent || a.provider !== intent.provider || a.accountRef !== intent.accountRef) fail('invalid_linkage', 'Attempt provider binding mismatch');
    if (keys.has(a.actionKey) || unknown.has(a.intentId)) fail('invalid_linkage', 'Duplicate action or another attempt after an unknown outcome'); keys.add(a.actionKey);
    if (a.desiredHash !== hash(a.desired) || (a.action === 'cancel') !== (a.desired === null) || a.action === 'pause' && a.desired?.enabled !== false) fail('invalid_linkage', 'Attempt configuration/hash mismatch');
    if (a.resultSource && Date.parse(a.resultSource.observedAt) < Date.parse(a.startedAt)) fail('invalid_linkage', 'Result predates attempt');
    if (a.outcome === 'unknown') unknown.add(a.intentId);
    if (a.outcome !== 'unknown' && !a.resultSource || a.outcome !== 'applied' && a.readbackId) fail('invalid_linkage', 'Invalid attempt result fields');
    if (a.providerTaskId && l.reminderReadbacks.some((r) => r.intentId === a.intentId && r.providerTaskId && r.providerTaskId !== a.providerTaskId)) fail('invalid_linkage', 'Attempt task identity conflicts with saved binding');
    if (a.outcome === 'applied') {
      const r = l.reminderReadbacks.find((r) => r.id === a.readbackId);
      if (!r || r.correlation.kind !== 'attempt' || r.correlation.attemptId !== a.id || r.correlation.actionKey !== a.actionKey || r.intentId !== a.intentId || r.providerTaskId !== a.providerTaskId || !r.providerTaskId || Date.parse(r.source.observedAt) < Date.parse(a.startedAt) || Date.parse(r.source.observedAt) > Date.parse(a.resultSource!.observedAt)) fail('invalid_linkage', 'Applied attempt lacks its exact confirming readback');
      if (a.action === 'cancel' ? r!.status !== 'absent' : r!.status !== 'present' || canonical(r!.configuration) !== canonical(a.desired)) fail('invalid_linkage', 'Applied attempt readback does not match configuration');
    }
  }
}
/** Estimates remain planning data. Provider credit requires the latest exact transport observation. */
export function assessRouteEstimate(content: TripContent, entry: z.infer<typeof dayRouteSchema>['entries'][number], dateId: string, asOf: string) {
  const e = entry.planningEstimate; const reasons: string[] = [];
  const result = (status: string) => ({ estimateStatus: status, estimateReasonCodes: reasons, estimateIsActual: false, stopMinutesBasis: e?.stopMinutes ? 'explicit_planning_allowance' : null });
  if (!e) return result('missing');
  if (Date.parse(e.asOf) > Date.parse(asOf)) return result('future');
  if (e.expiresAt && Date.parse(e.expiresAt) <= Date.parse(asOf)) return result('stale');
  if (entry.purpose === 'scenic_route' && (!e.travelMinutes || !e.stopMinutes)) { reasons.push('separate_travel_and_viewing_ranges_required'); return result('scenic_stop_range_needed'); }
  if (e.method !== 'provider') return result(e.method === 'planning_assumption' ? 'planning_assumption' : 'user_estimate');
  const activity = entry.activitySnapshot; const current = content.itinerary?.current.find((d) => d.dateId === dateId)?.activities.find((a) => a.id === activity.id);
  if (entry.activity.kind !== 'planned' || activity.kind !== 'transfer' || !current || canonical(current) !== canonical(activity)) reasons.push('transport_activity_binding_changed');
  const travel = e.travelMinutes || e.durationMinutes;
  for (const ref of e.evidenceRefs) {
    if (ref.kind === 'itinerary_evidence') {
      const i = content.itinerary; const observation = i?.evidence.find((x) => x.id === ref.id);
      const same = i?.evidence.filter((x) => x.kind === 'route' && x.activityId === activity.id && x.dateId === dateId) || [];
      const max = Math.max(...same.map((x) => Date.parse(x.source.observedAt))); const heads = same.filter((x) => Date.parse(x.source.observedAt) === max);
      const requirement = i ? analyseItinerary(i, { asOf }, content).requirements.find((r) => r.kind === 'route' && r.activityId === activity.id && r.dateId === dateId) : undefined;
      if (!observation || Date.parse(observation.source.observedAt) > Date.parse(e.asOf) || observation.kind !== 'route' || heads.length !== 1 || requirement?.evidenceId !== observation.id || !requirement.canUseForComparison || canonical(observation.durationMinutes) !== canonical(travel)) reasons.push('unusable_transport_observation');
    } else if (ref.kind === 'map_fact') {
      const fact = content.memory.mapFacts.find((f) => f.id === ref.id); const a = entry.activity;
      const binding = fact?.binding;
      const same = content.memory.mapFacts.filter((f) => binding && f.binding?.tripId === binding.tripId && f.binding.dateId === binding.dateId && f.binding.planId === binding.planId && f.binding.fromStopId === binding.fromStopId && f.binding.toStopId === binding.toStopId);
      const max = Math.max(...same.map((f) => Date.parse(f.observedAt))); const heads = same.filter((f) => Date.parse(f.observedAt) === max);
      if (!fact || Date.parse(fact.observedAt) > Date.parse(e.asOf) || !binding || a.kind !== 'planned' || binding.dateId !== dateId || binding.planId !== a.planId || activity.route?.mode !== 'walking' || activity.route.fromActivityId !== binding.fromStopId || activity.route.toActivityId !== binding.toStopId || heads.length !== 1 || heads[0].id !== fact.id || !assessWalkingFact(content.snapshot, fact, asOf).canUseForComparison || travel.min !== fact.durationSeconds! / 60 || travel.max !== fact.durationSeconds! / 60) reasons.push('unusable_bound_map_observation');
    } else reasons.push('not_transport_duration_evidence');
  }
  return result(reasons.length ? 'unusable' : 'current_transport_estimate');
}

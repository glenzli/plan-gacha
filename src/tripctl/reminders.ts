import { canonical, hash } from './identity';
import { appendObservation } from './observations';
import { preparePlanningContext } from '../domain/planningTools';
import { TripError, type TripState, type TripContent } from './schema';
import { reconcileReminders } from './reminderReconcile';
import type { LinkageOperation } from './linkageSchema';
const fail = (code: string, message: string): never => { throw new TripError(code, message); };
const human = (source: { kind: string }) => { if (source.kind === 'provider') fail('unconfirmed_reminder_intent', 'Provider reports cannot establish user reminder intent'); };
export function changeReminders(state: TripState, next: TripContent, op: LinkageOperation, validatingHistory = false) {
  const l = next.linkage!;
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
    if (r.activityId && ![next, ...state.history.flatMap((h) => [h.before, h.after])].some((c) => [...(c.itinerary?.current || []), ...(c.itinerary?.baseline.days || [])].some((d) => d.planId === r.planId && d.activities.some((a) => a.id === r.activityId)) || c.snapshot.trip.plans.some((p) => p.id === r.planId && [...(p.stops || []), ...(Array.isArray(p.itinerary) ? p.itinerary : [])].some((a) => a && typeof a === 'object' && a.id === r.activityId)))) fail('unknown_id', 'Activity must belong to the bound plan');
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

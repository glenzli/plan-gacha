import { stateHash as journeyHash, stateHashContext } from './storage2';
import { canonical, hash } from './identity';
import { parseState } from './engine';
import { analyseItinerary } from './itinerary';
import { linkageQuerySchema } from './linkageSchema';
import { TripError } from './schema';
import type { TripState } from './schema';
import type { ReminderIntent, Linkage } from './linkageSchema';
export function desiredReminder(state: TripState, intent: ReminderIntent, asOf: string) {
  const point = state.content.itinerary?.decisionPoints.find((p) => p.id === intent.decisionPointId);
  const closed = state.content.snapshot.trip.archived || intent.status === 'withdrawn' || point?.lifecycle?.status === 'completed' || point?.lifecycle?.status === 'withdrawn';
  const decision = state.content.itinerary ? analyseItinerary(state.content.itinerary, { asOf }, state.content).decisions.find((p) => p.id === intent.decisionPointId) : undefined;
  const chosen = decision?.status === 'decision_recorded'; // Invalidated choices still require a decision.
  const dueAt = intent.dueAtOverride || point?.deadline || null;
  const done = closed || chosen || Boolean(dueAt && Date.parse(dueAt) <= Date.parse(asOf));
  const configuration = dueAt ? { title: intent.title, prompt: intent.prompt, dueAt, timeZone: intent.timeZone, enabled: !done && intent.status === 'active' } : null;
  return { point, configuration, done, reason: closed ? 'matter_closed' : chosen ? 'decision_recorded' : dueAt && Date.parse(dueAt) <= Date.parse(asOf) ? 'deadline_elapsed' : intent.status === 'paused' ? 'human_paused' : null };
}
export function latestReadback(linkage: Linkage, intentId: string) {
  const records = linkage.reminderReadbacks.filter((r) => r.intentId === intentId).sort((a, b) => Date.parse(b.source.observedAt) - Date.parse(a.source.observedAt) || (a.id < b.id ? -1 : 1));
  const head = records[0];
  const conflict = Boolean(head && records.some((r) => r.source.observedAt !== '' && Date.parse(r.source.observedAt) === Date.parse(head.source.observedAt) && canonical({ providerTaskId: r.providerTaskId, status: r.status, configuration: r.configuration }) !== canonical({ providerTaskId: head.providerTaskId, status: head.status, configuration: head.configuration })));
  return { head, conflict };
}
/** Produces descriptors only. Neither a descriptor nor a replayed receipt authorizes another dispatch. */
export function reconcileReminders(input: unknown, asOf: string) {
  if (!linkageQuerySchema.safeParse({ asOf }).success) throw new TripError('invalid_linkage_query', 'Supply explicit asOf');
  const state = parseState(input);
  const linkage = state.content.linkage; const stateHash = journeyHash(state);
  const items = (linkage?.reminderIntents || []).map((intent) => {
    const desired = desiredReminder(state, intent, asOf); const { head, conflict } = latestReadback(linkage!, intent.id);
    const attempts = linkage!.reminderAttempts.filter((a) => a.intentId === intent.id);
    const pending = attempts.find((a) => a.outcome === 'unknown');
    const base = { journeyId: state.content.snapshot.trip.id, intentId: intent.id, decisionPointId: intent.decisionPointId, intentVersion: intent.version, provider: intent.provider, accountRef: intent.accountRef, providerTaskId: head?.providerTaskId || attempts.find((a) => a.providerTaskId)?.providerTaskId || null, desired: desired.configuration, desiredReason: desired.reason };
    const wait = (code: string) => ({ ...base, status: 'pending', reasonCodes: [code], action: null, readbackRequired: true, uncertainAttempt: pending ? { attemptId: pending.id, actionKey: pending.actionKey, originalDesiredHash: pending.desiredHash } : null });
    if (pending) return wait('unknown_external_outcome_do_not_retry');
    if (!desired.point) return wait('decision_missing');
    if (conflict) return wait('provider_readback_conflict');
    if (!head || Date.parse(head.source.observedAt) > Date.parse(asOf) || Date.parse(head.expiresAt) <= Date.parse(asOf) || head.status === 'unknown') return wait('provider_readback_required');
    if (!desired.configuration && !desired.done && intent.status !== 'paused') return wait('reminder_time_unknown');
    const enabled = desired.configuration?.enabled === true;
    if (head.status === 'absent' && head.providerTaskId) return { ...base, status: desired.done || !enabled ? 'settled' : 'pending', reasonCodes: [desired.done || !enabled ? 'provider_task_absent' : 'removed_task_requires_explicit_new_round'], action: null, readbackRequired: enabled && !desired.done, uncertainAttempt: null };
    if (!enabled && head.status === 'absent') return { ...base, status: 'settled', reasonCodes: [desired.reason || 'not_enabled'], action: null, readbackRequired: false, uncertainAttempt: null };
    if (head.status === 'present' && !head.configuration!.enabled && enabled && (!intent.explicitResumeAt || Date.parse(intent.explicitResumeAt) <= Date.parse(head.source.observedAt))) return wait('provider_disabled_respect_pause');
    let action: 'create' | 'update' | 'pause' | 'cancel' | null = null;
    if (desired.done && head.status === 'present') action = 'cancel';
    else if (intent.status === 'paused' && head.status === 'present' && head.configuration!.enabled) action = 'pause';
    else if (intent.status === 'paused') return { ...base, status: 'settled', reasonCodes: ['human_paused'], action: null, readbackRequired: false, uncertainAttempt: null };
    else if (head.status === 'absent' && enabled) action = 'create';
    else if (canonical(head.configuration) !== canonical(desired.configuration)) action = 'update';
    if (!action) return { ...base, status: 'settled', reasonCodes: ['configuration_matches'], action: null, readbackRequired: false, uncertainAttempt: null };
    const configuration = action === 'cancel' ? null : action === 'pause' ? { ...head.configuration!, enabled: false } : desired.configuration;
    const desiredHash = hash(configuration);
    const actionKey = hash({ journeyId: state.content.snapshot.trip.id, intentId: intent.id, action, desiredHash, provider: intent.provider, accountRef: intent.accountRef, providerTaskId: head.providerTaskId, readbackId: head.id, attemptCount: attempts.length });
    return { ...base, status: 'proposed', reasonCodes: [], action: { kind: action, actionKey, desiredHash, configuration, providerTaskId: head.providerTaskId, basedOnReadbackId: head.id, stateHash, ...stateHashContext(state), revision: state.revision, requiresNewDurableAttempt: true, externalExecutionImplemented: false }, readbackRequired: false, uncertainAttempt: null };
  });
  return { schemaVersion: 1, saved: false, externalActionsPerformed: 0, asOf, revision: state.revision, stateHash, ...stateHashContext(state), items, limitations: ['Descriptors are not provider writes or delivery receipts', 'Save a new attempt with authoritative CAS and read it back before a separately authorized dispatch; replay never grants dispatch', 'Unknown outcomes require exact provider/correlation readback; no exactly-once guarantee', 'V1 supports one-shot decision_needed only; arbitrary activity reminders and new rounds are not automated'] };
}

import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/agent-linkage-scenario.json';
import { initialize, preview, apply, mutationFromPreview, canonical, parseState } from './engine';
import { reconcileReminders } from './reminderReconcile';
import type { TripState } from './schema';
const now = fixture.asOf; const later = '2033-10-03T18:02:00+08:00';
const source = (time = now) => ({ kind: 'synthetic' as const, reference: 'synthetic:explicit-reminder-user', observedAt: time });
const intent = { id: 'north-reminder', decisionPointId: 'north-choice', purpose: 'decision_needed', provider: 'synthetic-provider', accountRef: 'synthetic-owner', title: 'Decide north entry', prompt: 'Check final exact-day notice', timeZone: 'Asia/Shanghai', dueAtOverride: null, source: source() };
const save = async (s: TripState, op: unknown, id: string, time = now) => (await apply(s, mutationFromPreview(await preview(s, op, s.revision), { idempotencyKey: id, actor: 'synthetic', reason: 'Synthetic test', at: time }))).state;
const rows = (s: TripState, time = now) => reconcileReminders(s, time).items;
const readback = (id: string, extra = {}) => ({ id, journeyId: fixture.snapshot.trip.id, correlation: 'providerTaskId' in extra && extra.providerTaskId ? { kind: 'authorized_existing', authorization: source() } : { kind: 'lookup' }, intentId: intent.id, provider: intent.provider, accountRef: intent.accountRef, providerTaskId: null, expiresAt: '2033-10-03T21:00:00+08:00', status: 'absent', configuration: null, source: source(), ...extra });
async function initial() { let s = await save(initialize(fixture.snapshot), fixture.importOperation, 'import'); s = await save(s, { type: 'set_reminder_intent', expectedVersion: 0, record: intent }, 'intent'); return s; }
const rb = (s: TripState, r: ReturnType<typeof readback>) => save(s, { type: 'record_reminder_readback', record: r }, r.id);
async function ready() { return rb(await initial(), readback('lookup')); }
async function begin(s: TripState, id = 'attempt') { const a = rows(s)[0].action!; return save(s, { type: 'begin_reminder_action', intentId: intent.id, attemptId: id, actionKey: a.actionKey, asOf: now }, id); }
describe('reminder intent and readback reconciliation contract', () => {
  it('does not invent provider observations or silently write when tools are unavailable', async () => {
    const s = await initial(); const before = canonical(s);
    expect(rows(s)[0]).toMatchObject({ status: 'pending', action: null, reasonCodes: ['provider_readback_required'] });
    expect(canonical(s)).toBe(before); expect(reconcileReminders(s, now).externalActionsPerformed).toBe(0);
  });
  it('has stable matter identity, rejects duplicate/provider binding/version errors', async () => {
    const s = await initial();
    await expect(save(s, { type: 'set_reminder_intent', expectedVersion: 0, record: { ...intent, id: 'duplicate' } }, 'dup')).rejects.toMatchObject({ code: 'duplicate_reminder_intent' });
    await expect(save(s, { type: 'set_reminder_intent', expectedVersion: 0, record: intent }, 'stale')).rejects.toMatchObject({ code: 'reminder_version_conflict' });
    await expect(save(s, { type: 'set_reminder_intent', expectedVersion: 1, record: { ...intent, provider: 'other', source: source(later) } }, 'bind')).rejects.toMatchObject({ code: 'reminder_binding_mismatch' });
  });
  it('proposes only after an explicit fresh lookup; a new attempt blocks replay and generic undo', async () => {
    const s = await ready(); const a = rows(s)[0].action!; expect(a.kind).toBe('create'); expect(a.externalExecutionImplemented).toBe(false);
    const op = { type: 'begin_reminder_action', intentId: intent.id, attemptId: 'attempt', actionKey: a.actionKey, asOf: now };
    const request = mutationFromPreview(await preview(s, op, s.revision), { idempotencyKey: 'attempt', actor: 'synthetic', reason: 'Test', at: now });
    const result = await apply(s, request); expect((await apply(result.state, request)).receipt.replayed).toBe(true);
    expect(rows(result.state)[0]).toMatchObject({ action: null, reasonCodes: ['unknown_external_outcome_do_not_retry'] });
    expect((await preview(result.state, { type: 'undo', commitId: 'attempt' }, result.state.revision)).reasonCodes).toContain('linkage_undo_forbidden');
    await expect(save(result.state, { ...op, attemptId: 'retry' }, 'retry')).rejects.toMatchObject({ code: 'stale_reminder_action' });
  });
  it('unknown outcomes survive desired date changes, and late old success binds before a current update', async () => {
    let s = await ready(); const oldDesired = rows(s)[0].action!.configuration; s = await begin(s);
    s = await save(s, { type: 'set_reminder_intent', expectedVersion: 1, record: { ...intent, dueAtOverride: '2033-10-03T23:00:00+08:00', source: source(later) } }, 'date');
    expect(rows(s, later)[0].action).toBeNull();
    s = await rb(s, readback('created', { correlation: { kind: 'attempt', attemptId: 'attempt', actionKey: s.content.linkage!.reminderAttempts[0].actionKey }, status: 'present', providerTaskId: 'task-1', configuration: oldDesired, source: source(later) }));
    expect(rows(s, later)[0].action).toBeNull();
    s = await save(s, { type: 'resolve_reminder_attempt', attemptId: 'attempt', outcome: 'applied', readbackId: 'created', source: source(later) }, 'result');
    expect(rows(s, later)[0].action).toMatchObject({ kind: 'update', providerTaskId: 'task-1', configuration: { dueAt: '2033-10-03T23:00:00+08:00' } });
  });
  it('late create success after completion requires cancel; it never creates a second task', async () => {
    let s = await ready(); const config = rows(s)[0].action!.configuration; s = await begin(s);
    s = await save(s, { type: 'set_decision_status', decisionPointId: 'north-choice', status: 'completed', confirmation: 'explicit', reason: 'User chose and handled matter', source: source(later) }, 'done');
    expect(rows(s, later)[0].action).toBeNull();
    s = await rb(s, readback('created', { correlation: { kind: 'attempt', attemptId: 'attempt', actionKey: s.content.linkage!.reminderAttempts[0].actionKey }, status: 'present', providerTaskId: 'task-1', configuration: config, source: source(later) }));
    s = await save(s, { type: 'resolve_reminder_attempt', attemptId: 'attempt', outcome: 'applied', readbackId: 'created', source: source(later) }, 'resolved');
    expect(rows(s, later)[0].action?.kind).toBe('cancel');
  });
  it('unknown timeout is not known nonexecution; only confirmed not_applied permits a new attempt key', async () => {
    const readyState = await ready(); const key = rows(readyState)[0].action!.actionKey; let s = await begin(readyState);
    s = await save(s, { type: 'resolve_reminder_attempt', attemptId: 'attempt', outcome: 'unknown', source: source(later) }, 'timeout');
    expect(rows(s, later)[0].action).toBeNull();
    s = await save(s, { type: 'resolve_reminder_attempt', attemptId: 'attempt', outcome: 'not_applied', source: source('2033-10-03T18:03:00+08:00') }, 'not-sent');
    expect(rows(s, '2033-10-03T18:03:00+08:00')[0].action?.actionKey).not.toBe(key);
    await expect(save(s, { type: 'resolve_reminder_attempt', attemptId: 'attempt', outcome: 'unknown', source: source(later) }, 'downgrade')).rejects.toMatchObject({ code: 'attempt_already_resolved' });
  });
  it('does not treat a mismatched task/configuration as confirmation', async () => {
    let s = await begin(await ready());
    s = await rb(s, readback('wrong-config', { correlation: { kind: 'attempt', attemptId: 'attempt', actionKey: s.content.linkage!.reminderAttempts[0].actionKey }, status: 'present', providerTaskId: 'task-1', configuration: { ...rows(s)[0].desired!, title: 'Different task' }, source: source(later) }));
    await expect(save(s, { type: 'resolve_reminder_attempt', attemptId: 'attempt', outcome: 'applied', readbackId: 'wrong-config', source: source(later) }, 'bad')).rejects.toMatchObject({ code: 'readback_mismatch' });
    await expect(rb(s, readback('other-id', { providerTaskId: 'task-2' }))).rejects.toMatchObject({ code: 'reminder_binding_mismatch' });
  });
  it('keeps manual pause sticky across content changes and unexplained provider disable', async () => {
    let s = await ready(); const configuration = rows(s)[0].desired!;
    s = await rb(s, readback('present', { status: 'present', providerTaskId: 'task-1', configuration, source: source(later) }));
    s = await save(s, { type: 'set_reminder_status', intentId: intent.id, status: 'paused', confirmation: 'explicit', source: source('2033-10-03T18:03:00+08:00') }, 'pause');
    s = await save(s, { type: 'set_reminder_intent', expectedVersion: 2, record: { ...intent, title: 'Updated content', source: source('2033-10-03T18:04:00+08:00') } }, 'content');
    expect(rows(s, '2033-10-03T18:04:00+08:00')[0].action?.kind).toBe('pause');
    let other = await ready(); other = await rb(other, readback('disabled', { status: 'present', providerTaskId: 'task-1', configuration: { ...configuration, enabled: false }, source: source(later) }));
    expect(rows(other, later)[0].reasonCodes).toContain('provider_disabled_respect_pause');
    other = await save(other, { type: 'set_reminder_status', intentId: intent.id, status: 'active', confirmation: 'explicit', source: source('2033-10-03T18:03:00+08:00') }, 'resume');
    expect(rows(other, '2033-10-03T18:03:00+08:00')[0].action?.kind).toBe('update');
  });
  it('does not recreate a removed one-shot task or backfill missed deadlines', async () => {
    let s = await ready(); s = await rb(s, readback('removed', { providerTaskId: 'task-1', source: source(later) }));
    expect(rows(s, later)[0].reasonCodes).toContain('removed_task_requires_explicit_new_round');
    s = await ready(); expect(rows(s, '2033-10-03T22:00:00+08:00')[0].action).toBeNull();
  });
  it('ignores old readbacks and detects equal-time conflict, future and expiry', async () => {
    const initialState = await initial(); const old = readback('old', { source: source('2033-10-03T18:00:00+08:00') });
    let s = await rb(await rb(initialState, readback('new', { status: 'unknown' })), old);
    expect(rows(s)[0].reasonCodes).toContain('provider_readback_required');
    s = await rb(await rb(initialState, readback('one')), readback('two', { status: 'unknown' }));
    expect(rows(s)[0].reasonCodes).toContain('provider_readback_conflict');
    s = await rb(initialState, readback('future', { source: source(later) })); expect(rows(s)[0].action).toBeNull();
    s = await ready(); expect(rows(s, '2033-10-03T21:00:00+08:00')[0].action).toBeNull();
  });
  it('rejects an expired descriptor between preview and apply, without dispatch', async () => {
    const s = await ready(); const a = rows(s)[0].action!;
    const p = await preview(s, { type: 'begin_reminder_action', intentId: intent.id, attemptId: 'expired', actionKey: a.actionKey, asOf: now }, s.revision);
    await expect(apply(s, mutationFromPreview(p, { idempotencyKey: 'expired', actor: 'test', reason: 'Test', at: '2033-10-03T21:00:00+08:00' }))).rejects.toMatchObject({ code: 'invalid_action_time' });
  });
});
describe('reviewer boundary regressions', () => {
  it('does not cancel after a chosen option becomes invalid', async () => {
    let s = await ready(); const configuration = rows(s)[0].desired!;
    s = await rb(s, readback('adopted', { providerTaskId: 'task-1', status: 'present', configuration, source: source(later) }));
    s = await save(s, { type: 'choose_option', record: { id: 'choice', decisionPointId: 'north-choice', optionId: 'north-next', reason: 'Synthetic choice', source: source(later) } }, 'choice');
    expect(rows(s, later)[0].action?.kind).toBe('cancel');
    s = await save(s, { type: 'set_plan_dates', planId: 'north-day', closeDates: ['2033-10-04'], reason: 'New closure invalidates choice', source: source(later) }, 'closure');
    expect(rows(s, later)[0].action).toBeNull(); expect(rows(s, later)[0].desiredReason).toBeNull();
  });
  it('pauses a known task even if current decision deadline is unknown', async () => {
    let s = await ready(); const configuration = rows(s)[0].desired!;
    s = await rb(s, readback('adopted', { providerTaskId: 'task-1', status: 'present', configuration, source: source(later) }));
    const raw = { schemaVersion: 1, revision: 0, content: structuredClone(s.content), history: [] }; delete raw.content.itinerary!.decisionPoints[0].deadline; s = parseState(raw);
    s = await save(s, { type: 'set_reminder_status', intentId: intent.id, status: 'paused', confirmation: 'explicit', source: source('2033-10-03T18:03:00+08:00') }, 'pause');
    expect(rows(s, '2033-10-03T18:03:00+08:00')[0].action?.kind).toBe('pause');
  });
  it('rejects cross-journey readback and requires original attempt correlation', async () => {
    let s = await ready();
    await expect(rb(s, readback('other-journey', { journeyId: 'another-journey' }))).rejects.toMatchObject({ code: 'reminder_journey_mismatch' });
    const config = rows(s)[0].desired; s = await begin(s);
    s = await rb(s, readback('adopted', { providerTaskId: 'task-1', status: 'present', configuration: config, source: source(later) }));
    await expect(save(s, { type: 'resolve_reminder_attempt', attemptId: 'attempt', outcome: 'applied', readbackId: 'adopted', source: source(later) }, 'bad')).rejects.toMatchObject({ code: 'reminder_correlation_required' });
  });
  it('revalidates persisted provider binding and applied result semantics', async () => {
    const s = await ready(); const raw = { schemaVersion: 1, revision: 0, content: structuredClone(s.content), history: [] };
    raw.content.linkage!.reminderReadbacks[0].accountRef = 'wrong-account';
    expect(() => parseState(raw)).toThrow(); expect(() => reconcileReminders(raw, now)).toThrow();
    const attempted = await begin(s); const invalid = { schemaVersion: 1, revision: 0, content: structuredClone(attempted.content), history: [] };
    invalid.content.linkage!.reminderAttempts[0].outcome = 'applied'; expect(() => parseState(invalid)).toThrow();
  });
});
it('blocks a new attempt before external execution when durable history is full', async () => {
  const s = await ready(); const action = rows(s)[0].action!;
  const full = parseState({ ...s, revision: 200, history: Array.from({ length: 200 }, (_, n) => ({ ...s.history[0], id: 'synthetic-capacity-' + n, revision: n + 1, before: s.content, after: s.content })) });
  const p = await preview(full, { type: 'begin_reminder_action', intentId: intent.id, attemptId: 'full', actionKey: action.actionKey, asOf: now }, full.revision);
  await expect(apply(full, mutationFromPreview(p, { idempotencyKey: 'full', actor: 'test', reason: 'Capacity test', at: now }))).rejects.toMatchObject({ code: 'history_full' });
  expect(full.content.linkage!.reminderAttempts).toHaveLength(0);
});

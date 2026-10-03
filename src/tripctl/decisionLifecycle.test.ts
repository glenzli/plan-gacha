import { describe, it, expect } from 'vitest';
import fixture from '../../fixtures/operator-scenario.json';
import { initialize, preview, apply, mutationFromPreview, parseState, hash, inspect } from './engine';
import { analyseItinerary } from './itinerary';
import { renderItineraryReport } from './itineraryReport';
import { readOperatorContext, getOperatorSchema } from './operator';
import type { TripState } from './schema';
const creationSource = fixture.importOperation.source;
const stamp = (hour: number) => `2031-06-04T${hour.toString().padStart(2, '0')}:00:00Z`;
const source = (hour: number) => ({ kind: 'user' as const, reference: 'synthetic:user-confirmation', observedAt: stamp(hour) });
const status = (value: 'open' | 'completed' | 'withdrawn', hour = 10) => ({ type: 'set_decision_status' as const, decisionPointId: 'hotel-deadline', status: value, confirmation: 'explicit' as const, reason: 'Anonymous user confirms the decision matter is handled; order and refund unverified', source: source(hour) });
const metadata = (id: string) => ({ idempotencyKey: id, actor: 'synthetic-operator', reason: 'Synthetic lifecycle contract', at: stamp(20) });
async function change(state: TripState, op: unknown, id: string) {
  const p = await preview(state, op, state.revision); expect(p.canApply).toBe(true);
  return (await apply(state, mutationFromPreview(p, metadata(id)))).state;
}
async function initial() { return change(initialize(fixture.snapshot), fixture.importOperation, 'import'); }
const report = (state: TripState) => analyseItinerary(state.content.itinerary!, { asOf: stamp(20) });
const choose = (hour: number, id = `choice-${hour}`) => ({ type: 'choose_option', record: { id, decisionPointId: 'hotel-deadline', optionId: 'crosscity-option', reason: 'Explicit synthetic choice', source: source(hour) } });
describe('typed decision lifecycle', () => {
  it('removes completed decisions from prompts/options without changing orders, plans, actual or checklist', async () => {
    const before = await initial();
    const rankedBefore = await inspect(before, 'rank_candidates', '2031-06-04');
    expect(report(before).advisoryEvents).toHaveLength(1);
    const p = await preview(before, status('completed'), before.revision);
    expect(hash(before)).toBe(hash(await initial())); expect(p.canApply).toBe(true);
    expect(p.detail).toMatchObject({ changedDays: [], decisionChange: { before: null, after: { status: 'completed' }, refundVerified: false, cancellationPerformed: false } });
    const state = await change(before, status('completed'), 'complete');
    expect(state.content.snapshot).toEqual(before.content.snapshot); expect(state.content.memory).toEqual(before.content.memory);
    const { decisionPoints: _points, ...rest } = state.content.itinerary!;
    const { decisionPoints: _beforePoints, ...beforeRest } = before.content.itinerary!; expect(rest).toEqual(beforeRest);
    expect(_points[0].lifecycle).toMatchObject({ status: 'completed', confirmation: 'explicit', source: source(10) }); expect(_beforePoints[0].lifecycle).toBeUndefined();
    expect(report(state)).toMatchObject({ options: [], inactiveOptions: [{ id: 'crosscity-option' }], advisoryEvents: [], decisions: [{ status: 'completed', requiresAction: false, deadlineStatus: 'inactive', refundVerified: false, cancellationPerformed: false }] });
    const ctx = await readOperatorContext(state, { asOf: stamp(20), dateId: '2031-06-04' }); expect(ctx.itinerary?.analysis?.advisoryEvents).toEqual([]);
    // A completed administrative matter is not a plan exclusion or confirmed refund.
    expect(await inspect(state, 'rank_candidates', '2031-06-04')).toEqual(rankedBefore);
    const rendered = renderItineraryReport(state.content.itinerary!, { asOf: stamp(20) });
    const pending = rendered.markdown.split('## 条件方案与待决事项')[1].split('## 已完成或撤回')[0];
    expect(pending).not.toContain(fixture.importOperation.decisionPoints[0].text); expect(rendered.markdown).toContain('不再提示'); expect(rendered.markdown).toContain('退款与订单结果未由工具核实');
  });
  it('keeps uncertain reports open and requires explicit non-provider confirmation', async () => {
    let state = await initial(); state = await change(state, { type: 'fact', record: { id: 'uncertain', text: 'The refund may have been requested; no confirmation', certainty: 'uncertain', source: { ...source(10), kind: 'synthetic' } } }, 'uncertain');
    expect(report(state).advisoryEvents).toHaveLength(1);
    for (const patch of [{ confirmation: undefined }, { confirmation: 'uncertain' }, { status: 'unknown' }, { status: 'refunded' }]) await expect(preview(state, { ...status('completed'), ...patch }, state.revision)).rejects.toMatchObject({ code: 'invalid_operation' });
    await expect(preview(state, { ...status('completed'), source: { ...source(10), kind: 'provider' } }, state.revision)).rejects.toMatchObject({ code: 'unconfirmed_intent' });
    await expect(preview(state, { ...status('completed'), decisionPointId: 'missing' }, state.revision)).rejects.toMatchObject({ code: 'unknown_id' });
    expect(report(state).decisions[0].status).toBe('open');
  });
  it('withdraws and reopens, invalidates earlier choices and requires a newer explicit choice', async () => {
    let state = await change(await initial(), choose(9), 'choose'); expect(report(state).decisions[0].status).toBe('decision_recorded');
    state = await change(state, status('withdrawn', 10), 'withdraw'); expect(report(state).advisoryEvents).toEqual([]);
    expect(report(state).options).toEqual([]); expect(report(state).decisions[0].previousChoice?.id).toBe('choice-9');
    expect((await preview(state, choose(11), state.revision)).reasonCodes).toContain('decision_closed');
    state = await change(state, status('open', 11), 'reopen');
    expect(report(state).decisions[0]).toMatchObject({ status: 'open', requiresAction: true, choice: null, previousChoice: { id: 'choice-9' }, deadlineStatus: 'due' }); expect(report(state).options).toHaveLength(1);
    expect(report(state).advisoryEvents).toHaveLength(1);
    expect((await preview(state, choose(11), state.revision)).reasonCodes).toContain('stale_decision_evidence');
    state = await change(state, choose(12), 'fresh-choice'); expect(report(state).decisions[0]).toMatchObject({ status: 'decision_recorded', choice: { id: 'choice-12' } });
    state = await change(state, status('completed', 13), 'done'); expect(report(state).advisoryEvents).toEqual([]);
  });
  it('blocks stale/equal evidence, including after undo, and preserves idempotent receipts', async () => {
    const original = await initial(); const p = await preview(original, status('completed'), original.revision); const request = mutationFromPreview(p, metadata('done'));
    const closed = (await apply(original, request)).state;
    for (const hour of [9, 10]) {
      const p = await preview(closed, status('open', hour), closed.revision); expect(p.reasonCodes).toContain('stale_decision_evidence'); expect(p.nextContent).toEqual(closed.content);
      await expect(apply(closed, mutationFromPreview(p, metadata(`stale-${hour}`)))).rejects.toMatchObject({ code: 'constraint_violation' });
    }
    const undone = await change(closed, { type: 'undo', commitId: 'done' }, 'undo'); expect(undone.content).toEqual(original.content);
    expect((await preview(undone, status('completed'), undone.revision)).reasonCodes).toContain('stale_decision_evidence');
    expect((await apply(undone, request)).receipt).toMatchObject({ replayed: true, committedRevision: 2, currentRevision: 3 });
    await expect(apply(undone, { ...request, reason: 'Changed intent' })).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    await expect(preview(closed, status('open', 11), original.revision)).rejects.toMatchObject({ code: 'revision_conflict' });
    expect(report(await change(undone, status('completed', 11), 'new-report')).advisoryEvents).toEqual([]);
  });
  it('keeps shared and unlinked alternatives active when only one decision closes', async () => {
    let state = await initial();
    state = await change(state, { type: 'itinerary_decision_point', record: { id: 'other', text: 'Independent open matter', optionIds: ['crosscity-option'], source: creationSource } }, 'other');
    state = await change(state, { type: 'itinerary_option', record: { id: 'unlinked', condition: 'Unlinked alternative', proposal: 'Separate plan', dateIds: ['2031-06-05'], uncertainties: [], source: creationSource } }, 'unlinked');
    state = await change(state, status('completed'), 'complete');
    expect(report(state).options.map((o) => o.id)).toEqual(['crosscity-option', 'unlinked']);
    expect(report(state).options[0].activeDecisionPointIds).toEqual(['other']); expect(report(state).advisoryEvents.map((a) => a.decisionPointId)).toEqual(['other']);
  });
  it.each([5, 6])('opens legacy v%s state/history unchanged and replays its receipt without migration', async (version) => {
    const empty = initialize(fixture.snapshot); const operation = fixture.importOperation;
    const p = await preview(empty, operation, 0);
    const request = { ...mutationFromPreview(p, metadata('legacy')), previewToken: hash({ coreVersion: version, state: empty, operation: p.operation }) };
    const legacy = { ...empty, revision: 1, content: p.nextContent, history: [{ id: 'legacy', revision: 1, operation: p.operation, actor: request.actor, reason: request.reason, at: request.at, requestHash: hash(request), before: empty.content, after: p.nextContent }] };
    const serialized = JSON.stringify(legacy); expect(parseState(legacy)).toEqual(legacy); expect(hash(parseState(legacy))).toBe(hash(legacy)); expect(JSON.stringify(legacy)).toBe(serialized);
    expect((await apply(legacy, request)).receipt.replayed).toBe(true);
    await expect(apply(empty, request)).rejects.toMatchObject({ code: 'stale_preview' });
    const changed = await change(legacy, status('completed'), 'complete'); expect(changed.history[0]).toEqual(legacy.history[0]); expect(changed.schemaVersion).toBe(1);
    expect('lifecycle' in changed.history[0].after.itinerary!.decisionPoints[0]).toBe(false);
  });
  it('rejects persisted malformed status evidence and does not import pre-completed decisions', async () => {
    const state = await initial(); const bad = structuredClone(state);
    bad.content.itinerary!.decisionPoints[0].lifecycle = { status: 'completed', confirmation: 'explicit', reason: 'Invalid old evidence', source: { ...creationSource, kind: 'synthetic' } };
    bad.history[0].after = structuredClone(bad.content); expect(() => parseState(bad)).toThrow();
    const op = structuredClone(fixture.importOperation); Object.assign(op.decisionPoints[0], { lifecycle: { status: 'completed', confirmation: 'explicit', reason: 'Bypass', source: source(10) } });
    await expect(preview(initialize(fixture.snapshot), op, 0)).rejects.toMatchObject({ code: 'invalid_operation' });
    expect(getOperatorSchema('set_decision_status')).toMatchObject({ operation: { properties: { confirmation: { const: 'explicit' }, status: { enum: ['open', 'completed', 'withdrawn'] } } } });
  });
});

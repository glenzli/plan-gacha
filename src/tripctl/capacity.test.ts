import { describe, it, expect } from 'vitest';
import fixture from '../../fixtures/planning-tools.snapshot.json';
import { initialize, preview, apply, mutationFromPreview, canonical } from './engine';
import { analyseCapacity } from './capacity';
import { MAX_STORE_BYTES, MAX_HISTORY_EVENTS } from './limits';
import { getOperatorSchema } from './operator';
describe('read-only capacity diagnostics', () => {
  it('measures the exact UTF-8 writer bytes without modifying state', async () => {
    const before = initialize(fixture);
    const p = await preview(before, { type: 'fact', record: { id: 'unicode', text: '合成旅行 🌲', certainty: 'reported', source: { kind: 'synthetic', reference: 'synthetic:capacity', observedAt: '2033-10-01T00:00:00Z' } } }, 0);
    const state = (await apply(before, mutationFromPreview(p, { idempotencyKey: 'one', actor: 'test', reason: 'Synthetic capacity', at: '2033-10-01T00:00:00Z' }))).state;
    const original = canonical(state); const report = analyseCapacity(state);
    expect(report.serializedStateBytes).toBe(Buffer.byteLength(JSON.stringify(state, null, 2) + '\n'));
    expect(report.bytes.remaining).toBe(MAX_STORE_BYTES - report.serializedStateBytes);
    expect(Object.values(report.compactBreakdown).reduce((a, b) => a + b, 0)).toBe(report.compactStateBytes);
    expect(report.compactBreakdown.historyContentBytes).toBe(Buffer.byteLength(JSON.stringify(before.content)) + Buffer.byteLength(JSON.stringify(state.content)));
    expect(report.retainedContentOccurrences).toBe(3); expect(report.commits.remaining).toBe(199);
    expect(report.saved).toBe(false); expect(report.migrationPerformed).toBe(false); expect(canonical(state)).toBe(original);
  });
  it('keeps the independent 200-event limit visible and discoverable', () => {
    const state = initialize(fixture); const operation = { type: 'set_context', todayId: fixture.todayId };
    const full = { ...state, revision: MAX_HISTORY_EVENTS, history: Array.from({ length: MAX_HISTORY_EVENTS }, (_, n) => ({ id: 'synthetic-' + n, revision: n + 1, operation, actor: 'test', reason: 'Synthetic capacity boundary', at: '2033-10-01T00:00:00Z', requestHash: 'synthetic', before: state.content, after: state.content })) };
    expect(analyseCapacity(full).commits.remaining).toBe(0);
    expect(analyseCapacity(state).retainedContentOccurrences).toBe(1);
    expect(getOperatorSchema().commands).toContain('capacity');
  });
});

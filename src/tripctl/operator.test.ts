import { describe, it, expect } from 'vitest';
import bookedFixture from '../../fixtures/booked-day.snapshot.json';
import scenario from '../../fixtures/operator-scenario.json';
import { getOperatorSchema, readOperatorContext } from './operator';
import { initialize, preview, apply, mutationFromPreview, hash, parseState } from './engine';
import type { TripState } from './schema';
const source = scenario.operations[0].source!;
const metadata = (key: string) => ({ idempotencyKey: key, actor: 'synthetic', reason: 'Synthetic operator scenario', at: source.observedAt });
async function change(state: TripState, operation: unknown, key: string) { const p = await preview(state, operation, state.revision); expect(p.canApply).toBe(true); return (await apply(state, mutationFromPreview(p, metadata(key)))).state; }
describe('operator facade', () => {
  it('discovers real runtime operations and rejects unknown schema/context', async () => {
    expect(getOperatorSchema().statelessMcpTools).toHaveLength(4);
    expect(getOperatorSchema().operations).toContain('set_plan_dates');
    expect(getOperatorSchema('set_plan_dates')).toMatchObject({ operation: { type: 'object', properties: { closeDates: { minItems: 1 } } } });
    expect(() => getOperatorSchema('cancel_order')).toThrowError('Use schema');
    await expect(readOperatorContext(initialize(scenario.snapshot), {})).rejects.toMatchObject({ code: 'invalid_context' });
    await expect(readOperatorContext(initialize(scenario.snapshot), { asOf: source.observedAt, dateId: '2030-01-01' })).rejects.toMatchObject({ code: 'unknown_date' });
  });
  it('handles closures/reopening, tentative options, deadlines and true application guards without writes', async () => {
    let state = await change(initialize(scenario.snapshot), scenario.importOperation, 'import');
    const originalItinerary = structuredClone(state.content.itinerary);
    for (const [n, op] of scenario.operations.entries()) state = await change(state, op, `scenario-${n}`);
    expect(state.content.itinerary).toEqual(originalItinerary);
    expect(state.content.snapshot.trip.checklistText).toBe(scenario.snapshot.trip.checklistText);
    const before = hash(state); const input = { asOf: '2031-06-04T19:00:00Z', dateId: '2031-06-04', candidateLimit: 20 };
    const c = await readOperatorContext(state, input); expect(c).toEqual(await readOperatorContext(state, input)); expect(hash(state)).toBe(before);
    const crosscity = c.candidates.items.find((p) => p.planId === 'crosscity')!;
    expect(crosscity.canAssign).toBe(true); expect(crosscity.application).toMatchObject({ canApply: false, requiredOperation: 'edit_itinerary', reasonCodes: ['itinerary_operation_required'] });
    expect(c.memory.issues).toHaveLength(1); expect(c.itinerary?.analysis?.decisions[0]).toMatchObject({ deadlineStatus: 'due', cancellationPerformed: false });
    for (const id of ['peak', 'forest']) expect(c.candidates.items.find((p) => p.planId === id)?.reasonCodes).toContain('closed_or_unavailable');
    const nextDay = await readOperatorContext(state, { ...input, dateId: '2031-06-05', candidateLimit: 1 });
    expect(nextDay.plans.find((p) => p.id === 'forest')?.closed_dates).toEqual(['2031-06-04']); expect(nextDay.candidates.truncated).toBe(true);
    expect(nextDay.itinerary?.analysis?.decisions).toHaveLength(1);
  });
  it('rejects stale/equal evidence for overlapping dates, allows newer explicit reopening and retains undo/idempotency', async () => {
    const initial = initialize(scenario.snapshot); const close = scenario.operations[0];
    const p = await preview(initial, close, 0); const request = mutationFromPreview(p, metadata('close'));
    const state = (await apply(initial, request)).state;
    const reopen = { type: 'set_plan_dates', planId: 'peak', reopenDates: ['2031-06-04'], reason: 'Explicit reopening report', source };
    for (const observedAt of ['2031-06-02T12:00:00Z', source.observedAt]) {
      const stale = await preview(state, { ...reopen, source: { ...source, observedAt } }, 1);
      expect(stale.reasonCodes).toContain('stale_date_evidence'); expect(stale.nextContent).toEqual(state.content);
      await expect(apply(state, mutationFromPreview(stale, metadata('stale')))).rejects.toMatchObject({ code: 'constraint_violation' });
    }
    const reopened = await change(state, { ...reopen, source: { ...source, observedAt: '2031-06-04T12:00:00Z' } }, 'reopen');
    expect(reopened.content.snapshot.trip.plans[0].closed_dates).toEqual([]);
    const undone = await change(reopened, { type: 'undo', commitId: 'reopen' }, 'undo'); expect(undone.content).toEqual(state.content);
    expect((await apply(undone, request)).receipt.replayed).toBe(true);
  });
  it('records closure of an imported/booked day while preserving commitments, actual and projection', async () => {
    let state = await change(initialize(scenario.snapshot), scenario.importOperation, 'import');
    const before = structuredClone(state.content);
    state = await change(state, { type: 'set_plan_dates', planId: 'day4', closeDates: ['2031-06-04'], reason: 'User reports closure; still review reservations', source: { ...source, kind: 'user' } }, 'closed-imported');
    expect(state.content.itinerary).toEqual(before.itinerary); expect(state.content.memory).toEqual(before.memory);
    expect(state.content.snapshot.trip.schedule).toEqual(before.snapshot.trip.schedule);
    expect(parseState(state)).toEqual(state);
    const booked = initialize(bookedFixture); const plan = booked.content.snapshot.trip.plans.find((p) => p.bookings?.some((b) => b.status === 'done'))!;
    const dated = await change(booked, { type: 'set_plan_dates', planId: plan.id, closeDates: [booked.content.snapshot.trip.startDateStr], reason: 'Reported closure, order untouched', source }, 'close-booked');
    expect(dated.content.snapshot.trip.plans.find((p) => p.id === plan.id)?.bookings).toEqual(plan.bookings);
    expect(dated.content.snapshot.trip.schedule).toEqual(booked.content.snapshot.trip.schedule);
    expect(dated.content.memory.progress).toEqual([]);
  });
  it('retains legacy optional-field absence and committed v5 receipts, but refuses pending v5 previews', async () => {
    const state = initialize(scenario.snapshot); const operation = { type: 'set_context', todayId: '2031-06-05' };
    const p = await preview(state, operation, 0); const old = { ...mutationFromPreview(p, metadata('old')), previewToken: hash({ coreVersion: 5, state, operation }) };
    await expect(apply(state, old)).rejects.toMatchObject({ code: 'stale_preview' });
    const legacy = { ...state, revision: 1, content: p.nextContent, history: [{ id: 'old', revision: 1, operation, actor: old.actor, reason: old.reason, at: old.at, requestHash: hash(old), before: state.content, after: p.nextContent }] };
    expect(parseState(legacy)).toEqual(legacy); expect('itinerary' in parseState(legacy).content).toBe(false);
    expect((await apply(legacy, old)).receipt.replayed).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import fixture from '../../fixtures/operator-scenario.json';
import { initialize, preview, apply, mutationFromPreview, inspect, parseState, hash } from './engine';
import { assessItineraryOptions } from './optionPlanning';
import { analyseItinerary } from './itinerary';
import { readOperatorContext } from './operator';
import { renderItineraryReport } from './itineraryReport';
import type { TripState } from './schema';
const source = (hour = 12) => ({ kind: 'synthetic' as const, reference: 'synthetic:dated-option', observedAt: `2031-06-04T${hour}:00:00Z` });
const meta = (id: string) => ({ idempotencyKey: id, actor: 'synthetic-operator', reason: 'Anonymous dated option contract', at: source(20).observedAt });
const binding = (hour = 12) => ({ type: 'set_option_requirements', optionId: 'crosscity-option', plans: [{ planId: 'crosscity', dateId: '2031-06-04' }], reason: 'Explicitly associate existing anonymous prose with its dated plan', source: source(hour) });
const exclusion = { type: 'decision', record: { id: 'exclude-old-date', planId: 'crosscity', dateId: '2031-06-04', disposition: 'excluded', reason: 'Exclude this date only', source: source(13) } };
const later = { type: 'itinerary_option', record: { id: 'later-date', condition: 'If opening and transport are checked', proposal: 'Same place on another date', dateIds: ['2031-06-05'], uncertainties: ['Opening unverified'], source: source(14), requirements: { plans: [{ planId: 'crosscity', dateId: '2031-06-05' }], reason: 'Explicit later-date candidate', source: source(14) } } };
async function change(state: TripState, operation: unknown, id: string) { const p = await preview(state, operation, state.revision); expect(p.canApply).toBe(true); return (await apply(state, mutationFromPreview(p, meta(id)))).state; }
const initial = async () => change(initialize(fixture.snapshot), fixture.importOperation, 'import');
const options = (state: TripState) => assessItineraryOptions(state.content.itinerary!, state.content);
const analysis = (state: TripState) => analyseItinerary(state.content.itinerary!, { asOf: source(20).observedAt }, state.content);
describe('effective dated conditional options', () => {
  it('keeps legacy prose unassessed rather than guessing a plan or claiming a current recommendation', async () => {
    const state = await initial(); const before = hash(state);
    expect(options(state)).toMatchObject({ options: [], unassessedOptions: [{ id: 'crosscity-option', active: false, eligibility: { status: 'unassessed', reasonCodes: ['missing_option_requirements'] } }] });
    const bare = analyseItinerary(state.content.itinerary!, { asOf: source().observedAt });
    expect(bare.options).toEqual([]); expect(bare.unassessedOptions[0].eligibility.reasonCodes).toContain('missing_planning_context');
    expect(hash(state)).toBe(before); expect(parseState(state)).toEqual(state);
  });
  it('retains an old dated exclusion while admitting a separate later-date candidate for the same plan', async () => {
    const original = await initial(); const originalOption = structuredClone(original.content.itinerary!.options[0]);
    let state = await change(original, binding(), 'bind'); state = await change(state, exclusion, 'exclude'); state = await change(state, later, 'new-date');
    const out = options(state); expect(out.options.map((o) => o.id)).toEqual(['later-date']);
    expect(out.inactiveOptions[0]).toMatchObject({ id: 'crosscity-option', eligibility: { status: 'inactive', reasonCodes: ['confirmed_exclusion'] } });
    const { requirements: _requirements, ...prose } = state.content.itinerary!.options[0]; expect(prose).toEqual(originalOption); expect(_requirements?.plans).toEqual(binding().plans);
    expect(state.content.memory.decisions[0]).toMatchObject({ dateId: '2031-06-04', disposition: 'excluded' });
    for (const [date, allowed] of [['2031-06-04', false], ['2031-06-05', true]] as const) {
      const ranked = await inspect(state, 'rank_candidates', date);
      expect(ranked.ok && ranked.data.kind === 'ranking' && ranked.data.candidates.find((c) => c.planId === 'crosscity')?.canAssign).toBe(allowed);
    }
    const ctx = await readOperatorContext(state, { asOf: source(20).observedAt, dateId: '2031-06-05' }); expect(ctx.itinerary?.analysis?.options).toEqual(out.options); expect(analysis(state).inactiveOptions).toEqual(out.inactiveOptions);
    const rendered = renderItineraryReport(state.content.itinerary!, { asOf: source(20).observedAt }, state.content);
    const current = rendered.markdown.split('## 条件方案与待决事项')[1].split('## 非活跃方案')[0]; expect(current).not.toContain(originalOption.proposal);
    expect(rendered.markdown).toContain('非活跃方案（保留历史）'); expect(rendered.markdown).toContain(originalOption.proposal);
  });
  it('invalidates a previously chosen branch after exclusion and refuses another known-blocked choice without writes', async () => {
    let state = await change(await initial(), binding(), 'bind');
    const choice = { type: 'choose_option', record: { id: 'chosen', decisionPointId: 'hotel-deadline', optionId: 'crosscity-option', reason: 'Explicit conditional intent only', source: source(13) } };
    state = await change(state, choice, 'choice'); expect(analysis(state).decisions[0].status).toBe('decision_recorded');
    state = await change(state, exclusion, 'exclude');
    expect(analysis(state).decisions[0]).toMatchObject({ status: 'choice_invalidated', requiresAction: true, choice: null, previousChoice: { id: 'chosen' } });
    expect(analysis(state).advisoryEvents).toHaveLength(1); const before = hash(state);
    const p = await preview(state, { ...choice, record: { ...choice.record, id: 'repeat' } }, state.revision); expect(p.reasonCodes).toContain('option_unavailable'); expect(p.nextContent).toEqual(state.content);
    await expect(apply(state, mutationFromPreview(p, meta('blocked')))).rejects.toMatchObject({ code: 'constraint_violation' }); expect(hash(state)).toBe(before);
  });
  it('applies closure and completion independently of ticket possession, with no opening guarantee', async () => {
    const f = structuredClone(fixture); Object.assign(f.snapshot.trip.plans[3], { bookings: [{ id: 'ticket', title: 'Anonymous held ticket', status: 'done', dateId: '2031-06-05' }] });
    let state = await change(initialize(f.snapshot), f.importOperation, 'import'); state = await change(state, later, 'later');
    expect(options(state).options[0].eligibility.checks[0]).toMatchObject({ openingStatus: 'not_verified', bookingIsNotOpeningEvidence: true });
    state = await change(state, { type: 'set_plan_dates', planId: 'crosscity', closeDates: ['2031-06-05'], reason: 'Reported closure; ticket retained', source: source(15) }, 'close');
    expect(options(state).inactiveOptions.find((o) => o.id === 'later-date')?.eligibility.reasonCodes).toContain('closed_or_unavailable'); expect(state.content.snapshot.trip.plans[3].bookings?.[0].status).toBe('done');
    state = await change(state, { type: 'set_plan_dates', planId: 'crosscity', reopenDates: ['2031-06-05'], reason: 'Later explicit report', source: source(16) }, 'reopen');
    expect(options(state).options[0].eligibility.checks[0].openingStatus).toBe('not_verified');
    state = await change(state, { type: 'progress', record: { id: 'done', planId: 'crosscity', dateId: '2031-06-04', status: 'done', reason: 'Actual user report, not a ticket inference', source: source(17) } }, 'actual');
    expect(options(state).inactiveOptions.find((o) => o.id === 'later-date')?.eligibility.reasonCodes).toContain('already_done');
  });
  it('preserves lifecycle closure, past options and explicit whitelist restrictions in the same classification', async () => {
    let state = await change(await initial(), binding(), 'bind');
    state = await change(state, { type: 'set_decision_status', decisionPointId: 'hotel-deadline', status: 'completed', confirmation: 'explicit', reason: 'Administrative matter handled', source: source(13) }, 'complete');
    expect(options(state).inactiveOptions[0].eligibility.reasonCodes).toContain('decision_closed');
    state = await change(state, later, 'later'); state = await change(state, { type: 'set_plan_dates', planId: 'crosscity', availableDates: ['2031-06-06'], reason: 'Explicit exhaustive whitelist', source: source(14) }, 'whitelist');
    expect(options(state).inactiveOptions.find((o) => o.id === 'later-date')?.eligibility.reasonCodes).toContain('date_not_allowed');
    state = await change(state, { type: 'set_context', todayId: '2031-06-06' }, 'today'); expect(options(state).inactiveOptions.every((o) => o.eligibility.reasonCodes.includes('past_option_date'))).toBe(true);
  });
  it('keeps partial bindings unassessed and checks jointly conflicting plans', async () => {
    const f = structuredClone(fixture); Object.assign(f.snapshot.trip.plans[0], { conflicts: ['crosscity'] });
    let state = await change(initialize(f.snapshot), f.importOperation, 'import');
    const record = { ...later.record, id: 'two-day', dateIds: ['2031-06-05', '2031-06-06'] };
    state = await change(state, { type: 'itinerary_option', record }, 'partial'); expect(options(state).unassessedOptions.find((o) => o.id === 'two-day')?.eligibility.reasonCodes).toContain('incomplete_option_requirements');
    state = await change(state, { type: 'set_option_requirements', optionId: 'two-day', plans: [...later.record.requirements.plans, { planId: 'peak', dateId: '2031-06-06' }], reason: 'Complete explicit branch requirements', source: source(15) }, 'all');
    expect(options(state).inactiveOptions.find((o) => o.id === 'two-day')?.eligibility.reasonCodes).toContain('option_plan_conflict');
  });
  it('rejects unknown references, ambiguous whole-day requirements and stale binding replay after undo', async () => {
    const original = await initial();
    for (const [patch, code] of [[{ optionId: 'missing' }, 'unknown_id'], [{ plans: [{ planId: 'missing', dateId: '2031-06-04' }] }, 'unknown_id'], [{ plans: [{ planId: 'crosscity', dateId: '2031-06-05' }] }, 'invalid_reference'], [{ plans: [binding().plans[0], binding().plans[0]] }, 'invalid_operation'], [{ source: { ...source(), kind: 'provider' } }, 'unconfirmed_intent']] as const) await expect(preview(original, { ...binding(), ...patch }, original.revision)).rejects.toMatchObject({ code });
    const p = await preview(original, binding(), original.revision); const request = mutationFromPreview(p, meta('bind')); const bound = (await apply(original, request)).state;
    const undone = await change(bound, { type: 'undo', commitId: 'bind' }, 'undo'); expect(undone.content).toEqual(original.content);
    expect((await preview(undone, binding(), undone.revision)).reasonCodes).toContain('stale_option_evidence'); expect((await apply(undone, request)).receipt.replayed).toBe(true);
    expect(options(await change(undone, binding(13), 'fresh')).options).toHaveLength(1);
  });
  it('reports remembered constraints in check as well as rank for an imported inconsistent snapshot', async () => {
    const snapshot = structuredClone(fixture.snapshot); Object.assign(snapshot.trip.schedule, { '2031-06-04': { planId: 'crosscity' } });
    const state = initialize(snapshot); state.content.memory.decisions.push({ ...exclusion.record, disposition: 'excluded' });
    const check = await inspect(state, 'evaluate_plan'); expect(check.ok && check.data.kind === 'evaluation' && check.data.scheduledIssues[0].issues).toContain('confirmed_exclusion');
    expect(check.ok && check.data.kind === 'evaluation' && check.data.risks.some((r) => r.reasons.includes('confirmed_exclusion'))).toBe(true);
  });
});

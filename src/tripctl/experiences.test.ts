import { describe, it, expect } from 'vitest';
import scenario from '../../fixtures/operator-scenario.json';
import fixture from '../../fixtures/experience-scenario.json';
import { initialize, preview, apply, mutationFromPreview, parseState, hash } from './engine';
import { searchExperiences, createGuideDraft } from './experiences';
import { getOperatorSchema } from './operator';
import type { TripState } from './schema';
const asOf = '2032-06-04T12:00:00Z';
async function change(s: TripState, op: unknown, id: string) { const p = await preview(s, op, s.revision); expect(p.canApply).toBe(true); return (await apply(s, mutationFromPreview(p, { idempotencyKey: id, actor: 'synthetic-test', reason: 'Synthetic source-linked review', at: '2031-06-04T20:00:00Z' }))).state; }
async function prepared(tripId = scenario.snapshot.trip.id) {
  const snapshot = structuredClone(scenario.snapshot); snapshot.trip.id = tripId;
  snapshot.trip.lodgings.push({ id: 'private-lodge', name: 'Synthetic Private Lodge', location: { label: 'Synthetic Private Lodge', address: 'Synthetic private address' } } as never);
  let state = await change(initialize(snapshot), scenario.importOperation, 'import');
  state = await change(state, fixture.adjust, 'adjust'); return change(state, fixture.actual, 'actual');
}
async function complete(tripId?: string) { let state = await prepared(tripId); for (const [n, op] of fixture.facts.entries()) state = await change(state, op, `fact-${n}`); return state; }
describe('existing-fact experience review loop', () => {
  it('traces original plan, observation, reason, outcome and user evaluation without learning a preference', async () => {
    let state = await prepared(); const before = structuredClone(state.content); state = await change(state, fixture.facts[0], 'observation');
    const incomplete = searchExperiences([state], { asOf }).results[0]; expect(incomplete.recap.outcome).toBeNull(); expect(incomplete.recap.userEvaluation).toBeNull();
    state = await change(state, fixture.facts[1], 'review'); const row = searchExperiences([state], { asOf, query: 'holiday queue' }).results[0];
    expect(row.factId).toBe('queue-review'); expect(row.kind).toBe('firsthand'); expect(row.source).toEqual(fixture.facts[1].record.source);
    expect(row.recap.originalPlan?.activities?.[0].timing.start).toBe('09:00'); expect(row.recap.currentPlan?.activities?.[0].timing.start).toBe('10:00');
    expect(row.recap.changes[0]).toMatchObject({ commitId: 'adjust', reason: 'Synthetic source-linked review', operationType: 'edit_itinerary' });
    expect(row.recap.actualReports[0].kind).toBe('finished'); expect(row.recap.outcome).toBe(fixture.facts[1].record.experience.outcome); expect(row.recap.userEvaluation).toBeTruthy();
    expect(row).toMatchObject({ reuseStatus: 'recheck_required', personalPreferenceEstablished: false, reviewBeforeReuse: ['crowds'] });
    expect(state.content.snapshot).toEqual(before.snapshot); expect(state.content.itinerary).toEqual(before.itinerary); expect(state.content.memory.preferences).toEqual(before.memory.preferences);
    expect(searchExperiences([state], { asOf, includeSuperseded: true }).results.find((r) => r.factId === 'queue-observation')?.superseded).toBe(true);
  });
  it('distinguishes external advice and enforces source/reference/correction boundaries', async () => {
    const state = await prepared(); const external = fixture.facts[2];
    const withGuide = await change(state, external, 'guide'); const row = searchExperiences([withGuide], { asOf, kind: 'external_guide' }).results[0];
    expect(row).toMatchObject({ kind: 'external_guide', certainty: 'uncertain', eventDateId: null, reviewBeforeReuse: ['booking', 'opening'] }); expect(row.recap.outcome).toBeNull();
    await expect(preview(state, { ...external, record: { ...external.record, experience: { ...external.record.experience, outcome: 'It happened to the user' } } }, state.revision)).rejects.toMatchObject({ code: 'invalid_operation' });
    const first = fixture.facts[0];
    await expect(preview(state, { ...first, record: { ...first.record, source: { ...first.record.source, kind: 'provider' } } }, state.revision)).rejects.toMatchObject({ code: 'invalid_experience_source' });
    for (const patch of [{ planId: 'missing' }, { activityId: 'missing' }, { changeCommitIds: ['missing'] }, { supersedesFactId: 'missing' }]) await expect(preview(state, { ...first, record: { ...first.record, experience: { ...first.record.experience, ...patch } } }, state.revision)).rejects.toMatchObject({ code: 'unknown_id' });
    const observed = await change(state, first, 'first');
    await expect(preview(observed, { ...fixture.facts[1], record: { ...fixture.facts[1].record, source: first.record.source } }, observed.revision)).rejects.toMatchObject({ code: 'stale_experience' });
    const reviewed = await change(observed, fixture.facts[1], 'second');
    await expect(preview(reviewed, { ...fixture.facts[1], record: { ...fixture.facts[1].record, id: 'parallel-correction' } }, reviewed.revision)).rejects.toMatchObject({ code: 'experience_conflict' });
  });
  it('searches only supplied journeys with deterministic filters, truncation and stale-context caveats', async () => {
    const one = await complete(); const two = await complete('other-synthetic'); const before = [hash(one), hash(two)];
    const q = { asOf, query: 'holiday queue', topics: ['crowds'], limit: 1 }; const results = searchExperiences([one, two], q);
    expect(results.total).toBe(2); expect(results.truncated).toBe(true); expect(results).toEqual(searchExperiences([one, two], q));
    expect(results.results[0].stateHash).toBe(before.find((h) => h === results.results[0].stateHash)); expect([hash(one), hash(two)]).toEqual(before);
    expect(searchExperiences([one], { asOf: '2029-01-01T00:00:00Z' }).results.every((r) => r.reuseStatus === 'future_observation')).toBe(true);
    expect(() => searchExperiences([one, one], { asOf })).toThrowError('one current version'); expect(() => searchExperiences([one], {})).toThrowError('explicit asOf');
    expect(searchExperiences([one], { asOf, query: 'unmatched-token' }).results).toEqual([]);
  });
  it('exports only dedicated draft lessons, not private observations, contacts, orders, lodging or source references', async () => {
    const state = await complete(); const before = hash(state);
    const draft = createGuideDraft(state, { asOf, experienceIds: ['queue-review', 'external-advice'] }); const text = JSON.stringify(draft);
    expect(draft).toMatchObject({ saved: false, published: false, needsUserReview: true, privacyMode: 'dedicated_lesson_allowlist' });
    expect(draft.markdown).toContain('Allow extra time'); expect(draft.markdown).toContain('外部攻略');
    for (const secret of ['ORDER-EXAMPLE', 'test@example.invalid', 'Synthetic Private Lodge', 'Synthetic private address', 'https://example.invalid', 'queue-review', 'Original walk']) expect(text).not.toContain(secret);
    expect(hash(state)).toBe(before);
    expect(() => createGuideDraft(state, { asOf, experienceIds: ['queue-observation'] })).toThrowError('latest experience correction');
    expect(() => createGuideDraft(state, { asOf, experienceIds: ['missing'] })).toThrowError('unknown experience');
  });
  it.each(['Email test@example.invalid', 'Call +1 555 123 4567', 'Stay at Synthetic Private Lodge', 'Use Synthetic private address', '订单: ABC12345'])('withholds a draft lesson containing sensitive content: %s', async (lesson) => {
    const state = await prepared(); const first = fixture.facts[0]; const recorded = await change(state, { ...first, record: { ...first.record, experience: { ...first.record.experience, draftLesson: lesson } } }, 'private-lesson');
    const out = createGuideDraft(recorded, { asOf, experienceIds: ['queue-observation'] }); expect(out.omittedLessons).toBe(1); expect(out.cards[0].lesson).toBeNull(); expect(JSON.stringify(out)).not.toContain(lesson);
  });
  it('keeps ISO dates but flags common dotted phones and known query-only lodging addresses', async () => {
    const state = await complete(); const input = { asOf, experienceIds: ['queue-review'] };
    expect(createGuideDraft(state, { ...input, lessonDrafts: [{ experienceId: 'queue-review', lesson: 'Observed on 2031-06-04; check conditions again.' }] }).cards[0].lesson).toContain('2031-06-04');
    expect(createGuideDraft(state, { ...input, lessonDrafts: [{ experienceId: 'queue-review', lesson: 'Call 090.1234.5678' }] }).cards[0].lesson).toBeNull();
    const snapshot = structuredClone(scenario.snapshot); snapshot.trip.lodgings.push({ id: 'query-only', name: '', location: { query: 'Synthetic query-only private address' } } as never);
    let withQuery = await change(initialize(snapshot), scenario.importOperation, 'import'); withQuery = await change(withQuery, fixture.adjust, 'adjust'); withQuery = await change(withQuery, fixture.facts[0], 'observe');
    expect(createGuideDraft(withQuery, { asOf, experienceIds: ['queue-observation'], lessonDrafts: [{ experienceId: 'queue-observation', lesson: 'Stay at Synthetic query-only private address' }] }).cards[0].lesson).toBeNull();
  });
  it('does not claim arbitrary names in a dedicated lesson are automatically anonymized', async () => {
    const state = await complete(); const draft = createGuideDraft(state, { asOf, experienceIds: ['queue-review'], lessonDrafts: [{ experienceId: 'queue-review', lesson: 'Synthetic Person suggested a slower pace.' }] });
    expect(draft.cards[0].lesson).toContain('Synthetic Person'); expect(draft.anonymized).toBe(false); expect(draft.needsUserReview).toBe(true); expect(draft.published).toBe(false);
  });
  it('retains experience links when a later itinerary edit removes a non-baseline activity', async () => {
    let state = await prepared();
    state = await change(state, { type: 'edit_itinerary', changes: [{ action: 'insert', dateId: '2031-06-04', index: 1, activity: { id: 'lookout', kind: 'visit', title: 'Synthetic later stop', timing: { start: '12:00', end: '13:00' }, source: fixture.adjust.source } }], source: fixture.adjust.source }, 'insert');
    const first = fixture.facts[0]; state = await change(state, { ...first, record: { ...first.record, experience: { ...first.record.experience, activityId: 'lookout', changeCommitIds: ['insert'] } } }, 'observe-added');
    state = await change(state, { type: 'edit_itinerary', changes: [{ action: 'remove', activityId: 'lookout' }], source: fixture.adjust.source }, 'remove');
    expect(parseState(state)).toEqual(state); expect(searchExperiences([state], { asOf }).results[0].activityId).toBe('lookout');
    expect(state.content.itinerary!.current[0].activities.some((a) => a.id === 'lookout')).toBe(false);
  });
  it('retains legacy facts unchanged, discovers the schema and preserves preview/idempotency/undo', async () => {
    let state = initialize(scenario.snapshot); state = await change(state, { type: 'fact', record: { id: 'old-note', text: 'A legacy observation', certainty: 'uncertain', source: fixture.facts[0].record.source } }, 'old');
    const before = hash(state); expect(parseState(state)).toEqual(state); expect(searchExperiences([state], { asOf })).toMatchObject({ total: 0, unstructuredFactCount: 1 }); expect(hash(state)).toBe(before);
    expect(getOperatorSchema('fact')).toMatchObject({ operation: { properties: { record: { properties: { experience: { properties: { kind: { enum: ['firsthand', 'external_guide'] } } } } } } } });
    const ready = await prepared(); const p = await preview(ready, fixture.facts[0], ready.revision); const request = mutationFromPreview(p, { idempotencyKey: 'observe', actor: 'synthetic', reason: 'Explicit source', at: asOf });
    const saved = (await apply(ready, request)).state; expect((await apply(saved, request)).receipt.replayed).toBe(true);
    const undone = await change(saved, { type: 'undo', commitId: 'observe' }, 'undo'); expect(undone.content).toEqual(ready.content);
  });
});

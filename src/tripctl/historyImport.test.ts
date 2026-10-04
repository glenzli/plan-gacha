import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/history-import-scenario.json';
import itineraryFixture from '../../fixtures/operator-scenario.json';
import { initialize, preview, apply, mutationFromPreview, hash, parseState } from './engine';
import { searchExperiences, createGuideDraft } from './experiences';
import { getOperatorSchema } from './operator';
import type { TripState } from './schema';
const op = { type: 'import_history', sourceTripId: fixture.snapshot.trip.id, confirmedUserHistory: true, timeZone: 'Asia/Tokyo', source: fixture.source, feedback: fixture.feedback };
const init = () => initialize({ ...fixture.snapshot, trip: { ...fixture.snapshot.trip, ...fixture.feedback } });
const meta = (id = 'history-1') => ({ idempotencyKey: id, actor: 'synthetic-importer', reason: 'Import explicit historical user feedback only', at: fixture.source.observedAt });
async function imported(s = init(), operation: unknown = op) { const p = await preview(s, operation, s.revision); expect(p.canApply).toBe(true); return (await apply(s, mutationFromPreview(p, meta()))).state; }
const search = (s: TripState) => searchExperiences([s], { asOf: '2026-10-05T00:00:00Z', limit: 50 });
describe('explicit archived history import', () => {
  it('init preserves original JSON, extensions, aliases and time zone without indexing implicitly', () => {
    const s = init(); for (const [key, value] of Object.entries(fixture.feedback)) expect(s.content.snapshot.trip[key as keyof typeof fixture.feedback]).toEqual(value);
    expect(s.content.snapshot.trip.timeZone).toBe('Asia/Tokyo'); expect(s.content.snapshot.trip.plans[0].stops![0]).toMatchObject({ time: '00:30' });
    expect(s.content.memory.facts).toEqual([]);
    const aliases = { day_reviews: [{ date_id: '2024-07-10', note: 'Keep unknown structure', extra: 7 }], stop_outcomes: 'unparsed source', place_feedback: null, archive_summary: { unexpected: true }, time_zone: 'Asia/Tokyo' };
    const copy = initialize({ ...fixture.snapshot, trip: { ...fixture.snapshot.trip, ...aliases } });
    for (const [key, value] of Object.entries(aliases)) expect((copy.content.snapshot.trip as Record<string, unknown>)[key]).toEqual(value);
  });
  it('imports all four categories into searchable facts, preserving snapshot and all non-fact state', async () => {
    const s = init(); const before = hash(s); const p = await preview(s, op, 0);
    expect(p.detail).toMatchObject({ inputRecords: 4, typedItineraryImported: false, localTimeHandling: 'preserved_unconverted' }); expect(hash(s)).toBe(before);
    const saved = await imported(s); expect(parseState(saved)).toEqual(saved); expect(saved.content.snapshot).toEqual(s.content.snapshot); expect(saved.content.itinerary).toBeUndefined();
    for (const key of ['preferences', 'decisions', 'progress', 'issues', 'mapFacts'] as const) expect(saved.content.memory[key]).toEqual(s.content.memory[key]);
    const rows = search(saved).results; expect(rows).toHaveLength(4);
    for (const row of rows) { const h = row.historical!; expect(h.record).toEqual(h.field === 'archiveSummary' ? fixture.feedback.archiveSummary : Object.values(fixture.feedback[h.field as 'dayReviews'])[0]); expect(h.timeZone).toBe('Asia/Tokyo'); expect(row.recap.outcome).toBeNull(); expect(row.personalPreferenceEstablished).toBe(false); expect(row.recap.actualReports).toEqual([]); }
    expect(searchExperiences([saved], { asOf: fixture.source.observedAt, query: 'tiring' }).results[0].recap.userEvaluation).toContain('unsatisfied');
    expect(searchExperiences([saved], { asOf: fixture.source.observedAt, query: 'blacklisted' }).total).toBe(1);
    expect(saved.history[0].operation).toEqual(op);
  });
  it('retains Japanese event dates and offset/local timestamps without Shanghai conversion or inferred event times', async () => {
    const rows = search(await imported()).results;
    const review = rows.find((r) => r.historical?.field === 'dayReviews')!;
    expect(review.eventDateId).toBe('2024-07-10'); expect(review.source.observedAt).toBe('2024-07-11T00:30:00+09:00'); expect(review.historical?.observedAtBasis).toBe('original_offset_timestamp');
    const stop = rows.find((r) => r.historical?.field === 'stopOutcomes')!;
    expect(stop.historical?.sourceTimestamp).toBe('2024-07-10T16:30:00'); expect(stop.historical?.observedAtBasis).toBe('import_time_only'); expect(stop.source.observedAt).toBe(fixture.source.observedAt); expect(stop.eventDateId).toBe('2024-07-10');
    const summary = rows.find((r) => r.historical?.field === 'archiveSummary')!; expect(summary.eventDateId).toBeNull(); expect(summary.historical?.sourceTimestamp).toBe('');
  });
  it('keeps ordinary writes and ordinary undo blocked on archived journeys', async () => {
    const saved = await imported();
    for (const operation of [
      { type: 'fact', record: { id: 'ordinary', text: 'Not an import', certainty: 'reported', source: fixture.source } },
      { type: 'preference', record: { id: 'preference', text: 'Do not learn permanently', source: fixture.source } },
      { type: 'set_context', todayId: '2026-10-05' }, { type: 'undo', commitId: 'history-1' },
    ]) {
      const p = await preview(saved, operation, saved.revision); expect(p.canApply).toBe(false); expect(p.reasonCodes).toContain('archived_trip'); expect(p.nextContent).toEqual(saved.content);
      await expect(apply(saved, mutationFromPreview(p, meta('blocked')))).rejects.toMatchObject({ code: 'constraint_violation' });
    }
    await expect(preview(saved, { type: 'assign', dateId: '2024-07-11', planId: 'old-day' }, saved.revision)).rejects.toMatchObject({ code: 'archived_snapshot' });
  });
  it('supports exact request replay, deduplicates reimports with new timestamps and refuses conflicting source content atomically', async () => {
    const s = init(); const p = await preview(s, op, 0); const request = mutationFromPreview(p, meta()); const saved = (await apply(s, request)).state;
    expect((await apply(saved, request)).receipt.replayed).toBe(true);
    const repeat = await preview(saved, { ...op, source: { ...op.source, observedAt: '2026-10-05T00:00:00Z' } }, 1);
    expect(repeat.canApply).toBe(false); expect(repeat.reasonCodes).toEqual(['history_already_imported']); expect(repeat.nextContent).toEqual(saved.content);
    const changed = structuredClone(op); changed.feedback.dayReviews.review.note = 'Changed behind the same source version';
    const conflict = await preview(saved, changed, 1); expect(conflict.reasonCodes).toContain('history_import_conflict'); expect(conflict.nextContent).toEqual(saved.content);
    await expect(apply(saved, { ...request, reason: 'Different request reusing key' })).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    await expect(preview(saved, op, 0)).rejects.toMatchObject({ code: 'revision_conflict' });
  });
  it('deduplicates overlapping source batches without losing the new entries', async () => {
    const one = await imported(init(), { ...op, feedback: { dayReviews: op.feedback.dayReviews } });
    const p = await preview(one, op, 1); expect(p.detail).toMatchObject({ inputRecords: 4 }); expect(p.nextContent.memory.facts).toHaveLength(4);
    const saved = (await apply(one, mutationFromPreview(p, meta('rest')))).state;
    expect(search(saved).total).toBe(4); expect(saved.content.snapshot.trip.archived).toBe(true);
  });
  it('gives identical output for semantically identical input object key orders', async () => {
    const reversed = JSON.parse(JSON.stringify(op), (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value);
    const a = await preview(init(), op, 0); const b = await preview(init(), reversed, 0); expect(a.previewToken).toBe(b.previewToken); expect(hash(a.nextContent)).toBe(hash(b.nextContent));
  });
  it('requires explicit matching journey, provenance and time zone and has no generic record injection path', async () => {
    const state = init();
    for (const [patch, code] of [
      [{ sourceTripId: 'other-trip' }, 'history_trip_mismatch'], [{ timeZone: 'Asia/Shanghai' }, 'history_timezone_mismatch'],
      [{ source: { ...op.source, kind: 'provider' } }, 'unconfirmed_history_source'],
    ] as const) { const p = await preview(state, { ...op, ...patch }, 0); expect(p.reasonCodes).toContain(code); expect(p.nextContent).toEqual(state.content); }
    const active = structuredClone(fixture.snapshot); active.trip.archived = false;
    expect((await preview(initialize(active), op, 0)).reasonCodes).toContain('history_requires_archived_trip');
    await expect(preview(state, { ...op, confirmedUserHistory: false }, 0)).rejects.toMatchObject({ code: 'invalid_operation' });
    await expect(preview(state, { ...op, changes: [{ type: 'assign' }] }, 0)).rejects.toMatchObject({ code: 'invalid_operation' });
    const saved = await imported(); await expect(preview(initialize(active), { type: 'fact', record: saved.content.memory.facts[0] }, 0)).rejects.toMatchObject({ code: 'history_operation_required' });
  });
  it('allows only a narrow latest-import undo and preserves the archived state and source history', async () => {
    const saved = await imported(); const p = await preview(saved, { type: 'undo_history_import', commitId: 'history-1' }, 1);
    expect(p.canApply).toBe(true); const undone = (await apply(saved, mutationFromPreview(p, meta('undo-history')))).state;
    expect(undone.content).toEqual(init().content); expect(undone.revision).toBe(2); expect(undone.history[0].operation).toEqual(op);
    await expect(preview(undone, { type: 'undo_history_import', commitId: 'undo-history' }, 2)).rejects.toMatchObject({ code: 'undo_conflict' });
    expect((await preview(undone, op, 2)).canApply).toBe(true);
  });
  it('retains unknown shapes, unbound legacy IDs and full long text for search instead of silently dropping them', async () => {
    const feedback = { day_reviews: [{ date_id: 'invalid-date', plan_id: 'lost-old-plan', note: 'x'.repeat(5000) + ' tailneedle', extra: { unchanged: true } }], stop_outcomes: [{ status: 'active' }, 'odd-entry'], place_feedback: false, archive_summary: null };
    const saved = await imported(init(), { ...op, feedback }); const rows = search(saved).results;
    expect(rows).toHaveLength(4); const row = rows.find((r) => r.historical?.field === 'day_reviews')!;
    expect(row.eventDateId).toBeNull(); expect(row.planId).toBeUndefined(); expect(row.historical?.record).toEqual(feedback.day_reviews[0]); expect(row.unknowns.length).toBeGreaterThan(2);
    expect(searchExperiences([saved], { asOf: fixture.source.observedAt, query: 'tailneedle' }).total).toBe(1);
    expect(rows.every((r) => r.recap.outcome === null)).toBe(true);
  });
  it('exports historical records as review placeholders or explicit standalone lessons, never raw private feedback', async () => {
    const saved = await imported(); const ids = saved.content.memory.facts.map((f) => f.id); const before = hash(saved);
    const empty = createGuideDraft(saved, { asOf: fixture.source.observedAt, experienceIds: ids });
    expect(empty.cards.every((c) => c.lesson === null)).toBe(true);
    const draft = createGuideDraft(saved, { asOf: fixture.source.observedAt, experienceIds: ids, lessonDrafts: [{ experienceId: ids[0], lesson: 'Leave recovery time after a long walk; check current weather.' }] });
    expect(draft).toMatchObject({ saved: false, published: false, anonymized: false, needsUserReview: true });
    expect(draft.cards[0]).toMatchObject({ lessonOrigin: 'request_draft', lesson: 'Leave recovery time after a long walk; check current weather.' });
    for (const canary of ['Synthetic Person', '090.1234.5678', 'ORDER-PRIVATE', 'Synthetic raw private address', '8000', 'tiring']) expect(JSON.stringify(draft)).not.toContain(canary);
    expect(hash(saved)).toBe(before);
    expect(() => createGuideDraft(saved, { asOf: fixture.source.observedAt, experienceIds: ids, lessonDrafts: [{ experienceId: 'unknown', lesson: 'Not selected' }] })).toThrowError('uniquely reference');
  });
  it('refuses over-capacity or empty imports without partial facts and exposes the actual schemas', async () => {
    const state = init(); const p = await preview(state, { ...op, feedback: { dayReviews: Array.from({ length: 501 }, (_, n) => ({ note: String(n) })) } }, 0);
    expect(p.canApply).toBe(false); expect(p.reasonCodes).toContain('history_capacity_exceeded'); expect(p.nextContent).toEqual(state.content);
    expect((await preview(state, { ...op, feedback: { dayReviews: {} } }, 0)).reasonCodes).toContain('no_history_records');
    expect(getOperatorSchema('import_history')).toMatchObject({ operation: { properties: { type: { const: 'import_history' } } } }); expect(getOperatorSchema().operations).toContain('undo_history_import');
  });
  it('preserves unknown zones and explicitly refuses typed Shanghai conversion from Tokyo data', async () => {
    const snapshot = structuredClone(fixture.snapshot); delete (snapshot.trip as { timeZone?: string }).timeZone;
    const s = await imported(initialize(snapshot), { ...op, timeZone: null }); expect(search(s).results.every((r) => r.historical?.timeZone === null)).toBe(true);
    const active = structuredClone(itineraryFixture.snapshot); Object.assign(active.trip, { timeZone: 'Asia/Tokyo' });
    await expect(preview(initialize(active), itineraryFixture.importOperation, 0)).rejects.toMatchObject({ code: 'unsupported_time_zone_conversion' });
    await expect(preview(initialize(active), { ...itineraryFixture.importOperation, timeZone: 'Asia/Tokyo' }, 0)).rejects.toMatchObject({ code: 'invalid_operation' });
  });
});


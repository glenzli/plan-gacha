import { describe, it, expect } from 'vitest';
import fixture from '../../fixtures/planning-tools.snapshot.json';
import bookedFixture from '../../fixtures/booked-day.snapshot.json';
import { initialize, preview, apply, mutationFromPreview, parseState, inspect } from './engine';
import { createMapProvider, MapProviderError, mapFactSchema } from './mapFacts';
import type { TripState, TripOperation } from './schema';
const source = { kind: 'synthetic' as const, reference: 'synthetic:explicit-user-message', observedAt: '2026-10-02T12:00:00Z' };
const metadata = (id: string) => ({ idempotencyKey: id, actor: 'synthetic-operator', reason: 'Explicit synthetic test instruction', at: source.observedAt });
const assign = { type: 'assign', dateId: '2026-10-11', planId: 'museum' } as const;
async function change(state: TripState, operation: TripOperation, key: string) {
  const proposal = await preview(state, operation, state.revision);
  return apply(state, mutationFromPreview(proposal, metadata(key)));
}
describe('persistent journey contract', () => {
  it('separates knowledge categories, requires explicit evidence and keeps issues across later changes', async () => {
    let state = initialize(fixture);
    state = (await change(state, { type: 'issue', record: { id: 'tickets', text: 'Check museum tickets', source, relatedPlanId: 'museum' } }, 'issue-1')).state;
    state = (await change(state, { type: 'fact', record: { id: 'hours', text: 'Opening hours remain unverified', source, certainty: 'uncertain' } }, 'fact-1')).state;
    state = (await change(state, { type: 'preference', record: { id: 'pace', text: 'Prefer a slow morning', source } }, 'preference-1')).state;
    expect(state.content.memory.decisions).toEqual([]);
    expect(state.content.memory.progress).toEqual([]);
    state = (await change(state, assign, 'assign-1')).state;
    expect(state.revision).toBe(4);
    expect(state.content.memory.issues[0].status).toBe('open');
    state = (await change(state, { type: 'resolve_issue', id: 'tickets', resolution: 'Synthetic user reports booking complete', source }, 'resolve-1')).state;
    expect(state.content.memory.issues[0]).toMatchObject({ status: 'resolved', resolution: 'Synthetic user reports booking complete' });
    await expect(preview(state, { type: 'preference', record: { id: 'unverified', text: 'Provider guesses preference', source: { ...source, kind: 'provider' } } }, state.revision)).rejects.toMatchObject({ code: 'unconfirmed_decision' });
  });
  it('enforces revision, idempotency, preview binding and monotonic undo without losing history', async () => {
    const original = initialize(fixture); const proposal = await preview(original, assign, 0);
    const request = mutationFromPreview(proposal, metadata('move'));
    const result = await apply(original, request);
    expect(result.state.revision).toBe(1);
    expect(await apply(result.state, request)).toMatchObject({ receipt: { replayed: true, committedRevision: 1, currentRevision: 1 } });
    await expect(apply(result.state, { ...request, reason: 'Different intent' })).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    await expect(apply(result.state, { ...request, idempotencyKey: 'race' })).rejects.toMatchObject({ code: 'revision_conflict' });
    await expect(apply(original, { ...request, previewToken: `sha256:${'0'.repeat(64)}` })).rejects.toMatchObject({ code: 'stale_preview' });
    const undo = await change(result.state, { type: 'undo', commitId: 'move' }, 'undo-move');
    expect(undo.state.content).toEqual(original.content);
    expect(undo.state.revision).toBe(2); expect(undo.state.history).toHaveLength(2);
    await expect(preview(undo.state, { type: 'undo', commitId: 'move' }, 2)).rejects.toMatchObject({ code: 'undo_conflict' });
    const corrupted = structuredClone(undo.state); corrupted.content.memory.issues.push({ id: 'fake', text: 'Tampered content', source, status: 'open', resolution: '' });
    expect(() => parseState(corrupted)).toThrowError('History, revision and current state must agree');
  });
  it('preserves confirmed exclusions and actual completion as assignment constraints', async () => {
    let state = initialize(fixture);
    state = (await change(state, { type: 'decision', record: { id: 'exclude-indoor', planId: 'indoor', disposition: 'excluded', reason: 'Synthetic user explicitly declines it', source } }, 'exclude')).state;
    const blocked = await preview(state, { ...assign, planId: 'indoor' }, state.revision);
    expect(blocked).toMatchObject({ canApply: false, reasonCodes: ['confirmed_exclusion'] });
    const ranking = await inspect(state, 'rank_candidates', assign.dateId);
    expect(ranking.ok && ranking.data.kind === 'ranking' && ranking.data.candidates.find((x) => x.planId === 'indoor')?.canAssign).toBe(false);
    state = (await change(state, { type: 'progress', record: { id: 'visited', planId: 'museum', dateId: '2026-10-10', status: 'done', reason: 'Synthetic user reports actual visit', source } }, 'visited')).state;
    expect(await preview(state, assign, state.revision)).toMatchObject({ canApply: false, reasonCodes: ['already_done', 'completed_plan_displaced'] });
    await expect(preview(state, { type: 'decision', record: { id: 'wrong', planId: 'closed', dateId: '2026-10-11', disposition: 'confirmed', reason: 'Bad confirmation', source } }, state.revision)).rejects.toMatchObject({ code: 'decision_mismatch' });
  });
  it('requires explicit withdrawal before displacing a confirmed plan and validates persisted references', async () => {
    let state = initialize(fixture);
    state = (await change(state, { type: 'decision', record: { id: 'confirm', planId: 'museum', dateId: '2026-10-10', disposition: 'confirmed', reason: 'Keep this date', source } }, 'confirm')).state;
    expect(await preview(state, assign, 1)).toMatchObject({ canApply: false, reasonCodes: ['confirmed_plan_displaced'] });
    state = (await change(state, { type: 'decision', record: { id: 'release', planId: 'museum', dateId: '2026-10-10', disposition: 'withdrawn', reason: 'Synthetic user explicitly releases the prior decision', source } }, 'release')).state;
    expect((await preview(state, assign, 2)).canApply).toBe(true);
    const invalid = initialize(fixture);
    invalid.content.memory.issues.push({ id: 'bad-reference', text: 'Invalid', source, relatedPlanId: 'missing', status: 'open', resolution: '' });
    expect(() => parseState(invalid)).toThrowError('Issue references an unknown plan');
  });
  it('blocks unavailable dates, unknown references and unaccepted weather risk without writes', async () => {
    const state = initialize(fixture); const before = structuredClone(state);
    const proposal = await preview(state, { ...assign, planId: 'closed' }, 0);
    expect(proposal.canApply).toBe(false);
    await expect(apply(state, mutationFromPreview(proposal, metadata('closed')))).rejects.toMatchObject({ code: 'constraint_violation' });
    await expect(preview(state, { type: 'issue', record: { id: 'unknown', text: 'Question', source, relatedPlanId: 'missing' } }, 0)).rejects.toMatchObject({ code: 'unknown_id' });
    expect(state).toEqual(before);
    state.content.snapshot.trip.plans[0].name = 'Outdoor hike';
    state.content.snapshot.trip.plans[0].stops = [{ title: 'Outdoor trail' }];
    state.content.snapshot.weatherData.fixture.dailyByDate!['2026-10-11'] = { weatherCode: 95 };
    const weather = await preview(state, assign, 0);
    expect(weather.weatherOverride).toBe(true);
    await expect(apply(state, mutationFromPreview(weather, metadata('storm')))).rejects.toMatchObject({ code: 'weather_acceptance_required' });
  });
});
describe('map fact adapter', () => {
  const query = { provider: 'fixture', mode: 'walking', from: { longitude: 116.4, latitude: 39.9, crs: 'GCJ02' }, to: { longitude: 116.41, latitude: 39.91, crs: 'GCJ02' } } as const;
  it('caches bounded estimates, enforces rate/budget and expires observations using the supplied clock', async () => {
    let instant = Date.parse(source.observedAt);
    const provider = createMapProvider(async () => ({ distanceMeters: 1000, durationSeconds: 900, source: 'synthetic:public-place-fixture' }), () => instant, { maxCalls: 2, minIntervalMs: 1000, ttlMs: 5000, failureTtlMs: 2000 });
    const first = await provider.query(query); expect(first.status).toBe('estimate');
    expect(await provider.query(query)).toEqual(first); expect(provider.callCount).toBe(1);
    expect(await provider.query({ ...query, mode: 'driving' })).toMatchObject({ status: 'unavailable', failureCode: 'rate_limited' });
    instant += 6000; expect((await provider.query(query)).observedAt).not.toBe(first.observedAt);
    instant += 6000; expect(await provider.query(query)).toMatchObject({ status: 'unavailable', failureCode: 'quota_exhausted' });
    expect(provider.callCount).toBe(2);
    expect(mapFactSchema.safeParse({ ...first, key: 'not-a-real-key' }).success).toBe(false);
  });
  it('negative-caches failures and does not persist provider exception text or credentials', async () => {
    let instant = Date.parse(source.observedAt);
    const provider = createMapProvider(async () => { throw new MapProviderError('auth_unavailable'); }, () => instant);
    const failed = await provider.query(query); expect(failed.failureCode).toBe('auth_unavailable');
    await provider.query(query); expect(provider.callCount).toBe(1);
    instant += 61_000; await provider.query(query); expect(provider.callCount).toBe(2);
    await expect(provider.query({ ...query, to: { ...query.to, crs: 'WGS84' } })).rejects.toMatchObject({ code: 'provider_unavailable' });
  });
});


describe('booked dinner operator regression', () => {
  it('blocks default apply, requires precise acknowledgment, preserves booking and supports audited undo', async () => {
    const state = initialize(bookedFixture); const before = structuredClone(state);
    const operation = { ...assign, planId: 'indoor' };
    const blocked = await preview(state, operation, 0);
    expect(blocked).toMatchObject({ canApply: false, reasonCodes: ['booked_plan_displaced', 'constraint_violation'], nextContent: state.content });
    await expect(apply(state, mutationFromPreview(blocked, metadata('unsafe-dinner')))).rejects.toMatchObject({ code: 'constraint_violation' });
    expect(state).toEqual(before);
    const allowed = { ...operation, commitmentChanges: [{ dateId: assign.dateId, planId: 'museum', reason: 'Synthetic user explicitly releases this itinerary commitment, reservation still requires review' }] };
    const next = (await change(state, allowed, 'reviewed-dinner')).state;
    expect(next.content.snapshot.trip.plans[0].bookings![0].status).toBe('done');
    expect(next.content.memory.progress).toEqual([]);
    expect(next.content.snapshot.trip.schedule[assign.dateId]).toEqual({ planId: 'indoor', lodgingId: 'hotel', lodgingLocked: true });
    expect(await inspect(next, 'evaluate_plan')).toMatchObject({ ok: true, data: { risks: [{ code: 'booked_plan_unscheduled' }] } });
    expect((await change(next, { type: 'undo', commitId: 'reviewed-dinner' }, 'restore-dinner')).state.content).toEqual(state.content);
    const confirmed = (await change(state, { type: 'decision', record: { id: 'keep-museum', planId: 'museum', dateId: assign.dateId, disposition: 'confirmed', reason: 'Synthetic user locks the whole plan', source } }, 'confirm-dinner')).state;
    expect(await preview(confirmed, allowed, 1)).toMatchObject({ canApply: false, reasonCodes: ['confirmed_plan_displaced'] });
  });
});

describe('fixed-time activity operator regression', () => {
  const link = { type: 'link_booking_activities', dateId: assign.dateId, planId: 'museum', bookingId: 'dinner-booking', stopIds: ['dinner-stop'], source } as const;
  const edit = { type: 'edit_activity', dateId: assign.dateId, planId: 'museum', stopId: 'afternoon-stop', patch: { title: 'Synthetic indoor afternoon', location: { label: 'Synthetic indoor venue', address: 'Fixture only', query: 'fixture-indoor' }, weatherRelevant: false }, source } as const;
  // Arrays remain mutable input data; operation parsing supplies the canonical shape.
  const bookingLink = { ...link, stopIds: [...link.stopIds] };
  it('uses the existing atomic preview, revision/token binding, idempotency and undo without losing memory', async () => {
    let state = initialize(bookedFixture);
    state = (await change(state, { type: 'issue', record: { id: 'opening', text: 'Check new opening hours', source } }, 'opening')).state;
    state = (await change(state, { type: 'preference', record: { id: 'pace', text: 'Less walking, soft preference only', source } }, 'pace')).state;
    const before = structuredClone(state);
    const blocked = await preview(state, edit, state.revision);
    expect(blocked).toMatchObject({ canApply: false, reasonCodes: ['booking_activity_link_required'], nextContent: before.content });
    await expect(apply(state, mutationFromPreview(blocked, metadata('unlinked-edit')))).rejects.toMatchObject({ code: 'constraint_violation' });
    expect(state).toEqual(before);
    const binding = await change(state, bookingLink, 'link-dinner'); state = binding.state;
    const proposal = await preview(state, edit, state.revision); const request = mutationFromPreview(proposal, metadata('edit-afternoon'));
    expect(proposal.canApply).toBe(true);
    await expect(apply(state, { ...request, previewToken: `sha256:${'0'.repeat(64)}` })).rejects.toMatchObject({ code: 'stale_preview' });
    const applied = await apply(state, request); state = applied.state;
    expect(state.content.snapshot.trip.plans[0].stops![1]).toMatchObject({ id: 'afternoon-stop', time: '14:00', ...edit.patch });
    expect(state.content.snapshot.trip.plans[0].stops![0]).toEqual(before.content.snapshot.trip.plans[0].stops![0]);
    expect(state.content.snapshot.trip.plans[0].stops![2]).toEqual(before.content.snapshot.trip.plans[0].stops![2]);
    expect(state.content.snapshot.trip.schedule).toEqual(before.content.snapshot.trip.schedule);
    expect(state.content.memory).toEqual(before.content.memory);
    expect(state.history.at(-1)).toMatchObject({ operation: edit, actor: 'synthetic-operator', reason: 'Explicit synthetic test instruction', at: source.observedAt });
    expect((await apply(state, request)).receipt.replayed).toBe(true);
    await expect(apply(state, { ...request, idempotencyKey: 'race-edit' })).rejects.toMatchObject({ code: 'revision_conflict' });
    const dinner = await preview(state, { ...edit, stopId: 'dinner-stop' }, state.revision);
    expect(dinner.canApply).toBe(false); expect(dinner.reasonCodes).toContain('booked_activity_locked');
    await expect(apply(state, mutationFromPreview(dinner, metadata('unsafe-linked-dinner')))).rejects.toMatchObject({ code: 'constraint_violation' });
    state = (await change(state, { type: 'undo', commitId: 'edit-afternoon' }, 'undo-afternoon')).state;
    expect(state.content).toEqual(binding.state.content); expect(state.revision).toBe(5);
    const oldUndo = await change(state, { type: 'undo', commitId: 'undo-afternoon' }, 'redo-afternoon');
    expect(oldUndo.state.content).toEqual(applied.state.content); expect(parseState(oldUndo.state).history).toHaveLength(6);
  });
  it('retains confirmed whole-plan and completed-progress protection after linking the dinner', async () => {
    let state = (await change(initialize(bookedFixture), bookingLink, 'link')).state;
    state = (await change(state, { type: 'decision', record: { id: 'whole-day', planId: 'museum', dateId: assign.dateId, disposition: 'confirmed', reason: 'Keep the whole day', source } }, 'confirm')).state;
    expect(await preview(state, edit, state.revision)).toMatchObject({ canApply: false, reasonCodes: ['confirmed_plan_change'], nextContent: state.content });
    state = (await change(state, { type: 'decision', record: { id: 'release-whole-day', planId: 'museum', dateId: assign.dateId, disposition: 'withdrawn', reason: 'User explicitly releases whole-day confirmation', source } }, 'release')).state;
    expect((await preview(state, edit, state.revision)).canApply).toBe(true);
    state = (await change(state, { type: 'progress', record: { id: 'completed', planId: 'museum', dateId: assign.dateId, status: 'done', reason: 'Explicit actual completion', source } }, 'completed')).state;
    expect(await preview(state, edit, state.revision)).toMatchObject({ canApply: false, reasonCodes: ['completed_plan_change'] });
  });
  it('requires existing explicit weather acceptance, and accepts old history unchanged', async () => {
    const old = (await change(initialize(bookedFixture), { type: 'issue', record: { id: 'legacy', text: 'Existing issue', source } }, 'legacy-event')).state;
    expect(parseState(JSON.parse(JSON.stringify(old)))).toEqual(old);
    const snapshot = structuredClone(bookedFixture); snapshot.weatherData.fixture.dailyByDate['2026-10-11'].weatherCode = 95;
    const linked = (await change(initialize(snapshot), bookingLink, 'link-storm')).state;
    const stormEdit = { ...edit, patch: { note: 'Only an activity note changes' } };
    const proposal = await preview(linked, stormEdit, linked.revision);
    expect(proposal).toMatchObject({ canApply: true, weatherOverride: true });
    const request = mutationFromPreview(proposal, metadata('storm-edit'));
    await expect(apply(linked, request)).rejects.toMatchObject({ code: 'weather_acceptance_required' });
    expect((await apply(linked, { ...request, acceptWeatherRisk: true })).state.revision).toBe(2);
  });
});

it('retains route observations as unassociated evidence when an activity location changes', async () => {
  const fact = mapFactSchema.parse({ id: 'old-route', query: { provider: 'fixture', mode: 'walking', from: { longitude: 116.4, latitude: 39.9, crs: 'GCJ02' }, to: { longitude: 116.41, latitude: 39.91, crs: 'GCJ02' } }, source: 'synthetic:old-route', observedAt: source.observedAt, expiresAt: '2026-10-02T12:05:00Z', status: 'estimate', distanceMeters: 1000, durationSeconds: 900, uncertainty: 'Fixture estimate only' });
  let state = (await change(initialize(bookedFixture), { type: 'map_fact', fact }, 'old-route')).state;
  state = (await change(state, { type: 'link_booking_activities', dateId: assign.dateId, planId: 'museum', bookingId: 'dinner-booking', stopIds: ['dinner-stop'], source }, 'link-route-dinner')).state;
  const proposal = await preview(state, { type: 'edit_activity', dateId: assign.dateId, planId: 'museum', stopId: 'afternoon-stop', source, patch: { location: { label: 'New fixture venue', address: 'Fixture only' } } }, state.revision);
  expect(proposal.detail).toMatchObject({ unassociatedMapFactIds: ['old-route'] });
  expect(proposal.nextContent.memory.mapFacts).toEqual([fact]);
  expect((await apply(state, mutationFromPreview(proposal, metadata('edit-route-location')))).state.content.memory.mapFacts).toEqual([fact]);
});

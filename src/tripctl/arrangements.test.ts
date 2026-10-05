import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/arrangement-scenario.json';
import { initialize, preview, apply, mutationFromPreview, canonical, hash, parseState, operationSchema, type TripState } from './index';
import { exportPresentationView } from './presentation';
import { presentationOutputSchema, presentationOutputV2Schema } from './presentationSchema';
import { exportTripDisplay, lodgingToken } from './arrangements';
import { analyseCapacity } from './capacity';
const query = { asOf: fixture.asOf, generatedAt: fixture.generatedAt, view: { basis: 'corrected_as_of' } };
const save = async (s: TripState, op: unknown, id: string) => (await apply(s, mutationFromPreview(await preview(s, op, s.revision), { idempotencyKey: id, actor: 'synthetic', reason: 'Explicit synthetic reconciliation', at: fixture.asOf }))).state;
async function scenario() {
  let s = await save(initialize(fixture.snapshot), fixture.importOperation, 'import');
  for (const [n, op] of fixture.preparationOperations.entries()) s = await save(s, op, 'report-' + n);
  return s;
}
const clone = () => structuredClone(fixture.operation);
const later = '2033-10-05T11:00:00+08:00';
describe('canonical arrangement reconciliation', () => {
  it('maps three hotels in one event, retains raw fields and original prose, and leaves schedule/baseline/actual untouched', async () => {
    const s = await scenario(); const before = canonical(s); const p = await preview(s, fixture.operation, s.revision);
    expect(p.canApply).toBe(true); expect(canonical(s)).toBe(before);
    const next = await save(s, fixture.operation, 'reconcile');
    expect(next.revision).toBe(s.revision + 1); expect(next.content.itinerary).toEqual(s.content.itinerary);
    expect(next.content.snapshot.trip.schedule).toEqual(s.content.snapshot.trip.schedule);
    expect(next.content.snapshot.trip.name).toEqual(s.content.snapshot.trip.name);
    expect(next.content.snapshot.trip.lodgings.find((l) => l.id === 'city-night')?.opaqueHotelField).toEqual({ keep: 'hotel-extension' });
    expect(next.content.snapshot.trip.lodgings.find((l) => l.id === 'next-night')?.reservations?.[0].opaqueReservationField).toEqual({ keep: 'reservation-extension' });
    expect(parseState(JSON.parse(JSON.stringify(next)))).toEqual(next);
    expect(analyseCapacity(next).serializedStateBytes).toBe(Buffer.byteLength(JSON.stringify(next, null, 2) + '\n'));
  });
  it('exports explicit name-index metadata separately and keeps adapter unknown fields untouched', async () => {
    const sourceAdapters = canonical(fixture.sourceAdapters); const s = await scenario();
    const old = exportTripDisplay(s); expect(old.basis).toBe('snapshot_name_only'); expect(old.year).toBeNull();
    const next = await save(s, fixture.operation, 'reconcile'); const p = await exportPresentationView(next, { ...query, contractVersion: 2 });
    expect(p.presentationContractVersion).toBe(2); if (p.presentationContractVersion !== 2) throw new Error('v2 required');
    expect(p.tripDisplayMetadata).toMatchObject({ tripId: s.content.snapshot.trip.id, displayName: 'Anonymous autumn journey', year: 2033, month: 10, metadataVersion: 1 });
    expect(p.presentationCatalog).toHaveProperty('items'); expect(p.presentationCatalog).not.toHaveProperty('entries');
    expect(p.adapterReplacement).toMatchObject({ automatic: false, preserveUnknownFields: true, requiresHostEquivalenceCheck: true });
    expect(canonical(fixture.sourceAdapters)).toBe(sourceAdapters);
  });
  it('reports unmapped commitments before explicit binding and exact stay nights afterwards', async () => {
    const s = await scenario(); const before = await exportPresentationView(s, { ...query, contractVersion: 2 });
    if (before.presentationContractVersion !== 2) throw new Error('v2 required');
    expect(before.reservationCommitmentCoverage.every((r) => r.status === 'unmapped')).toBe(true);
    expect(before.nightDatedLodgingArrangements.some((r) => r.lodgingId === 'hotel-a')).toBe(false);
    const after = await exportPresentationView(await save(s, fixture.operation, 'reconcile'), { ...query, contractVersion: 2 });
    if (after.presentationContractVersion !== 2) throw new Error('v2 required');
    expect(after.nightDatedLodgingArrangements.filter((n) => n.lodgingId === 'hotel-a')).toMatchObject([{ nightDate: '2033-10-04', reservationId: 'stay-a', status: 'reservation_reported', liveStatusVerified: false }]);
    const c = after.reservationCommitmentCoverage.find((r) => r.commitmentId === 'reservation-hotel-a-night-20331004')!;
    expect(c.status).toBe('explicitly_mapped'); expect(c.matches[0]).toMatchObject({ checkInStatus: 'unknown', paymentStatus: 'unknown' });
    expect(after.pendingQuestions.some((q) => q.code === 'reservation_commitment_unmapped')).toBe(true);
    expect(presentationOutputV2Schema.safeParse(after).success).toBe(true);
  });
  it('keeps default v1 output and reconstructs historical prefix without later mappings', async () => {
    const before = await scenario(); const next = await save(before, fixture.operation, 'reconcile');
    const p = await exportPresentationView(next, query); expect(presentationOutputSchema.safeParse(p).success).toBe(true); expect(p).not.toHaveProperty('tripDisplayMetadata');
    const historical = await exportPresentationView(next, { ...query, contractVersion: 2, view: { basis: 'as_recorded', revision: before.revision } });
    if (historical.presentationContractVersion !== 2) throw new Error('v2 required');
    expect(historical.tripDisplayMetadata.metadataVersion).toBe(0); expect(historical.reservationCommitmentCoverage.every((c) => c.status === 'unmapped')).toBe(true);
    expect(historical.source.authorityRevision).toBe(next.revision); expect(historical.source.projectedRevision).toBe(before.revision);
  });
  it.each([
    ['unknown commitment', (op: ReturnType<typeof clone>) => { op.lodgings.changes[0].reservations[0].commitmentIds = ['unknown']; }, 'reservation_commitment_mismatch'],
    ['wrong night', (op: ReturnType<typeof clone>) => { op.lodgings.changes[0].reservations[0].checkIn = '2033-10-05'; op.lodgings.changes[0].reservations[0].checkOut = '2033-10-06'; }, 'reservation_commitment_mismatch'],
    ['existing hotel creation', (op: ReturnType<typeof clone>) => { op.lodgings.changes[1].expectedLodgingToken = null; }, 'lodging_token_conflict'],
    ['duplicate hotel', (op: ReturnType<typeof clone>) => { op.lodgings.changes.push(op.lodgings.changes[0]); }, 'duplicate_id'],
    ['reservation reuse', (op: ReturnType<typeof clone>) => { op.lodgings.changes[0].reservations[0].id = 'stay-c'; }, 'reservation_identity_conflict'],
    ['provider intent', (op: ReturnType<typeof clone>) => { op.lodgings.source.kind = 'provider'; }, 'unconfirmed_arrangement'],
    ['source before report', (op: ReturnType<typeof clone>) => { op.lodgings.source.observedAt = '2033-10-01T10:00:00+08:00'; }, 'future_arrangement_source'],
    ['unknown route', (op: ReturnType<typeof clone>) => { op.dayRoutes[2].entries[0].activity.contextId = 'absent'; }, 'route_context_mismatch'],
  ])('atomically rejects %s without modifying source state', async (_name, mutate, code) => {
    const s = await scenario(); const prior = hash(s); const op = clone(); mutate(op);
    await expect(preview(s, op, s.revision)).rejects.toMatchObject({ code }); expect(hash(s)).toBe(prior);
  });
  it('rejects duplicate commitment associations across hotels without a partial write', async () => {
    const s = await scenario(); const op = clone(); op.lodgings.changes[1].reservations[0] = { ...op.lodgings.changes[0].reservations[0], id: 'other-order' };
    await expect(preview(s, op, s.revision)).rejects.toMatchObject({ code: 'reservation_commitment_conflict' });
  });
  it('requires correction reason/new original evidence and preserves extension fields on reservation correction', async () => {
    const s = await save(await scenario(), fixture.operation, 'reconcile'); const hotel = s.content.snapshot.trip.lodgings.find((l) => l.id === 'next-night')!;
    const change = structuredClone(fixture.operation.lodgings.changes[2]); change.expectedLodgingToken = lodgingToken(hotel); change.reservations[0].status = 'cancelled';
    const op = { type: 'upsert_lodging_arrangements', changes: [change], source: { ...fixture.operation.lodgings.source, observedAt: later }, confirmation: 'explicit' };
    await expect(preview(s, op, s.revision)).rejects.toMatchObject({ code: 'arrangement_correction_required' });
    Object.assign(change.reservations[0], { correctionReason: 'Explicit report corrects cancellation status' });
    await expect(preview(s, op, s.revision)).rejects.toMatchObject({ code: 'stale_arrangement_source' });
    change.reservations[0].source.observedAt = later;
    const next = await save(s, op, 'correct'); expect(next.content.snapshot.trip.lodgings.find((l) => l.id === 'next-night')!.reservations![0]).toMatchObject({ status: 'cancelled', opaqueReservationField: { keep: 'reservation-extension' } });
    const p = await exportPresentationView(next, { ...query, contractVersion: 2 }); expect(p.nightDatedLodgingArrangements.find((n) => n.reservationId === 'stay-c')).toMatchObject({ status: 'cancelled', active: false });
  });
  it('retains composite source watermarks and reservation ownership after undo', async () => {
    const base = await scenario(); const operation = { type: 'reconcile_journey_context', lodgings: fixture.operation.lodgings, confirmation: 'explicit' };
    const saved = await save(base, operation, 'lodgings'); const undone = await save(saved, { type: 'undo', commitId: 'lodgings' }, 'undo-lodgings');
    await expect(preview(undone, { type: 'upsert_lodging_arrangements', ...fixture.operation.lodgings }, undone.revision)).rejects.toMatchObject({ code: 'stale_arrangement_source' });
    const newer = structuredClone(fixture.operation.lodgings); newer.source.observedAt = later; newer.changes = [newer.changes[0]]; newer.changes[0].lodgingId = 'other-hotel';
    await expect(preview(undone, { type: 'upsert_lodging_arrangements', ...newer }, undone.revision)).rejects.toMatchObject({ code: 'reservation_identity_conflict' });
  });
  it('undo restores metadata absence while retaining composite evidence watermark', async () => {
    const base = await scenario(); const s = await save(base, { type: 'reconcile_journey_context', displayMetadata: fixture.operation.displayMetadata, confirmation: 'explicit' }, 'name');
    const undone = await save(s, { type: 'undo', commitId: 'name' }, 'undo-name'); expect(undone.content).not.toHaveProperty('displayMetadata');
    await expect(preview(undone, { type: 'set_trip_display_metadata', ...fixture.operation.displayMetadata }, undone.revision)).rejects.toMatchObject({ code: 'stale_display_metadata' });
  });
  it('keeps idempotency/revision/hash guards on the whole composite', async () => {
    const s = await scenario(); const p = await preview(s, fixture.operation, s.revision); const request = mutationFromPreview(p, { idempotencyKey: 'whole', actor: 'synthetic', reason: 'explicit', at: fixture.asOf });
    const next = await apply(s, request); expect((await apply(next.state, request)).receipt.replayed).toBe(true);
    await expect(apply(next.state, { ...request, idempotencyKey: 'second' })).rejects.toMatchObject({ code: 'revision_conflict' });
    await expect(apply(s, { ...request, previewToken: hash('stale') })).rejects.toMatchObject({ code: 'stale_preview' });
    expect(operationSchema.safeParse({ ...fixture.operation, automaticProviderWrite: true }).success).toBe(false);
  });
  it('keeps original reservation source watermark across cancellation and undo', async () => {
    let s = await save(await scenario(), fixture.operation, 'reconcile');
    const change = structuredClone(fixture.operation.lodgings.changes[0]);
    change.expectedLodgingToken = lodgingToken(s.content.snapshot.trip.lodgings.find((l) => l.id === 'hotel-a')!);
    Object.assign(change.reservations[0], { status: 'cancelled', correctionReason: 'Later explicit cancellation', source: { ...change.reservations[0].source, observedAt: '2033-10-05T10:30:00+08:00' } });
    const op = { type: 'upsert_lodging_arrangements', changes: [change], confirmation: 'explicit', source: { ...fixture.operation.lodgings.source, observedAt: later } };
    s = await save(s, op, 'cancel'); s = await save(s, { type: 'undo', commitId: 'cancel' }, 'undo-cancel');
    op.source.observedAt = '2033-10-05T11:30:00+08:00'; change.reservations[0].source.observedAt = '2033-10-05T10:15:00+08:00';
    await expect(preview(s, op, s.revision)).rejects.toMatchObject({ code: 'stale_arrangement_source' });
  });
  it('does not combine a changed address with stale navigation coordinates', async () => {
    const snap = structuredClone(fixture.snapshot); Object.assign(snap.trip.lodgings[0], { location: { address: 'Old address', mapPoint: { latitude: 1, longitude: 2 }, other: 'preserve' } });
    const s = initialize(snap); const hotel = s.content.snapshot.trip.lodgings[0];
    const op = { type: 'upsert_lodging_arrangements', confirmation: 'explicit', source: fixture.operation.lodgings.source, changes: [{ lodgingId: hotel.id, expectedLodgingToken: lodgingToken(hotel), location: { address: 'New address' }, reservations: [] }] };
    await expect(preview(s, op, 0)).rejects.toMatchObject({ code: 'lodging_location_rebind_required' });
  });
  it('accepts legal legacy Unicode journey/hotel/reservation IDs and permits metadata-only archived undo', async () => {
    const snap = structuredClone(fixture.snapshot); snap.trip.id = '匿名旅程 2033'; snap.trip.lodgings = [];
    let s = initialize(snap); const c = structuredClone(fixture.operation.lodgings.changes[0]); c.lodgingId = '酒店 A'; c.reservations[0].id = '预订 A'; c.reservations[0].commitmentIds = [];
    s = await save(s, { type: 'upsert_lodging_arrangements', ...fixture.operation.lodgings, changes: [c] }, 'unicode');
    expect(exportTripDisplay(s).tripId).toBe(snap.trip.id); expect((await exportPresentationView(s, { ...query, contractVersion: 2 })).source.journeyId).toBe(snap.trip.id);
    const archived = initialize({ ...snap, trip: { ...snap.trip, archived: true } });
    const named = await save(archived, { type: 'reconcile_journey_context', displayMetadata: fixture.operation.displayMetadata, confirmation: 'explicit' }, 'archive-name');
    expect((await save(named, { type: 'undo', commitId: 'archive-name' }, 'undo-name')).content).not.toHaveProperty('displayMetadata');
  });
  it('rejects forged persisted reservation semantics and mixed v2 identity/coverage', async () => {
    const next = await save(await scenario(), fixture.operation, 'reconcile');
    const bad = structuredClone(next.content); const row = bad.snapshot.trip.lodgings.find((l) => l.id === 'hotel-a')!.reservations![0]; row.checkIn = '2034-01-01'; row.checkOut = '2034-01-02';
    expect(() => parseState({ schemaVersion: 1, revision: 0, content: bad, history: [] })).toThrow();
    const p = await exportPresentationView(next, { ...query, contractVersion: 2 }); if (p.presentationContractVersion !== 2) throw new Error('v2 required');
    for (const mutate of [
      (v: typeof p) => { v.tripDisplayMetadata.sourceRevision++; },
      (v: typeof p) => { v.tripDisplayMetadata.tripId = 'different'; },
      (v: typeof p) => { v.reservationCommitmentCoverage[0].matches[0].nightRefs = ['unknown']; },
      (v: typeof p) => { v.reservationCommitmentCoverage[0].status = 'unmapped'; },
      (v: typeof p) => { v.routeActivityContexts[0].actualReportId = 'unknown'; },
    ]) { const copy = structuredClone(p); mutate(copy); expect(presentationOutputV2Schema.safeParse(copy).success).toBe(false); }
  });

});

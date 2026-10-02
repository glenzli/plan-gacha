import { describe, it, expect, vi } from 'vitest';
import fixture from '../../fixtures/booked-day.snapshot.json';
import { planningSnapshotSchema } from '../domain/planningTools';
import { prepareWalkingQuery, importWalkingObservation, assessWalkingFact, inspectWalkingRoutes, parseWalkingDescriptor, walkingResponseSchema } from './routeEvidence';
import { initialize, preview, apply, mutationFromPreview } from './engine';
import { mapFactSchema } from './mapFacts';
const asOf = '2026-10-02T12:00:00Z';
const source = { kind: 'synthetic' as const, reference: 'synthetic:route-contract', observedAt: asOf };
function snapshot() {
  const result = planningSnapshotSchema.parse(structuredClone(fixture));
  result.trip.plans[0].stops = ['morning-stop', 'afternoon-stop', 'dinner-stop'].map((id, index) => ({ id, title: `Public fixture ${index}`, time: ['10:00', '14:00', '18:30'][index], location: { label: `Public fixture ${index}`, address: `Fixture address ${index}`, map_point: { longitude: 116.434307 + index * 0.000139, latitude: 39.90909 - index * 0.00093, coordinate_system: 'GCJ-02' } } }));
  return result;
}
const request = { dateId: '2026-10-11', planId: 'museum', fromStopId: 'morning-stop', toStopId: 'afternoon-stop', asOf, ttlSeconds: 120 };
function captured(descriptor: ReturnType<typeof prepareWalkingQuery>, live = false) {
  return { schemaVersion: 1, requestHash: descriptor.requestHash, query: descriptor.query, observedAt: asOf, captureKind: live ? 'live' : 'fixture', ok: true, httpStatus: 200, infocode: '10000', estimate: { distanceMeters: 120, durationSeconds: 90 } };
}
async function observation(current = snapshot(), live = true) {
  const descriptor = prepareWalkingQuery(current, request);
  return importWalkingObservation(descriptor, captured(descriptor, live));
}
const metadata = (key: string) => ({ idempotencyKey: key, actor: 'fixture-operator', reason: 'Explicit route fixture instruction', at: asOf });
describe('activity-bound walking observations', () => {
  it('captures GCJ02 endpoint content identities and reuses the bounded mapFact adapter', async () => {
    const current = snapshot(); const before = structuredClone(current);
    const descriptor = prepareWalkingQuery(current, request);
    expect(descriptor.query).toMatchObject({ provider: 'amap', mode: 'walking', from: { crs: 'GCJ02', longitude: 116.434307 } });
    expect(descriptor.binding).toMatchObject({ tripId: current.trip.id, dateId: request.dateId, planId: 'museum', fromStopId: request.fromStopId, toStopId: request.toStopId, fromContentToken: expect.stringMatching(/^sha256:/) });
    const fact = await importWalkingObservation(descriptor, captured(descriptor));
    expect(fact).toMatchObject({ status: 'estimate', distanceMeters: 120, durationSeconds: 90, binding: descriptor.binding, source: 'fixture:amap-walking', observedAt: '2026-10-02T12:00:00.000Z', expiresAt: '2026-10-02T12:02:00.000Z' });
    expect(assessWalkingFact(current, fact, asOf)).toMatchObject({ status: 'fresh_estimate', synthetic: true, canUseForComparison: false, feasibility: 'not_proven' });
    expect(current).toEqual(before);
  });
  it('does not use an old observation after only the address changes, even when coordinates stay equal', async () => {
    const current = snapshot(); const fact = await observation(current);
    expect(assessWalkingFact(current, fact, asOf)).toMatchObject({ status: 'fresh_estimate', canUseForComparison: true, feasibility: 'not_proven' });
    const stop = current.trip.plans[0].stops![1] as Exclude<NonNullable<typeof current.trip.plans[number]['stops']>[number], string>;
    stop.location = { ...(stop.location as object), address: 'New address, same coordinates' };
    const assessment = assessWalkingFact(current, fact, asOf);
    expect(assessment).toMatchObject({ status: 'mismatch', canUseForComparison: false });
    expect(assessment.reasonCodes).toContain('endpoint_changed');
    expect(prepareWalkingQuery(current, request).binding.toContentToken).not.toBe(fact.binding!.toContentToken);
  });
  it('rejects changed coordinates, swapped endpoints and another journey identity as evidence', async () => {
    const current = snapshot(); const fact = await observation(current);
    const changed = structuredClone(fact); changed.query.to.longitude += 0.001;
    expect(assessWalkingFact(current, changed, asOf).reasonCodes).toContain('query_endpoint_mismatch');
    const reversed = structuredClone(fact); reversed.binding!.fromStopId = 'afternoon-stop'; reversed.binding!.toStopId = 'morning-stop';
    expect(assessWalkingFact(current, reversed, asOf)).toMatchObject({ status: 'mismatch', canUseForComparison: false });
    const other = structuredClone(fact); other.binding!.tripId = 'another-journey';
    expect(assessWalkingFact(current, other, asOf).reasonCodes).toContain('unknown_binding_reference');
  });
  it('evaluates freshness against explicit asOf and never marks feasibility proven', async () => {
    const current = snapshot(); const fact = await observation(current);
    expect(assessWalkingFact(current, fact, '2026-10-02T12:02:00Z')).toMatchObject({ status: 'stale', canUseForComparison: false, feasibility: 'not_proven' });
    expect(assessWalkingFact(current, fact, '2026-10-02T11:59:59Z')).toMatchObject({ status: 'unknown', reasonCodes: ['observation_in_future'], canUseForComparison: false });
    expect(() => assessWalkingFact(current, fact, 'yesterday')).toThrowError('Route input schema is invalid');
    const legacy = structuredClone(fact); delete legacy.binding;
    expect(mapFactSchema.safeParse(legacy).success).toBe(true);
    expect(assessWalkingFact(current, legacy, asOf)).toMatchObject({ status: 'unknown', reasonCodes: ['unassociated_route'], canUseForComparison: false });
  });
  it('retains bounded errors and does not fall back to an older successful observation', async () => {
    const current = snapshot(); const descriptor = prepareWalkingQuery(current, request); const good = await observation(current);
    const failed = await importWalkingObservation(descriptor, { schemaVersion: 1, requestHash: descriptor.requestHash, query: descriptor.query, observedAt: '2026-10-02T12:00:01Z', captureKind: 'live', ok: false, httpStatus: 200, infocode: '10003', failureCode: 'quota_exhausted' });
    expect(failed).toMatchObject({ status: 'unavailable', failureCode: 'quota_exhausted' });
    const result = inspectWalkingRoutes(current, [good, failed], { dateId: request.dateId, planId: request.planId, asOf: '2026-10-02T12:00:02Z' });
    expect(result.legs[0]).toMatchObject({ status: 'unavailable', canUseForComparison: false });
    expect(result.legs[1]).toMatchObject({ status: 'unknown', reasonCodes: ['route_observation_missing'], canUseForComparison: false });
    expect(result).toMatchObject({ allLegsHaveUsableEstimates: false, feasibility: 'not_proven' });
  });
  it('reports complete fresh coverage separately from schedule feasibility', async () => {
    const current = snapshot(); const first = await observation(current);
    const secondDescriptor = prepareWalkingQuery(current, { ...request, fromStopId: 'afternoon-stop', toStopId: 'dinner-stop' });
    const second = await importWalkingObservation(secondDescriptor, captured(secondDescriptor, true));
    const result = inspectWalkingRoutes(current, [first, second], { dateId: request.dateId, planId: request.planId, asOf });
    expect(result).toMatchObject({ allLegsHaveUsableEstimates: true, feasibility: 'not_proven' });
    expect(first.id).not.toBe(second.id);
  });
  it.each([{ fromStopId: 'missing' }, { toStopId: 'dinner-stop' }, { dateId: '2026-10-15' }, { dateId: '2026-10-10' }, { asOf: 'yesterday' }, { ttlSeconds: 301 }])('rejects an inadmissible readonly request before transport: %j', (patch) => {
    expect(() => prepareWalkingQuery(snapshot(), { ...request, ...patch })).toThrow();
  });
  it('requires stable activity IDs and explicit GCJ02 coordinates without implicit conversion', () => {
    const current = snapshot(); current.trip.plans[0].stops![1] = 'Legacy positional stop';
    expect(() => prepareWalkingQuery(current, request)).toThrowError('Routes require explicit unique activity IDs');
    const missing = snapshot(); (missing.trip.plans[0].stops![1] as { location?: unknown }).location = { label: 'Unlocated venue', address: 'Unverified' };
    expect(() => prepareWalkingQuery(missing, request)).toThrowError('Both activities need explicit GCJ02');
    const wgs = snapshot(); (wgs.trip.plans[0].stops![1] as { location?: unknown }).location = { map_point: { longitude: 116.434446, latitude: 39.90816, coordinate_system: 'WGS84' } };
    expect(() => prepareWalkingQuery(wgs, request)).toThrowError('Both activities need explicit GCJ02');
  });
  it('rejects tampered descriptors, wrong response identities and missing/negative numeric results', async () => {
    const descriptor = prepareWalkingQuery(snapshot(), request);
    expect(() => parseWalkingDescriptor({ ...descriptor, ttlSeconds: 121 })).toThrowError('Route descriptor content does not match');
    await expect(importWalkingObservation(descriptor, { ...captured(descriptor), requestHash: `sha256:${'0'.repeat(64)}` })).rejects.toMatchObject({ code: 'route_response_mismatch' });
    await expect(importWalkingObservation(descriptor, { ...captured(descriptor), query: { ...descriptor.query, to: { ...descriptor.query.to, longitude: 1 } } })).rejects.toMatchObject({ code: 'route_response_mismatch' });
    await expect(importWalkingObservation(descriptor, { ...captured(descriptor), observedAt: '2026-10-02T11:59:59Z' })).rejects.toMatchObject({ code: 'route_observation_before_request' });
    for (const estimate of [{ distanceMeters: 120 }, { distanceMeters: -1, durationSeconds: 90 }, { distanceMeters: 120, durationSeconds: Number.NaN }]) expect(walkingResponseSchema.safeParse({ ...captured(descriptor), estimate }).success).toBe(false);
    await expect(importWalkingObservation(descriptor, { ...captured(descriptor), infocode: '10001' })).rejects.toMatchObject({ code: 'invalid_route_response' });
  });
  it('uses existing preview/CAS/audit/undo, refuses mismatching bound writes, and retains facts after edits', async () => {
    const current = snapshot(); const fact = await observation(current); let state = initialize(current);
    const original = structuredClone(state); const descriptor = prepareWalkingQuery(current, request);
    const proposal = await preview(state, { type: 'map_fact', fact }, 0);
    expect(proposal.detail).toMatchObject({ kind: 'route_observation', assessment: { status: 'fresh_estimate', feasibility: 'not_proven' } });
    const mutation = mutationFromPreview(proposal, metadata('record-route')); state = (await apply(state, mutation)).state;
    expect(state.content.snapshot).toEqual(original.content.snapshot);
    expect((await apply(state, mutation)).receipt.replayed).toBe(true);
    await expect(apply(state, { ...mutation, idempotencyKey: 'route-race' })).rejects.toMatchObject({ code: 'revision_conflict' });
    const mismatched = structuredClone(fact); mismatched.id = 'bad-route'; mismatched.binding!.toContentToken = `sha256:${'0'.repeat(64)}`;
    const blocked = await preview(state, { type: 'map_fact', fact: mismatched }, 1);
    expect(blocked).toMatchObject({ canApply: false, reasonCodes: ['route_binding_mismatch'], nextContent: state.content });
    await expect(apply(state, mutationFromPreview(blocked, metadata('bad-route')))).rejects.toMatchObject({ code: 'constraint_violation' });
    const undo = await preview(state, { type: 'undo', commitId: 'record-route' }, 1);
    expect((await apply(state, mutationFromPreview(undo, metadata('undo-route')))).state.content).toEqual(original.content);
    const link = await preview(state, { type: 'link_booking_activities', dateId: request.dateId, planId: request.planId, bookingId: 'dinner-booking', stopIds: ['dinner-stop'], source }, 1);
    state = (await apply(state, mutationFromPreview(link, metadata('link-route')))).state;
    const edit = await preview(state, { type: 'edit_activity', dateId: request.dateId, planId: request.planId, stopId: request.toStopId, source, patch: { location: { label: 'Changed fixture venue', address: 'Changed address' } } }, 2);
    state = (await apply(state, mutationFromPreview(edit, metadata('edit-after-route')))).state;
    expect(state.content.memory.mapFacts).toEqual([fact]);
    expect(assessWalkingFact(state.content.snapshot, fact, asOf)).toMatchObject({ status: 'mismatch', canUseForComparison: false });
    await expect(importWalkingObservation(descriptor, { ...captured(descriptor), diagnostics: { attemptedCalls: 2 } })).rejects.toMatchObject({ code: 'invalid_route_response' });
  });
  it('is deterministic and performs no implicit clock, ID generation, network or writes', async () => {
    const current = snapshot(); const descriptor = prepareWalkingQuery(current, request); const fact = await observation(current);
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Implicit time'); });
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Implicit ID'); });
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('Implicit network'); });
    try {
      expect(prepareWalkingQuery(current, request)).toEqual(descriptor);
      expect(await importWalkingObservation(descriptor, captured(descriptor))).toEqual(await importWalkingObservation(descriptor, captured(descriptor)));
      expect(assessWalkingFact(current, fact, asOf)).toEqual(assessWalkingFact(current, fact, asOf));
    } finally { clock.mockRestore(); random.mockRestore(); network.mockRestore(); }
  });
});

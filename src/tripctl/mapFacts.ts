import * as z from 'zod/v4';
import { planningSnapshotSchema } from '../domain/planningTools';
const id = planningSnapshotSchema.shape.trip.shape.id;
const token = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const routeBindingSchema = z.strictObject({ tripId: id, dateId: planningSnapshotSchema.shape.todayId, planId: id, fromStopId: id, toStopId: id, fromContentToken: token, toContentToken: token });
export const mapFailureSchema = z.enum(['rate_limited', 'quota_exhausted', 'auth_unavailable', 'provider_unavailable']);
const point = z.strictObject({ longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90), crs: z.enum(['GCJ02', 'WGS84']) });
export const mapQuerySchema = z.strictObject({ provider: z.enum(['amap', 'fixture']), mode: z.enum(['walking', 'driving', 'transit']), from: point, to: point });
export const mapFactSchema = z.strictObject({
  id: z.string().min(1).max(160), query: mapQuerySchema, binding: routeBindingSchema.optional(),
  source: z.string().min(1).max(500), observedAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }),
  status: z.enum(['estimate', 'unavailable']), distanceMeters: z.number().nonnegative().optional(), durationSeconds: z.number().nonnegative().optional(),
  uncertainty: z.string().min(1).max(2000), failureCode: mapFailureSchema.optional(),
}).refine((x) => Date.parse(x.expiresAt) > Date.parse(x.observedAt), 'Fact expiry must follow observation')
  .refine((x) => x.status !== 'estimate' || x.distanceMeters !== undefined && x.durationSeconds !== undefined, 'An estimate needs distance and duration')
  .refine((x) => x.status !== 'unavailable' || x.failureCode !== undefined, 'Unavailable facts need a bounded failure code')
  .refine((x) => x.query.from.crs === x.query.to.crs, 'Coordinate systems must agree; conversion is explicit');
export type MapQuery = z.infer<typeof mapQuerySchema>;
export type MapFact = z.infer<typeof mapFactSchema>;
export class MapProviderError extends Error { constructor(readonly code: NonNullable<MapFact['failureCode']>) { super(code); } }
/** No credentials or fetch policy here. A caller supplies an approved transport; fixtures use the same contract. */
export function createMapProvider(transport: (query: MapQuery) => Promise<{ distanceMeters: number; durationSeconds: number; source: string }>, now: () => number,
  policy = { maxCalls: 3, minIntervalMs: 1000, ttlMs: 300_000, failureTtlMs: 60_000 }) {
  const cache = new Map<string, MapFact>();
  let calls = 0; let observations = 0; let lastCall = -Infinity;
  return { async query(input: unknown): Promise<MapFact> {
    const query = mapQuerySchema.parse(input);
    if (query.from.crs !== query.to.crs) throw new MapProviderError('provider_unavailable');
    const key = JSON.stringify(query); const instant = now(); const existing = cache.get(key);
    if (existing && Date.parse(existing.expiresAt) > instant) return structuredClone(existing);
    const base = { id: `map-${instant}-${++observations}`, query, source: `${query.provider}:approved-adapter`, observedAt: new Date(instant).toISOString(), uncertainty: 'Route duration is an estimate, not a guarantee; opening hours and booking availability are separate facts.' };
    const unavailable = (failureCode: NonNullable<MapFact['failureCode']>) => mapFactSchema.parse({ ...base, status: 'unavailable', failureCode, expiresAt: new Date(instant + policy.failureTtlMs).toISOString() });
    if (calls >= policy.maxCalls) return unavailable('quota_exhausted');
    if (instant - lastCall < policy.minIntervalMs) return unavailable('rate_limited');
    calls += 1; lastCall = instant;
    let fact: MapFact;
    try { fact = mapFactSchema.parse({ ...base, ...await transport(query), status: 'estimate', expiresAt: new Date(instant + policy.ttlMs).toISOString() }); }
    catch (error) { fact = unavailable(error instanceof MapProviderError ? error.code : 'provider_unavailable'); }
    cache.set(key, fact); return structuredClone(fact);
  }, get callCount() { return calls; } };
}

import * as z from 'zod/v4';
import { planningSnapshotSchema, preparePlanningContext, type PlanningSnapshot } from '../domain/planningTools';
import { mapQuerySchema, mapFactSchema, routeBindingSchema, mapFailureSchema, createMapProvider, MapProviderError, type MapFact } from './mapFacts';
import { canonical, hash } from './identity';
const id = routeBindingSchema.shape.planId;
const timestamp = z.iso.datetime({ offset: true });
const token = routeBindingSchema.shape.fromContentToken;
export const routeAnalysisInputSchema = z.strictObject({ dateId: planningSnapshotSchema.shape.todayId, planId: id, asOf: timestamp });
export const walkingRequestSchema = routeAnalysisInputSchema.extend({ fromStopId: id, toStopId: id, ttlSeconds: z.number().int().min(1).max(300) });
const walkingQuerySchema = mapQuerySchema.extend({ provider: z.literal('amap'), mode: z.literal('walking') });
const descriptorContentSchema = z.strictObject({ schemaVersion: z.literal(1), query: walkingQuerySchema, binding: routeBindingSchema, asOf: timestamp, ttlSeconds: walkingRequestSchema.shape.ttlSeconds });
export const walkingDescriptorSchema = descriptorContentSchema.extend({ requestHash: token });
const diagnostics = z.strictObject({ attemptedCalls: z.number().int().min(0).max(1), maxCalls: z.literal(1), retries: z.literal(0), strictTLS: z.literal(true), hostnameVerification: z.literal(true), caBundle: z.literal('certifi-standard'), category: z.enum(['success', 'dns_error', 'tls_certificate_error', 'tls_error', 'timeout', 'http_error', 'provider_rejected', 'invalid_response', 'credential_unavailable', 'ca_unavailable', 'connection_error', 'local_permission_denied', 'network_error', 'invalid_request']).optional() });
const responseBase = { diagnostics: diagnostics.optional(), schemaVersion: z.literal(1), requestHash: token, query: walkingQuerySchema, observedAt: timestamp, captureKind: z.enum(['live', 'fixture']), httpStatus: z.number().int().min(100).max(599).optional(), infocode: z.string().regex(/^\d{5}$/).optional() };
export const walkingResponseSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ...responseBase, ok: z.literal(true), estimate: z.strictObject({ distanceMeters: z.number().finite().nonnegative(), durationSeconds: z.number().finite().nonnegative() }) }),
  z.strictObject({ ...responseBase, ok: z.literal(false), failureCode: mapFailureSchema }),
]);
export class RouteEvidenceError extends Error { constructor(readonly code: string, message: string) { super(message); } }
function parse<T>(schema: z.ZodType<T>, input: unknown, code: string): T {
  const parsed = schema.safeParse(input); if (!parsed.success) throw new RouteEvidenceError(code, 'Route input schema is invalid'); return parsed.data;
}
function selected(snapshot: PlanningSnapshot, dateId: string, planId: string) {
  const context = preparePlanningContext(snapshot);
  if (!context.tripDates.some((date) => date.id === dateId)) throw new RouteEvidenceError('unknown_date', 'Date outside the journey');
  const index = snapshot.trip.plans.findIndex((plan) => plan.id === planId);
  if (index < 0) throw new RouteEvidenceError('unknown_id', 'Unknown route plan ID');
  const entry = snapshot.trip.schedule[dateId];
  if (entry?.planId !== planId || entry.status === 'abandoned') throw new RouteEvidenceError('assignment_mismatch', 'Route evidence requires the active dated plan');
  const raw = snapshot.trip.plans[index]; const stops = raw.stops || [];
  if (stops.some((stop) => typeof stop === 'string' || !stop.id) || new Set(stops.map((stop) => typeof stop === 'object' ? stop.id : '')).size !== stops.length) throw new RouteEvidenceError('stable_activity_ids_required', 'Routes require explicit unique activity IDs');
  return { raw, stops: stops as Array<Exclude<typeof stops[number], string>>, normalized: context.plans[index] };
}
function endpoint(snapshot: PlanningSnapshot, selection: ReturnType<typeof selected>, dateId: string, stopId: string) {
  const index = selection.stops.findIndex((stop) => stop.id === stopId);
  if (index < 0) throw new RouteEvidenceError('unknown_id', 'Unknown route activity ID');
  const point = selection.normalized.stops[index].location.mapPoint;
  const contentToken = hash({ tripId: snapshot.trip.id, dateId, planId: selection.raw.id, activity: selection.stops[index], planLocation: selection.raw.location ?? null, planWeatherLocation: selection.raw.weather_location ?? null });
  const coordinates = point?.coordinateSystem === 'GCJ-02' ? { longitude: Number(point.longitude.toFixed(6)), latitude: Number(point.latitude.toFixed(6)), crs: 'GCJ02' as const } : null;
  return { index, contentToken, coordinates };
}
/** Explicit GCJ02 public endpoints only. No inference, clock, network or persistence. */
export function prepareWalkingQuery(snapshot: PlanningSnapshot, input: unknown) {
  const request = parse(walkingRequestSchema, input, 'invalid_route_request');
  const selection = selected(snapshot, request.dateId, request.planId);
  const from = endpoint(snapshot, selection, request.dateId, request.fromStopId); const to = endpoint(snapshot, selection, request.dateId, request.toStopId);
  if (to.index !== from.index + 1) throw new RouteEvidenceError('activities_not_adjacent', 'The minimum prototype checks one adjacent activity leg');
  if (!from.coordinates || !to.coordinates) throw new RouteEvidenceError('gcj02_coordinates_required', 'Both activities need explicit GCJ02 map points; no implicit coordinate conversion');
  const content = descriptorContentSchema.parse({ schemaVersion: 1, query: { provider: 'amap', mode: 'walking', from: from.coordinates, to: to.coordinates }, binding: { tripId: snapshot.trip.id, dateId: request.dateId, planId: request.planId, fromStopId: request.fromStopId, toStopId: request.toStopId, fromContentToken: from.contentToken, toContentToken: to.contentToken }, asOf: request.asOf, ttlSeconds: request.ttlSeconds });
  return { ...content, requestHash: hash(content) };
}
export function parseWalkingDescriptor(input: unknown) {
  const wrapper = input as { descriptor?: unknown } | null;
  const result = parse(walkingDescriptorSchema, wrapper?.descriptor ?? input, 'invalid_route_request');
  const { requestHash, ...content } = result;
  if (hash(content) !== requestHash) throw new RouteEvidenceError('stale_route_request', 'Route descriptor content does not match its identity');
  return result;
}
/** Import an already captured observation via the existing bounded provider/fact contract. */
export async function importWalkingObservation(descriptorInput: unknown, responseInput: unknown) {
  const descriptor = parseWalkingDescriptor(descriptorInput);
  const response = parse(walkingResponseSchema, responseInput, 'invalid_route_response');
  if (response.requestHash !== descriptor.requestHash || canonical(response.query) !== canonical(descriptor.query)) throw new RouteEvidenceError('route_response_mismatch', 'Observation belongs to a different endpoint request');
  if (response.ok && (response.httpStatus !== 200 || response.infocode !== '10000')) throw new RouteEvidenceError('invalid_route_response', 'Successful observation needs a successful provider response');
  const instant = Date.parse(response.observedAt);
  if (instant < Date.parse(descriptor.asOf)) throw new RouteEvidenceError('route_observation_before_request', 'Observation predates its explicit request');
  const source = response.captureKind === 'live' ? 'amap:v3/direction/walking' : 'fixture:amap-walking';
  const provider = createMapProvider(async () => { if (!response.ok) throw new MapProviderError(response.failureCode); return { ...response.estimate, source }; }, () => instant, { maxCalls: 1, minIntervalMs: 1000, ttlMs: descriptor.ttlSeconds * 1000, failureTtlMs: Math.min(descriptor.ttlSeconds, 60) * 1000 });
  const fact = await provider.query(descriptor.query);
  // Binding participates in the ID so distinct simultaneous observations do not collide.
  return mapFactSchema.parse({ ...fact, source, id: `route-${hash({ requestHash: descriptor.requestHash, observedAt: response.observedAt }).slice(7, 47)}`, binding: descriptor.binding });
}
export function assessWalkingFact(snapshot: PlanningSnapshot, input: MapFact, asOfInput: string) {
  const fact = parse(mapFactSchema, input, 'invalid_route_fact'); const asOf = parse(timestamp, asOfInput, 'invalid_as_of');
  const reasonCodes: string[] = []; const binding = fact.binding;
  if (!binding) reasonCodes.push('unassociated_route');
  else {
    try {
      if (binding.tripId !== snapshot.trip.id) throw new RouteEvidenceError('unknown_id', 'Another journey');
      const selection = selected(snapshot, binding.dateId, binding.planId);
      const from = endpoint(snapshot, selection, binding.dateId, binding.fromStopId); const to = endpoint(snapshot, selection, binding.dateId, binding.toStopId);
      if (to.index !== from.index + 1) reasonCodes.push('endpoint_changed');
      if (from.contentToken !== binding.fromContentToken || to.contentToken !== binding.toContentToken) reasonCodes.push('endpoint_changed');
      if (!from.coordinates || !to.coordinates || canonical(fact.query.from) !== canonical(from.coordinates) || canonical(fact.query.to) !== canonical(to.coordinates)) reasonCodes.push('query_endpoint_mismatch');
    } catch (error) { if (error instanceof RouteEvidenceError) reasonCodes.push('unknown_binding_reference'); else throw error; }
  }
  if (fact.query.mode !== 'walking') reasonCodes.push('unsupported_route_mode');
  if (Date.parse(asOf) < Date.parse(fact.observedAt)) reasonCodes.push('observation_in_future');
  if (Date.parse(asOf) >= Date.parse(fact.expiresAt)) reasonCodes.push('expired_observation');
  if (fact.status === 'unavailable') reasonCodes.push('provider_unavailable');
  const synthetic = fact.query.provider === 'fixture' || fact.source.startsWith('fixture:');
  const reasons = [...new Set(reasonCodes)];
  const status = reasons.some((code) => ['endpoint_changed', 'query_endpoint_mismatch', 'unknown_binding_reference'].includes(code)) ? 'mismatch' : reasons.includes('provider_unavailable') ? 'unavailable' : reasons.includes('expired_observation') ? 'stale' : reasons.length ? 'unknown' : 'fresh_estimate';
  const usable = status === 'fresh_estimate' && !synthetic;
  return { factId: fact.id, status, reasonCodes: reasons, asOf, observedAt: fact.observedAt, expiresAt: fact.expiresAt, synthetic, canUseForComparison: usable, feasibility: 'not_proven' as const, ...(fact.status === 'estimate' ? { observedEstimate: { distanceMeters: fact.distanceMeters!, durationSeconds: fact.durationSeconds! } } : {}), ...(usable ? { comparisonEstimate: { distanceMeters: fact.distanceMeters!, durationSeconds: fact.durationSeconds! } } : {}), uncertainty: fact.uncertainty };
}
export function inspectWalkingRoutes(snapshot: PlanningSnapshot, facts: MapFact[], input: unknown) {
  const request = parse(routeAnalysisInputSchema, input, 'invalid_route_request'); const selection = selected(snapshot, request.dateId, request.planId);
  const legs = selection.stops.slice(1).map((to, index) => {
    const from = selection.stops[index];
    const candidates = facts.filter((fact) => fact.binding?.tripId === snapshot.trip.id && fact.binding.planId === request.planId && fact.binding.dateId === request.dateId && fact.binding.fromStopId === from.id && fact.binding.toStopId === to.id).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const fact = candidates[0];
    return { fromStopId: from.id!, toStopId: to.id!, ...(fact ? assessWalkingFact(snapshot, fact, request.asOf) : { status: 'unknown', reasonCodes: ['route_observation_missing'], asOf: request.asOf, canUseForComparison: false, feasibility: 'not_proven' as const }) };
  });
  return { schemaVersion: 1, kind: 'walking_routes', ...request, legs, unassociatedFactIds: facts.filter((fact) => !fact.binding).map((fact) => fact.id), allLegsHaveUsableEstimates: legs.length > 0 && legs.every((leg) => leg.canUseForComparison), feasibility: 'not_proven', limitation: 'Distance and duration are observations/estimates; reservations, hours and reaching a fixed appointment are not proven.' };
}

import type * as z from 'zod/v4';
import type { routeActivitySchema } from './linkageSchema';
import { preparePlanningContext } from '../domain/planningTools';
import { TripError, type TripState, type TripContent } from './schema';
const fail = (code: string, message: string): never => { throw new TripError(code, message); };
export function appendRouteActivity(state: TripState, next: TripContent, record: z.infer<typeof routeActivitySchema>) {
  const r = record; const list = next.linkage!.routeActivities ||= [];
  if (r.source.kind === 'provider' || r.activity.source.kind === 'provider') fail('unconfirmed_route_activity', 'Context activities require explicit user provenance');
  if (!preparePlanningContext(next.snapshot).tripDates.some((d) => d.id === r.dateId)) fail('unknown_date', 'Context activity date is outside this journey');
  if (Date.parse(r.activity.source.observedAt) > Date.parse(r.source.observedAt)) fail('future_route_source', 'Binding must follow activity provenance');
  const report = next.itinerary?.actual.find((a) => a.id === r.actualReportId);
  if (r.actualReportId && (!report || report.dateId !== r.dateId || Date.parse(report.source.observedAt) > Date.parse(r.source.observedAt))) fail('route_report_mismatch', 'Context must bind the exact same-day report known at binding time');
  if (list.some((a) => a.id === r.id)) fail('duplicate_id', 'Context record identity already exists');
  const all = [next, ...state.history.flatMap((h) => [h.before, h.after])];
  if (all.some((c) => c.itinerary?.registeredActivityIds.includes(r.activity.id) || c.linkage?.actualChanges?.some((a) => a.replacementActivities.some((x) => x.id === r.activity.id)) || c.snapshot.trip.plans.some((p) => p.stops?.some((a) => typeof a === 'object' && a.id === r.activity.id)))) fail('duplicate_id', 'Context activities need an identity distinct from planned and replacement activities');
  const previous = list.filter((a) => a.activity.id === r.activity.id).at(-1);
  if (previous ? r.supersedesId !== previous.id : Boolean(r.supersedesId)) fail('route_context_correction_conflict', 'Correct the latest context record for this stable activity identity');
  if (previous && (previous.dateId !== r.dateId || previous.role !== r.role || previous.actualReportId !== r.actualReportId)) fail('route_context_identity_conflict', 'A correction cannot change day, role or original report identity');
  if (previous && Date.parse(previous.source.observedAt) >= Date.parse(r.source.observedAt)) fail('stale_route_activity', 'Context corrections need newer provenance');
  list.push(structuredClone(r));
  return { kind: 'route_activity', contextId: r.id, activityId: r.activity.id, role: r.role, actualReportId: r.actualReportId || null, actualReportChanged: false, scheduleChanged: false, completionVerified: false };
}
export function validateRouteActivities(state: TripState) {
  if (!state.content.linkage?.routeActivities) return;
  const next = structuredClone(state.content); next.linkage!.routeActivities = [];
  for (const record of state.content.linkage.routeActivities) appendRouteActivity(state, next, record);
}

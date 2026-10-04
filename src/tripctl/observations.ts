import { canonical, hash } from './identity';
import { itineraryActivityToken } from './itinerary';
import { preparePlanningContext } from '../domain/planningTools';
import { TripError, type TripContent } from './schema';
import type { Observation } from './linkageSchema';
import type * as z from 'zod/v4';
import { setPlanDatesSchema } from '../domain/planDates';
export const observationTime = (r: Observation) => Date.parse(r.publishedAt || r.source.observedAt);
export function observationPlanToken(content: TripContent, planId: string) {
  const p = preparePlanningContext(content.snapshot).plans.find((p) => p.id === planId); if (!p) throw new TripError('unknown_id', 'Unknown observation plan');
  return hash({ planId, name: p.name, location: p.location ?? null, stops: (p.stops || []).map((s) => typeof s === 'string' ? s : { id: s.id ?? null, title: s.title ?? null, location: s.location ?? null }) });
}
const messageKey = (r: Observation) => canonical({ publisher: r.publisherId, message: r.messageId, scope: r.scope });
const payload = (r: Observation) => ({ ...r, id: undefined, source: { ...r.source, observedAt: undefined } });
export function observationBinding(content: TripContent, r: Observation) {
  const c = preparePlanningContext(content.snapshot);
  if (!c.plans.some((p) => p.id === r.scope.planId)) return 'unknown_plan';
  if (!c.tripDates.some((d) => d.id === r.scope.dateId)) return 'unknown_date';
  if (observationPlanToken(content, r.scope.planId) !== r.scope.planToken) return 'plan_location_changed';
  if (r.scope.place.identity !== 'matched' || !r.scope.place.placeId) return 'place_identity_unknown';
  if (r.scope.activityId) {
    const d = content.itinerary?.current.find((d) => d.planId === r.scope.planId && d.dateId === r.scope.dateId);
    if (!d?.activities.some((a) => a.id === r.scope.activityId)) return 'activity_scope_changed';
    if (itineraryActivityToken(content.itinerary!, r.scope.activityId) !== r.scope.activityToken) return 'activity_content_changed';
  }
  return null;
}
export function appendObservation(content: TripContent, record: Observation) {
  const list = content.linkage!.observations;
  const sameMessage = list.find((r) => messageKey(r) === messageKey(record));
  if (sameMessage) {
    if (canonical(payload(sameMessage)) !== canonical(payload(record))) throw new TripError('observation_identity_conflict', 'Same source message and scope contain different content');
    return { added: false, existingId: sameMessage.id };
  }
  if (list.some((r) => r.id === record.id)) throw new TripError('duplicate_id', 'Observation ID already exists');
  const plans = preparePlanningContext(content.snapshot);
  if (!plans.plans.some((p) => p.id === record.scope.planId)) throw new TripError('unknown_id', 'Observation requires a known plan ID');
  if (!plans.tripDates.some((d) => d.id === record.scope.dateId)) throw new TripError('unknown_date', 'Observation requires an exact journey date');
  if (record.scope.activityId && !content.itinerary?.registeredActivityIds.includes(record.scope.activityId)) throw new TripError('unknown_id', 'Observation references an unknown activity');
  const stream = list.filter((r) => r.streamId === record.streamId);
  if (stream.some((r) => r.publisherId !== record.publisherId || canonical(r.scope) !== canonical(record.scope))) throw new TripError('observation_stream_mismatch', 'A stream binds one publisher and exact date/place/plan/activity scope');
  if (record.supersedesId) {
    const old = list.find((r) => r.id === record.supersedesId);
    if (!old || old.streamId !== record.streamId) throw new TripError('invalid_correction', 'Correction must identify an existing record in the same stream');
    if (observationTime(record) <= observationTime(old) || list.some((r) => r.supersedesId === old.id)) throw new TripError('invalid_correction', 'Corrections must be newer and cannot branch over an already corrected record');
  }
  list.push(record); return { added: true, existingId: null };
}
export function assessObservations(content: TripContent, asOf: string) {
  const records = content.linkage?.observations || [];
  const streams = [...new Set(records.map((r) => r.streamId))].sort();
  return streams.map((streamId) => {
    const all = records.filter((r) => r.streamId === streamId);
    const latestTime = Math.max(...all.map(observationTime));
    const heads = all.filter((r) => observationTime(r) === latestTime).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const r = heads[0]; const reasons: string[] = [];
    if (heads.some((other) => canonical({ ...payload(other), messageId: undefined, source: undefined }) !== canonical({ ...payload(r), messageId: undefined, source: undefined }))) reasons.push('equal_time_conflict');
    const binding = observationBinding(content, r); if (binding) reasons.push(binding);
    if (Date.parse(r.source.observedAt) > Date.parse(asOf) || observationTime(r) > Date.parse(asOf)) reasons.push('future_observation');
    if (r.status !== 'available') reasons.push(r.status);
    if (Date.parse(r.expiresAt) <= Date.parse(asOf)) reasons.push('expired_evidence');
    const status = reasons.length ? 'unknown' : r.basis === 'official_final' && r.confidence === 'high' ? 'current_report' : 'prediction_or_uncertain';
    return { streamId, headIds: heads.map((x) => x.id), observation: r, status, reasonCodes: reasons, usableForHardClosure: status === 'current_report' && r.scope.component === 'whole_plan' && r.claim?.kind === 'opening' && r.claim.state === 'closed' };
  });
}
export function observationDateChange(content: TripContent, observationId: string, asOf: string) {
  const assessments = assessObservations(content, asOf);
  const selected = assessments.find((a) => a.headIds.includes(observationId));
  if (!selected?.usableForHardClosure) throw new TripError('observation_not_actionable', 'Only a current matched high-confidence whole-plan final closure can become a date restriction');
  const r = selected.observation;
  const conflicting = assessments.some((a) => a.streamId !== r.streamId && a.observation.scope.planId === r.scope.planId && a.observation.scope.dateId === r.scope.dateId && a.observation.scope.component === 'whole_plan' && a.status !== 'unknown' && a.observation.claim?.kind === 'opening' && a.observation.claim.state !== 'closed');
  if (conflicting) throw new TripError('observation_conflict', 'Conflicting current sources need review before changing a date restriction');
  return observationRestriction(r);
}
export function observationRestriction(r: Observation): z.infer<typeof setPlanDatesSchema> {
  return { type: 'set_plan_dates' as const, planId: r.scope.planId, closeDates: [r.scope.dateId], reason: r.summary, source: { ...r.source, observedAt: r.publishedAt || r.source.observedAt } };
}
export const observationDigest = (r: Observation) => hash(payload(r));

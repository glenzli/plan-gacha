import * as z from 'zod/v4';
import { evidenceSourceSchema } from '../domain/evidence';
import { planningSnapshotSchema } from '../domain/planningTools';
const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/).refine((v) => !['__proto__', 'constructor', 'prototype'].includes(v));
const date = planningSnapshotSchema.shape.todayId;
const stamp = z.iso.datetime({ offset: true });
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const text = z.string().trim().min(1).max(4000);
const source = evidenceSourceSchema;
const endpoint = z.strictObject({ label: text, providerPlaceId: id.optional() });
const activityBase = z.strictObject({
  id, kind: z.enum(['transfer', 'visit', 'meal', 'lodging', 'other']), title: text, note: z.string().max(4000).optional(),
  location: endpoint.optional(), weatherSensitive: z.boolean().optional(),
  timing: z.strictObject({ start: clock.optional(), end: clock.optional(), endDayOffset: z.union([z.literal(0), z.literal(1)]).optional(), durationMinutes: z.number().int().nonnegative().max(2880).optional() }),
  route: z.strictObject({ mode: z.enum(['driving', 'walking', 'transit']), from: endpoint, to: endpoint, fromActivityId: id.optional(), toActivityId: id.optional() }).optional(), source,
});
export const itineraryActivitySchema = activityBase.superRefine((a, ctx) => {
  if (a.kind === 'transfer' && !a.route || a.kind !== 'transfer' && a.route) ctx.addIssue({ code: 'custom', message: 'Only transfers require a route' });
  if (a.timing.endDayOffset && !a.timing.end) ctx.addIssue({ code: 'custom', message: 'An overnight end needs a clock time' });
  if (a.timing.start && a.timing.end && !a.timing.endDayOffset && a.timing.end < a.timing.start) ctx.addIssue({ code: 'custom', message: 'Overnight timing requires endDayOffset:1' });
});
export const itineraryDaySchema = z.strictObject({ dateId: date, planId: id, title: text, activities: z.array(itineraryActivitySchema).max(80) });
export const itineraryConstraintSchema = z.strictObject({
  id, dateId: date, activityId: id.optional(), strength: z.enum(['hard', 'soft']),
  kind: z.enum(['start_at', 'end_before', 'end_by', 'max_driving_minutes', 'max_walking_meters', 'preference']),
  clock: clock.optional(), limit: z.number().finite().nonnegative().max(10000000).optional(), text, source,
}).superRefine((c, ctx) => {
  if (['start_at', 'end_before', 'end_by'].includes(c.kind) && (!c.clock || !c.activityId)) ctx.addIssue({ code: 'custom', message: 'Clock constraints require an activity and clock' });
  if (c.kind.startsWith('max_') && c.limit === undefined) ctx.addIssue({ code: 'custom', message: 'An explicit numeric limit is required' });
  if (c.kind === 'preference' && c.strength === 'hard') ctx.addIssue({ code: 'custom', message: 'A qualitative preference is not an enforceable hard constraint' });
});
const commitment = z.strictObject({ id, kind: z.enum(['fixed', 'reservation']), dateId: date, activityId: id.optional(), text, source });
export const itineraryActualSchema = z.strictObject({
  id, dateId: date, activityId: id.optional(), kind: z.enum(['started', 'finished', 'skipped', 'note', 'changed_plan']),
  at: stamp.optional(), bounds: z.strictObject({ after: clock.optional(), before: clock.optional() }).refine((b) => Boolean(b.after || b.before)).optional(), text, source,
}).superRefine((r, ctx) => {
  if (r.at && r.bounds) ctx.addIssue({ code: 'custom', message: 'Use an exact timestamp or uncertain clock bounds' });
  if (['started', 'finished', 'skipped'].includes(r.kind) && !r.activityId) ctx.addIssue({ code: 'custom', message: 'Activity status requires a stable ID' });
  if (r.bounds?.after && r.bounds.before && r.bounds.after >= r.bounds.before) ctx.addIssue({ code: 'custom', message: 'Bounds must be ordered within one local day' });
});
const requiredPlans = z.array(z.strictObject({ planId: id, dateId: date })).min(1).max(30).refine((items) => new Set(items.map((x) => x.dateId)).size === items.length && new Set(items.map((x) => x.planId)).size === items.length, 'Use one distinct whole-day plan per date; alternatives need separate options');
const optionRequirements = z.strictObject({ plans: requiredPlans, reason: text, source });
const option = z.strictObject({ requirements: optionRequirements.optional(), id, condition: text, proposal: text, dateIds: z.array(date).min(1).max(30), uncertainties: z.array(text).max(20), source });
const decisionPoint = z.strictObject({ id, text, optionIds: z.array(id).max(20), deadline: stamp.optional(), source });
export const decisionLifecycleSchema = z.strictObject({ status: z.enum(['open', 'completed', 'withdrawn']), confirmation: z.literal('explicit'), reason: text, source });
const storedDecisionPoint = decisionPoint.extend({ lifecycle: decisionLifecycleSchema.optional() });
const optionDecision = z.strictObject({ id, decisionPointId: id, optionId: id, reason: text, source });
const observation = z.strictObject({
  id, kind: z.enum(['route', 'weather', 'place']), dateId: date, activityId: id, activityToken: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  source, expiresAt: stamp, captureKind: z.enum(['live', 'fixture']), status: z.enum(['estimate', 'unavailable', 'unknown']),
  durationMinutes: z.strictObject({ min: z.number().finite().nonnegative(), max: z.number().finite().nonnegative() }).optional(),
  distanceMeters: z.number().finite().nonnegative().optional(), mode: z.enum(['driving', 'walking', 'transit']).optional(),
  risk: z.enum(['clear', 'adverse', 'blocked', 'unknown']).optional(), forecastDateId: date.optional(), identity: z.enum(['matched', 'ambiguous', 'unknown']).optional(),
  detail: text,
}).superRefine((e, ctx) => {
  if (Date.parse(e.expiresAt) <= Date.parse(e.source.observedAt)) ctx.addIssue({ code: 'custom', message: 'Expiry must follow observation' });
  if (e.durationMinutes && e.durationMinutes.min > e.durationMinutes.max) ctx.addIssue({ code: 'custom', message: 'Duration range must be ordered' });
  if (e.status === 'estimate' && (e.kind === 'route' && (!e.durationMinutes || !e.mode) || e.kind === 'weather' && (!e.risk || !e.forecastDateId) || e.kind === 'place' && !e.identity)) ctx.addIssue({ code: 'custom', message: 'Successful observations need typed metrics' });
  if (e.source.kind === 'user' && e.captureKind === 'live') ctx.addIssue({ code: 'custom', message: 'User assumptions cannot be live provider evidence' });
});
export const itinerarySchema = z.strictObject({
  schemaVersion: z.literal(1), timeZone: z.literal('Asia/Shanghai'),
  baseline: z.strictObject({ source, days: z.array(itineraryDaySchema).min(1).max(30) }),
  current: z.array(itineraryDaySchema).min(1).max(30), registeredActivityIds: z.array(id).max(1000),
  actual: z.array(itineraryActualSchema).max(500), constraints: z.array(itineraryConstraintSchema).max(100), commitments: z.array(commitment).max(100),
  options: z.array(option).max(30), decisionPoints: z.array(storedDecisionPoint).max(50), optionDecisions: z.array(optionDecision).max(100), evidence: z.array(observation).max(200),
});
const patch = activityBase.omit({ id: true, source: true }).partial().refine((v) => Object.keys(v).length > 0);
const change = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('add_day'), day: itineraryDaySchema }),
  z.strictObject({ action: z.literal('insert'), dateId: date, index: z.number().int().nonnegative(), activity: itineraryActivitySchema }),
  z.strictObject({ action: z.literal('remove'), activityId: id }),
  z.strictObject({ action: z.literal('update'), activityId: id, patch }),
  z.strictObject({ action: z.literal('reorder'), dateId: date, activityIds: z.array(id).max(80) }),
  z.strictObject({ action: z.literal('move'), activityId: id, dateId: date, index: z.number().int().nonnegative() }),
]);
export const itineraryOperationSchemas = [
  z.strictObject({ type: z.literal('import_itinerary'), timeZone: z.literal('Asia/Shanghai'), days: z.array(itineraryDaySchema).min(1).max(30), constraints: z.array(itineraryConstraintSchema).max(100), commitments: z.array(commitment).max(100), options: z.array(option).max(30), decisionPoints: z.array(decisionPoint).max(50), replaceAssignedDays: z.array(date).max(30).optional(), adoptExistingPlanIds: z.array(id).max(30).optional(), source }),
  z.strictObject({ type: z.literal('edit_itinerary'), changes: z.array(change).min(1).max(80), source }),
  z.strictObject({ type: z.literal('record_actual'), record: itineraryActualSchema }),
  z.strictObject({ type: z.literal('itinerary_evidence'), record: observation }),
  z.strictObject({ type: z.literal('choose_option'), record: optionDecision }),
  z.strictObject({ type: z.literal('set_decision_status'), decisionPointId: id, ...decisionLifecycleSchema.shape }),
  z.strictObject({ type: z.literal('itinerary_constraint'), record: itineraryConstraintSchema }),
  z.strictObject({ type: z.literal('itinerary_commitment'), record: commitment }),
  z.strictObject({ type: z.literal('itinerary_option'), record: option }),
  z.strictObject({ type: z.literal('set_option_requirements'), optionId: id, ...optionRequirements.shape }),
  z.strictObject({ type: z.literal('itinerary_decision_point'), record: decisionPoint }),
] as const;
export const itineraryOperationSchema = z.discriminatedUnion('type', itineraryOperationSchemas);
export type Itinerary = z.infer<typeof itinerarySchema>;
export type ItineraryActivity = z.infer<typeof itineraryActivitySchema>;
export type ItineraryDay = z.infer<typeof itineraryDaySchema>;
export type ItineraryOperation = z.infer<typeof itineraryOperationSchema>;
export class ItineraryError extends Error { constructor(readonly code: string, message: string) { super(message); } }

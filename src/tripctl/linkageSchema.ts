import * as z from 'zod/v4';
import { itineraryActivitySchema } from './itinerarySchema';
import { evidenceSourceSchema } from '../domain/evidence';
import { planningSnapshotSchema } from '../domain/planningTools';
export const linkId = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/);
const text = z.string().trim().min(1).max(4000);
const stamp = z.iso.datetime({ offset: true });
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const source = evidenceSourceSchema;
export const observationSchema = z.strictObject({
  id: linkId, streamId: linkId, messageId: z.string().min(1).max(300), publisherId: z.string().min(1).max(300), source,
  publishedAt: stamp.nullable(), expiresAt: stamp, basis: z.enum(['official_final', 'official_prediction', 'forecast', 'user_report', 'unknown']),
  confidence: z.enum(['high', 'medium', 'low', 'unknown']), status: z.enum(['available', 'unavailable', 'unknown', 'withdrawn']),
  scope: z.strictObject({ planId: linkId, planToken: digest, dateId: planningSnapshotSchema.shape.todayId, component: z.enum(['whole_plan', 'part']), componentLabel: text,
    activityId: linkId.optional(), activityToken: digest.optional(),
    place: z.strictObject({ provider: z.string().min(1).max(100), placeId: z.string().min(1).max(300).nullable(), label: text, identity: z.enum(['matched', 'ambiguous', 'unknown']) }),
  }),
  claim: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('opening'), state: z.enum(['open', 'closed', 'partial', 'unknown']) }),
    z.strictObject({ kind: z.literal('weather'), risk: z.enum(['clear', 'adverse', 'blocked', 'unknown']) }),
    z.strictObject({ kind: z.literal('traffic'), state: z.enum(['normal', 'delayed', 'unknown']), delayMinutes: z.number().finite().nonnegative().max(2880).optional() }),
  ]).nullable(), summary: text, supersedesId: linkId.optional(),
}).superRefine((r, ctx) => {
  if (Boolean(r.scope.activityId) !== Boolean(r.scope.activityToken)) ctx.addIssue({ code: 'custom', message: 'Activity scope requires both ID and content token' });
  if (r.scope.activityId && r.scope.component !== 'part') ctx.addIssue({ code: 'custom', message: 'An activity observation is not a whole-plan closure' });
  if (r.status === 'available' && !r.claim || r.status !== 'available' && r.claim) ctx.addIssue({ code: 'custom', message: 'Only available observations carry claims' });
  if (r.status === 'withdrawn' && !r.supersedesId) ctx.addIssue({ code: 'custom', message: 'Withdrawal must identify its preceding record' });
  if (r.publishedAt && Date.parse(r.publishedAt) > Date.parse(r.source.observedAt)) ctx.addIssue({ code: 'custom', message: 'Publication cannot follow capture' });
  if (Date.parse(r.expiresAt) <= Date.parse(r.publishedAt || r.source.observedAt)) ctx.addIssue({ code: 'custom', message: 'Expiry must follow the source effective timestamp' });
});
export const reminderConfigurationSchema = z.strictObject({ title: text, prompt: text, dueAt: stamp, timeZone: z.string().min(1).max(100), enabled: z.boolean() });
export const reminderIntentInputSchema = z.strictObject({
  id: linkId, decisionPointId: linkId, purpose: z.literal('decision_needed'), provider: z.string().min(1).max(100), accountRef: z.string().min(1).max(200),
  title: text, prompt: text, timeZone: z.literal('Asia/Shanghai'), dueAtOverride: stamp.nullable(), source,
});
export const reminderIntentSchema = reminderIntentInputSchema.extend({ version: z.number().int().positive(), status: z.enum(['active', 'paused', 'withdrawn']), statusSource: source, explicitResumeAt: stamp.optional() });
export const reminderReadbackSchema = z.strictObject({
  id: linkId, journeyId: linkId, intentId: linkId, correlation: z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('lookup') }), z.strictObject({ kind: z.literal('bound_task') }), z.strictObject({ kind: z.literal('authorized_existing'), authorization: source }), z.strictObject({ kind: z.literal('attempt'), attemptId: linkId, actionKey: digest })]), provider: z.string().min(1).max(100), accountRef: z.string().min(1).max(200), providerTaskId: z.string().min(1).max(300).nullable(), expiresAt: stamp,
  status: z.enum(['present', 'absent', 'unknown']), configuration: reminderConfigurationSchema.nullable(), source,
}).refine((r) => r.status === 'present' ? r.configuration !== null && r.providerTaskId !== null : r.configuration === null, 'Present readbacks require exact task ID and complete observed configuration')
  .refine((r) => Date.parse(r.expiresAt) > Date.parse(r.source.observedAt), 'Readback expiry must follow its observation');
export const reminderAttemptSchema = z.strictObject({
  id: linkId, intentId: linkId, actionKey: digest, action: z.enum(['create', 'update', 'pause', 'cancel']),
  desiredHash: digest, desired: reminderConfigurationSchema.nullable(), provider: z.string(), accountRef: z.string(), providerTaskId: z.string().nullable(),
  startedAt: stamp, outcome: z.enum(['unknown', 'not_applied', 'applied']), resultSource: source.optional(), readbackId: linkId.optional(),
});
export const contextBindingSchema = z.strictObject({ id: linkId, subjectType: z.enum(['fact', 'preference', 'option', 'issue']), subjectId: linkId, dateIds: z.array(planningSnapshotSchema.shape.todayId).max(30).refine((v) => new Set(v).size === v.length), planId: linkId.optional(), activityId: linkId.optional(), role: z.enum(['backup', 'context']), source }).refine((r) => !r.activityId || Boolean(r.planId), 'Activity binding requires its plan');
export const actualChangeSchema = z.strictObject({ id: linkId, actualId: linkId, dateId: planningSnapshotSchema.shape.todayId, previousActivityIds: z.array(linkId).min(1).max(80).refine((v) => new Set(v).size === v.length), replacementActivities: z.array(itineraryActivitySchema).max(80), source }).refine((r) => r.replacementActivities.every((a) => !a.route?.fromActivityId && !a.route?.toActivityId), 'Reported replacement routes use explicit endpoint labels only; cross-activity route references require planned-itinerary validation');
export const linkageSchema = z.strictObject({
  actualChanges: z.array(actualChangeSchema).max(100).optional(),
  contextBindings: z.array(contextBindingSchema).max(300).optional(),
  observations: z.array(observationSchema).max(300), reminderIntents: z.array(reminderIntentSchema).max(100),
  reminderReadbacks: z.array(reminderReadbackSchema).max(300), reminderAttempts: z.array(reminderAttemptSchema).max(200),
});
export const linkageOperations = [
  z.strictObject({ type: z.literal('link_actual_change'), record: actualChangeSchema }),
  z.strictObject({ type: z.literal('bind_context'), record: contextBindingSchema }),
  z.strictObject({ type: z.literal('record_observation'), record: observationSchema }),
  z.strictObject({ type: z.literal('apply_observation'), observationId: linkId, asOf: stamp }),
  z.strictObject({ type: z.literal('set_reminder_intent'), expectedVersion: z.number().int().nonnegative(), record: reminderIntentInputSchema }),
  z.strictObject({ type: z.literal('set_reminder_status'), intentId: linkId, status: z.enum(['active', 'paused', 'withdrawn']), confirmation: z.literal('explicit'), source }),
  z.strictObject({ type: z.literal('record_reminder_readback'), record: reminderReadbackSchema }),
  z.strictObject({ type: z.literal('begin_reminder_action'), intentId: linkId, attemptId: linkId, actionKey: digest, asOf: stamp }),
  z.strictObject({ type: z.literal('resolve_reminder_attempt'), attemptId: linkId, outcome: z.enum(['unknown', 'not_applied', 'applied']), source, readbackId: linkId.optional() }),
] as const;
export const linkageOperationSchema = z.discriminatedUnion('type', linkageOperations);
export const linkageQuerySchema = z.strictObject({ asOf: stamp });
export const readonlyViewInputSchema = z.strictObject({
  asOf: stamp, generatedAt: stamp,
  source: z.strictObject({ libraryFileId: z.string().min(1), libraryVersion: z.number().int().positive(), retrievedAt: stamp }).optional(),
});
export type Observation = z.infer<typeof observationSchema>;
export type Linkage = z.infer<typeof linkageSchema>;
export type LinkageOperation = z.infer<typeof linkageOperationSchema>;
export type ReminderIntent = z.infer<typeof reminderIntentSchema>;
export const emptyLinkage = (): Linkage => ({ observations: [], reminderIntents: [], reminderReadbacks: [], reminderAttempts: [] });

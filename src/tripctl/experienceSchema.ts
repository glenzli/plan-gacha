import * as z from 'zod/v4';
import { historicalRecordSchema } from './historyImport';
import { planningSnapshotSchema } from '../domain/planningTools';
const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/);
const text = z.string().trim().min(1).max(4000);
export const experienceTopicSchema = z.enum(['weather', 'crowds', 'booking', 'opening', 'transport', 'prices', 'timing', 'food', 'pace', 'access', 'other']);
const topics = z.array(experienceTopicSchema).max(12).refine((v) => new Set(v).size === v.length, 'Topics must be unique');
export const experienceMetadataSchema = z.strictObject({
  historical: historicalRecordSchema.optional(), kind: z.enum(['firsthand', 'external_guide']), eventDateId: planningSnapshotSchema.shape.todayId.nullable(),
  topics: topics.refine((v) => v.length > 0), conditions: z.array(text).max(12), unknowns: z.array(text).max(12), reviewBeforeReuse: topics,
  planId: id.optional(), activityId: id.optional(), changeCommitIds: z.array(id).max(20).refine((v) => new Set(v).size === v.length),
  outcome: text.optional(), userEvaluation: text.optional(), draftLesson: text.optional(), supersedesFactId: id.optional(),
}).refine((e) => !e.activityId || Boolean(e.planId), 'An activity needs a plan reference')
  .refine((e) => e.kind !== 'external_guide' || !e.outcome && !e.userEvaluation, 'External guides cannot establish personal outcomes or evaluations');
export const experienceSearchSchema = z.strictObject({ asOf: z.iso.datetime({ offset: true }), query: z.string().max(300).optional(), topics: topics.optional(), kind: z.enum(['firsthand', 'external_guide']).optional(), limit: z.number().int().min(1).max(50).optional(), includeSuperseded: z.boolean().optional() });
export const guideDraftSchema = z.strictObject({ asOf: z.iso.datetime({ offset: true }), experienceIds: z.array(id).min(1).max(30).refine((v) => new Set(v).size === v.length), lessonDrafts: z.array(z.strictObject({ experienceId: id, lesson: text })).max(30).optional() });

export const experienceSearchRequestSchema = z.strictObject({ journeys: z.array(z.unknown()).min(1).max(10), query: experienceSearchSchema });

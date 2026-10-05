import * as z from 'zod/v4';
import { arrangementOperations, displayMetadataSchema } from './arrangementSchema';
import { MAX_HISTORY_EVENTS } from './limits';
import { linkageSchema, linkageOperations } from './linkageSchema';
import { historyImportSchema } from './historyImport';
import { experienceMetadataSchema } from './experienceSchema';
import { setPlanDatesSchema } from '../domain/planDates';
import { planningSnapshotSchema, assignmentOperationSchema } from '../domain/planningTools';
import { mapFactSchema } from './mapFacts';
import { evidenceSourceSchema } from '../domain/evidence';
import { itinerarySchema, itineraryOperationSchemas } from './itinerarySchema';
import { activityOperationSchemas } from '../domain/activityEditing';
export const identifier = z.string().trim().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/);
export const timestamp = z.iso.datetime({ offset: true });
export const sourceSchema = evidenceSourceSchema;
const note = z.strictObject({ id: identifier, text: z.string().min(1).max(4000), source: sourceSchema });
const fact = note.extend({ certainty: z.enum(['reported', 'verified', 'uncertain']), experience: experienceMetadataSchema.optional() });
const decision = z.strictObject({ id: identifier, planId: identifier, dateId: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), disposition: z.enum(['confirmed', 'excluded', 'withdrawn']), reason: z.string().min(1).max(4000), source: sourceSchema });
const progress = z.strictObject({ id: identifier, planId: identifier, dateId: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(['todo', 'done', 'skipped']), reason: z.string().min(1).max(4000), source: sourceSchema });
const issue = z.strictObject({ id: identifier, text: z.string().min(1).max(4000), source: sourceSchema, relatedPlanId: identifier.optional(), status: z.enum(['open', 'resolved']), resolution: z.string().max(4000), resolutionSource: sourceSchema.optional() });
export const memorySchema = z.strictObject({
  facts: z.array(fact).max(500),
  preferences: z.array(note).max(500),
  decisions: z.array(decision).max(500),
  progress: z.array(progress).max(500),
  issues: z.array(issue).max(500),
  mapFacts: z.array(mapFactSchema).max(100),
});
export const contentSchema = z.strictObject({ snapshot: planningSnapshotSchema, memory: memorySchema, linkage: linkageSchema.optional(), displayMetadata: displayMetadataSchema.optional(), itinerary: itinerarySchema.optional() });
export const operationSchema = z.discriminatedUnion('type', [
  assignmentOperationSchema,
  ...linkageOperations,
  ...arrangementOperations,
  historyImportSchema,
  z.strictObject({ type: z.literal('undo_history_import'), commitId: identifier }),
  setPlanDatesSchema,
  ...activityOperationSchemas,
  ...itineraryOperationSchemas,
  z.strictObject({ type: z.literal('fact'), record: fact }),
  z.strictObject({ type: z.literal('preference'), record: note }),
  z.strictObject({ type: z.literal('decision'), record: decision }),
  z.strictObject({ type: z.literal('progress'), record: progress }),
  z.strictObject({ type: z.literal('issue'), record: issue.omit({ status: true, resolution: true, resolutionSource: true }) }),
  z.strictObject({ type: z.literal('resolve_issue'), id: identifier, resolution: z.string().min(1).max(4000), source: sourceSchema }),
  z.strictObject({ type: z.literal('map_fact'), fact: mapFactSchema }),
  z.strictObject({ type: z.literal('set_context'), todayId: planningSnapshotSchema.shape.todayId }),
  z.strictObject({ type: z.literal('undo'), commitId: identifier }),
]);
export const mutationSchema = z.strictObject({
  operation: operationSchema, expectedRevision: z.number().int().nonnegative(), previewToken: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  idempotencyKey: identifier, actor: z.string().min(1).max(200), reason: z.string().min(1).max(4000), at: timestamp,
  acceptWeatherRisk: z.boolean().optional(),
});
const eventSchema = z.strictObject({ id: identifier, revision: z.number().int().positive(), operation: operationSchema, actor: z.string(), reason: z.string(), at: timestamp, requestHash: z.string(), before: contentSchema, after: contentSchema });
export const tripStateSchema = z.strictObject({ schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), content: contentSchema, history: z.array(eventSchema).max(MAX_HISTORY_EVENTS) });
export type TripState = z.infer<typeof tripStateSchema>;
export type TripContent = z.infer<typeof contentSchema>;
export type TripOperation = z.infer<typeof operationSchema>;
export type TripMutation = z.infer<typeof mutationSchema>;
export class TripError extends Error { constructor(readonly code: string, message: string) { super(message); } }

import * as z from 'zod/v4';
import { evidenceSourceSchema as source } from '../domain/evidence';
import { planningSnapshotSchema } from '../domain/planningTools';
import { dayRouteInputSchema, routeActivitySchema } from './linkageSchema';
const id = planningSnapshotSchema.shape.trip.shape.id;
const text = z.string().trim().min(1).max(4000);
const date = planningSnapshotSchema.shape.todayId;
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const displayMetadataFieldsSchema = z.strictObject({ displayName: text, aliases: z.array(text).max(40).refine((v) => new Set(v).size === v.length), year: z.number().int().min(1900).max(9999).nullable(), month: z.number().int().min(1).max(12).nullable(), knownWindowStart: date.nullable(), knownWindowEnd: date.nullable() }).refine((m) => !m.knownWindowStart || !m.knownWindowEnd || m.knownWindowStart <= m.knownWindowEnd, 'Known window must be ordered');
export const displayMetadataSchema = displayMetadataFieldsSchema.safeExtend({ version: z.number().int().positive(), source });
export const displayMetadataInputSchema = z.strictObject({ expectedVersion: z.number().int().nonnegative(), record: displayMetadataFieldsSchema, source });
export const reservationBindingSchema = z.strictObject({ version: z.literal(1), commitmentIds: z.array(id).max(100).refine((v) => new Set(v).size === v.length), source, bindingSource: source, correctionReason: text.optional() });
const reservation = z.strictObject({ id, checkIn: date, checkOut: date, status: z.enum(['pending', 'booked', 'cancelled']), commitmentIds: z.array(id).max(100).refine((v) => new Set(v).size === v.length), source, correctionReason: text.optional() }).refine((r) => r.checkIn < r.checkOut, 'Check-out follows check-in');
const location = z.strictObject({ label: text.optional(), query: text.optional(), address: text.optional() }).refine((v) => Object.keys(v).length > 0);
export const lodgingChangeSchema = z.strictObject({ lodgingId: id, expectedLodgingToken: digest.nullable(), name: text.optional(), location: location.optional(), correctionReason: text.optional(), reservations: z.array(reservation).max(30) }).refine((v) => Boolean(v.name || v.location || v.reservations.length), 'Declare a hotel detail or reservation change');
export const lodgingChangesSchema = z.strictObject({ changes: z.array(lodgingChangeSchema).min(1).max(20), source, confirmation: z.literal('explicit') });
export const arrangementOperations = [
  z.strictObject({ type: z.literal('upsert_lodging_arrangements'), ...lodgingChangesSchema.shape }),
  z.strictObject({ type: z.literal('set_trip_display_metadata'), ...displayMetadataInputSchema.shape }),
  z.strictObject({ type: z.literal('reconcile_journey_context'), displayMetadata: displayMetadataInputSchema.optional(), lodgings: lodgingChangesSchema.optional(), routeActivities: z.array(routeActivitySchema).min(1).max(80).optional(), dayRoutes: z.array(dayRouteInputSchema).min(1).max(30).optional(), confirmation: z.literal('explicit') }).refine((v) => Boolean(v.displayMetadata || v.lodgings || v.routeActivities || v.dayRoutes), 'Declare at least one reconciliation component'),
] as const;
export const arrangementOperationSchema = z.discriminatedUnion('type', arrangementOperations);
export type ArrangementOperation = z.infer<typeof arrangementOperationSchema>;
export const tripDisplayOutputSchema = z.strictObject({ tripId: id, ...displayMetadataFieldsSchema.shape, metadataVersion: z.number().int().nonnegative(), source: source.nullable(), basis: z.enum(['explicit_metadata', 'snapshot_name_only']), sourceRevision: z.number().int().nonnegative(), sourceStateHash: digest, storageFormat: z.union([z.literal(1), z.literal(2)]), stateHashScope: z.enum(['canonical-format-1-state', 'content-and-audit-head-v2']), readOnly: z.literal(true), saved: z.literal(false) });

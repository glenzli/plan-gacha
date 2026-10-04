import * as z from 'zod/v4';
import { evidenceSourceSchema } from '../domain/evidence';
import { legacyFeedbackSchema, legacyTimeZoneSchema } from '../domain/legacyFeedback';
import { planningSnapshotSchema } from '../domain/planningTools';
import { hash, canonical } from './identity';
import type { TripContent } from './schema';
export const historyImportSchema = z.strictObject({
  type: z.literal('import_history'), sourceTripId: z.string().min(1).max(200), confirmedUserHistory: z.literal(true),
  timeZone: legacyTimeZoneSchema.nullable(), source: evidenceSourceSchema,
  feedback: legacyFeedbackSchema.refine((v) => Object.keys(v).length > 0 && JSON.stringify(v).length <= 256 * 1024, 'Supply 1..256 KiB of explicit legacy feedback'),
});
export const historicalRecordSchema = z.strictObject({
  sourceTripId: z.string(), sourceReference: z.string(), sourceKind: z.enum(['user', 'synthetic']),
  field: z.enum(['dayReviews', 'stopOutcomes', 'placeFeedback', 'archiveSummary', 'day_reviews', 'stop_outcomes', 'place_feedback', 'archive_summary']),
  key: z.string(), recordHash: z.string().regex(/^sha256:[0-9a-f]{64}$/), record: z.json(),
  timeZone: legacyTimeZoneSchema.nullable(), sourceTimestamp: z.string().nullable(),
  observedAtBasis: z.enum(['original_offset_timestamp', 'import_time_only']),
  localTimeHandling: z.literal('preserved_unconverted'), importedAt: z.iso.datetime({ offset: true }),
});
type Json = z.infer<ReturnType<typeof z.json>>;
const object = (v: Json) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const read = (r: Record<string, Json>, ...keys: string[]) => { for (const k of keys) if (typeof r[k] === 'string') return r[k] as string; return null; };
/** Deterministic projection into existing facts. Never changes snapshot, itinerary, preferences or progress. */
export function importHistoricalFacts(content: TripContent, op: z.infer<typeof historyImportSchema>) {
  const blocks: string[] = [];
  if (!content.snapshot.trip.archived) blocks.push('history_requires_archived_trip');
  if (op.source.kind === 'provider') blocks.push('unconfirmed_history_source');
  if (op.sourceTripId !== content.snapshot.trip.id) blocks.push('history_trip_mismatch');
  const knownZones = [content.snapshot.trip.timeZone, content.snapshot.trip.timezone, content.snapshot.trip.time_zone].filter((v) => v !== undefined);
  if (knownZones.some((zone) => zone !== op.timeZone)) blocks.push('history_timezone_mismatch');
  const records = Object.entries(op.feedback).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).flatMap(([field, value]) => {
    if (value === undefined || value === null) return [];
    const entries: [string, Json][] = field === 'archiveSummary' || field === 'archive_summary' ? [['$', value]]
      : Array.isArray(value) ? value.map((record, n) => [String(n), record])
      : typeof value === 'object' ? Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0) : [['$', value]];
    return entries.map(([key, record]) => ({ field: field as z.infer<typeof historicalRecordSchema>['field'], key, record }));
  });
  if (!records.length) blocks.push('no_history_records');
  const added: TripContent['memory']['facts'] = []; const skippedFactIds: string[] = [];
  for (const { field, key, record } of records) {
    const id = 'legacy-' + hash({ tripId: op.sourceTripId, reference: op.source.reference, field, key }).slice(7);
    const recordHash = hash({ record, timeZone: op.timeZone, sourceKind: op.source.kind });
    const existing = content.memory.facts.find((f) => f.id === id);
    if (existing) { if (existing.experience?.historical?.recordHash === recordHash) skippedFactIds.push(id); else blocks.push('history_import_conflict'); continue; }
    const raw = object(record); const rawDate = read(raw, 'dateId', 'date_id');
    const date = planningSnapshotSchema.shape.todayId.safeParse(rawDate);
    const originalTime = read(raw, 'updatedAt', 'updated_at');
    const stamped = z.iso.datetime({ offset: true }).safeParse(originalTime);
    const rawPlan = read(raw, 'planId', 'plan_id');
    const planId = rawPlan && /^[a-zA-Z0-9_.:-]{1,160}$/.test(rawPlan) && content.snapshot.trip.plans.some((p) => p.id === rawPlan) ? rawPlan : undefined;
    const unknowns = ['Legacy feedback is not proof of visit, opening, booking fulfilment or a permanent preference'];
    if (!date.success) unknowns.push('Event date is unknown; source date text remains in the original record');
    if (!stamped.success) unknowns.push('Original observation instant is unknown; fact timestamp is import time only');
    if (!op.timeZone) unknowns.push('Original local time zone is unknown; no conversion was attempted');
    if (rawPlan && !planId) unknowns.push('Original plan reference is retained but is not a known current plan');
    if (read(raw, 'stopId', 'stop_id')) unknowns.push('Legacy stop ID is retained without creating a typed activity or actual-progress record');
    const originalText = canonical(record);
    const evaluation = [read(raw, 'rating'), read(raw, 'note')].filter(Boolean).join(' — ');
    if (originalText.length > 3600) unknowns.push('Search synopsis is shortened; the complete original JSON remains in historical.record');
    added.push({ id, text: `Legacy ${field} [${key.slice(0, 100)}]: ${originalText.slice(0, 3600)}`, certainty: 'reported',
      source: { ...op.source, observedAt: stamped.success ? stamped.data : op.source.observedAt },
      experience: { kind: 'firsthand', eventDateId: date.success ? date.data : null, topics: ['other'], conditions: ['Historical user feedback; original local calendar dates and clock strings retained without conversion'], unknowns,
        reviewBeforeReuse: ['weather', 'crowds', 'booking', 'opening', 'transport', 'prices'], ...(evaluation ? { userEvaluation: evaluation.slice(0, 4000) } : {}), ...(planId ? { planId } : {}), changeCommitIds: [],
        historical: { sourceTripId: op.sourceTripId, sourceReference: op.source.reference, sourceKind: op.source.kind === 'synthetic' ? 'synthetic' : 'user', field, key, recordHash, record,
          timeZone: op.timeZone, sourceTimestamp: originalTime, observedAtBasis: stamped.success ? 'original_offset_timestamp' : 'import_time_only', localTimeHandling: 'preserved_unconverted', importedAt: op.source.observedAt },
      },
    });
  }
  if (content.memory.facts.length + added.length > 500) blocks.push('history_capacity_exceeded');
  if (!added.length && skippedFactIds.length && !blocks.length) blocks.push('history_already_imported');
  return { added, blocks: [...new Set(blocks)], detail: { kind: 'historical_feedback_import', sourceTripId: op.sourceTripId, source: op.source, feedbackHash: hash(op.feedback),
    inputRecords: records.length, addedFactIds: added.map((f) => f.id), skippedFactIds, timeZone: op.timeZone, localTimeHandling: 'preserved_unconverted',
    typedItineraryImported: false, archivedStatePreserved: true, ordinaryPlanningChangesAllowed: false } };
}

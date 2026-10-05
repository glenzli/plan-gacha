import * as z from 'zod/v4';
import { evidenceSourceSchema } from '../domain/evidence';
import { planningSnapshotSchema } from '../domain/planningTools';
import { itineraryActivitySchema } from './itinerarySchema';
import { tripDisplayOutputSchema } from './arrangementSchema';
import { routeActivitySchema, routeEstimateSchema } from './linkageSchema';
const date = planningSnapshotSchema.shape.todayId;
const stamp = z.iso.datetime({ offset: true });
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const ref = z.string().min(1).max(1200);
const refs = z.array(ref);
const library = z.strictObject({ libraryFileId: z.string().min(1), libraryVersion: z.number().int().positive(), retrievedAt: stamp });
export const presentationInputSchema = z.strictObject({
  contractVersion: z.union([z.literal(1), z.literal(2)]).optional(),
  asOf: stamp, generatedAt: stamp, source: library.optional(),
  view: z.discriminatedUnion('basis', [z.strictObject({ basis: z.literal('corrected_as_of') }), z.strictObject({ basis: z.literal('as_recorded'), revision: z.number().int().nonnegative() })]),
});
const categories = ['plans', 'activities', 'routeEntries', 'actualReports', 'actualChanges', 'reportedActivities', 'options', 'bookings', 'commitments', 'lodgings', 'facts', 'preferences', 'exclusions', 'evidence', 'weather', 'pending', 'issues'] as const;
const evidence = z.strictObject({ basis: z.string(), scopeDate: date, scopeComponent: z.enum(['whole_plan', 'part']), claimKind: z.string().nullable(), claimValue: z.string().nullable(), assessmentStatus: z.string(), reasonCodes: z.array(z.string()), publishedAt: stamp.nullable(), observedAt: stamp, expiresAt: stamp });
const item = z.strictObject({ ref, category: z.enum(categories), id: z.string().nullable(), title: z.string(), summary: z.string(), dateIds: z.array(date), status: z.string().nullable(), source: evidenceSourceSchema.nullable(), dateRestrictions: z.strictObject({ closedDates: z.array(date), availableDates: z.array(date) }).nullable(), evidence: evidence.nullable() });
const entry = z.strictObject({ ref, position: z.number().int().nonnegative().nullable(), activityRef: ref, title: z.string(), kind: z.enum(['transfer', 'visit', 'meal', 'lodging', 'other', 'route_scenery', 'unknown']), status: z.enum(['actual', 'planned', 'skipped', 'reported']), completionVerified: z.literal(false),
  timing: itineraryActivitySchema.shape.timing, timingBasis: z.enum(['explicit_route_report', 'planned_activity', 'actual_time_unknown', 'reported_activity']),
  planningEstimate: routeEstimateSchema.nullable(), estimateStatus: z.string(), planningEstimatesAreActuals: z.literal(false),
  route: itineraryActivitySchema.shape.route.nullable(), nightDate: date.nullable(), lodgingId: z.string().nullable(), source: evidenceSourceSchema.nullable(),
});
const route = z.strictObject({ dateId: date, viewBasis: z.enum(['corrected_as_of', 'as_recorded']), sourceRevision: z.number().int().nonnegative(), sourceStateHash: hash,
  routeId: z.string().nullable(), basis: z.string(), orderStatus: z.enum(['explicit', 'planned_order', 'reported_order_unknown']), entries: z.array(entry), skippedEntries: z.array(entry),
  priorPlannedRefs: refs, actualReportRefs: refs, pendingActualReportRefs: refs, needsReview: z.boolean(), backupRefs: refs, bookingRefs: refs, evidenceRefs: refs, questionRefs: refs, nightArrangementRefs: refs,
});
const night = z.strictObject({ ref, dateId: date, nightDate: date, timeZone: z.string().nullable(), lodgingRef: ref.nullable(), lodgingId: z.string().nullable(), reservationId: z.string().nullable(), routeEntryRef: ref.nullable(), title: z.string(),
  status: z.enum(['planned', 'reservation_reported', 'cancelled', 'unknown']), active: z.boolean(), nightBasis: z.enum(['reservation', 'explicit_stay_nights', 'schedule_only_night_unverified', 'explicit_route_night']), liveStatusVerified: z.literal(false), sourceRevision: z.number().int().nonnegative(), sourceStateHash: hash,
});
const presentationBaseSchema = z.strictObject({
  presentationContractVersion: z.literal(1), readOnly: z.literal(true), derived: z.literal(true), saved: z.literal(false), audience: z.literal('private_owner'),
  source: z.strictObject({ journeyId: z.string(), authorityRevision: z.number().int().nonnegative(), authorityStateHash: hash, projectedRevision: z.number().int().nonnegative(), projectedStateHash: hash, hashScope: z.literal('canonical-format-1-state'), library: library.nullable(), metadataIsCallerSupplied: z.literal(true) }),
  freshness: z.strictObject({ asOf: stamp, generatedAt: stamp, knownAt: stamp.nullable(), automaticRefresh: z.literal(false), providerSyncAt: z.null(), knowledgeBasis: z.literal('selected_revision'), asOfUsage: z.literal('evidence_freshness_after_known_sources') }),
  trip: z.strictObject({ name: z.string(), dateIds: z.array(date), timeZone: z.string().nullable() }),
  presentationCatalog: z.strictObject({ version: z.literal(1), items: z.array(item), unplacedRefs: refs, inactiveAlternativeRefs: refs }),
  historicalDailyRouteProjections: z.array(route), nightDatedLodgingArrangements: z.array(night),
  pendingQuestions: z.array(z.strictObject({ ref, code: z.string(), text: z.string(), dateIds: z.array(date) })),
  gaps: z.array(z.strictObject({ code: z.string(), ref, detail: z.string() })),
  limitations: z.array(z.string()),
});
const validatePresentation = (p: z.infer<typeof presentationBaseSchema> | Omit<z.infer<typeof presentationBaseSchema>, 'presentationContractVersion'>, ctx: z.RefinementCtx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const known = new Set(p.presentationCatalog.items.map((r) => r.ref)); const nights = new Set(p.nightDatedLodgingArrangements.map((r) => r.ref));
  if (known.size !== p.presentationCatalog.items.length || nights.size !== p.nightDatedLodgingArrangements.length) fail('Presentation references must be unique');
  if (p.source.projectedRevision > p.source.authorityRevision) fail('Projected revision exceeds source authority');
  if (Date.parse(p.freshness.generatedAt) < Date.parse(p.freshness.asOf) || p.freshness.knownAt && Date.parse(p.freshness.knownAt) > Date.parse(p.freshness.asOf)) fail('Projection times are inconsistent');
  const checkRefs = (values: string[]) => { if (values.some((r) => !known.has(r))) fail('Unknown catalog reference'); };
  checkRefs([...p.presentationCatalog.unplacedRefs, ...p.presentationCatalog.inactiveAlternativeRefs]);
  const dayIds = p.historicalDailyRouteProjections.map((d) => d.dateId);
  if (new Set(dayIds).size !== dayIds.length || dayIds.length !== p.trip.dateIds.length || dayIds.some((d) => !p.trip.dateIds.includes(d))) fail('Projection days must exactly cover the journey');
  for (const d of p.historicalDailyRouteProjections) {
    if (d.sourceRevision !== p.source.projectedRevision || d.sourceStateHash !== p.source.projectedStateHash) fail('Mixed revision day projection');
    checkRefs([...d.priorPlannedRefs, ...d.actualReportRefs, ...d.pendingActualReportRefs, ...d.backupRefs, ...d.bookingRefs, ...d.evidenceRefs, ...d.questionRefs, ...d.entries.flatMap((e) => [e.ref, e.activityRef]), ...d.skippedEntries.flatMap((e) => [e.ref, e.activityRef])]);
    if (d.nightArrangementRefs.some((r) => !nights.has(r) || p.nightDatedLodgingArrangements.find((n) => n.ref === r)?.nightDate !== d.dateId)) fail('Unknown or wrong-night arrangement reference');
    if (new Set([...d.entries, ...d.skippedEntries].map((e) => e.ref)).size !== d.entries.length + d.skippedEntries.length) fail('Duplicate route entry');
  }
  for (const n of p.nightDatedLodgingArrangements) {
    if (n.sourceRevision !== p.source.projectedRevision || n.sourceStateHash !== p.source.projectedStateHash || n.dateId !== n.nightDate || !p.trip.dateIds.includes(n.nightDate)) fail('Mixed revision or wrong-night lodging');
    checkRefs([n.lodgingRef, n.routeEntryRef].filter((r): r is string => Boolean(r)));
    if (n.status === 'cancelled' && n.active) fail('Cancelled reservations must not be active');
  }
  for (const q of p.pendingQuestions) { checkRefs([q.ref]); if (q.dateIds.some((d) => !p.trip.dateIds.includes(d))) fail('Question references an unknown date'); }
};
export const presentationOutputSchema = presentationBaseSchema.superRefine(validatePresentation);
export const presentationOutputV2Schema = presentationBaseSchema.extend({
  presentationContractVersion: z.literal(2), tripDisplayMetadata: tripDisplayOutputSchema,
  routeActivityContexts: z.array(routeActivitySchema),
  reservationCommitmentCoverage: z.array(z.strictObject({ commitmentId: z.string(), commitmentRef: ref, dateId: date, originalText: z.string(), status: z.enum(['explicitly_mapped', 'unmapped', 'conflict']), matches: z.array(z.strictObject({ lodgingId: z.string(), reservationId: z.string(), nightRefs: refs, source: evidenceSourceSchema, bindingSource: evidenceSourceSchema, paymentStatus: z.literal('unknown'), checkInStatus: z.literal('unknown') })) })),
  adapterReplacement: z.strictObject({ automatic: z.literal(false), requiresHostEquivalenceCheck: z.literal(true), preserveUnknownFields: z.literal(true), catalogScope: z.literal('single_journey_entities'), displayMetadataScope: z.literal('one_entry_for_host_trip_index') }),
}).superRefine(validatePresentation).superRefine((p, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const metadata = p.tripDisplayMetadata;
  if (metadata.tripId !== p.source.journeyId || metadata.sourceRevision !== p.source.projectedRevision || metadata.sourceStateHash !== p.source.projectedStateHash) fail('Mixed identity or revision display metadata');
  if (new Set(p.reservationCommitmentCoverage.map((r) => r.commitmentId)).size !== p.reservationCommitmentCoverage.length) fail('Duplicate reservation coverage');
  const encode = (kind: string, ...ids: string[]) => kind + ':' + ids.map(encodeURIComponent).join(':');
  for (const c of p.reservationCommitmentCoverage) {
    const original = p.presentationCatalog.items.find((i) => i.ref === c.commitmentRef && i.category === 'commitments' && i.id === c.commitmentId);
    if (!original || c.commitmentRef !== encode('commitment', c.commitmentId) || !original.dateIds.includes(c.dateId) || original.summary !== c.originalText) fail('Unknown or altered original reservation commitment');
    if (c.status !== (c.matches.length === 1 ? 'explicitly_mapped' : c.matches.length ? 'conflict' : 'unmapped')) fail('Coverage status must match explicit mapping cardinality');
    const keys = c.matches.map((m) => encode('reservation', m.lodgingId, m.reservationId));
    if (new Set(keys).size !== keys.length) fail('Duplicate reservation mapping');
    for (const m of c.matches) {
      if (!m.nightRefs.length || new Set(m.nightRefs).size !== m.nightRefs.length || m.nightRefs.some((key) => !p.nightDatedLodgingArrangements.some((n) => n.ref === key && n.lodgingId === m.lodgingId && n.reservationId === m.reservationId)) || !m.nightRefs.some((key) => p.nightDatedLodgingArrangements.some((n) => n.ref === key && n.nightDate === c.dateId))) fail('Unknown or mismatched reservation night mapping');
      if (m.source.kind === 'provider' || m.bindingSource.kind === 'provider' || Date.parse(m.source.observedAt) > Date.parse(m.bindingSource.observedAt) || Date.parse(m.bindingSource.observedAt) > Date.parse(p.freshness.asOf)) fail('Invalid reservation mapping provenance');
    }
  }
  if (new Set(p.routeActivityContexts.map((r) => r.id)).size !== p.routeActivityContexts.length) fail('Duplicate context record');
  for (const c of p.routeActivityContexts) {
    const key = encode('context-activity', c.id, c.activity.id);
    if (!p.trip.dateIds.includes(c.dateId) || !p.presentationCatalog.items.some((i) => i.ref === key && i.dateIds.includes(c.dateId)) || c.actualReportId && !p.presentationCatalog.items.some((i) => i.ref === encode('actual', c.actualReportId!) && i.category === 'actualReports' && i.dateIds.includes(c.dateId))) fail('Unknown context activity or original report reference');
    if (c.source.kind === 'provider' || c.activity.source.kind === 'provider' || Date.parse(c.source.observedAt) > Date.parse(p.freshness.asOf)) fail('Invalid route context provenance');
    for (const day of p.historicalDailyRouteProjections) for (const e of [...day.entries, ...day.skippedEntries]) if (e.activityRef === key && (day.dateId !== c.dateId || e.status !== (c.role === 'planned_target' ? 'planned' : 'reported'))) fail('Route entry promoted or moved a context activity');
  }
});
export type PresentationV2 = z.infer<typeof presentationOutputV2Schema>;
export type Presentation = z.infer<typeof presentationOutputSchema>;

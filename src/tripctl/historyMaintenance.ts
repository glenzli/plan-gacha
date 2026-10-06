import * as z from 'zod/v4';
import { parseState, hash, canonical } from './engine';
import { TripError, type TripOperation } from './schema';
import { historicalSources, storageIdentity, auditEvents } from './storage2';
export const historyMaintenanceInputSchema = z.strictObject({ asOf: z.iso.datetime({ offset: true }), expectedRevision: z.number().int().nonnegative(), expectedStateHash: z.string().regex(/^sha256:[0-9a-f]{64}$/) });
const sha = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const scopeSchema = z.strictObject({ parentId: z.string().optional(), kind: z.enum(['journey', 'day', 'activity', 'decision', 'lodging']), id: z.string(), dateId: z.string().nullable() });
const reasonSchema = z.strictObject({ origin: z.enum(['change', 'decision', 'correction', 'commitment']), subjectId: z.string().nullable(), planId: z.string().optional(), dateId: z.string().optional(), text: z.string(), actor: z.string(), source: z.json(), occurrences: z.number().int().positive(), firstAt: z.iso.datetime({ offset: true }), lastAt: z.iso.datetime({ offset: true }) });
export const historyMaintenanceOutputSchema = z.strictObject({ ok: z.literal(true), saved: z.literal(false), mode: z.literal('dry_run'), applicationImplemented: z.literal(false), maintenanceContractVersion: z.literal(1), policy: z.strictObject({ version: z.literal(1), recentChanges: z.literal(20), recentRule: z.literal('last20'), mode: z.literal('dry_run') }), asOf: z.iso.datetime({ offset: true }),
  base: z.strictObject({ journeyId: z.string(), revision: z.number().int().nonnegative(), storageFormat: z.union([z.literal(1), z.literal(2)]), stateHashScope: z.enum(['canonical-format-1-state', 'content-and-audit-head-v2']), stateHash: sha, contentHash: sha, auditHeadHash: sha.nullable(), containerHash: sha }),
  effect: z.strictObject({ totalChanges: z.number().int().nonnegative(), olderAdjustmentsToSummarize: z.number().int().nonnegative(), summaryCards: z.number().int().nonnegative(), recentFullChanges: z.number().int().nonnegative(), protectedBusinessChanges: z.number().int().nonnegative(), deletedEvents: z.literal(0), reclaimedStorageBytes: z.literal(0) }),
  longTerm: z.json(), summaries: z.array(z.strictObject({ id: sha, scope: scopeSchema, adjustmentCount: z.number().int().positive(), firstAt: z.iso.datetime({ offset: true }), lastAt: z.iso.datetime({ offset: true }), operationTypes: z.array(z.string()), reasons: z.array(reasonSchema), currentPlanIsAuthoritative: z.literal(true), impliesVisitedOrSkipped: z.literal(false) })), recovery: z.json(), technicalMemory: z.json(), nextStep: z.string(), limitations: z.array(z.string()), maintenanceToken: sha, sourceFileHash: sha.optional(),
});
const policy = { version: 1, recentChanges: 20, recentRule: 'last20', mode: 'dry_run' } as const;
const routine = new Set<TripOperation['type']>(['set_context', 'assign', 'edit_activity', 'edit_itinerary', 'choose_option', 'set_day_route', 'set_trip_display_metadata', 'upsert_lodging_arrangements', 'reconcile_journey_context', 'undo']);
type Scope = { parentId?: string; kind: 'journey' | 'day' | 'activity' | 'decision' | 'lodging'; id: string; dateId: string | null };
type Reason = { origin: 'change' | 'decision' | 'correction' | 'commitment'; subjectId: string | null; planId?: string; dateId?: string; text: string; actor: string; source: unknown; occurrences: number; firstAt: string; lastAt: string };
type Card = { id: string; scope: Scope; adjustmentCount: number; firstAt: string; lastAt: string; operationTypes: string[]; reasons: Reason[]; currentPlanIsAuthoritative: true; impliesVisitedOrSkipped: false };
function scopes(op: TripOperation, journeyId: string): Scope[] {
  const global = (): Scope[] => [{ kind: 'journey', id: journeyId, dateId: null }];
  if (op.type === 'assign' || op.type === 'set_day_route') return [{ kind: 'day', id: op.type === 'assign' ? op.dateId : op.record.dateId, dateId: op.type === 'assign' ? op.dateId : op.record.dateId }];
  if (op.type === 'edit_activity') return [{ kind: 'activity', id: op.stopId, parentId: op.planId, dateId: op.dateId }];
  if (op.type === 'edit_itinerary') return op.changes.flatMap((c): Scope[] => c.action === 'add_day' ? [{ kind: 'day', id: c.day.dateId, dateId: c.day.dateId }] : c.action === 'reorder' ? [{ kind: 'day', id: c.dateId, dateId: c.dateId }] : [{ kind: 'activity', id: c.action === 'insert' ? c.activity.id : c.activityId, dateId: 'dateId' in c ? c.dateId : null }]);
  if (op.type === 'choose_option') return [{ kind: 'decision', id: op.record.decisionPointId, dateId: null }];
  if (op.type === 'upsert_lodging_arrangements') return op.changes.map((c) => ({ kind: 'lodging', id: c.lodgingId, dateId: null }));
  if (op.type === 'reconcile_journey_context') return [...(op.displayMetadata ? global() : []), ...(op.lodgings ? scopes({ type: 'upsert_lodging_arrangements', ...op.lodgings }, journeyId) : []), ...(op.dayRoutes || []).map((d): Scope => ({ kind: 'day', id: d.dateId, dateId: d.dateId })), ...(op.routeActivities || []).map((a): Scope => ({ kind: 'activity', id: a.activity.id, dateId: a.dateId }))];
  return global();
}
function originalSource(op: TripOperation): unknown {
  if ('source' in op) return op.source;
  if ('record' in op && 'source' in op.record) return op.record.source;
  if (op.type === 'reconcile_journey_context') return { displayMetadata: op.displayMetadata?.source || null, lodgings: op.lodgings?.source || null, routeActivities: (op.routeActivities || []).map((r) => r.source), dayRoutes: (op.dayRoutes || []).map((r) => r.source) };
  return null;
}
export function businessReasons(op: TripOperation, text: string) {
  const rows: { text: string; source: unknown; origin: Reason['origin']; subjectId: string | null; planId?: string; dateId?: string }[] = [{ text, source: originalSource(op), origin: 'change', subjectId: null }];
  if ('record' in op && 'reason' in op.record && typeof op.record.reason === 'string') rows.push({ text: op.record.reason, source: 'source' in op.record ? op.record.source : null, origin: 'decision', subjectId: op.record.id });
  if ('reason' in op && typeof op.reason === 'string') rows.push({ text: op.reason, source: originalSource(op), origin: op.type === 'set_plan_dates' ? 'correction' : 'decision', subjectId: 'decisionPointId' in op ? op.decisionPointId : 'planId' in op ? op.planId : 'optionId' in op ? op.optionId : null });
  if (op.type === 'assign') for (const change of op.commitmentChanges || []) rows.push({ text: change.reason, source: null, origin: 'commitment', subjectId: change.planId + ':' + change.dateId, planId: change.planId, dateId: change.dateId });
  const lodgings = op.type === 'upsert_lodging_arrangements' ? op : op.type === 'reconcile_journey_context' ? op.lodgings : undefined;
  for (const change of lodgings?.changes || []) {
    if (change.correctionReason) rows.push({ text: change.correctionReason, source: lodgings!.source, origin: 'correction', subjectId: change.lodgingId });
    for (const r of change.reservations) if (r.correctionReason) rows.push({ text: r.correctionReason, source: r.source, origin: 'correction', subjectId: r.id });
  }
  return rows;
}
/** Semantic summary only: no history patch, alternate authority, cleanup or new backups. */
export function previewHistoryMaintenance(input: unknown, queryInput: unknown) {
  const q = historyMaintenanceInputSchema.safeParse(queryInput);
  if (!q.success) throw new TripError('invalid_history_maintenance', 'Supply explicit asOf, expectedRevision and expectedStateHash');
  const state = parseState(input); const query = q.data; const identity = storageIdentity(state);
  if (state.revision !== query.expectedRevision || identity.stateHash !== query.expectedStateHash) throw new TripError('revision_conflict', 'Journey changed; read it again before reviewing maintenance');
  const asOf = Date.parse(query.asOf); if (auditEvents(state).some((e) => Date.parse(e.at) > asOf)) throw new TripError('future_maintenance_state', 'asOf must follow every change in the supplied current snapshot');
  const c = state.content; const linked = new Set(c.memory.facts.flatMap((f) => f.experience?.changeCommitIds || []));
  const recentIds = new Set(auditEvents(state).slice(-policy.recentChanges).map((e) => e.id));
  const cards = new Map<string, Card>(); const eligible: ReturnType<typeof auditEvents> = []; const protectedEvents: { id: string; category: 'business_record' | 'experience_reference'; reason: string; actor: string; at: string; operationType: string; operation: TripOperation; businessReasons: ReturnType<typeof businessReasons> }[] = []; const recent: ReturnType<typeof auditEvents> = [];
  for (const e of auditEvents(state)) {
    if (recentIds.has(e.id)) { recent.push(e); continue; }
    if (!routine.has(e.operation.type) || e.operation.type === 'assign' && Boolean(e.operation.commitmentChanges?.length) || linked.has(e.id)) { protectedEvents.push({ id: e.id, category: linked.has(e.id) ? 'experience_reference' : 'business_record', reason: e.reason, actor: e.actor, at: e.at, operationType: e.operation.type, operation: e.operation, businessReasons: businessReasons(e.operation, e.reason).map((r) => ({ ...r, actor: e.actor, at: e.at })) }); continue; }
    eligible.push(e);
    for (const scope of new Map(scopes(e.operation, c.snapshot.trip.id).map((s) => [canonical(s), s])).values()) {
      const key = canonical(scope); let card = cards.get(key);
      if (!card) { card = { id: hash({ policyVersion: policy.version, scope }), scope, adjustmentCount: 0, firstAt: e.at, lastAt: e.at, operationTypes: [], reasons: [], currentPlanIsAuthoritative: true, impliesVisitedOrSkipped: false }; cards.set(key, card); }
      card.adjustmentCount++; if (Date.parse(e.at) < Date.parse(card.firstAt)) card.firstAt = e.at; if (Date.parse(e.at) > Date.parse(card.lastAt)) card.lastAt = e.at;
      if (!card.operationTypes.includes(e.operation.type)) card.operationTypes.push(e.operation.type);
      for (const row of businessReasons(e.operation, e.reason)) {
        const reason = card.reasons.find((r) => r.text === row.text && r.actor === e.actor && r.origin === row.origin && r.subjectId === row.subjectId && canonical(r.source) === canonical(row.source));
        if (reason) { reason.occurrences++; if (Date.parse(e.at) < Date.parse(reason.firstAt)) reason.firstAt = e.at; if (Date.parse(e.at) > Date.parse(reason.lastAt)) reason.lastAt = e.at; }
        else card.reasons.push({ ...row, actor: e.actor, occurrences: 1, firstAt: e.at, lastAt: e.at });
      }
    }
  }
  const entityRefs = new Map<string, { kind: string; id: string; parentId?: string; labels: string[] }>();
  const remember = (kind: string, id: string, label: string, parentId?: string) => { const key = canonical([kind, id, parentId || null]); const ref = entityRefs.get(key) || { kind, id, ...(parentId ? { parentId } : {}), labels: [] }; if (!ref.labels.includes(label)) ref.labels.push(label); entityRefs.set(key, ref); };
  for (const content of [c, ...historicalSources(state)]) {
    for (const p of content.snapshot.trip.plans) { remember('plan', p.id, p.name); for (const a of p.stops || []) if (typeof a === 'object' && a.id) remember('activity', a.id, a.title || a.id, p.id); }
    for (const l of content.snapshot.trip.lodgings) remember('lodging', l.id, l.name);
    for (const d of [...(content.itinerary?.baseline.days || []), ...(content.itinerary?.current || [])]) for (const a of d.activities) remember('activity', a.id, a.title, d.planId);
    for (const a of content.linkage?.actualChanges || []) for (const r of a.replacementActivities) remember('activity', r.id, r.title, a.actualId);
  }
  for (const a of c.linkage?.routeActivities || []) remember('activity', a.activity.id, a.activity.title);
  const summaries = [...cards.values()]; const receiptIndex = auditEvents(state).map((e) => ({ id: e.id, revision: e.revision, requestHash: e.requestHash }));
  const report = { ok: true, saved: false, mode: 'dry_run', applicationImplemented: false, maintenanceContractVersion: 1, policy, asOf: query.asOf,
    base: { journeyId: c.snapshot.trip.id, revision: state.revision, ...identity },
    effect: { totalChanges: auditEvents(state).length, olderAdjustmentsToSummarize: eligible.length, summaryCards: summaries.length, recentFullChanges: recent.length, protectedBusinessChanges: protectedEvents.length, deletedEvents: 0, reclaimedStorageBytes: 0 },
    longTerm: { currentContentHash: hash(c), currentPlan: 'keep_current_schedule_and_routes', keyDecisionReasons: { planning: c.memory.decisions.map((d) => ({ id: d.id, planId: d.planId, dateId: d.dateId || null, disposition: d.disposition, reason: d.reason, source: d.source })), options: c.itinerary?.optionDecisions || [], lifecycle: (c.itinerary?.decisionPoints || []).filter((d) => d.lifecycle).map((d) => ({ id: d.id, lifecycle: d.lifecycle })) }, actualReports: 'keep_explicit_reports_only', locationIdentity: [...entityRefs.values()], businessMemory: { facts: c.memory.facts.length, experiences: c.memory.facts.filter((f) => f.experience).length, preferences: c.memory.preferences.length, decisionsAndReasons: c.memory.decisions.length, progress: c.memory.progress.length, unresolvedIssues: c.memory.issues.filter((i) => i.status === 'open').length, actualReports: c.itinerary?.actual.length || 0, reservations: c.snapshot.trip.lodgings.reduce((n, l) => n + (l.reservations?.length || 0), 0) }, factsAndUnknownsUnchanged: true },
    summaries,
    recovery: { keepRecentFullEventIds: recent.map((e) => e.id), oldestRetainedRevision: recent[0]?.revision || state.revision, rollbackPolicy: 'one_replaceable_recovery_checkpoint_until_the_next_verified_maintenance', additionalBackupCreated: false },
    technicalMemory: { receipts: receiptIndex, protectedCommitRefs: protectedEvents, evidenceWatermarks: 'retain_existing_all-history_source_watermarks_before_any_compaction', historicalEntitySources: 'retain_identity_versions_needed_by_experience_route_and_reservation_references', pendingReminderAttempts: (c.linkage?.reminderAttempts || []).filter((a) => a.outcome === 'unknown').map((a) => a.id), currentStateCasUnchanged: true },
    nextStep: 'Review this dry-run, then explicitly use prepare-maintenance to generate a codec2 candidate with all metadata/receipts/watermarks/references retained. Local commit-maintenance or host same-identity native CAS adopts that candidate after recovery review. This report cannot be applied as journey state.',
    limitations: ['No visited/skipped outcome is inferred from a changed or removed plan', 'Only exact reason/actor/source duplicates are counted together; distinct reasons and explicit vetoes remain', 'Recent full history means a recovery window, not permission to undo protected external linkage', 'This pass does not delete events, shrink the authority or create a backup series'],
  };
  const result = { ...report, maintenanceToken: hash(report) };
  if (!historyMaintenanceOutputSchema.safeParse(result).success) throw new TripError('invalid_history_maintenance', 'Generated maintenance report violated its output contract');
  return result;
}

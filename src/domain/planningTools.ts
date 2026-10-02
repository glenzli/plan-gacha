import * as z from 'zod/v4';
import { evidenceSourceSchema } from './evidence';
import { addDays } from './date';
import { normalizePlan } from './plan';
import { normalizeTripLodgings } from './lodging';
import { normalizeSchedule } from './trip';
import { validateLodgingReferences } from './tripImport';
import { evaluatePlanning, previewPlanAssignment, type PlanningContext } from './planningCore';
import { rankPlanCandidates } from './planCandidates';
import { parseChecklistText, CHECKLIST_STATUS } from './checklist';
import { getDateHardIssues } from './planning';
import { evaluateWeather } from './planWeather';

const dateId = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Use a real YYYY-MM-DD calendar date');
const id = z.string().trim().min(1).max(200).refine((value) => !['__proto__', 'constructor', 'prototype'].includes(value), 'Reserved ID');
const location = z.union([z.string(), z.looseObject({ label: z.string().optional(), query: z.string().optional(), address: z.string().optional(), latitude: z.number().finite().optional(), longitude: z.number().finite().optional() })]);
const plan = z.looseObject({
  id, name: z.string().trim().min(1), priority: z.enum(['must', 'preferred', 'backup', 'optional']).optional(),
  description: z.string().optional(), location: location.optional(),
  stops: z.array(z.union([z.string(), z.looseObject({ id: id.optional(), title: z.string().optional(), time: z.string().optional(), location: location.optional(), weatherRelevant: z.boolean().optional() })])).optional(),
  available_dates: z.array(dateId).optional(), closed_dates: z.array(dateId).optional(), conflicts: z.array(id).optional(),
  weather_rules: z.object({ best: z.array(z.string()), ok: z.array(z.string()), blocked: z.array(z.string()) }).optional(),
  bookings: z.array(z.looseObject({ id: id.optional(), title: z.string(), type: z.string().optional(), status: z.enum(['pending', 'done', 'none']).optional(), dateId: dateId.optional(), stopIds: z.array(id).min(1).max(50).refine((ids) => new Set(ids).size === ids.length).optional(), stopLinkSource: evidenceSourceSchema.optional() })).optional(),
  lodging: z.object({ mode: z.enum(['inherit', 'options', 'none']), optionIds: z.array(id), preferredId: z.string() }).optional(),
});
export const scheduleEntrySchema = z.object({ planId: z.string(), status: z.literal('abandoned').optional(), lodgingId: z.string().optional(), lodgingLocked: z.boolean().optional(), planLocked: z.boolean().optional() });
const scheduleSchema = z.record(dateId, scheduleEntrySchema);
const stay = z.looseObject({ id, name: z.string(), checkIn: z.union([dateId, z.literal('')]).optional(), checkOut: z.union([dateId, z.literal('')]).optional(), location: location.optional(), defaultForTrip: z.boolean().optional(), reservations: z.array(z.looseObject({ id, checkIn: dateId, checkOut: dateId, status: z.enum(['pending', 'booked', 'cancelled']) })).optional() });
const forecastDay = z.object(Object.fromEntries(['weatherCode', 'tempMin', 'tempMax', 'apparentMin', 'apparentMax', 'precipitationSum', 'precipitationProbability', 'windMax'].map((key) => [key, z.number().finite().optional()])));
export const planningSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1), todayId: dateId,
  trip: z.object({ id, name: z.string().optional(), startDateStr: dateId, tripDays: z.number().int().min(1).max(30), plans: z.array(plan).max(200), schedule: scheduleSchema, lodgings: z.array(stay).max(100), checklistText: z.string(), checklistState: z.record(z.string(), z.enum(['todo', 'done', 'skipped'])), archived: z.boolean() }),
  weatherData: z.record(z.string(), z.looseObject({ dailyByDate: z.record(dateId, forecastDay.nullish()).optional(), fetchedAt: z.union([z.number().finite(), z.string()]).optional() })),
});
export type PlanningSnapshot = z.infer<typeof planningSnapshotSchema>;
export const assignmentOperationSchema = z.strictObject({ type: z.literal('assign'), dateId, planId: id, commitmentChanges: z.array(z.strictObject({ dateId, planId: id, reason: z.string().trim().min(1).max(1000) })).max(30).optional() });
export type AssignmentOperation = z.infer<typeof assignmentOperationSchema>;
const token = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const planningProposalSchema = z.strictObject({ schemaVersion: z.literal(1), snapshotToken: token, operation: assignmentOperationSchema });
export const toolNames = ['get_context', 'evaluate_plan', 'rank_candidates', 'preview_changes'] as const;
export type PlanningToolName = typeof toolNames[number];
const baseInput = z.strictObject({ snapshot: planningSnapshotSchema, expectedSnapshotToken: token.optional() });
export const planningToolSchemas = {
  get_context: baseInput,
  evaluate_plan: baseInput,
  rank_candidates: baseInput.extend({ dateId, language: z.enum(['zh', 'en']).optional() }),
  preview_changes: baseInput.extend({ operation: assignmentOperationSchema, expectedSnapshotToken: token }),
};
const riskSchema = z.object({ code: z.enum(['scheduled_rule_violation', 'must_no_feasible_date', 'booking_incomplete', 'booked_plan_unscheduled', 'booked_date_mismatch']), planId: id, dateId: dateId.optional(), level: z.string(), title: z.string(), reasons: z.array(z.string()) });
const candidateSchema = z.object({ planId: id, name: z.string(), canAssign: z.boolean(), reasonCodes: z.array(z.enum(['date_not_allowed', 'closed_or_unavailable', 'plan_already_visited', 'conflicts_with_visited_plan', 'booked_plan_displaced', 'locked_plan_displaced'])), noteCodes: z.array(z.string()), score: z.number(), scoreBreakdown: z.object({ priority: z.number(), weather: z.number(), clearPenalty: z.number(), newRiskPenalty: z.number() }), weatherLevel: z.string(), weatherOverride: z.boolean(), isCurrent: z.boolean(), assignedDateId: z.string(), clears: z.array(z.object({ dateId, planId: id, reasonCode: z.enum(['same_plan_moved', 'plan_conflict']) })), newRisks: z.array(riskSchema) });
const lodgingNightSchema = z.object({ lodgingId: z.string().nullable(), name: z.string(), status: z.enum(['selected', 'none', 'missing', 'choose']), locked: z.boolean(), conflict: z.boolean() });
const lodgingImpactSchema = z.object({ dateId, before: lodgingNightSchema, after: lodgingNightSchema, nextMorning: z.string(), tasks: z.array(z.object({ type: z.enum(['book', 'review', 'choose', 'missing', 'locked']), hotelName: z.string(), partial: z.boolean(), cancelBy: z.string() })) });
const dataSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('context'), tripId: id, todayId: dateId, dates: z.array(dateId), plans: z.array(z.object({ id, name: z.string(), priority: z.string() })), pendingChecklistCount: z.number(), capabilities: z.array(z.string()), limitations: z.array(z.string()) }),
  z.object({ kind: z.literal('evaluation'), risks: z.array(riskSchema), scheduledIssues: z.array(z.object({ dateId, planId: id, issues: z.array(z.string()) })) }),
  z.object({ kind: z.literal('ranking'), dateId, candidates: z.array(candidateSchema) }),
  z.object({ kind: z.literal('preview'), commitmentImpacts: z.array(z.object({ dateId, planId: id, bookingIds: z.array(z.string()), bookingTitles: z.array(z.string()), bookingDateUncertain: z.boolean(), planLocked: z.boolean(), accepted: z.boolean(), reason: z.string() })), canApply: z.boolean(), reasonCodes: z.array(z.string()), weatherOverride: z.boolean(), proposal: planningProposalSchema, changes: z.array(z.object({ dateId, before: scheduleEntrySchema.nullable(), after: scheduleEntrySchema.nullable() })), clears: z.array(z.object({ dateId, planId: id, reasonCode: z.enum(['same_plan_moved', 'plan_conflict']) })), newRisks: z.array(riskSchema), lodgingImpacts: z.array(lodgingImpactSchema), nextSchedule: scheduleSchema }),
]);
export const planningToolResponseSchema = z.discriminatedUnion('ok', [
  z.object({ schemaVersion: z.literal(1), ok: z.literal(true), snapshotToken: token, data: dataSchema }),
  z.object({ schemaVersion: z.literal(1), ok: z.literal(false), error: z.object({ code: z.enum(['invalid_schema', 'unknown_id', 'unknown_date', 'duplicate_id', 'stale_snapshot', 'archived_snapshot', 'invalid_reference', 'invalid_lodging_dates']), message: z.string(), paths: z.array(z.string()).optional() }) }),
]);
export type PlanningToolResponse = z.infer<typeof planningToolResponseSchema>;
class PlanningInputError extends Error {
  constructor(readonly code: Extract<PlanningToolResponse, { ok: false }>['error']['code'], message: string) { super(message); }
}
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, part]) => part !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, part]) => `${JSON.stringify(key)}:${canonicalJson(part)}`).join(',')}}`;
  return JSON.stringify(value);
}
/** Content identity, not a persisted revision or a remote CAS. Includes clock, weather and checklist. */
export async function getSnapshotToken(snapshot: PlanningSnapshot) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(snapshot)));
  return `sha256:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')}`;
}
export function preparePlanningContext(snapshot: PlanningSnapshot): PlanningContext {
  const tripDates = Array.from({ length: snapshot.trip.tripDays }, (_, index) => ({ id: addDays(snapshot.trip.startDateStr, index) }));
  const plans = snapshot.trip.plans.map((value, index) => normalizePlan(value, index, tripDates, () => { throw new PlanningInputError('invalid_schema', 'Plan IDs must be supplied'); }));
  for (const plan of plans) for (const booking of plan.bookings) if (booking.dateId && !dateId.safeParse(booking.dateId).success) throw new PlanningInputError('invalid_schema', 'Booking dates must be real YYYY-MM-DD dates');
  for (const [index, plan] of plans.entries()) for (const booking of plan.bookings) if (booking.stopIds) {
    if (new Set(plan.bookings.map((item) => item.id)).size !== plan.bookings.length) throw new PlanningInputError('duplicate_id', 'Linked bookings require unique booking IDs');
    const rawStops = snapshot.trip.plans[index].stops || [];
    if (rawStops.some((stop) => typeof stop === 'string' || !stop.id)) throw new PlanningInputError('invalid_reference', 'Linked activities require explicit stable IDs');
    if (!z.array(id).min(1).max(50).safeParse(booking.stopIds).success || new Set(booking.stopIds).size !== booking.stopIds.length
      || booking.stopLinkSource && !evidenceSourceSchema.safeParse(booking.stopLinkSource).success) throw new PlanningInputError('invalid_schema', 'Booking activity linkage schema is invalid');
    const stopIds = new Set(plan.stops.map((stop) => stop.id));
    if (stopIds.size !== plan.stops.length) throw new PlanningInputError('duplicate_id', 'Linked activities require unique stop IDs');
    if (booking.stopIds.some((id) => !stopIds.has(id))) throw new PlanningInputError('invalid_reference', 'Booking references an unknown activity');
  }
  const lodgings = normalizeTripLodgings(snapshot.trip.lodgings);
  for (const items of [plans, lodgings]) if (new Set(items.map((item) => item.id)).size !== items.length) throw new PlanningInputError('duplicate_id', 'Snapshot IDs must be unique within each entity type');
  const ids = new Set(plans.map((item) => item.id));
  const dates = new Set(tripDates.map((item) => item.id));
  for (const plan of plans) for (const conflict of plan.conflicts) if (!ids.has(conflict) || conflict === plan.id) throw new PlanningInputError('invalid_reference', `Invalid conflict reference: ${conflict}`);
  for (const [date, entry] of Object.entries(snapshot.trip.schedule)) {
    if (!dates.has(date)) throw new PlanningInputError('unknown_date', `Schedule date outside trip: ${date}`);
    if (entry.planId && !ids.has(entry.planId)) throw new PlanningInputError('unknown_id', `Unknown schedule plan: ${entry.planId}`);
  }
  for (const hotel of lodgings) {
    if ((hotel.checkIn || hotel.checkOut) && !(hotel.checkIn && hotel.checkOut > hotel.checkIn)
      || hotel.reservations?.some((reservation) => reservation.checkOut <= reservation.checkIn)) throw new PlanningInputError('invalid_lodging_dates', `Invalid stay dates: ${hotel.id}`);
  }
  const schedule = normalizeSchedule(Object.fromEntries(Object.entries(snapshot.trip.schedule).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
  try { validateLodgingReferences(plans, lodgings, schedule); } catch { throw new PlanningInputError('invalid_reference', 'Unknown lodging reference'); }
  return { plans, lodgings, tripDates, schedule, weatherData: snapshot.weatherData, todayId: snapshot.todayId };
}
const compactRisk = (risk: ReturnType<typeof evaluatePlanning>[number]) => ({
  code: risk.title === '已订预约未在行程中' ? 'booked_plan_unscheduled' as const : risk.title === '已订预约日期未保留' ? 'booked_date_mismatch' as const : risk.title === '预约/订票未完成' ? 'booking_incomplete' as const : risk.title === '必去计划没有可安排日期' ? 'must_no_feasible_date' as const : 'scheduled_rule_violation' as const,
  planId: risk.plan.id, ...(risk.dateId ? { dateId: risk.dateId } : {}), level: risk.level, title: risk.title, reasons: risk.reasons || [],
});
const compactClear = (item: ReturnType<typeof previewPlanAssignment>['clears'][number]) => ({ dateId: item.dateId, planId: item.plan.id, reasonCode: item.reason === '同一计划被移动' ? 'same_plan_moved' as const : 'plan_conflict' as const });
const compactLodgingImpact = (impact: ReturnType<typeof previewPlanAssignment>['lodgingImpacts'][number]) => {
  const night = (value: typeof impact.before) => ({ lodgingId: value.selected?.id || null, name: value.selected?.name || '', status: value.status, locked: value.locked, conflict: value.conflict });
  return { dateId: impact.dateId, before: night(impact.before), after: night(impact.after), nextMorning: impact.nextMorning, tasks: impact.tasks.map((task) => ({ type: task.type, hotelName: task.hotel?.name || '', partial: Boolean(task.partial), cancelBy: task.reservation?.cancelBy || '' })) };
};
export function getScheduleChanges(before: PlanningContext['schedule'], after: PlanningContext['schedule']) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().filter((date) => canonicalJson(before[date] ?? null) !== canonicalJson(after[date] ?? null))
    .map((dateId) => ({ dateId, before: before[dateId] || null, after: after[dateId] || null }));
}
/** No storage, fetch, random IDs or implicit clock; every call uses only its argument. */
export async function callPlanningTool(name: PlanningToolName, input: unknown): Promise<PlanningToolResponse> {
  try {
    const parsed = planningToolSchemas[name].safeParse(input);
    if (!parsed.success) return { schemaVersion: 1, ok: false, error: { code: 'invalid_schema', message: 'Input did not match the planning tool schema', paths: parsed.error.issues.map((issue) => issue.path.join('.')) } };
    const args = { snapshot: parsed.data.snapshot, expectedSnapshotToken: parsed.data.expectedSnapshotToken };
    const rankArgs = name === 'rank_candidates' ? planningToolSchemas.rank_candidates.parse(parsed.data) : null;
    const previewArgs = name === 'preview_changes' ? planningToolSchemas.preview_changes.parse(parsed.data) : null;
    const context = preparePlanningContext(args.snapshot);
    const snapshotToken = await getSnapshotToken(args.snapshot);
    if (args.expectedSnapshotToken && args.expectedSnapshotToken !== snapshotToken) throw new PlanningInputError('stale_snapshot', 'Snapshot content changed; export a fresh snapshot and preview again');
    let data: z.infer<typeof dataSchema>;
    if (name === 'get_context') {
      const groups = parseChecklistText(args.snapshot.trip.checklistText);
      data = { kind: 'context', tripId: args.snapshot.trip.id, todayId: context.todayId, dates: context.tripDates.map((date) => date.id), plans: context.plans.map(({ id, name, priority }) => ({ id, name, priority })), pendingChecklistCount: groups.flatMap((group) => group.items).filter((item) => ![CHECKLIST_STATUS.done, CHECKLIST_STATUS.skipped].includes(args.snapshot.trip.checklistState[item.id] as typeof CHECKLIST_STATUS.done)).length, capabilities: ['date_rules', 'explicit_conflicts', 'weather_risk', 'candidate_ranking', 'assignment_preview', 'booked_arrangement_guard', 'explicit_commitment_change_review'], limitations: ['no_minute_level_transport_solver', 'no_live_browser_state', 'no_persistence', 'content_token_is_not_remote_revision'] };
    } else if (name === 'evaluate_plan') {
      const plansById = new Map(context.plans.map((plan) => [plan.id, plan]));
      data = { kind: 'evaluation', risks: evaluatePlanning(context).map(compactRisk), scheduledIssues: Object.entries(context.schedule).filter(([, entry]) => entry.planId && entry.status !== 'abandoned').map(([dateId, entry]) => ({ dateId, planId: entry.planId, issues: getDateHardIssues(plansById.get(entry.planId)!, dateId, context.schedule, plansById, context.weatherData, evaluateWeather, { ignoreOccupancy: true }).filter((issue): issue is string => Boolean(issue)) })) };
    } else {
      const date = rankArgs?.dateId || previewArgs?.operation.dateId || '';
      if (!context.tripDates.some((item) => item.id === date)) throw new PlanningInputError('unknown_date', `Date outside trip: ${date}`);
      const candidates = rankPlanCandidates(context, date, rankArgs?.language || 'zh', undefined, previewArgs?.operation.commitmentChanges);
      if (name === 'rank_candidates') data = { kind: 'ranking', dateId: date, candidates: candidates.map((candidate) => ({ planId: candidate.plan.id, name: candidate.plan.name, canAssign: candidate.canAssign, reasonCodes: candidate.reasonCodes, noteCodes: candidate.noteCodes, score: candidate.score, scoreBreakdown: candidate.scoreBreakdown, weatherLevel: candidate.weather.level, weatherOverride: candidate.weatherOverride, isCurrent: candidate.isCurrent, assignedDateId: candidate.assignedDateId, clears: candidate.clears.map(compactClear), newRisks: candidate.newRisks.map(compactRisk) })) };
      else {
        if (!previewArgs) throw new PlanningInputError('invalid_schema', 'An operation is required');
        if (args.snapshot.trip.archived) throw new PlanningInputError('archived_snapshot', 'Tool proposals do not change archived trips');
        const candidate = candidates.find((item) => item.plan.id === previewArgs.operation.planId);
        if (!candidate) throw new PlanningInputError('unknown_id', `Unknown plan: ${previewArgs.operation.planId}`);
        const preview = previewPlanAssignment(context, date, candidate.plan, undefined, previewArgs.operation.commitmentChanges);
        const acknowledgments = previewArgs.operation.commitmentChanges || [];
        if (new Set(acknowledgments.map((item) => `${item.dateId}:${item.planId}`)).size !== acknowledgments.length
          || acknowledgments.some((item) => !preview.commitmentImpacts.some((impact) => impact.dateId === item.dateId && impact.planId === item.planId))) throw new PlanningInputError('invalid_reference', 'Commitment acknowledgments must identify exactly the affected current arrangements');
        const canApply = candidate.canAssign && preview.blocks.length === 0;
        data = { kind: 'preview', commitmentImpacts: preview.commitmentImpacts, canApply, reasonCodes: candidate.reasonCodes, weatherOverride: candidate.weatherOverride, proposal: { schemaVersion: 1, snapshotToken, operation: previewArgs.operation }, changes: canApply ? getScheduleChanges(context.schedule, preview.nextSchedule) : [], clears: canApply ? preview.clears.map(compactClear) : [], newRisks: canApply ? preview.nextRisks.map(compactRisk) : [], lodgingImpacts: canApply ? preview.lodgingImpacts.map(compactLodgingImpact) : [], nextSchedule: canApply ? preview.nextSchedule : context.schedule };
      }
    }
    return planningToolResponseSchema.parse({ schemaVersion: 1, ok: true, snapshotToken, data });
  } catch (error) {
    if (error instanceof PlanningInputError) return { schemaVersion: 1, ok: false, error: { code: error.code, message: error.message } };
    throw error;
  }
}

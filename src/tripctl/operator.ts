import * as z from 'zod/v4';
import { experienceSearchSchema, experienceSearchRequestSchema, guideDraftSchema } from './experienceSchema';
import { operationSchema, mutationSchema, TripError } from './schema';
import { parseState, inspect, preview, hash, TRIPCTL_CORE_VERSION } from './engine';
import { preparePlanningContext, planningSnapshotSchema, toolNames } from '../domain/planningTools';
import { analyseItinerary } from './itinerary';

export const operatorContextSchema = z.strictObject({ asOf: z.iso.datetime({ offset: true }), dateId: planningSnapshotSchema.shape.todayId.optional(), candidateLimit: z.number().int().min(1).max(20).optional() });
const commands = ['experiences', 'experience-search', 'guide-draft', 'init', 'read', 'context', 'schema', 'check', 'rank', 'preview', 'apply', 'stage', 'history', 'verify', 'validate-request', 'route-query', 'route-import', 'routes', 'itinerary', 'itinerary-token', 'itinerary-report'];
/** Discovery reflects the runtime schemas. Cross-field/state refinements still run in preview. */
export function getOperatorSchema(operationType?: string) {
  const operations = operationSchema.options.map((option) => option.shape.type.value);
  const selected = operationType ? operationSchema.options.find((option) => option.shape.type.value === operationType) : undefined;
  if (operationType && !selected) throw new TripError('unknown_operation', 'Use schema to discover supported operations');
  return { ok: true, schemaVersion: 1, coreVersion: TRIPCTL_CORE_VERSION, saved: false, commands, operations, statelessMcpTools: toolNames,
    ...(selected ? { operation: z.toJSONSchema(selected) } : { contextInput: z.toJSONSchema(operatorContextSchema), experienceInputs: { search: z.toJSONSchema(experienceSearchSchema), multiJourneySearch: z.toJSONSchema(experienceSearchRequestSchema), guideDraft: z.toJSONSchema(guideDraftSchema) }, mutationEnvelope: z.toJSONSchema(mutationSchema.omit({ operation: true })) }),
    validation: 'Runtime refinements, IDs, current state and preview guards remain authoritative; JSON Schema is structural discovery.',
    persistence: 'preview/context/schema do not write; stage creates a candidate, saved:false; external persistence requires same-identity CAS and readback.' };
}
/** A bounded candidate view without full audit snapshots; all unresolved issues/deadlines stay visible. */
export async function readOperatorContext(stateInput: unknown, input: unknown) {
  const parsed = operatorContextSchema.safeParse(input);
  if (!parsed.success) throw new TripError('invalid_context', 'Supply explicit asOf, optional trip date and candidateLimit 1..20');
  const state = parseState(stateInput); const { asOf, dateId, candidateLimit = 5 } = parsed.data;
  const context = preparePlanningContext(state.content.snapshot);
  if (dateId && !context.tripDates.some((date) => date.id === dateId)) throw new TripError('unknown_date', 'Date outside the journey');
  const result = await inspect(state, 'evaluate_plan');
  if (!result.ok) throw new TripError(result.error.code, result.error.message);
  const ranking = dateId ? await inspect(state, 'rank_candidates', dateId) : null;
  if (ranking && !ranking.ok) throw new TripError(ranking.error.code, ranking.error.message);
  const candidates = ranking?.ok && ranking.data.kind === 'ranking' ? ranking.data.candidates : [];
  const applications = [];
  for (const candidate of candidates.slice(0, candidateLimit)) {
    const proposal = await preview(state, { type: 'assign', dateId: dateId!, planId: candidate.planId }, state.revision);
    applications.push({ ...candidate, application: { canApply: proposal.canApply, reasonCodes: proposal.reasonCodes, weatherOverride: proposal.weatherOverride,
      requiredOperation: proposal.reasonCodes.includes('itinerary_operation_required') ? 'edit_itinerary' : 'assign' }, readiness: 'not_verified' });
  }
  const itinerary = state.content.itinerary;
  const analysis = itinerary ? analyseItinerary(itinerary, { asOf, ...(dateId && itinerary.current.some((day) => day.dateId === dateId) ? { dateId } : {}) }, state.content) : null;
  return { ok: true, schemaVersion: 1, coreVersion: TRIPCTL_CORE_VERSION, revision: state.revision, stateHash: hash(state), saved: false, asOf,
    trip: { id: state.content.snapshot.trip.id, archived: state.content.snapshot.trip.archived, sourceTimeZones: [state.content.snapshot.trip.timeZone, state.content.snapshot.trip.timezone, state.content.snapshot.trip.time_zone].filter((v) => v !== undefined), todayId: context.todayId, dates: context.tripDates.map((date) => date.id), selectedDate: dateId || null },
    schedule: state.content.snapshot.trip.schedule, lodgings: state.content.snapshot.trip.lodgings,
    dateEvidence: state.history.filter((event) => event.operation.type === 'set_plan_dates').map((event) => ({ revision: event.revision, operation: event.operation })), plans: context.plans.map(({ id, name, available_dates, closed_dates, bookings }) => ({ id, name, available_dates, closed_dates, bookings })),
    checklist: { text: state.content.snapshot.trip.checklistText, state: state.content.snapshot.trip.checklistState },
    memory: { ...state.content.memory, issues: state.content.memory.issues.filter((issue) => issue.status === 'open') },
    itinerary: itinerary ? { baselineDates: itinerary.baseline.days.map((day) => day.dateId), current: itinerary.current.filter((day) => !dateId || day.dateId === dateId), actual: itinerary.actual, commitments: itinerary.commitments, analysisScope: dateId && itinerary.current.some((day) => day.dateId === dateId) ? dateId : 'all_imported_days', analysis } : null,
    evaluation: result.data, candidates: { total: candidates.length, returned: applications.length, truncated: candidates.length > applications.length, items: applications },
    capabilities: getOperatorSchema().operations, limits: { commits: 200, maximumStoreBytes: 16 * 1024 * 1024 },
    omitted: ['full audit snapshots (history/read)', 'baseline activities and nonselected current days (read)', 'resolved issues (read)'],
    limitations: ['not_a_transport_solver', 'rank_is_not_application_permission', 'snapshot_weather_has_no_verified_freshness', 'source_is_caller_supplied', 'decision_completion_is_not_order_or_refund_verification', 'no_automatic_branch_or_order_execution', 'no_browser_state_access', 'no_implicit_network_or_persistence'],
  };
}

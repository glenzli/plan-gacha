import { previewPlanDates, PlanDatesError } from '../domain/planDates';
export const TRIPCTL_CORE_VERSION = 6;
import { canonical, hash } from './identity';
export { canonical, hash } from './identity';
import { validateItinerary, previewItineraryOperation } from './itinerary';
import { itineraryOperationSchema, ItineraryError } from './itinerarySchema';
import { assessWalkingFact } from './routeEvidence';
import { previewActivityChange, ActivityEditError } from '../domain/activityEditing';
import { evaluateWeather } from '../domain/planWeather';
import { callPlanningTool, getSnapshotToken, preparePlanningContext, planningSnapshotSchema, type PlanningToolResponse, type PlanningToolName } from '../domain/planningTools';
import { contentSchema, mutationSchema, operationSchema, tripStateSchema, TripError, type TripState, type TripContent, type TripOperation, type TripMutation } from './schema';
export function parseState(input: unknown): TripState {
  const parsed = tripStateSchema.safeParse(input);
  if (!parsed.success) throw new TripError('invalid_state', 'Journey state schema is invalid');
  const state = parsed.data; const context = preparePlanningContext(state.content.snapshot);
  const plans = new Set(context.plans.map((p) => p.id)); const dates = new Set(context.tripDates.map((d) => d.id));
  for (const entries of Object.values(state.content.memory)) {
    if (new Set(entries.map((e) => e.id)).size !== entries.length) throw new TripError('duplicate_id', 'Memory IDs must be unique within each category');
  }
  for (const item of [...state.content.memory.decisions, ...state.content.memory.progress]) {
    if (!plans.has(item.planId)) throw new TripError('unknown_id', 'Memory references an unknown plan');
    if (item.dateId && !dates.has(item.dateId)) throw new TripError('unknown_date', 'Memory references a date outside the journey');
  }
  for (const item of state.content.memory.issues) if (item.relatedPlanId && !plans.has(item.relatedPlanId)) throw new TripError('unknown_id', 'Issue references an unknown plan');
  if (state.history.length !== state.revision || state.history.some((event, index) => event.revision !== index + 1)
    || new Set(state.history.map((e) => e.id)).size !== state.history.length
    || state.history.some((event, i) => i > 0 && canonical(event.before) !== canonical(state.history[i - 1].after))
    || state.history.length > 0 && canonical(state.content) !== canonical(state.history.at(-1)!.after)) throw new TripError('invalid_history', 'History, revision and current state must agree');
  if (state.content.itinerary) validateItinerary(state.content.itinerary, state.content.snapshot);
  return state;
}
export function initialize(snapshot: unknown): TripState {
  const parsed = planningSnapshotSchema.parse(snapshot); preparePlanningContext(parsed);
  return { schemaVersion: 1, revision: 0, content: { snapshot: parsed, memory: { facts: [], preferences: [], decisions: [], progress: [], issues: [], mapFacts: [] } }, history: [] };
}
function assertPlan(content: TripContent, planId: string, dateId?: string) {
  const context = preparePlanningContext(content.snapshot);
  if (!context.plans.some((p) => p.id === planId)) throw new TripError('unknown_id', 'Unknown plan ID');
  if (dateId && !context.tripDates.some((d) => d.id === dateId)) throw new TripError('unknown_date', 'Date outside the journey');
}
function requireHuman(source: TripContent['memory']['preferences'][number]['source']) {
  if (source.kind === 'provider') throw new TripError('unconfirmed_decision', 'Provider observations do not establish user preferences, decisions or actual progress');
}
function insert<T extends { id: string }>(list: T[], item: T) {
  if (list.some((x) => x.id === item.id)) throw new TripError('duplicate_id', 'Record ID already exists; append an explicit superseding decision instead');
  list.push(item);
}
function rememberedBlocks(content: TripContent, operation: Extract<TripOperation, { type: 'assign' }>) {
  const blocks: string[] = [];
  // Newer explicit decisions supersede older decisions for the same plan/date scope.
  const decisions = new Map<string, TripContent['memory']['decisions'][number]>();
  for (const d of content.memory.decisions) decisions.set(`${d.planId}:${d.dateId || '*'}`, d);
  for (const d of decisions.values()) {
    if (d.disposition === 'excluded' && d.planId === operation.planId && (!d.dateId || d.dateId === operation.dateId)) blocks.push('confirmed_exclusion');
  }
  const progress = new Map<string, TripContent['memory']['progress'][number]>();
  for (const p of content.memory.progress) progress.set(`${p.planId}:${p.dateId}`, p);
  if ([...progress.values()].some((p) => p.planId === operation.planId && p.status === 'done' && p.dateId !== operation.dateId)) blocks.push('already_done');
  return blocks;
}
export async function inspect(stateInput: unknown, name: PlanningToolName, dateId?: string): Promise<PlanningToolResponse> {
  const state = parseState(stateInput);
  const result = await callPlanningTool(name, { snapshot: state.content.snapshot, ...(dateId ? { dateId } : {}) });
  if (result.ok && result.data.kind === 'ranking') for (const candidate of result.data.candidates) {
    const blocks = rememberedBlocks(state.content, { type: 'assign', planId: candidate.planId, dateId: result.data.dateId });
    if (blocks.length) { candidate.canAssign = false; candidate.noteCodes.push(...blocks); }
  }
  if (result.ok && result.data.kind === 'ranking') result.data.candidates.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || Number(b.canAssign) - Number(a.canAssign) || b.score - a.score);
  return result;
}
export async function preview(stateInput: unknown, operationInput: unknown, expectedRevision: number) {
  const state = parseState(stateInput); const parsed = operationSchema.safeParse(operationInput);
  if (!parsed.success) throw new TripError('invalid_operation', 'Operation schema is invalid');
  if (state.revision !== expectedRevision) throw new TripError('revision_conflict', `Expected revision ${expectedRevision}, current ${state.revision}`);
  const operation = parsed.data; const next = structuredClone(state.content); let detail: unknown = null; const blocks: string[] = []; let weatherOverride = false;
  if (state.content.snapshot.trip.archived) blocks.push('archived_trip');
  if (itineraryOperationSchema.safeParse(operation).success) {
    try {
      const result = previewItineraryOperation(next.snapshot, next.itinerary, operation);
      blocks.push(...result.blocks); detail = result.detail; weatherOverride = result.weatherOverride;
      for (const date of result.changedDays) {
        const planId = state.content.snapshot.trip.schedule[date]?.planId;
        for (const d of new Map(next.memory.decisions.map((x) => [`${x.planId}:${x.dateId || '*'}`, x])).values()) if (d.planId === planId && (!d.dateId || d.dateId === date) && d.disposition === 'confirmed') blocks.push('confirmed_plan_change');
        for (const p of new Map(next.memory.progress.map((x) => [`${x.planId}:${x.dateId}`, x])).values()) if (p.planId === planId && p.dateId === date && p.status === 'done') blocks.push('completed_plan_change');
      }
      if (!blocks.length) { next.itinerary = result.nextItinerary; next.snapshot = result.nextSnapshot; }
    } catch (error) { if (error instanceof ItineraryError) throw new TripError(error.code, error.message); throw error; }
  } else if (operation.type === 'set_plan_dates') {
    // Evidence is caller supplied. History prevents older/equal-time contradictory reports
    // from superseding accepted restrictions; it cannot authenticate provider observations.
    const touched = new Set([...(operation.closeDates || []), ...(operation.reopenDates || [])]);
    for (const event of state.history) {
      const prior = event.operation;
      if (prior.type === 'set_plan_dates' && prior.planId === operation.planId
        && (operation.availableDates || prior.availableDates || [...(prior.closeDates || []), ...(prior.reopenDates || [])].some((date) => touched.has(date)))
        && Date.parse(operation.source.observedAt) <= Date.parse(prior.source.observedAt)) blocks.push('stale_date_evidence');
    }
    try { const result = await previewPlanDates(next.snapshot, operation); next.snapshot = result.nextSnapshot; detail = result.detail; }
    catch (error) { if (error instanceof PlanDatesError) throw new TripError(error.code, error.message); throw error; }
  } else if (operation.type === 'assign') {
    blocks.push(...rememberedBlocks(next, operation));
    const result = await callPlanningTool('preview_changes', { snapshot: next.snapshot, operation, expectedSnapshotToken: await getSnapshotToken(next.snapshot) });
    if (!result.ok) throw new TripError(result.error.code, result.error.message);
    if (result.data.kind !== 'preview') throw new TripError('invalid_preview', 'Unexpected planning response');
    detail = result.data; weatherOverride = result.data.weatherOverride;
    if (!result.data.canApply) blocks.push(...result.data.reasonCodes, 'constraint_violation');
    const nextSchedule = result.data.nextSchedule;
    if (next.itinerary && next.itinerary.current.some((d) => canonical(next.snapshot.trip.schedule[d.dateId]) !== canonical(nextSchedule[d.dateId]))) blocks.push('itinerary_operation_required');
    next.snapshot.trip.schedule = nextSchedule;
    // A confirmed selection must survive incidental clearouts of other assignments.
    for (const d of new Map(next.memory.decisions.map((d) => [`${d.planId}:${d.dateId || '*'}`, d])).values()) if (d.disposition === 'confirmed' && d.dateId
      && next.snapshot.trip.schedule[d.dateId]?.planId !== d.planId
      && state.content.snapshot.trip.schedule[d.dateId]?.planId === d.planId) blocks.push('confirmed_plan_displaced');
    for (const p of new Map(next.memory.progress.map((p) => [`${p.planId}:${p.dateId}`, p])).values()) if (p.status === 'done' && next.snapshot.trip.schedule[p.dateId]?.planId !== p.planId
      && state.content.snapshot.trip.schedule[p.dateId]?.planId === p.planId) blocks.push('completed_plan_displaced');
  } else if (operation.type === 'edit_activity' || operation.type === 'link_booking_activities') {
    try {
      if (operation.type === 'edit_activity' && next.itinerary?.current.some((d) => d.planId === operation.planId)) throw new TripError('itinerary_operation_required', 'Use edit_itinerary to keep current activities and snapshot together');
      const result = previewActivityChange(next.snapshot, operation);
      blocks.push(...result.blocks); next.snapshot = result.nextSnapshot;
      detail = { ...result.detail, unassociatedMapFactIds: operation.type === 'edit_activity' && operation.patch.location ? next.memory.mapFacts.filter((fact) => !fact.binding).map((fact) => fact.id) : [], routeImpacts: operation.type === 'edit_activity' ? next.memory.mapFacts.filter((fact) => fact.binding?.planId === operation.planId && fact.binding.dateId === operation.dateId && [fact.binding.fromStopId, fact.binding.toStopId].includes(operation.stopId)).map((fact) => assessWalkingFact(next.snapshot, fact, operation.source.observedAt)) : [] };
      if (operation.type === 'edit_activity') {
        for (const decision of new Map(next.memory.decisions.map((item) => [`${item.planId}:${item.dateId || '*'}`, item])).values())
          if (decision.planId === operation.planId && (!decision.dateId || decision.dateId === operation.dateId) && decision.disposition === 'confirmed') blocks.push('confirmed_plan_change');
        for (const progress of new Map(next.memory.progress.map((item) => [`${item.planId}:${item.dateId}`, item])).values())
          if (progress.planId === operation.planId && progress.dateId === operation.dateId && progress.status === 'done') blocks.push('completed_plan_change');
        const context = preparePlanningContext(next.snapshot);
        weatherOverride = evaluateWeather(context.plans.find((plan) => plan.id === operation.planId)!, operation.dateId, context.weatherData).level === 'blocked';
      }
    } catch (error) { if (error instanceof ActivityEditError) throw new TripError(error.code, error.message); throw error; }
  } else if (operation.type === 'fact') insert(next.memory.facts, operation.record);
  else if (operation.type === 'preference') { requireHuman(operation.record.source); insert(next.memory.preferences, operation.record); }
  else if (operation.type === 'decision') {
    requireHuman(operation.record.source); assertPlan(next, operation.record.planId, operation.record.dateId);
    if (operation.record.disposition === 'confirmed' && operation.record.dateId && next.snapshot.trip.schedule[operation.record.dateId]?.planId !== operation.record.planId) throw new TripError('decision_mismatch', 'A confirmed dated decision must match the saved schedule; assign first');
    if (operation.record.disposition === 'excluded' && Object.entries(next.snapshot.trip.schedule).some(([date, entry]) => entry.planId === operation.record.planId && entry.status !== 'abandoned' && (!operation.record.dateId || operation.record.dateId === date))) throw new TripError('decision_mismatch', 'Exclusion contradicts the saved schedule; explicitly reschedule first');
    insert(next.memory.decisions, operation.record);
  }
  else if (operation.type === 'progress') { requireHuman(operation.record.source); assertPlan(next, operation.record.planId, operation.record.dateId); insert(next.memory.progress, operation.record); }
  else if (operation.type === 'issue') { if (operation.record.relatedPlanId) assertPlan(next, operation.record.relatedPlanId); insert(next.memory.issues, { ...operation.record, status: 'open', resolution: '' }); }
  else if (operation.type === 'resolve_issue') {
    requireHuman(operation.source); const issue = next.memory.issues.find((x) => x.id === operation.id);
    if (!issue) throw new TripError('unknown_id', 'Unknown issue ID');
    if (issue.status === 'resolved') throw new TripError('already_resolved', 'Issue already resolved');
    issue.status = 'resolved'; issue.resolution = operation.resolution; issue.resolutionSource = operation.source;
  } else if (operation.type === 'map_fact') {
    const assessment = assessWalkingFact(next.snapshot, operation.fact, operation.fact.observedAt);
    detail = { kind: 'route_observation', assessment };
    if (operation.fact.binding && assessment.reasonCodes.some((code) => ['unknown_binding_reference', 'endpoint_changed', 'query_endpoint_mismatch', 'unsupported_route_mode'].includes(code))) blocks.push('route_binding_mismatch');
    insert(next.memory.mapFacts, operation.fact);
  }
  else if (operation.type === 'set_context') next.snapshot.todayId = operation.todayId;
  else if (operation.type === 'undo') {
    const last = state.history.at(-1);
    if (!last || last.id !== operation.commitId) throw new TripError('undo_conflict', 'Only the latest commit can be undone without overwriting subsequent changes');
    delete next.itinerary; Object.assign(next, structuredClone(last.before));
  }
  contentSchema.parse(next);
  const canApply = blocks.length === 0;
  return { schemaVersion: 1 as const, revision: state.revision, operation, canApply, reasonCodes: [...new Set(blocks)], weatherOverride, detail,
    previewToken: hash({ coreVersion: TRIPCTL_CORE_VERSION, state, operation }), nextContent: canApply ? next : structuredClone(state.content) };
}
export async function apply(stateInput: unknown, mutationInput: unknown) {
  const state = parseState(stateInput); const parsed = mutationSchema.safeParse(mutationInput);
  if (!parsed.success) throw new TripError('invalid_mutation', 'Mutation requires revision, preview token, explicit actor, reason, timestamp and idempotency key');
  const request = parsed.data; const requestHash = hash(request); const existing = state.history.find((e) => e.id === request.idempotencyKey);
  if (existing) {
    if (existing.requestHash !== requestHash) throw new TripError('idempotency_key_reused', 'Idempotency key was used for a different request');
    return { state, receipt: { schemaVersion: 1, commitId: existing.id, committedRevision: existing.revision, currentRevision: state.revision, replayed: true } };
  }
  if (state.history.length >= 200) throw new TripError('history_full', 'Prototype history limit reached; retain state and upgrade storage before another change');
  const proposal = await preview(state, request.operation, request.expectedRevision);
  if (proposal.previewToken !== request.previewToken) throw new TripError('stale_preview', 'State or operation changed; preview again');
  if (!proposal.canApply) throw new TripError('constraint_violation', proposal.reasonCodes.join(', '));
  if (proposal.weatherOverride && !request.acceptWeatherRisk) throw new TripError('weather_acceptance_required', 'Explicit acceptance of the shown weather risk is required');
  const revision = state.revision + 1;
  const event = { id: request.idempotencyKey, revision, operation: request.operation, actor: request.actor, reason: request.reason, at: request.at, requestHash, before: structuredClone(state.content), after: proposal.nextContent };
  const next = parseState({ ...state, revision, content: proposal.nextContent, history: [...state.history, event] });
  return { state: next, receipt: { schemaVersion: 1, commitId: event.id, committedRevision: revision, currentRevision: revision, replayed: false } };
}
export function mutationFromPreview(proposal: Awaited<ReturnType<typeof preview>>, metadata: Omit<TripMutation, 'operation' | 'previewToken' | 'expectedRevision'>) {
  return mutationSchema.parse({ ...metadata, operation: proposal.operation, expectedRevision: proposal.revision, previewToken: proposal.previewToken });
}

import { MAX_HISTORY_EVENTS } from './limits';
import { rememberedBlocks } from './planMemory';
import { previewPlanDates, PlanDatesError } from '../domain/planDates';
export const TRIPCTL_CORE_VERSION = 10;
import { emptyLinkage, linkageOperationSchema } from './linkageSchema';
import { appendObservation, observationDateChange, observationRestriction } from './observations';
import { changeReminders, validateLinkage } from './reminders';
import { reconcileReminders } from './reminderReconcile';
import { importHistoricalFacts } from './historyImport';
import { canonical, hash } from './identity';
export { canonical, hash } from './identity';
import { validateItinerary, previewItineraryOperation } from './itinerary';
import { itineraryOperationSchema, ItineraryError } from './itinerarySchema';
import { assessWalkingFact } from './routeEvidence';
import { previewActivityChange, ActivityEditError } from '../domain/activityEditing';
import { evaluateWeather } from '../domain/planWeather';
import { callPlanningTool, getSnapshotToken, preparePlanningContext, planningSnapshotSchema, type PlanningToolResponse, type PlanningToolName } from '../domain/planningTools';
import { contentSchema, mutationSchema, operationSchema, tripStateSchema, TripError, type TripState, type TripContent, type TripMutation } from './schema';
function validateExperiences(state: Pick<TripState, 'content' | 'history'>) {
  // Experience references describe history; they must not freeze later itinerary edits.
  const activityPairs = new Set<string>();
  if (state.content.memory.facts.some((f) => f.experience?.activityId)) for (const content of [state.content, ...state.history.flatMap((h) => [h.before, h.after])]) {
    for (const day of [...(content.itinerary?.baseline.days || []), ...(content.itinerary?.current || [])]) for (const activity of day.activities) activityPairs.add(JSON.stringify([day.planId, activity.id]));
  }
  for (const fact of state.content.memory.facts) {
    const e = fact.experience; if (!e) continue;
    if (e.kind === 'firsthand' && fact.source.kind === 'provider') throw new TripError('invalid_experience_source', 'Provider guidance is not firsthand user experience');
    if (e.planId && !state.content.snapshot.trip.plans.some((p) => p.id === e.planId)) throw new TripError('unknown_id', 'Experience references an unknown plan');
    if (e.activityId && !activityPairs.has(JSON.stringify([e.planId, e.activityId]))) throw new TripError('unknown_id', 'Experience activity must belong to its named plan');
    if (e.changeCommitIds.some((id) => !state.history.some((event) => event.id === id))) throw new TripError('unknown_id', 'Experience references an unknown prior change');
    if (e.supersedesFactId) {
      const old = state.content.memory.facts.find((f) => f.id === e.supersedesFactId);
      if (!old?.experience) throw new TripError('unknown_id', 'Superseded record must be an existing experience fact');
      if (old.experience.kind !== e.kind || old.experience.eventDateId !== e.eventDateId || old.experience.planId !== e.planId) throw new TripError('experience_mismatch', 'A correction must refer to the same kind, event date and plan');
      if (Date.parse(fact.source.observedAt) <= Date.parse(old.source.observedAt)) throw new TripError('stale_experience', 'Experience corrections require newer source evidence');
      if (state.content.memory.facts.some((f) => f.id !== fact.id && f.experience?.supersedesFactId === e.supersedesFactId)) throw new TripError('experience_conflict', 'Correct the latest experience rather than branching over an existing correction');
    }
  }
}
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
  if (state.content.linkage) {
    for (const list of Object.values(state.content.linkage)) if (list && new Set(list.map((r) => r.id)).size !== list.length) throw new TripError('duplicate_id', 'Linkage IDs must be unique per category');
    const ids = new Set(state.content.linkage.reminderIntents.map((i) => i.id));
    if ([...state.content.linkage.reminderAttempts, ...state.content.linkage.reminderReadbacks].some((r) => !ids.has(r.intentId))) throw new TripError('invalid_linkage', 'Reminder events need a known logical intent');
  }
  validateLinkage(state);
  validateExperiences(state);
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
export async function inspect(stateInput: unknown, name: PlanningToolName, dateId?: string): Promise<PlanningToolResponse> {
  const state = parseState(stateInput);
  const result = await callPlanningTool(name, { snapshot: state.content.snapshot, ...(dateId ? { dateId } : {}) });
  if (result.ok && result.data.kind === 'ranking') for (const candidate of result.data.candidates) {
    const blocks = rememberedBlocks(state.content, { planId: candidate.planId, dateId: result.data.dateId });
    if (blocks.length) { candidate.canAssign = false; candidate.noteCodes.push(...blocks); }
  }
  if (result.ok && result.data.kind === 'evaluation') for (const item of result.data.scheduledIssues) {
    const blocks = rememberedBlocks(state.content, item);
    item.issues.push(...blocks.filter((code) => !item.issues.includes(code)));
    if (blocks.length) result.data.risks.push({ code: 'scheduled_rule_violation', planId: item.planId, dateId: item.dateId, level: 'warning', title: 'Saved arrangement conflicts with remembered constraints', reasons: blocks });
  }
  if (result.ok && result.data.kind === 'ranking') result.data.candidates.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || Number(b.canAssign) - Number(a.canAssign) || b.score - a.score);
  return result;
}
export async function preview(stateInput: unknown, operationInput: unknown, expectedRevision: number) {
  const state = parseState(stateInput); const parsed = operationSchema.safeParse(operationInput);
  if (!parsed.success) throw new TripError('invalid_operation', 'Operation schema is invalid');
  if (state.revision !== expectedRevision) throw new TripError('revision_conflict', `Expected revision ${expectedRevision}, current ${state.revision}`);
  const operation = parsed.data; const next = structuredClone(state.content); let detail: unknown = null; const blocks: string[] = []; let weatherOverride = false;
  if (state.content.snapshot.trip.archived && operation.type !== 'import_history' && operation.type !== 'undo_history_import') blocks.push('archived_trip');
  if (linkageOperationSchema.safeParse(operation).success && operation.type !== 'apply_observation') {
    next.linkage ||= emptyLinkage();
    if (operation.type === 'record_observation') { const result = appendObservation(next, operation.record); detail = result; if (!result.added) blocks.push('observation_already_recorded'); }
    else { const result = changeReminders(state, next, linkageOperationSchema.parse(operation)); detail = result; if ('added' in result && result.added === false) blocks.push('linkage_event_already_recorded'); }
  } else if (operation.type === 'import_history') {
    const result = importHistoricalFacts(next, operation); blocks.push(...result.blocks); detail = result.detail;
    if (!blocks.length) next.memory.facts.push(...result.added);
  } else if (operation.type === 'undo_history_import') {
    const last = state.history.at(-1);
    if (!next.snapshot.trip.archived) blocks.push('history_requires_archived_trip');
    if (!last || last.id !== operation.commitId || last.operation.type !== 'import_history') throw new TripError('undo_conflict', 'Only the latest historical import can be undone with this operation');
    const withoutFacts = (c: TripContent) => ({ ...c, memory: { ...c.memory, facts: [] } });
    if (canonical(withoutFacts(last.before)) !== canonical(withoutFacts(last.after))) throw new TripError('invalid_history_import', 'Historical undo cannot change planning or other memory');
    next.memory.facts = structuredClone(last.before.memory.facts);
    detail = { kind: 'historical_feedback_undo', commitId: last.id, archivedStatePreserved: true, ordinaryPlanningChangesAllowed: false };
  } else if (itineraryOperationSchema.safeParse(operation).success) {
    if (operation.type === 'set_option_requirements') for (const event of state.history) {
      const old = event.operation;
      if (old.type === 'set_option_requirements' && old.optionId === operation.optionId && Date.parse(operation.source.observedAt) <= Date.parse(old.source.observedAt)) blocks.push('stale_option_evidence');
    }
    if (operation.type === 'set_decision_status' || operation.type === 'choose_option') {
      const id = operation.type === 'set_decision_status' ? operation.decisionPointId : operation.record.decisionPointId;
      const observedAt = operation.type === 'set_decision_status' ? operation.source.observedAt : operation.record.source.observedAt;
      // Undo restores content, but does not make already superseded evidence fresh again.
      const managed = operation.type === 'set_decision_status' || state.history.some((e) => e.operation.type === 'set_decision_status' && e.operation.decisionPointId === id);
      if (managed) for (const event of state.history) {
        const prior = event.operation;
        if (prior.type === 'set_decision_status' && prior.decisionPointId === id && Date.parse(observedAt) <= Date.parse(prior.source.observedAt)
          || prior.type === 'choose_option' && prior.record.decisionPointId === id && Date.parse(observedAt) <= Date.parse(prior.record.source.observedAt)) blocks.push('stale_decision_evidence');
      }
    }
    try {
      const result = previewItineraryOperation(next.snapshot, next.itinerary, operation, next.memory);
      blocks.push(...result.blocks); detail = result.detail; weatherOverride = result.weatherOverride;
      for (const date of result.changedDays) {
        const planId = state.content.snapshot.trip.schedule[date]?.planId;
        for (const d of new Map(next.memory.decisions.map((x) => [`${x.planId}:${x.dateId || '*'}`, x])).values()) if (d.planId === planId && (!d.dateId || d.dateId === date) && d.disposition === 'confirmed') blocks.push('confirmed_plan_change');
        for (const p of new Map(next.memory.progress.map((x) => [`${x.planId}:${x.dateId}`, x])).values()) if (p.planId === planId && p.dateId === date && p.status === 'done') blocks.push('completed_plan_change');
      }
      if (!blocks.length) { next.itinerary = result.nextItinerary; next.snapshot = result.nextSnapshot; }
    } catch (error) { if (error instanceof ItineraryError) throw new TripError(error.code, error.message); throw error; }
  } else if (operation.type === 'set_plan_dates' || operation.type === 'apply_observation') {
    const dateOperation = operation.type === 'apply_observation' ? observationDateChange(next, operation.observationId, operation.asOf) : operation;
    // Evidence is caller supplied. History prevents older/equal-time contradictory reports
    // from superseding accepted restrictions; it cannot authenticate provider observations.
    const touched = new Set([...(dateOperation.closeDates || []), ...(dateOperation.reopenDates || [])]);
    for (const event of state.history) {
      const stored = event.operation; const record = stored.type === 'apply_observation' ? event.before.linkage?.observations.find((r) => r.id === stored.observationId) : undefined;
      const prior = record ? observationRestriction(record) : stored;
      if (prior.type === 'set_plan_dates' && prior.planId === dateOperation.planId
        && (dateOperation.availableDates || prior.availableDates || [...(prior.closeDates || []), ...(prior.reopenDates || [])].some((date) => touched.has(date)))
        && Date.parse(dateOperation.source.observedAt) <= Date.parse(prior.source.observedAt)) blocks.push('stale_date_evidence');
    }
    try { const result = await previewPlanDates(next.snapshot, dateOperation); next.snapshot = result.nextSnapshot; detail = result.detail; }
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
  } else if (operation.type === 'fact') { if (operation.record.experience?.historical) throw new TripError('history_operation_required', 'Historical source records require import_history'); insert(next.memory.facts, operation.record); validateExperiences({ content: next, history: state.history }); }
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
    if (canonical(last.before.linkage) !== canonical(last.after.linkage)) blocks.push('linkage_undo_forbidden');
    delete next.itinerary; delete next.linkage; Object.assign(next, structuredClone(last.before));
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
  if (request.operation.type === 'apply_observation' || request.operation.type === 'begin_reminder_action') {
    if (Date.parse(request.at) < Date.parse(request.operation.asOf)) throw new TripError('invalid_action_time', 'Apply timestamp cannot precede the reviewed analysis time');
    if (request.operation.type === 'apply_observation') observationDateChange(state.content, request.operation.observationId, request.at);
    else { if (Date.parse(request.at) !== Date.parse(request.operation.asOf)) throw new TripError('invalid_action_time', 'A reminder attempt must use its actual save timestamp as asOf; preview again before saving'); const id = request.operation.intentId; const action = reconcileReminders(state, request.at).items.find((i) => i.intentId === id)?.action; if (!action || action.actionKey !== request.operation.actionKey) throw new TripError('stale_reminder_action', 'Action expired or changed before this apply time'); }
  }
  if (state.history.length >= MAX_HISTORY_EVENTS) throw new TripError('history_full', 'Prototype history limit reached; retain state and upgrade storage before another change');
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

import { stateHashContext } from './storage2';
import { linkageQuerySchema } from './linkageSchema';
import { assessObservations, observationDateChange } from './observations';
import { parseState, preview, inspect, hash } from './engine';
import { TripError } from './schema';
import { assessItineraryOptions } from './optionPlanning';
export async function analyseEvidenceImpact(input: unknown, query: unknown) {
  const parsed = linkageQuerySchema.safeParse(query); if (!parsed.success) throw new TripError('invalid_linkage_query', 'Supply explicit asOf');
  const state = parseState(input); const asOf = parsed.data.asOf; const content = state.content;
  const assessments = assessObservations(content, asOf);
  const questions: { id: string; code: string; text: string; observationIds: string[] }[] = [];
  const impacts = [];
  for (const a of assessments) {
    const r = a.observation; const dateId = r.scope.dateId; const planId = r.scope.planId;
    const optionIds = content.itinerary?.options.filter((o) => o.requirements?.plans.some((p) => p.planId === planId && p.dateId === dateId)).map((o) => o.id) || [];
    const scheduleAffected = content.snapshot.trip.schedule[dateId]?.planId === planId;
    const constraintIds = content.itinerary?.constraints.filter((c) => c.dateId === dateId && (!r.scope.activityId || !c.activityId || c.activityId === r.scope.activityId)).map((c) => c.id) || [];
    let proposal: Awaited<ReturnType<typeof preview>> | null = null; const reasonCodes = [...a.reasonCodes];
    if (a.usableForHardClosure && !content.snapshot.trip.plans.find((p) => p.id === planId)?.closed_dates?.includes(dateId)) {
      try { observationDateChange(content, r.id, asOf); proposal = await preview(state, { type: 'apply_observation', observationId: r.id, asOf }, state.revision); reasonCodes.push(...proposal.reasonCodes); }
      catch (e) { if (e instanceof TripError) reasonCodes.push(e.code); else throw e; }
    }
    if (a.status !== 'current_report' || r.scope.component !== 'whole_plan' || r.claim?.kind !== 'opening' || r.claim.state !== 'closed' || reasonCodes.length) {
      const code = reasonCodes.length ? reasonCodes[0] : r.basis !== 'official_final' ? 'confirm_final_notice' : r.scope.component === 'part' ? 'confirm_partial_scope' : r.claim?.kind === 'opening' && r.claim.state === 'open' ? 'review_reopening_constraints' : 'review_weather_or_traffic_impact';
      questions.push({ id: 'observation:' + r.streamId, code, text: a.status === 'unknown' ? 'Obtain a current matching observation; preserve pending status and existing constraints.' : code === 'confirm_final_notice' ? 'Check the applicable final notice for this exact date and place; a prediction is not confirmed closure.' : code === 'review_reopening_constraints' ? 'Review the source of existing closures before an explicit reopening; this report does not clear them automatically.' : 'Review this scoped impact and any missing route/timing facts before proposing an itinerary change.', observationIds: a.headIds });
    }
    impacts.push({ ...a, reasonCodes, scheduleAffected, constraintIds, optionIds, proposal, scheduleChanged: false, bookingsChanged: false, feasibility: 'not_proven' });
  }
  for (const issue of content.memory.issues.filter((i) => i.status === 'open')) questions.push({ id: 'issue:' + issue.id, code: 'existing_unresolved_issue', text: issue.text, observationIds: [] });
  for (const option of content.itinerary?.options || []) {
    const active = content.itinerary?.decisionPoints.filter((p) => p.optionIds.includes(option.id));
    if (active?.length && active.every((p) => p.lifecycle && p.lifecycle.status !== 'open')) continue;
    option.uncertainties.forEach((text, n) => questions.push({ id: 'option:' + option.id + ':' + n, code: 'option_information_missing', text, observationIds: [] }));
  }
  const alternatives = [];
  for (const dateId of [...new Set(assessments.map((a) => a.observation.scope.dateId))].sort()) {
    const ranking = await inspect(state, 'rank_candidates', dateId);
    if (ranking.ok && ranking.data.kind === 'ranking') alternatives.push({ dateId, candidates: ranking.data.candidates.map((c) => ({ ...c, externalEvidence: assessments.filter((a) => a.observation.scope.planId === c.planId && a.observation.scope.dateId === dateId).map((a) => ({ observationIds: a.headIds, status: a.status, scope: a.observation.scope.component })), actionability: 'requires_current_preview_and_evidence_review' })) });
  }
  return { schemaVersion: 1, saved: false, externalActionsPerformed: 0, asOf, revision: state.revision, stateHash: hash(state), ...stateHashContext(state), impacts, questions, alternatives,
    options: content.itinerary ? assessItineraryOptions(content.itinerary, content) : null,
    limitations: ['Source authority and place matches are caller assertions, not independently authenticated', 'Predictions and partial closures never become whole-plan date restrictions', 'Withdrawn/expired/failed evidence never reopens a saved closure', 'Weather/traffic only produce review questions; itinerary rerouting and incomplete logistics still need an explicit agent proposal'] };
}

import { preparePlanningContext, type PlanningSnapshot } from '../domain/planningTools';
import { rankPlanCandidates } from '../domain/planCandidates';
import { rememberedBlocks, type PlanningMemory } from './planMemory';
import type { Itinerary } from './itinerarySchema';
export type OptionPlanningContext = { snapshot: PlanningSnapshot; memory?: PlanningMemory };

/** All declared requirements are necessary. Text is never parsed into plan IDs or treated as evidence. */
export function assessItineraryOptions(i: Itinerary, scope?: OptionPlanningContext) {
  const context = scope ? preparePlanningContext(scope.snapshot) : undefined;
  const byDate = new Map<string, ReturnType<typeof rankPlanCandidates>>();
  const all = i.options.map((option) => {
    const linked = i.decisionPoints.filter((p) => p.optionIds.includes(option.id));
    const activeDecisions = linked.filter((p) => !p.lifecycle || p.lifecycle.status === 'open');
    const blocks: string[] = []; const unknown: string[] = [];
    if (linked.length && !activeDecisions.length) blocks.push('decision_closed');
    if (scope?.snapshot.trip.archived) blocks.push('archived_trip');
    if (scope && option.dateIds.some((date) => date < scope.snapshot.todayId)) blocks.push('past_option_date');
    if (!option.requirements) unknown.push('missing_option_requirements');
    if (!scope?.memory) unknown.push('missing_planning_context');
    if (option.requirements && option.dateIds.some((date) => !option.requirements!.plans.some((r) => r.dateId === date))) unknown.push('incomplete_option_requirements');
    const checks = (option.requirements?.plans || []).map((r) => {
      const codes: string[] = [];
      if (!option.dateIds.includes(r.dateId)) codes.push('option_date_mismatch');
      if (context && !context.tripDates.some((d) => d.id === r.dateId)) codes.push('unknown_date');
      if (context && !context.plans.some((p) => p.id === r.planId)) codes.push('unknown_id');
      if (context && !codes.length && !byDate.has(r.dateId)) byDate.set(r.dateId, rankPlanCandidates(context, r.dateId));
      const candidate = byDate.get(r.dateId)?.find((c) => c.plan.id === r.planId);
      if (candidate) codes.push(...candidate.reasonCodes);
      if (scope?.memory) codes.push(...rememberedBlocks({ memory: scope.memory }, r));
      blocks.push(...codes);
      return { ...r, reasonCodes: [...new Set(codes)], weatherLevel: candidate?.weather.level || 'unknown', weatherOverride: candidate?.weatherOverride || false, openingStatus: 'not_verified', bookingIsNotOpeningEvidence: true };
    });
    if (context && option.requirements) {
      const plans = option.requirements.plans.map((r) => context.plans.find((p) => p.id === r.planId));
      if (plans.some((a, n) => a && plans.slice(n + 1).some((b) => b && (a.conflicts.includes(b.id) || b.conflicts.includes(a.id))))) blocks.push('option_plan_conflict');
    }
    const status = blocks.length ? 'inactive' : unknown.length ? 'unassessed' : 'eligible';
    return { ...option, decisionPointIds: linked.map((p) => p.id), activeDecisionPointIds: activeDecisions.map((p) => p.id), active: status === 'eligible',
      eligibility: { status, reasonCodes: [...new Set([...blocks, ...unknown])], checks, feasibility: 'not_proven', scheduleApplied: false } };
  });
  return { options: all.filter((o) => o.eligibility.status === 'eligible'), unassessedOptions: all.filter((o) => o.eligibility.status === 'unassessed'), inactiveOptions: all.filter((o) => o.eligibility.status === 'inactive') };
}

import type { TripContent } from './schema';
export type PlanningMemory = Pick<TripContent['memory'], 'decisions' | 'progress'>;

export function rememberedBlocks(content: { memory: PlanningMemory }, operation: { planId: string; dateId: string }) {
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

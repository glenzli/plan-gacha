import type { NormalizedPlan, PlanPriority } from '../domain/plan';
import type { TripDateLike } from '../domain/risk';
import type { WeatherEvaluation } from '../domain/weather';

export interface PlanBookingBadgeData {
  status: string;
  label: string;
}

export interface PlanCandidate {
  plan: NormalizedPlan;
  canAssign: boolean;
  hardReasons: string[];
  notes: string[];
  clears: unknown[];
  newRisks: unknown[];
  score: number;
  isCurrent: boolean;
  assignedDateId: string;
  weather: WeatherEvaluation & { label?: string };
  weatherOverride: boolean;
}

export interface CandidateGroupData {
  key: string;
  title: string;
  items: PlanCandidate[];
}

export interface CandidateSelectedDate {
  id: string;
}

export type PriorityLabelGetter = (priority: PlanPriority | string, language: string) => string;
export type PlanBookingBadgeGetter = (
  plan: NormalizedPlan | null | undefined,
  language: string,
) => PlanBookingBadgeData | null;
export type CandidateTripDate = TripDateLike;

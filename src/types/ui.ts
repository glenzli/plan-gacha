import type { ChangeEvent, ReactNode, RefObject } from 'react';
import type { NormalizedPlan } from '../domain/plan';
import type { NormalizedPlaceFeedback, NormalizedStopOutcomes } from '../domain/trip';

export type TranslationVars = Record<string, string | number | boolean | null | undefined>;
export type TranslateFn = (key: string, vars?: TranslationVars) => string;
export type VoidFn = () => void;
export type TextAreaRef = RefObject<HTMLTextAreaElement | null>;
export type FileInputChange = ChangeEvent<HTMLInputElement>;
export type RenderNode = () => ReactNode;
export interface PlanRenderOptions {
  readOnly?: boolean;
  dateId?: string;
  placeFeedback?: NormalizedPlaceFeedback;
  stopOutcomes?: NormalizedStopOutcomes;
}
export type PlanRenderer = (plan: NormalizedPlan | null | undefined, options?: PlanRenderOptions) => ReactNode;
export type EditorTab = 'itinerary' | 'lodging';

export interface AiModeText {
  label: string;
  helper: string;
  placeholder: string;
}

import type { ChangeEvent, ReactNode, RefObject } from 'react';

export type TranslationVars = Record<string, string | number | boolean | null | undefined>;
export type TranslateFn = (key: string, vars?: TranslationVars) => string;
export type VoidFn = () => void;
export type TextAreaRef = RefObject<HTMLTextAreaElement | null>;
export type FileInputChange = ChangeEvent<HTMLInputElement>;
export type RenderNode = () => ReactNode;
export type EditorTab = 'itinerary' | 'lodging';

export interface AiModeText {
  label: string;
  helper: string;
  placeholder: string;
}

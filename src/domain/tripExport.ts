import type { NormalizedPlan } from './plan';
import { normalizeDayReviews, type NormalizedDayReviews } from './dayReview';
import {
  normalizePlaceFeedback,
  normalizeStopOutcomes,
  type NormalizedLodging,
  type NormalizedPlaceFeedback,
  type NormalizedSchedule,
  type NormalizedStopOutcomes,
} from './trip';
import { normalizeTripArchiveSummary, type TripArchiveSummary } from './tripArchive';

type AnyRecord = Record<string, unknown>;

export interface TripExportPayload {
  schemaVersion: string;
  startDateStr: string;
  tripDays: number;
  lodgings: NormalizedLodging[];
  plans: NormalizedPlan[];
  schedule: NormalizedSchedule;
  placeFeedback: NormalizedPlaceFeedback;
  stopOutcomes: NormalizedStopOutcomes;
  dayReviews: NormalizedDayReviews;
  archiveSummary: TripArchiveSummary | null;
}

export interface ImportedTripHistory {
  placeFeedback?: NormalizedPlaceFeedback;
  stopOutcomes?: NormalizedStopOutcomes;
  dayReviews?: NormalizedDayReviews;
  archiveSummary?: TripArchiveSummary | null;
}

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readAliasedField(record: AnyRecord, camelCaseKey: string, snakeCaseKey: string) {
  if (Object.hasOwn(record, camelCaseKey)) return { present: true, value: record[camelCaseKey] };
  if (Object.hasOwn(record, snakeCaseKey)) return { present: true, value: record[snakeCaseKey] };
  return { present: false, value: undefined };
}

export function buildTripExportPayload(options: TripExportPayload): TripExportPayload {
  return {
    schemaVersion: options.schemaVersion,
    startDateStr: options.startDateStr,
    tripDays: options.tripDays,
    lodgings: options.lodgings,
    plans: options.plans,
    schedule: options.schedule,
    placeFeedback: options.placeFeedback,
    stopOutcomes: options.stopOutcomes,
    dayReviews: options.dayReviews,
    archiveSummary: options.archiveSummary,
  };
}

export function readImportedTripHistory(value: unknown): ImportedTripHistory {
  if (!isRecord(value)) return {};

  const placeFeedback = readAliasedField(value, 'placeFeedback', 'place_feedback');
  const stopOutcomes = readAliasedField(value, 'stopOutcomes', 'stop_outcomes');
  const dayReviews = readAliasedField(value, 'dayReviews', 'day_reviews');
  const archiveSummary = readAliasedField(value, 'archiveSummary', 'archive_summary');

  return {
    ...(placeFeedback.present ? { placeFeedback: normalizePlaceFeedback(placeFeedback.value) } : {}),
    ...(stopOutcomes.present ? { stopOutcomes: normalizeStopOutcomes(stopOutcomes.value) } : {}),
    ...(dayReviews.present ? { dayReviews: normalizeDayReviews(dayReviews.value) } : {}),
    ...(archiveSummary.present ? { archiveSummary: normalizeTripArchiveSummary(archiveSummary.value) } : {}),
  };
}

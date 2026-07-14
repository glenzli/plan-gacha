type AnyRecord = Record<string, unknown>;

export enum DayReviewRating {
  Satisfied = 'satisfied',
  Neutral = 'neutral',
  Unsatisfied = 'unsatisfied',
}

export enum DayReviewTag {
  WellPaced = 'well_paced',
  TooRushed = 'too_rushed',
  TooRelaxed = 'too_relaxed',
  TransportTiring = 'transport_tiring',
  PhysicallyTiring = 'physically_tiring',
  WeatherAffected = 'weather_affected',
  WorthReusing = 'worth_reusing',
}

export interface NormalizedDayReviewEntry {
  key: string;
  dateId: string;
  planId: string;
  planName: string;
  rating: DayReviewRating;
  tags: DayReviewTag[];
  note: string;
  updatedAt: string;
}

export type NormalizedDayReviews = Record<string, NormalizedDayReviewEntry>;

const RATING_VALUES = new Set(Object.values(DayReviewRating));
const TAG_VALUES = new Set(Object.values(DayReviewTag));

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(record: AnyRecord, ...keys: string[]) {
  const key = keys.find((candidate) => record[candidate] !== undefined);
  return key ? String(record[key] || '') : '';
}

export function getDayReviewKey(dateId: string, planId: string) {
  return [dateId, planId]
    .map((value) => encodeURIComponent(String(value || '').trim()))
    .join(':');
}

export function normalizeDayReviews(value: unknown): NormalizedDayReviews {
  if (!isRecord(value) && !Array.isArray(value)) return {};
  const entries = Array.isArray(value)
    ? value.map((entry, index) => [String(isRecord(entry) ? entry.key || index : index), entry] as const)
    : Object.entries(value);

  return Object.fromEntries(entries.flatMap(([storedKey, rawEntry]) => {
    if (!isRecord(rawEntry)) return [];
    const dateId = readString(rawEntry, 'dateId', 'date_id');
    const planId = readString(rawEntry, 'planId', 'plan_id');
    const ratingValue = readString(rawEntry, 'rating');
    if (!dateId || !planId || !RATING_VALUES.has(ratingValue as DayReviewRating)) return [];

    const tags = Array.isArray(rawEntry.tags)
      ? [...new Set(rawEntry.tags
        .map((tag) => String(tag))
        .filter((tag): tag is DayReviewTag => TAG_VALUES.has(tag as DayReviewTag)))]
      : [];
    const key = getDayReviewKey(dateId, planId) || readString(rawEntry, 'key') || storedKey;

    return [[key, {
      key,
      dateId,
      planId,
      planName: readString(rawEntry, 'planName', 'plan_name'),
      rating: ratingValue as DayReviewRating,
      tags,
      note: readString(rawEntry, 'note').trim(),
      updatedAt: readString(rawEntry, 'updatedAt', 'updated_at'),
    } satisfies NormalizedDayReviewEntry]];
  }));
}

export function findDayReview(
  dateId: string,
  planId: string,
  reviews: NormalizedDayReviews,
) {
  return reviews[getDayReviewKey(dateId, planId)];
}

export function getDayReviewsForDate(dateId: string, reviews: NormalizedDayReviews) {
  return Object.values(reviews)
    .filter((review) => review.dateId === dateId)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

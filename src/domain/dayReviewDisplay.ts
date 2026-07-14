import { DayReviewRating, DayReviewTag } from './dayReview';
import type { TranslateFn } from '../types/ui';

const RATING_LABEL_KEYS: Record<DayReviewRating, string> = {
  [DayReviewRating.Satisfied]: 'reviewSatisfied',
  [DayReviewRating.Neutral]: 'reviewNeutral',
  [DayReviewRating.Unsatisfied]: 'reviewUnsatisfied',
};

const TAG_LABEL_KEYS: Record<DayReviewTag, string> = {
  [DayReviewTag.WellPaced]: 'reviewTagWellPaced',
  [DayReviewTag.TooRushed]: 'reviewTagTooRushed',
  [DayReviewTag.TooRelaxed]: 'reviewTagTooRelaxed',
  [DayReviewTag.TransportTiring]: 'reviewTagTransportTiring',
  [DayReviewTag.PhysicallyTiring]: 'reviewTagPhysicallyTiring',
  [DayReviewTag.WeatherAffected]: 'reviewTagWeatherAffected',
  [DayReviewTag.WorthReusing]: 'reviewTagWorthReusing',
};

export function getDayReviewRatingLabel(rating: DayReviewRating, t: TranslateFn) {
  return t(RATING_LABEL_KEYS[rating]);
}

export function getDayReviewTagLabel(tag: DayReviewTag, t: TranslateFn) {
  return t(TAG_LABEL_KEYS[tag]);
}

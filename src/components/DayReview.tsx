import { useState } from 'react';
import {
  DayReviewRating,
  DayReviewTag,
  type NormalizedDayReviewEntry,
} from '../domain/dayReview';
import {
  getDayReviewRatingLabel,
  getDayReviewTagLabel,
} from '../domain/dayReviewDisplay';
import type { TranslateFn } from '../types/ui';
import { Icon } from './Icon';

export interface DayReviewTarget {
  dateId: string;
  dateLabel: string;
  planId: string;
  planName: string;
}

interface DayReviewDraft {
  rating: DayReviewRating;
  tags: DayReviewTag[];
  note: string;
}

const RATING_OPTIONS = [
  { value: DayReviewRating.Satisfied, labelKey: 'reviewSatisfied' },
  { value: DayReviewRating.Neutral, labelKey: 'reviewNeutral' },
  { value: DayReviewRating.Unsatisfied, labelKey: 'reviewUnsatisfied' },
] as const;

const TAG_OPTIONS = [
  { value: DayReviewTag.WellPaced, labelKey: 'reviewTagWellPaced' },
  { value: DayReviewTag.TooRushed, labelKey: 'reviewTagTooRushed' },
  { value: DayReviewTag.TooRelaxed, labelKey: 'reviewTagTooRelaxed' },
  { value: DayReviewTag.TransportTiring, labelKey: 'reviewTagTransportTiring' },
  { value: DayReviewTag.PhysicallyTiring, labelKey: 'reviewTagPhysicallyTiring' },
  { value: DayReviewTag.WeatherAffected, labelKey: 'reviewTagWeatherAffected' },
  { value: DayReviewTag.WorthReusing, labelKey: 'reviewTagWorthReusing' },
] as const;

export function DayReviewSummary({
  review,
  t,
}: {
  review: NormalizedDayReviewEntry;
  t: TranslateFn;
}) {
  return (
    <div className={`day-review-summary rating-${review.rating}`}>
      <div className="day-review-summary-head">
        <Icon name="messageSquare" />
        <strong>{getDayReviewRatingLabel(review.rating, t)}</strong>
        {review.tags.map((tag) => (
          <span className="day-review-tag" key={tag}>{getDayReviewTagLabel(tag, t)}</span>
        ))}
      </div>
      {review.note && <p>{review.note}</p>}
    </div>
  );
}

export function DayReviewModal({
  currentReview,
  onClose,
  onSave,
  previousReviews,
  t,
  target,
}: {
  currentReview?: NormalizedDayReviewEntry;
  onClose: () => void;
  onSave: (draft: DayReviewDraft) => void;
  previousReviews: NormalizedDayReviewEntry[];
  t: TranslateFn;
  target: DayReviewTarget;
}) {
  const [rating, setRating] = useState<DayReviewRating | null>(currentReview?.rating || null);
  const [tags, setTags] = useState<DayReviewTag[]>(currentReview?.tags || []);
  const [note, setNote] = useState(currentReview?.note || '');

  const toggleTag = (tag: DayReviewTag) => {
    setTags((current) => current.includes(tag)
      ? current.filter((item) => item !== tag)
      : [...current, tag]);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal day-review-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header day-review-modal-header">
          <div>
            <p className="eyebrow">{t('dayReview')}</p>
            <h2>{t('reviewThisDay')}</h2>
            <span className="day-review-target">{target.dateLabel} · {target.planName}</span>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={t('close')}>
            <Icon name="x" />
          </button>
        </div>

        <div className="day-review-modal-body">
          <section className="day-review-section">
            <h3>{t('dayReviewRating')}</h3>
            <div className="day-review-ratings" role="group" aria-label={t('dayReviewRating')}>
              {RATING_OPTIONS.map((option) => (
                <button
                  className={`day-review-rating rating-${option.value} ${rating === option.value ? 'is-selected' : ''}`}
                  key={option.value}
                  type="button"
                  aria-pressed={rating === option.value}
                  onClick={() => setRating(option.value)}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          </section>

          <section className="day-review-section">
            <h3>{t('dayReviewTags')}</h3>
            <div className="day-review-tags">
              {TAG_OPTIONS.map((option) => (
                <button
                  className={tags.includes(option.value) ? 'is-selected' : ''}
                  key={option.value}
                  type="button"
                  aria-pressed={tags.includes(option.value)}
                  onClick={() => toggleTag(option.value)}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          </section>

          <label className="field day-review-note">
            <span>{t('dayReviewNote')}</span>
            <textarea
              maxLength={500}
              value={note}
              placeholder={t('dayReviewNotePlaceholder')}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          {previousReviews.length > 0 && (
            <section className="day-review-section previous-day-reviews">
              <h3>{t('previousPlanReviews')}</h3>
              <p>{t('previousPlanReviewsHelp')}</p>
              {previousReviews.map((review) => (
                <div className="previous-day-review" key={review.key}>
                  <strong>{review.planName || review.planId}</strong>
                  <DayReviewSummary review={review} t={t} />
                </div>
              ))}
            </section>
          )}
        </div>

        <div className="modal-actions day-review-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>{t('cancel')}</button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!rating}
            onClick={() => rating && onSave({ rating, tags, note: note.trim() })}
          >
            {t('saveDayReview')}
          </button>
        </div>
      </div>
    </div>
  );
}

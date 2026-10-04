import * as z from 'zod/v4';
/** Preserve original JSON, including unknown fields/legacy aliases; interpretation is an explicit import. */
export const legacyFeedbackFields = {
  dayReviews: z.json().optional(), stopOutcomes: z.json().optional(), placeFeedback: z.json().optional(), archiveSummary: z.json().optional(),
  day_reviews: z.json().optional(), stop_outcomes: z.json().optional(), place_feedback: z.json().optional(), archive_summary: z.json().optional(),
};
export const legacyFeedbackSchema = z.strictObject(legacyFeedbackFields);
export const legacyTimeZoneSchema = z.string().min(1).max(100);

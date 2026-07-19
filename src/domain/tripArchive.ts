type AnyRecord = Record<string, unknown>;

export enum TripExpenseCategory {
  Airfare = 'airfare',
  Lodging = 'lodging',
  LocalTransport = 'localTransport',
  Food = 'food',
  Activities = 'activities',
  Shopping = 'shopping',
  Other = 'other',
}

export const TRIP_EXPENSE_CATEGORIES = Object.values(TripExpenseCategory);

export type TripExpenses = Partial<Record<TripExpenseCategory, number>>;

export interface TripArchiveSummary {
  currency: string;
  expenses: TripExpenses;
  note: string;
  archivedAt: string;
  updatedAt: string;
}

export interface TripArchiveSummaryDraft {
  currency?: string;
  expenses?: Partial<Record<TripExpenseCategory, number | string>>;
  note?: string;
  archivedAt?: string;
  updatedAt?: string;
}

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function normalizeTripArchiveSummary(value: unknown): TripArchiveSummary | null {
  if (!isRecord(value)) return null;
  const rawExpenses = isRecord(value.expenses) ? value.expenses : {};
  const expenses = Object.fromEntries(
    TRIP_EXPENSE_CATEGORIES.flatMap((category) => {
      const amount = Number(rawExpenses[category]);
      return Number.isFinite(amount) && amount > 0 ? [[category, amount]] : [];
    }),
  ) as TripExpenses;

  return {
    currency: String(value.currency || '').trim().toUpperCase().slice(0, 8),
    expenses,
    note: String(value.note || '').trim(),
    archivedAt: String(value.archivedAt || value.archived_at || ''),
    updatedAt: String(value.updatedAt || value.updated_at || ''),
  };
}

export function createTripArchiveSummary(
  draft: TripArchiveSummaryDraft,
  now = new Date().toISOString(),
) {
  return normalizeTripArchiveSummary({
    ...draft,
    currency: String(draft.currency || 'CNY').trim().toUpperCase(),
    archivedAt: draft.archivedAt || now,
    updatedAt: now,
  }) as TripArchiveSummary;
}

export function getTripExpenseTotal(summary: TripArchiveSummary | null | undefined) {
  return TRIP_EXPENSE_CATEGORIES.reduce(
    (total, category) => total + Number(summary?.expenses?.[category] || 0),
    0,
  );
}

export function hasTripArchiveSummaryContent(summary: TripArchiveSummary | null | undefined) {
  return Boolean(summary?.note || getTripExpenseTotal(summary) > 0);
}

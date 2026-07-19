import { useMemo, useState, type FormEvent } from 'react';
import {
  TRIP_EXPENSE_CATEGORIES,
  type TripArchiveSummary,
  type TripArchiveSummaryDraft,
  type TripExpenseCategory,
} from '../domain/tripArchive';
import type { TranslateFn } from '../types/ui';
import { Icon } from './Icon';

const CUSTOM_CURRENCY = '__custom__';
const COMMON_CURRENCIES = [
  ['CNY', 'CNY · ¥'],
  ['JPY', 'JPY · ¥'],
  ['USD', 'USD · $'],
  ['EUR', 'EUR · €'],
  ['GBP', 'GBP · £'],
  ['HKD', 'HKD · HK$'],
  ['TWD', 'TWD · NT$'],
  ['KRW', 'KRW · ₩'],
  ['SGD', 'SGD · S$'],
  ['THB', 'THB · ฿'],
  ['AUD', 'AUD · A$'],
  ['CAD', 'CAD · C$'],
] as const;

function isCommonCurrency(currency: string) {
  return COMMON_CURRENCIES.some(([value]) => value === currency);
}

interface ArchiveTripModalProps {
  endedPrompt: boolean;
  initialSummary: TripArchiveSummary | null;
  onClose: () => void;
  onSubmit: (draft: TripArchiveSummaryDraft) => void;
  t: TranslateFn;
  tripName: string;
}

export function ArchiveTripModal({
  endedPrompt,
  initialSummary,
  onClose,
  onSubmit,
  t,
  tripName,
}: ArchiveTripModalProps) {
  const initialExpenses = useMemo(() => Object.fromEntries(
    TRIP_EXPENSE_CATEGORIES.map((category) => [
      category,
      initialSummary?.expenses?.[category]?.toString() || '',
    ]),
  ) as Record<TripExpenseCategory, string>, [initialSummary]);
  const initialCurrency = initialSummary?.currency || 'CNY';
  const [currencyOption, setCurrencyOption] = useState(
    isCommonCurrency(initialCurrency) ? initialCurrency : CUSTOM_CURRENCY,
  );
  const [customCurrency, setCustomCurrency] = useState(
    isCommonCurrency(initialCurrency) ? '' : initialCurrency,
  );
  const [expenses, setExpenses] = useState(initialExpenses);
  const [note, setNote] = useState(initialSummary?.note || '');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      currency: currencyOption === CUSTOM_CURRENCY ? customCurrency : currencyOption,
      expenses,
      note,
      archivedAt: initialSummary?.archivedAt,
    });
  };

  return (
    <div className="modal-overlay archive-trip-overlay" onClick={onClose}>
      <form className="modal archive-trip-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <div className="panel-header archive-trip-header">
          <div>
            <p className="eyebrow">{t('archive')}</p>
            <h2>{endedPrompt ? t('tripEndedArchiveTitle') : t('archiveTripTitle')}</h2>
            <span>{tripName}</span>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={t('close')}>
            <Icon name="x" />
          </button>
        </div>

        <div className="archive-trip-body">
          <p className="archive-trip-help">{t('archiveTripHelp')}</p>
          <div className="archive-currency-row">
            <label>
              <span>{t('expenseCurrency')}</span>
              <select value={currencyOption} onChange={(event) => setCurrencyOption(event.target.value)}>
                {COMMON_CURRENCIES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
                <option value={CUSTOM_CURRENCY}>{t('expenseCurrencyOther')}</option>
              </select>
            </label>
            {currencyOption === CUSTOM_CURRENCY && (
              <label>
                <span>{t('expenseCurrencyOther')}</span>
                <input
                  value={customCurrency}
                  maxLength={8}
                  placeholder="CHF"
                  required
                  onChange={(event) => setCustomCurrency(event.target.value.toUpperCase())}
                />
              </label>
            )}
          </div>
          <div className="archive-expense-grid">
            {TRIP_EXPENSE_CATEGORIES.map((category) => (
              <label key={category}>
                <span>{t(`expenseCategory.${category}`)}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0"
                  value={expenses[category]}
                  onChange={(event) => setExpenses((current) => ({
                    ...current,
                    [category]: event.target.value,
                  }))}
                />
              </label>
            ))}
          </div>
          <label className="archive-note-field">
            <span>{t('archiveNote')}</span>
            <textarea
              value={note}
              placeholder={t('archiveNotePlaceholder')}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </div>

        <div className="modal-actions archive-trip-actions">
          <button className="btn btn-outline" type="button" onClick={onClose}>
            {endedPrompt ? t('archiveLater') : t('cancel')}
          </button>
          <button className="btn btn-primary" type="submit">
            {t('confirmArchive')}
          </button>
        </div>
      </form>
    </div>
  );
}

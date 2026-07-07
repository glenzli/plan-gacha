import type { ReactNode } from 'react';
import type { TranslateFn } from '../types/ui';

interface MainPanelDate {
  dayNumber: number;
  display: string;
}

interface MainDayPanelProps {
  availableCandidateCount: number;
  renderCandidateGroups: () => ReactNode;
  renderCurrentPlanCard: (className: string) => ReactNode;
  selectNeighborDate: (step: number) => void;
  selectedDate?: MainPanelDate | null;
  selectedIndex: number;
  t: TranslateFn;
  tripDates: unknown[];
}

export function MainDayPanel({
  availableCandidateCount,
  renderCandidateGroups,
  renderCurrentPlanCard,
  selectNeighborDate,
  selectedDate,
  selectedIndex,
  t,
  tripDates,
}: MainDayPanelProps) {
  return (
    <section className="main-panel">
      <div className="date-toolbar">
        <button
          className="nav-btn"
          type="button"
          onClick={() => selectNeighborDate(-1)}
          disabled={selectedIndex <= 0}
          aria-label={t('previousDay')}
        >
          ‹
        </button>
        <div>
          <p className="eyebrow">D{selectedDate?.dayNumber || 1}</p>
          <h2>{selectedDate?.display || t('chooseDate')}</h2>
        </div>
        <button
          className="nav-btn"
          type="button"
          onClick={() => selectNeighborDate(1)}
          disabled={selectedIndex < 0 || selectedIndex >= tripDates.length - 1}
          aria-label={t('nextDay')}
        >
          ›
        </button>
      </div>

      {renderCurrentPlanCard('current-plan')}

      <div className="section-title">
        <h2>{t('switchablePlans')}</h2>
        <span>{t('available', { count: availableCandidateCount })}</span>
      </div>

      {renderCandidateGroups()}
    </section>
  );
}

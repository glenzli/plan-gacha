import type { ReactNode, RefObject } from 'react';
import type { TranslateFn } from '../types/ui';

interface MainPanelDate {
  id: string;
  dayNumber: number;
  display: string;
}

interface MainDayPanelProps {
  panelRef: RefObject<HTMLElement | null>;
  todayId: string;
  canReturnToToday: boolean;
  onReturnToToday: () => void;
  showingAlternatives: boolean;
  onReturnToItinerary: () => void;
  mobileOverviewOpen: boolean;
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
  panelRef, todayId, canReturnToToday, onReturnToToday, showingAlternatives, onReturnToItinerary, mobileOverviewOpen,
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
    <section className={`main-panel ${mobileOverviewOpen ? 'overview-hidden' : ''}`} ref={panelRef}>
      <div className="date-toolbar" data-day-heading tabIndex={-1}>
        <button
          className="nav-btn"
          type="button"
          onClick={() => selectNeighborDate(-1)}
          disabled={selectedIndex <= 0}
          aria-label={t('previousDay')}
          title={t('previousDay')}
        >
          ‹
        </button>
        <div>
          <p className="eyebrow">D{selectedDate?.dayNumber || 1}{selectedDate?.id === todayId && <span className="today-badge">{t('today')}</span>}</p>
          <h2>{selectedDate?.display || t('chooseDate')}</h2>
          {canReturnToToday && selectedDate?.id !== todayId && <button className="today-link" type="button" onClick={onReturnToToday}>{t('backToToday')}</button>}
        </div>
        <button
          className="nav-btn"
          type="button"
          onClick={() => selectNeighborDate(1)}
          disabled={selectedIndex < 0 || selectedIndex >= tripDates.length - 1}
          aria-label={t('nextDay')}
          title={t('nextDay')}
        >
          ›
        </button>
      </div>

      {showingAlternatives ? (
        <section className="day-alternatives" data-day-alternatives tabIndex={-1}>
          <button className="btn btn-small btn-outline" type="button" onClick={onReturnToItinerary}>‹ {t('backToItinerary')}</button>
          <div className="section-title"><h2>{t('changeArrangement')}</h2><span>{t('available', { count: availableCandidateCount })}</span></div>
          <p className="editor-help">{t('changeArrangementHelp')}</p>
          {availableCandidateCount === 0 && <p className="empty-state">{t('noReadyAlternatives')}</p>}
          {renderCandidateGroups()}
        </section>
      ) : renderCurrentPlanCard('current-plan')}
    </section>
  );
}

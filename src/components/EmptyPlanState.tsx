import type { RenderNode, TranslateFn, VoidFn } from '../types/ui';

interface EmptyPlanStateProps {
  onImport: VoidFn;
  onLoadExample: VoidFn;
  onOpenAi: VoidFn;
  renderArchivedTripRows: RenderNode;
  t: TranslateFn;
}

export function EmptyPlanState({
  onImport,
  onLoadExample,
  onOpenAi,
  renderArchivedTripRows,
  t,
}: EmptyPlanStateProps) {
  return (
    <main className="empty-plan-layout">
      <section className="empty-plan-panel">
        <p className="eyebrow">{t('planSetup')}</p>
        <h2>{t('emptyTitle')}</h2>
        <p>{t('emptyDescription')}</p>
        <div className="empty-plan-actions">
          <button className="btn btn-primary" type="button" onClick={onOpenAi}>
            {t('aiGenerateShort')}
          </button>
          <button className="btn btn-outline" type="button" onClick={onLoadExample}>
            {t('viewExample')}
          </button>
          <button className="btn btn-outline" type="button" onClick={onImport}>
            {t('import')}
          </button>
        </div>
        {renderArchivedTripRows()}
      </section>
    </main>
  );
}

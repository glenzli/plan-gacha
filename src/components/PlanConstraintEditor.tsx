import { useMemo } from 'react';
import type { PlanConstraintDraft } from '../domain/planConstraints';
import { PlanPriority, type NormalizedPlan, type WeatherRules } from '../domain/plan';
import { getWeatherLabel, WEATHER_LABELS } from '../domain/weather';
import type { DisplayTripDate } from '../domain/display';
import type { TranslateFn } from '../types/ui';

interface PlanConstraintEditorProps {
  language: string;
  draft: PlanConstraintDraft;
  onChange: (draft: PlanConstraintDraft) => void;
  plan: NormalizedPlan;
  plans: NormalizedPlan[];
  t: TranslateFn;
  tripDates: DisplayTripDate[];
}

type DateStatus = 'available' | 'excluded' | 'closed';
type WeatherRule = keyof WeatherRules | 'unset';

const WEATHER_CHOICES = Object.keys(WEATHER_LABELS.zh)
  .filter((condition) => condition !== 'unknown' && condition !== 'storm');

function getDateStatus(draft: PlanConstraintDraft, dateId: string): DateStatus {
  if (draft.closed_dates.includes(dateId)) return 'closed';
  return draft.available_dates.includes(dateId) ? 'available' : 'excluded';
}

function getWeatherRule(draft: PlanConstraintDraft, condition: string): WeatherRule {
  if (draft.weather_rules.blocked.includes(condition)) return 'blocked';
  if (draft.weather_rules.best.includes(condition)) return 'best';
  if (draft.weather_rules.ok.includes(condition)) return 'ok';
  return 'unset';
}

function setWeatherRule(draft: PlanConstraintDraft, condition: string, rule: WeatherRule): PlanConstraintDraft {
  const weatherRules = Object.fromEntries(
    (['best', 'ok', 'blocked'] as const).map((key) => [
      key,
      draft.weather_rules[key].filter((item) => item !== condition),
    ]),
  ) as unknown as WeatherRules;
  if (rule !== 'unset') weatherRules[rule].push(condition);
  return { ...draft, weather_rules: weatherRules };
}

export function PlanConstraintEditor({
  language,
  draft,
  onChange,
  plan,
  plans,
  t,
  tripDates,
}: PlanConstraintEditorProps) {
  const setDraft = (update: (current: PlanConstraintDraft) => PlanConstraintDraft) => onChange(update(draft));
  const tripDateIds = useMemo(() => new Set(tripDates.map((date) => date.id)), [tripDates]);
  const otherPlans = plans.filter((other) => other.id !== plan.id);
  const validDates = tripDates.filter((date) => getDateStatus(draft, date.id) === 'available');

  const updateDateStatus = (dateId: string, status: DateStatus) => {
    setDraft((current) => {
      const availableDates = current.available_dates.filter((id) => id !== dateId);
      const closedDates = current.closed_dates.filter((id) => id !== dateId);
      if (status !== 'excluded') availableDates.push(dateId);
      if (status === 'closed') closedDates.push(dateId);
      return {
        ...current,
        available_dates: [
          ...current.available_dates.filter((id) => !tripDateIds.has(id)),
          ...tripDates.map((date) => date.id).filter((id) => availableDates.includes(id)),
        ],
        closed_dates: [
          ...current.closed_dates.filter((id) => !tripDateIds.has(id)),
          ...tripDates.map((date) => date.id).filter((id) => closedDates.includes(id)),
        ],
      };
    });
  };

  const toggleConflict = (planId: string) => {
    setDraft((current) => ({
      ...current,
      conflicts: current.conflicts.includes(planId)
        ? current.conflicts.filter((id) => id !== planId)
        : [...current.conflicts, planId],
    }));
  };

  return (
    <section className="plan-constraint-editor">
      <p className="editor-help">{t('constraintEditorHelp')}</p>

      <label className="constraint-priority">
        <span>{t('constraintPriority')}</span>
        <select
          className="input"
          value={draft.priority}
          onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as PlanPriority }))}
        >
          {Object.values(PlanPriority).map((priority) => (
            <option key={priority} value={priority}>{t(`priority.${priority}`)}</option>
          ))}
        </select>
      </label>

      <fieldset className="constraint-fieldset">
        <legend>{t('constraintDates')}</legend>
        <p>{t('constraintDatesHelp')}</p>
        <div className="constraint-date-list">
          {tripDates.map((date) => (
            <label className="constraint-date-row" key={date.id}>
              <span>D{date.dayNumber} · {date.display}</span>
              <select
                className="input"
                aria-label={t('constraintDateStatusFor', { date: date.display })}
                value={getDateStatus(draft, date.id)}
                onChange={(event) => updateDateStatus(date.id, event.target.value as DateStatus)}
              >
                <option value="available">{t('constraintDateAvailable')}</option>
                <option value="excluded">{t('constraintDateExcluded')}</option>
                <option value="closed">{t('constraintDateClosed')}</option>
              </select>
            </label>
          ))}
        </div>
        {validDates.length === 0 && <p className="constraint-error" role="alert">{t('constraintNoAvailableDate')}</p>}
      </fieldset>

      <details className="constraint-details">
        <summary>{t('constraintConflicts')} · {draft.conflicts.length}</summary>
        <p>{t('constraintConflictsHelp')}</p>
        <div className="constraint-checkbox-list">
          {otherPlans.map((other) => (
            <label key={other.id}>
              <input
                type="checkbox"
                checked={draft.conflicts.includes(other.id)}
                onChange={() => toggleConflict(other.id)}
              />
              <span>{other.name}</span>
            </label>
          ))}
          {otherPlans.length === 0 && <span>{t('constraintNoOtherPlans')}</span>}
        </div>
      </details>

      <details className="constraint-details">
        <summary>{t('constraintWeather')}</summary>
        <p>{t('constraintWeatherHelp')}</p>
        <div className="constraint-weather-list">
          {WEATHER_CHOICES.map((condition) => (
            <label className="constraint-weather-row" key={condition}>
              <span>{getWeatherLabel(condition, language)}</span>
              <select
                className="input"
                value={getWeatherRule(draft, condition)}
                onChange={(event) => setDraft((current) => setWeatherRule(current, condition, event.target.value as WeatherRule))}
              >
                <option value="unset">{t('constraintWeatherUnset')}</option>
                {condition !== 'heavy_rain' && <option value="best">{t('constraintWeatherBest')}</option>}
                <option value="ok">{t('constraintWeatherOk')}</option>
                <option value="blocked">{t('constraintWeatherBlocked')}</option>
              </select>
            </label>
          ))}
        </div>
        <label className="constraint-any-weather">
          <input
            type="checkbox"
            checked={draft.weather_rules.ok.includes('any')}
            onChange={(event) => setDraft((current) => ({
              ...current,
              weather_rules: {
                ...current.weather_rules,
                ok: event.target.checked
                  ? [...current.weather_rules.ok, 'any']
                  : current.weather_rules.ok.filter((value) => value !== 'any'),
              },
            }))}
          />
          <span>{t('constraintWeatherAny')}</span>
        </label>
        <p>{t('constraintStormBlocked')}</p>
      </details>

    </section>
  );
}

import { useId } from 'react';
import type { Period, PeriodType } from '../domain/types';
import {
  MONTH_NAMES_FR,
  makePeriod,
  parseISODate,
  shiftPeriod,
  todayISO,
} from '../domain/periods';
import { Icon } from './Icon';

const TYPE_LABELS: Record<PeriodType, string> = {
  month: 'Mois',
  quarter: 'Trimestre',
  semester: 'Semestre',
  year: 'Année',
};

export function PeriodPicker({
  period,
  onChange,
  showType = true,
  ariaLabel = 'Sélection de la période',
}: {
  period: Period;
  onChange: (period: Period) => void;
  showType?: boolean;
  ariaLabel?: string;
}) {
  const typeId = useId();
  const indexId = useId();
  const yearId = useId();
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let year = currentYear - 10; year <= currentYear + 10; year += 1) years.push(year);
  if (!years.includes(period.year)) {
    years.push(period.year);
    years.sort((a, b) => a - b);
  }

  const monthOfPeriod = parseISODate(period.start)?.month ?? 1;

  const changeType = (type: PeriodType) => {
    let index: number | undefined;
    if (type === 'month') index = monthOfPeriod;
    else if (type === 'quarter') index = Math.floor((monthOfPeriod - 1) / 3) + 1;
    else if (type === 'semester') index = monthOfPeriod <= 6 ? 1 : 2;
    onChange(makePeriod(type, period.year, index));
  };

  let indexOptions: { value: number; label: string }[] = [];
  if (period.type === 'month') {
    indexOptions = MONTH_NAMES_FR.map((label, index) => ({ value: index + 1, label }));
  } else if (period.type === 'quarter') {
    indexOptions = [1, 2, 3, 4].map((index) => ({ value: index, label: `T${index}` }));
  } else if (period.type === 'semester') {
    indexOptions = [1, 2].map((index) => ({ value: index, label: `S${index}` }));
  }

  return (
    <div className="period-picker" role="group" aria-label={ariaLabel}>
      {showType && (
        <>
          <label className="visually-hidden" htmlFor={typeId}>
            Type de période
          </label>
          <select
            className="select"
            id={typeId}
            value={period.type}
            onChange={(event) => changeType(event.target.value as PeriodType)}
          >
            {(Object.keys(TYPE_LABELS) as PeriodType[]).map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </>
      )}
      <button
        type="button"
        className="btn btn-icon btn-secondary"
        aria-label="Période précédente"
        title="Période précédente"
        onClick={() => onChange(shiftPeriod(period, -1))}
      >
        <Icon name="chevron-left" size={16} />
      </button>
      {period.index !== undefined && (
        <>
          <label className="visually-hidden" htmlFor={indexId}>
            {period.type === 'month' ? 'Mois' : period.type === 'quarter' ? 'Trimestre' : 'Semestre'}
          </label>
          <select
            className="select"
            id={indexId}
            value={period.index}
            onChange={(event) =>
              onChange(makePeriod(period.type, period.year, Number(event.target.value)))
            }
          >
            {indexOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </>
      )}
      <label className="visually-hidden" htmlFor={yearId}>
        Année
      </label>
      <select
        className="select"
        id={yearId}
        value={period.year}
        onChange={(event) => onChange(makePeriod(period.type, Number(event.target.value), period.index))}
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-icon btn-secondary"
        aria-label="Période suivante"
        title="Période suivante"
        onClick={() => onChange(shiftPeriod(period, 1))}
      >
        <Icon name="chevron-right" size={16} />
      </button>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={() => {
          const iso = todayISO();
          const parsed = parseISODate(iso)!;
          let index: number | undefined;
          if (period.type === 'month') index = parsed.month;
          else if (period.type === 'quarter') index = Math.floor((parsed.month - 1) / 3) + 1;
          else if (period.type === 'semester') index = parsed.month <= 6 ? 1 : 2;
          onChange(makePeriod(period.type, parsed.year, index));
        }}
        aria-label="Revenir à la période actuelle"
        title="Revenir à la période actuelle"
      >
        Aujourd’hui
      </button>
    </div>
  );
}

import { useState } from 'react';
import {
  getISTDateString,
  getISTWeekRange,
  getISTMonthRangeOffset,
  getISTLastNMonthsRange,
  getISTYearRange,
} from '../../utils/dateHelpers';

const PRESETS = [
  { key: 'today', label: "Today" },
  { key: 'this_week', label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'last_3_months', label: 'Last 3 Months' },
  { key: 'this_year', label: 'This Year' },
  { key: 'custom', label: 'Custom Range' },
];

export function computeRangeForPreset(key, customStart, customEnd) {
  switch (key) {
    case 'today': {
      const today = getISTDateString();
      return { start: today, end: today };
    }
    case 'this_week':
      return getISTWeekRange(0);
    case 'last_week':
      return getISTWeekRange(-1);
    case 'this_month':
      return getISTMonthRangeOffset(0);
    case 'last_month':
      return getISTMonthRangeOffset(-1);
    case 'last_3_months':
      return getISTLastNMonthsRange(3);
    case 'this_year':
      return getISTYearRange(0);
    case 'custom':
      return { start: customStart || getISTDateString(), end: customEnd || getISTDateString() };
    default:
      return { start: getISTDateString(), end: getISTDateString() };
  }
}

/**
 * Controlled date-range filter. Calls onChange({ preset, start, end }) whenever
 * the selection changes — parent owns the actual range state and re-queries.
 * Defaults to 'today' per the standard list-page behavior across the app.
 */
export default function DateRangeFilter({ value, onChange }) {
  const [customStart, setCustomStart] = useState(value?.start ?? getISTDateString());
  const [customEnd, setCustomEnd] = useState(value?.end ?? getISTDateString());

  const preset = value?.preset ?? 'today';

  const handlePresetChange = (key) => {
    if (key === 'custom') {
      onChange({ preset: key, ...computeRangeForPreset(key, customStart, customEnd) });
    } else {
      onChange({ preset: key, ...computeRangeForPreset(key) });
    }
  };

  const handleCustomChange = (field, val) => {
    const nextStart = field === 'start' ? val : customStart;
    const nextEnd = field === 'end' ? val : customEnd;
    setCustomStart(nextStart);
    setCustomEnd(nextEnd);
    onChange({ preset: 'custom', start: nextStart, end: nextEnd });
  };

  return (
    <div className="d-flex align-items-center gap-2 flex-wrap">
      <select
        className="form-select form-select-sm"
        style={{ width: 'auto' }}
        value={preset}
        onChange={(e) => handlePresetChange(e.target.value)}
      >
        {PRESETS.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
      </select>

      {preset === 'custom' && (
        <>
          <input
            type="date"
            className="form-control form-control-sm"
            style={{ width: 'auto' }}
            value={customStart}
            onChange={(e) => handleCustomChange('start', e.target.value)}
          />
          <span className="text-secondary small">to</span>
          <input
            type="date"
            className="form-control form-control-sm"
            style={{ width: 'auto' }}
            value={customEnd}
            onChange={(e) => handleCustomChange('end', e.target.value)}
          />
        </>
      )}
    </div>
  );
}

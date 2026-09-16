import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const IST = 'Asia/Kolkata';

/** Today's date as 'YYYY-MM-DD' in IST, regardless of the browser's local timezone. */
export function getISTDateString(date) {
  return dayjs(date).tz(IST).format('YYYY-MM-DD');
}

/** Start/end of the current IST month, as 'YYYY-MM-DD' strings (for date-range queries). */
export function getISTMonthRange(date) {
  const d = dayjs(date).tz(IST);
  return {
    start: d.startOf('month').format('YYYY-MM-DD'),
    end: d.endOf('month').format('YYYY-MM-DD'),
  };
}

/** Start/end of the current IST week (Mon-Sun), optionally offset by whole weeks (-1 = last week). */
export function getISTWeekRange(offsetWeeks = 0) {
  const d = dayjs().tz(IST).add(offsetWeeks, 'week');
  return {
    start: d.startOf('week').format('YYYY-MM-DD'),
    end: d.endOf('week').format('YYYY-MM-DD'),
  };
}

/** Start/end of a month, offset by whole months from the current one (0 = this month, -1 = last month). */
export function getISTMonthRangeOffset(offsetMonths = 0) {
  const d = dayjs().tz(IST).add(offsetMonths, 'month');
  return {
    start: d.startOf('month').format('YYYY-MM-DD'),
    end: d.endOf('month').format('YYYY-MM-DD'),
  };
}

/** Rolling window of the last N months up to today (not calendar-aligned) — for "Last 3 Months" style presets. */
export function getISTLastNMonthsRange(n) {
  return {
    start: dayjs().tz(IST).subtract(n, 'month').format('YYYY-MM-DD'),
    end: dayjs().tz(IST).format('YYYY-MM-DD'),
  };
}

/** Start/end of the current IST year, optionally offset by whole years. */
export function getISTYearRange(offsetYears = 0) {
  const d = dayjs().tz(IST).add(offsetYears, 'year');
  return {
    start: d.startOf('year').format('YYYY-MM-DD'),
    end: d.endOf('year').format('YYYY-MM-DD'),
  };
}

/** Array of the last N days (IST) as 'YYYY-MM-DD', oldest first — for chart x-axes. */
export function getLastNDaysIST(n) {
  const today = dayjs().tz(IST);
  return Array.from({ length: n }, (_, i) =>
    today.subtract(n - 1 - i, 'day').format('YYYY-MM-DD')
  );
}

/** Array of the last N months (IST) as { key: 'YYYY-MM', label: 'Jan 2026' } — for chart x-axes. */
export function getLastNMonthsIST(n) {
  const today = dayjs().tz(IST);
  return Array.from({ length: n }, (_, i) => {
    const m = today.subtract(n - 1 - i, 'month');
    return { key: m.format('YYYY-MM'), label: m.format('MMM YYYY') };
  });
}

/** Friendly display formatting, IST-aware. */
export function formatDateIST(date, fmt = 'DD MMM YYYY') {
  return dayjs(date).tz(IST).format(fmt);
}

export function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/**
 * Formats a sale's discount for display, respecting how it was entered —
 * "10%" for a percentage discount, "₹100" for a flat one — rather than
 * always showing just the computed ₹ amount, which loses that distinction.
 */
export function formatDiscountLabel(sale) {
  if (sale.discount_type === 'percent') {
    return `${sale.discount_value}% (${formatCurrency(sale.discount)})`;
  }
  return formatCurrency(sale.discount);
}

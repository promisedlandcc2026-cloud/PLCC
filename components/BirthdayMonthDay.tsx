import React from 'react';

/**
 * Birthday as Month + Day, with an optional birth year the member chooses to add.
 *
 * Pastor's request: no one has to share their birth year. Without a year it is
 * saved as 1904-MM-DD (1904 is a leap year so Feb 29 works, and every age helper
 * treats 1904 as "age unknown"). Turning on "Include my birth year" shows a Year
 * box and saves the real date; turning it off removes the year again.
 * Children's birthdays keep the full date (their age sets Child / Youth).
 */
export const NO_YEAR = 1904;

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const OLDEST_YEAR = 1910;

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysIn(month: number, year: number): number {
  if (!month) return 31;
  if (month === 2 && year && year !== NO_YEAR && !isLeap(year)) return 28;
  return DAYS_IN_MONTH[month - 1];
}

/** "1985-03-07" or "1904-03-07" → { month: 3, day: 7 } (the year is ignored). */
export function splitMonthDay(value: string | null | undefined): { month: number; day: number } {
  const m = String(value || '').slice(0, 10).match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m) return { month: 0, day: 0 };
  return { month: Number(m[1]), day: Number(m[2]) };
}

/** The real birth year in a saved birthday, or 0 when there is none (1904 / empty). */
export function splitYear(value: string | null | undefined): number {
  const m = String(value || '').slice(0, 10).match(/^(\d{4})-\d{2}-\d{2}$/);
  if (!m) return 0;
  const y = Number(m[1]);
  return y === NO_YEAR ? 0 : y;
}

/** Month + day → "1904-MM-DD", or "" until both are chosen. */
export function toNoYearBirthday(month: number, day: number): string {
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) return '';
  return `${NO_YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Month + day + optional year → "YYYY-MM-DD". No year (0) → the 1904 no-year form.
 * Returns "" until month and day are chosen, or when the date can't exist / is in the future.
 */
export function toBirthday(month: number, day: number, year: number): string {
  if (!year) return toNoYearBirthday(month, day);
  const thisYear = new Date().getFullYear();
  if (year < OLDEST_YEAR || year > thisYear) return '';
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > daysIn(month, year)) return '';
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return iso > todayIso ? '' : iso;
}

type Props = {
  value: string;
  onChange?: (value: string) => void;
  /** For plain HTML forms: a hidden input carries the value under this name. */
  name?: string;
  id?: string;
  disabled?: boolean;
  selectClassName?: string;
  className?: string;
  /** Show the "Include my birth year" switch (default on). */
  allowYear?: boolean;
  /** Switch wording: "my" for a member's own profile, "their" when staff edit someone. */
  whose?: 'my' | 'their';
};

export const BirthdayMonthDay: React.FC<Props> = ({
  value,
  onChange,
  name,
  id,
  disabled,
  selectClassName = 'w-full p-3 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-gold',
  className = '',
  allowYear = true,
  whose = 'my',
}) => {
  const initial = splitMonthDay(value);
  const [month, setMonth] = React.useState(initial.month);
  const [day, setDay] = React.useState(initial.day);
  const [year, setYear] = React.useState(splitYear(value));
  const [withYear, setWithYear] = React.useState(splitYear(value) > 0);
  const switchId = React.useId();

  const composed = toBirthday(month, day, withYear ? year : 0);

  React.useEffect(() => {
    // Half-picked (month but no day yet, or year switch on with no year) reports "" — keep what's on screen.
    if (value === composed || !value) return;
    const next = splitMonthDay(value);
    const y = splitYear(value);
    setMonth(next.month);
    setDay(next.day);
    setYear(y);
    setWithYear(y > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const maxDay = daysIn(month, withYear ? year : 0);
  const emit = (m: number, d: number, y: number, on: boolean) => {
    // With the switch on but no year picked yet, keep saving month & day only.
    const out = on && y ? toBirthday(m, d, y) : toNoYearBirthday(m, d);
    onChange?.(out);
  };

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - OLDEST_YEAR + 1 }, (_, i) => thisYear - i);

  return (
    <div className={className}>
      <div className={`grid gap-2 ${withYear ? 'grid-cols-[1.4fr_1fr_1.1fr]' : 'grid-cols-[1.4fr_1fr]'}`}>
        <select
          id={id}
          aria-label="Birthday month"
          value={month || ''}
          disabled={disabled}
          onChange={(e) => {
            const m = Number(e.target.value) || 0;
            const d = day && m && day > daysIn(m, withYear ? year : 0) ? 0 : day;
            setMonth(m);
            setDay(d);
            emit(m, d, year, withYear);
          }}
          className={selectClassName}
        >
          <option value="">Month</option>
          {MONTHS.map((label, i) => (
            <option key={label} value={i + 1}>{label}</option>
          ))}
        </select>
        <select
          aria-label="Birthday day"
          value={day || ''}
          disabled={disabled}
          onChange={(e) => {
            const d = Number(e.target.value) || 0;
            setDay(d);
            emit(month, d, year, withYear);
          }}
          className={selectClassName}
        >
          <option value="">Day</option>
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        {withYear ? (
          <select
            aria-label="Birth year"
            value={year || ''}
            disabled={disabled}
            onChange={(e) => {
              const y = Number(e.target.value) || 0;
              const d = day && month && day > daysIn(month, y) ? 0 : day;
              setYear(y);
              setDay(d);
              emit(month, d, y, true);
            }}
            className={selectClassName}
          >
            <option value="">Year</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        ) : null}
      </div>

      {allowYear ? (
        <label htmlFor={switchId} className="mt-2 flex items-center gap-3 cursor-pointer select-none min-h-[44px]">
          <span className="relative inline-flex h-7 w-12 flex-shrink-0">
            <input
              id={switchId}
              type="checkbox"
              role="switch"
              className="peer sr-only"
              checked={withYear}
              disabled={disabled}
              onChange={(e) => {
                const on = e.target.checked;
                setWithYear(on);
                if (!on) setYear(0);
                const d = day && month && day > daysIn(month, on ? year : 0) ? 0 : day;
                setDay(d);
                emit(month, d, on ? year : 0, on);
              }}
            />
            <span className="absolute inset-0 rounded-full bg-gray-300 transition-colors peer-checked:bg-[#1d372c] peer-focus-visible:ring-2 peer-focus-visible:ring-[#C9A35A] peer-disabled:opacity-50" />
            <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
          </span>
          <span className="text-sm text-gray-700">
            Include {whose} birth year <span className="text-gray-500">(optional)</span>
          </span>
        </label>
      ) : null}

      {name ? <input type="hidden" name={name} value={withYear && year ? composed : toNoYearBirthday(month, day)} /> : null}
    </div>
  );
};

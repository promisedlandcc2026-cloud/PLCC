import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from '../../api/_utils/phoneLib';
import { ChevronDown, type LucideIcon } from 'lucide-react';

/**
 * Phone number with a country picker. PLCC is in Uganda, so +256 is the default,
 * but members abroad pick their country (or type a +code) and we hand back a full
 * international number (+256772123456, +447911123456, …) to whatever saves it.
 */

const DEFAULT_COUNTRY: CountryCode = 'UG';
const PREFERRED: CountryCode[] = ['UG', 'KE', 'TZ', 'RW', 'SS', 'CD', 'BI', 'US', 'GB', 'CA', 'ZA', 'AE', 'SA', 'QA', 'DE', 'NL', 'SE', 'AU'];

type Country = { code: CountryCode; name: string; dial: string; flag: string };

function flagOf(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

let cached: { preferred: Country[]; others: Country[] } | null = null;
function countryList() {
  if (cached) return cached;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    names = null;
  }
  const all: Country[] = getCountries().map((code) => {
    let name: string = code;
    try {
      name = names?.of(code) || code;
    } catch {
      /* keep code */
    }
    return { code, name, dial: `+${getCountryCallingCode(code)}`, flag: flagOf(code) };
  });
  const preferred = PREFERRED.map((c) => all.find((x) => x.code === c)).filter((x): x is Country => Boolean(x));
  const others = all.filter((x) => !PREFERRED.includes(x.code)).sort((a, b) => a.name.localeCompare(b.name));
  cached = { preferred, others };
  return cached;
}

/** Splits a saved number into the picker country and what to show in the box. */
export function splitPhone(value: string, fallback: CountryCode = DEFAULT_COUNTRY): { country: CountryCode; local: string } {
  const raw = String(value || '').trim();
  if (!raw) return { country: fallback, local: '' };
  const parsed = parsePhoneNumberFromString(raw.replace(/^00/, '+'), fallback);
  if (parsed?.country && parsed.isValid()) {
    return { country: parsed.country, local: parsed.formatNational() };
  }
  return { country: fallback, local: raw };
}

/** What we hand back: E.164 when the number is valid, otherwise the best full form of what was typed. */
export function joinPhone(local: string, country: CountryCode): string {
  const typed = String(local || '').trim();
  if (!typed) return '';
  const parsed = parsePhoneNumberFromString(typed.replace(/^00/, '+'), country);
  if (parsed && parsed.isValid()) return parsed.number;
  if (typed.startsWith('+')) return typed;
  // Not complete yet: keep the country code so a half-typed abroad number is not read as Ugandan.
  if (country === DEFAULT_COUNTRY) return typed;
  const digits = typed.replace(/\D/g, '').replace(/^0+/, '');
  return digits ? `+${getCountryCallingCode(country)}${digits}` : '';
}

export function isValidPhone(value: string): boolean {
  const parsed = parsePhoneNumberFromString(String(value || '').trim().replace(/^00/, '+'), DEFAULT_COUNTRY);
  return Boolean(parsed && parsed.isValid());
}

export interface PhoneInputProps {
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  /** For uncontrolled forms: a hidden input with this name carries the full number. */
  name?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  icon?: LucideIcon;
  iconClassName?: string;
  /** Classes for the number box (keep each screen's existing look). */
  inputClassName?: string;
  /** Classes for the country button. */
  countryClassName?: string;
  className?: string;
  'aria-describedby'?: string;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  defaultValue,
  onChange,
  name,
  id,
  placeholder = '0772 123456',
  disabled,
  required,
  autoFocus,
  icon: Icon,
  iconClassName = 'absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none',
  inputClassName = 'w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-[#1d372c]/20',
  countryClassName = 'rounded-xl border border-gray-200 bg-white text-gray-800',
  className = '',
  ...rest
}) => {
  const controlled = value !== undefined;
  const initial = useMemo(() => splitPhone(controlled ? value || '' : defaultValue || ''), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [country, setCountry] = useState<CountryCode>(initial.country);
  const [local, setLocal] = useState(initial.local);
  const lastEmitted = useRef<string>(controlled ? value || '' : defaultValue || '');
  const { preferred, others } = countryList();
  const current = [...preferred, ...others].find((c) => c.code === country);

  // A parent reset (e.g. opening another member) replaces what is shown.
  useEffect(() => {
    if (!controlled) return;
    const next = value || '';
    if (next === lastEmitted.current) return;
    const split = splitPhone(next);
    setCountry(split.country);
    setLocal(split.local);
    lastEmitted.current = next;
  }, [controlled, value]);

  const emit = (nextLocal: string, nextCountry: CountryCode) => {
    let joined = joinPhone(nextLocal, nextCountry);
    // Typed a +code: follow it in the picker.
    if (nextLocal.trim().startsWith('+')) {
      const parsed = parsePhoneNumberFromString(nextLocal.trim());
      if (parsed?.country && parsed.country !== nextCountry) setCountry(parsed.country);
      if (parsed?.isValid()) joined = parsed.number;
    }
    lastEmitted.current = joined;
    onChange?.(joined);
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <div className={`relative shrink-0 flex items-center gap-1 px-3 ${countryClassName} ${disabled ? 'opacity-60' : ''}`}>
        <span aria-hidden="true" className="text-base leading-none">{current?.flag}</span>
        <span aria-hidden="true" className="text-sm font-bold tabular-nums">{current?.dial}</span>
        <ChevronDown size={14} aria-hidden="true" className="opacity-60" />
        <select
          aria-label="Country code"
          value={country}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value as CountryCode;
            setCountry(next);
            emit(local, next);
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        >
          <optgroup label="Common">
            {preferred.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name} ({c.dial})
              </option>
            ))}
          </optgroup>
          <optgroup label="All countries">
            {others.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name} ({c.dial})
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <div className="relative flex-1 min-w-0">
        {Icon ? <Icon size={18} className={iconClassName} aria-hidden /> : null}
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={local}
          placeholder={country === 'UG' ? placeholder : 'Phone number'}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          aria-describedby={rest['aria-describedby']}
          onChange={(e) => {
            setLocal(e.target.value);
            emit(e.target.value, country);
          }}
          className={inputClassName}
        />
        {name ? <input type="hidden" name={name} value={joinPhone(local, country)} /> : null}
      </div>
    </div>
  );
};

export default PhoneInput;

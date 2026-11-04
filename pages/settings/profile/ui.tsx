import React from 'react';
import type { LucideIcon } from 'lucide-react';

/** Shared building blocks for the My Profile settings tab. */

export const inputClass =
  'w-full h-12 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-burgundy/30 outline-none font-semibold text-[#0d1a14] placeholder:text-gray-400 disabled:opacity-60';

type SectionCardProps = {
  icon: LucideIcon;
  iconTone?: 'burgundy' | 'gold';
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
};

export const SectionCard: React.FC<SectionCardProps> = ({
  icon: Icon,
  iconTone = 'burgundy',
  title,
  subtitle,
  action,
  children,
  id,
}) => (
  <section
    id={id}
    aria-labelledby={id ? `${id}-title` : undefined}
    className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-7 space-y-5 scroll-mt-6"
  >
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            iconTone === 'gold' ? 'bg-gold-cream text-[#8A6A2E]' : 'bg-burgundy/5 text-burgundy'
          }`}
        >
          <Icon size={18} />
        </div>
        <div>
          <h3 id={id ? `${id}-title` : undefined} className="text-base font-black text-[#0d1a14]">
            {title}
          </h3>
          <p className="text-xs text-gray-600 font-medium">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
    {children}
  </section>
);

export const FieldLabel: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">
    {children}
    {hint ? (
      <span className="ml-1 normal-case tracking-normal font-medium text-gray-500">({hint})</span>
    ) : null}
  </span>
);

type IconInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  icon: LucideIcon;
};

export const IconInput: React.FC<IconInputProps> = ({ icon: Icon, className = '', ...rest }) => (
  <div className="relative">
    <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
    <input {...rest} className={`${inputClass} pl-10 pr-3 ${className}`} />
  </div>
);

export const StatusPill: React.FC<{ on: boolean; children: React.ReactNode; size?: 'sm' | 'xs' }> = ({
  on,
  children,
  size = 'sm',
}) => (
  <span
    className={`inline-block font-black rounded-lg border ${
      size === 'xs' ? 'text-[10px] uppercase tracking-widest px-2.5 py-1' : 'text-xs px-2.5 py-1'
    } ${on ? 'text-green-700 bg-green-50 border-green-100' : 'text-gray-600 bg-gray-50 border-gray-100'}`}
  >
    {children}
  </span>
);

export const InlineError: React.FC<{ message: string | null }> = ({ message }) =>
  message ? (
    <p role="alert" className="text-sm font-medium text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
      {message}
    </p>
  ) : null;

export const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm text-gray-500 font-medium py-3 px-3 text-center border border-dashed border-gray-200 rounded-xl">
    {children}
  </p>
);

export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message?: unknown }).message || '').trim();
    if (msg) return msg;
  }
  return fallback;
}

export const MIN_PASSWORD_LENGTH = 6;

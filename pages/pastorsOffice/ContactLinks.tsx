import React from 'react';
import { Mail, MessageCircle, Phone } from 'lucide-react';

/** Phone / WhatsApp / email buttons for one request. Placeholder phone-login emails are hidden. */
export function usableEmail(email?: string | null): string | null {
  const e = String(email || '').trim();
  if (!e || /@phone\.[a-z0-9.-]*\.invalid$/i.test(e)) return null;
  return e;
}

export function whatsappNumber(phone?: string | null): string | null {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

export default function ContactLinks({ phone, email }: { phone?: string | null; email?: string | null }) {
  const mail = usableEmail(email);
  const wa = whatsappNumber(phone);
  if (!phone && !mail) return <p className="mt-1 text-xs text-[#8a5a12]">No phone or email given.</p>;
  const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-[#d7dfeb] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#102d50] hover:bg-[#f2f5f9]';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {phone && <a className={btn} href={`tel:${String(phone).replace(/[^\d+]/g, '')}`}><Phone size={14} />{phone}</a>}
      {wa && <a className={btn} href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} />WhatsApp</a>}
      {mail && <a className={btn} href={`mailto:${mail}`}><Mail size={14} />{mail}</a>}
    </div>
  );
}

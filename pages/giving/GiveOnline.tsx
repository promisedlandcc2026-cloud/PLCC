import React from 'react';
import {
  ArrowUpRight,
  BookOpen,
  CreditCard,
  Landmark,
  Receipt,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { TITHE_URL } from '../../lib/simpleNav';

/**
 * Member Give page.
 *
 * The Vault does not take payments itself. Every gift is made on PLCC Tithe,
 * which processes it, emails the receipt, and records it in the Digital
 * Contribution Book (DCB). One payment system means one set of receipts and
 * one ledger — nothing given here can bypass the DCB.
 */

const MY_GIVING_URL = `${TITHE_URL}?tab=my-giving`;

const serif: React.CSSProperties = { fontFamily: "'Fraunces', Georgia, serif" };

const WAYS_TO_GIVE = [
  {
    icon: CreditCard,
    title: 'Card or wallet',
    detail: 'Debit, credit, Apple Pay or Google Pay',
  },
  {
    icon: Landmark,
    title: 'Bank transfer',
    detail: 'Log in to your bank securely. Lowest fee for the church',
  },
  {
    icon: Smartphone,
    title: 'Zelle, Venmo or Cash App',
    detail: 'Send from your phone; we record it for your statement',
  },
];

const GiveOnlinePage: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto pb-24 pt-4 px-4 space-y-8 animate-in fade-in duration-700">
      {/* Hero — mirrors PLCC Tithe's look */}
      <section
        className="relative overflow-hidden rounded-[2rem] text-white shadow-2xl"
        style={{
          background:
            'radial-gradient(120% 90% at 85% 10%, rgba(201,162,39,0.18) 0%, rgba(201,162,39,0) 55%), linear-gradient(160deg, #112019 0%, #101814 55%, #0b1024 100%)',
        }}
      >
        <div className="px-6 py-10 sm:px-10 sm:py-14">
          <div className="flex items-center gap-4 mb-8">
            <img
              src="/images/awc-logo.png"
              alt=""
              className="w-14 h-14 rounded-full ring-2 ring-[#C9A35A]/60 bg-white/5 object-contain"
            />
            <div>
              <p className="text-lg leading-tight" style={serif}>
                Promised Land Christian Center
              </p>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#e6c766]">PLCC Tithe</p>
            </div>
          </div>

          <h1 className="text-4xl sm:text-5xl leading-[1.05] font-semibold mb-4" style={serif}>
            Giving Worship to God,
            <br />
            Blessing Our City
          </h1>
          <p className="text-white/80 text-base mb-6">Changing Hearts. Transforming Lives.</p>

          <p className="text-white/70 text-[15px] italic mb-8" style={serif}>
            “God loves a cheerful giver.” <span className="not-italic text-white/50 text-xs">— 2 Corinthians 9:7</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={TITHE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 min-h-[52px] px-8 rounded-xl bg-[#C9A35A] text-[#101814] font-bold text-base shadow-lg hover:bg-[#d8b33a] active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-[#e6c766]/50"
            >
              Give now
              <ArrowUpRight size={18} />
            </a>
            <a
              href={MY_GIVING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 rounded-xl border border-white/25 text-white font-semibold hover:bg-white/10 transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
            >
              <BookOpen size={17} />
              My giving & receipts
            </a>
          </div>
          <p className="text-white/45 text-xs mt-4">Opens the church's secure giving site in a new tab.</p>
        </div>
      </section>

      {/* Ways to give */}
      <section aria-labelledby="ways-to-give">
        <h2 id="ways-to-give" className="text-2xl text-[#0d1a14] font-semibold mb-4" style={serif}>
          Ways to give
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {WAYS_TO_GIVE.map(({ icon: Icon, title, detail }) => (
            <li key={title} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="w-10 h-10 rounded-xl bg-burgundy/5 text-burgundy flex items-center justify-center mb-3">
                <Icon size={20} />
              </div>
              <p className="font-bold text-[#0d1a14] text-[15px] mb-1">{title}</p>
              <p className="text-gray-500 text-sm leading-snug">{detail}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Trust */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 grid gap-4 sm:grid-cols-2">
        <div className="flex gap-3">
          <Receipt className="text-[#b08a1e] shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-bold text-[#0d1a14] text-sm">Receipt for every gift</p>
            <p className="text-gray-500 text-sm leading-snug">
              Emailed after each gift, with a year-end statement by January 31.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <ShieldCheck className="text-[#b08a1e] shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-bold text-[#0d1a14] text-sm">Private and secure</p>
            <p className="text-gray-500 text-sm leading-snug">
              Payments are processed by Stripe. Your giving history is visible only to you and the church's finance team.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default GiveOnlinePage;

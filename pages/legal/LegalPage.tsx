import React, { useEffect } from 'react';
import { ArrowLeft, FileText, MessageCircle, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  CHURCH_NAME,
  CHURCH_WHATSAPP,
  CHURCH_WHATSAPP_LINK,
  LEGAL_UPDATED,
  PRIVACY_INTRO,
  PRIVACY_SECTIONS,
  TERMS_INTRO,
  TERMS_SECTIONS,
  type LegalSection,
} from './plccLegalContent';

/** Public Terms of Service / Privacy Policy pages (no sign-in needed). */
const LegalPage: React.FC<{ kind: 'terms' | 'privacy' }> = ({ kind }) => {
  const isTerms = kind === 'terms';
  const title = isTerms ? 'Terms of Service' : 'Privacy Policy';
  const intro = isTerms ? TERMS_INTRO : PRIVACY_INTRO;
  const sections: LegalSection[] = isTerms ? TERMS_SECTIONS : PRIVACY_SECTIONS;

  useEffect(() => {
    document.title = `${title} · PLCC`;
    window.scrollTo(0, 0);
  }, [title]);

  return (
    <div className="min-h-screen bg-[#f6f1e7]">
      <header className="bg-[#0f2a20] text-white">
        <div className="max-w-3xl mx-auto px-5 pt-6 pb-10">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm font-bold text-[#e7cf8f] min-h-[44px]">
            <ArrowLeft size={16} aria-hidden /> Back to sign in
          </Link>
          <p className="mt-4 text-[11px] font-black uppercase tracking-[0.25em] text-[#d9b45e]">{CHURCH_NAME}</p>
          <h1 className="mt-2 flex items-center gap-3 text-3xl md:text-4xl font-black">
            {isTerms ? <FileText className="text-[#d9b45e]" aria-hidden /> : <Shield className="text-[#d9b45e]" aria-hidden />}
            {title}
          </h1>
          <p className="mt-2 text-sm text-white/60">Last updated {LEGAL_UPDATED}</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 -mt-6 pb-16">
        <article className="bg-white rounded-3xl shadow-sm border border-black/5 p-6 md:p-10 space-y-8 text-[15px] leading-relaxed text-[#1f2a24]">
          <p className="text-base">{intro}</p>
          {sections.map((s) => (
            <section key={s.heading} className="space-y-3">
              <h2 className="text-lg font-black text-[#0f2a20]">{s.heading}</h2>
              {s.lead ? <p>{s.lead}</p> : null}
              {s.bullets ? (
                <ul className="space-y-2 pl-5 list-disc marker:text-[#b8913f]">
                  {s.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : null}
              {(s.paragraphs || []).map((p) => (
                <p key={p}>{p}</p>
              ))}
            </section>
          ))}

          <div className="rounded-2xl bg-[#0f2a20] text-white p-5 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <p className="font-black">Questions?</p>
              <p className="text-sm text-white/70">Contact the church office on WhatsApp.</p>
            </div>
            <a
              href={CHURCH_WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl bg-[#d9b45e] text-[#1d2414] font-black text-sm"
            >
              <MessageCircle size={16} aria-hidden /> {CHURCH_WHATSAPP}
            </a>
          </div>

          <p className="text-sm text-gray-500 text-center">
            {isTerms ? (
              <>See also our <Link to="/privacy" className="font-bold text-[#7a5a14] underline">Privacy Policy</Link>.</>
            ) : (
              <>See also our <Link to="/terms" className="font-bold text-[#7a5a14] underline">Terms of Service</Link>.</>
            )}
          </p>
        </article>
      </main>
    </div>
  );
};

export const TermsPage: React.FC = () => <LegalPage kind="terms" />;
export const PrivacyPage: React.FC = () => <LegalPage kind="privacy" />;
export default LegalPage;

import React, { useMemo, useRef, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Heart,
  Shield,
  Utensils,
  Plus,
  Printer,
} from 'lucide-react';
import {
  findTwoColumnPair,
  parseConsentContent,
  takeSectionSlice,
  type ConsentBlock,
} from '../../lib/consentNoticeParse';

type ConsentNoticeDocumentProps = {
  title: string;
  content: string;
  /** Override maroon banner text */
  bannerText?: string;
  className?: string;
  /** Compact mode for scroll areas (cookout / modal) */
  compact?: boolean;
  /** Show a Print button on the notice (default true) */
  showPrintButton?: boolean;
};

const PRINT_STYLE_ID = 'consent-notice-print-styles';

const PRINT_STYLE_CSS = `
  @media print {
    @page {
      size: letter;
      margin: 0.5in;
    }
    html, body, #root {
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: visible !important;
      position: static !important;
      background: white !important;
    }
  }
`;

function ensurePrintStyles() {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(PRINT_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = PRINT_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = PRINT_STYLE_CSS;
}

/** Print a single consent notice in an iframe so SPA height/overflow never clips pages. */
export function printConsentNotice(el: HTMLElement | null) {
  if (!el) {
    window.print();
    return;
  }

  ensurePrintStyles();
  document.getElementById('consent-print-frame')?.remove();

  const clone = el.cloneNode(true) as HTMLElement;
  clone.classList.add('consent-notice-printing');
  clone.querySelectorAll('.consent-notice-print-btn').forEach((btn) => btn.remove());
  clone.querySelectorAll('style').forEach((s) => s.remove());
  // Absolutize image URLs (iframe is about:blank)
  clone.querySelectorAll('img').forEach((img) => {
    const node = img as HTMLImageElement;
    if (node.src) node.setAttribute('src', node.src);
  });

  const iframe = document.createElement('iframe');
  iframe.id = 'consent-print-frame';
  iframe.title = 'Print consent form';
  iframe.setAttribute('aria-hidden', 'true');
  // Must be letter-width so Tailwind md: breakpoints keep the two-column poster layout
  iframe.style.cssText =
    'position:fixed;left:0;top:0;width:8.5in;height:11in;border:0;opacity:0;pointer-events:none;z-index:-1;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    window.print();
    return;
  }

  const headBits: string[] = [`<base href="${window.location.origin}/">`];
  document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    headBits.push((link as HTMLLinkElement).outerHTML);
  });
  document.querySelectorAll('style').forEach((styleEl) => {
    headBits.push((styleEl as HTMLStyleElement).outerHTML);
  });

  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=816" />
<title>Consent Form</title>
${headBits.join('\n')}
<style>
  /* Fixed letter layout — looks the same with Default or None margins */
  @page {
    size: letter portrait;
    margin: 0.4in;
  }
  html, body {
    width: 8.5in !important;
    max-width: 8.5in !important;
    height: auto !important;
    overflow: visible !important;
    margin: 0 auto !important;
    padding: 0 !important;
    background: white !important;
  }
  body {
    box-sizing: border-box;
    padding: 0.15in 0.2in !important;
  }
  .consent-notice-printing {
    border: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    padding-top: 0 !important;
    overflow: visible !important;
    height: auto !important;
    max-height: none !important;
    max-width: 100% !important;
    background: white !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .consent-notice-inner {
    padding: 0 !important;
  }
  /* Tighter vertical rhythm so the poster fits one letter page */
  .consent-notice-inner.space-y-5 > :not([hidden]) ~ :not([hidden]),
  .consent-notice-inner.space-y-6 > :not([hidden]) ~ :not([hidden]),
  .consent-notice-inner.sm\\:space-y-6 > :not([hidden]) ~ :not([hidden]) {
    margin-top: 0.4rem !important;
  }
  .consent-notice-printing header {
    gap: 0.65rem !important;
  }
  .consent-notice-printing header img {
    width: 4.25rem !important;
    height: 4.25rem !important;
    max-height: 4.25rem !important;
  }
  .consent-notice-printing h1 {
    font-size: 1.35rem !important;
    line-height: 1.1 !important;
  }
  .consent-notice-printing h2 {
    font-size: 1.25rem !important;
    line-height: 1.15 !important;
    margin: 0 !important;
  }
  .consent-notice-printing .space-y-3 > :not([hidden]) ~ :not([hidden]) {
    margin-top: 0.35rem !important;
  }
  .consent-notice-printing .space-y-4 > :not([hidden]) ~ :not([hidden]) {
    margin-top: 0.45rem !important;
  }
  .consent-notice-printing p,
  .consent-notice-printing li {
    font-size: 11.5px !important;
    line-height: 1.35 !important;
  }
  .consent-notice-printing .text-xl,
  .consent-notice-printing .sm\\:text-2xl {
    font-size: 1.15rem !important;
  }
  /* Force two-column foods/prevention row (iframe used to be 0px wide → stacked layout) */
  .consent-notice-printing .consent-notice-two-col {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 0.75rem 1rem !important;
  }
  .consent-notice-printing .consent-notice-two-col-rule {
    display: block !important;
  }
  /* Keep callouts whole — with compacted layout they fit on page 1 */
  .consent-notice-printing .consent-notice-callout {
    break-inside: avoid;
    page-break-inside: avoid;
    padding: 0.55rem 0.7rem !important;
  }
  .consent-notice-printing .consent-notice-callout .text-xl,
  .consent-notice-printing .consent-notice-callout .sm\\:text-2xl {
    font-size: 1.15rem !important;
    margin: 0.2rem 0 !important;
  }
  .consent-notice-printing footer {
    padding-top: 0.15rem !important;
  }
  .consent-notice-print-btn { display: none !important; }
</style>
</head>
<body>${clone.outerHTML}</body>
</html>`);
  doc.close();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
    win.removeEventListener('afterprint', cleanup);
  };

  const runPrint = () => {
    win.addEventListener('afterprint', cleanup);
    win.focus();
    win.print();
    window.setTimeout(cleanup, 60_000);
  };

  const images = Array.from(doc.images || []);
  const waitImages = Promise.all(
    images.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
    )
  );

  const waitFonts = doc.fonts?.ready ?? Promise.resolve();
  Promise.all([waitImages, waitFonts]).then(() => {
    window.setTimeout(runPrint, 120);
  });
}

const TAGLINE = 'Making Disciples • Building Families • Transforming Lives';
const THANK_YOU = 'THANK YOU FOR HELPING US KEEP OUR CHURCH FAMILY SAFE!';

function sectionIcon(heading: string) {
  const h = heading.toUpperCase();
  if (/FOOD|MEAL|SERVED|EAT/i.test(h)) return Utensils;
  if (/PREVENT|HELP|SAFE|PROTECT|ACKNOWLEDGE|SIGNING/i.test(h)) return Shield;
  if (/MEDICAL|HEALTH|ALLERG/i.test(h)) return Heart;
  if (/PHOTO|VIDEO|MEDIA/i.test(h)) return FileText;
  if (/INJUR|ACCIDENT|EMERGENCY|911/i.test(h)) return AlertTriangle;
  return CheckCircle2;
}

function GoldRule({ diamonds = 1 }: { diamonds?: 1 | 3 }) {
  return (
    <div className="flex items-center gap-1.5 w-full max-w-md mx-auto" aria-hidden>
      <div className="flex-1 h-px bg-[#C9A35A]" />
      {diamonds === 3 ? (
        <span className="flex items-center gap-1 shrink-0 px-0.5">
          <span className="w-1.5 h-1.5 rotate-45 bg-[#C9A35A]" />
          <span className="w-1.5 h-1.5 rotate-45 bg-[#C9A35A]" />
          <span className="w-1.5 h-1.5 rotate-45 bg-[#C9A35A]" />
        </span>
      ) : (
        <span className="w-1.5 h-1.5 rotate-45 bg-[#C9A35A] shrink-0" />
      )}
      <div className="flex-1 h-px bg-[#C9A35A]" />
    </div>
  );
}

function renderSectionBody(blocks: ConsentBlock[], keyPrefix: string) {
  return blocks.map((b, i) => {
    if (b.type === 'heading') return null;
    if (b.type === 'paragraph') {
      return (
        <p key={`${keyPrefix}-p-${i}`} className="text-[13px] text-gray-700 leading-relaxed font-medium mb-2 last:mb-0">
          {b.text}
        </p>
      );
    }
    if (b.type === 'bullets') {
      return (
        <ul key={`${keyPrefix}-ul-${i}`} className="space-y-1.5 mb-2 last:mb-0">
          {b.items.map((item, j) => (
            <li key={j} className="flex gap-2 text-[13px] text-gray-700 font-medium leading-snug">
              <span className="text-[#1d372c] font-black shrink-0 mt-0.5">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    }
    return null;
  });
}

function ColumnCard({ heading, body }: { heading: string; body: ConsentBlock[] }) {
  const Icon = sectionIcon(heading);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-[#1d372c] text-white flex items-center justify-center shrink-0 shadow-sm">
          <Icon size={18} strokeWidth={2.25} />
        </div>
        <h3 className="text-[12px] sm:text-[13px] font-black uppercase tracking-wide text-[#1d372c] leading-snug">
          {heading}
        </h3>
      </div>
      {renderSectionBody(body, heading)}
    </div>
  );
}

const ConsentNoticeDocument: React.FC<ConsentNoticeDocumentProps> = ({
  title,
  content,
  bannerText,
  className = '',
  compact = false,
  showPrintButton = true,
}) => {
  const rootRef = useRef<HTMLElement>(null);
  const parsed = useMemo(() => parseConsentContent(content, title), [content, title]);
  const pair = useMemo(() => findTwoColumnPair(parsed.blocks), [parsed.blocks]);

  useEffect(() => {
    ensurePrintStyles();
  }, []);

  const banner =
    bannerText ||
    (/allerg|meal|food/i.test(title) ? 'PLEASE READ BEFORE EATING' : 'PLEASE READ BEFORE SIGNING');

  const displayTitle = title || parsed.embeddedTitle || 'Consent Form';

  // Indices consumed by two-column pair (heading + following body until next heading)
  const pairedRange = useMemo(() => {
    if (!pair) return null;
    const leftSlice = takeSectionSlice(parsed.blocks, pair.leftIdx);
    const rightSlice = takeSectionSlice(parsed.blocks, pair.rightIdx);
    const end = pair.rightIdx + rightSlice.length;
    return { leftSlice, rightSlice, start: pair.leftIdx, end };
  }, [pair, parsed.blocks]);

  const renderBlock = (b: ConsentBlock, idx: number) => {
    if (b.type === 'important') {
      return (
        <div
          key={idx}
          className="consent-notice-callout consent-notice-important rounded-xl border border-[#1d372c]/35 bg-[#F5EDE0] p-4 sm:p-5 flex gap-3 sm:gap-4"
        >
          <div className="w-10 h-10 rounded-full bg-[#1d372c] text-white flex items-center justify-center shrink-0 font-black text-lg">
            !
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black uppercase tracking-wide text-[#1d372c] mb-1.5">{b.heading}</h3>
            {b.paragraphs.map((p, i) => (
              <p key={i} className="text-[13px] text-gray-800 font-medium leading-relaxed mb-1 last:mb-0">
                {p}
              </p>
            ))}
            {b.bullets.length > 0 && (
              <ul className="mt-2 space-y-1">
                {b.bullets.map((item, j) => (
                  <li key={j} className="flex gap-2 text-[13px] text-gray-800 font-medium">
                    <span className="text-[#1d372c]">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      );
    }

    if (b.type === 'emergency') {
      return (
        <div
          key={idx}
          className="consent-notice-callout consent-notice-emergency rounded-xl border-2 border-[#1d372c] bg-white p-4 sm:p-5 flex gap-3 sm:gap-4"
        >
          <div className="w-10 h-10 rounded-full bg-[#1d372c] text-white flex items-center justify-center shrink-0">
            <Plus size={18} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black uppercase tracking-wide text-[#1d372c] mb-1.5">{b.heading}</h3>
            {b.paragraphs.map((p, i) => {
              const is911 = /\bCALL 911\b/i.test(p);
              return (
                <p
                  key={i}
                  className={
                    is911
                      ? 'text-xl sm:text-2xl font-black uppercase text-[#1d372c] tracking-tight my-2'
                      : 'text-[13px] text-gray-800 font-medium leading-relaxed mb-1 last:mb-0'
                  }
                >
                  {p}
                </p>
              );
            })}
            {b.bullets.length > 0 && (
              <ul className="mt-2 space-y-1">
                {b.bullets.map((item, j) => (
                  <li key={j} className="flex gap-2 text-[13px] text-gray-800 font-medium">
                    <span className="text-[#1d372c]">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      );
    }

    if (b.type === 'heading') {
      const Icon = sectionIcon(b.text);
      return (
        <div key={idx} className="pt-1">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-full bg-[#1d372c] text-white flex items-center justify-center shrink-0">
              <Icon size={16} strokeWidth={2.25} />
            </div>
            <h3 className="text-[12px] sm:text-[13px] font-black uppercase tracking-wide text-[#1d372c] leading-snug">
              {b.text}
            </h3>
          </div>
        </div>
      );
    }

    if (b.type === 'paragraph') {
      return (
        <p key={idx} className="text-[13px] text-gray-700 leading-relaxed font-medium">
          {b.text}
        </p>
      );
    }

    if (b.type === 'bullets') {
      return (
        <ul key={idx} className="space-y-1.5">
          {b.items.map((item, j) => (
            <li key={j} className="flex gap-2 text-[13px] text-gray-700 font-medium leading-snug">
              <span className="text-[#1d372c] font-black shrink-0">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    }

    return null;
  };

  const bodyNodes: React.ReactNode[] = [];
  for (let idx = 0; idx < parsed.blocks.length; idx++) {
    if (pairedRange && idx >= pairedRange.start && idx < pairedRange.end) {
      if (idx === pairedRange.start) {
        const leftHeading =
          pairedRange.leftSlice[0]?.type === 'heading' ? pairedRange.leftSlice[0].text : 'Section';
        const rightHeading =
          pairedRange.rightSlice[0]?.type === 'heading' ? pairedRange.rightSlice[0].text : 'Section';
        bodyNodes.push(
          <div
            key={`pair-${idx}`}
            className="consent-notice-two-col grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 relative py-2"
          >
            <div className="consent-notice-two-col-rule hidden md:block absolute left-1/2 top-2 bottom-2 w-px bg-[#1d372c]/40 -translate-x-1/2" />
            <ColumnCard heading={leftHeading} body={pairedRange.leftSlice} />
            <ColumnCard heading={rightHeading} body={pairedRange.rightSlice} />
          </div>
        );
      }
      continue;
    }
    bodyNodes.push(renderBlock(parsed.blocks[idx], idx));
  }

  return (
    <article
      ref={rootRef}
      className={`consent-notice-doc bg-white text-[#0d1a14] border border-[#1d372c]/15 rounded-2xl shadow-sm relative overflow-visible ${showPrintButton ? 'pt-11' : ''} ${className}`}
    >
      {showPrintButton && (
        <button
          type="button"
          onClick={() => printConsentNotice(rootRef.current)}
          className="consent-notice-print-btn absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/95 border border-[#1d372c]/20 text-[#1d372c] text-[11px] font-black uppercase tracking-widest shadow-sm hover:bg-[#1d372c] hover:text-[#C9A35A] transition-colors print:hidden"
          aria-label="Print this form"
        >
          <Printer size={14} strokeWidth={2.5} />
          Print
        </button>
      )}
      <div
        className={`consent-notice-inner ${compact ? 'p-4 sm:p-5' : 'p-5 sm:p-8 md:p-10'} space-y-5 sm:space-y-6`}
      >
        {/* Header — matches PLCC letterhead: logo left, name + address right */}
        <header className="flex flex-row items-center justify-center gap-4 sm:gap-6 md:gap-8">
          <img
            src="/images/awc-logo.png"
            alt="Promised Land Christian Center"
            className="w-[5.25rem] h-[5.25rem] sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full object-contain bg-white shrink-0"
          />
          <div className="min-w-0 text-center space-y-2 sm:space-y-2.5 pt-0.5">
            <h1 className="font-serif text-[#1d372c] font-bold uppercase leading-[1.05] tracking-wide">
              <span className="block text-xl sm:text-3xl md:text-[2.15rem]">Promised Land</span>
              <span className="block text-xl sm:text-3xl md:text-[2.15rem]">Christian Center</span>
            </h1>
            <GoldRule diamonds={3} />
            <p className="font-serif text-[12px] sm:text-sm text-black leading-snug">
              <span className="block">Kira-Kitukutwe Trading Center</span>
              <span className="block">Wakiso District, Uganda</span>
            </p>
          </div>
        </header>

        {/* Title */}
        <div className="text-center space-y-3">
          <h2 className="text-xl sm:text-2xl md:text-[1.75rem] font-black uppercase tracking-tight text-[#1d372c] leading-snug">
            {displayTitle}
          </h2>
          <div className="inline-flex items-center justify-center gap-2.5 w-full max-w-xl mx-auto px-4 py-2.5 rounded-xl bg-[#1d372c] text-white shadow-sm">
            <AlertTriangle className="text-[#C9A35A] shrink-0" size={18} />
            <span className="text-[11px] sm:text-xs font-black uppercase tracking-[0.14em]">{banner}</span>
          </div>
        </div>

        {/* Intro */}
        {parsed.intro.length > 0 && (
          <div className="space-y-2 text-center max-w-2xl mx-auto">
            {parsed.intro.map((p, i) => (
              <p key={i} className="text-[13px] sm:text-sm text-gray-700 font-medium leading-relaxed">
                {p}
              </p>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="space-y-4">{bodyNodes}</div>

        {/* Footer */}
        <footer className="pt-2 space-y-3 text-center">
          <GoldRule />
          <p className="text-[11px] sm:text-xs font-black uppercase tracking-[0.12em] text-[#1d372c] px-2">
            {THANK_YOU}
          </p>
          <p className="text-[11px] sm:text-xs italic text-gray-500 font-medium">{TAGLINE}</p>
        </footer>
      </div>
    </article>
  );
};

export default ConsentNoticeDocument;

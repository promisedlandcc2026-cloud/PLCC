import React, { Fragment } from 'react';
import { BookOpen } from 'lucide-react';
import { BIBLE_URL } from './awcOne';

/**
 * Turns Scripture references into links that open the church Bible reader at
 * that passage, e.g. "John 3:16–18" → …/bible?b=JHN&c=3&v=16-18.
 */

const BOOKS: [string, string[]][] = [
  ['GEN', ['Genesis', 'Gen']], ['EXO', ['Exodus', 'Exod', 'Ex']], ['LEV', ['Leviticus', 'Lev']], ['NUM', ['Numbers', 'Num']],
  ['DEU', ['Deuteronomy', 'Deut', 'Dt']], ['JOS', ['Joshua', 'Josh']], ['JDG', ['Judges', 'Judg']], ['RUT', ['Ruth']],
  ['1SA', ['1 Samuel', '1 Sam']], ['2SA', ['2 Samuel', '2 Sam']], ['1KI', ['1 Kings', '1 Kgs']], ['2KI', ['2 Kings', '2 Kgs']],
  ['1CH', ['1 Chronicles', '1 Chron', '1 Chr']], ['2CH', ['2 Chronicles', '2 Chron', '2 Chr']], ['EZR', ['Ezra']],
  ['NEH', ['Nehemiah', 'Neh']], ['EST', ['Esther', 'Esth']], ['JOB', ['Job']], ['PSA', ['Psalms', 'Psalm', 'Ps', 'Psa']],
  ['PRO', ['Proverbs', 'Prov']], ['ECC', ['Ecclesiastes', 'Eccl', 'Eccles']], ['SNG', ['Song of Solomon', 'Song of Songs']],
  ['ISA', ['Isaiah', 'Isa']], ['JER', ['Jeremiah', 'Jer']], ['LAM', ['Lamentations', 'Lam']], ['EZK', ['Ezekiel', 'Ezek']],
  ['DAN', ['Daniel', 'Dan']], ['HOS', ['Hosea', 'Hos']], ['JOL', ['Joel']], ['AMO', ['Amos']], ['OBA', ['Obadiah', 'Obad']],
  ['JON', ['Jonah']], ['MIC', ['Micah', 'Mic']], ['NAM', ['Nahum', 'Nah']], ['HAB', ['Habakkuk', 'Hab']],
  ['ZEP', ['Zephaniah', 'Zeph']], ['HAG', ['Haggai', 'Hag']], ['ZEC', ['Zechariah', 'Zech']], ['MAL', ['Malachi', 'Mal']],
  ['MAT', ['Matthew', 'Matt', 'Mt']], ['MRK', ['Mark', 'Mk']], ['LUK', ['Luke', 'Lk']], ['JHN', ['John', 'Jn']],
  ['ACT', ['Acts']], ['ROM', ['Romans', 'Rom']], ['1CO', ['1 Corinthians', '1 Cor']], ['2CO', ['2 Corinthians', '2 Cor']],
  ['GAL', ['Galatians', 'Gal']], ['EPH', ['Ephesians', 'Eph']], ['PHP', ['Philippians', 'Phil']], ['COL', ['Colossians', 'Col']],
  ['1TH', ['1 Thessalonians', '1 Thess']], ['2TH', ['2 Thessalonians', '2 Thess']], ['1TI', ['1 Timothy', '1 Tim']],
  ['2TI', ['2 Timothy', '2 Tim']], ['TIT', ['Titus']], ['PHM', ['Philemon', 'Philem']], ['HEB', ['Hebrews', 'Heb']],
  ['JAS', ['James', 'Jas']], ['1PE', ['1 Peter', '1 Pet']], ['2PE', ['2 Peter', '2 Pet']], ['1JN', ['1 John', '1 Jn']],
  ['2JN', ['2 John', '2 Jn']], ['3JN', ['3 John', '3 Jn']], ['JUD', ['Jude']], ['REV', ['Revelation', 'Rev']],
];

const NAME_TO_ID = new Map<string, string>();
for (const [id, names] of BOOKS) for (const n of names) NAME_TO_ID.set(n.toLowerCase(), id);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s?');
const ALL_NAMES = [...NAME_TO_ID.keys()].sort((a, b) => b.length - a.length);
// "1 John", "1John", "I John"; optional "." after an abbreviation; chapter, optional :verse and -verse.
const REF_RE = new RegExp(
  `(?<![\\p{L}\\d])(?:([123])\\s?)?(${ALL_NAMES.map((n) => escape(n.replace(/^[123] /, ''))).filter((v, i, a) => a.indexOf(v) === i).join('|')})\\.?\\s+(\\d{1,3})(?:\\s*[:.]\\s*(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?)?(?![\\d:])`,
  'giu'
);

export type ScriptureRef = { book: string; chapter: number; verse?: number; endVerse?: number; text: string };

function toRef(m: RegExpExecArray, strict: boolean): ScriptureRef | null {
  const [text, num, name, ch, vs, ve] = m;
  const numeral = (num || '').trim();
  const key = `${numeral ? `${numeral} ` : ''}${name.replace(/\s+/g, ' ')}`.toLowerCase();
  const id = NAME_TO_ID.get(key);
  if (!id) return null;
  if (strict) {
    // Inside ordinary sentences: book names must be capitalised, and short or
    // everyday words (Job, Mark, Acts, Ex…) need a chapter:verse to count.
    if (name[0] !== name[0].toUpperCase()) return null;
    if (name.replace(/\s/g, '').length <= 4 && !vs) return null;
  }
  return { book: id, chapter: Number(ch), verse: vs ? Number(vs) : undefined, endVerse: ve ? Number(ve) : undefined, text };
}

export function scriptureUrl(ref: Pick<ScriptureRef, 'book' | 'chapter' | 'verse' | 'endVerse'>): string {
  const v = ref.verse ? `&v=${ref.verse}${ref.endVerse && ref.endVerse > ref.verse ? `-${ref.endVerse}` : ''}` : '';
  return `${BIBLE_URL}?b=${ref.book}&c=${ref.chapter}${v}`;
}

/** Finds references in text. `strict` is for free-flowing sentences; off for a field that only holds references. */
export function findScriptureRefs(text: string, strict = true): { start: number; end: number; ref: ScriptureRef }[] {
  const out: { start: number; end: number; ref: ScriptureRef }[] = [];
  REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(text))) {
    const ref = toRef(m, strict);
    if (ref) out.push({ start: m.index, end: m.index + m[0].length, ref });
  }
  return out;
}

const linkClass =
  'inline-flex items-baseline gap-1 font-semibold text-[#8a6a2e] underline decoration-[#C9A35A]/50 underline-offset-[3px] hover:decoration-[#8a6a2e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A35A] rounded-sm';

export function ScriptureLink({ refInfo, children }: { refInfo: ScriptureRef; children?: React.ReactNode }) {
  return (
    <a href={scriptureUrl(refInfo)} target="_blank" rel="noopener" className={linkClass} title="Open in the Bible reader">
      {children ?? refInfo.text}
    </a>
  );
}

/** Text with any Scripture references turned into links. */
export function ScriptureText({ text, strict = true, icon = false }: { text: string; strict?: boolean; icon?: boolean }) {
  const hits = findScriptureRefs(text, strict);
  if (!hits.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let last = 0;
  hits.forEach((h, i) => {
    if (h.start > last) parts.push(<Fragment key={`t${i}`}>{text.slice(last, h.start)}</Fragment>);
    parts.push(
      <ScriptureLink key={`r${i}`} refInfo={h.ref}>
        {icon && i === 0 ? <BookOpen size={14} className="self-center" aria-hidden /> : null}
        {text.slice(h.start, h.end)}
      </ScriptureLink>
    );
    last = h.end;
  });
  if (last < text.length) parts.push(<Fragment key="end">{text.slice(last)}</Fragment>);
  return <>{parts}</>;
}

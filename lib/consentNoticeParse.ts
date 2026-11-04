/** Parse plain-text consent forms into structured sections for ConsentNoticeDocument. */

export type ConsentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'heading'; text: string }
  | { type: 'important'; heading: string; paragraphs: string[]; bullets: string[] }
  | { type: 'emergency'; heading: string; paragraphs: string[]; bullets: string[] };

export type ConsentParsed = {
  /** First ALL-CAPS title line from body (often duplicates UI title) */
  embeddedTitle?: string;
  intro: string[];
  blocks: ConsentBlock[];
};

const isMostlyCaps = (line: string): boolean => {
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length >= 0.75;
};

const isHeading = (line: string): boolean => {
  const t = line.trim();
  if (!t || t.length > 120) return false;
  if (/^dear\b/i.test(t)) return false;
  // Keep "CALL 911..." as body text inside emergency sections, not a new heading
  if (/^CALL 911\b/i.test(t)) return false;
  if (/^by signing/i.test(t)) return isMostlyCaps(t);
  // ALL CAPS section titles, optionally ending with :
  if (isMostlyCaps(t) && !t.includes('•')) return true;
  return false;
};

const isBullet = (line: string): boolean => /^[•\-\*]\s+/.test(line.trim()) || /^\d+[\.)]\s+/.test(line.trim());

const stripBullet = (line: string): string =>
  line.trim().replace(/^[•\-\*]\s+/, '').replace(/^\d+[\.)]\s+/, '');

const isImportantHeading = (h: string): boolean =>
  /\bIMPORTANT\b/i.test(h) || /\bPLEASE NOTE\b/i.test(h) || /\bDISCLAIMER\b/i.test(h);

const isEmergencyHeading = (h: string): boolean =>
  /\bEMERGENCY\b/i.test(h) || /\bCALL 911\b/i.test(h) || /\bIN CASE OF\b/i.test(h);

const isSkipLine = (line: string): boolean => {
  const t = line.trim();
  if (!t) return true;
  if (/^anointed worship center/i.test(t)) return true;
  if (/^awc\b/i.test(t) && t.length < 40) return true;
  if (/^children'?s ministry/i.test(t)) return true;
  if (/^this consent is valid/i.test(t)) return false; // keep as paragraph
  return false;
};

/**
 * Parse consent plain text into intro + blocks.
 * Titles like "FOOD ALLERGY CONSENT" are captured as embeddedTitle and skipped from body.
 */
export function parseConsentContent(raw: string, uiTitle?: string): ConsentParsed {
  const lines = String(raw || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\u00a0/g, ' ').trimEnd());

  let embeddedTitle: string | undefined;
  let i = 0;

  // Skip leading blanks
  while (i < lines.length && !lines[i].trim()) i++;

  // Optional embedded title (first caps line)
  if (i < lines.length && isHeading(lines[i])) {
    const candidate = lines[i].trim().replace(/:$/, '');
    const uiNorm = (uiTitle || '').trim().toUpperCase();
    if (!uiNorm || candidate.toUpperCase().includes(uiNorm.slice(0, Math.min(12, uiNorm.length))) || uiNorm.includes(candidate.slice(0, 12).toUpperCase()) || isMostlyCaps(candidate)) {
      embeddedTitle = candidate;
      i++;
    }
  }

  // Skip org subtitle lines
  while (i < lines.length && isSkipLine(lines[i])) i++;

  const intro: string[] = [];
  const blocks: ConsentBlock[] = [];

  const flushParagraph = (buf: string[]) => {
    const text = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (text) intro.push(text);
    buf.length = 0;
  };

  // Collect intro until first real section heading
  const paraBuf: string[] = [];
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      if (paraBuf.length) flushParagraph(paraBuf);
      i++;
      continue;
    }
    if (isSkipLine(line) && !/^dear\b/i.test(line)) {
      i++;
      continue;
    }
    if (isHeading(line) && !/^dear\b/i.test(line) && !/^by signing/i.test(line)) {
      break;
    }
    if (isBullet(line)) {
      // bullets before any heading — treat as intro bullets via a block later
      break;
    }
    paraBuf.push(line);
    i++;
  }
  if (paraBuf.length) flushParagraph(paraBuf);

  // Remaining: sections
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || (isSkipLine(line) && !isHeading(line))) {
      i++;
      continue;
    }

    if (isHeading(line)) {
      const heading = line.replace(/:$/, '').trim();
      i++;
      const paragraphs: string[] = [];
      const bullets: string[] = [];
      let pbuf: string[] = [];

      const flushP = () => {
        const t = pbuf.join(' ').replace(/\s+/g, ' ').trim();
        if (t) paragraphs.push(t);
        pbuf = [];
      };

      while (i < lines.length) {
        const L = lines[i].trim();
        if (!L) {
          flushP();
          i++;
          // peek: blank then heading ends section
          continue;
        }
        if (isHeading(L) && !isBullet(L)) break;
        if (isBullet(L)) {
          flushP();
          bullets.push(stripBullet(L));
          i++;
          continue;
        }
        pbuf.push(L);
        i++;
      }
      flushP();

      if (isEmergencyHeading(heading) || paragraphs.some((p) => /\bCALL 911\b/i.test(p))) {
        blocks.push({ type: 'emergency', heading, paragraphs, bullets });
      } else if (isImportantHeading(heading)) {
        blocks.push({ type: 'important', heading, paragraphs, bullets });
      } else {
        blocks.push({ type: 'heading', text: heading });
        paragraphs.forEach((p) => blocks.push({ type: 'paragraph', text: p }));
        if (bullets.length) blocks.push({ type: 'bullets', items: bullets });
      }
      continue;
    }

    if (isBullet(line)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(lines[i].trim())) {
        items.push(stripBullet(lines[i].trim()));
        i++;
      }
      blocks.push({ type: 'bullets', items });
      continue;
    }

    // Loose paragraph
    const pbuf: string[] = [line];
    i++;
    while (i < lines.length) {
      const L = lines[i].trim();
      if (!L || isHeading(L) || isBullet(L)) break;
      pbuf.push(L);
      i++;
    }
    blocks.push({ type: 'paragraph', text: pbuf.join(' ').replace(/\s+/g, ' ').trim() });
  }

  return { embeddedTitle, intro, blocks };
}

/** Pair consecutive normal sections for two-column layout when titles match food-allergy poster. */
export function findTwoColumnPair(blocks: ConsentBlock[]): { leftIdx: number; rightIdx: number } | null {
  const headings = blocks
    .map((b, idx) => (b.type === 'heading' ? { idx, text: b.text.toUpperCase() } : null))
    .filter(Boolean) as { idx: number; text: string }[];

  for (let h = 0; h < headings.length - 1; h++) {
    const a = headings[h].text;
    const b = headings[h + 1].text;
    const leftFood = /FOODS?\b|COMMONLY SERVED|WHAT WE SERVE/i.test(a);
    const rightPrevent = /PREVENT|HELP US|ALLERGIC REACTION/i.test(b);
    if (leftFood && rightPrevent) {
      return { leftIdx: headings[h].idx, rightIdx: headings[h + 1].idx };
    }
  }
  return null;
}

/** Collect heading + following paragraphs/bullets until next heading/callout. */
export function takeSectionSlice(blocks: ConsentBlock[], startIdx: number): ConsentBlock[] {
  const slice: ConsentBlock[] = [blocks[startIdx]];
  for (let i = startIdx + 1; i < blocks.length; i++) {
    const t = blocks[i].type;
    if (t === 'heading' || t === 'important' || t === 'emergency') break;
    slice.push(blocks[i]);
  }
  return slice;
}

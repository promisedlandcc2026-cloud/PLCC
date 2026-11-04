/**
 * Branded Meeting Minutes PDF (letter, church logo + header, hand + typed signature).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';

const BURGUNDY: [number, number, number] = [64, 0, 16];
const GOLD: [number, number, number] = [212, 175, 55];
const MUTED: [number, number, number] = [110, 100, 104];
const RULE: [number, number, number] = [220, 208, 210];
const CHURCH = 'Promised Land Christian Center';
const ADDRESS = 'Official Meeting Minutes';

export type MinutesPdfInput = {
  title: string;
  meetingDate: string;
  department: string;
  summary?: string | null;
  content?: string | null;
  typedSignature?: string | null;
  signerName?: string | null;
  /** PNG/JPEG data URL or raw base64 */
  handSignature?: string | null;
  documentId?: string | null;
  generatedAt?: Date;
};

function parseDataUrl(raw: string | null | undefined): { format: 'PNG' | 'JPEG'; bytes: string } | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  const match = text.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (match) {
    const fmt = match[1].toLowerCase() === 'png' ? 'PNG' : 'JPEG';
    return { format: fmt, bytes: match[2] };
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(text) && text.length > 40) {
    return { format: 'PNG', bytes: text.replace(/\s/g, '') };
  }
  return null;
}

export function loadAwcLogoBase64(): string | null {
  const candidates = [
    join(process.cwd(), 'public', 'images', 'awc-logo.png'),
    join(process.cwd(), 'images', 'awc-logo.png'),
    join(process.cwd(), 'dist', 'images', 'awc-logo.png'),
    join(process.cwd(), 'api', '_assets', 'awc-logo.png'),
  ];
  for (const p of candidates) {
    try {
      if (!existsSync(p)) continue;
      return readFileSync(p).toString('base64');
    } catch {
      /* try next */
    }
  }
  return null;
}

function formatMeetingDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value || '');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function buildMinutesPdfBytes(input: MinutesPdfInput): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 54;
  const right = pageWidth - 54;
  const width = right - left;
  const generated = input.generatedAt || new Date();

  doc.setFillColor(...BURGUNDY);
  doc.rect(0, 0, pageWidth, 72, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 72, pageWidth, 3, 'F');

  const logo = loadAwcLogoBase64();
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', left, 14, 44, 44);
    } catch {
      /* skip broken logo */
    }
  }

  const textLeft = logo ? left + 56 : left;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(CHURCH, textLeft, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GOLD);
  doc.text(ADDRESS, textLeft, 50);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('CONFIDENTIAL — LEADERSHIP', right, 34, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text(String(input.department || 'Leadership').toUpperCase(), right, 50, { align: 'right' });

  let y = 108;
  doc.setTextColor(...BURGUNDY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  const titleLines = doc.splitTextToSize(String(input.title || 'Meeting Minutes'), width);
  doc.text(titleLines, left, y);
  y += titleLines.length * 20 + 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(`Meeting date  ${formatMeetingDate(input.meetingDate)}`, left, y);
  y += 14;
  doc.text(
    `Prepared  ${generated.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
    left,
    y
  );
  y += 18;

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1);
  doc.line(left, y, right, y);
  y += 22;

  const summary = String(input.summary || '').trim();
  if (summary) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...BURGUNDY);
    doc.text('EXECUTIVE SUMMARY', left, y);
    y += 14;
    doc.setFont('times', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(50, 40, 42);
    const sumLines = doc.splitTextToSize(summary, width);
    for (const line of sumLines) {
      if (y > pageHeight - 140) {
        doc.addPage();
        y = 72;
      }
      doc.text(line, left, y);
      y += 15;
    }
    y += 10;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...BURGUNDY);
  doc.text('MINUTES', left, y);
  y += 16;
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(40, 32, 34);
  const body = String(input.content || '').trim() || 'No minutes content recorded.';
  const bodyLines = doc.splitTextToSize(body, width);
  for (const line of bodyLines) {
    if (y > pageHeight - 150) {
      doc.addPage();
      y = 72;
    }
    doc.text(line, left, y);
    y += 15;
  }

  if (y > pageHeight - 150) {
    doc.addPage();
    y = 72;
  }
  y += 18;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.6);
  doc.line(left, y, right, y);
  y += 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...BURGUNDY);
  doc.text('OFFICIAL SIGNATURE', left, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Hand signature and typed legal name of the recording secretary.', left, y + 12);
  y += 28;

  const hand = parseDataUrl(input.handSignature || null);
  if (hand) {
    try {
      doc.addImage(hand.bytes, hand.format, left, y, 180, 52);
    } catch {
      /* skip */
    }
  }
  doc.setDrawColor(...BURGUNDY);
  doc.setLineWidth(0.5);
  doc.line(left, y + 58, left + 220, y + 58);

  const typed = String(input.typedSignature || input.signerName || '').trim();
  doc.setFont('times', 'italic');
  doc.setFontSize(16);
  doc.setTextColor(...BURGUNDY);
  doc.text(typed || '________________', left + 240, y + 40);
  doc.setDrawColor(...BURGUNDY);
  doc.line(left + 240, y + 58, right, y + 58);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Handwritten signature', left, y + 72);
  doc.text('Typed name', left + 240, y + 72);

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFillColor(...BURGUNDY);
    doc.rect(0, pageHeight - 28, pageWidth, 28, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GOLD);
    const idBit = input.documentId ? `  ·  ${String(input.documentId).slice(0, 8)}` : '';
    doc.text(`${CHURCH}${idBit}`, left, pageHeight - 12);
    doc.text(`Page ${i} of ${pageCount}`, right, pageHeight - 12, { align: 'right' });
  }

  return doc.output('arraybuffer') as unknown as Uint8Array;
}

export function minutesPdfFilename(title: string, meetingDate: string): string {
  const slug = String(title || 'minutes')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  const day = String(meetingDate || '').slice(0, 10);
  return `awc-minutes-${slug || 'record'}-${day || 'draft'}.pdf`;
}

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const BURGUNDY: [number, number, number] = [64, 0, 16];
const AMBER_TEXT: [number, number, number] = [255, 248, 231];
const ROW_ALT: [number, number, number] = [250, 247, 246];
const MUTED: [number, number, number] = [120, 110, 114];
const RULE: [number, number, number] = [230, 220, 222];
const PAID: [number, number, number] = [4, 120, 87];
const DUE: [number, number, number] = [128, 0, 32];

const CHURCH = 'Promised Land Christian Center';

export type CookoutRsvpExportMeta = {
  title?: string;
  eventLine?: string;
  fileSlug?: string;
};

const DEFAULT_EXPORT_META: Required<CookoutRsvpExportMeta> = {
  title: 'Fellowship Cookout RSVP Roster',
  eventLine: 'September 20, 2026  |  2:00-6:00 PM',
  fileSlug: 'fellowship-cookout-rsvps',
};

function resolveExportMeta(meta?: CookoutRsvpExportMeta): Required<CookoutRsvpExportMeta> {
  return {
    title: meta?.title?.trim() || DEFAULT_EXPORT_META.title,
    eventLine: meta?.eventLine?.trim() || DEFAULT_EXPORT_META.eventLine,
    fileSlug: meta?.fileSlug?.trim() || DEFAULT_EXPORT_META.fileSlug,
  };
}

export type CookoutRsvpExportRow = {
  name: string;
  phone?: string | null;
  email?: string | null;
  household_size?: number | null;
  children_count?: number | null;
  guests_invited?: number | null;
  food_contribution_amount?: number | string | null;
  food_contribution_paid?: boolean | null;
  food_contribution_paid_at?: string | null;
  food_contribution_paid_by?: string | null;
  food_contribution_intent?: string | null;
  food_contribution_payment_method?: string | null;
  allergies?: string | null;
  tshirt_sizes?: string | null;
  food_allergy_acknowledged?: boolean | null;
  food_allergy_signed_name?: string | null;
  injury_acknowledged?: boolean | null;
  injury_signed_name?: string | null;
  created_at?: string;
};

function formatGiftIntent(intent: string | null | undefined): string {
  if (intent === 'pay_now') return 'Pay Now';
  if (intent === 'pledge') return 'Pledge';
  return intent?.trim() || '';
}

function formatGiftMethod(method: string | null | undefined): string {
  if (method === 'zelle') return 'Zelle';
  if (method === 'cashapp') return 'Cash App';
  if (method === 'venmo') return 'Venmo';
  return method?.trim() || '';
}

export type CookoutRsvpExportTotals = {
  adults: number;
  children: number;
  guests: number;
  funds: number;
  fundsPaid: number;
};

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatPhone(phone: string | null | undefined, empty = ''): string {
  if (!phone?.trim()) return empty;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone.trim();
}

function formatFunds(amount: number | string | null | undefined, empty = ''): string {
  if (amount == null || amount === '') return empty;
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  return `$${n.toFixed(2)}`;
}

function adultsFor(row: CookoutRsvpExportRow): number {
  const household = Number(row.household_size) || 1;
  const children = Number(row.children_count) || 0;
  return Math.max(0, household - children);
}

function exportStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function generatedLabel(): string {
  return new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCookoutRsvpCsv(
  rows: CookoutRsvpExportRow[],
  meta?: CookoutRsvpExportMeta
): void {
  const exportMeta = resolveExportMeta(meta);
  const header = [
    'Name',
    'Phone',
    'Email',
    'Household size',
    'Children',
    'Guests invited',
    'Food contribution',
    'Gift intent',
    'Payment method',
    'Gift paid',
    'Gift paid at',
    'Gift paid by',
    'T-shirt sizes',
    'Food allergies',
    'Food allergy consent signed',
    'Food allergy signed by',
    'Injury consent signed',
    'Injury consent signed by',
    'Signed up at',
  ];
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        csvEscape(r.name),
        csvEscape(formatPhone(r.phone)),
        csvEscape(r.email),
        csvEscape(r.household_size ?? 1),
        csvEscape(r.children_count ?? 0),
        csvEscape(r.guests_invited ?? 0),
        csvEscape(formatFunds(r.food_contribution_amount)),
        csvEscape(formatGiftIntent(r.food_contribution_intent)),
        csvEscape(formatGiftMethod(r.food_contribution_payment_method)),
        csvEscape(r.food_contribution_paid ? 'Paid' : 'Unpaid'),
        csvEscape(r.food_contribution_paid_at ? new Date(r.food_contribution_paid_at).toLocaleString() : ''),
        csvEscape(r.food_contribution_paid_by),
        csvEscape(r.tshirt_sizes),
        csvEscape(r.allergies),
        csvEscape(r.food_allergy_acknowledged ? 'Yes' : 'No'),
        csvEscape(r.food_allergy_signed_name),
        csvEscape(r.injury_acknowledged ? 'Yes' : 'No'),
        csvEscape(r.injury_signed_name),
        csvEscape(r.created_at ? new Date(r.created_at).toLocaleString() : ''),
      ].join(',')
    ),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, `${exportMeta.fileSlug}-${exportStamp()}.csv`);
}

function drawHeader(doc: jsPDF, meta: Required<CookoutRsvpExportMeta>) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BURGUNDY);
  doc.rect(0, 0, pageWidth, 7, 'F');

  doc.setTextColor(...BURGUNDY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(CHURCH, 36, 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Internal use', pageWidth - 36, 24, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...BURGUNDY);
  doc.text(meta.title, 36, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${meta.eventLine}  |  Generated ${generatedLabel()}`, 36, 58);

  doc.setDrawColor(...BURGUNDY);
  doc.setLineWidth(0.6);
  doc.line(36, 64, pageWidth - 36, 64);
}

function drawSummary(doc: jsPDF, totals: CookoutRsvpExportTotals) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const items = [
    { label: 'ADULTS', value: String(totals.adults) },
    { label: 'CHILDREN', value: String(totals.children) },
    { label: 'GUESTS', value: String(totals.guests) },
    { label: 'STILL DUE', value: formatFunds(totals.funds, '$0.00') },
    { label: 'PAID SO FAR', value: formatFunds(totals.fundsPaid, '$0.00') },
  ];
  const gap = 8;
  const left = 36;
  const usable = pageWidth - 72;
  const width = (usable - gap * (items.length - 1)) / items.length;
  const y = 72;
  const h = 38;

  items.forEach((item, i) => {
    const x = left + i * (width + gap);
    doc.setFillColor(...ROW_ALT);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.4);
    if (typeof doc.roundedRect === 'function') {
      doc.roundedRect(x, y, width, h, 3, 3, 'FD');
    } else {
      doc.rect(x, y, width, h, 'FD');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(item.label, x + 8, y + 13);
    doc.setFontSize(13);
    doc.setTextColor(...BURGUNDY);
    doc.text(item.value, x + 8, y + 29);
  });
}

export function downloadCookoutRsvpPdf(
  rows: CookoutRsvpExportRow[],
  totals: CookoutRsvpExportTotals,
  meta?: CookoutRsvpExportMeta
): void {
  const exportMeta = resolveExportMeta(meta);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

  autoTable(doc, {
    startY: 122,
    margin: { top: 72, left: 36, right: 36, bottom: 40 },
    head: [['Name', 'Phone', 'Adults', 'Kids', 'Guests', 'Gift', 'Intent', 'Method', 'Paid', 'Allergies']],
    body: rows.map((r) => [
      r.name || '',
      formatPhone(r.phone, '-'),
      String(adultsFor(r)),
      String(r.children_count ?? 0),
      String(r.guests_invited ?? 0),
      formatFunds(r.food_contribution_amount, '-'),
      formatGiftIntent(r.food_contribution_intent) || '-',
      formatGiftMethod(r.food_contribution_payment_method) || '-',
      r.food_contribution_paid ? 'Paid' : 'Due',
      r.allergies?.trim() || '-',
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
      textColor: BURGUNDY,
      overflow: 'linebreak',
      valign: 'middle',
      lineColor: RULE,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: BURGUNDY,
      textColor: AMBER_TEXT,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: { top: 6, right: 4, bottom: 6, left: 4 },
    },
    alternateRowStyles: {
      fillColor: ROW_ALT,
    },
    columnStyles: {
      0: { cellWidth: 100, fontStyle: 'bold' },
      1: { cellWidth: 72 },
      2: { cellWidth: 40, halign: 'center' },
      3: { cellWidth: 34, halign: 'center' },
      4: { cellWidth: 42, halign: 'center' },
      5: { cellWidth: 50, halign: 'right' },
      6: { cellWidth: 52, halign: 'center' },
      7: { cellWidth: 54, halign: 'center' },
      8: { cellWidth: 40, halign: 'center', fontStyle: 'bold' },
      9: { cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 8) return;
      const raw = String(data.cell.raw ?? '');
      data.cell.styles.textColor = raw === 'Paid' ? PAID : DUE;
    },
    didDrawPage: (data) => {
      drawHeader(doc, exportMeta);
      if (data.pageNumber === 1) drawSummary(doc, totals);
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.4);
    doc.line(36, pageHeight - 26, pageWidth - 36, pageHeight - 26);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`${CHURCH}  |  ${exportMeta.title}`, 36, pageHeight - 14);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 36, pageHeight - 14, { align: 'right' });
  }

  doc.save(`${exportMeta.fileSlug}-${exportStamp()}.pdf`);
}

/**
 * Fundraiser PDFs: reminder letters (pledges + fun charges still owed) and a full report.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  chargeBreakdown,
  formatCents,
  paymentMethodLabel,
  type FundraiserSummary,
  type PersonBalance,
} from './fundraiserMath';

const BURGUNDY: [number, number, number] = [64, 0, 16];
const GOLD: [number, number, number] = [212, 175, 55];
const MUTED: [number, number, number] = [110, 100, 95];
const CHURCH = 'Promised Land Christian Center';

type FundraiserInfo = { title: string; start_date: string; goal_amount_cents: number | null };

async function loadSeal(): Promise<string | null> {
  try {
    const res = await fetch('/images/awc-seal.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function longDate(d = new Date()): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function letterhead(doc: jsPDF, seal: string | null, subtitle: string) {
  const w = doc.internal.pageSize.getWidth();
  if (seal) {
    try {
      doc.addImage(seal, 'PNG', 48, 36, 54, 54);
    } catch {
      /* ignore bad image */
    }
  }
  doc.setTextColor(...BURGUNDY);
  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.text(CHURCH, seal ? 114 : 48, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(subtitle, seal ? 114 : 48, 78);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.2);
  doc.line(48, 102, w - 48, 102);
}

export type ReminderOptions = {
  /** How to pay — printed on every letter */
  payInstructions?: string[];
  /** Personal "Pay my balance" link (PLCC Tithe) for each person, when a Tithe fund is linked */
  payLinkFor?: (person: PersonBalance) => string | null;
};

const DEFAULT_PAY = [
  'Cash or check at church (please write the fundraiser name in the memo).',
  'Cash App: $awcgiveplus',
  'Online by card or bank at plcc-tithe.vercel.app',
];

/** One page per person who still owes, listing each pledge and fun charge. */
export async function downloadReminderLetters(
  fundraiser: FundraiserInfo,
  people: PersonBalance[],
  opts: ReminderOptions = {}
): Promise<void> {
  const owing = people.filter((p) => p.leftCents > 0);
  if (!owing.length) return;
  const seal = await loadSeal();
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const w = doc.internal.pageSize.getWidth();
  const pay = opts.payInstructions?.length ? opts.payInstructions : DEFAULT_PAY;

  owing.forEach((person, i) => {
    if (i > 0) doc.addPage();
    letterhead(doc, seal, fundraiser.title);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(30, 20, 20);
    doc.text(longDate(), 48, 132);
    doc.text(`Dear ${person.name},`, 48, 168);
    const intro = doc.splitTextToSize(
      `Thank you for supporting the ${fundraiser.title}. This is a friendly reminder of the balance still open in your name. Every gift brings us closer to the goal.`,
      w - 96
    );
    doc.text(intro, 48, 190);

    autoTable(doc, {
      startY: 190 + intro.length * 14 + 14,
      margin: { left: 48, right: 48 },
      head: [['Item', 'Amount', 'Paid', 'Still owed']],
      body: person.lines
        .filter((l) => l.leftCents > 0)
        .map((l) => [l.label, formatCents(l.owedCents), formatCents(l.paidCents), formatCents(l.leftCents)]),
      foot: [['Total still owed', '', '', formatCents(person.leftCents)]],
      styles: { font: 'helvetica', fontSize: 10, textColor: BURGUNDY, cellPadding: 6 },
      headStyles: { fillColor: BURGUNDY, textColor: [255, 236, 179], fontStyle: 'bold' },
      footStyles: { fillColor: [250, 243, 230], textColor: BURGUNDY, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });

    let y = ((doc as any).lastAutoTable?.finalY || 320) + 28;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...BURGUNDY);
    doc.text('Ways to pay', 48, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 20, 20);
    y += 16;
    const link = opts.payLinkFor?.(person) || null;
    if (link) {
      doc.setFont('helvetica', 'bold');
      doc.text('•  Pay online now (your balance is filled in):', 48, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(30, 60, 140);
      const wrappedLink = doc.splitTextToSize(link, w - 110);
      doc.textWithLink(wrappedLink[0], 62, y, { url: link });
      for (let k = 1; k < wrappedLink.length; k++) doc.text(wrappedLink[k], 62, y + k * 11);
      y += wrappedLink.length * 11 + 6;
      doc.setFontSize(11);
      doc.setTextColor(30, 20, 20);
    }
    for (const line of pay) {
      const wrapped = doc.splitTextToSize(`•  ${line}`, w - 96);
      doc.text(wrapped, 48, y);
      y += wrapped.length * 14;
    }
    y += 18;
    doc.text('With gratitude,', 48, y);
    doc.text(`${CHURCH} Finance Team`, 48, y + 16);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('If you have already paid, thank you — please let the finance team know so we can update our records.', 48, doc.internal.pageSize.getHeight() - 40);
  });

  const safe = fundraiser.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`${safe}-reminders-${new Date().toISOString().slice(0, 10)}.pdf`);
}

type ReportEntry = {
  entry_date: string;
  display_name: string;
  kind: 'paid' | 'pledge' | 'charge';
  source_type: string;
  charge_label?: string | null;
  quantity?: number | null;
  owed_amount_cents: number;
  received_amount_cents: number;
  payment_method?: string | null;
  member_id?: string | null;
  id: string;
};

function kindLabel(e: ReportEntry): string {
  if (e.source_type === 'online') return 'Online (PLCC Tithe)';
  if (e.source_type === 'game') return 'Game / event';
  if (e.kind === 'pledge') return 'Pledge';
  if (e.kind === 'charge') return `${e.charge_label || 'Fun charge'}${(e.quantity || 1) > 1 ? ` × ${e.quantity}` : ''}`;
  return 'Gift';
}

/** Calculator, fun charges, who owes and every entry — for the Pastor or the board. */
export async function downloadFundraiserReport(
  fundraiser: FundraiserInfo,
  summary: FundraiserSummary,
  people: PersonBalance[],
  entries: ReportEntry[]
): Promise<void> {
  const seal = await loadSeal();
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  letterhead(doc, seal, `${fundraiser.title} · report as of ${longDate()}`);

  const rows: Array<[string, string]> = [
    ['Given now (gifts, games, online)', formatCents(summary.givenNowCents)],
    ['   of which online through PLCC Tithe', formatCents(summary.onlineCents)],
    ['   of which games & events', formatCents(summary.gameCents)],
    ['Pledged', formatCents(summary.pledgedCents)],
    ['   paid on pledges', formatCents(summary.pledgePaidCents)],
    ['Fun charges', formatCents(summary.chargedCents)],
    ['   paid on fun charges', formatCents(summary.chargePaidCents)],
    ['TOTAL RAISED', formatCents(summary.totalRaisedCents)],
    [`STILL OWED (${summary.peopleOwingCount} ${summary.peopleOwingCount === 1 ? 'person' : 'people'})`, formatCents(summary.stillOwedCents)],
    ['If everyone pays', formatCents(summary.expectedTotalCents)],
  ];
  if (summary.goalCents != null) {
    rows.push(['Goal', formatCents(summary.goalCents)]);
    rows.push([`Goal left (${summary.percentRaised ?? 0}% raised)`, formatCents(summary.goalLeftCents)]);
    rows.push(['Goal left after everyone pays', formatCents(summary.goalLeftAfterOwedCents)]);
  }
  autoTable(doc, {
    startY: 120,
    margin: { left: 48, right: 48 },
    head: [['Calculator', 'Amount']],
    body: rows,
    styles: { font: 'helvetica', fontSize: 10, textColor: BURGUNDY, cellPadding: 5 },
    headStyles: { fillColor: BURGUNDY, textColor: [255, 236, 179] },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: (data) => {
      const label = String((data.row.raw as any)?.[0] || '');
      if (data.section === 'body' && /^[A-Z ]+/.test(label) && label === label.toUpperCase()) {
        data.cell.styles.fillColor = [250, 243, 230];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const charges = chargeBreakdown(entries as any);
  if (charges.length) {
    autoTable(doc, {
      startY: ((doc as any).lastAutoTable?.finalY || 300) + 20,
      margin: { left: 48, right: 48 },
      head: [['Fun charge', 'Times', 'Charged', 'Paid', 'Still owed']],
      body: charges.map((c) => [c.label, String(c.quantity), formatCents(c.chargedCents), formatCents(c.paidCents), formatCents(c.leftCents)]),
      styles: { font: 'helvetica', fontSize: 9, textColor: BURGUNDY, cellPadding: 5 },
      headStyles: { fillColor: BURGUNDY, textColor: [255, 236, 179] },
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    });
  }

  if (people.length) {
    autoTable(doc, {
      startY: ((doc as any).lastAutoTable?.finalY || 300) + 20,
      margin: { left: 48, right: 48 },
      head: [['Who still owes', 'For', 'Owed', 'Paid', 'Left']],
      body: people.map((p) => [
        p.name,
        p.lines.filter((l) => l.leftCents > 0).map((l) => l.label).join(', '),
        formatCents(p.owedCents),
        formatCents(p.paidCents),
        formatCents(p.leftCents),
      ]),
      styles: { font: 'helvetica', fontSize: 9, textColor: BURGUNDY, cellPadding: 5 },
      headStyles: { fillColor: BURGUNDY, textColor: [255, 236, 179] },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } },
    });
  }

  autoTable(doc, {
    startY: ((doc as any).lastAutoTable?.finalY || 300) + 20,
    margin: { left: 48, right: 48 },
    head: [['Date', 'Name', 'Type', 'Owed', 'Received', 'Method']],
    body: entries.map((e) => [
      e.entry_date,
      e.display_name,
      kindLabel(e),
      e.kind === 'paid' ? '-' : formatCents(e.owed_amount_cents),
      formatCents(e.received_amount_cents),
      paymentMethodLabel(e.payment_method) || '-',
    ]),
    styles: { font: 'helvetica', fontSize: 8, textColor: BURGUNDY, cellPadding: 4 },
    headStyles: { fillColor: BURGUNDY, textColor: [255, 236, 179] },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
  });

  const safe = fundraiser.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`${safe}-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Archive, Loader2, ExternalLink, RefreshCw, Download, PenLine, Trash2, X, DollarSign, ChevronLeft, ChevronRight, UserPlus, Search, ChevronDown, FileSpreadsheet, FileText, Link2, Check } from 'lucide-react';
import { getAuthHeaders } from '../../lib/api';
import { downloadCookoutRsvpCsv, downloadCookoutRsvpPdf } from '../../lib/cookoutRsvpExport';
import { useNav } from '../../App';
import { Role } from '../../types';
import {
  COOKOUT_FOOD_CONTRIBUTION_HINT,
  COOKOUT_FOOD_CONTRIBUTION_OPTIONS,
  parseCookoutFoodContribution,
} from '../../api/_utils/cookoutFoodContribution';
import { isEventRsvpClosed } from '../../api/_utils/cookoutRsvpWindow';
import {
  DEFAULT_FELLOWSHIP_EVENT_ID,
  MARRIEDS_DINNER_2026_EVENT_ID,
  THANKSGIVING_2026_EVENT_ID,
  eventFundName,
  getFellowshipEventConfig,
  listFellowshipEvents,
} from '../../api/_utils/fellowshipEventConfig';
import {
  buildTitheRsvpPayUrl,
  rsvpPartyLine,
  rsvpReturnUrl,
  shortEventDate,
  giftPaymentIntentLabel,
  giftPaymentMethodLabel,
  type GiftPaymentIntent,
  type GiftPaymentMethod,
} from '../../api/_utils/rsvpGiftPayment';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';

type StaffRsvpEventOption = {
  id: string;
  name: string;
  shortName: string;
  date: string;
  timeLabel?: string;
};

const PAGE_SIZE = 10;
const GIFT_PAID_ROLES = new Set<string>([
  Role.SUPER_ADMIN,
  Role.PASTOR,
  Role.FIRST_LADY,
  Role.FINANCE,
]);

type Registration = {
  id: string;
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
  food_contribution_intent?: GiftPaymentIntent | string | null;
  food_contribution_payment_method?: GiftPaymentMethod | string | null;
  food_contribution_posted_tx_id?: string | null;
  /** From PLCC Tithe on this load only (not stored): gift started / sent but not confirmed yet. */
  tithe_status?: 'started' | 'processing' | 'refunded' | null;
  /** Tithe payment method while not yet paid (zelle / cash_app / venmo wait for Finance). */
  tithe_method?: string | null;
  allergies?: string | null;
  food_bringing?: string | null;
  tshirt_sizes?: string | null;
  food_allergy_acknowledged?: boolean | null;
  food_allergy_signed_name?: string | null;
  food_allergy_signed_at?: string | null;
  injury_acknowledged?: boolean | null;
  injury_signed_name?: string | null;
  injury_signed_at?: string | null;
  created_at?: string;
};

type Totals = { adults: number; children: number; guests: number; funds: number; fundsPaid: number };

type EditForm = {
  name: string;
  phone: string;
  email: string;
  adults: string;
  children_count: string;
  guests_invited: string;
  food_contribution_amount: string;
  allergies: string;
  tshirt_sizes: string;
  signed_name: string;
};

const TSHIRT_SIZE_OPTIONS = [
  'Youth S',
  'Youth M',
  'Youth L',
  'Adult XS',
  'Adult S',
  'Adult M',
  'Adult L',
  'Adult XL',
  'Adult 2XL',
  'Adult 3XL',
] as const;

type TshirtSizeKey = (typeof TSHIRT_SIZE_OPTIONS)[number];

const emptyTshirtCounts = (): Record<TshirtSizeKey, number> =>
  Object.fromEntries(TSHIRT_SIZE_OPTIONS.map((s) => [s, 0])) as Record<TshirtSizeKey, number>;

function parseTshirtSizes(raw: string | null | undefined): Record<TshirtSizeKey, number> {
  const counts = emptyTshirtCounts();
  if (!raw?.trim()) return counts;
  for (const part of raw.split(',')) {
    const m = part.trim().match(/^(.+?)\s*[x×]\s*(\d+)$/i);
    if (!m) continue;
    const size = m[1].trim() as TshirtSizeKey;
    const n = Number(m[2]);
    if (size in counts && Number.isFinite(n) && n >= 0) counts[size] = Math.floor(n);
  }
  return counts;
}

function formatTshirtSizes(counts: Record<TshirtSizeKey, number>): string {
  return TSHIRT_SIZE_OPTIONS.filter((s) => counts[s] > 0)
    .map((s) => `${s}×${counts[s]}`)
    .join(', ');
}

function formatFunds(amount: number | string | null | undefined): string {
  if (amount == null || amount === '') return '—';
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  return `$${n.toFixed(2)}`;
}

function parseMoneyInput(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  return parseCookoutFoodContribution(raw);
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone?.trim()) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone.trim();
}

function consentLabel(r: Registration): string | null {
  if ((r.children_count ?? 0) <= 0) return null;
  if (r.food_allergy_acknowledged && r.injury_acknowledged) return 'Allergy + Injury';
  if (r.food_allergy_acknowledged) return 'Allergy only';
  if (r.injury_acknowledged) return 'Injury only';
  return 'Consents needed';
}

function tshirtChips(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

function formatSignedUp(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatAllergies(raw: string | null | undefined): string {
  const value = (raw || '').trim();
  if (!value) return 'None';
  if (/^(no|none|n\/a|na|nil)$/i.test(value)) return 'None';
  return value;
}

function giftChoiceLabel(r: Registration): string {
  const intent = giftPaymentIntentLabel(
    r.food_contribution_intent as GiftPaymentIntent | null | undefined
  );
  const method = giftPaymentMethodLabel(
    r.food_contribution_payment_method as GiftPaymentMethod | null | undefined
  );
  if (intent === 'Pay Now' && method) return `Pay Now · ${method}`;
  if (intent) return intent;
  if (method) return method;
  return '';
}

function computeTotals(list: Registration[]): Totals {
  return list.reduce(
    (acc, row) => {
      const household = Number(row.household_size) || 1;
      const children = Number(row.children_count) || 0;
      const funds = Number(row.food_contribution_amount) || 0;
      acc.adults += Math.max(0, household - children);
      acc.children += children;
      acc.guests += Number(row.guests_invited) || 0;
      if (row.food_contribution_paid) acc.fundsPaid += funds;
      else acc.funds += funds;
      return acc;
    },
    { adults: 0, children: 0, guests: 0, funds: 0, fundsPaid: 0 }
  );
}

function toEditForm(r: Registration): EditForm {
  const funds = r.food_contribution_amount;
  const household = Math.max(1, Number(r.household_size) || 1);
  const children = Math.max(0, Number(r.children_count) || 0);
  const adults = Math.max(0, household - children);
  return {
    name: r.name || '',
    phone: r.phone || '',
    email: r.email || '',
    adults: String(adults),
    children_count: String(children),
    guests_invited: String(r.guests_invited ?? 0),
    food_contribution_amount:
      funds == null || funds === '' ? '' : Number.isFinite(Number(funds)) ? String(Number(funds)) : String(funds),
    allergies: r.allergies || '',
    tshirt_sizes: r.tshirt_sizes || '',
    signed_name: r.food_allergy_signed_name || r.injury_signed_name || '',
  };
}

const CookoutRsvpsPage: React.FC = () => {
  const { userRole } = useNav();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramEventId = searchParams.get('eventId') || '';
  /** With no ?eventId, open the next upcoming event that has an RSVP (set once the list loads). */
  const [defaultEventId, setDefaultEventId] = useState('');
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const eventId = paramEventId || defaultEventId;
  const kitCfg = getFellowshipEventConfig(eventId);
  const [liveEvent, setLiveEvent] = useState<{
    name: string;
    shortName: string;
    date: string;
    timeLabel?: string;
    template?: string;
    tshirtsEnabled?: boolean;
  } | null>(null);
  const [signupClosedFlag, setSignupClosedFlag] = useState<boolean | null>(null);
  const eventCfg = useMemo(() => {
    if (liveEvent) {
      return {
        ...kitCfg,
        eventId,
        name: liveEvent.name || kitCfg.name,
        shortName: liveEvent.shortName || kitCfg.shortName,
        date: liveEvent.date || kitCfg.date,
        timeLabel: liveEvent.timeLabel || kitCfg.timeLabel,
        tshirtsEnabled:
          liveEvent.tshirtsEnabled !== undefined
            ? liveEvent.tshirtsEnabled
            : kitCfg.tshirtsEnabled,
      };
    }
    // Custom (non-kit) event: avoid showing Cookout copy
    if (
      eventId !== DEFAULT_FELLOWSHIP_EVENT_ID &&
      eventId !== THANKSGIVING_2026_EVENT_ID &&
      eventId !== MARRIEDS_DINNER_2026_EVENT_ID &&
      kitCfg.eventId !== eventId
    ) {
      return {
        ...kitCfg,
        eventId,
        name: 'Event RSVPs',
        shortName: 'Event',
        date: '',
        timeLabel: '',
        tshirtsEnabled: false,
      };
    }
    return kitCfg;
  }, [eventId, kitCfg, liveEvent]);
  const canMarkGiftPaid = GIFT_PAID_ROLES.has(String(userRole));
  const [eventOptions, setEventOptions] = useState<StaffRsvpEventOption[]>([]);
  const [rows, setRows] = useState<Registration[]>([]);
  const [totals, setTotals] = useState<Totals>({ adults: 0, children: 0, guests: 0, funds: 0, fundsPaid: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Result of checking PLCC Tithe for Pay Now gifts on this load. */
  const [titheNote, setTitheNote] = useState<{ updated: number; warning: string | null } | null>(null);
  const [editing, setEditing] = useState<Registration | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [tshirtCounts, setTshirtCounts] = useState<Record<TshirtSizeKey, number>>(emptyTshirtCounts);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingPaidId, setTogglingPaidId] = useState<string | null>(null);
  const [sharedLinkId, setSharedLinkId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const load = async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/vault?resource=events&subResource=rsvp&eventId=${encodeURIComponent(eventId)}`,
        { headers }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load RSVPs');
      setRows(data.registrations || []);
      setTotals(data.totals || { adults: 0, children: 0, guests: 0, funds: 0, fundsPaid: 0 });
      setTitheNote(
        data.titheSync && (data.titheSync.updated > 0 || data.titheSync.warning)
          ? { updated: Number(data.titheSync.updated) || 0, warning: data.titheSync.warning || null }
          : null
      );
      if (data.event) {
        setLiveEvent({
          name: data.event.name,
          shortName: data.event.shortName || data.event.name,
          date: data.event.date,
          timeLabel: data.event.timeLabel,
          template: data.event.template,
          tshirtsEnabled: data.event.tshirtsEnabled,
        });
      } else {
        setLiveEvent(null);
      }
      setSignupClosedFlag(typeof data.closed === 'boolean' ? data.closed : null);
      if (!silent) setPage(1);
    } catch (err: any) {
      if (silent) return; // keep what's on screen; the next refresh will try again
      setError(err?.message || 'Could not load RSVPs');
      setLiveEvent(null);
      setSignupClosedFlag(null);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!eventId) {
      if (optionsLoaded) setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, optionsLoaded]);

  // Paid status comes from PLCC Tithe: refresh quietly every minute while this list is open.
  const editingOpenRef = useRef(false);
  editingOpenRef.current = Boolean(editing);
  useEffect(() => {
    if (!eventId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || editingOpenRef.current) return;
      void load({ silent: true });
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !editingOpenRef.current) void load({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  /** Only events whose RSVP is on are listed; a deleted RSVP disappears from here. */
  const loadEventOptions = async (): Promise<StaffRsvpEventOption[]> => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=events&subResource=rsvp-enabled-events', { headers });
      const data = await res.json();
      const opts: StaffRsvpEventOption[] = Array.isArray(data?.events)
        ? data.events.map((ev: any) => ({
            id: ev.id,
            name: ev.name || 'Event',
            shortName: String(ev.name || 'Event').split(/\s+/).slice(0, 2).join(' '),
            date: String(ev.date || '').slice(0, 10),
          }))
        : [];
      opts.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      setEventOptions(opts);
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' });
      const next = opts.find((o) => (o.date || '') >= today) || opts[opts.length - 1];
      setDefaultEventId(next?.id || '');
      return opts;
    } catch {
      setEventOptions([]);
      return [];
    } finally {
      setOptionsLoaded(true);
    }
  };

  useEffect(() => {
    void loadEventOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!exportOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [exportOpen]);

  /** "Add guest" reuses the edit form; a blank id means a new signup. */
  const isAdding = editing?.id === '';
  const openAdd = () => {
    const blank: Registration = { id: '', name: '', household_size: 1, children_count: 0, guests_invited: 0 };
    setEditing(blank);
    setEditForm(toEditForm(blank));
    setTshirtCounts(emptyTshirtCounts());
    setEditError(null);
  };

  const openEdit = (r: Registration) => {
    setEditing(r);
    setEditForm(toEditForm(r));
    setTshirtCounts(parseTshirtSizes(r.tshirt_sizes));
    setEditError(null);
  };

  const closeEdit = () => {
    setEditing(null);
    setEditForm(null);
    setEditError(null);
    setTshirtCounts(emptyTshirtCounts());
  };

  const setField = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    setEditError(null);
    setEditForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const saveEdit = async () => {
    if (!editing || !editForm) return;

    const name = editForm.name.trim();
    const phone = editForm.phone.trim();
    const adults = Number(editForm.adults);
    const children = Number(editForm.children_count);
    const guests = Number(editForm.guests_invited);
    const signed = editForm.signed_name.trim();
    const tshirtSummary = formatTshirtSizes(tshirtCounts);
    const tshirtTotal = TSHIRT_SIZE_OPTIONS.reduce((sum, s) => sum + (tshirtCounts[s] || 0), 0);

    if (!name) {
      setEditError('Name is required.');
      return;
    }
    if (!phone && !isAdding) {
      setEditError('Phone is required.');
      return;
    }
    if (!Number.isFinite(adults) || adults < 0) {
      setEditError('Adults cannot be negative.');
      return;
    }
    if (!Number.isFinite(children) || children < 0) {
      setEditError('Children cannot be negative.');
      return;
    }
    const household = Math.floor(adults) + Math.floor(children);
    if (household < 1) {
      setEditError('Add at least 1 adult or child for this signup.');
      return;
    }
    if (!Number.isFinite(guests) || guests < 0) {
      setEditError('Guests invited cannot be negative.');
      return;
    }
    if (eventCfg.tshirtsEnabled && tshirtTotal < 1 && !isAdding) {
      setEditError('Please choose at least one T-shirt size.');
      return;
    }
    if (!editForm.allergies.trim()) {
      setEditError('Food allergies is required. List allergies or write None.');
      return;
    }
    if (children > 0 && signed.length < 2) {
      setEditError(
        isAdding
          ? "When children attend, type the parent's name who agreed to the consents."
          : 'When children attend, the signed-by name is required (at least 2 characters).'
      );
      return;
    }

    // When adding, food funds may be left blank (no gift yet).
    const fundsBlank = isAdding && !editForm.food_contribution_amount.trim();
    const fundsParsed = fundsBlank ? null : parseMoneyInput(editForm.food_contribution_amount);
    if (fundsParsed && fundsParsed.ok === false) {
      setEditError(fundsParsed.error);
      return;
    }
    const foodContribution = fundsParsed ? (fundsParsed as { ok: true; value: number }).value : null;

    setSaving(true);
    setEditError(null);
    if (isAdding) {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/vault?resource=events&subResource=rsvp&eventId=${encodeURIComponent(eventId)}`,
          {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              staffAdd: true,
              eventId,
              name,
              phone,
              email: editForm.email.trim() || null,
              household_size: household,
              children_count: Math.floor(children),
              guests_invited: Math.floor(guests),
              food_contribution_amount: foodContribution,
              allergies: editForm.allergies.trim(),
              tshirt_sizes: eventCfg.tshirtsEnabled ? tshirtSummary || null : null,
              food_allergy_signed_name: children > 0 ? signed : null,
              injury_signed_name: children > 0 ? signed : null,
            }),
          }
        );
        let data: any = null;
        try {
          data = await res.json();
        } catch {
          throw new Error('Could not add the guest (server returned an unexpected response).');
        }
        if (!res.ok || !data.ok) throw new Error(data?.error || 'Could not add the guest');
        setRows((prev) => {
          const next = [data.registration, ...prev];
          setTotals(computeTotals(next));
          return next;
        });
        setPage(1);
        closeEdit();
      } catch (err: any) {
        setEditError(err?.message || 'Could not add the guest');
      } finally {
        setSaving(false);
      }
      return;
    }
    try {
      const headers = await getAuthHeaders();
      const payload: Record<string, unknown> = {
        id: editing.id,
        name,
        phone,
        email: editForm.email.trim() || null,
        household_size: household,
        children_count: Math.floor(children),
        guests_invited: Math.floor(guests),
        food_contribution_amount: foodContribution,
        allergies: editForm.allergies.trim() || null,
        tshirt_sizes: eventCfg.tshirtsEnabled ? tshirtSummary : editing.tshirt_sizes || null,
      };
      if (children > 0 || signed) {
        payload.signed_name = signed || null;
      }

      const res = await fetch('/api/vault?resource=events&subResource=rsvp', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        throw new Error('Could not update signup (server returned an unexpected response).');
      }
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Could not update signup');

      setRows((prev) => {
        const next = prev.map((r) => (r.id === editing.id ? { ...r, ...data.registration } : r));
        setTotals(computeTotals(next));
        return next;
      });
      closeEdit();
    } catch (err: any) {
      setEditError(err?.message || 'Could not update signup');
    } finally {
      setSaving(false);
    }
  };

  /** Signups that stop the whole RSVP being deleted: paid, pledged, or a gift Finance hasn't confirmed. */
  const rsvpBlockers = rows.filter(
    (r) =>
      r.food_contribution_paid ||
      r.tithe_status === 'processing' ||
      (r.food_contribution_intent === 'pledge' && Number(r.food_contribution_amount) > 0)
  );
  const [deletingList, setDeletingList] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const deleteWholeRsvp = async () => {
    if (!eventId || rsvpBlockers.length) return;
    const n = rows.length;
    const ok = window.confirm(
      `Delete the RSVP for "${eventCfg.name}"?\n\n` +
        (n ? `${n} ${n === 1 ? 'signup' : 'signups'} will be removed. ` : 'Nobody has signed up. ') +
        'Online signup turns off. The event stays on the calendar.\n\nThis cannot be undone.'
    );
    if (!ok) return;
    setDeletingList(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/vault?resource=events&subResource=rsvp-list&eventId=${encodeURIComponent(eventId)}`,
        { method: 'DELETE', headers }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not delete the RSVP');
      const name = eventCfg.name;
      setRows([]);
      setTotals({ adults: 0, children: 0, guests: 0, funds: 0, fundsPaid: 0 });
      setSearchParams({});
      setDefaultEventId('');
      await loadEventOptions();
      setFlash(`The RSVP for "${name}" was deleted.`);
      window.setTimeout(() => setFlash(null), 6000);
    } catch (err: any) {
      setError(err?.message || 'Could not delete the RSVP');
    } finally {
      setDeletingList(false);
    }
  };

  const [archiving, setArchiving] = useState(false);

  /** Move this RSVP to the Archive: every signup and paid record is kept, signup turns off. */
  const archiveRsvp = async () => {
    if (!eventId) return;
    const ok = window.confirm(
      `Archive the RSVP for "${eventCfg.name}"?\n\n` +
        'All signups and paid records are kept. Online signup turns off and it moves to the RSVP Archive, ' +
        'where the Pastor, First Lady and Finance can view it. You can restore it anytime.'
    );
    if (!ok) return;
    setArchiving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=events&subResource=rsvp-archive', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, action: 'archive' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not archive the RSVP');
      const name = eventCfg.name;
      setRows([]);
      setTotals({ adults: 0, children: 0, guests: 0, funds: 0, fundsPaid: 0 });
      setSearchParams({});
      setDefaultEventId('');
      await loadEventOptions();
      setFlash(`"${name}" was moved to the RSVP Archive.`);
      window.setTimeout(() => setFlash(null), 6000);
    } catch (err: any) {
      setError(err?.message || 'Could not archive the RSVP');
    } finally {
      setArchiving(false);
    }
  };

  const deleteRsvp = async (r: Registration) => {
    const paidNote = r.food_contribution_paid
      ? `\n\nTheir ${formatFunds(r.food_contribution_amount)} gift is already paid. Removing the RSVP does NOT refund it — the gift stays recorded in PLCC Tithe and PLCC DCB.`
      : '';
    const ok = window.confirm(
      `Remove this signup?\n\n${r.name}${r.phone ? ` · ${r.phone}` : ''}${paidNote}\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setDeletingId(r.id);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=events&subResource=rsvp', {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not delete signup');

      setRows((prev) => {
        const next = prev.filter((row) => row.id !== r.id);
        setTotals(computeTotals(next));
        const nextPages = Math.max(1, Math.ceil(next.length / PAGE_SIZE));
        setPage((p) => Math.min(p, nextPages));
        return next;
      });
      if (editing?.id === r.id) closeEdit();
    } catch (err: any) {
      setError(err?.message || 'Could not delete signup');
    } finally {
      setDeletingId(null);
    }
  };

  /** Share (phone) or copy this guest's own PLCC Tithe pay link. Marked paid only when Tithe confirms. */
  const sharePayLink = async (r: Registration) => {
    const amount = Number(r.food_contribution_amount) || 0;
    const method = r.food_contribution_payment_method as GiftPaymentMethod | null | undefined;
    const household = Number(r.household_size) || 1;
    const children = Number(r.children_count) || 0;
    const url = buildTitheRsvpPayUrl({
      registrationId: r.id,
      amount,
      method: method || null,
      label: `${eventCfg.shortName || eventCfg.name} RSVP`,
      fund: eventFundName(eventCfg.eventId, eventCfg.name) || undefined,
      name: r.name,
      email: r.email,
      detail: rsvpPartyLine({
        name: r.name,
        adults: Math.max(1, household - children),
        children,
        guests: Number(r.guests_invited) || 0,
        dateLabel: shortEventDate(eventCfg.date),
      }),
      // Always the live Vault, even when a staff member copies it from a preview.
      returnUrl: rsvpReturnUrl('https://plcc-opal.vercel.app', eventCfg.eventId || eventId, r.id),
    });
    const first = String(r.name || '').trim().split(' ')[0] || 'there';
    const text = `Hi ${first}, here is your link to give $${amount.toFixed(2)} for ${eventCfg.shortName || eventCfg.name} on PLCC Tithe:`;
    try {
      if (typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function') {
        await (navigator as any).share({ title: 'PLCC Tithe', text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
      }
      setSharedLinkId(r.id);
      window.setTimeout(() => setSharedLinkId((id) => (id === r.id ? null : id)), 2500);
    } catch (err: any) {
      if (err?.name === 'AbortError') return; // share sheet closed
      try {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setSharedLinkId(r.id);
        window.setTimeout(() => setSharedLinkId((id) => (id === r.id ? null : id)), 2500);
      } catch {
        setError('Could not copy the pay link. Please try again.');
      }
    }
  };

  const toggleGiftPaid = async (r: Registration) => {
    if (!canMarkGiftPaid || togglingPaidId) return;
    const nextPaid = !r.food_contribution_paid;
    setTogglingPaidId(r.id);
    setError(null);
    // Optimistic UI
    setRows((prev) => {
      const next = prev.map((row) =>
        row.id === r.id
          ? {
              ...row,
              food_contribution_paid: nextPaid,
              food_contribution_paid_at: nextPaid ? new Date().toISOString() : null,
            }
          : row
      );
      setTotals(computeTotals(next));
      return next;
    });
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=events&subResource=rsvp', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, food_contribution_paid: nextPaid }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not update gift paid status');
      setRows((prev) => {
        const next = prev.map((row) => (row.id === r.id ? { ...row, ...data.registration } : row));
        setTotals(computeTotals(next));
        return next;
      });
    } catch (err: any) {
      // Revert
      setRows((prev) => {
        const next = prev.map((row) => (row.id === r.id ? r : row));
        setTotals(computeTotals(next));
        return next;
      });
      setError(err?.message || 'Could not update gift paid status');
    } finally {
      setTogglingPaidId(null);
    }
  };

  const exportMeta = {
    title: `${eventCfg.shortName} RSVP Roster`,
    eventLine: `${eventCfg.date}  |  ${eventCfg.timeLabel}`,
    fileSlug: `${eventCfg.shortName.toLowerCase().replace(/\s+/g, '-')}-rsvps`,
  };

  const downloadCsv = () => {
    downloadCookoutRsvpCsv(rows, exportMeta);
  };

  const downloadPdf = () => {
    try {
      downloadCookoutRsvpPdf(rows, totals, exportMeta);
    } catch (err: any) {
      setError(err?.message || 'Could not create the PDF report');
    }
  };

  const publicPath =
    eventId === DEFAULT_FELLOWSHIP_EVENT_ID
      ? '/fellowship-cookout'
      : eventId === THANKSGIVING_2026_EVENT_ID
        ? '/thanksgiving-rsvp'
        : eventId === MARRIEDS_DINNER_2026_EVENT_ID
          ? '/marrieds-dinner-rsvp'
          : `/events/${encodeURIComponent(eventId)}/rsvp`;
  const publicUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}#${publicPath}`
      : `#${publicPath}`;

  const kidsInEdit = editForm ? (Number(editForm.children_count) || 0) > 0 : false;
  const adultsInEdit = editForm ? Math.max(0, Math.floor(Number(editForm.adults) || 0)) : 0;
  const childrenInEdit = editForm ? Math.max(0, Math.floor(Number(editForm.children_count) || 0)) : 0;
  const peopleInEdit = adultsInEdit + childrenInEdit;
  const tshirtTotal = TSHIRT_SIZE_OPTIONS.reduce((sum, s) => sum + (tshirtCounts[s] || 0), 0);
  const rsvpClosed =
    signupClosedFlag !== null ? signupClosedFlag : isEventRsvpClosed(eventId);

  const query = search.trim().toLowerCase();
  const filteredRows = !query
    ? rows
    : rows.filter((r) => {
        const haystack = [
          r.name,
          r.phone,
          r.email,
          r.allergies,
          r.food_bringing,
          r.tshirt_sizes,
          r.food_allergy_signed_name,
          r.injury_signed_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      });

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeFrom = filteredRows.length === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + PAGE_SIZE, filteredRows.length);

  const giftStatus = (r: Registration): { label: string; tone: 'paid' | 'wait' | 'due' | 'pledge' | 'none'; note: string } => {
    const amount = Number(r.food_contribution_amount) || 0;
    if (amount <= 0) return { label: 'No gift', tone: 'none', note: '' };
    if (r.food_contribution_paid) {
      return {
        label: 'Paid',
        tone: 'paid',
        note: String(r.food_contribution_paid_by || '').startsWith('PLCC Tithe') ? 'Via PLCC Tithe' : 'Marked paid',
      };
    }
    if (r.tithe_status === 'processing') {
      const p2p = ['zelle', 'cash_app', 'venmo'].includes(String(r.tithe_method || ''));
      return { label: p2p ? 'Sent' : 'Clearing', tone: 'wait', note: p2p ? 'Finance to confirm' : 'Bank payment clearing' };
    }
    if (r.tithe_status === 'refunded') return { label: 'Refunded', tone: 'due', note: 'Refunded on PLCC Tithe' };
    if (r.food_contribution_intent === 'pledge') return { label: 'Pledged', tone: 'pledge', note: r.tithe_status === 'started' ? 'Started on PLCC Tithe' : '' };
    return { label: 'Due', tone: 'due', note: r.tithe_status === 'started' ? 'Started on PLCC Tithe' : '' };
  };

  const toneClass: Record<string, string> = {
    paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
    wait: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    due: 'bg-rose-50 text-[#1d372c] ring-[#1d372c]/15',
    pledge: 'bg-slate-100 text-slate-700 ring-slate-500/15',
    none: 'bg-gray-50 text-gray-500 ring-gray-400/15',
  };

  /** RSVPs with a paid gift, or a gift Finance hasn't confirmed yet, can't be deleted. */
  const deleteBlockedReason = (r: Registration): string | null => {
    if (r.food_contribution_paid) return 'Has a paid gift: edit it instead of deleting';
    if (r.tithe_status === 'processing') return 'Has a gift waiting for Finance to confirm';
    return null;
  };

  const prettyDate = (() => {
    const ymd = String(eventCfg.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return eventCfg.date || '';
    const d = new Date(`${ymd}T12:00:00`);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  })();

  const btnSecondary =
    'inline-flex items-center justify-center gap-2 min-h-[42px] px-4 rounded-xl border border-black/[0.08] bg-white text-sm font-medium text-[#0d1a14] hover:bg-[#0d1a14]/[0.04] hover:border-[#0d1a14]/20 transition-colors disabled:opacity-50';

  if (optionsLoaded && !eventId) {
    return (
      <div className="w-full max-w-[1200px] mx-auto pt-4 md:pt-10 pb-24 px-4 md:px-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0d1a14]/50 mb-2">Event RSVPs</p>
        <h1 className="text-2xl md:text-[2rem] font-semibold text-[#0d1a14] tracking-tight">Event RSVPs</h1>
        {flash && (
          <p className="mt-5 text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3" role="status">
            {flash}
          </p>
        )}
        <div className="mt-6 bg-white border border-black/[0.06] rounded-2xl px-8 py-16 text-center">
          <p className="text-gray-700 font-medium">No events have an RSVP right now.</p>
          <p className="text-sm text-gray-500 mt-2">
            To start one, open the event in the{' '}
            <Link to="/events/overview" className="text-[#0d1a14] font-semibold underline underline-offset-2">
              events calendar
            </Link>{' '}
            and turn on RSVP. Past RSVPs are in the{' '}
            <Link to="/events/rsvp-archive" className="text-[#0d1a14] font-semibold underline underline-offset-2">
              RSVP Archive
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1200px] mx-auto pt-4 md:pt-10 pb-24 px-4 md:px-10 animate-in fade-in duration-500">
      {/* ---------- Header ---------- */}
      <header className="mb-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0d1a14]/50 mb-2">Event RSVPs</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl md:text-[2rem] font-semibold text-[#0d1a14] tracking-tight leading-tight break-words">
                {eventCfg.name}
              </h1>
              <AskAdminTitleLink />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
              {prettyDate ? <span className="font-medium text-gray-600">{prettyDate}</span> : null}
              {eventCfg.timeLabel ? <span>{eventCfg.timeLabel}</span> : null}
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 ring-inset ${
                  rsvpClosed ? 'bg-gray-100 text-gray-600 ring-gray-400/20' : 'bg-emerald-50 text-emerald-700 ring-emerald-600/15'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${rsvpClosed ? 'bg-gray-400' : 'bg-emerald-500'}`} aria-hidden />
                {rsvpClosed ? 'Online signup closed' : 'Online signup open'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end shrink-0">
            <button
              type="button"
              onClick={openAdd}
              disabled={loading || Boolean(error)}
              className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 rounded-xl bg-[#0d1a14] text-amber-50 text-sm font-semibold hover:bg-[#14251d] transition-colors disabled:opacity-60"
              data-testid="rsvp-add"
            >
              <UserPlus size={16} />
              Add guest
            </button>
            <div className="relative" ref={exportRef}>
              <button
                type="button"
                onClick={() => setExportOpen((o) => !o)}
                disabled={loading || rows.length === 0}
                className={btnSecondary}
                aria-expanded={exportOpen}
                aria-haspopup="menu"
              >
                <Download size={15} />
                Export
                <ChevronDown size={14} className={`transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
              </button>
              {exportOpen && (
                <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-black/[0.08] bg-white shadow-lg py-1 z-20">
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-[#0d1a14] hover:bg-[#0d1a14]/5 min-h-[44px]"
                    onClick={() => {
                      downloadCsv();
                      setExportOpen(false);
                    }}
                  >
                    <FileSpreadsheet size={16} />
                    Spreadsheet (CSV)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-[#0d1a14] hover:bg-[#0d1a14]/5 min-h-[44px]"
                    onClick={() => {
                      downloadPdf();
                      setExportOpen(false);
                    }}
                  >
                    <FileText size={16} />
                    PDF report
                  </button>
                </div>
              )}
            </div>
            <a href={publicUrl} target="_blank" rel="noreferrer" className={btnSecondary}>
              <ExternalLink size={15} />
              Signup page
            </a>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className={`${btnSecondary} px-3`}
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={() => void archiveRsvp()}
              disabled={loading || archiving || !eventId}
              className={btnSecondary}
              title="Move to the RSVP Archive (keeps every signup and paid record)"
              data-testid="rsvp-archive"
            >
              {archiving ? <Loader2 size={15} className="animate-spin" /> : <Archive size={15} />}
              Archive
            </button>
            <button
              type="button"
              onClick={() => void deleteWholeRsvp()}
              disabled={loading || deletingList || !eventId || rsvpBlockers.length > 0}
              className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 rounded-xl border border-red-200 bg-white text-sm font-medium text-red-700 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
              title={
                rsvpBlockers.length
                  ? `Can't delete: ${rsvpBlockers.map((r) => r.name).join(', ')} ${rsvpBlockers.length === 1 ? 'has' : 'have'} paid or pledged`
                  : 'Delete this RSVP (the event stays on the calendar)'
              }
              data-testid="rsvp-delete-list"
            >
              {deletingList ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              Delete RSVP
            </button>
          </div>
        </div>
        {rsvpBlockers.length > 0 && !loading ? (
          <p className="mt-3 text-xs text-gray-500">
            This RSVP can't be deleted while {rsvpBlockers.length === 1 ? 'someone has' : `${rsvpBlockers.length} people have`} paid or pledged. Use Archive to keep the records and take it off the list.
          </p>
        ) : null}

        {eventOptions.length > 0 && (
          <label className="mt-5 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 max-w-xl">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 shrink-0">Event</span>
            <select
              data-testid="rsvp-event-picker"
              aria-label="RSVP event"
              value={eventId}
              onChange={(e) => {
                // Always put the chosen event in the link. (The Cookout used to get an empty
                // link, which now means "next upcoming event", so picking it did nothing.)
                const next = e.target.value;
                if (next) setSearchParams({ eventId: next });
              }}
              className="w-full min-h-[42px] px-3 rounded-xl border border-black/[0.08] bg-white text-sm font-semibold text-[#0d1a14]"
            >
              {eventOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                  {opt.date ? ` · ${opt.date}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {/* ---------- Totals ---------- */}
      <section
        aria-label="Totals"
        className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 bg-white border border-black/[0.06] rounded-2xl overflow-hidden divide-x divide-y lg:divide-y-0 divide-black/[0.05]"
      >
        {[
          { label: 'Adults', value: String(totals.adults), tone: 'text-[#0d1a14]' },
          { label: 'Children', value: String(totals.children), tone: 'text-[#0d1a14]' },
          { label: 'Guests', value: String(totals.guests), tone: 'text-[#0d1a14]' },
          { label: 'Still due', value: formatFunds(totals.funds), tone: totals.funds > 0 ? 'text-[#1d372c]' : 'text-gray-400' },
          { label: 'Paid so far', value: formatFunds(totals.fundsPaid), tone: totals.fundsPaid > 0 ? 'text-emerald-700' : 'text-gray-400' },
        ].map((s) => (
          <div key={s.label} className="px-5 py-4 min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-400">{s.label}</p>
            <p className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </section>

      {flash && (
        <p className="mb-5 text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3" role="status">
          {flash}
        </p>
      )}
      {error && (
        <p className="mb-5 text-sm font-medium text-red-800 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
      )}
      {titheNote && titheNote.updated > 0 && (
        <p className="mb-5 text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
          {titheNote.updated === 1
            ? '1 Pay Now gift was confirmed on PLCC Tithe and marked paid.'
            : `${titheNote.updated} Pay Now gifts were confirmed on PLCC Tithe and marked paid.`}
        </p>
      )}
      {titheNote?.warning && (
        <p className="mb-5 text-sm font-medium text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">{titheNote.warning}</p>
      )}

      {/* ---------- List ---------- */}
      <section className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-black/[0.05]">
          <p className="text-sm font-semibold text-[#0d1a14]">
            {loading ? 'Loading…' : `${rows.length} ${rows.length === 1 ? 'signup' : 'signups'}`}
            {query && !loading ? <span className="font-normal text-gray-400"> · {filteredRows.length} shown</span> : null}
          </p>
          {rows.length > 0 && (
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search name, phone, email, allergies"
                className="w-full min-h-[40px] pl-10 pr-3 rounded-xl border border-black/[0.08] bg-[#FAFAF8] text-sm text-[#0d1a14] placeholder:text-gray-400 outline-none focus:bg-white focus:border-[#0d1a14]/30 focus:ring-2 focus:ring-[#0d1a14]/10"
                aria-label="Search signups"
              />
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20 text-[#0d1a14]">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-8 py-16 text-center">
            <p className="text-gray-600 font-medium">No signups yet.</p>
            <p className="text-sm text-gray-400 mt-2">
              Share the{' '}
              <Link to={publicPath} className="text-[#0d1a14] font-semibold underline underline-offset-2">
                signup page
              </Link>{' '}
              or tap Add guest to sign someone up.
            </p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="px-8 py-16 text-center">
            <p className="text-gray-600 font-medium">No signups match “{search.trim()}”.</p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
              className="mt-3 text-sm font-semibold text-[#0d1a14] underline underline-offset-2"
            >
              Clear search
            </button>
          </div>
        ) : (
          <>
            {/* Column headings (wide screens) */}
            <div className="hidden lg:grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_auto] gap-4 px-5 py-2.5 bg-[#FAFAF8] text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 border-b border-black/[0.05]">
              <span>Guest</span>
              <span>Party</span>
              <span>Gift</span>
              <span>Allergies</span>
              <span className="w-[200px] text-right">Actions</span>
            </div>

            <ul className="divide-y divide-black/[0.05]">
              {pageRows.map((r) => {
                const adults = Math.max(0, (Number(r.household_size) || 1) - (Number(r.children_count) || 0));
                const kids = Number(r.children_count) || 0;
                const guests = Number(r.guests_invited) || 0;
                const consent = consentLabel(r);
                const consentOk = Boolean(r.food_allergy_acknowledged && r.injury_acknowledged);
                const shirts = eventCfg.tshirtsEnabled ? tshirtChips(r.tshirt_sizes) : [];
                const allergies = formatAllergies(r.allergies);
                const gift = giftStatus(r);
                const choice = giftChoiceLabel(r);
                const blocked = deleteBlockedReason(r);
                const busyPaid = togglingPaidId === r.id;
                const showPayLink =
                  canMarkGiftPaid && !r.food_contribution_paid && Number(r.food_contribution_amount) > 0 && r.food_contribution_intent;

                const giftInner = (
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold tabular-nums text-[#0d1a14]">
                        {busyPaid ? <Loader2 size={14} className="inline animate-spin" /> : formatFunds(r.food_contribution_amount)}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset ${toneClass[gift.tone]}`}>
                        {gift.label}
                      </span>
                    </div>
                    {gift.note || choice ? (
                      <p className="mt-1 text-xs text-gray-500 leading-snug">{[gift.note, choice].filter(Boolean).join(' · ')}</p>
                    ) : null}
                  </div>
                );

                return (
                  <li
                    key={r.id}
                    className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_auto] gap-x-4 gap-y-3 px-4 sm:px-5 py-4 hover:bg-[#FAFAF8]/70 transition-colors"
                  >
                    {/* Guest */}
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-[#0d1a14] leading-snug break-words">{r.name}</p>
                      <p className="text-[13px] text-gray-500 mt-0.5 tabular-nums">
                        {formatPhone(r.phone)}
                        {r.email ? <span className="text-gray-400"> · <span className="break-all">{r.email}</span></span> : null}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Signed up {formatSignedUp(r.created_at)}</p>
                      {consent && (
                        <span
                          className={`mt-2 inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset ${
                            consentOk ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/15' : 'bg-amber-50 text-amber-800 ring-amber-600/20'
                          }`}
                          title={r.food_allergy_signed_name || r.injury_signed_name || undefined}
                        >
                          {consent}
                        </span>
                      )}
                    </div>

                    {/* Party */}
                    <div className="min-w-0 lg:pt-0.5">
                      <p className="lg:hidden text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 mb-1">Party</p>
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold text-[#0d1a14] tabular-nums">{adults}</span> {adults === 1 ? 'adult' : 'adults'}
                        {kids > 0 ? (
                          <>
                            {' · '}
                            <span className="font-semibold text-[#0d1a14] tabular-nums">{kids}</span> {kids === 1 ? 'child' : 'children'}
                          </>
                        ) : null}
                        {guests > 0 ? (
                          <>
                            {' · '}
                            <span className="font-semibold text-[#0d1a14] tabular-nums">{guests}</span> {guests === 1 ? 'guest' : 'guests'}
                          </>
                        ) : null}
                      </p>
                      {shirts.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {shirts.map((chip) => (
                            <span key={chip} className="px-1.5 py-0.5 rounded-md bg-[#FAFAF8] ring-1 ring-black/[0.06] text-[11px] text-[#0d1a14] whitespace-nowrap">
                              {chip.replace(/×/g, ' × ')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Gift */}
                    <div className="min-w-0">
                      <p className="lg:hidden text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 mb-1">Gift</p>
                      {canMarkGiftPaid && Number(r.food_contribution_amount) > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleGiftPaid(r)}
                          disabled={busyPaid}
                          className="rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-[#0d1a14]/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0d1a14]/30 disabled:opacity-60"
                          title={r.food_contribution_paid ? 'Tap to mark unpaid' : 'Tap to mark paid (posts to DCB)'}
                          aria-label={r.food_contribution_paid ? `Mark gift for ${r.name} unpaid` : `Mark gift for ${r.name} paid`}
                        >
                          {giftInner}
                        </button>
                      ) : (
                        giftInner
                      )}
                    </div>

                    {/* Allergies */}
                    <div className="min-w-0 lg:pt-0.5">
                      <p className="lg:hidden text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 mb-1">Allergies</p>
                      <p className={`text-sm break-words ${/^none$/i.test(allergies) ? 'text-gray-400' : 'text-gray-700 font-medium'}`}>{allergies}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-start gap-2 lg:w-[200px] lg:justify-end">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 rounded-lg bg-[#0d1a14] text-amber-50 text-xs font-semibold hover:bg-[#14251d] transition-colors"
                        aria-label={`Edit signup for ${r.name}`}
                      >
                        <PenLine size={14} />
                        Edit
                      </button>
                      {showPayLink && (
                        <button
                          type="button"
                          onClick={() => void sharePayLink(r)}
                          className="inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-lg border border-black/[0.08] bg-white text-[#0d1a14] text-xs font-semibold hover:bg-[#F7F2F3] transition-colors"
                          title="Share this guest's PLCC Tithe pay link"
                          aria-label={`Share PLCC Tithe pay link for ${r.name}`}
                        >
                          {sharedLinkId === r.id ? <Check size={14} className="text-emerald-600" /> : <Link2 size={14} />}
                          {sharedLinkId === r.id ? 'Ready' : 'Pay link'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteRsvp(r)}
                        disabled={deletingId === r.id || Boolean(blocked)}
                        className="inline-flex items-center justify-center min-h-[38px] w-[38px] rounded-lg border border-black/[0.08] bg-white text-gray-400 hover:border-red-200 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-400 disabled:hover:border-black/[0.08] disabled:cursor-not-allowed"
                        title={blocked || 'Delete this signup'}
                        aria-label={blocked ? `Can't delete ${r.name}: ${blocked}` : `Delete signup for ${r.name}`}
                      >
                        {deletingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {filteredRows.length > PAGE_SIZE && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-5 py-3.5 border-t border-black/[0.05]">
                <p className="text-sm text-gray-500">
                  Showing <span className="font-semibold text-[#0d1a14]">{rangeFrom}–{rangeTo}</span> of{' '}
                  <span className="font-semibold text-[#0d1a14]">{filteredRows.length}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className={`${btnSecondary} min-h-[38px] px-3`}
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </button>
                  <span className="text-sm tabular-nums text-gray-500 px-1">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className={`${btnSecondary} min-h-[38px] px-3`}
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>


      {editing && editForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close edit form"
            onClick={closeEdit}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-rsvp-title"
            className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-100"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-100 bg-white">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-burgundy/50 mb-1">
                  {isAdding ? 'New signup' : 'Edit signup'}
                </p>
                <h2 id="edit-rsvp-title" className="text-xl font-black text-[#0d1a14] tracking-tight">
                  {isAdding ? 'Add a guest' : editing.name}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {isAdding
                    ? 'Sign someone up for this event. Works even after online signups close.'
                    : 'Change any field on this RSVP, then save.'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="p-2 rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block sm:col-span-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Name *</span>
                  <input
                    value={editForm.name}
                    onChange={(e) => setField('name', e.target.value)}
                    className="mt-1.5 w-full min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-burgundy"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{isAdding ? 'Phone' : 'Phone *'}</span>
                  <input
                    value={editForm.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    className="mt-1.5 w-full min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-burgundy"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Email</span>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setField('email', e.target.value)}
                    className="mt-1.5 w-full min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-burgundy"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Adults</span>
                  <input
                    type="number"
                    min={0}
                    value={editForm.adults}
                    onChange={(e) => setField('adults', e.target.value)}
                    className="mt-1.5 w-full min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-burgundy"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Children</span>
                  <input
                    type="number"
                    min={0}
                    value={editForm.children_count}
                    onChange={(e) => setField('children_count', e.target.value)}
                    className="mt-1.5 w-full min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-burgundy"
                  />
                </label>
                <div className="sm:col-span-2 rounded-xl bg-[#FAFAF8] border border-black/[0.04] px-4 py-3 text-sm text-gray-600">
                  <span className="font-semibold text-[#0d1a14]">Total from this home: {peopleInEdit}</span>
                  <span className="text-gray-400"> · adults + children (guests are separate below)</span>
                </div>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Guests invited</span>
                  <input
                    type="number"
                    min={0}
                    value={editForm.guests_invited}
                    onChange={(e) => setField('guests_invited', e.target.value)}
                    className="mt-1.5 w-full min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-burgundy"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    {isAdding ? 'Food contribution (optional)' : 'Food contribution amount *'}
                  </span>
                  <div className="relative mt-1.5">
                    <DollarSign
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                      size={16}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      required={!isAdding}
                      value={editForm.food_contribution_amount}
                      onChange={(e) => setField('food_contribution_amount', e.target.value)}
                      placeholder="Example: 20"
                      className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-burgundy"
                      aria-label="Food contribution amount in dollars"
                      list="cookout-gift-amounts"
                    />
                    <datalist id="cookout-gift-amounts">
                      {COOKOUT_FOOD_CONTRIBUTION_OPTIONS.slice(0, 40).map((n) => (
                        <option key={n} value={String(n)} />
                      ))}
                    </datalist>
                  </div>
                  <span className="mt-1 block text-xs text-gray-400">
                    {isAdding
                      ? "Leave blank if they haven't given. Any amount is allowed here."
                      : COOKOUT_FOOD_CONTRIBUTION_HINT}
                  </span>
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Food allergies *</span>
                  <textarea
                    value={editForm.allergies}
                    onChange={(e) => setField('allergies', e.target.value)}
                    rows={2}
                    required
                    placeholder="None, or list allergies"
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-burgundy resize-y"
                  />
                </label>
              </div>

              {eventCfg.tshirtsEnabled && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                  T-shirt sizes * · Total {tshirtTotal}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {TSHIRT_SIZE_OPTIONS.map((size) => (
                    <label key={size} className="block rounded-xl border border-gray-100 bg-[#FBFBF9] px-2.5 py-2">
                      <span className="block text-[10px] font-bold text-gray-500 mb-1">{size}</span>
                      <input
                        type="number"
                        min={0}
                        value={tshirtCounts[size] || 0}
                        onChange={(e) => {
                          const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                          setTshirtCounts((prev) => ({ ...prev, [size]: n }));
                        }}
                        className="w-full min-h-[36px] px-2 rounded-lg border border-gray-200 text-sm font-black text-[#0d1a14] outline-none focus:border-burgundy"
                      />
                    </label>
                  ))}
                </div>
              </div>
              )}

              {kidsInEdit && (
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Signed by (consent) *
                  </span>
                  <input
                    value={editForm.signed_name}
                    onChange={(e) => setField('signed_name', e.target.value)}
                    placeholder="Full legal name on file"
                    className="mt-1.5 w-full min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-burgundy"
                  />
                  <span className="mt-1 block text-xs text-gray-400">
                    Updates both Food Allergy and Premises Injury signed names.
                  </span>
                </label>
              )}
            </div>

            <div className="sticky bottom-0 px-6 py-4 border-t border-gray-100 bg-white space-y-3">
              {editError && (
                <p className="text-sm font-medium text-red-800 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  {editError}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-burgundy text-gold text-sm font-black uppercase tracking-widest disabled:opacity-60"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                  {isAdding ? 'Add guest' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CookoutRsvpsPage;

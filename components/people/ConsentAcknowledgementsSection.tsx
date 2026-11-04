/**
 * People → Members → Profile — read-only child consent acknowledgements.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { getAuthHeaders } from '../../lib/api';

type ConsentRow = {
  id: string;
  child_id: string;
  parent_id: string;
  status: string;
  signed_name?: string | null;
  signed_at?: string | null;
  expires_at?: string | null;
  signature_method?: string | null;
  consent_form?: {
    id?: string;
    title?: string;
    form_type?: string;
    audience?: string;
  } | null;
};

type Props = {
  memberId: string;
  memberRole?: string | null;
};

function isChildRole(role?: string | null): boolean {
  return String(role || '').trim().toLowerCase() === 'child';
}

function formatWhen(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return String(iso).slice(0, 10);
  }
}

function effectiveStatus(row: ConsentRow): string {
  const raw = String(row.status || 'pending').toLowerCase();
  if (raw === 'granted' && row.expires_at && new Date(row.expires_at) < new Date()) {
    return 'expired';
  }
  return raw;
}

function badgeClasses(status: string): string {
  switch (status) {
    case 'granted':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'expired':
      return 'bg-amber-50 text-amber-900 border-amber-200';
    case 'revoked':
    case 'denied':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

export default function ConsentAcknowledgementsSection({ memberId, memberRole }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consents, setConsents] = useState<ConsentRow[]>([]);

  const load = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders(undefined, localStorage.getItem('awc_user_id'));
      const child = isChildRole(memberRole);
      const params = child
        ? `child_id=${encodeURIComponent(memberId)}`
        : `parent_id=${encodeURIComponent(memberId)}&child_id=${encodeURIComponent(memberId)}`;
      const res = await fetch(`/api/vault?resource=consent&action=list&${params}`, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Could not load consent acknowledgements.');
        setConsents([]);
        return;
      }
      const rows = Array.isArray(data.consents) ? data.consents : [];
      // Dedupe by id when parent+child self-sign or merges
      const byId = new Map<string, ConsentRow>();
      for (const row of rows) {
        if (row?.id) byId.set(String(row.id), row);
      }
      setConsents(Array.from(byId.values()));
    } catch {
      setError('Could not load consent acknowledgements.');
      setConsents([]);
    } finally {
      setLoading(false);
    }
  }, [memberId, memberRole]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      className="w-full mt-4 bg-white p-4 rounded-2xl border border-burgundy/10 text-left"
      aria-labelledby="consent-ack-heading"
    >
      <div className="flex items-start gap-2 mb-3">
        <ClipboardCheck size={18} className="text-burgundy shrink-0 mt-0.5" aria-hidden />
        <div>
          <h3
            id="consent-ack-heading"
            className="text-xs font-black text-gray-600 uppercase tracking-widest"
          >
            Acknowledgements
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Child consent forms signed for check-in and ministry. Revoke or re-sign from Consent
            Management.
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 py-3" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          Loading acknowledgements…
        </div>
      )}

      {!loading && error && (
        <div className="space-y-2" role="alert">
          <p className="text-sm text-rose-800">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs font-bold text-burgundy underline"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && consents.length === 0 && (
        <p className="text-sm text-gray-600 py-2 italic" role="status">
          No consent acknowledgements on file yet.
        </p>
      )}

      {!loading && !error && consents.length > 0 && (
        <ul className="space-y-2">
          {consents.map((row) => {
            const status = effectiveStatus(row);
            const title = row.consent_form?.title || 'Consent form';
            const forSelf = row.child_id === row.parent_id;
            return (
              <li
                key={row.id}
                className="rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#0d1a14] truncate">{title}</p>
                  <p className="text-xs text-gray-600 font-medium mt-0.5">
                    {forSelf ? 'Self' : 'For child record'}
                    {row.signed_name ? ` · ${row.signed_name}` : ''}
                    {' · Signed '}
                    {formatWhen(row.signed_at)}
                    {row.expires_at ? ` · Expires ${formatWhen(row.expires_at)}` : ''}
                  </p>
                </div>
                <span
                  className={`self-start sm:self-center shrink-0 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-lg border ${badgeClasses(status)}`}
                >
                  {status}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

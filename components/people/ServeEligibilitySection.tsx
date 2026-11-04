/**
 * People → Members → Member Detail — Serve Eligibility staff section.
 * Uses public.users.id via same-UUID (member.id) only; never email-matches.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { getAuthHeaders } from '../../lib/api';
import {
  REASON_LABELS,
  REASON_OPTIONS,
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  actionsForStatus,
  badgeClasses,
  buildResetEligibilityBody,
  buildSetEligibilityBody,
  confirmMessageForAction,
  eligibilityErrorMessage,
  formatVerifiedAt,
  normalizeEligibilityDto,
  type EligibilityFetchState,
  type ServeEligibilityStatus,
} from '../../lib/serveEligibilityUi';

type Props = {
  /** Candidate public.users.id — only valid when a users row exists with this id. */
  memberId: string;
};

export default function ServeEligibilitySection({ memberId }: Props) {
  const [state, setState] = useState<EligibilityFetchState>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [sectionMessage, setSectionMessage] = useState<string | null>(null);
  const [ineligiblePicker, setIneligiblePicker] = useState(false);
  const [ineligibleReason, setIneligibleReason] = useState<'under_18' | 'policy_ineligible'>(
    'under_18'
  );

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    setSectionMessage(null);
    setIneligiblePicker(false);
    try {
      const headers = await getAuthHeaders(undefined, localStorage.getItem('awc_user_id'));
      const res = await fetch(
        `/api/vault?resource=users&subResource=serve-eligibility&userId=${encodeURIComponent(memberId)}`,
        { headers }
      );
      const data = await res.json().catch(() => ({}));

      if (res.status === 404 || data?.code === 'user_not_found') {
        setState({ kind: 'not_linked' });
        return;
      }
      if (!res.ok) {
        setState({
          kind: 'error',
          message: eligibilityErrorMessage(data, 'Could not load Serve eligibility.'),
        });
        return;
      }

      const dto = normalizeEligibilityDto(data.eligibility, memberId);
      if (!dto) {
        setState({ kind: 'error', message: 'Could not read Serve eligibility.' });
        return;
      }
      setState({ kind: 'ready', eligibility: dto });
    } catch {
      setState({ kind: 'error', message: 'Could not load Serve eligibility.' });
    }
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = async (body: Record<string, unknown>, successNote: string) => {
    setBusy(true);
    setSectionMessage(null);
    const prior = state;
    try {
      const headers = await getAuthHeaders(
        { 'Content-Type': 'application/json' },
        localStorage.getItem('awc_user_id')
      );
      const res = await fetch('/api/vault?resource=users&subResource=serve-eligibility', {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSectionMessage(eligibilityErrorMessage(data));
        setState(prior);
        return;
      }
      const dto = normalizeEligibilityDto(data.eligibility, memberId);
      if (dto) {
        setState({ kind: 'ready', eligibility: dto });
      } else {
        await load();
      }
      setSectionMessage(successNote);
      setIneligiblePicker(false);
    } catch {
      setSectionMessage('Serve eligibility update failed.');
      setState(prior);
    } finally {
      setBusy(false);
    }
  };

  const runVerify = () => {
    if (!confirm(confirmMessageForAction('verify'))) return;
    void mutate(
      buildSetEligibilityBody(memberId, 'eligible', 'adult_verified'),
      'Member marked Eligible for Serve.'
    );
  };

  const runSuspend = () => {
    if (!confirm(confirmMessageForAction('suspend'))) return;
    void mutate(
      buildSetEligibilityBody(memberId, 'suspended', 'temporarily_suspended'),
      'Serve eligibility suspended.'
    );
  };

  const runReset = () => {
    if (!confirm(confirmMessageForAction('reset'))) return;
    void mutate(buildResetEligibilityBody(memberId), 'Serve eligibility reset to Not Verified.');
  };

  const runIneligible = () => {
    if (!confirm(confirmMessageForAction('ineligible'))) return;
    void mutate(
      buildSetEligibilityBody(memberId, 'ineligible', ineligibleReason),
      'Member marked Ineligible for Serve.'
    );
  };

  return (
    <section
      className="w-full mt-4 bg-white p-4 rounded-2xl border border-burgundy/10 text-left"
      aria-labelledby="serve-eligibility-heading"
    >
      <div className="flex items-start gap-2 mb-3">
        <ShieldCheck size={18} className="text-burgundy shrink-0 mt-0.5" aria-hidden />
        <div>
          <h3
            id="serve-eligibility-heading"
            className="text-xs font-black text-gray-600 uppercase tracking-widest"
          >
            Serve Eligibility
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Staff-verified status for future Serve self-signup. Does not cancel existing signups.
          </p>
        </div>
      </div>

      {state.kind === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-gray-600 py-3" role="status" aria-live="polite">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          Loading eligibility…
        </div>
      )}

      {state.kind === 'not_linked' && (
        <p className="text-sm text-gray-700 py-2" role="status">
          Serve eligibility unavailable — this member is not linked to a sign-in account.
        </p>
      )}

      {state.kind === 'error' && (
        <div className="space-y-2" role="alert">
          <p className="text-sm text-rose-800">{state.message}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm font-bold text-burgundy underline min-h-[44px] px-1"
          >
            Retry
          </button>
        </div>
      )}

      {state.kind === 'ready' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wide border ${badgeClasses(state.eligibility.status)}`}
            >
              {STATUS_LABELS[state.eligibility.status]}
            </span>
          </div>
          <p className="text-sm text-[#0d1a14] font-medium">
            {STATUS_DESCRIPTIONS[state.eligibility.status]}
          </p>
          {state.eligibility.reasonCode &&
            state.eligibility.status !== 'not_verified' &&
            REASON_LABELS[state.eligibility.reasonCode] && (
              <p className="text-xs text-gray-600">
                Reason: {REASON_LABELS[state.eligibility.reasonCode]}
              </p>
            )}
          {formatVerifiedAt(state.eligibility.verifiedAt) && (
            <p className="text-xs text-gray-500">
              Last updated: {formatVerifiedAt(state.eligibility.verifiedAt)}
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1">
            {actionsForStatus(state.eligibility.status).map((action) => {
              if (action.key === 'ineligible') {
                return (
                  <div key={action.key} className="space-y-2">
                    {!ineligiblePicker ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setIneligiblePicker(true)}
                        className="w-full min-h-[44px] py-2.5 px-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-900 text-sm font-bold disabled:opacity-50"
                      >
                        {action.label}
                      </button>
                    ) : (
                      <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3 space-y-2">
                        <p className="text-xs font-black uppercase tracking-widest text-rose-900">
                          Select reason
                        </p>
                        <fieldset className="space-y-2" disabled={busy}>
                          <legend className="sr-only">Ineligible reason</legend>
                          {REASON_OPTIONS.ineligible.map((opt) => (
                            <label
                              key={opt.code}
                              className="flex items-center gap-2 text-sm text-[#0d1a14] font-medium min-h-[44px]"
                            >
                              <input
                                type="radio"
                                name="ineligible-reason"
                                value={opt.code}
                                checked={ineligibleReason === opt.code}
                                onChange={() =>
                                  setIneligibleReason(opt.code as 'under_18' | 'policy_ineligible')
                                }
                              />
                              {opt.label}
                            </label>
                          ))}
                        </fieldset>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={runIneligible}
                            className="flex-1 min-h-[44px] py-2 rounded-xl bg-rose-800 text-white text-sm font-bold disabled:opacity-50"
                          >
                            Confirm Ineligible
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setIneligiblePicker(false)}
                            className="min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
              if (action.key === 'verify') {
                return (
                  <button
                    key={action.key}
                    type="button"
                    disabled={busy}
                    onClick={runVerify}
                    className="w-full min-h-[44px] py-2.5 px-3 rounded-xl bg-burgundy text-gold text-sm font-bold disabled:opacity-50"
                  >
                    {action.label}
                  </button>
                );
              }
              if (action.key === 'suspend') {
                return (
                  <button
                    key={action.key}
                    type="button"
                    disabled={busy}
                    onClick={runSuspend}
                    className="w-full min-h-[44px] py-2.5 px-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-sm font-bold disabled:opacity-50"
                  >
                    {action.label}
                  </button>
                );
              }
              return (
                <button
                  key={action.key}
                  type="button"
                  disabled={busy}
                  onClick={runReset}
                  className="w-full min-h-[44px] py-2.5 px-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-800 text-sm font-bold disabled:opacity-50"
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {sectionMessage && (
        <p className="mt-3 text-sm font-medium text-emerald-800" role="status" aria-live="polite">
          {sectionMessage}
        </p>
      )}

      {busy && state.kind === 'ready' && (
        <p className="mt-2 text-xs text-gray-500 flex items-center gap-1" role="status">
          <Loader2 size={12} className="animate-spin" aria-hidden />
          Updating…
        </p>
      )}
    </section>
  );
}

/** Exported for tests — status badge text helpers */
export function statusLabel(status: ServeEligibilityStatus): string {
  return STATUS_LABELS[status];
}

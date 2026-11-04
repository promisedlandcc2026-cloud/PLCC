import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Search,
  Wrench,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  Send,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNav } from '../../App';
import { getAuthHeaders, parseApiJson } from '../../lib/api';

type Finding = { level: 'ok' | 'warn' | 'error'; code: string; message: string };

type Diagnosis = {
  auth: any;
  users: any;
  members: any;
  link: any;
  pathCheck: any;
  findings: Finding[];
  applicableActions: string[];
};

const ACTION_LABELS: Record<string, string> = {
  ensure_member_row: 'Create / sync Members row',
  promote_onboarded_member: 'Promote PENDING → MEMBER (onboarded)',
  reset_temporary_password: 'Reset temporary password',
  clear_media_notice: 'Clear media notice (re-prompt)',
  force_media_ack: 'Force media acknowledgment',
  relink_auth_user: 'Relink Auth ↔ Vault user',
  set_member_active: 'Set Members status Active',
};

const VaultRepairPage: React.FC = () => {
  const { userRole } = useNav();
  const navigate = useNavigate();
  const isSuperAdmin = String(userRole || '').toUpperCase() === 'SUPER_ADMIN';

  const [query, setQuery] = useState('');
  const [path, setPath] = useState('/dashboard');
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatLog, setChatLog] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

  const userId = diagnosis?.users?.id || diagnosis?.auth?.id || null;

  const findings = diagnosis?.findings || [];

  const applicable = useMemo(() => new Set(diagnosis?.applicableActions || []), [diagnosis]);

  if (!isSuperAdmin) {
    return (
      <div className="max-w-xl mx-auto pt-16 px-4 text-center">
        <ShieldAlert className="mx-auto text-burgundy mb-4" size={36} />
        <h1 className="text-2xl font-black text-[#0d1a14]">Vault Repair</h1>
        <p className="text-gray-500 mt-2 font-medium">Only Super Admins can use this console.</p>
      </div>
    );
  }

  const runDiagnose = async () => {
    if (!query.trim()) {
      setError('Enter an email, phone, name, or user id.');
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    setTempPassword(null);
    setAiSuggestion(null);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({
        action: 'diagnose',
        q: query.trim(),
        path: path.trim() || '/dashboard',
      });
      const res = await fetch(`/api/vault?resource=vault-repair&${params}`, { headers });
      const data = await parseApiJson<{ ok?: boolean; error?: string; diagnosis?: Diagnosis }>(res);
      if (!res.ok) throw new Error(data?.error || `Diagnose failed (${res.status})`);
      setDiagnosis(data.diagnosis || null);
      if (!data.diagnosis?.users && !data.diagnosis?.auth) {
        setNotice('No matching account found.');
      }
    } catch (err: any) {
      setError(err?.message || 'Diagnose failed');
      setDiagnosis(null);
    } finally {
      setLoading(false);
    }
  };

  const executeRepair = async (repairAction: string) => {
    if (!userId) {
      setError('Diagnose a member first.');
      return;
    }
    setRunning(repairAction);
    setError(null);
    setNotice(null);
    setTempPassword(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=vault-repair&action=repair', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'repair', repairAction, userId, confirm: true }),
      });
      const data = await parseApiJson<{
        ok?: boolean;
        error?: string;
        result?: any;
        diagnosis?: Diagnosis;
      }>(res);
      if (!res.ok) throw new Error(data?.error || `Repair failed (${res.status})`);
      if (data.diagnosis) setDiagnosis(data.diagnosis);
      if (data.result?.temporaryPassword) {
        setTempPassword(String(data.result.temporaryPassword));
        setNotice('Temporary password generated — copy it now.');
      } else {
        setNotice(`${ACTION_LABELS[repairAction] || repairAction} completed.`);
      }
      setConfirmAction(null);
      setAiSuggestion(null);
    } catch (err: any) {
      setError(err?.message || 'Repair failed');
    } finally {
      setRunning(null);
    }
  };

  const requestRepair = (repairAction: string) => {
    if (repairAction === 'reset_temporary_password') {
      setConfirmAction(repairAction);
      return;
    }
    void executeRepair(repairAction);
  };

  const sendChat = async () => {
    if (!userId || !chatInput.trim()) return;
    const nextUser = { role: 'user' as const, content: chatInput.trim() };
    const nextLog = [...chatLog, nextUser];
    setChatLog(nextLog);
    setChatInput('');
    setChatBusy(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=vault-repair&action=chat', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          userId,
          path: path.trim() || '/dashboard',
          messages: nextLog,
        }),
      });
      const data = await parseApiJson<{
        ok?: boolean;
        error?: string;
        reply?: string;
        rationale?: string;
        recommendedAction?: string | null;
        offline?: boolean;
      }>(res);
      if (!res.ok) throw new Error(data?.error || `Chat failed (${res.status})`);
      const reply = data.reply || 'No suggestion.';
      const withRationale = data.rationale ? `${reply}\n\n${data.rationale}` : reply;
      setChatLog((prev) => [...prev, { role: 'assistant', content: withRationale }]);
      setAiSuggestion(data.recommendedAction || null);
    } catch (err: any) {
      setError(err?.message || 'Chat failed');
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto pt-4 md:pt-8 pb-24 px-4 md:px-6 space-y-6 animate-in fade-in duration-500">
      <button
        type="button"
        onClick={() => navigate('/settings?tab=staff-roles')}
        className="flex items-center gap-2 text-gray-400 font-bold text-[10px] uppercase tracking-widest hover:text-burgundy transition-colors"
      >
        <ArrowLeft size={14} />
        Back to Staff & Roles
      </button>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0d1a14]/50 mb-1">
            Super Admin
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold text-[#0d1a14] tracking-tight flex items-center gap-3">
            <Wrench className="text-burgundy" size={28} />
            Vault Repair
          </h1>
          <p className="text-gray-500 mt-2 max-w-2xl">
            Diagnose login and section-access issues, then run allowlisted fixes. AI can suggest the same
            actions — nothing runs without your confirmation.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-sm font-medium text-red-800 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
          {notice}
        </p>
      )}
      {tempPassword && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-950">Temporary password (copy now)</p>
          <code className="mt-1 block text-base font-mono text-[#0d1a14] select-all">{tempPassword}</code>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 md:p-6 space-y-4">
        <div className="grid md:grid-cols-[1fr_180px_auto] gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void runDiagnose()}
              placeholder="Email, phone, name, or user id"
              className="w-full pl-10 pr-3 py-3 rounded-xl bg-gray-50 border-none outline-none focus:ring-2 focus:ring-gold font-medium"
            />
          </div>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/dashboard"
            className="w-full px-3 py-3 rounded-xl bg-gray-50 border-none outline-none focus:ring-2 focus:ring-gold font-medium text-sm"
            title="Optional path to check section access"
          />
          <button
            type="button"
            onClick={() => void runDiagnose()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#0d1a14] text-amber-100 text-sm font-semibold hover:bg-[#14251d] disabled:opacity-60"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
            Diagnose
          </button>
        </div>
      </div>

      {diagnosis && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 space-y-3">
              <h2 className="font-bold text-[#0d1a14]">Diagnosis</h2>
              <div className="text-xs text-gray-500 space-y-1 font-medium">
                <p>
                  <span className="text-gray-400">Auth:</span>{' '}
                  {diagnosis.auth ? `${diagnosis.auth.email} (${diagnosis.auth.id.slice(0, 8)}…)` : '—'}
                </p>
                <p>
                  <span className="text-gray-400">Users:</span>{' '}
                  {diagnosis.users
                    ? `${diagnosis.users.name || 'Unnamed'} · ${diagnosis.users.role} · ${diagnosis.users.email}`
                    : '—'}
                </p>
                <p>
                  <span className="text-gray-400">Members:</span>{' '}
                  {diagnosis.members
                    ? `${diagnosis.members.first_name || ''} ${diagnosis.members.last_name || ''} · ${diagnosis.members.status}`
                    : '—'}
                </p>
              </div>
              <ul className="space-y-2">
                {findings.map((f) => (
                  <li
                    key={`${f.code}-${f.message}`}
                    className={`flex items-start gap-2 text-sm rounded-xl px-3 py-2 border ${
                      f.level === 'ok'
                        ? 'bg-emerald-50/70 border-emerald-100 text-emerald-900'
                        : f.level === 'error'
                          ? 'bg-red-50 border-red-100 text-red-900'
                          : 'bg-amber-50/80 border-amber-100 text-amber-950'
                    }`}
                  >
                    {f.level === 'ok' ? (
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                    ) : (
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    )}
                    <span className="font-medium">{f.message}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 space-y-3">
              <h2 className="font-bold text-[#0d1a14]">Allowlisted repairs</h2>
              <div className="grid gap-2">
                {Object.keys(ACTION_LABELS).map((action) => {
                  const enabled = applicable.has(action) || action === 'reset_temporary_password';
                  // Always allow password reset / media toggles when we have a user id
                  const softAlways =
                    !!userId &&
                    ['reset_temporary_password', 'clear_media_notice', 'force_media_ack', 'relink_auth_user'].includes(
                      action
                    );
                  const canRun = (enabled || softAlways) && !!userId;
                  return (
                    <button
                      key={action}
                      type="button"
                      disabled={!canRun || !!running}
                      onClick={() => requestRepair(action)}
                      className="text-left px-4 py-3 rounded-xl border border-gray-100 hover:border-burgundy/20 hover:bg-burgundy/[0.02] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                    >
                      <span className="text-sm font-semibold text-[#0d1a14] flex items-center gap-2">
                        {running === action ? <Loader2 className="animate-spin" size={14} /> : <Wrench size={14} />}
                        {ACTION_LABELS[action]}
                      </span>
                      {!applicable.has(action) && softAlways ? (
                        <span className="block text-[11px] text-gray-400 mt-0.5">Available manually</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex flex-col min-h-[420px]">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={18} className="text-burgundy" />
              <h2 className="font-bold text-[#0d1a14]">AI Repair chat</h2>
            </div>
            <p className="text-xs text-gray-400 font-medium mb-3">
              Suggests allowlisted fixes only. Desk buttons work even if AI is offline.
            </p>
            <div className="flex-1 overflow-y-auto space-y-3 mb-3 max-h-[320px] pr-1">
              {chatLog.length === 0 ? (
                <p className="text-sm text-gray-400 font-medium">
                  Example: “They finished onboarding but still see Access Denied on dashboard.”
                </p>
              ) : (
                chatLog.map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-2xl px-3 py-2 text-sm font-medium whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-[#0d1a14] text-amber-50 ml-6'
                        : 'bg-gray-50 text-gray-700 mr-4'
                    }`}
                  >
                    {m.content}
                  </div>
                ))
              )}
            </div>
            {aiSuggestion && (
              <button
                type="button"
                onClick={() => requestRepair(aiSuggestion)}
                disabled={!!running}
                className="mb-3 w-full py-3 rounded-xl bg-burgundy/10 text-burgundy text-sm font-bold hover:bg-burgundy/15"
              >
                Run suggested fix: {ACTION_LABELS[aiSuggestion] || aiSuggestion}
              </button>
            )}
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void sendChat()}
                disabled={!userId || chatBusy}
                placeholder={userId ? 'Describe the issue…' : 'Diagnose a member first'}
                className="flex-1 px-3 py-3 rounded-xl bg-gray-50 border-none outline-none focus:ring-2 focus:ring-gold text-sm font-medium"
              />
              <button
                type="button"
                onClick={() => void sendChat()}
                disabled={!userId || chatBusy || !chatInput.trim()}
                className="px-4 rounded-xl bg-[#0d1a14] text-amber-100 disabled:opacity-50"
              >
                {chatBusy ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#0d1a14]/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-lg font-black text-[#0d1a14]">Confirm repair</h3>
            <p className="text-sm text-gray-600 font-medium">
              Run <strong>{ACTION_LABELS[confirmAction] || confirmAction}</strong> for this account? A new
              temporary password will be shown once.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void executeRepair(confirmAction)}
                disabled={!!running}
                className="flex-1 py-3 rounded-xl bg-[#0d1a14] text-amber-100 text-sm font-bold"
              >
                {running ? <Loader2 className="animate-spin mx-auto" size={16} /> : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VaultRepairPage;

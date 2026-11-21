import React, { useEffect, useState } from 'react';
import { getAuthHeaders, parseApiJson } from '../../lib/api';

type User = { id: string; name?: string; email?: string; role?: string };
type Assignment = { user_id: string; office_id: string; pastoral_offices: { pastor_user_id: string } | null };

export default function PastorsAssistantAssignments({ users }: { users: User[] }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [pastorId, setPastorId] = useState('');
  const [assistantId, setAssistantId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const name = (id: string) => users.find(u => u.id === id)?.name || users.find(u => u.id === id)?.email || 'Account';
  const load = async () => {
    try {
      const res = await fetch('/api/vault?resource=pastors-office-assignments', { headers: await getAuthHeaders() });
      const data = await parseApiJson<{ ok?: boolean; assignments?: Assignment[]; error?: string }>(res);
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load assignments.');
      setAssignments(data.assignments || []); setError('');
    } catch (err: any) { setError(err?.message || 'Could not load assignments.'); }
  };
  useEffect(() => { void load(); }, []);
  const change = async (p: string, a: string, action: 'grant' | 'revoke') => {
    if (!p || !a) return;
    setBusy(true); setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=pastors-office-assignments', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ pastorId: p, assistantId: a, action }) });
      const data = await parseApiJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not update assignment.');
      await load();
    } catch (err: any) { setError(err?.message || 'Could not update assignment.'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-[#dfd5b9] bg-white p-5 space-y-3" aria-labelledby="office-assignments-title">
    <h2 id="office-assignments-title" className="font-bold text-lg text-[#102b1b]">Pastor’s Assistant</h2>
    <p className="text-sm text-gray-600">Add this office assignment without changing a person’s existing role. Calendar access will become available when the Pastor’s Office is complete.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <label className="text-sm">Pastor <select className="ml-2 rounded-lg border p-2" value={pastorId} onChange={e => setPastorId(e.target.value)}><option value="">Choose pastor</option>{users.filter(u => u.role === 'PASTOR').map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}</select></label>
      <label className="text-sm">Assistant <select className="ml-2 rounded-lg border p-2" value={assistantId} onChange={e => setAssistantId(e.target.value)}><option value="">Choose assistant</option>{users.filter(u => !['PENDING', 'GUEST', 'KIOSK'].includes(u.role || '')).map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}</select></label>
      <button type="button" disabled={busy || !pastorId || !assistantId} onClick={() => void change(pastorId, assistantId, 'grant')} className="rounded-lg bg-[#143b27] px-4 py-2 text-white disabled:opacity-50">Add assignment</button>
    </div>
    {assignments.length > 0 && <ul className="divide-y">{assignments.map(a => <li key={`${a.office_id}:${a.user_id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>{name(a.user_id)} · assistant to {name(a.pastoral_offices?.pastor_user_id || '')}</span><button type="button" disabled={busy || !a.pastoral_offices?.pastor_user_id} onClick={() => void change(a.pastoral_offices!.pastor_user_id, a.user_id, 'revoke')} className="underline disabled:opacity-50">Remove assignment</button></li>)}</ul>}
  </section>;
}

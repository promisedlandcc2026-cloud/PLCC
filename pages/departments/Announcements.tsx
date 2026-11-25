import React, { useState } from 'react';
import { Megaphone, Pin, PinOff, Send, Trash2 } from 'lucide-react';
import type { DepartmentDetail } from '../../lib/departments';
import { Notice } from './Activities';

/** Department announcements (Phase 2, Nov 25 2026). Everyone in the department is notified. */
export default function Announcements({ data, onSave }: { data: DepartmentDetail; onSave: (b: Record<string, unknown>, done?: string) => Promise<void> }) {
  const { can, me, department: d } = data;
  const list = [...(data.announcements || [])].sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.createdAt) - +new Date(a.createdAt));
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const mayModerate = can['members.manage'] || me.isOversight || me.isStructureAdmin;

  if (!data.phase2Ready) return <Notice text="Announcements need a one-time setup. Ask your developer to run plcc_departments_phase2.sql in Supabase." />;

  const run = async (key: string, payload: Record<string, unknown>, done: string) => {
    setBusy(key);
    setErr('');
    try { await onSave(payload, done); return true; } catch (e) { setErr((e as Error).message); return false; } finally { setBusy(''); }
  };

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-black text-[#0d1a14]">Announcements</h2>
      <p className="text-sm text-gray-500">Messages for everyone in {d.name}. Each one rings their bell in Canaan.</p>

      {can['communication.post'] && d.isActive ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run('post', { action: 'announcement_post', title, body, pinned }, 'Posted')) { setTitle(''); setBody(''); setPinned(false); }
          }}
          className="mt-4 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm"
        >
          <input required minLength={2} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full min-h-[48px] rounded-xl border border-gray-200 px-3 text-base font-bold" />
          <textarea maxLength={2000} rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message" className="mt-2 w-full rounded-xl border border-gray-200 p-3 text-base" />
          <div className="mt-2 flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-600 min-h-[40px]">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-5 w-5 rounded" /> Pin to top
            </label>
            <button type="submit" disabled={busy === 'post'} className="min-h-[44px] px-5 rounded-xl text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50" style={{ background: d.color }}>
              <Send size={15} aria-hidden /> {busy === 'post' ? 'Posting…' : 'Post'}
            </button>
          </div>
        </form>
      ) : null}

      {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

      {list.length ? (
        <ul className="mt-5 space-y-3">
          {list.map((a) => {
            const mine = a.createdBy === data.me_id;
            return (
              <li key={a.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${a.pinned ? 'border-[#b8862f]/40' : 'border-gray-100'}`}>
                <div className="flex items-start gap-3">
                  <span className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center" style={{ background: `${d.color}14`, color: d.color }}>{a.pinned ? <Pin size={18} aria-hidden /> : <Megaphone size={18} aria-hidden />}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-[#0d1a14]">{a.title}</p>
                    <p className="text-xs text-gray-400">{a.createdByName} · {new Date(a.createdAt).toLocaleString('en-GB', { timeZone: 'Africa/Kampala', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}{a.pinned ? ' · Pinned' : ''}</p>
                    {a.body ? <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{a.body}</p> : null}
                  </div>
                  {mayModerate || (mine && can['communication.post']) ? (
                    <div className="flex gap-1 shrink-0">
                      <button type="button" disabled={!!busy} onClick={() => void run(a.id, { action: 'announcement_pin', announcementId: a.id }, a.pinned ? 'Unpinned' : 'Pinned')} className="h-10 w-10 rounded-xl bg-gray-50 text-gray-500 flex items-center justify-center" aria-label={a.pinned ? 'Unpin' : 'Pin'}>
                        {a.pinned ? <PinOff size={16} /> : <Pin size={16} />}
                      </button>
                      <button type="button" disabled={!!busy} onClick={() => { if (window.confirm('Delete this announcement?')) void run(a.id, { action: 'announcement_delete', announcementId: a.id }, 'Deleted'); }} className="h-10 w-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center" aria-label="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-5 rounded-3xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <span className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center" style={{ background: `${d.color}14`, color: d.color }}><Megaphone size={26} aria-hidden /></span>
          <p className="mt-3 font-black text-[#0d1a14]">No announcements yet</p>
          <p className="text-sm text-gray-500 mt-1">{can['communication.post'] ? 'Post the first one above.' : 'Messages from your leaders will show here.'}</p>
        </div>
      )}
    </div>
  );
}

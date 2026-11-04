import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  X, FolderOpen, Plus, Trash2, Printer, Download,
  BookOpen, Handshake, Layers, FileCheck,
  Loader2, Calendar, CheckCircle2, ChevronDown, MoreHorizontal,
} from 'lucide-react';
import ResponsivePage from '../../components/Layout/ResponsivePage';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';
import { useNav } from '../../App';
import { apiFetch } from '../../lib/api';
import { canPerform } from '../../lib/permissions';
import { Role } from '../../types';
import {
  ManagerTab, BatchFilter, ContributionBatch, FundAccount, PledgeAccount, mapSessionToBatch,
} from './contribution-manager/types';
import {
  BatchesPanel, AccountsPanel, PledgesPanel, PostPanel,
} from './contribution-manager/Panels';

const ContributionManagerPage: React.FC = () => {
  const { userName, userId, userRole } = useNav();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canEdit = canPerform(userRole as Role, 'finance.edit');

  const initialFilter = (searchParams.get('filter') as BatchFilter) || 'unposted';

  const [activeTab, setActiveTab] = useState<ManagerTab>('batches');
  const [batchFilter, setBatchFilter] = useState<BatchFilter>(
    initialFilter === 'posted' || initialFilter === 'all' ? initialFilter : 'unposted'
  );
  const [batches, setBatches] = useState<ContributionBatch[]>([]);
  const [funds, setFunds] = useState<FundAccount[]>([]);
  const [pledges, setPledges] = useState<PledgeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [tagged, setTagged] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPostConfirm, setShowPostConfirm] = useState(false);
  const [postConfirmed, setPostConfirmed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [newBatch, setNewBatch] = useState({
    batchDate: new Date().toISOString().slice(0, 10),
    name: "Today's Giving",
    comments: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [fundsData, campaignsData, countingData] = await Promise.all([
        apiFetch('/api/vault?resource=finance&subResource=funds', { userId }),
        apiFetch('/api/vault?resource=finance&subResource=campaigns', { userId }),
        apiFetch('/api/vault?resource=finance&subResource=counting', { userId }),
      ]);

      if (fundsData.ok) setFunds(fundsData.funds || []);

      if (campaignsData.ok && campaignsData.campaigns?.length) {
        setPledges(
          campaignsData.campaigns.map((c: any) => {
            const goal = Number(c.goal_amount) || 0;
            const received = Number(c.raised_amount) || 0;
            return {
              id: c.id,
              name: c.name,
              goal,
              pledged: goal,
              received,
              remaining: Math.max(0, goal - received),
              description: c.description || c.category || '',
            };
          })
        );
      } else {
        setPledges([]);
      }

      if (countingData.ok) {
        const mapped = (countingData.sessions || []).map(mapSessionToBatch);
        setBatches(mapped);
        if (mapped.length && !mapped.find((b: ContributionBatch) => b.id === selectedId)) {
          setSelectedId(mapped[0].id);
        } else if (!mapped.length) {
          setSelectedId('');
        }
      } else {
        setBatches([]);
        setSelectedId('');
      }
      setLastSynced(new Date().toLocaleTimeString());
    } catch (err) {
      console.error(err);
      setToast('Failed to load contribution data — check sign-in');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [userId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreOpen]);

  const filteredBatches = useMemo(() => {
    if (batchFilter === 'all') return batches;
    if (batchFilter === 'posted') return batches.filter((b) => b.status === 'Posted');
    return batches.filter((b) => b.status !== 'Posted');
  }, [batches, batchFilter]);

  useEffect(() => {
    if (filteredBatches.length && !filteredBatches.find((b) => b.id === selectedId)) {
      setSelectedId(filteredBatches[0].id);
    }
  }, [filteredBatches, selectedId]);

  const selected = filteredBatches.find((b) => b.id === selectedId) || filteredBatches[0];
  const taggedCount = tagged.size;
  const untaggedCount = Math.max(0, filteredBatches.length - taggedCount);

  const flash = (msg: string) => setToast(msg);

  const toggleTag = (id: string) => {
    setTagged((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reverseTags = () => {
    setTagged((prev) => {
      const next = new Set<string>();
      filteredBatches.forEach((b) => {
        if (!prev.has(b.id)) next.add(b.id);
      });
      return next;
    });
    flash('Tags reversed');
  };

  const exportCsv = () => {
    const rows = [
      ['Batch Date', 'Batch #', 'Name', 'Status', 'Total', 'Unposted', 'Posted', 'Comments'],
      ...filteredBatches.map((b) => [
        b.batchDate, String(b.batchNumber), b.name, b.status,
        String(b.total), String(b.unposted), String(b.posted), b.comments,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contribution-batches-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    flash('CSV downloaded');
  };

  const openSelected = () => {
    if (selected) navigate(`/finance/counting?id=${selected.id}`);
    else flash('Select a batch to open');
  };

  const idsToActOn = () =>
    tagged.size ? Array.from(tagged) : (selected ? [selected.id] : []);

  const archiveSelected = async () => {
    if (!canEdit) { flash('You do not have permission to archive'); return; }
    const ids = idsToActOn();
    if (!ids.length) { flash('Select or tag a batch to archive'); return; }
    try {
      await Promise.all(ids.map((id) =>
        apiFetch('/api/vault?resource=finance&subResource=counting', {
          method: 'PATCH',
          userId,
          body: JSON.stringify({ id, status: 'Archived' }),
        })
      ));
      setTagged(new Set());
      flash(`${ids.length} batch(es) archived`);
      await load();
    } catch (e: any) {
      flash(e.message || 'Archive failed');
    }
  };

  const deleteSelected = async () => {
    if (!canEdit) { flash('You do not have permission to delete'); return; }
    const ids = idsToActOn();
    if (!ids.length) { flash('Select or tag a batch to delete'); return; }

    const locked = ids
      .map((id) => batches.find((b) => b.id === id))
      .filter((b) => b && (b.status === 'Posted' || b.apiStatus === 'Locked'));
    if (locked.length) {
      flash('Posted batches cannot be deleted. Use Archive in More instead.');
      return;
    }

    const label =
      ids.length === 1
        ? batches.find((b) => b.id === ids[0])?.name || 'this batch'
        : `${ids.length} batches`;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;

    try {
      await Promise.all(
        ids.map((id) =>
          apiFetch(`/api/vault?resource=finance&subResource=counting&id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
            userId,
          })
        )
      );
      setTagged((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      if (selectedId && ids.includes(selectedId)) setSelectedId('');
      flash(ids.length === 1 ? 'Batch deleted' : `${ids.length} batches deleted`);
      await load();
    } catch (e: any) {
      flash(e.message || 'Delete failed');
    }
  };

  const requestPost = () => {
    if (!canEdit) { flash('You do not have permission to post'); return; }
    if (tagged.size === 0) {
      setActiveTab('post');
      flash('Tag at least one batch, then post');
      return;
    }
    if (activeTab !== 'post') setActiveTab('post');
    setPostConfirmed(false);
    setShowPostConfirm(true);
  };

  const saveNewBatch = async () => {
    if (!canEdit) return;
    try {
      const data = await apiFetch('/api/vault?resource=finance&subResource=counting', {
        method: 'POST',
        userId,
        body: JSON.stringify({
          date: newBatch.batchDate,
          leadCounter: userName || 'Staff',
          name: newBatch.name.trim() || "Today's Giving",
          notes: newBatch.comments
            ? `Batch: ${newBatch.name.trim() || "Today's Giving"}\n${newBatch.comments}`
            : undefined,
        }),
      });
      if (data.ok && data.session) {
        setShowAddModal(false);
        setNewBatch({
          batchDate: new Date().toISOString().slice(0, 10),
          name: "Today's Giving",
          comments: '',
        });
        flash('Batch created — opening counting session');
        navigate(`/finance/counting?id=${data.session.id}`);
      }
    } catch (e: any) {
      flash(e.message || 'Failed to create batch');
    }
  };

  const postTagged = async () => {
    if (!postConfirmed || tagged.size === 0 || !canEdit) return;
    try {
      const ids = Array.from(tagged);
      for (const id of ids) {
        const batch = batches.find((b) => b.id === id);
        await apiFetch('/api/vault?resource=finance&subResource=counting', {
          method: 'PATCH',
          userId,
          body: JSON.stringify({
            id,
            status: 'Locked',
            grandTotal: batch?.total ?? 0,
          }),
        });
      }
      setTagged(new Set());
      setPostConfirmed(false);
      setShowPostConfirm(false);
      setBatchFilter('posted');
      setSearchParams({ filter: 'posted' });
      flash('Tagged batch(es) posted and finalized');
      await load();
    } catch (e: any) {
      flash(e.message || 'Post failed');
    }
  };

  const tabs: { id: ManagerTab; label: string; icon: React.ReactNode }[] = [
    { id: 'batches', label: 'Batches', icon: <Layers size={18} /> },
    { id: 'accounts', label: 'Accounts', icon: <BookOpen size={18} /> },
    { id: 'pledges', label: 'Pledges', icon: <Handshake size={18} /> },
    { id: 'post', label: 'Post', icon: <FileCheck size={18} /> },
  ];

  const btnPrimary =
    'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl bg-burgundy text-gold text-sm font-bold hover:bg-burgundy-dark transition-colors active:scale-[0.98]';
  const btnSecondary =
    'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl border border-burgundy/20 bg-white text-[#0d1a14] text-sm font-bold hover:bg-burgundy/5 transition-colors active:scale-[0.98]';

  return (
    <ResponsivePage maxWidth="max-w-[90rem]">
      <div className="flex flex-col gap-6 print:gap-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl md:text-4xl font-extrabold text-[#0d1a14] tracking-tight leading-none">
                Giving Batches<span className="text-gold">.</span>
              </h1>
              <AskAdminTitleLink />
            </div>
            <p className="text-gray-500 font-medium text-base mt-2 max-w-xl">
              Create, open, and post contribution batches.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
            <Link to="/finance/counting" className="text-burgundy hover:underline">
              Counting Session
            </Link>
            <Link to="/admin/servant-keeper" className="text-gray-500 hover:text-burgundy hover:underline">
              SK Sync
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm overflow-hidden border-l-[6px] border-l-burgundy">
          <div className="flex flex-wrap gap-1 px-3 pt-3 border-b border-gray-100 bg-[#F9F9F7]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 min-h-[44px] px-5 py-3 rounded-t-xl text-sm font-bold transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-burgundy border border-b-white border-gray-100 -mb-px shadow-sm'
                    : 'text-gray-400 hover:text-[#0d1a14]'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {(activeTab === 'batches' || activeTab === 'post') && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-4 border-b border-gray-100 bg-white print:hidden">
              <button
                type="button"
                onClick={() => {
                  if (!canEdit) { flash('You do not have permission to add batches'); return; }
                  setShowAddModal(true);
                }}
                className={btnPrimary}
              >
                <Plus size={18} strokeWidth={2.5} />
                New Batch
              </button>
              <button type="button" onClick={openSelected} className={btnSecondary}>
                <FolderOpen size={18} />
                Open
              </button>
              <button type="button" onClick={requestPost} className={btnSecondary}>
                <FileCheck size={18} />
                Post selected
                {taggedCount > 0 && (
                  <span className="ml-1 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-burgundy text-gold text-xs font-black flex items-center justify-center">
                    {taggedCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={deleteSelected}
                disabled={!canEdit || (!selected && taggedCount === 0)}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm font-bold hover:bg-rose-100 transition-colors active:scale-[0.98] disabled:opacity-40"
              >
                <Trash2 size={18} />
                Delete
              </button>

              <div className="relative ml-auto" ref={moreRef}>
                <button
                  type="button"
                  onClick={() => setMoreOpen((o) => !o)}
                  className={`${btnSecondary} px-4`}
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                >
                  <MoreHorizontal size={18} />
                  More
                  <ChevronDown size={16} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
                </button>
                {moreOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-48 rounded-xl border border-gray-100 bg-white shadow-lg py-1 z-20"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#0d1a14] hover:bg-burgundy/5 min-h-[44px]"
                      onClick={() => { window.print(); setMoreOpen(false); }}
                    >
                      <Printer size={16} /> Print
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#0d1a14] hover:bg-burgundy/5 min-h-[44px]"
                      onClick={() => { exportCsv(); setMoreOpen(false); }}
                    >
                      <Download size={16} /> Export CSV
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#0d1a14] hover:bg-burgundy/5 min-h-[44px]"
                      onClick={async () => { await archiveSelected(); setMoreOpen(false); }}
                    >
                      <Trash2 size={16} /> Archive
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-24 text-gray-400">
              <Loader2 className="animate-spin text-burgundy" size={22} />
              <span className="text-sm font-medium">Loading contribution data…</span>
            </div>
          ) : (
            <>
              {activeTab === 'batches' && (
                <BatchesPanel
                  batchFilter={batchFilter}
                  setBatchFilter={(f) => {
                    setBatchFilter(f);
                    setSearchParams(f === 'unposted' ? {} : { filter: f });
                  }}
                  filteredBatches={filteredBatches}
                  selected={selected}
                  selectedId={selected?.id}
                  setSelectedId={setSelectedId}
                  tagged={tagged}
                  toggleTag={toggleTag}
                  taggedCount={taggedCount}
                  untaggedCount={untaggedCount}
                />
              )}
              {activeTab === 'accounts' && <AccountsPanel funds={funds} />}
              {activeTab === 'pledges' && <PledgesPanel pledges={pledges} />}
              {activeTab === 'post' && (
                <PostPanel
                  filteredBatches={filteredBatches.filter((b) => b.status !== 'Posted')}
                  tagged={tagged}
                  toggleTag={toggleTag}
                  setSelectedId={setSelectedId}
                  selectedId={selectedId}
                  onRequestPost={requestPost}
                  reverseTags={reverseTags}
                />
              )}
            </>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 bg-[#F9F9F7] border-t border-gray-100 text-xs font-medium text-gray-400">
            <span>{lastSynced ? `Last synced ${lastSynced}` : 'Not synced'}</span>
            <span className="text-[#0d1a14] font-semibold">{userName || 'Staff'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
          {[
            { to: '/finance/counting', label: 'Counting Session', sub: 'Enter & verify gifts' },
            { to: '/fund-management', label: 'Fund Accounts', sub: 'Chart of giving funds' },
            { to: '/fundraisers', label: 'Fundraisers', sub: 'Gifts, pledges & who owes' },
            { to: '/bank-deposits', label: 'Bank Deposits', sub: 'Deposit & verify' },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group rounded-2xl border border-gray-100 bg-white p-4 border-l-4 border-l-gold hover:shadow-md transition-all"
            >
              <p className="text-sm font-black text-[#0d1a14] group-hover:text-burgundy">{item.label}</p>
              <p className="text-xs text-gray-400 font-medium mt-0.5">{item.sub}</p>
            </Link>
          ))}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0d1a14]/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-[#F9F9F7]">
              <h2 className="text-base font-black text-[#0d1a14]">Add New Batch</h2>
              <button type="button" onClick={() => setShowAddModal(false)} className="p-2.5 min-h-[44px] min-w-[44px] rounded-lg hover:bg-white text-gray-400 flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <label className="block space-y-2">
                <span className="text-xs font-bold text-gray-500">Batch Date</span>
                <div className="relative">
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gold" />
                  <input
                    type="date"
                    value={newBatch.batchDate}
                    onChange={(e) => setNewBatch((f) => ({ ...f, batchDate: e.target.value }))}
                    className="w-full min-h-[44px] pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-[#0d1a14] focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy"
                  />
                </div>
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-bold text-gray-500">Batch Name</span>
                <input
                  type="text"
                  value={newBatch.name}
                  onChange={(e) => setNewBatch((f) => ({ ...f, name: e.target.value }))}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-[#0d1a14] focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-bold text-gray-500">Comments</span>
                <textarea
                  rows={3}
                  value={newBatch.comments}
                  onChange={(e) => setNewBatch((f) => ({ ...f, comments: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-[#0d1a14] focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy resize-none"
                />
              </label>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-[#F9F9F7]">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="min-h-[44px] px-5 rounded-xl text-sm font-bold text-gray-500 hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveNewBatch}
                className="min-h-[44px] px-5 rounded-xl bg-burgundy text-gold text-sm font-bold hover:bg-burgundy-dark"
              >
                Save & Open
              </button>
            </div>
          </div>
        </div>
      )}

      {showPostConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0d1a14]/40 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden max-h-[85vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-100 bg-[#F9F9F7]">
              <h2 className="text-base font-black text-[#0d1a14]">Post and Finalize</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-xl bg-gold-cream/80 border border-gold/20 p-4 text-sm text-[#0d1a14]">
                <p className="font-bold text-burgundy mb-2">Before you post</p>
                <ol className="list-decimal list-inside space-y-1 text-sm font-medium text-gray-600">
                  <li>Verify batch date and totals</li>
                  <li>Tag only the batches you intend to post</li>
                  <li>Confirm below — this locks sessions and posts the ledger</li>
                </ol>
              </div>
              <p className="text-sm font-medium text-gray-600">
                You are about to post <span className="font-black text-[#0d1a14]">{tagged.size}</span> tagged batch(es).
              </p>
              <label className="flex items-center gap-3 text-sm font-bold text-[#0d1a14] cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={postConfirmed}
                  onChange={(e) => setPostConfirmed(e.target.checked)}
                  className="rounded border-gray-300 text-burgundy focus:ring-burgundy w-5 h-5"
                />
                Yes, post the tagged batch(es).
              </label>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-[#F9F9F7]">
              <button
                type="button"
                onClick={() => { setShowPostConfirm(false); setPostConfirmed(false); }}
                className="min-h-[44px] px-5 rounded-xl text-sm font-bold text-gray-500"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!postConfirmed}
                onClick={postTagged}
                className="min-h-[44px] px-5 rounded-xl bg-burgundy text-gold text-sm font-bold disabled:opacity-40 hover:bg-burgundy-dark"
              >
                Post and Finalize
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#0d1a14] text-gold text-sm font-bold shadow-xl">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}
    </ResponsivePage>
  );
};

export default ContributionManagerPage;

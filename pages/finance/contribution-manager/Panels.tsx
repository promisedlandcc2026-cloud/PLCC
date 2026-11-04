import React from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';
import BatchTable from './BatchTable';
import {
  BatchFilter,
  ContributionBatch,
  FundAccount,
  PledgeAccount,
  formatBatchDate,
} from './types';

export function BatchesPanel({
  batchFilter,
  setBatchFilter,
  filteredBatches,
  selected,
  selectedId,
  setSelectedId,
  tagged,
  toggleTag,
  taggedCount,
  untaggedCount,
}: {
  batchFilter: BatchFilter;
  setBatchFilter: (f: BatchFilter) => void;
  filteredBatches: ContributionBatch[];
  selected?: ContributionBatch;
  selectedId?: string;
  setSelectedId: (id: string) => void;
  tagged: Set<string>;
  toggleTag: (id: string) => void;
  taggedCount: number;
  untaggedCount: number;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 md:px-5 py-4 border-b border-gray-50 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-gray-600">
            <span className="text-xs font-bold text-gray-400">Show</span>
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value as BatchFilter)}
              className="min-h-[44px] rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-[#0d1a14] bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/20"
            >
              <option value="unposted">Unposted</option>
              <option value="posted">Posted</option>
              <option value="all">All batches</option>
            </select>
          </label>
          {selected && (
            <p className="text-sm font-medium text-gray-500 sm:pt-5 truncate">
              Selected:{' '}
              <span className="font-bold text-[#0d1a14]">
                {formatBatchDate(selected.batchDate)} · {selected.name}
              </span>
            </p>
          )}
        </div>
        <p className="text-sm text-gray-400 font-medium whitespace-nowrap sm:pt-5">
          {filteredBatches.length} listed
          {taggedCount > 0 && (
            <>
              {' · '}
              <span className="text-burgundy font-semibold">{taggedCount} tagged</span>
            </>
          )}
          {untaggedCount > 0 && taggedCount > 0 && (
            <span className="text-gray-300"> · {untaggedCount} untagged</span>
          )}
        </p>
      </div>
      <BatchTable
        batches={filteredBatches}
        selectedId={selectedId}
        tagged={tagged}
        onSelect={setSelectedId}
        onToggleTag={toggleTag}
      />
    </div>
  );
}

export function AccountsPanel({ funds }: { funds: FundAccount[] }) {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-[#0d1a14]">Accounts</h3>
          <p className="text-sm text-gray-400 font-medium">Contribution funds used when posting gifts</p>
        </div>
        <Link
          to="/fund-management"
          className="text-sm font-semibold text-burgundy hover:underline min-h-[44px] inline-flex items-center"
        >
          Fund Management →
        </Link>
      </div>
      <div className="rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-[#F9F9F7] text-xs font-bold text-gray-400 border-b border-gray-100">
          Active accounts
        </div>
        {funds.length === 0 ? (
          <p className="px-4 py-12 text-center text-gray-400 font-medium text-sm">
            No funds yet. Create them in Fund Management.
          </p>
        ) : (
          <ul className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
            {funds.map((fund, i) => (
              <li
                key={fund.id}
                className={`flex items-center gap-3 px-4 py-3.5 ${i % 2 === 0 ? 'bg-white' : 'bg-[#fcfcfc]'}`}
              >
                <div className="w-10 h-10 rounded-xl bg-burgundy/5 text-burgundy flex items-center justify-center text-sm font-black">
                  $
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#0d1a14] truncate">{fund.name}</p>
                  {fund.description && (
                    <p className="text-xs text-gray-400 truncate">{fund.description}</p>
                  )}
                </div>
                {typeof fund.balance === 'number' && fund.balance > 0 && (
                  <span className="text-sm font-black text-burgundy tabular-nums">
                    {formatCurrency(fund.balance)}
                  </span>
                )}
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-md ${
                    fund.is_active !== false
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {fund.is_active !== false ? 'Active' : 'Inactive'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function PledgesPanel({ pledges }: { pledges: PledgeAccount[] }) {
  const totals = pledges.reduce(
    (acc, p) => ({
      goal: acc.goal + p.goal,
      pledged: acc.pledged + p.pledged,
      received: acc.received + p.received,
      remaining: acc.remaining + p.remaining,
    }),
    { goal: 0, pledged: 0, received: 0, remaining: 0 }
  );

  return (
    <div className="flex flex-col">
      <div className="px-4 md:px-5 py-4 border-b border-gray-50 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-black text-[#0d1a14]">Pledges</h3>
          <p className="text-sm text-gray-400 font-medium">Active pledge campaigns</p>
        </div>
        <Link
          to="/fundraisers"
          className="text-sm font-semibold text-burgundy hover:underline min-h-[44px] inline-flex items-center"
        >
          Campaigns →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-[#F9F9F7] text-xs font-bold text-gray-400 border-b border-gray-100">
              <th className="px-4 py-3 text-left">Campaign</th>
              <th className="px-4 py-3 text-right">Goal</th>
              <th className="px-4 py-3 text-right">Raised</th>
              <th className="px-4 py-3 text-right">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {pledges.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-16 text-center text-gray-400 font-medium">
                  No active pledge campaigns
                </td>
              </tr>
            ) : (
              pledges.map((p, i) => (
                <tr key={p.id} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-[#fcfcfc]'}`}>
                  <td className="px-4 py-3.5 font-bold text-[#0d1a14]">
                    <div>{p.name}</div>
                    {p.description && (
                      <div className="text-xs text-gray-400 font-medium mt-0.5 truncate max-w-xs">{p.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums font-semibold">{formatCurrency(p.goal)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums font-black text-burgundy">
                    {formatCurrency(p.received)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-amber-800">
                    {formatCurrency(p.remaining)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {pledges.length > 0 && (
            <tfoot>
              <tr className="bg-[#F9F9F7] font-black text-[#0d1a14] border-t-2 border-burgundy/10">
                <td className="px-4 py-3 text-xs font-bold text-gray-400">Totals</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.goal)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-burgundy">
                  {formatCurrency(totals.received)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.remaining)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export function PostPanel({
  filteredBatches,
  tagged,
  toggleTag,
  selectedId,
  setSelectedId,
  onRequestPost,
  reverseTags,
}: {
  filteredBatches: ContributionBatch[];
  tagged: Set<string>;
  toggleTag: (id: string) => void;
  selectedId: string;
  setSelectedId: (id: string) => void;
  onRequestPost: () => void;
  reverseTags: () => void;
}) {
  const selected = filteredBatches.find((b) => b.id === selectedId) || filteredBatches[0];

  return (
    <div className="flex flex-col">
      <div className="px-4 md:px-5 py-4 border-b border-gray-50 bg-gold-cream/50 space-y-2">
        <p className="text-sm font-bold text-burgundy">Before you post</p>
        <ol className="grid sm:grid-cols-2 gap-1.5 text-sm font-medium text-[#0d1a14]/70 list-decimal list-inside">
          <li>Verify the date of each tagged batch</li>
          <li>Tag the batches you want to post</li>
          <li>Confirm in the dialog before finalizing</li>
          <li>This locks sessions and posts the ledger</li>
        </ol>
      </div>

      <div className="flex flex-wrap gap-2 px-4 md:px-5 py-3 border-b border-gray-50 print:hidden">
        <button
          type="button"
          onClick={reverseTags}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold hover:bg-emerald-100"
        >
          <RefreshCw size={16} /> Reverse tags
        </button>
      </div>

      <div className="px-4 md:px-5 py-3 text-sm font-medium text-gray-500 border-b border-gray-50 flex flex-wrap gap-x-4 gap-y-1">
        {selected && (
          <span>
            Selected:{' '}
            <span className="font-bold text-[#0d1a14]">
              {formatBatchDate(selected.batchDate)} — {selected.name}
            </span>
          </span>
        )}
        <span>
          {filteredBatches.length} listed · {tagged.size} tagged
        </span>
      </div>

      <div className="max-h-[360px] overflow-y-auto">
        <BatchTable
          batches={filteredBatches}
          selectedId={selectedId}
          tagged={tagged}
          onSelect={setSelectedId}
          onToggleTag={toggleTag}
          showCreatedBy
          mobileCards={false}
        />
      </div>

      <div className="px-4 md:px-5 py-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-end gap-4 bg-[#F9F9F7]">
        <button
          type="button"
          disabled={tagged.size === 0}
          onClick={onRequestPost}
          className="min-h-[44px] px-6 py-3 rounded-xl bg-burgundy text-gold text-sm font-bold disabled:opacity-40 hover:bg-burgundy-dark transition-all active:scale-[0.98]"
        >
          Post and Finalize
        </button>
      </div>
    </div>
  );
}

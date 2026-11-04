import React from 'react';
import { formatCurrency } from '../../../utils/formatters';
import { ContributionBatch, formatBatchDate } from './types';

interface BatchTableProps {
  batches: ContributionBatch[];
  selectedId?: string;
  tagged: Set<string>;
  onSelect: (id: string) => void;
  onToggleTag: (id: string) => void;
  showCreatedBy?: boolean;
  mobileCards?: boolean;
}

const statusClass = (status: ContributionBatch['status']) => {
  if (status === 'Posted') return 'bg-emerald-50 text-emerald-700';
  if (status === 'Empty') return 'bg-gray-100 text-gray-500';
  return 'bg-gold-cream text-amber-800';
};

const BatchTable: React.FC<BatchTableProps> = ({
  batches,
  selectedId,
  tagged,
  onSelect,
  onToggleTag,
  showCreatedBy = false,
  mobileCards = true,
}) => {
  const totals = {
    amount: batches.reduce((s, b) => s + b.total, 0),
  };

  const colCount = showCreatedBy ? 6 : 5;

  return (
    <>
      {mobileCards && (
        <div className="md:hidden space-y-3 p-4">
          {batches.length === 0 ? (
            <p className="text-center text-gray-400 font-medium py-12 text-sm">No batches to display</p>
          ) : (
            batches.map((batch) => (
              <button
                key={batch.id}
                type="button"
                onClick={() => onSelect(batch.id)}
                className={`w-full text-left rounded-2xl border p-4 transition-all min-h-[44px] ${
                  batch.id === selectedId
                    ? 'border-burgundy/30 bg-burgundy/[0.06]'
                    : 'border-gray-100 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-[#0d1a14] text-base truncate">{batch.name}</p>
                    <p className="text-sm text-gray-400 font-medium mt-0.5">
                      {formatBatchDate(batch.batchDate)}
                      {batch.batchNumber ? ` · #${batch.batchNumber}` : ''}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 shrink-0 min-h-[44px]" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={tagged.has(batch.id)}
                      onChange={() => onToggleTag(batch.id)}
                      className="rounded border-gray-300 text-burgundy focus:ring-burgundy w-5 h-5"
                    />
                    <span className="text-xs font-bold text-gray-400">Tag</span>
                  </label>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-bold ${statusClass(batch.status)}`}>
                    {batch.status}
                  </span>
                  <span className="font-black text-burgundy tabular-nums text-base">{formatCurrency(batch.total)}</span>
                </div>
              </button>
            ))
          )}
          {batches.length > 0 && (
            <div className="rounded-xl bg-[#F9F9F7] px-4 py-3 flex justify-between text-sm font-bold text-[#0d1a14]">
              <span className="text-xs text-gray-400">Totals</span>
              <span className="text-burgundy">{formatCurrency(totals.amount)}</span>
            </div>
          )}
        </div>
      )}

      <div className={`${mobileCards ? 'hidden md:block' : ''} overflow-x-auto`}>
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="bg-[#F9F9F7] text-xs font-bold text-gray-400 border-b border-gray-100">
              <th className="px-4 py-3.5 w-14 text-center">Tag</th>
              <th className="px-4 py-3.5">Date</th>
              <th className="px-4 py-3.5">Name</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5 text-right">Total</th>
              {showCreatedBy && <th className="px-4 py-3.5">Created by</th>}
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-16 text-center text-gray-400 font-medium">
                  No batches to display
                </td>
              </tr>
            ) : (
              batches.map((batch, i) => (
                <tr
                  key={batch.id}
                  onClick={() => onSelect(batch.id)}
                  className={`border-b border-gray-50 cursor-pointer transition-colors ${
                    batch.id === selectedId
                      ? 'bg-burgundy/[0.07]'
                      : i % 2 === 0
                        ? 'bg-white hover:bg-gold-cream/40'
                        : 'bg-[#fcfcfc] hover:bg-gold-cream/40'
                  }`}
                >
                  <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={tagged.has(batch.id)}
                      onChange={() => onToggleTag(batch.id)}
                      className="rounded border-gray-300 text-burgundy focus:ring-burgundy w-5 h-5"
                    />
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-[#0d1a14] whitespace-nowrap">
                    {formatBatchDate(batch.batchDate)}
                    <span className="block text-xs text-gray-400 font-medium mt-0.5">#{batch.batchNumber}</span>
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-[#0d1a14]">
                    <div>{batch.name}</div>
                    {batch.comments && (
                      <div className="text-xs text-gray-400 font-medium mt-0.5 truncate max-w-[220px]">
                        {batch.comments}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-bold ${statusClass(batch.status)}`}>
                      {batch.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-black text-[#0d1a14] tabular-nums">
                    {formatCurrency(batch.total)}
                  </td>
                  {showCreatedBy && (
                    <td className="px-4 py-3.5 text-gray-500 text-sm">{batch.createdBy || '—'}</td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-[#F9F9F7] border-t-2 border-burgundy/10 font-black text-[#0d1a14]">
              <td colSpan={4} className="px-4 py-3.5 text-xs font-bold text-gray-400">
                Totals
              </td>
              <td className="px-4 py-3.5 text-right tabular-nums text-burgundy">{formatCurrency(totals.amount)}</td>
              {showCreatedBy && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
};

export default BatchTable;

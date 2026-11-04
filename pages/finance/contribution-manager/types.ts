export type ManagerTab = 'batches' | 'accounts' | 'pledges' | 'post';
export type BatchFilter = 'unposted' | 'posted' | 'all';

export interface ContributionBatch {
  id: string;
  batchDate: string;
  batchNumber: number;
  name: string;
  status: 'Unposted' | 'Posted' | 'Empty';
  apiStatus: 'Draft' | 'Locked' | 'Archived' | string;
  comments: string;
  total: number;
  unposted: number;
  posted: number;
  createdBy?: string;
}

export interface FundAccount {
  id: string;
  name: string;
  description?: string;
  balance?: number;
  is_active: boolean;
}

export interface PledgeAccount {
  id: string;
  name: string;
  goal: number;
  pledged: number;
  received: number;
  remaining: number;
  description?: string;
}

export const formatBatchDate = (iso: string) => {
  if (!iso || iso.length < 10) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${m}/${d}/${y}`;
};

export function mapSessionToBatch(s: any, index: number): ContributionBatch {
  const apiStatus = String(s.status || 'Draft');
  const total = Number(s.grand_total) || 0;
  const isPosted = apiStatus === 'Locked' || apiStatus === 'Archived';
  const nameFromNotes = typeof s.notes === 'string' && s.notes.startsWith('Batch:')
    ? s.notes.replace(/^Batch:\s*/i, '').trim()
    : '';

  return {
    id: s.id,
    batchDate: (s.session_date || s.created_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    batchNumber: index + 1,
    name: nameFromNotes || s.lead_counter_name || "Today's Giving",
    status: isPosted ? 'Posted' : total > 0 ? 'Unposted' : 'Empty',
    apiStatus,
    comments: nameFromNotes ? '' : (s.notes || ''),
    total,
    unposted: isPosted ? 0 : 1,
    posted: isPosted ? 1 : 0,
    createdBy: s.lead_counter_name || 'Staff',
  };
}


import { parseAmount } from './formatters';

export interface Transaction {
  id: string;
  fundName?: string;
  fund?: string;
  amount: number | string;
}

export interface FundStat {
  name: string;
  count: number;
  total: number;
}

export function buildFundSummary(transactions: Transaction[]) {
  if (!transactions || transactions.length === 0) {
    return {
      totalCount: 0,
      uniqueFunds: 0,
      top3: [],
      allSorted: []
    };
  }

  const statsMap: Record<string, FundStat> = {};

  transactions.forEach(tx => {
    const name = tx.fundName || tx.fund || 'Uncategorized';
    const amount = parseAmount(tx.amount);
    
    if (!statsMap[name]) {
      statsMap[name] = { name, count: 0, total: 0 };
    }
    statsMap[name].count += 1;
    statsMap[name].total += amount;
  });

  const allSorted = Object.values(statsMap).sort((a, b) => {
    // Sort by count descending
    if (b.count !== a.count) return b.count - a.count;
    // Tie-break with total amount descending
    return b.total - a.total;
  });

  return {
    totalCount: transactions.length,
    uniqueFunds: allSorted.length,
    top3: allSorted.slice(0, 3),
    allSorted
  };
}

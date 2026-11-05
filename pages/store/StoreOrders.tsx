import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, ShoppingBag } from 'lucide-react';
import { useNav } from '../../App';
import { apiFetch } from '../../lib/api';
import { hasPermission } from '../../lib/permissions';
import { useStoreOrderCue } from '../../lib/useStoreOrderCue';
import AccessDenied from '../../components/Layout/AccessDenied';

import { formatCurrency } from '../../utils/formatters';
type StoreOrderItem = {
  id?: string;
  product_id: string;
  product_name: string;
  size: string;
  color?: string | null;
  quantity: number;
  unit_price_cents: number;
};

type StoreOrder = {
  id: string;
  customer_name: string;
  email: string;
  phone: string;
  fulfillment: string;
  payment_method: string;
  status: string;
  total_cents: number;
  created_at: string;
  paid_at?: string | null;
  paid_by?: string | null;
  items?: StoreOrderItem[];
};

type StatusFilter = 'pending_payment' | 'paid' | 'all';

function formatMoney(cents: number) {
  return formatCurrency(cents / 100);
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusBadge(status: string) {
  const base = 'inline-flex px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide';
  if (status === 'paid') return `${base} bg-emerald-100 text-emerald-800`;
  if (status === 'pending_payment') return `${base} bg-amber-100 text-amber-800`;
  if (status === 'awaiting_pickup') return `${base} bg-sky-100 text-sky-800`;
  return `${base} bg-slate-100 text-slate-700`;
}

const StoreOrdersPage: React.FC = () => {
  const { userRole, userId } = useNav();
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('pending_payment');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const allowed = hasPermission(userRole as any, undefined, '/store/orders');
  const { showCue: showStoreHint, dismiss: dismissStoreCue, refresh: refreshStoreCue } =
    useStoreOrderCue(allowed, userId);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ ok: boolean; orders: StoreOrder[] }>(
        `/api/vault?resource=store-orders&status=${encodeURIComponent(filter)}`,
        { userId }
      );
      setOrders(data.orders || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load store orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, filter, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const markPaid = async (id: string) => {
    if (!window.confirm('Confirm payment received and mark this order as PAID?')) return;
    setMarkingId(id);
    try {
      await apiFetch('/api/vault?resource=store-orders', {
        method: 'PATCH',
        userId,
        body: JSON.stringify({ id }),
      });
      await load();
      await refreshStoreCue();
    } catch (err: any) {
      alert(err.message || 'Failed to mark paid');
    } finally {
      setMarkingId(null);
    }
  };

  if (!allowed) {
    return <AccessDenied />;
  }

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'pending_payment', label: 'Pending' },
    { key: 'paid', label: 'Paid' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 text-slate-800">
            <ShoppingBag size={28} className="text-amber-700" />
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Store Orders</h1>
          </div>
          <p className="text-base text-slate-500 mt-2">
            Confirm MTN / Airtel / Sendwave payments and mark orders paid.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-base border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="flex gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              if (f.key === 'all' && showStoreHint) dismissStoreCue();
              setFilter(f.key);
            }}
            className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide rounded-lg border ${
              filter === f.key
                ? 'bg-slate-900 text-white border-slate-900'
                : f.key === 'all' && showStoreHint && filter !== 'all'
                  ? 'bg-gold/30 text-burgundy border-gold ring-2 ring-gold/50 animate-pulse shadow-md'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {f.label}
            {f.key === 'all' && showStoreHint && filter !== 'all' && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-gold text-burgundy">
                New
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-base px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-base text-slate-500 py-12 text-center">Loading orders…</div>
      ) : orders.length === 0 ? (
        <div className="text-base text-slate-500 py-12 text-center border border-dashed border-slate-200 rounded-xl">
          No orders for this filter.
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="min-w-full text-base">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4 font-semibold">Date</th>
                <th className="px-5 py-4 font-semibold">Customer</th>
                <th className="px-5 py-4 font-semibold">Payment</th>
                <th className="px-5 py-4 font-semibold">Items</th>
                <th className="px-5 py-4 font-semibold">Total</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => {
                const canMark =
                  order.status === 'pending_payment' || order.status === 'awaiting_pickup';

                return (
                  <tr key={order.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-5 py-4 whitespace-nowrap text-slate-700">
                      {formatDate(order.created_at)}
                      <div className="font-mono text-sm text-slate-400 mt-1">
                        {order.id.slice(0, 8).toUpperCase()}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900 text-lg leading-snug">
                        {order.customer_name}
                      </div>
                      <div className="text-slate-500 text-sm mt-1">{order.email}</div>
                      <div className="text-slate-500 text-sm">{order.phone}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="capitalize text-slate-800 font-medium">{order.payment_method}</div>
                      <div className="text-sm text-slate-500 capitalize mt-0.5">{order.fulfillment}</div>
                      {order.paid_by && (
                        <div className="text-sm text-slate-400 mt-1">by {order.paid_by}</div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-700 min-w-[220px]">
                      <ul className="space-y-1.5">
                        {(order.items || []).map((item, idx) => (
                          <li key={item.id || idx} className="text-sm leading-snug">
                            {item.product_name}
                            {item.color ? ` / ${item.color}` : ''} / {item.size} × {item.quantity}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-900 text-lg whitespace-nowrap">
                      {formatMoney(order.total_cents)}
                    </td>
                    <td className="px-5 py-4">
                      <span className={statusBadge(order.status)}>
                        {order.status.replace(/_/g, ' ')}
                      </span>
                      {order.paid_at && (
                        <div className="text-sm text-slate-400 mt-1.5">{formatDate(order.paid_at)}</div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {canMark ? (
                        <button
                          type="button"
                          disabled={markingId === order.id}
                          onClick={() => markPaid(order.id)}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-burgundy text-gold text-sm font-bold shadow-lg shadow-burgundy/20 border-b-2 border-gold/40 hover:bg-[#192e24] active:scale-95 transition-all disabled:opacity-50"
                        >
                          <CheckCircle2 size={16} className="text-gold" />
                          {markingId === order.id ? 'Saving…' : 'Mark Paid'}
                        </button>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default StoreOrdersPage;

import { getSupabaseAdmin, requireAuth } from '../_utils/auth.js';
import {
  isStoreOrdersWebhookAuthorized,
  notifyStoreOrderEmails,
} from '../_utils/storeOrderNotify.js';

function staffLabel(auth: { user: { id: string; email?: string | null; name?: string } | null }) {
  return auth.user?.email || auth.user?.name || auth.user?.id || 'vault-staff';
}

async function handleWebhookNotify(req: any, res: any, supabaseAdmin: any) {
  const body = req.body || {};
  const orderId = body.id || body.orderId || body.order_id;
  let order = body.order || null;

  if (!order && orderId && typeof orderId === 'string') {
    const { data, error } = await supabaseAdmin
      .from('store_orders')
      .select(
        'id, customer_name, email, phone, payment_method, fulfillment, status, total_cents, created_at'
      )
      .eq('id', orderId)
      .maybeSingle();
    if (error) {
      console.error('[store-orders webhook lookup]', error);
      return res.status(500).json({ error: error.message });
    }
    order = data;
  }

  if (!order && (body.customer_name || body.total_cents != null)) {
    order = body;
  }

  if (!order) {
    return res.status(400).json({
      error: 'Order payload or id required',
      hint: 'POST { id } or full order fields with X-Store-Orders-Secret',
    });
  }

  try {
    const result = await notifyStoreOrderEmails(order);
    return res.status(200).json({ ok: true, notify: result });
  } catch (err: any) {
    console.error('[store-orders notify]', err);
    return res.status(500).json({ error: err.message || 'Notify failed' });
  }
}

export const handleStoreOrders = async (req: any, res: any) => {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });

  // Store / Supabase webhook: notify staff (no Vault user JWT required)
  if (req.method === 'POST' && req.query?.action === 'notify') {
    if (!isStoreOrdersWebhookAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized: invalid store webhook secret' });
    }
    return handleWebhookNotify(req, res, supabaseAdmin);
  }

  const auth = await requireAuth(req, res, supabaseAdmin);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      const statusFilter = String(req.query.status || 'pending_payment').toLowerCase();
      const limit = Math.min(parseInt(String(req.query.limit || '100'), 10) || 100, 500);

      let q = supabaseAdmin
        .from('store_orders')
        .select(
          `
          id,
          customer_name,
          email,
          phone,
          fulfillment,
          payment_method,
          status,
          total_cents,
          created_at,
          paid_at,
          paid_by,
          items:store_order_items (
            id,
            product_id,
            product_name,
            size,
            color,
            quantity,
            unit_price_cents
          )
        `
        )
        .order('created_at', { ascending: false })
        .limit(limit);

      if (statusFilter === 'actionable') {
        q = q.in('status', ['pending_payment', 'awaiting_pickup']);
      } else if (statusFilter && statusFilter !== 'all') {
        q = q.eq('status', statusFilter);
      }

      const { data, error } = await q;
      if (error) {
        console.error('[store-orders GET]', error);
        return res.status(500).json({
          error: error.message,
          hint:
            error.message?.includes('relation') || error.code === 'PGRST205'
              ? 'Ensure store_orders / store_order_items exist and are exposed to the API schema.'
              : undefined,
        });
      }

      return res.status(200).json({ ok: true, orders: data || [] });
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const orderId = req.body?.id || req.body?.orderId || req.query?.id;
      if (!orderId || typeof orderId !== 'string') {
        return res.status(400).json({ error: 'Order id is required' });
      }

      const paidBy = staffLabel(auth);

      const { data, error } = await supabaseAdmin
        .from('store_orders')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          paid_by: paidBy,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .in('status', ['pending_payment', 'awaiting_pickup'])
        .select(
          'id, customer_name, email, phone, payment_method, status, total_cents, paid_at, paid_by, created_at'
        )
        .maybeSingle();

      if (error) {
        console.error('[store-orders mark paid]', error);
        return res.status(500).json({ error: error.message });
      }
      if (!data) {
        return res.status(404).json({ error: 'Order not found or already paid' });
      }

      return res.status(200).json({ ok: true, order: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[handleStoreOrders]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
};

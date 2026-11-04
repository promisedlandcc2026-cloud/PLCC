import { getResend } from './deps.js';
import { vaultFrom } from './emailFrom.js';

export type StoreOrderNotifyPayload = {
  id?: string;
  customer_name?: string;
  email?: string;
  phone?: string;
  payment_method?: string;
  fulfillment?: string;
  status?: string;
  total_cents?: number;
  created_at?: string;
};

function parseNotifyEmails(): string[] {
  const raw = process.env.STORE_ORDER_NOTIFY_EMAILS || '';
  return raw
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

function formatMoney(cents?: number) {
  if (typeof cents !== 'number' || Number.isNaN(cents)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

/**
 * Email store staff about a new order. No-op when STORE_ORDER_NOTIFY_EMAILS is unset.
 * Returns { sent: false, reason } when skipped; { sent: true, ids } when dispatched.
 */
export async function notifyStoreOrderEmails(order: StoreOrderNotifyPayload): Promise<{
  sent: boolean;
  reason?: string;
  ids?: (string | undefined)[];
}> {
  const recipients = parseNotifyEmails();
  if (recipients.length === 0) {
    return { sent: false, reason: 'STORE_ORDER_NOTIFY_EMAILS not configured' };
  }

  const resend = await getResend();
  if (!resend) {
    return { sent: false, reason: 'Email service unavailable (RESEND_API_KEY)' };
  }

  const vaultUrl =
    process.env.STORE_ORDERS_VAULT_URL ||
    process.env.VITE_APP_URL ||
    'https://plcc-opal.vercel.app';
  const ordersLink = `${vaultUrl.replace(/\/$/, '')}/#/store/orders`;

  const name = order.customer_name || 'Customer';
  const payment = order.payment_method || 'unknown';
  const total = formatMoney(order.total_cents);
  const orderId = order.id ? String(order.id).slice(0, 8).toUpperCase() : 'NEW';

  const html = `
    <h2>New PLCC Store order</h2>
    <p>A customer placed an order that needs Cash App / Zelle confirmation.</p>
    <ul>
      <li><strong>Order:</strong> ${orderId}</li>
      <li><strong>Customer:</strong> ${name}</li>
      <li><strong>Email:</strong> ${order.email || '—'}</li>
      <li><strong>Phone:</strong> ${order.phone || '—'}</li>
      <li><strong>Payment:</strong> ${payment}</li>
      <li><strong>Fulfillment:</strong> ${order.fulfillment || '—'}</li>
      <li><strong>Total:</strong> ${total}</li>
      <li><strong>Status:</strong> ${order.status || 'pending_payment'}</li>
    </ul>
    <p><a href="${ordersLink}">Open Store Orders in PLCC Vault</a></p>
  `;

  const { data, error } = await resend.emails.send({
    from: vaultFrom('Promised Land Christian Center'),
    to: recipients,
    subject: `PLCC Store: new order ${orderId} — ${total}`,
    html,
  });

  if (error) {
    console.error('[storeOrderNotify]', error);
    throw new Error(error.message || 'Failed to send store order email');
  }

  return { sent: true, ids: [data?.id] };
}

export function isStoreOrdersWebhookAuthorized(req: {
  headers?: Record<string, string | string[] | undefined>;
}): boolean {
  const secret = process.env.STORE_ORDERS_WEBHOOK_SECRET || '';
  if (!secret) return false;

  const headers = req.headers || {};
  const headerSecret =
    headers['x-store-orders-secret'] ||
    headers['X-Store-Orders-Secret'] ||
    headers['x-awc-store-secret'];
  const value = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;
  if (value && value === secret) return true;

  const auth = headers.authorization || headers.Authorization;
  const authValue = Array.isArray(auth) ? auth[0] : auth;
  if (authValue?.startsWith('Bearer ') && authValue.slice(7) === secret) return true;

  return false;
}

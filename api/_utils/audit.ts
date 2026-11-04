import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

const getSupabase = () => {
    if (!supabaseUrl || !supabaseServiceKey) return null;
    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false }
    });
};

function firstHeader(value: unknown): string {
    if (Array.isArray(value)) return String(value[0] || '').trim();
    return String(value || '').trim();
}

/** Prefer explicit userId, then request auth context / headers. */
export function resolveAuditUserId(userId?: string | null, req?: any): string | null {
    const explicit = String(userId || '').trim();
    if (explicit) return explicit;

    const fromReq =
        String(req?.awcAuthUserId || req?.authUserId || req?.user?.id || '').trim() ||
        firstHeader(req?.headers?.['x-user-id']) ||
        firstHeader(req?.headers?.['X-User-ID']) ||
        String(req?.body?.user_id || req?.body?.userId || req?.body?.actorId || '').trim();

    return fromReq || null;
}

export async function logAudit({
    userId,
    action,
    details,
    resourceType,
    resourceId,
    severity = 'info',
    req
}: {
    userId?: string | null;
    action: string;
    details?: any;
    resourceType?: string;
    resourceId?: string;
    severity?: 'info' | 'warning' | 'critical';
    req?: any;
}) {
    try {
        const supabase = getSupabase();
        if (!supabase) return;
        const resolvedUserId = resolveAuditUserId(userId, req);
        const ipAddress = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || null;

        const { error } = await supabase.from('audit_logs').insert([{
            user_id: resolvedUserId || null,
            action,
            details:
                details == null
                    ? null
                    : typeof details === 'string'
                      ? details
                      : JSON.stringify(details),
            resource_type: resourceType || null,
            resource_id: resourceId || null,
            severity,
            ip_address: typeof ipAddress === 'string' ? ipAddress.split(',')[0].trim() : ipAddress
        }]);

        if (error) {
            console.error('Audit Logging Failed:', error);
        }
    } catch (err) {
        console.error('Audit Logging Error:', err);
    }
}

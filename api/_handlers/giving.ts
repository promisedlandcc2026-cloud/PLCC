import { getSupabaseAdmin, requireAuth, FINANCE_ROLES } from '../_utils/auth.js';
import { CreateGivingTransactionSchema } from '../_utils/schemas.js';
import { handleFinance } from './finance.js';

export const handleGiving = async (req: any, res: any) => {
    const { id, memberId, fundId, startDate, endDate, limit = '100', subResource, source } = req.query;
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });

    const auth = await requireAuth(req, res, supabaseAdmin);
    if (!auth) return;

    // Gift records (donor names, emails, amounts) are finance-team data. Members give
    // through PLCC Tithe and see their own history there, never through this endpoint.
    const role = String(auth.role || '').toUpperCase();
    if (!FINANCE_ROLES.has(role)) {
        return res.status(403).json({ ok: false, error: 'Giving records are limited to the finance team.' });
    }

    // Back-compat: clients that asked giving/pledges or giving/campaigns → finance campaigns/pledges
    if (subResource === 'campaigns' || subResource === 'pledges') {
        req.query.resource = 'finance';
        return await handleFinance(req, res);
    }

    if (req.method === 'GET') {
        if (subResource === 'insights') {
            const period = req.query.period || '30d';
            let dateFilter = new Date();
            if (period === '30d') dateFilter.setDate(dateFilter.getDate() - 30);
            else if (period === '90d') dateFilter.setDate(dateFilter.getDate() - 90);
            else if (period === 'year') dateFilter = new Date(new Date().getFullYear(), 0, 1);
            else if (period === 'all') dateFilter = new Date(2000, 0, 1);

            const startStr = dateFilter.toISOString().split('T')[0];

            // Fetch from unified view (merges giving_transactions + giving_intents)
            const { data: txs, error: txError } = await supabaseAdmin
                .from('unified_giving')
                .select('amount, given_at, giver_name, giver_email, giver_avatar, fund_name, source, source_app')
                .gte('given_at', startStr)
                .order('given_at', { ascending: false });

            if (txError) {
                // Fallback to giving_transactions if view doesn't exist yet
                console.warn('[Insights] unified_giving view not found, falling back:', txError.message);
                const { data: fallback, error: fbErr } = await supabaseAdmin
                    .from('giving_transactions')
                    .select('amount, transaction_date, member_id, fund_id, fund:finance_funds(name)')
                    .gte('transaction_date', startStr);
                if (fbErr) throw fbErr;
                const totalAmount = fallback.reduce((sum: number, t: any) => sum + Number(t.amount), 0);
                const donors = new Set(fallback.map((t: any) => t.member_id || 'anonymous')).size;
                const avgGift = fallback.length ? totalAmount / fallback.length : 0;
                const fundAllocation: Record<string, number> = {};
                fallback.forEach((t: any) => {
                    const name = (Array.isArray(t.fund) ? t.fund[0] : t.fund)?.name || 'General Fund';
                    fundAllocation[name] = (fundAllocation[name] || 0) + Number(t.amount);
                });
                const dailyTrends: Record<string, number> = {};
                fallback.forEach((t: any) => { dailyTrends[t.transaction_date] = (dailyTrends[t.transaction_date] || 0) + Number(t.amount); });
                const { data: pledges } = await supabaseAdmin.from('finance_pledges').select('amount');
                const recurringVolume = (pledges || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);
                return res.status(200).json({ ok: true, stats: { totalAmount, donors, avgGift, recurringVolume }, fundAllocation, trends: dailyTrends, recentGivers: [] });
            }

            // Fetch pledges for recurring volume
            const { data: pledges } = await supabaseAdmin.from('finance_pledges').select('amount');
            const recurringVolume = (pledges || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);

            // Aggregations
            const totalAmount = txs.reduce((sum: number, t: any) => sum + Number(t.amount), 0);
            const uniqueGivers = new Set(txs.map((t: any) => t.giver_name || 'anonymous'));
            const donors = uniqueGivers.size;
            const avgGift = txs.length ? totalAmount / txs.length : 0;

            // Fund breakdown
            const fundAllocation: Record<string, number> = {};
            txs.forEach((t: any) => {
                const name = t.fund_name || 'General Fund';
                fundAllocation[name] = (fundAllocation[name] || 0) + Number(t.amount);
            });

            // Daily trends
            const dailyTrends: Record<string, number> = {};
            txs.forEach((t: any) => {
                const day = (t.given_at || '').split('T')[0];
                if (day) dailyTrends[day] = (dailyTrends[day] || 0) + Number(t.amount);
            });

            // Recent givers list (for display in Insights page)
            const recentGivers = txs.slice(0, 20).map((t: any) => ({
                name: t.giver_name || 'Anonymous',
                email: t.giver_email || null,
                avatar: t.giver_avatar || null,
                amount: Number(t.amount),
                fund: t.fund_name || 'General Fund',
                date: (t.given_at || '').split('T')[0],
                source: t.source_app === 'home' ? 'Home Page' : 'Vault'
            }));

            return res.status(200).json({
                ok: true,
                stats: { totalAmount, donors, avgGift, recurringVolume },
                fundAllocation,
                trends: dailyTrends,
                recentGivers
            });
        }

        let query = supabaseAdmin.from('giving_transactions').select('*, member:members(first_name, last_name, email, avatar_url), fund:finance_funds(name)').order('transaction_date', { ascending: false }).limit(parseInt(limit as string));

        if (id) query = query.eq('id', id);
        if (memberId) query = query.eq('member_id', memberId);
        if (fundId) query = query.eq('fund_id', fundId);
        if (source) query = query.eq('source', String(source));
        if (startDate) query = query.gte('transaction_date', startDate);
        if (endDate) query = query.lte('transaction_date', endDate);

        const { data, error } = await query;
        if (error) throw error;
        return res.status(200).json({ ok: true, transactions: data });
    }

    if (req.method === 'POST') {
        const data = CreateGivingTransactionSchema.parse(req.body);
        const { data: transaction, error } = await supabaseAdmin.from('giving_transactions').insert({
            member_id: data.memberId || null,
            fund_id: data.fundId,
            amount: data.amount,
            transaction_date: data.date || new Date().toISOString().split('T')[0],
            source: data.source,
            reference_id: data.referenceId || null,
            notes: data.notes || null,
            batch_id: data.batchId || null
        }).select().single();

        if (error) {
            console.error('[handleGiving POST Error]', error);
            throw error;
        }
        return res.status(201).json({ ok: true, transaction });
    }

    if (req.method === 'PATCH') {
        if (!id) return res.status(400).json({ error: 'ID required' });
        const { pickColumns, GIVING_TX_COLUMNS } = await import('../_utils/routeAccess.js');
        const { data: updated, error } = await supabaseAdmin.from('giving_transactions').update(pickColumns(req.body, GIVING_TX_COLUMNS)).eq('id', id).select().single();
        if (error) throw error;
        return res.status(200).json({ ok: true, transaction: updated });
    }

    if (req.method === 'DELETE') {
        if (!id) return res.status(400).json({ error: 'ID required' });
        const { error } = await supabaseAdmin.from('giving_transactions').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
};

import { getSupabaseAdmin, requireAuth, FINANCE_ROLES } from '../_utils/auth.js';
import { getAudit } from '../_utils/deps.js';
import {
  CreateFundSchema,
  CreatePledgeSchema,
  CreateLedgerEntrySchema,
  CreateSessionSchema,
  UpdateSessionSchema,
  CreateExpenseSchema,
} from '../_utils/schemas.js';

export const handleFinance = async (req: any, res: any) => {
    const { subResource, id, status, fundId, memberId, startDate, endDate } = req.query;
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });

    const auth = await requireAuth(req, res, supabaseAdmin);
    if (!auth) return;
    const { user, role } = auth;
    if (!FINANCE_ROLES.has(String(role || '').toUpperCase())) {
        return res.status(403).json({ ok: false, error: 'Finance requires an authorized finance or admin role.' });
    }

    if (subResource === 'funds') {
        if (req.method === 'GET') {
            const { data, error } = await supabaseAdmin.from('finance_funds').select('*').order('name');
            if (error) throw error;
            return res.status(200).json({ ok: true, funds: data });
        }
        if (req.method === 'POST') {
            const data = CreateFundSchema.parse(req.body);
            const { data: fund, error } = await supabaseAdmin.from('finance_funds').insert({
                name: data.name,
                description: data.description,
                is_active: data.isActive,
                user_id: user.id
            }).select().single();
            if (error) throw error;
            return res.status(201).json({ ok: true, fund });
        }
        if (req.method === 'PATCH') {
            const { id: fundIdBody, name, description, isActive, color, goal } = req.body || {};
            if (!fundIdBody) return res.status(400).json({ ok: false, error: 'Fund ID required' });
            const mapped: Record<string, unknown> = {};
            if (name !== undefined) mapped.name = name;
            if (description !== undefined) mapped.description = description;
            if (isActive !== undefined) mapped.is_active = isActive;
            if (color !== undefined) mapped.color = color;
            if (goal !== undefined) mapped.goal = goal;
            const { data: fund, error } = await supabaseAdmin
                .from('finance_funds')
                .update(mapped)
                .eq('id', fundIdBody)
                .select()
                .single();
            if (error) throw error;
            return res.status(200).json({ ok: true, fund });
        }
    }

    if (subResource === 'ledger') {
        if (req.method === 'GET') {
            let query = supabaseAdmin.from('finance_ledger').select('*').order('transaction_date', { ascending: false });
            if (fundId) query = query.eq('fund_id', fundId);
            if (startDate) query = query.gte('transaction_date', startDate);
            if (endDate) query = query.lte('transaction_date', endDate);
            if (status) query = query.eq('status', status);
            const { data, error } = await query;
            if (error) throw error;
            return res.status(200).json({ ok: true, entries: data });
        }
        if (req.method === 'POST') {
            const data = CreateLedgerEntrySchema.parse(req.body);
            const { data: entry, error } = await supabaseAdmin.from('finance_ledger').insert({
                transaction_date: data.date || new Date().toISOString().split('T')[0],
                description: data.description, amount: data.amount, type: data.type,
                fund_id: data.fundId || null, category: data.category || 'Uncategorized',
                status: data.status, reference_id: data.referenceId || null,
                user_id: user?.id || null
            }).select().single();
            if (error) throw error;
            return res.status(201).json({ ok: true, entry });
        }
        if (req.method === 'PATCH') {
            const { id: rid, status: rstatus } = req.body;
            const { data: updated, error } = await supabaseAdmin.from('finance_ledger').update({ status: rstatus }).eq('id', rid).select().single();
            if (error) throw error;
            return res.status(200).json({ ok: true, entry: updated });
        }
        if (req.method === 'DELETE') {
            const { id: rid } = req.body;
            if (!rid) return res.status(400).json({ error: 'Entry ID required' });
            const { error } = await supabaseAdmin.from('finance_ledger').delete().eq('id', rid);
            if (error) throw error;
            const logAudit = await getAudit();
            await logAudit({ action: 'Ledger Entry Deleted', details: { entryId: rid }, resourceType: 'finance_ledger', resourceId: rid, severity: 'warning', req });
            return res.status(200).json({ ok: true });
        }
    }

    if (subResource === 'counting') {
        if (req.method === 'GET') {
            if (id) {
                const { data: session, error: sErr } = await supabaseAdmin.from('finance_counting_sessions').select('*').eq('id', id).single();
                if (sErr) throw sErr;
                const { data: details, error: dErr } = await supabaseAdmin.from('finance_counting_details').select('*').eq('session_id', id);
                if (dErr) throw dErr;
                const counts: any = {};
                details.forEach((d: any) => counts[d.denomination] = d.count || d.amount);
                return res.status(200).json({ ok: true, session: { ...session, counts } });
            }
            let query = supabaseAdmin.from('finance_counting_sessions').select('*').order('created_at', { ascending: false });
            if (status) query = query.eq('status', status);
            const { data, error } = await query;
            if (error) throw error;
            return res.status(200).json({ ok: true, sessions: data });
        }
        if (req.method === 'POST') {
            const data = CreateSessionSchema.parse(req.body);
            const notes = data.notes || (data.name ? `Batch: ${data.name}` : null);
            const { data: session, error } = await supabaseAdmin.from('finance_counting_sessions').insert({
                session_date: data.date || new Date().toISOString().split('T')[0],
                lead_counter_name: data.leadCounter,
                status: 'Draft',
                notes,
                user_id: user.id
            }).select().single();
            if (error) throw error;
            return res.status(201).json({ ok: true, session });
        }
        if (req.method === 'DELETE') {
            const sessionId = (id as string) || req.body?.id;
            if (!sessionId) return res.status(400).json({ ok: false, error: 'Batch ID required' });

            const { data: existing, error: findErr } = await supabaseAdmin
                .from('finance_counting_sessions')
                .select('id, status')
                .eq('id', sessionId)
                .single();
            if (findErr || !existing) return res.status(404).json({ ok: false, error: 'Batch not found' });
            if (existing.status === 'Locked') {
                return res.status(400).json({
                    ok: false,
                    error: 'Posted batches cannot be deleted. Archive them instead.',
                });
            }

            await supabaseAdmin.from('finance_counting_details').delete().eq('session_id', sessionId);
            const { error: delErr } = await supabaseAdmin
                .from('finance_counting_sessions')
                .delete()
                .eq('id', sessionId);
            if (delErr) throw delErr;

            const logAudit = await getAudit();
            await logAudit({
                action: 'Counting Batch Deleted',
                details: { sessionId },
                resourceType: 'finance_counting_sessions',
                resourceId: sessionId,
                severity: 'warning',
                req,
            });
            return res.status(200).json({ ok: true });
        }
        if (req.method === 'PATCH') {
            const data = UpdateSessionSchema.parse(req.body);
            const updates: any = {};
            if (data.status) updates.status = data.status;
            if (data.notes) updates.notes = data.notes;
            if (data.cashTotal !== undefined) updates.total_cash = data.cashTotal;
            if (data.checksTotal !== undefined) updates.total_checks = data.checksTotal;
            if (data.digitalTotal !== undefined) updates.total_digital = data.digitalTotal;
            if (data.grandTotal !== undefined) updates.grand_total = data.grandTotal;
            if (data.status === 'Locked') {
                updates.locked_at = new Date().toISOString();

                // Single post path: giving TXs (optional) + one ledger row. Fail loudly.
                if (data.givingTransactions && data.givingTransactions.length > 0) {
                    const txs = data.givingTransactions.map(tx => ({
                        member_id: tx.memberId || null,
                        fund_id: tx.fundId,
                        amount: tx.amount,
                        transaction_date: tx.date || new Date().toISOString().split('T')[0],
                        source: tx.source,
                        notes: tx.notes || null,
                        batch_id: data.id
                    }));
                    const { error: txErr } = await supabaseAdmin.from('giving_transactions').insert(txs);
                    if (txErr) {
                        return res.status(500).json({ ok: false, error: `Failed to insert giving transactions: ${txErr.message}` });
                    }
                }

                const { data: existingSession } = await supabaseAdmin
                    .from('finance_counting_sessions')
                    .select('session_date, grand_total, notes, lead_counter_name')
                    .eq('id', data.id)
                    .single();

                const amount = data.grandTotal ?? existingSession?.grand_total ?? 0;
                const sessionDate = existingSession?.session_date || new Date().toISOString().split('T')[0];
                const batchLabel = existingSession?.notes?.replace(/^Batch:\s*/i, '')
                    || existingSession?.lead_counter_name
                    || data.id.slice(0, 8).toUpperCase();

                const { data: existingLedger } = await supabaseAdmin
                    .from('finance_ledger')
                    .select('id')
                    .eq('reference_id', data.id)
                    .maybeSingle();

                if (!existingLedger) {
                    const { error: ledgerErr } = await supabaseAdmin.from('finance_ledger').insert({
                        transaction_date: sessionDate,
                        description: `Weekly Offering Batch — ${batchLabel}`,
                        amount,
                        type: 'Inflow',
                        category: 'Offerings',
                        status: 'Finalized',
                        reference_id: data.id,
                        user_id: user.id
                    });
                    if (ledgerErr) {
                        return res.status(500).json({ ok: false, error: `Failed to create ledger entry: ${ledgerErr.message}` });
                    }
                }
            }

            const { error: headError } = await supabaseAdmin.from('finance_counting_sessions').update(updates).eq('id', data.id);
            if (headError) throw headError;

            if (data.counts) {
                const upserts = Object.entries(data.counts).map(([denom, val]) => ({
                    session_id: data.id, denomination: denom,
                    count: denom === 'coins' ? 0 : val,
                    amount: denom === 'coins' ? val : (parseInt(denom) * val),
                    user_id: user.id
                }));
                const { error: detError } = await supabaseAdmin.from('finance_counting_details').upsert(upserts, { onConflict: 'session_id, denomination' });
                if (detError) throw detError;
            }

            return res.status(200).json({ ok: true });
        }
    }

    if (subResource === 'deposits') {
        if (req.method === 'GET') {
            const { data, error } = await supabaseAdmin
                .from('bank_deposits')
                .select('*')
                .order('deposit_date', { ascending: false });
            if (error) throw error;
            return res.status(200).json({ ok: true, deposits: data || [] });
        }
        if (req.method === 'POST') {
            const { bankName, accountName, amount, type, depositor, depositorId, verifier, linkedSessions, notes } = req.body;
            const { data, error } = await supabaseAdmin.from('bank_deposits').insert({
                bank_name: bankName,
                account_name: accountName,
                amount,
                type: type || 'Combined Cash & Check',
                status: 'Submitted',
                depositor: depositor || user?.name,
                depositor_id: depositorId || user?.id || null,
                verifier: verifier || null,
                linked_sessions: linkedSessions || [],
                notes: notes || null
            }).select().single();
            if (error) throw error;
            return res.status(201).json({ ok: true, deposit: data });
        }
        if (req.method === 'PATCH') {
            const { id: did, ...updates } = req.body;
            const mapped: any = {};
            if (updates.status) mapped.status = updates.status;
            if (updates.verifier !== undefined) mapped.verifier = updates.verifier;
            if (updates.notes !== undefined) mapped.notes = updates.notes;
            const { data, error } = await supabaseAdmin.from('bank_deposits').update(mapped).eq('id', did).select().single();
            if (error) throw error;
            return res.status(200).json({ ok: true, deposit: data });
        }
    }

    if (subResource === 'expenses') {
        if (req.method === 'GET') {
            let query = supabaseAdmin.from('finance_expenses').select('*').order('created_at', { ascending: false });
            if (status) query = query.eq('status', status);
            const { data, error } = await query;
            if (error) throw error;
            return res.status(200).json({ ok: true, expenses: data });
        }
        if (req.method === 'POST') {
            const data = CreateExpenseSchema.parse(req.body);
            const { data: expense, error } = await supabaseAdmin.from('finance_expenses').insert({
                vendor: data.vendor,
                amount: data.amount,
                requester_name: data.requester,
                category: data.category || 'General',
                description: data.description,
                status: 'Pending',
                user_id: user?.id || null
            }).select().single();
            if (error) throw error;
            return res.status(201).json({ ok: true, expense });
        }
        if (req.method === 'PATCH') {
            const { id: eid, status: estatus, createLedgerEntry: cle } = req.body;
            const { data: updated, error } = await supabaseAdmin.from('finance_expenses').update({ status: estatus }).eq('id', eid).select().single();
            if (error) throw error;

            if (estatus === 'Paid' && cle) {
                await supabaseAdmin.from('finance_ledger').insert({
                    transaction_date: new Date().toISOString().split('T')[0],
                    description: `Expense Payment: ${updated.vendor}`,
                    amount: updated.amount, type: 'Outflow', category: updated.category, status: 'Finalized',
                    reference_id: `EXP-${updated.id.slice(0, 8)}`,
                    user_id: user?.id || null
                });
            }
            return res.status(200).json({ ok: true, expense: updated });
        }
    }

    if (subResource === 'budgets') {
        if (req.method === 'GET') {
            const { data: budgets, error } = await supabaseAdmin.from('finance_budgets').select('*, fund:finance_funds(name)').order('name');
            if (error) throw error;

            const enrichedBudgets = await Promise.all(budgets.map(async (b: any) => {
                let spent = 0;
                if (b.fund_id) {
                    const { data: ledgerData } = await supabaseAdmin.from('finance_ledger').select('amount').eq('fund_id', b.fund_id).eq('type', 'Outflow').eq('status', 'Finalized');
                    if (ledgerData) spent = ledgerData.reduce((acc: number, cur: any) => acc + Number(cur.amount), 0);
                }
                return { ...b, spent };
            }));
            return res.status(200).json({ ok: true, budgets: enrichedBudgets });
        }
    }

    if (subResource === 'campaigns') {
        if (req.method === 'GET') {
            const { data, error } = await supabaseAdmin
                .from('pledge_campaigns')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return res.status(200).json({ ok: true, campaigns: data || [] });
        }
        if (req.method === 'POST') {
            const { name, description, goalAmount, startDate, endDate, category, ctaText } = req.body;
            const { data, error } = await supabaseAdmin.from('pledge_campaigns').insert({
                name,
                description: description || null,
                goal_amount: goalAmount,
                start_date: startDate || null,
                end_date: endDate || null,
                category: category || 'General',
                cta_text: ctaText || 'Pledge My Support',
                status: 'Active',
                raised_amount: 0,
                donor_count: 0
            }).select().single();
            if (error) throw error;
            return res.status(201).json({ ok: true, campaign: data });
        }
        if (req.method === 'PATCH') {
            const { id: cid, ...updates } = req.body;
            const { data, error } = await supabaseAdmin.from('pledge_campaigns').update(updates).eq('id', cid).select().single();
            if (error) throw error;
            return res.status(200).json({ ok: true, campaign: data });
        }
    }

    if (subResource === 'pledges') {
        if (req.method === 'GET') {
            let query = supabaseAdmin.from('finance_pledges').select('*, member:members(first_name, last_name), fund:finance_funds(name)').order('created_at', { ascending: false });
            if (memberId) query = query.eq('member_id', memberId);
            if (fundId) query = query.eq('fund_id', fundId);
            const { data, error } = await query;
            if (error) throw error;
            return res.status(200).json({ ok: true, pledges: data });
        }
        if (req.method === 'POST') {
            const data = CreatePledgeSchema.parse(req.body);
            const { data: pledge, error } = await supabaseAdmin.from('finance_pledges').insert({
                member_id: data.memberId,
                fund_id: data.fundId,
                amount: data.amount,
                start_date: data.startDate || new Date().toISOString().split('T')[0],
                end_date: data.endDate || null,
                frequency: data.frequency,
                notes: data.notes || null,
                status: 'Active',
                user_id: user?.id || null
            }).select().single();
            if (error) throw error;
            return res.status(201).json({ ok: true, pledge });
        }
        if (req.method === 'PATCH') {
            if (!id) return res.status(400).json({ error: 'ID required' });
            const { pickColumns, PLEDGE_COLUMNS } = await import('../_utils/routeAccess.js');
            const { data: updated, error } = await supabaseAdmin.from('finance_pledges').update(pickColumns(req.body, PLEDGE_COLUMNS)).eq('id', id).select().single();
            if (error) throw error;
            return res.status(200).json({ ok: true, pledge: updated });
        }
        if (req.method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'ID required' });
            const { error } = await supabaseAdmin.from('finance_pledges').delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ ok: true });
        }
    }

    return res.status(405).end();
};

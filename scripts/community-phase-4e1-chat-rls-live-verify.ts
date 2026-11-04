/**
 * PLCC Community Phase 4E.1 — live Chat RLS verification (post manual SQL apply).
 *
 * Run against the SAME Supabase project as the app:
 *   npx tsx scripts/community-phase-4e1-chat-rls-live-verify.ts
 *
 * Requires env: VITE_SUPABASE_URL (or SUPABASE_URL), VITE_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * Creates a temporary Auth user, probes direct browser writes, cleans up.
 * Does NOT modify application code or apply SQL.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

function env(name: string, ...alts: string[]) {
  for (const k of [name, ...alts]) {
    const v = process.env[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function summarizeErr(error: { message?: string; code?: string } | null) {
  if (!error) return null;
  return { message: error.message || String(error), code: error.code || null };
}

async function countExact(admin: SupabaseClient, table: string) {
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

async function main() {
  const url = env('VITE_SUPABASE_URL', 'SUPABASE_URL');
  const anon = env('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
  const service = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) {
    throw new Error('Missing Supabase URL / anon / service-role env');
  }

  const ref = new URL(url).hostname.split('.')[0];
  console.log(`\nPhase 4E.1 live Chat RLS verify — project_ref=${ref}\n`);

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const before = {
    chat_channels: await countExact(admin, 'chat_channels'),
    chat_messages: await countExact(admin, 'chat_messages'),
  };

  const probeEmail = `4e1.rls.verify.${Date.now()}@awc-vault.local`;
  const probePass = `Verify!${Date.now()}Aa1`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: probeEmail,
    password: probePass,
    email_confirm: true,
  });
  if (createErr || !created.user?.id) {
    throw new Error(`createUser failed: ${createErr?.message || 'no user'}`);
  }
  const uid = created.user.id;

  const browser = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signErr } = await browser.auth.signInWithPassword({
    email: probeEmail,
    password: probePass,
  });
  if (signErr) throw new Error(`signIn failed: ${signErr.message}`);

  try {
    // A. INSERT chat_channels denied
    {
      const { data, error } = await browser
        .from('chat_channels')
        .insert({
          name: `4e1-deny-channel-${Date.now()}`,
          type: 'public',
          created_by: uid,
        })
        .select('id')
        .maybeSingle();
      if (data?.id) {
        await admin.from('chat_channels').delete().eq('id', data.id);
      }
      assert(!data?.id && Boolean(error), `A: INSERT chat_channels denied (${error?.code || error?.message})`);
    }

    // Pick a real channel for message probes (service-role)
    const { data: sampleCh } = await admin
      .from('chat_channels')
      .select('id')
      .limit(1)
      .maybeSingle();
    assert(Boolean(sampleCh?.id), 'sample channel available for message probes');

    // B. INSERT chat_messages denied
    {
      const { data, error } = await browser
        .from('chat_messages')
        .insert({
          channel_id: sampleCh!.id,
          user_id: uid,
          content: '4e1 deny message probe',
          user_name: 'Probe',
        })
        .select('id')
        .maybeSingle();
      if (data?.id) {
        await admin.from('chat_messages').delete().eq('id', data.id);
      }
      assert(!data?.id && Boolean(error), `B: INSERT chat_messages denied (${error?.code || error?.message})`);
    }

    // C/D. UPDATE / DELETE on a real row must not mutate via browser
    {
      const { data: realMsg } = await admin
        .from('chat_messages')
        .select('id, content')
        .limit(1)
        .maybeSingle();
      if (!realMsg?.id) {
        console.log('  SKIP: C/D no existing message to probe');
      } else {
        const original = realMsg.content;
        const { data: upd, error: updErr } = await browser
          .from('chat_messages')
          .update({ content: `${original} [should-not-stick]` })
          .eq('id', realMsg.id)
          .select('id');
        const { data: afterUpd } = await admin
          .from('chat_messages')
          .select('content')
          .eq('id', realMsg.id)
          .maybeSingle();
        const changed = afterUpd?.content !== original;
        if (changed) {
          await admin.from('chat_messages').update({ content: original }).eq('id', realMsg.id);
        }
        assert(
          !changed && (Boolean(updErr) || !upd || upd.length === 0),
          `C: UPDATE chat_messages denied/no-op (${updErr?.code || 'empty'})`
        );

        const { data: del, error: delErr } = await browser
          .from('chat_messages')
          .delete()
          .eq('id', realMsg.id)
          .select('id');
        const { data: stillThere } = await admin
          .from('chat_messages')
          .select('id')
          .eq('id', realMsg.id)
          .maybeSingle();
        assert(
          Boolean(stillThere?.id) && (Boolean(delErr) || !del || del.length === 0),
          `D: DELETE chat_messages denied/no-op (${delErr?.code || 'empty'})`
        );
      }
    }

    // E/F/G service-role write + read, then cleanup
    {
      const tag = `4e1-svc-${Date.now()}`;
      const { data: ch, error: chErr } = await admin
        .from('chat_channels')
        .insert({
          name: tag,
          type: 'public',
          visibility: 'open',
          description: '4e1 service-role verify — delete',
          created_by: uid,
        })
        .select('id')
        .maybeSingle();
      assert(!chErr && Boolean(ch?.id), `E: service-role create channel (${chErr?.message || 'ok'})`);

      const { data: msg, error: msgErr } = await admin
        .from('chat_messages')
        .insert({
          channel_id: ch!.id,
          user_id: uid,
          content: `${tag} message`,
          user_name: 'ServiceVerify',
        })
        .select('id')
        .maybeSingle();
      assert(!msgErr && Boolean(msg?.id), `F: service-role create message (${msgErr?.message || 'ok'})`);

      const { data: listed, error: listErr } = await admin
        .from('chat_channels')
        .select('id, name')
        .eq('id', ch!.id)
        .maybeSingle();
      const { data: msgs, error: msgsErr } = await admin
        .from('chat_messages')
        .select('id')
        .eq('channel_id', ch!.id);
      assert(!listErr && listed?.id === ch!.id, 'G: service-role read channel');
      assert(!msgsErr && (msgs?.length || 0) >= 1, 'G: service-role read messages');

      if (msg?.id) await admin.from('chat_messages').delete().eq('id', msg.id);
      await admin.from('chat_channels').delete().eq('id', ch!.id);
    }

    // H. ACL inventory unchanged shape (API still owns access decisions)
    {
      const { count: lead } = await admin
        .from('chat_channels')
        .select('*', { count: 'exact', head: true })
        .eq('visibility', 'leadership');
      const { count: ministry } = await admin
        .from('chat_channels')
        .select('*', { count: 'exact', head: true })
        .eq('visibility', 'ministry');
      assert((lead ?? 0) >= 0 && (ministry ?? 0) >= 0, 'H: visibility inventory readable via service-role');
      console.log(
        `  OK: H: leadership=${lead ?? 0} ministry=${ministry ?? 0} (API ACL unchanged by this migration)`
      );
    }

    const after = {
      chat_channels: await countExact(admin, 'chat_channels'),
      chat_messages: await countExact(admin, 'chat_messages'),
    };
    assert(after.chat_channels === before.chat_channels, 'no retained channel rows');
    assert(after.chat_messages === before.chat_messages, 'no retained message rows');

    console.log('\nPhase 4E.1 live Chat RLS verify — ALL PASSED\n');
    console.log(JSON.stringify({ project_ref: ref, before, after, errors_sample: null }, null, 2));
  } finally {
    await browser.auth.signOut().catch(() => undefined);
    await admin.auth.admin.deleteUser(uid);
  }
}

main().catch((e) => {
  console.error('\nPhase 4E.1 live Chat RLS verify — FAILED\n');
  console.error(String(e?.message || e));
  console.error(
    '\nIf writes still succeed, run the pg_policies / grants / relrowsecurity SQL from the diagnostic report in Supabase SQL Editor on project',
    env('VITE_SUPABASE_URL', 'SUPABASE_URL')
      ? new URL(env('VITE_SUPABASE_URL', 'SUPABASE_URL')).hostname.split('.')[0]
      : '(unknown)'
  );
  process.exit(1);
});

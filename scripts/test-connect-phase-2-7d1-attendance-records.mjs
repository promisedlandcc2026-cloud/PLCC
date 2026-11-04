/**
 * Phase 2.7D.1 — Vault migration contract for attendance_records + check-in RPC.
 * Run from Vault: node --test scripts/test-connect-phase-2-7d1-attendance-records.mjs
 *
 * Source-contract only. Does not apply SQL or touch live data.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mig = join(root, 'supabase/migrations/connect_phase_2_7d1_attendance_records.sql');
const connectRoot = join(root, '..', 'awc-connect-main');

function read(path) {
  return readFileSync(path, 'utf8');
}

function codeOnly(sql) {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, '').trim())
    .filter(Boolean)
    .join('\n');
}

/** Extract RPC function body between AS $$ ... $$; */
function rpcBody(sql) {
  const m = sql.match(
    /CREATE OR REPLACE FUNCTION public\.attendance_checkin_member\([\s\S]*?\)\s*RETURNS jsonb[\s\S]*?AS \$\$([\s\S]*?)\$\$;/
  );
  assert.ok(m, 'RPC body not found');
  return m[1];
}

describe('connect_phase_2_7d1_attendance_records.sql', () => {
  it('A: attendance_records table + review-gated', () => {
    assert.equal(existsSync(mig), true);
    const sql = read(mig);
    assert.ok(sql.includes('DO NOT apply automatically'));
    assert.ok(sql.includes('BEGIN;'));
    assert.ok(sql.includes('COMMIT;'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.attendance_records'));
  });

  it('B: additive only', () => {
    const code = codeOnly(read(mig));
    assert.equal(/\bDROP TABLE\b/i.test(code), false);
    assert.equal(/\bDROP COLUMN\b/i.test(code), false);
    assert.equal(/\bALTER TABLE public\.attendance_sessions\b/i.test(code), false);
    assert.ok(code.includes('CREATE TABLE IF NOT EXISTS public.attendance_records'));
  });

  it('C: no ALTER/DML legacy attendance', () => {
    const code = codeOnly(read(mig));
    assert.equal(/\bALTER TABLE public\.attendance\b/i.test(code), false);
    assert.equal(/\bINSERT\s+INTO\s+public\.attendance\b/i.test(code), false);
    assert.equal(/\bUPDATE\s+public\.attendance\b/i.test(code), false);
    assert.equal(/\bDELETE\s+FROM\s+public\.attendance\b/i.test(code), false);
  });

  it('D: required columns', () => {
    const sql = read(mig);
    assert.ok(/id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/.test(sql));
    assert.ok(/session_id uuid NOT NULL/.test(sql));
    assert.ok(/member_id uuid NOT NULL/.test(sql));
    assert.ok(/source text NOT NULL/.test(sql));
    assert.ok(/checked_in_at timestamptz NOT NULL DEFAULT now\(\)/.test(sql));
    assert.ok(/checked_in_by uuid NOT NULL/.test(sql));
    assert.ok(/created_at timestamptz NOT NULL DEFAULT now\(\)/.test(sql));
  });

  it('E: session FK RESTRICT', () => {
    const sql = read(mig);
    assert.ok(
      /session_id uuid NOT NULL\s+REFERENCES public\.attendance_sessions\(id\) ON DELETE RESTRICT/s.test(
        sql
      )
    );
  });

  it('F: member FK RESTRICT', () => {
    const sql = read(mig);
    assert.ok(
      /member_id uuid NOT NULL\s+REFERENCES public\.members\(id\) ON DELETE RESTRICT/s.test(sql)
    );
    assert.equal(/REFERENCES public\.members\(id\) ON DELETE CASCADE/i.test(sql), false);
  });

  it('G: checked_in_by FK RESTRICT', () => {
    const sql = read(mig);
    assert.ok(
      /checked_in_by uuid NOT NULL\s+REFERENCES public\.users\(id\) ON DELETE RESTRICT/s.test(sql)
    );
    assert.equal(/checked_in_by[\s\S]{0,80}ON DELETE CASCADE/i.test(sql), false);
  });

  it('H: source CHECK exact', () => {
    const sql = read(mig);
    assert.ok(sql.includes("CHECK (source IN ('digital_card', 'manual_staff'))"));
    assert.equal(/kiosk|registration|import/i.test(codeOnly(sql)), false);
  });

  it('I: UNIQUE(session_id, member_id)', () => {
    const sql = read(mig);
    assert.ok(
      sql.includes('CONSTRAINT attendance_records_session_member_uidx UNIQUE (session_id, member_id)')
    );
  });

  it('J: RLS enabled', () => {
    const sql = read(mig);
    assert.ok(sql.includes('ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY'));
  });

  it('K: PUBLIC revoked', () => {
    const sql = read(mig);
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.attendance_records FROM PUBLIC'));
  });

  it('L: anon revoked', () => {
    const sql = read(mig);
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.attendance_records FROM anon'));
  });

  it('M: authenticated revoked', () => {
    const sql = read(mig);
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.attendance_records FROM authenticated'));
  });

  it('N: service_role grant', () => {
    const sql = read(mig);
    assert.ok(sql.includes('GRANT ALL ON TABLE public.attendance_records TO service_role'));
  });

  it('O: no updated_at', () => {
    const code = codeOnly(read(mig));
    assert.equal(/\bupdated_at\b/i.test(code), false);
    assert.equal(/set_attendance_records_updated_at/i.test(code), false);
  });

  it('P: no status column on records', () => {
    const sql = read(mig);
    // Table body must not declare a status column (RPC may still check session.status)
    const table = sql.match(
      /CREATE TABLE IF NOT EXISTS public\.attendance_records \(([\s\S]*?)\);/
    );
    assert.ok(table);
    assert.equal(/\bstatus\b/i.test(table[1]), false);
  });

  it('Q: no notes', () => {
    const code = codeOnly(read(mig));
    assert.equal(/\bnotes?\b/i.test(code), false);
  });

  it('R: indexes', () => {
    const sql = read(mig);
    assert.ok(sql.includes('attendance_records_member_checked_in_idx'));
    assert.ok(sql.includes('(member_id, checked_in_at DESC)'));
    assert.ok(sql.includes('attendance_records_session_checked_in_idx'));
    assert.ok(sql.includes('(session_id, checked_in_at ASC)'));
  });

  it('S: RPC exists', () => {
    const sql = read(mig);
    assert.ok(
      sql.includes(
        'CREATE OR REPLACE FUNCTION public.attendance_checkin_member(\n  p_session_id uuid,\n  p_member_id uuid,\n  p_source text,\n  p_actor_user_id uuid\n)'
      )
    );
    assert.ok(sql.includes('RETURNS jsonb'));
  });

  it('T: SECURITY DEFINER', () => {
    const sql = read(mig);
    assert.ok(/attendance_checkin_member\([\s\S]*?SECURITY DEFINER/s.test(sql));
  });

  it('U: search_path empty', () => {
    const sql = read(mig);
    assert.ok(sql.includes("SET search_path = ''"));
    const idx = sql.indexOf('CREATE OR REPLACE FUNCTION public.attendance_checkin_member');
    assert.ok(idx >= 0);
    assert.ok(sql.slice(idx, idx + 600).includes("SET search_path = ''"));
  });

  it('V: fully qualified public.*', () => {
    const body = rpcBody(read(mig));
    const fromHits = body.match(/\bFROM\s+[a-z_][a-z0-9_.]*/gi) || [];
    for (const hit of fromHits) {
      assert.ok(hit.toLowerCase().startsWith('from public.'), `unqualified FROM: ${hit}`);
    }
    assert.ok(body.includes('public.attendance_sessions'));
    assert.ok(body.includes('public.attendance_records'));
    assert.ok(body.includes('public.members'));
    assert.ok(body.includes('public.users'));
    assert.ok(body.includes('INSERT INTO public.attendance_records'));
  });

  it('W: RPC server-only execute grants', () => {
    const sql = read(mig);
    assert.ok(
      sql.includes(
        'REVOKE ALL ON FUNCTION public.attendance_checkin_member(uuid, uuid, text, uuid) FROM PUBLIC'
      )
    );
    assert.ok(
      sql.includes(
        'REVOKE ALL ON FUNCTION public.attendance_checkin_member(uuid, uuid, text, uuid) FROM anon'
      )
    );
    assert.ok(
      sql.includes(
        'REVOKE ALL ON FUNCTION public.attendance_checkin_member(uuid, uuid, text, uuid) FROM authenticated'
      )
    );
    assert.ok(
      sql.includes(
        'GRANT EXECUTE ON FUNCTION public.attendance_checkin_member(uuid, uuid, text, uuid) TO service_role'
      )
    );
    assert.equal(
      /GRANT EXECUTE ON FUNCTION public\.attendance_checkin_member\([^)]+\) TO authenticated/i.test(
        sql
      ),
      false
    );
  });

  it('X: session open check', () => {
    const body = rpcBody(read(mig));
    assert.ok(body.includes("status = 'draft'"));
    assert.ok(body.includes("session_not_open"));
    assert.ok(body.includes("status = 'closed'"));
    assert.ok(body.includes('session_closed'));
    assert.ok(body.includes("IS DISTINCT FROM 'open'"));
  });

  it('Y: kids deny', () => {
    const body = rpcBody(read(mig));
    assert.ok(body.includes("type = 'kids'"));
    assert.ok(body.includes('session_type_not_allowed'));
    assert.ok(
      body.includes("NOT IN ('worship', 'event', 'serve', 'bible_study', 'other')")
    );
  });

  it('Z: member existence', () => {
    const body = rpcBody(read(mig));
    assert.ok(body.includes('FROM public.members m'));
    assert.ok(body.includes('member_not_found'));
  });

  it('AA: actor existence', () => {
    const body = rpcBody(read(mig));
    assert.ok(body.includes('FROM public.users u'));
    assert.ok(body.includes('actor_not_found'));
  });

  it('AB: DB now authority', () => {
    const sql = read(mig);
    const body = rpcBody(sql);
    assert.ok(sql.includes('checked_in_at timestamptz NOT NULL DEFAULT now()'));
    // RPC must not accept a timestamp parameter
    assert.equal(/p_checked_in_at|p_timestamp|checked_in_at\s*:/i.test(body), false);
    assert.ok(
      /INSERT INTO public\.attendance_records \([\s\S]*?checked_in_by[\s\S]*?\)\s*VALUES/s.test(body)
    );
  });

  it('AC: ON CONFLICT duplicate', () => {
    const body = rpcBody(read(mig));
    assert.ok(body.includes('ON CONFLICT (session_id, member_id) DO NOTHING'));
  });

  it('AD: returns already flag', () => {
    const body = rpcBody(read(mig));
    assert.ok(body.includes("'alreadyCheckedIn', false"));
    assert.ok(body.includes("'alreadyCheckedIn', true"));
    assert.ok(body.includes("'attendanceId'"));
    assert.ok(body.includes("'sessionId'"));
    assert.ok(body.includes("'memberId'"));
    assert.ok(body.includes("'checkedInAt'"));
    assert.ok(body.includes("'source'"));
  });

  it('AE: does not update duplicate row', () => {
    const body = rpcBody(read(mig));
    assert.equal(/\bUPDATE\s+public\.attendance_records\b/i.test(body), false);
    assert.ok(body.includes('ON CONFLICT (session_id, member_id) DO NOTHING'));
  });

  it('AF: no visitor mutation', () => {
    const code = codeOnly(read(mig));
    assert.equal(/visitor_count/i.test(code), false);
  });

  it('AG: no Serve mutation', () => {
    const code = codeOnly(read(mig));
    assert.equal(/serve_signups|serve_opportunities/i.test(code), false);
  });

  it('AH: no event mutation', () => {
    const code = codeOnly(read(mig));
    // May reference attendance_sessions only — no events / registrations DML
    assert.equal(/\b(INSERT|UPDATE|DELETE)\b[\s\S]{0,40}\bpublic\.events\b/i.test(code), false);
    assert.equal(/event_registrations|event_volunteers/i.test(code), false);
  });

  it('AI: no notification mutation', () => {
    const code = codeOnly(read(mig));
    assert.equal(/notifications/i.test(code), false);
  });

  it('AJ: no audit write', () => {
    const code = codeOnly(read(mig));
    assert.equal(/audit_logs/i.test(code), false);
  });

  it('AK: no QR/token fields', () => {
    const code = codeOnly(read(mig));
    assert.equal(/qr_token|token_hash|qr_token_hash|AWC1/i.test(code), false);
    assert.equal(/member_digital_cards|user_member_links/i.test(code), false);
  });

  it('session lock FOR SHARE', () => {
    const body = rpcBody(read(mig));
    assert.ok(/FOR SHARE/.test(body));
  });

  it('Connect isolation: migration not in Connect', () => {
    assert.equal(
      existsSync(join(connectRoot, 'supabase/migrations/connect_phase_2_7d1_attendance_records.sql')),
      false
    );
  });

  it('Connect SHA unchanged', () => {
    const sha = execSync('git rev-parse HEAD', { cwd: connectRoot, encoding: 'utf8' }).trim();
    assert.equal(sha, '5d61a88cc244b68231f59bbaf8b065ca959a17c6');
  });
});

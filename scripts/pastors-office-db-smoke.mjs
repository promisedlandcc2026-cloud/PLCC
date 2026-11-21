import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

/** Synthetic local Postgres only; no production connection. */
describe('Pastor’s Office database transactions', () => {
  it('protects grants, collisions, approval and notifications', async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid'; CREATE TABLE public.users (id uuid PRIMARY KEY, role text NOT NULL);`);
      for (const file of ['create_user_notifications.sql','pastors_office_assignments.sql','pastors_office_scheduling.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
      const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
      await db.query("INSERT INTO public.users(id,role) VALUES ($1,'SUPER_ADMIN'),($2,'PASTOR'),($3,'MEMBER'),($4,'MEMBER'),($5,'MEMBER')",ids);
      await assert.rejects(db.query('SELECT public.set_pastors_assistant($1,$2,$3,true)',[ids[4],ids[1],ids[2]]));
      await db.query('SELECT public.set_pastors_assistant($1,$2,$3,true)',ids.slice(0,3));
      const office=(await db.query('SELECT id FROM public.pastoral_offices WHERE pastor_user_id=$1',[ids[1]])).rows[0].id;
      const created=await db.query("SELECT public.pastoral_submit_request($1,$2,'appointment','2027-01-01T07:00Z','Africa/Kampala','app',NULL) AS id",[ids[3],office]);
      const r1=created.rows[0].id;
      const created2=await db.query("SELECT public.pastoral_submit_request($1,$2,'appointment','2027-01-01T07:30Z','Africa/Kampala','app',NULL) AS id",[ids[4],office]);
      const r2=created2.rows[0].id;
      await db.query('SELECT public.pastoral_propose_slot($1,$2,$3,$4,$5,$6)',[ids[2],r1,1,'2027-01-01T07:00Z','2027-01-01T08:00Z','Africa/Kampala']);
      await assert.rejects(db.query('SELECT public.pastoral_propose_slot($1,$2,$3,$4,$5,$6)',[ids[2],r2,1,'2027-01-01T07:30Z','2027-01-01T08:30Z','Africa/Kampala']));
      await assert.rejects(db.query('SELECT public.pastoral_propose_slot($1,$2,$3,$4,$5,$6)',[ids[4],r2,1,'2027-01-01T09:00Z','2027-01-01T10:00Z','Africa/Kampala']));
      await assert.rejects(db.query('SELECT public.pastoral_propose_slot($1,$2,$3,$4,$5,$6)',[ids[2],r1,null,'2027-01-01T09:00Z','2027-01-01T10:00Z','Africa/Kampala']));
      await db.query('SELECT public.pastoral_transition_request($1,$2,$3,$4)',[ids[2],r1,2,'request_approval']);
      await assert.rejects(db.query('SELECT public.pastoral_transition_request($1,$2,$3,$4)',[ids[2],r1,3,'approve']));
      await db.query('SELECT public.pastoral_transition_request($1,$2,$3,$4)',[ids[1],r1,3,'approve']);
      assert.equal((await db.query('SELECT status FROM public.pastoral_requests WHERE id=$1',[r1])).rows[0].status,'confirmed');
      await assert.rejects(db.query('SELECT public.pastoral_transition_request($1,$2,$3,$4)',[ids[4],r1,4,'request_reschedule']));
      await db.query('SELECT public.pastoral_transition_request($1,$2,$3,$4)',[ids[3],r1,4,'request_reschedule']);
      assert.equal((await db.query('SELECT status FROM public.pastoral_appointments WHERE request_id=$1',[r1])).rows[0].status,'confirmed');
      await db.query('SELECT public.pastoral_propose_slot($1,$2,$3,$4,$5,$6)',[ids[2],r1,5,'2027-01-03T07:00Z','2027-01-03T08:00Z','Africa/Kampala']);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM public.pastoral_appointment_history WHERE request_id=$1',[r1])).rows[0].n,1);
      await assert.rejects(db.query('SELECT public.pastoral_set_time_block($1,$2,$3,$4,NULL)',[ids[2],office,'2027-01-02T07:00Z','2027-01-02T08:00Z']));
      const block=(await db.query('SELECT public.pastoral_set_time_block($1,$2,$3,$4,NULL) AS id',[ids[1],office,'2027-01-02T07:00Z','2027-01-02T08:00Z'])).rows[0].id;
      await assert.rejects(db.query('SELECT public.pastoral_propose_slot($1,$2,$3,$4,$5,$6)',[ids[2],r2,1,'2027-01-02T07:30Z','2027-01-02T08:30Z','Africa/Kampala']));
      await db.query('SELECT public.pastoral_set_time_block($1,$2,NULL,NULL,$3)',[ids[1],office,block]);
      await db.query('SELECT public.pastoral_private_note($1,$2,$3,true)',[ids[1],r1,'Pastor-only note']);
      assert.equal((await db.query('SELECT public.pastoral_private_note($1,$2,NULL,false) AS body',[ids[1],r1])).rows[0].body,'Pastor-only note');
      await assert.rejects(db.query('SELECT public.pastoral_private_note($1,$2,NULL,false)',[ids[2],r1]));
      await assert.rejects(db.query('SELECT public.pastoral_private_note($1,$2,$3,true)',[ids[3],r1,'tampered']));
      await db.query("SELECT public.pastoral_propose_slot($1,$2,1,now()+interval '2 hours',now()+interval '3 hours','Africa/Kampala')",[ids[2],r2]);
      await db.query('SELECT public.pastoral_transition_request($1,$2,2,$3)',[ids[2],r2,'request_approval']);
      await db.query('SELECT public.pastoral_transition_request($1,$2,3,$3)',[ids[1],r2,'approve']);
      assert.equal((await db.query('SELECT public.pastoral_queue_reminders() AS n')).rows[0].n,1);
      assert.equal((await db.query('SELECT public.pastoral_queue_reminders() AS n')).rows[0].n,0);
      await db.query('INSERT INTO public.pastoral_notification_preferences(user_id,reminders_enabled,reminder_hours) VALUES ($1,false,24)',[ids[4]]);
      const first=(await db.query('SELECT public.pastoral_deliver_inbox(100) AS n')).rows[0].n;
      const second=(await db.query('SELECT public.pastoral_deliver_inbox(100) AS n')).rows[0].n;
      assert.ok(first>0); assert.equal(second,0);
      assert.equal((await db.query("SELECT status FROM public.pastoral_notification_outbox WHERE request_id=$1 AND event_kind='reminder'",[r2])).rows[0].status,'failed');
      const alerts=(await db.query('SELECT title,body FROM public.user_notifications')).rows;
      assert.ok(alerts.every(a=>!/counsel|baptism/i.test(a.title+' '+a.body)));
      for(const table of ['pastoral_requests','pastoral_appointments','pastoral_notification_outbox']) {
        const result=await db.query("SELECT relrowsecurity, has_table_privilege('anon',oid,'SELECT') AS anon_read, has_table_privilege('authenticated',oid,'SELECT') AS member_read FROM pg_class WHERE oid=$1::regclass",[`public.${table}`]);
        assert.deepEqual(result.rows[0],{relrowsecurity:true,anon_read:false,member_read:false});
      }
    } finally { await db.close(); }
  });
});

# Pastor’s Assistant assignment rollout

The migration `supabase/migrations/pastors_office_assignments.sql` is additive and retains existing `users.role` values. It creates office-scoped assignments and an audit table. It has not been executed against the live database. Do not apply until an isolated database has been checked for existing schema, function privileges, RLS enforcement, rollback and restore, and the church approves the production change.

Test using synthetic users: only a verified Super Admin may list, grant or revoke; the database function must reject non-admin actors, invalid users, and a pastor without the PASTOR role. Verify anon/authenticated cannot read or write the tables or execute the function, grants and revocations atomically create audit rows, and existing roles remain unchanged. Test concurrent grant/revoke, duplicates, transaction failure and restoration. Test deployed API and UI with two accounts before production use. The current automated tests mock the database and do not prove SQL or RLS behavior.

If rollback is necessary, disable the assignment UI and endpoint first. Retain and securely back up the assignment and audit records; coordinate restoration or a reviewed schema reversal. Never drop tables or erase audit history as an automatic rollback. Calendar access does not exist yet and the assignment by itself grants no calendar access.

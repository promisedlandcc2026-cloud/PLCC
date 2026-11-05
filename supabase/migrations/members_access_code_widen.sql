-- PLCC's members.access_code was varchar(4), but the app makes 8-digit codes,
-- so creating a member (e.g. for a phone sign-in account) failed silently.
-- Applied to the PLCC database on 2026-11-05.
ALTER TABLE public.members ALTER COLUMN access_code TYPE varchar(16);

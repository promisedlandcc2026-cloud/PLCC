-- Fix: renaming a household that has members failed with
--   "update or delete on table households violates foreign key constraint
--    members_household_name_fkey on table members"
-- which surfaced in the Vault as "INTERNAL ERROR" (e.g. The Vance Household, Oct 2026).
--
-- members.household_name references households.name with no ON UPDATE rule,
-- so any rename of a household with members was blocked, and deleting one
-- with members was blocked too. Cascade renames to members and clear the
-- name on delete (matching members_household_id_fkey's ON DELETE SET NULL).

ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_household_name_fkey;

ALTER TABLE public.members
  ADD CONSTRAINT members_household_name_fkey
  FOREIGN KEY (household_name) REFERENCES public.households(name)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

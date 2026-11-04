
-- Drop existing constraints on team_members
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_member_id_fkey;

-- Re-add constraint with CASCADE
ALTER TABLE team_members
ADD CONSTRAINT team_members_member_id_fkey
FOREIGN KEY (member_id)
REFERENCES members (id)
ON UPDATE CASCADE
ON DELETE CASCADE;

-- Check other potential tables referencing members (e.g., household_members if exists)
-- Safely attempting to update household_members if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'household_members') THEN
        ALTER TABLE household_members DROP CONSTRAINT IF EXISTS household_members_member_id_fkey;
        
        ALTER TABLE household_members
        ADD CONSTRAINT household_members_member_id_fkey
        FOREIGN KEY (member_id)
        REFERENCES members (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE;
    END IF;
END $$;

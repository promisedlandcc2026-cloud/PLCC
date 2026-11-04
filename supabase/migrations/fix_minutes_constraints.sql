-- SQL Fix: Change foreign key from auth.users to public.users

-- 1. Fix minutes_documents (created_by)
ALTER TABLE minutes_documents 
DROP CONSTRAINT IF EXISTS minutes_documents_created_by_fkey;

ALTER TABLE minutes_documents 
ADD CONSTRAINT minutes_documents_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES users(id);

-- 2. Ensure minutes_acknowledgements (user_id) points to the right table
ALTER TABLE minutes_acknowledgements 
DROP CONSTRAINT IF EXISTS minutes_acknowledgements_user_id_fkey;

ALTER TABLE minutes_acknowledgements 
ADD CONSTRAINT minutes_acknowledgements_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

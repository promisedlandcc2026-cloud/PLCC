-- Add status column to connect_cards
ALTER TABLE public.connect_cards 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new' 
CHECK (status IN ('new', 'approved', 'rejected', 'archived'));

-- Add status column to team_applications
ALTER TABLE public.team_applications 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new' 
CHECK (status IN ('new', 'approved', 'rejected', 'archived'));

-- Optional: Create indexes for filtering by status
CREATE INDEX IF NOT EXISTS idx_connect_cards_status ON public.connect_cards(status);
CREATE INDEX IF NOT EXISTS idx_team_applications_status ON public.team_applications(status);

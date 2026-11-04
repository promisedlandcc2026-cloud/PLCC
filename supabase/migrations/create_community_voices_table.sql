-- Create community_voices table
CREATE TABLE IF NOT EXISTS community_voices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  published_date DATE DEFAULT CURRENT_DATE,
  category TEXT,
  image_url TEXT,
  comments JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE community_voices ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for awc-redesign)
CREATE POLICY "Public Read Community Voices" ON community_voices FOR SELECT USING (true);

-- Allow authenticated admins to manage (for awc-vault)
CREATE POLICY "Admin Manage Community Voices" ON community_voices FOR ALL TO authenticated USING (true);


-- PLCC Connect - Master Database Sync
-- Run this in your Supabase SQL Editor to ensure all tables match the app logic.

-- 1. Events Table Enhancements
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='starts_at') THEN
        ALTER TABLE events ADD COLUMN starts_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 2. Prayer Requests Enhancements
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prayer_requests' AND column_name='is_confidential') THEN
        ALTER TABLE prayer_requests ADD COLUMN is_confidential BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 3. Announcements Table
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    date TEXT,
    description TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Sermons Table
CREATE TABLE IF NOT EXISTS public.sermons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    title TEXT NOT NULL,
    scripture TEXT,
    book TEXT,
    version TEXT DEFAULT 'KJV',
    speaker TEXT DEFAULT 'Pastor Grace Hiire',
    outline JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Giving Settings Table
CREATE TABLE IF NOT EXISTS public.giving_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    online_url TEXT,
    text_number TEXT,
    mail_address TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Event Registrations Table
CREATE TABLE IF NOT EXISTS public.event_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.events(id),
    name TEXT NOT NULL,
    email TEXT,
    rsvp_status TEXT DEFAULT 'Going',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Giving Intent Table
CREATE TABLE IF NOT EXISTS public.giving_intent (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Seed Default Giving Settings if empty
INSERT INTO public.giving_settings (online_url, text_number, mail_address)
SELECT 'https://sanctum-live-nine.vercel.app/give', '12345', 'Kira-Kitukutwe Trading Center, Wakiso District, Uganda'
WHERE NOT EXISTS (SELECT 1 FROM public.giving_settings);

-- Enable RLS and Policies for all new tables
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on announcements" ON public.announcements FOR SELECT USING (true);

ALTER TABLE public.sermons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on sermons" ON public.sermons FOR SELECT USING (true);

ALTER TABLE public.giving_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on giving_settings" ON public.giving_settings FOR SELECT USING (true);

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow insert on event_registrations" ON public.event_registrations FOR INSERT TO anon WITH CHECK (true);

ALTER TABLE public.giving_intent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow insert on giving_intent" ON public.giving_intent FOR INSERT TO anon WITH CHECK (true);

-- Ensure public access to events and teams as well
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on events" ON public.events FOR SELECT USING (true);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on teams" ON public.teams FOR SELECT USING (true);

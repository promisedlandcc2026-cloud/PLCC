-- PLCC Community Phase 2B — channels + room membership (additive, non-destructive)
-- Keeps chat_channels.type and participants; adds visibility + chat_room_members.
-- Live preflight: member_ministries and chat_read_status may be missing — create IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- 1) Foundational: member_ministries (API uses members.id + ministries.id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_ministries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  ministry_id uuid NOT NULL REFERENCES public.ministries(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (member_id, ministry_id)
);

CREATE INDEX IF NOT EXISTS member_ministries_ministry_idx
  ON public.member_ministries (ministry_id);

CREATE INDEX IF NOT EXISTS member_ministries_member_idx
  ON public.member_ministries (member_id);

-- ---------------------------------------------------------------------------
-- 2) Foundational: chat_read_status (live DB may not have this table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_read_status (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  last_read_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS chat_read_status_user_idx
  ON public.chat_read_status (user_id);

CREATE INDEX IF NOT EXISTS chat_read_status_channel_idx
  ON public.chat_read_status (channel_id);

ALTER TABLE public.chat_read_status ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3) Extend chat_channels
-- ---------------------------------------------------------------------------
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS visibility text,
  ADD COLUMN IF NOT EXISTS ministry_id uuid,
  ADD COLUMN IF NOT EXISTS team_id uuid,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS is_announcement boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS pinned_message_id uuid,
  ADD COLUMN IF NOT EXISTS allowed_roles text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_channels_visibility_check'
      AND conrelid = 'public.chat_channels'::regclass
  ) THEN
    ALTER TABLE public.chat_channels
      ADD CONSTRAINT chat_channels_visibility_check
      CHECK (
        visibility IS NULL
        OR visibility IN ('open', 'ministry', 'leadership', 'event', 'dm')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_channels_ministry_id_fkey'
  ) THEN
    ALTER TABLE public.chat_channels
      ADD CONSTRAINT chat_channels_ministry_id_fkey
      FOREIGN KEY (ministry_id) REFERENCES public.ministries(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_channels_team_id_fkey'
  ) THEN
    ALTER TABLE public.chat_channels
      ADD CONSTRAINT chat_channels_team_id_fkey
      FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
  END IF;

  -- event_id: uuid only (events table may vary); no hard FK to avoid migrate failures
END $$;

-- Backfill visibility / slug from legacy type (before unique index)
UPDATE public.chat_channels
SET
  visibility = CASE
    WHEN type = 'public' THEN 'open'
    WHEN type = 'private' AND name LIKE 'DM_%' THEN 'dm'
    WHEN type IN ('private', 'group') THEN 'ministry'
    ELSE COALESCE(visibility, 'open')
  END,
  slug = COALESCE(
    slug,
    NULLIF(
      regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g'),
      ''
    )
  )
WHERE visibility IS NULL OR slug IS NULL;

-- Empty slug fallback (deterministic)
UPDATE public.chat_channels
SET slug = 'channel-' || left(replace(id::text, '-', ''), 8)
WHERE slug IS NULL OR btrim(slug) = '';

-- Collision-safe: keep earliest created_at (then id); suffix duplicates with short channel id
UPDATE public.chat_channels c
SET slug = c.slug || '-' || left(replace(c.id::text, '-', ''), 8)
FROM (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY slug
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.chat_channels
  WHERE slug IS NOT NULL
) d
WHERE c.id = d.id
  AND d.rn > 1;

-- Unique index only after collision resolution
CREATE UNIQUE INDEX IF NOT EXISTS chat_channels_slug_unique
  ON public.chat_channels (slug)
  WHERE slug IS NOT NULL;

-- (Leadership Briefing system room seed removed Oct 2026 — use the PLCC Leadership Briefing channel instead)

-- Seed ministry rooms when matching ministries exist (slug includes short ministry id — collision-safe)
INSERT INTO public.chat_channels (name, type, visibility, slug, description, ministry_id)
SELECT
  m.name || ' Room',
  'private',
  'ministry',
  regexp_replace(lower(m.name), '[^a-z0-9]+', '-', 'g')
    || '-room-'
    || left(replace(m.id::text, '-', ''), 8),
  'Ministry discussion for ' || m.name,
  m.id
FROM public.ministries m
WHERE (
  m.name ILIKE '%men%'
  OR m.name ILIKE '%women%'
  OR m.name ILIKE '%youth%'
)
AND NOT EXISTS (
  SELECT 1 FROM public.chat_channels c
  WHERE c.ministry_id = m.id
);
-- ---------------------------------------------------------------------------
-- 4) chat_room_members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_room_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'moderator')),
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ministry_sync', 'role_grant', 'event')),
  joined_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_room_members_user_idx
  ON public.chat_room_members (user_id);

CREATE INDEX IF NOT EXISTS chat_room_members_channel_idx
  ON public.chat_room_members (channel_id);

-- Backfill from participants uuid[]
INSERT INTO public.chat_room_members (channel_id, user_id, role, source)
SELECT c.id, u.id, 'member', 'manual'
FROM public.chat_channels c
CROSS JOIN LATERAL unnest(COALESCE(c.participants, ARRAY[]::uuid[])) AS pid(uid)
JOIN public.users u ON u.id = pid.uid
ON CONFLICT (channel_id, user_id) DO NOTHING;

ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;

-- Settings persistence for Vault Settings Hub
DO $$
BEGIN
  -- Church-wide event / system / integration settings live on organization_settings
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organization_settings'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'organization_settings' AND column_name = 'event_settings'
    ) THEN
      ALTER TABLE public.organization_settings ADD COLUMN event_settings JSONB DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'organization_settings' AND column_name = 'system_settings'
    ) THEN
      ALTER TABLE public.organization_settings ADD COLUMN system_settings JSONB DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'organization_settings' AND column_name = 'integrations'
    ) THEN
      ALTER TABLE public.organization_settings ADD COLUMN integrations JSONB DEFAULT '{}'::jsonb;
    END IF;
  END IF;

  -- Per-user notification preferences
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'notification_prefs'
    ) THEN
      ALTER TABLE public.users ADD COLUMN notification_prefs JSONB DEFAULT '{}'::jsonb;
    END IF;
  END IF;
END $$;

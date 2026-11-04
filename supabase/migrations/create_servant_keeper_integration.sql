-- Servant Keeper Integration Tables
-- This creates the database structure for bidirectional sync with Servant Keeper 8

-- 1. Sync Configuration Table
CREATE TABLE IF NOT EXISTS public.servant_keeper_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_enabled BOOLEAN DEFAULT false,
    sync_direction TEXT DEFAULT 'both', -- 'import', 'export', 'both'
    auto_sync_enabled BOOLEAN DEFAULT false,
    sync_frequency TEXT DEFAULT 'daily', -- 'hourly', 'daily', 'weekly', 'manual'
    last_import_at TIMESTAMPTZ,
    last_export_at TIMESTAMPTZ,
    import_path TEXT, -- Path to watch for CSV files
    export_path TEXT, -- Path to save export CSV files
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Field Mapping Table
CREATE TABLE IF NOT EXISTS public.servant_keeper_field_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID REFERENCES public.servant_keeper_config(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL, -- 'member', 'household', 'contribution', 'attendance'
    sk_field_name TEXT NOT NULL, -- Servant Keeper field name
    awc_field_name TEXT NOT NULL, -- PLCC Connect field name
    field_type TEXT DEFAULT 'text', -- 'text', 'number', 'date', 'boolean', 'email', 'phone'
    is_required BOOLEAN DEFAULT false,
    default_value TEXT,
    transform_rule JSONB, -- Custom transformation rules
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Sync History Table
CREATE TABLE IF NOT EXISTS public.servant_keeper_sync_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID REFERENCES public.servant_keeper_config(id) ON DELETE CASCADE,
    sync_type TEXT NOT NULL, -- 'import', 'export'
    entity_type TEXT NOT NULL, -- 'member', 'household', 'contribution', 'attendance'
    status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    file_name TEXT,
    file_path TEXT,
    records_total INTEGER DEFAULT 0,
    records_processed INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    error_log JSONB,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Sync Mapping Table (tracks which records are synced)
CREATE TABLE IF NOT EXISTS public.servant_keeper_sync_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL, -- 'member', 'household', 'contribution', 'attendance'
    awc_record_id UUID NOT NULL, -- ID in PLCC Connect
    sk_record_id TEXT NOT NULL, -- ID in Servant Keeper
    last_synced_at TIMESTAMPTZ DEFAULT now(),
    sync_direction TEXT DEFAULT 'import', -- 'import', 'export', 'both'
    awc_data JSONB, -- Snapshot of PLCC data at last sync
    sk_data JSONB, -- Snapshot of SK data at last sync
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(entity_type, awc_record_id),
    UNIQUE(entity_type, sk_record_id)
);

-- 5. Conflict Resolution Table
CREATE TABLE IF NOT EXISTS public.servant_keeper_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_history_id UUID REFERENCES public.servant_keeper_sync_history(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    awc_record_id UUID,
    sk_record_id TEXT,
    conflict_type TEXT NOT NULL, -- 'duplicate', 'field_mismatch', 'missing_required', 'validation_error'
    conflict_details JSONB,
    awc_data JSONB,
    sk_data JSONB,
    resolution_status TEXT DEFAULT 'pending', -- 'pending', 'resolved', 'ignored'
    resolution_action TEXT, -- 'use_awc', 'use_sk', 'merge', 'skip'
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Create Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_sk_field_mapping_config ON public.servant_keeper_field_mapping(config_id);
CREATE INDEX IF NOT EXISTS idx_sk_field_mapping_entity ON public.servant_keeper_field_mapping(entity_type);
CREATE INDEX IF NOT EXISTS idx_sk_sync_history_config ON public.servant_keeper_sync_history(config_id);
CREATE INDEX IF NOT EXISTS idx_sk_sync_history_status ON public.servant_keeper_sync_history(status);
CREATE INDEX IF NOT EXISTS idx_sk_sync_history_type ON public.servant_keeper_sync_history(sync_type, entity_type);
CREATE INDEX IF NOT EXISTS idx_sk_sync_mapping_entity_awc ON public.servant_keeper_sync_mapping(entity_type, awc_record_id);
CREATE INDEX IF NOT EXISTS idx_sk_sync_mapping_entity_sk ON public.servant_keeper_sync_mapping(entity_type, sk_record_id);
CREATE INDEX IF NOT EXISTS idx_sk_conflicts_status ON public.servant_keeper_conflicts(resolution_status);
CREATE INDEX IF NOT EXISTS idx_sk_conflicts_sync ON public.servant_keeper_conflicts(sync_history_id);

-- 7. Enable Row Level Security
ALTER TABLE public.servant_keeper_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servant_keeper_field_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servant_keeper_sync_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servant_keeper_sync_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servant_keeper_conflicts ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies (Admin/Finance only)
CREATE POLICY "sk_config_admin_all" ON public.servant_keeper_config FOR ALL TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE users.id = auth.uid() 
        AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'PASTOR', 'FINANCE', 'SECRETARY')
    )
);

CREATE POLICY "sk_field_mapping_admin_all" ON public.servant_keeper_field_mapping FOR ALL TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE users.id = auth.uid() 
        AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'PASTOR', 'FINANCE', 'SECRETARY')
    )
);

CREATE POLICY "sk_sync_history_admin_all" ON public.servant_keeper_sync_history FOR ALL TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE users.id = auth.uid() 
        AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'PASTOR', 'FINANCE', 'SECRETARY')
    )
);

CREATE POLICY "sk_sync_mapping_admin_all" ON public.servant_keeper_sync_mapping FOR ALL TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE users.id = auth.uid() 
        AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'PASTOR', 'FINANCE', 'SECRETARY')
    )
);

CREATE POLICY "sk_conflicts_admin_all" ON public.servant_keeper_conflicts FOR ALL TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE users.id = auth.uid() 
        AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'PASTOR', 'FINANCE', 'SECRETARY')
    )
);

-- 9. Insert Default Field Mappings for Members
INSERT INTO public.servant_keeper_field_mapping (config_id, entity_type, sk_field_name, awc_field_name, field_type, is_required)
SELECT 
    (SELECT id FROM public.servant_keeper_config LIMIT 1),
    'member',
    sk_field,
    awc_field,
    field_type,
    is_required
FROM (VALUES
    ('IndividualID', 'id', 'text', false),
    ('FirstName', 'first_name', 'text', true),
    ('LastName', 'last_name', 'text', true),
    ('Email', 'email', 'email', false),
    ('Phone', 'phone', 'phone', false),
    ('Address', 'address', 'text', false),
    ('City', 'city', 'text', false),
    ('State', 'state', 'text', false),
    ('Zip', 'zip', 'text', false),
    ('DateOfBirth', 'date_of_birth', 'date', false),
    ('Gender', 'gender', 'text', false),
    ('MemberStatus', 'status', 'text', false),
    ('FamilyID', 'household_name', 'text', false),
    ('JoinDate', 'join_date', 'date', false)
) AS mapping(sk_field, awc_field, field_type, is_required)
WHERE EXISTS (SELECT 1 FROM public.servant_keeper_config LIMIT 1);

-- 10. Insert Default Field Mappings for Contributions
INSERT INTO public.servant_keeper_field_mapping (config_id, entity_type, sk_field_name, awc_field_name, field_type, is_required)
SELECT 
    (SELECT id FROM public.servant_keeper_config LIMIT 1),
    'contribution',
    sk_field,
    awc_field,
    field_type,
    is_required
FROM (VALUES
    ('ContributionID', 'id', 'text', false),
    ('IndividualID', 'member_id', 'text', true),
    ('Date', 'transaction_date', 'date', true),
    ('Amount', 'amount', 'number', true),
    ('Fund', 'fund_name', 'text', false),
    ('Method', 'payment_method', 'text', false),
    ('CheckNumber', 'check_number', 'text', false),
    ('Notes', 'notes', 'text', false)
) AS mapping(sk_field, awc_field, field_type, is_required)
WHERE EXISTS (SELECT 1 FROM public.servant_keeper_config LIMIT 1);

-- 11. Insert Default Field Mappings for Attendance
INSERT INTO public.servant_keeper_field_mapping (config_id, entity_type, sk_field_name, awc_field_name, field_type, is_required)
SELECT 
    (SELECT id FROM public.servant_keeper_config LIMIT 1),
    'attendance',
    sk_field,
    awc_field,
    field_type,
    is_required
FROM (VALUES
    ('AttendanceID', 'id', 'text', false),
    ('IndividualID', 'member_id', 'text', true),
    ('Date', 'check_in_time', 'date', true),
    ('ServiceType', 'service_type', 'text', false),
    ('CheckInMethod', 'check_in_method', 'text', false)
) AS mapping(sk_field, awc_field, field_type, is_required)
WHERE EXISTS (SELECT 1 FROM public.servant_keeper_config LIMIT 1);

-- 12. Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sk_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 13. Create triggers for updated_at
CREATE TRIGGER update_sk_config_updated_at
    BEFORE UPDATE ON public.servant_keeper_config
    FOR EACH ROW
    EXECUTE FUNCTION update_sk_updated_at();

CREATE TRIGGER update_sk_sync_mapping_updated_at
    BEFORE UPDATE ON public.servant_keeper_sync_mapping
    FOR EACH ROW
    EXECUTE FUNCTION update_sk_updated_at();

-- 14. Create initial config record
INSERT INTO public.servant_keeper_config (sync_enabled, sync_direction, auto_sync_enabled)
SELECT false, 'both', false
WHERE NOT EXISTS (SELECT 1 FROM public.servant_keeper_config);

COMMENT ON TABLE public.servant_keeper_config IS 'Configuration for Servant Keeper 8 integration';
COMMENT ON TABLE public.servant_keeper_field_mapping IS 'Field mappings between Servant Keeper and PLCC Connect';
COMMENT ON TABLE public.servant_keeper_sync_history IS 'History of all sync operations';
COMMENT ON TABLE public.servant_keeper_sync_mapping IS 'Tracks which records are synced between systems';
COMMENT ON TABLE public.servant_keeper_conflicts IS 'Tracks conflicts that need manual resolution';

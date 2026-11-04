-- Child Consent Form System
-- This creates a comprehensive consent management system for children's ministry

-- 1. Consent Forms Table (Templates)
CREATE TABLE IF NOT EXISTS public.consent_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    form_type TEXT NOT NULL, -- 'photo_release', 'medical', 'general_liability', 'field_trip', 'custom'
    content TEXT NOT NULL, -- Full consent form text
    is_required BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    requires_signature BOOLEAN DEFAULT true,
    valid_duration_days INTEGER DEFAULT 365, -- How long consent is valid (365 = 1 year)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- 2. Child Consent Records Table
CREATE TABLE IF NOT EXISTS public.child_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL, -- References members table (child)
    parent_id UUID NOT NULL, -- References members table (parent/guardian)
    consent_form_id UUID REFERENCES public.consent_forms(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending', -- 'pending', 'granted', 'denied', 'expired', 'revoked'
    signature_data TEXT, -- Base64 encoded signature image
    signature_method TEXT DEFAULT 'digital', -- 'digital', 'typed', 'uploaded'
    signed_name TEXT, -- Name typed or signed
    signed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    ip_address TEXT,
    user_agent TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(child_id, consent_form_id)
);

-- 3. Consent Check-In Blocks Table (Prevents check-in without consent)
CREATE TABLE IF NOT EXISTS public.consent_check_in_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL,
    consent_form_id UUID REFERENCES public.consent_forms(id) ON DELETE CASCADE,
    blocked_at TIMESTAMPTZ DEFAULT now(),
    blocked_reason TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    UNIQUE(child_id, consent_form_id)
);

-- 4. Consent Audit Log Table
CREATE TABLE IF NOT EXISTS public.consent_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_consent_id UUID REFERENCES public.child_consents(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- 'created', 'signed', 'denied', 'expired', 'revoked', 'renewed'
    performed_by UUID REFERENCES auth.users(id),
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Create Indexes
CREATE INDEX IF NOT EXISTS idx_consent_forms_active ON public.consent_forms(is_active);
CREATE INDEX IF NOT EXISTS idx_consent_forms_type ON public.consent_forms(form_type);
CREATE INDEX IF NOT EXISTS idx_child_consents_child ON public.child_consents(child_id);
CREATE INDEX IF NOT EXISTS idx_child_consents_parent ON public.child_consents(parent_id);
CREATE INDEX IF NOT EXISTS idx_child_consents_status ON public.child_consents(status);
CREATE INDEX IF NOT EXISTS idx_child_consents_expires ON public.child_consents(expires_at);
CREATE INDEX IF NOT EXISTS idx_consent_blocks_child ON public.consent_check_in_blocks(child_id);
CREATE INDEX IF NOT EXISTS idx_consent_audit_consent ON public.consent_audit_log(child_consent_id);

-- 6. Enable Row Level Security
ALTER TABLE public.consent_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_check_in_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_audit_log ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for Consent Forms (Admin can manage, everyone can view active)
CREATE POLICY "consent_forms_view_active" ON public.consent_forms FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "consent_forms_admin_all" ON public.consent_forms FOR ALL TO authenticated USING (true);

-- 8. RLS Policies for Child Consents (Parents can view their children's consents)
CREATE POLICY "child_consents_parent_view" ON public.child_consents FOR SELECT TO authenticated USING (
    parent_id = auth.uid()
);

CREATE POLICY "child_consents_parent_insert" ON public.child_consents FOR INSERT TO authenticated WITH CHECK (
    parent_id = auth.uid()
);

CREATE POLICY "child_consents_parent_update" ON public.child_consents FOR UPDATE TO authenticated USING (
    parent_id = auth.uid()
);

-- 9. RLS Policies for Check-In Blocks (All authenticated users)
CREATE POLICY "consent_blocks_all" ON public.consent_check_in_blocks FOR ALL TO authenticated USING (true);

-- 10. RLS Policies for Audit Log (Staff can view)
CREATE POLICY "consent_audit_staff_view" ON public.consent_audit_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "consent_audit_insert" ON public.consent_audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- 11. Create function to check if child has valid consent
CREATE OR REPLACE FUNCTION check_child_consent_valid(
    p_child_id UUID,
    p_consent_form_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_consent_status TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    SELECT status, expires_at INTO v_consent_status, v_expires_at
    FROM public.child_consents
    WHERE child_id = p_child_id 
    AND consent_form_id = p_consent_form_id;
    
    IF v_consent_status IS NULL THEN
        RETURN FALSE; -- No consent record exists
    END IF;
    
    IF v_consent_status != 'granted' THEN
        RETURN FALSE; -- Consent not granted
    END IF;
    
    IF v_expires_at IS NOT NULL AND v_expires_at < NOW() THEN
        -- Update status to expired
        UPDATE public.child_consents 
        SET status = 'expired', updated_at = NOW()
        WHERE child_id = p_child_id AND consent_form_id = p_consent_form_id;
        
        RETURN FALSE; -- Consent expired
    END IF;
    
    RETURN TRUE; -- Consent is valid
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Create function to get missing consents for a child
CREATE OR REPLACE FUNCTION get_missing_consents_for_child(p_child_id UUID)
RETURNS TABLE(
    form_id UUID,
    form_title TEXT,
    form_type TEXT,
    form_content TEXT,
    requires_signature BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cf.id,
        cf.title,
        cf.form_type,
        cf.content,
        cf.requires_signature
    FROM public.consent_forms cf
    WHERE cf.is_active = true 
    AND cf.is_required = true
    AND NOT EXISTS (
        SELECT 1 FROM public.child_consents cc
        WHERE cc.child_id = p_child_id
        AND cc.consent_form_id = cf.id
        AND cc.status = 'granted'
        AND (cc.expires_at IS NULL OR cc.expires_at > NOW())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_consent_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_consent_forms_updated_at
    BEFORE UPDATE ON public.consent_forms
    FOR EACH ROW
    EXECUTE FUNCTION update_consent_updated_at();

CREATE TRIGGER update_child_consents_updated_at
    BEFORE UPDATE ON public.child_consents
    FOR EACH ROW
    EXECUTE FUNCTION update_consent_updated_at();

-- 14. Insert Default Consent Forms
INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days) VALUES
(
    'Photo & Video Release',
    'photo_release',
    E'PHOTO AND VIDEO RELEASE CONSENT\n\nI, the undersigned parent/legal guardian, hereby grant permission to Promised Land Christian Center (PLCC) to photograph, video record, and/or otherwise capture the image and likeness of my child during church activities, events, and programs.\n\nI understand and agree that:\n\n1. USAGE: These images and videos may be used for:\n   • Church promotional materials (print and digital)\n   • Social media posts (Facebook, Instagram, YouTube, etc.)\n   • Church website and newsletters\n   • Internal presentations and displays\n   • Fundraising and ministry awareness campaigns\n\n2. NO COMPENSATION: I will receive no monetary compensation for the use of these images/videos.\n\n3. OWNERSHIP: All photographs and videos become the property of PLCC.\n\n4. RELEASE: I release PLCC, its staff, volunteers, and representatives from any claims related to the use of these images/videos.\n\n5. REVOCATION: I understand I may revoke this consent at any time by submitting a written request to the church office.\n\n6. PRIVACY: PLCC will make reasonable efforts to protect my child''s privacy and will not publish identifying information (full name, address, etc.) alongside images without additional permission.\n\nThis consent is valid for one (1) year from the date of signature and will automatically renew annually unless revoked in writing.',
    true,
    true,
    365
),
(
    'Medical Treatment & Emergency',
    'medical',
    E'MEDICAL TREATMENT AND EMERGENCY CONSENT\n\nI, the undersigned parent/legal guardian, hereby grant permission for my child to participate in Promised Land Christian Center (PLCC) children''s ministry programs and activities.\n\nI understand and agree that:\n\n1. MEDICAL INFORMATION:\n   • I have provided accurate medical information about my child\n   • I will notify PLCC staff of any changes to my child''s medical conditions, allergies, or medications\n   • I authorize PLCC staff to administer basic first aid if needed\n\n2. EMERGENCY MEDICAL TREATMENT:\n   • In the event of a medical emergency, PLCC staff will attempt to contact me immediately\n   • If I cannot be reached, I authorize PLCC staff to:\n     - Call 911 or emergency medical services\n     - Transport my child to the nearest medical facility\n     - Consent to emergency medical treatment on my behalf\n   • I understand PLCC will make reasonable efforts to contact me before authorizing non-emergency treatment\n\n3. MEDICAL EXPENSES:\n   • I agree to be financially responsible for any medical expenses incurred\n   • I understand PLCC does not provide medical insurance coverage for participants\n\n4. MEDICATIONS:\n   • I will provide written instructions for any medications my child needs during church activities\n   • I authorize designated PLCC staff to administer prescribed medications according to my written instructions\n   • All medications must be in original containers with proper labeling\n\n5. ALLERGIES AND DIETARY RESTRICTIONS:\n   • I have disclosed all known allergies and dietary restrictions\n   • I understand PLCC will make reasonable accommodations but cannot guarantee an allergen-free environment\n\n6. RELEASE OF LIABILITY:\n   • I release PLCC, its staff, and volunteers from liability for injuries or illnesses that may occur during normal activities\n   • This release does not apply to gross negligence or willful misconduct\n\nEMERGENCY CONTACTS:\nI will maintain current emergency contact information with the church office.\n\nThis consent is valid for one (1) year from the date of signature.',
    true,
    true,
    365
),
(
    'General Liability & Assumption of Risk',
    'general_liability',
    E'GENERAL LIABILITY WAIVER AND ASSUMPTION OF RISK\n\nI, the undersigned parent/legal guardian, acknowledge and agree to the following regarding my child''s participation in Promised Land Christian Center (PLCC) children''s ministry programs:\n\n1. ASSUMPTION OF RISK:\n   • I understand that participation in church activities involves inherent risks including, but not limited to:\n     - Minor injuries (cuts, bruises, scrapes)\n     - Accidents during play or activities\n     - Exposure to communicable illnesses\n     - Risks associated with indoor and outdoor activities\n   • I voluntarily assume all such risks on behalf of my child\n\n2. SUPERVISION:\n   • I understand PLCC provides age-appropriate supervision with trained volunteers and staff\n   • I acknowledge that despite best efforts, accidents may occur\n   • I understand supervision ratios follow recommended safety guidelines\n\n3. BEHAVIOR EXPECTATIONS:\n   • I agree my child will follow PLCC children''s ministry rules and guidelines\n   • I understand PLCC staff may discipline my child using age-appropriate, non-physical methods\n   • I understand repeated behavioral issues may result in my child being excluded from activities\n\n4. PROPERTY DAMAGE:\n   • I agree to be responsible for any intentional damage to church property caused by my child\n   • I understand PLCC is not responsible for lost, stolen, or damaged personal items\n\n5. TRANSPORTATION:\n   • I understand some activities may involve transportation in church vehicles or volunteer vehicles\n   • I consent to my child being transported for approved church activities\n   • I understand all drivers are screened and insured according to church policy\n\n6. RELEASE OF LIABILITY:\n   • I release, waive, and discharge PLCC, its pastors, staff, volunteers, and representatives from any and all claims, demands, or causes of action arising from my child''s participation\n   • This release includes claims for personal injury, property damage, or wrongful death\n   • This release does not apply to gross negligence, willful misconduct, or intentional harm\n\n7. INDEMNIFICATION:\n   • I agree to indemnify and hold harmless PLCC from any claims brought by third parties arising from my child''s actions\n\nI have read this waiver carefully and understand its contents. I am aware that by signing this form, I am waiving certain legal rights that I or my child may have.\n\nThis consent is valid for one (1) year from the date of signature.',
    true,
    true,
    365
),
(
    'Code of Conduct Agreement',
    'custom',
    E'CHILDREN''S MINISTRY CODE OF CONDUCT\n\nI, the undersigned parent/legal guardian, acknowledge that my child will be expected to follow PLCC Children''s Ministry Code of Conduct:\n\n1. RESPECT:\n   • Treat all leaders, volunteers, and other children with respect\n   • Use appropriate language at all times\n   • Listen when others are speaking\n   • Follow instructions from ministry leaders\n\n2. SAFETY:\n   • Stay in designated areas unless accompanied by a leader\n   • Walk (don''t run) inside the building\n   • Keep hands, feet, and objects to yourself\n   • Report any injuries or concerns to a leader immediately\n\n3. PARTICIPATION:\n   • Engage positively in activities and lessons\n   • Be kind and inclusive to all children\n   • Take care of church property and materials\n   • Clean up after activities\n\n4. CONSEQUENCES:\n   • First offense: Verbal warning and redirection\n   • Second offense: Time-out and parent notification\n   • Third offense: Removal from activity and parent conference\n   • Serious offenses: Immediate parent notification and possible suspension\n\n5. SERIOUS VIOLATIONS:\n   The following behaviors will result in immediate parent notification and may result in suspension:\n   • Physical violence or fighting\n   • Bullying, harassment, or threatening behavior\n   • Intentional property damage\n   • Leaving designated areas without permission\n   • Inappropriate touching or behavior\n\n6. PARENT RESPONSIBILITIES:\n   • I agree to support PLCC staff in maintaining a safe, respectful environment\n   • I will respond promptly if contacted about behavioral concerns\n   • I understand repeated violations may result in my child being excluded from programs\n   • I will discuss expectations and consequences with my child\n\nI have reviewed this Code of Conduct with my child and we both understand the expectations.\n\nThis consent is valid for one (1) year from the date of signature.',
    true,
    true,
    365
);

-- 15. Create view for consent status dashboard (only if members table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'members') THEN
        CREATE OR REPLACE VIEW consent_status_summary AS
        SELECT 
            m.id as child_id,
            m.first_name,
            m.last_name,
            m.household_name,
            COUNT(DISTINCT cf.id) as total_required_forms,
            COUNT(DISTINCT CASE WHEN cc.status = 'granted' AND (cc.expires_at IS NULL OR cc.expires_at > NOW()) THEN cc.consent_form_id END) as completed_forms,
            COUNT(DISTINCT CASE WHEN cc.status = 'expired' THEN cc.consent_form_id END) as expired_forms,
            CASE 
                WHEN COUNT(DISTINCT cf.id) = COUNT(DISTINCT CASE WHEN cc.status = 'granted' AND (cc.expires_at IS NULL OR cc.expires_at > NOW()) THEN cc.consent_form_id END) 
                THEN 'complete'
                WHEN COUNT(DISTINCT CASE WHEN cc.status = 'granted' AND (cc.expires_at IS NULL OR cc.expires_at > NOW()) THEN cc.consent_form_id END) > 0
                THEN 'partial'
                ELSE 'none'
            END as consent_status
        FROM public.members m
        CROSS JOIN public.consent_forms cf
        LEFT JOIN public.child_consents cc ON m.id = cc.child_id AND cf.id = cc.consent_form_id
        WHERE cf.is_active = true AND cf.is_required = true
        GROUP BY m.id, m.first_name, m.last_name, m.household_name;
    END IF;
END $$;

COMMENT ON TABLE public.consent_forms IS 'Template consent forms for children''s ministry';
COMMENT ON TABLE public.child_consents IS 'Individual consent records for each child';
COMMENT ON TABLE public.consent_check_in_blocks IS 'Tracks children blocked from check-in due to missing consents';
COMMENT ON TABLE public.consent_audit_log IS 'Audit trail of all consent-related actions';

-- Kids check-in / missing-consent RPC: ignore adult-audience templates.
-- Adult forms are self-sign only and must never block child check-in.
-- Run in Supabase SQL Editor after deploy if not applied by migrate.

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
    AND (cf.audience IS NULL OR cf.audience IN ('children', 'all'))
    AND NOT EXISTS (
        SELECT 1 FROM public.child_consents cc
        WHERE cc.child_id = p_child_id
        AND cc.consent_form_id = cf.id
        AND cc.status = 'granted'
        AND (cc.expires_at IS NULL OR cc.expires_at > NOW())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

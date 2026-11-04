-- Unified giving view that merges giving_transactions (Vault) 
-- and giving_intents (PLCC-Redesign home page giving)
-- Run this in Supabase SQL Editor

CREATE OR REPLACE VIEW public.unified_giving AS

  -- From PLCC-Vault (batch giving, counting sessions, manual entries)
  SELECT
    gt.id,
    gt.transaction_date                          AS given_at,
    gt.amount,
    COALESCE(
      m.first_name || ' ' || m.last_name,
      'Anonymous'
    )                                            AS giver_name,
    m.email                                      AS giver_email,
    m.avatar_url                                 AS giver_avatar,
    COALESCE(f.name, 'General Fund')             AS fund_name,
    gt.source,
    'vault'                                      AS source_app
  FROM public.giving_transactions gt
  LEFT JOIN public.members m       ON m.id = gt.member_id
  LEFT JOIN public.finance_funds f ON f.id = gt.fund_id

  UNION ALL

  -- From PLCC-Redesign home page giving
  SELECT
    gi.id,
    gi.created_at                                AS given_at,
    gi.amount,
    COALESCE(gi.giver_name, 'Anonymous')         AS giver_name,
    NULL                                         AS giver_email,
    NULL                                         AS giver_avatar,
    COALESCE(go.title, 'Tithes & Offerings')     AS fund_name,
    gi.frequency                                 AS source,
    'home'                                       AS source_app
  FROM public.giving_intents gi
  LEFT JOIN public.giving_options go ON go.id = gi.giving_option_id
  WHERE gi.amount IS NOT NULL AND gi.amount > 0;

-- Allow authenticated users to read the view
GRANT SELECT ON public.unified_giving TO authenticated;
GRANT SELECT ON public.unified_giving TO anon;

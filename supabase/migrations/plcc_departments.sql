-- PLCC Core Departments — Phase 1 (Nov 25 2026)
-- Departments, their leadership and members, role-based permissions (configurable by
-- admins), and an audit trail. Server-only: every read/write goes through the Canaan API
-- (service role), which enforces who may see or change what.
--
-- Oversight: users.role SUPER_ADMIN (full rights, e.g. the Apostle) and PASTOR see every department.
-- Structure: users.role SUPER_ADMIN and ADMIN create departments, assign heads and set permissions.
-- Inside a department: HEAD, ASSISTANT_HEAD, SECRETARY, TREASURER, MEMBER (permissions below).

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,60}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  mission text NOT NULL DEFAULT '' CHECK (char_length(mission) <= 600),
  core_values text[] NOT NULL DEFAULT '{}',
  responsibilities text[] NOT NULL DEFAULT '{}',
  accountability text[] NOT NULL DEFAULT '{}',
  color text NOT NULL DEFAULT '#0f3d2c',
  icon text NOT NULL DEFAULT 'Users',
  sort_order int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.department_members (
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  dept_role text NOT NULL DEFAULT 'MEMBER'
    CHECK (dept_role IN ('HEAD','ASSISTANT_HEAD','SECRETARY','TREASURER','MEMBER')),
  title text CHECK (title IS NULL OR char_length(title) <= 60),
  added_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (department_id, user_id)
);
CREATE INDEX IF NOT EXISTS department_members_user_idx ON public.department_members(user_id);

-- Church-wide permission matrix. A row overrides the built-in default for that role.
CREATE TABLE IF NOT EXISTS public.department_role_permissions (
  dept_role text NOT NULL CHECK (dept_role IN ('HEAD','ASSISTANT_HEAD','SECRETARY','TREASURER','MEMBER')),
  permission text NOT NULL CHECK (char_length(permission) <= 40),
  allowed boolean NOT NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dept_role, permission)
);

CREATE TABLE IF NOT EXISTS public.department_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS department_audit_dept_idx ON public.department_audit(department_id, created_at DESC);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.departments, public.department_members, public.department_role_permissions, public.department_audit FROM anon, authenticated;

-- Starter departments (admins can rename, edit or archive any of them).
INSERT INTO public.departments (slug, name, mission, core_values, responsibilities, accountability, color, icon, sort_order) VALUES
('intercession', 'Intercession', 'Stand in the gap for the church, its leaders and the nations through faithful, organized prayer.',
  ARRAY['Faithfulness','Humility','Discernment','Confidentiality'],
  ARRAY['Lead and cover Morning Glory, Lunch Hour, Midnight Watch and Upper Room prayer','Keep a prayer schedule and rota of intercessors','Pray over prayer requests received by the church','Support altar ministry during services'],
  ARRAY['Monthly report to the Pastor on prayer coverage and key requests','Keep prayer requests confidential','Attendance kept for every prayer session'],
  '#5b3a8c', 'HandHeart', 10),
('worship', 'Worship', 'Lead the congregation into the presence of God through Spirit-led praise and worship.',
  ARRAY['Excellence','Holiness','Teamwork','Punctuality'],
  ARRAY['Plan songs and worship sets for every service','Hold regular rehearsals','Care for instruments and sound equipment','Train and mentor new singers and musicians'],
  ARRAY['Rehearsal attendance recorded','Song lists shared before each service','Quarterly report on team growth and needs'],
  '#b8862f', 'Music', 20),
('ushering-protocol', 'Ushering & Protocol', 'Welcome every person with order and honour, and serve leaders and guests with excellence.',
  ARRAY['Hospitality','Order','Honour','Alertness'],
  ARRAY['Welcome and seat members and visitors','Keep order in the sanctuary during services','Receive and escort guests and ministers','Assist with offering collection and counting handover'],
  ARRAY['Duty rota published before each service','Incidents reported the same day','Offering handover signed by two people'],
  '#1f6f5c', 'DoorOpen', 30),
('media', 'Media', 'Carry the message of PLCC beyond its walls through sound, video, livestream and design.',
  ARRAY['Excellence','Integrity','Creativity','Reliability'],
  ARRAY['Run sound, livestream and recording for services','Publish sermons and announcements on church channels','Design graphics and flyers for events','Care for media equipment'],
  ARRAY['Every service recorded and archived','Equipment checklist completed before services','Only approved content published'],
  '#22577a', 'Clapperboard', 40),
('children', 'Children', 'Raise children who know, love and follow Jesus in a safe, joyful environment.',
  ARRAY['Safety','Love','Patience','Integrity'],
  ARRAY['Teach children''s church every service','Keep children''s check-in and check-out safe','Plan lessons and activities by age group','Partner with parents in children''s growth'],
  ARRAY['Every teacher approved and vetted','Child safety incidents reported immediately','Attendance kept for every class'],
  '#e07a2f', 'Baby', 50),
('youth', 'Youth', 'Build a generation of young people on fire for God, grounded in the Word and serving with purpose.',
  ARRAY['Passion','Purity','Purpose','Unity'],
  ARRAY['Hold regular youth fellowships and Bible studies','Mentor and disciple young people','Plan youth outreach and events','Raise young leaders for ministry'],
  ARRAY['Monthly activity report to the Pastor','Attendance kept for every fellowship','Activities approved before announcement'],
  '#2f80c9', 'Sparkles', 60),
('women', 'Women', 'Equip women to grow in faith, strengthen families and serve the church and community.',
  ARRAY['Godliness','Sisterhood','Wisdom','Service'],
  ARRAY['Hold women''s fellowships and prayer meetings','Support and care for women in need','Organize conferences and retreats','Mentor younger women'],
  ARRAY['Quarterly report to the Pastor','Welfare support recorded','Funds used only as approved'],
  '#b03a6f', 'Heart', 70),
('men', 'Men', 'Raise godly men who lead their homes, serve the church and stand firm in faith.',
  ARRAY['Integrity','Responsibility','Brotherhood','Faith'],
  ARRAY['Hold men''s fellowships and prayer breakfasts','Mentor and support men in their families and work','Serve the church in practical projects','Organize men''s retreats'],
  ARRAY['Quarterly report to the Pastor','Attendance kept for fellowships','Projects approved before starting'],
  '#3d5a40', 'Shield', 80),
('evangelism', 'Evangelism & Missions', 'Take the Gospel to every person, near and far, and bring new believers into the church family.',
  ARRAY['Boldness','Compassion','Obedience','Follow-through'],
  ARRAY['Plan outreaches and crusades','Follow up new believers and visitors','Support missions and church planting','Train members to share their faith'],
  ARRAY['Every outreach reported with souls reached and follow-ups','New believers handed to follow-up within a week','Outreach budgets approved before spending'],
  '#c0392b', 'Megaphone', 90),
('finance', 'Finance', 'Steward the church''s resources with integrity, transparency and accountability.',
  ARRAY['Integrity','Transparency','Accuracy','Confidentiality'],
  ARRAY['Count, record and bank offerings and tithes','Review department requisitions against the budget','Prepare monthly financial reports','Keep receipts and financial records'],
  ARRAY['Two people present for every count','Monthly report to the Apostle and Pastors','Every payment backed by an approved requisition and receipt'],
  '#7a5c1e', 'Landmark', 100),
('administration', 'Administration', 'Keep the church organized, connected and running smoothly so every ministry can thrive.',
  ARRAY['Order','Diligence','Confidentiality','Service'],
  ARRAY['Keep membership and church records','Coordinate church calendar and venue bookings','Handle correspondence and communication','Support departments with administration'],
  ARRAY['Records kept up to date','Calendar published monthly','Confidential records protected'],
  '#4a4e69', 'ClipboardList', 110)
ON CONFLICT (slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';

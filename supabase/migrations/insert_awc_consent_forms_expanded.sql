-- PLCC Children's Ministry — expanded e-sign consent forms
-- Idempotent: skips titles that already exist.
-- Run in Supabase SQL Editor after deploy.

INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days, is_active)
SELECT
    'Injury While in Care of the Church',
    'medical',
    E'INJURY WHILE IN CARE OF THE CHURCH\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nThis form covers what happens if your child is injured while in the care of PLCC Children''s Ministry (Sunday School, Kids Church, nursery, youth activities, or church events).\n\nWHILE YOUR CHILD IS IN OUR CARE:\n• Approved ministry leaders supervise activities\n• We aim to provide a safe environment at all times\n• Accidents can still happen during play, crafts, or movement\n\nIF YOUR CHILD IS HURT WHILE IN OUR CARE:\n\nMinor injuries (scrapes, bumps, small cuts):\n• Staff may provide basic first aid\n• We will notify you as soon as practical\n• An incident note may be recorded\n\nSerious injuries or medical emergencies:\n• We will call 911 when needed\n• We will contact you immediately\n• If we cannot reach you, we will contact your emergency contact\n• A staff member will stay with your child until help or a guardian arrives\n\nBY SIGNING, YOU AUTHORIZE PLCC STAFF TO:\n• Provide basic first aid while your child is in church care\n• Call 911 and seek emergency medical help if needed\n• Authorize emergency medical treatment if you cannot be reached in time\n\nPlease keep emergency contacts and medical notes up to date with the church office.\n\nThis consent is valid for one (1) year from the date signed.',
    true,
    true,
    365,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.consent_forms WHERE title = 'Injury While in Care of the Church'
);

INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days, is_active)
SELECT
    'Authorized Pickup / Child Release',
    'custom',
    E'AUTHORIZED PICKUP / CHILD RELEASE\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nYour child''s safety at pickup is our priority. This form confirms who may take your child from Kids Check-In / Children''s Ministry.\n\nPICKUP RULES:\n• A child is released only to a parent/guardian or an authorized adult you list with the church\n• The security code from check-in must be presented at checkout\n• Staff may ask for photo ID if they do not recognize the adult\n• We will not release a child to someone who is not authorized\n\nBY SIGNING, YOU AGREE THAT:\n• You will keep authorized pickup contacts current with PLCC\n• You understand the security-code checkout process\n• You will not share the security code with unauthorized persons\n• You will tell us immediately if pickup authorization changes (custody, banned contacts, etc.)\n\nIf you need to update pickup permissions, contact the church office or Children''s Ministry leaders.\n\nThis consent is valid for one (1) year from the date signed.',
    true,
    true,
    365,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.consent_forms WHERE title = 'Authorized Pickup / Child Release'
);

INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days, is_active)
SELECT
    'Allergy & Special Needs Acknowledgment',
    'medical',
    E'ALLERGY & SPECIAL NEEDS ACKNOWLEDGMENT\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nPlease help us care for your child well. This form confirms you will share allergy, medication, and special-needs information needed for ministry activities.\n\nPLEASE TELL US ABOUT:\n• Food, medicine, insect, or environmental allergies\n• Medications your child takes (and whether staff may remind/assist per your instructions)\n• Medical conditions or limitations for play or outings\n• Sensory, behavioral, or learning needs that help leaders support your child\n• Any “do not” instructions (foods, activities, contacts)\n\nBY SIGNING, YOU ACKNOWLEDGE THAT:\n• You are responsible for providing accurate, up-to-date information\n• PLCC staff will use this information to care for your child during ministry activities\n• You will update the church when allergies or needs change\n• In an emergency, staff will follow PLCC injury/medical procedures and contact you\n\nThis acknowledgment is valid for one (1) year from the date signed.',
    true,
    true,
    365,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.consent_forms WHERE title = 'Allergy & Special Needs Acknowledgment'
);

INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days, is_active)
SELECT
    'Field Trip & Transportation Consent',
    'field_trip',
    E'FIELD TRIP & TRANSPORTATION CONSENT\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nFrom time to time, Children''s or Youth Ministry may offer off-campus activities (service projects, parks, outreach, or special events) and/or church-arranged transportation.\n\nBY SIGNING, YOU AGREE THAT:\n• Your child may participate in approved PLCC off-campus ministry activities when you also receive event-specific details\n• PLCC leaders may transport your child using church or approved volunteer vehicles for those activities\n• You will receive notice of date, location, and timing for each trip when possible\n• Standard PLCC safety, check-in, and pickup rules still apply\n• You may opt your child out of a specific trip by notifying ministry leaders before departure\n\nThis form does not replace event-specific permission slips when leaders require them.\n\nThis consent is valid for one (1) year from the date signed.\n\n(Optional form — activate or require in Consent Management when your ministry needs it.)',
    false,
    true,
    365,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.consent_forms WHERE title = 'Field Trip & Transportation Consent'
);

INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days, is_active)
SELECT
    'Nursery & Early Childhood Care Consent',
    'custom',
    E'NURSERY & EARLY CHILDHOOD CARE CONSENT\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nThank you for entrusting your little one to PLCC nursery and early childhood rooms.\n\nOUR CARE PRACTICES:\n• Approved workers supervise nursery and toddler spaces\n• Diapering and basic care follow church hygiene guidelines\n• Snacks or bottles are given only per parent instructions when provided\n• You will be contacted if your child becomes ill, inconsolable, or needs you\n\nBY SIGNING, YOU AGREE THAT:\n• Your child may be cared for in PLCC nursery / early childhood rooms during services and approved events\n• Staff may provide age-appropriate care (diapering, comforting, supervised play)\n• You will label belongings and share feeding/allergy notes\n• You will pick up promptly using the check-in security process\n\nThis consent is valid for one (1) year from the date signed.\n\n(Optional form — set Required in Consent Management if your nursery policy needs it for every family.)',
    false,
    true,
    365,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.consent_forms WHERE title = 'Nursery & Early Childhood Care Consent'
);

INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days, is_active)
SELECT
    'Overnight / Lock-In Activity Consent',
    'field_trip',
    E'OVERNIGHT / LOCK-IN ACTIVITY CONSENT\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nSome ministry events (lock-ins, retreats, overnight camps) keep children or youth at church or an approved site overnight under PLCC leadership.\n\nBY SIGNING, YOU AGREE THAT:\n• Your child may attend PLCC overnight / lock-in events when you also receive event-specific details\n• Approved leaders will supervise according to PLCC child-safety practices\n• Standard medical, injury, and pickup authorizations still apply\n• You will provide emergency contacts and any medical/allergy notes for the event\n• You may decline a specific overnight event by notifying leaders in advance\n\nLeaders may still require an event-specific permission form for each overnight activity.\n\nThis consent is valid for one (1) year from the date signed.\n\n(Optional form — activate or require in Consent Management when hosting overnight ministry.)',
    false,
    true,
    365,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.consent_forms WHERE title = 'Overnight / Lock-In Activity Consent'
);

SELECT id, title, form_type, is_required, is_active, created_at
FROM public.consent_forms
ORDER BY created_at DESC;

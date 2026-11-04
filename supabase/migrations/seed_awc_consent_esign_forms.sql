-- PLCC Consent / E-Sign suite — injury-in-care expansions
-- Idempotent: inserts only when title is missing.
-- Run in Supabase SQL Editor after deploy.
-- Existing active forms (do not duplicate): Photo & Video Consent,
-- Injury & Accident Consent, Social Media & Online Safety Consent.

-- 1) Injury Incident Acknowledgment (While in Care)
INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days, is_active)
SELECT
    'Injury Incident Acknowledgment (While in Care)',
    'medical',
    E'INJURY INCIDENT ACKNOWLEDGMENT (WHILE IN CARE)\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nThis form explains how PLCC handles injuries that occur while your child is in the care of Children''s Ministry (Sunday School, Kids Church, nursery, youth activities, or church events).\n\nIF YOUR CHILD IS INJURED WHILE IN OUR CARE:\n\nMinor injuries (scrapes, bumps, small cuts):\n• Staff may provide basic first aid\n• You will be notified as soon as practical\n• An incident report will be completed\n\nSerious injuries or medical emergencies:\n• Staff will call 911 when needed\n• You will be contacted immediately\n• If you cannot be reached, your emergency contact will be called\n• A staff member will remain with your child until help or a guardian arrives\n\nBY SIGNING, YOU ACKNOWLEDGE THAT:\n• You understand PLCC''s incident-response and parent-notification process\n• An incident report may be filed for injuries while your child is in church care\n• Photos or videos of an injured child will not be taken or posted\n• You will keep emergency contacts up to date with the church office\n\nRelated policy: Child Injury & Incident Policy in the Vault Playbook (/admin/policies).\n\nThis acknowledgment is valid for one (1) year from the date signed.',
    true,
    true,
    365,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.consent_forms WHERE title = 'Injury Incident Acknowledgment (While in Care)'
);

-- 2) Emergency Medical Treatment Authorization
INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days, is_active)
SELECT
    'Emergency Medical Treatment Authorization',
    'medical',
    E'EMERGENCY MEDICAL TREATMENT AUTHORIZATION\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nIn a medical emergency, minutes matter. This form authorizes PLCC staff to seek emergency care if you cannot be reached in time.\n\nBY SIGNING, YOU AUTHORIZE PLCC STAFF TO:\n• Call 911 and request emergency medical services\n• Arrange transport to the nearest appropriate emergency facility\n• Authorize emergency medical treatment if you or your emergency contact cannot be reached\n• Share known allergy / medical notes with emergency responders\n\nYOU AGREE THAT:\n• You will provide current emergency contacts and medical information\n• You remain financially responsible for medical care provided to your child\n• This authorization applies while your child is in PLCC Children''s Ministry care or on approved ministry activities\n\nThis authorization is valid for one (1) year from the date signed.',
    true,
    true,
    365,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.consent_forms WHERE title = 'Emergency Medical Treatment Authorization'
);

-- 3) Allergy & Health Information Consent
INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days, is_active)
SELECT
    'Allergy & Health Information Consent',
    'medical',
    E'ALLERGY & HEALTH INFORMATION CONSENT\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nPlease help us care for your child well. This form confirms you will share allergy, medication, and health information needed for ministry activities.\n\nPLEASE TELL THE CHURCH ABOUT:\n• Food, medicine, insect, or environmental allergies\n• Medications your child takes\n• Medical conditions or limitations for play or outings\n• Sensory, behavioral, or learning needs that help leaders support your child\n• Any “do not” instructions (foods, activities, contacts)\n\nBY SIGNING, YOU ACKNOWLEDGE THAT:\n• You are responsible for providing accurate, up-to-date information\n• PLCC staff may rely on the health information you provide during ministry activities\n• You will update the church when allergies or needs change\n• In an emergency, staff will follow PLCC injury/medical procedures and contact you\n\nThis consent is valid for one (1) year from the date signed.',
    true,
    true,
    365,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.consent_forms WHERE title = 'Allergy & Health Information Consent'
);

-- 4) Nursery & Childcare Drop-Off Agreement
INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days, is_active)
SELECT
    'Nursery & Childcare Drop-Off Agreement',
    'general_liability',
    E'NURSERY & CHILDCARE DROP-OFF AGREEMENT\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nThank you for entrusting your child to PLCC nursery and childcare rooms.\n\nDROP-OFF & PICKUP:\n• Children are checked in through Kids Check-In (/events/kids-checkin)\n• You (or an authorized adult) must keep the security code for pickup\n• Staff release children only to authorized adults with the matching code\n• Pick up promptly at the end of the service or event\n\nOUR CARE PRACTICES:\n• Approved workers supervise nursery and childcare spaces\n• Diapering and basic care follow church hygiene guidelines\n• Snacks or bottles are given only per parent instructions when provided\n• You will be contacted if your child becomes ill, inconsolable, or needs you\n\nBY SIGNING, YOU AGREE THAT:\n• Your child may be cared for in PLCC nursery / childcare rooms during services and approved events\n• You will label belongings and share feeding/allergy notes\n• You understand the security-code checkout process\n• You will keep authorized pickup contacts current\n\nThis agreement is valid for one (1) year from the date signed.',
    true,
    true,
    365,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.consent_forms WHERE title = 'Nursery & Childcare Drop-Off Agreement'
);

-- 5) Field Trip & Transportation Permission
INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days, is_active)
SELECT
    'Field Trip & Transportation Permission',
    'field_trip',
    E'FIELD TRIP & TRANSPORTATION PERMISSION\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nFrom time to time, Children''s or Youth Ministry may offer off-campus activities (service projects, parks, outreach, or special events) and/or church-arranged transportation.\n\nBY SIGNING, YOU AGREE THAT:\n• Your child may participate in approved PLCC off-campus ministry activities when you also receive event-specific details\n• PLCC leaders may transport your child using church or approved volunteer vehicles for those activities\n• You will receive notice of date, location, and timing for each trip when possible\n• Standard PLCC safety, check-in, and pickup rules still apply\n• Staff may seek emergency medical care for your child if needed during the trip\n• You may opt your child out of a specific trip by notifying ministry leaders before departure\n\nThis form does not replace event-specific permission slips when leaders require them.\n\nThis permission is valid for one (1) year from the date signed.',
    true,
    true,
    365,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.consent_forms WHERE title = 'Field Trip & Transportation Permission'
);

-- 6) General Liability & Assumption of Risk
-- Older seeds may have deactivated this title — reactivate if present, else insert.
UPDATE public.consent_forms
SET
    is_active = true,
    is_required = true,
    requires_signature = true,
    valid_duration_days = 365,
    form_type = 'general_liability',
    content = E'GENERAL LIABILITY & ASSUMPTION OF RISK\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nAWC Children''s Ministry activities may include indoor/outdoor play, crafts, music, sports, and special events. We take reasonable steps to provide a safe environment, but risk cannot be eliminated entirely.\n\nBY SIGNING, YOU ACKNOWLEDGE THAT:\n• You understand inherent risks of childhood activities (falls, bumps, scrapes, sports contact, etc.)\n• You voluntarily allow your child to participate in PLCC Children''s Ministry activities\n• You release PLCC, its staff, and volunteers from liability for ordinary negligence to the fullest extent allowed by law\n• This does not waive claims for intentional misconduct or gross negligence\n• You will follow church safety and check-in procedures\n\nQuestions about this form may be directed to the church office or Children''s Ministry Lead.\n\nThis acknowledgment is valid for one (1) year from the date signed.',
    updated_at = now()
WHERE title = 'General Liability & Assumption of Risk';

INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days, is_active)
SELECT
    'General Liability & Assumption of Risk',
    'general_liability',
    E'GENERAL LIABILITY & ASSUMPTION OF RISK\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nAWC Children''s Ministry activities may include indoor/outdoor play, crafts, music, sports, and special events. We take reasonable steps to provide a safe environment, but risk cannot be eliminated entirely.\n\nBY SIGNING, YOU ACKNOWLEDGE THAT:\n• You understand inherent risks of childhood activities (falls, bumps, scrapes, sports contact, etc.)\n• You voluntarily allow your child to participate in PLCC Children''s Ministry activities\n• You release PLCC, its staff, and volunteers from liability for ordinary negligence to the fullest extent allowed by law\n• This does not waive claims for intentional misconduct or gross negligence\n• You will follow church safety and check-in procedures\n\nQuestions about this form may be directed to the church office or Children''s Ministry Lead.\n\nThis acknowledgment is valid for one (1) year from the date signed.',
    true,
    true,
    365,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.consent_forms WHERE title = 'General Liability & Assumption of Risk'
);

-- 7) Code of Conduct (Children & Guardians)
INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days, is_active)
SELECT
    'Code of Conduct (Children & Guardians)',
    'custom',
    E'CODE OF CONDUCT (CHILDREN & GUARDIANS)\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nAWC Children''s Ministry is a place of worship, learning, and community. This Code of Conduct sets shared expectations for children and the adults who bring them.\n\nFOR CHILDREN, WE EXPECT:\n• Respect for leaders, peers, and church property\n• Kind words and hands — no bullying, hitting, or harmful language\n• Listening during teaching and group activities\n• Staying with the group unless a leader gives permission\n\nFOR PARENTS / GUARDIANS, WE ASK THAT YOU:\n• Support leaders and reinforce respectful behavior\n• Keep contact information and authorized pickup lists current\n• Pick up on time using the check-in security process\n• Share needs that help us support your child well\n• Address concerns directly with ministry leaders, not on social media\n\nBY SIGNING, YOU AGREE TO PARTNER WITH PLCC ON THESE EXPECTATIONS.\nRepeated unsafe or disruptive behavior may result in a parent being called and temporary removal from an activity for safety.\n\nThis agreement is valid for one (1) year from the date signed.',
    true,
    true,
    365,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.consent_forms WHERE title = 'Code of Conduct (Children & Guardians)'
);

-- Verification
SELECT id, title, form_type, is_required, is_active, created_at
FROM public.consent_forms
WHERE is_active = true
ORDER BY title;

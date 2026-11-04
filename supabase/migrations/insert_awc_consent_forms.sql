-- PLCC Children's Ministry Consent Forms
-- Run this in Supabase SQL Editor

INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days, is_active)
VALUES (
    'Photo & Video Consent',
    'photo_release',
    E'PHOTO & VIDEO CONSENT FORM\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nWe love capturing the joy of our children during Sunday School, Kids Church, and special events. We would love to include your child in photos and videos we take.\n\nWHAT WE USE PHOTOS/VIDEOS FOR:\n• Church social media (Facebook, Instagram)\n• Our church website and bulletin\n• Ministry presentations and slideshows\n• Fundraising and outreach materials\n\nWHAT WE PROMISE:\n• We will NEVER share your child''s full name alongside their photo publicly\n• We will NEVER sell or share images with outside organizations\n• We will treat all images with care and respect\n• You can ask us to remove any photo at any time\n\nBy signing this form, you are giving PLCC permission to photograph and/or video record your child during church activities.\n\nThis consent is valid for one (1) year from the date signed.',
    true,
    true,
    365,
    true
);

INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days, is_active)
VALUES (
    'Injury & Accident Consent',
    'medical',
    E'INJURY & ACCIDENT CONSENT FORM\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nWe take the safety of every child very seriously. However, accidents can happen during play and activities. This form lets us know how to handle situations if your child is hurt while in our care.\n\nIF YOUR CHILD IS INJURED:\n\nMinor Injuries (scrapes, bumps, small cuts):\n• Our staff will provide basic first aid\n• We will notify you as soon as possible\n• An incident report will be filled out\n\nSerious Injuries or Medical Emergencies:\n• We will call 911 immediately\n• We will contact you right away\n• If we cannot reach you, we will contact your emergency contact\n• Staff will stay with your child until help arrives\n\nBY SIGNING THIS FORM, YOU AGREE THAT:\n• PLCC staff may administer basic first aid to your child\n• PLCC staff may call 911 in a medical emergency\n• PLCC staff may authorize emergency medical treatment if you cannot be reached\n• You will keep your emergency contact information up to date with us\n\nPLEASE TELL US ABOUT:\n• Any allergies your child has (food, medicine, bee stings, etc.)\n• Any medical conditions we should know about\n• Any medications your child takes\n\nThis consent is valid for one (1) year from the date signed.',
    true,
    true,
    365,
    true
);

INSERT INTO public.consent_forms (title, form_type, content, is_required, requires_signature, valid_duration_days, is_active)
VALUES (
    'Social Media & Online Safety Consent',
    'custom',
    E'SOCIAL MEDIA & ONLINE SAFETY CONSENT FORM\nPromised Land Christian Center (PLCC) — Children''s Ministry\n\nDear Parent or Guardian,\n\nAs our ministry grows, we sometimes use online platforms for kids'' programs including live streams, online Bible classes, and digital resources. This form covers how we handle your child''s online presence.\n\nONLINE ACTIVITIES YOUR CHILD MAY PARTICIPATE IN:\n• Live-streamed Sunday School or Kids Church services\n• Online Bible study groups (Zoom or similar)\n• Digital worksheets and activity links sent to parents\n• Church app or online portal access\n\nHOW WE PROTECT YOUR CHILD ONLINE:\n• We NEVER share personal information (address, phone, school name) online\n• All online sessions are supervised by approved ministry leaders\n• We do not allow children to use personal social media during church activities\n• Screen recordings of children are not permitted by other participants\n\nWHAT WE ASK OF PARENTS:\n• Supervise your child during any online church activities at home\n• Let us know if your child experiences anything uncomfortable online\n• Keep your child''s login details private\n\nBY SIGNING THIS FORM, YOU AGREE THAT:\n• Your child may appear in live-streamed church services\n• PLCC may send digital resources and links to your email for your child\n• You understand PLCC''s online safety guidelines\n\nYou may opt out of online activities at any time by contacting the church office.\n\nThis consent is valid for one (1) year from the date signed.',
    true,
    true,
    365,
    true
);

SELECT id, title, form_type, is_active, created_at FROM public.consent_forms ORDER BY created_at DESC;

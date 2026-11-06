/** Default Children's Ministry e-sign templates (idempotent seed). */
export type DefaultConsentForm = {
  title: string;
  form_type: string;
  content: string;
  is_required: boolean;
  requires_signature: boolean;
  valid_duration_days: number;
  audience: 'children' | 'adults' | 'all';
};

export const DEFAULT_CONSENT_FORMS: DefaultConsentForm[] = [
  {
    title: 'Photo & Video Consent',
    form_type: 'photo_release',
    audience: 'children',
    content: `PHOTO & VIDEO CONSENT FORM
Promised Land Christian Center (PLCC) — Children's Ministry

Dear Parent or Guardian,

We love capturing the joy of our children during Sunday School, Kids Church, and special events. We would love to include your child in photos and videos we take.

WHAT WE USE PHOTOS/VIDEOS FOR:
• Church social media (Facebook, Instagram)
• Our church website and bulletin
• Ministry presentations and slideshows
• Fundraising and outreach materials

WHAT WE PROMISE:
• We will NEVER share your child's full name alongside their photo publicly
• We will NEVER sell or share images with outside organizations
• We will treat all images with care and respect
• You can ask us to remove any photo at any time

By signing this form, you are giving PLCC permission to photograph and/or video record your child during church activities.

This consent is valid for one (1) year from the date signed.`,
    is_required: true,
    requires_signature: true,
    valid_duration_days: 365,
  },
  {
    title: 'Injury & Accident Consent',
    form_type: 'medical',
    audience: 'children',
    content: `INJURY & ACCIDENT CONSENT FORM
Promised Land Christian Center (PLCC) — Children's Ministry

Dear Parent or Guardian,

We take the safety of every child very seriously. However, accidents can happen during play and activities. This form lets us know how to handle situations if your child is hurt while in our care.

IF YOUR CHILD IS INJURED:

Minor Injuries (scrapes, bumps, small cuts):
• Our staff will provide basic first aid
• We will notify you as soon as possible
• An incident report will be filled out

Serious Injuries or Medical Emergencies:
• We will call 911 immediately
• We will contact you right away
• If we cannot reach you, we will contact your emergency contact
• Staff will stay with your child until help arrives

BY SIGNING THIS FORM, YOU AGREE THAT:
• PLCC staff may administer basic first aid to your child
• PLCC staff may call 911 in a medical emergency
• PLCC staff may authorize emergency medical treatment if you cannot be reached
• You will keep your emergency contact information up to date with us

PLEASE TELL US ABOUT:
• Any allergies your child has (food, medicine, bee stings, etc.)
• Any medical conditions we should know about
• Any medications your child takes

This consent is valid for one (1) year from the date signed.`,
    is_required: true,
    requires_signature: true,
    valid_duration_days: 365,
  },
  {
    title: 'Premises Injury & Parent Supervision Consent',
    form_type: 'general_liability',
    audience: 'all',
    content: `PREMISES INJURY & PARENT SUPERVISION CONSENT
Promised Land Christian Center (PLCC)

Fellowship cookouts and church-campus gatherings include outdoor play, running, games, and shared spaces. Children may get scrapes, bumps, or other injuries while playing.

PARENT SUPERVISION
• Parents / guardians are responsible for watching their own children on church grounds during fellowship cookouts and similar open events
• PLCC does not provide one-to-one childcare for every child at open fellowship events unless a separate Kids Check-In / nursery program is running
• You agree to keep your children in sight and follow leader directions about safe play areas

IF A CHILD IS HURT
• You will be notified right away when possible
• Basic first aid may be given
• Emergency services (911) may be called for serious injury
• You remain responsible for medical decisions and costs for your child

IMPORTANT
Play on church premises involves risk of injury. You are responsible for supervising your own children at this event. You will not hold Promised Land Christian Center, its leaders, staff, or volunteers liable for ordinary accidents or injuries while your children are under your care on the premises. Tell leaders about medical conditions that affect safe play. This does not replace other children's ministry consents used during supervised Kids Check-In or nursery care.

IN CASE OF AN EMERGENCY
For serious injury on church premises:

CALL 911 IMMEDIATELY

Then notify church leaders right away.

This consent is valid for one (1) year from the date signed, and applies to fellowship cookouts and similar campus gatherings.`,
    is_required: true,
    requires_signature: true,
    valid_duration_days: 365,
  },
  {
    title: 'Social Media & Online Safety Consent',
    form_type: 'custom',
    audience: 'children',
    content: `SOCIAL MEDIA & ONLINE SAFETY CONSENT FORM
Promised Land Christian Center (PLCC) — Children's Ministry

Dear Parent or Guardian,

As our ministry grows, we sometimes use online platforms for kids' programs including live streams, online Bible classes, and digital resources. This form covers how we handle your child's online presence.

ONLINE ACTIVITIES YOUR CHILD MAY PARTICIPATE IN:
• Live-streamed Sunday School or Kids Church services
• Online Bible study groups (Zoom or similar)
• Digital worksheets and activity links sent to parents
• Church app or online portal access

HOW WE PROTECT YOUR CHILD ONLINE:
• We NEVER share personal information (address, phone, school name) online
• All online sessions are supervised by approved ministry leaders
• We do not allow children to use personal social media during church activities
• Screen recordings of children are not permitted by other participants

WHAT WE ASK OF PARENTS:
• Supervise your child during any online church activities at home
• Let us know if your child experiences anything uncomfortable online
• Keep your child's login details private

BY SIGNING THIS FORM, YOU AGREE THAT:
• Your child may appear in live-streamed church services
• PLCC may send digital resources and links to your email for your child
• You understand PLCC's online safety guidelines

You may opt out of online activities at any time by contacting the church office.

This consent is valid for one (1) year from the date signed.`,
    is_required: true,
    requires_signature: true,
    valid_duration_days: 365,
  },
  {
    title: 'Injury Incident Acknowledgment (While in Care)',
    form_type: 'medical',
    audience: 'children',
    content: `INJURY INCIDENT ACKNOWLEDGMENT (WHILE IN CARE)
Promised Land Christian Center (PLCC) — Children's Ministry

Dear Parent or Guardian,

This form explains how PLCC handles injuries that occur while your child is in the care of Children's Ministry (Sunday School, Kids Church, nursery, youth activities, or church events).

IF YOUR CHILD IS INJURED WHILE IN OUR CARE:

Minor injuries (scrapes, bumps, small cuts):
• Staff may provide basic first aid
• You will be notified as soon as practical
• An incident report will be completed

Serious injuries or medical emergencies:
• Staff will call 911 when needed
• You will be contacted immediately
• If you cannot be reached, your emergency contact will be called
• A staff member will remain with your child until help or a guardian arrives

BY SIGNING, YOU ACKNOWLEDGE THAT:
• You understand PLCC's incident-response and parent-notification process
• An incident report may be filed for injuries while your child is in church care
• Photos or videos of an injured child will not be taken or posted
• You will keep emergency contacts up to date with the church office

Related policy: Child Injury & Incident Policy in PLCC Canaan Playbook (/admin/policies).

This acknowledgment is valid for one (1) year from the date signed.`,
    is_required: true,
    requires_signature: true,
    valid_duration_days: 365,
  },
  {
    title: 'Emergency Medical Treatment Authorization',
    form_type: 'medical',
    audience: 'children',
    content: `EMERGENCY MEDICAL TREATMENT AUTHORIZATION
Promised Land Christian Center (PLCC) — Children's Ministry

Dear Parent or Guardian,

In a medical emergency, minutes matter. This form authorizes PLCC staff to seek emergency care if you cannot be reached in time.

BY SIGNING, YOU AUTHORIZE PLCC STAFF TO:
• Call 911 and request emergency medical services
• Arrange transport to the nearest appropriate emergency facility
• Authorize emergency medical treatment if you or your emergency contact cannot be reached
• Share known allergy / medical notes with emergency responders

YOU AGREE THAT:
• You will provide current emergency contacts and medical information
• You remain financially responsible for medical care provided to your child
• This authorization applies while your child is in PLCC Children's Ministry care or on approved ministry activities

This authorization is valid for one (1) year from the date signed.`,
    is_required: true,
    requires_signature: true,
    valid_duration_days: 365,
  },
  {
    title: 'Allergy & Health Information Consent',
    form_type: 'medical',
    audience: 'children',
    content: `ALLERGY & HEALTH INFORMATION CONSENT
Promised Land Christian Center (PLCC) — Children's Ministry

Dear Parent or Guardian,

Please help us care for your child well. This form confirms you will share allergy, medication, and health information needed for ministry activities.

PLEASE TELL THE CHURCH ABOUT:
• Food, medicine, insect, or environmental allergies
• Medications your child takes
• Medical conditions or limitations for play or outings
• Sensory, behavioral, or learning needs that help leaders support your child
• Any "do not" instructions (foods, activities, contacts)

BY SIGNING, YOU ACKNOWLEDGE THAT:
• You are responsible for providing accurate, up-to-date information
• PLCC staff may rely on the health information you provide during ministry activities
• You will update the church when allergies or needs change
• In an emergency, staff will follow PLCC injury/medical procedures and contact you

This consent is valid for one (1) year from the date signed.`,
    is_required: true,
    requires_signature: true,
    valid_duration_days: 365,
  },
  {
    title: 'Food Allergy Consent',
    form_type: 'medical',
    audience: 'all',
    content: `FOOD ALLERGY & MEAL SAFETY NOTICE
Promised Land Christian Center (PLCC)

At Promised Land Christian Center, we care deeply about the health and safety of every child and family in our church community. Some meals and snacks served at church may contain common food allergens.

FOODS COMMONLY SERVED
• Rice
• Potatoes
• Meat
• Chicken

These foods may contain or come into contact with allergens such as peanuts, tree nuts, milk, eggs, soy, wheat, fish, or shellfish.

PLEASE HELP US PREVENT ALLERGIC REACTIONS
• Always ask about ingredients before eating
• Do not share food with others
• Supervise children closely during meals and snacks
• Inform church staff immediately of any known allergies
• Keep emergency medication (such as an EpiPen) available if prescribed

IMPORTANT
Promised Land Christian Center cannot guarantee an allergen-free environment. Parents and guardians remain responsible for monitoring what their children eat while on church premises. Please also tell the church about any food allergies, severity, and emergency medicine needs, and update us if allergies change.

IN CASE OF AN EMERGENCY
If someone shows signs of an allergic reaction — such as difficulty breathing, swelling, hives, or dizziness:

CALL 911 IMMEDIATELY

Then notify church staff right away.

This consent is valid for one (1) year from the date signed.`,
    is_required: true,
    requires_signature: true,
    valid_duration_days: 365,
  },
  {
    title: 'Nursery & Childcare Drop-Off Agreement',
    form_type: 'general_liability',
    audience: 'children',
    content: `NURSERY & CHILDCARE DROP-OFF AGREEMENT
Promised Land Christian Center (PLCC) — Children's Ministry

Dear Parent or Guardian,

Thank you for entrusting your child to PLCC nursery and childcare rooms.

DROP-OFF & PICKUP:
• Children are checked in through Kids Check-In (/events/kids-checkin)
• You (or an authorized adult) must keep the security code for pickup
• Staff release children only to authorized adults with the matching code
• Pick up promptly at the end of the service or event

OUR CARE PRACTICES:
• Approved workers supervise nursery and childcare spaces
• Diapering and basic care follow church hygiene guidelines
• Snacks or bottles are given only per parent instructions when provided
• You will be contacted if your child becomes ill, inconsolable, or needs you

BY SIGNING, YOU AGREE THAT:
• Your child may be cared for in PLCC nursery / childcare rooms during services and approved events
• You will label belongings and share feeding/allergy notes
• You understand the security-code checkout process
• You will keep authorized pickup contacts current

This agreement is valid for one (1) year from the date signed.`,
    is_required: true,
    requires_signature: true,
    valid_duration_days: 365,
  },
  {
    title: 'Field Trip & Transportation Permission',
    form_type: 'field_trip',
    audience: 'children',
    content: `FIELD TRIP & TRANSPORTATION PERMISSION
Promised Land Christian Center (PLCC) — Children's Ministry

Dear Parent or Guardian,

From time to time, Children's or Youth Ministry may offer off-campus activities (service projects, parks, outreach, or special events) and/or church-arranged transportation.

BY SIGNING, YOU AGREE THAT:
• Your child may participate in approved PLCC off-campus ministry activities when you also receive event-specific details
• PLCC leaders may transport your child using church or approved volunteer vehicles for those activities
• You will receive notice of date, location, and timing for each trip when possible
• Standard PLCC safety, check-in, and pickup rules still apply
• Staff may seek emergency medical care for your child if needed during the trip
• You may opt your child out of a specific trip by notifying ministry leaders before departure

This form does not replace event-specific permission slips when leaders require them.

This permission is valid for one (1) year from the date signed.`,
    is_required: true,
    requires_signature: true,
    valid_duration_days: 365,
  },
  {
    title: 'General Liability & Assumption of Risk',
    form_type: 'general_liability',
    audience: 'children',
    content: `GENERAL LIABILITY & ASSUMPTION OF RISK
Promised Land Christian Center (PLCC) — Children's Ministry

Dear Parent or Guardian,

PLCC Children's Ministry activities may include indoor/outdoor play, crafts, music, sports, and special events. We take reasonable steps to provide a safe environment, but risk cannot be eliminated entirely.

BY SIGNING, YOU ACKNOWLEDGE THAT:
• You understand inherent risks of childhood activities (falls, bumps, scrapes, sports contact, etc.)
• You voluntarily allow your child to participate in PLCC Children's Ministry activities
• You release PLCC, its staff, and volunteers from liability for ordinary negligence to the fullest extent allowed by law
• This does not waive claims for intentional misconduct or gross negligence
• You will follow church safety and check-in procedures

Questions about this form may be directed to the church office or Children's Ministry Lead.

This acknowledgment is valid for one (1) year from the date signed.`,
    is_required: true,
    requires_signature: true,
    valid_duration_days: 365,
  },
  {
    title: 'Code of Conduct (Children & Guardians)',
    form_type: 'custom',
    audience: 'children',
    content: `CODE OF CONDUCT (CHILDREN & GUARDIANS)
Promised Land Christian Center (PLCC) — Children's Ministry

Dear Parent or Guardian,

PLCC Children's Ministry is a place of worship, learning, and community. This Code of Conduct sets shared expectations for children and the adults who bring them.

FOR CHILDREN, WE EXPECT:
• Respect for leaders, peers, and church property
• Kind words and hands — no bullying, hitting, or harmful language
• Listening during teaching and group activities
• Staying with the group unless a leader gives permission

FOR PARENTS / GUARDIANS, WE ASK THAT YOU:
• Support leaders and reinforce respectful behavior
• Keep contact information and authorized pickup lists current
• Pick up on time using the check-in security process
• Share needs that help us support your child well
• Address concerns directly with ministry leaders, not on social media

BY SIGNING, YOU AGREE TO PARTNER WITH PLCC ON THESE EXPECTATIONS.
Repeated unsafe or disruptive behavior may result in a parent being called and temporary removal from an activity for safety.

This agreement is valid for one (1) year from the date signed.`,
    is_required: true,
    requires_signature: true,
    valid_duration_days: 365,
  },

  // ── Adults (self-sign; not required for kids check-in) ──
  {
    title: 'Adult Incident Acknowledgment',
    form_type: 'medical',
    audience: 'adults',
    content: `ADULT INCIDENT ACKNOWLEDGMENT
Promised Land Christian Center (PLCC)

This form is for adults (members, volunteers, guests, or staff) who were involved in, witnessed, or were briefed about an injury, medical event, or safety incident at PLCC or during an PLCC activity.

IF AN INCIDENT OCCURS INVOLVING YOU OR ANOTHER ADULT:

Immediate response:
• Assess safety — call 911 for unconsciousness, difficulty breathing, severe bleeding, suspected broken bones, serious head injury, or when in doubt
• Notify the ministry lead, event supervisor, or church leadership on duty
• Do not leave an injured person unattended when help is needed
• Only trained, currently certified first aid/CPR personnel should provide first aid beyond basic comfort measures (ice pack, pressure on a minor cut)

Documentation & follow-up:
• An incident report should be completed before the end of the event when possible
• Serious incidents are reported to the Lead Pastor and Church Administrator within 24 hours
• Insurance may be notified for serious events per church policy

No-photo rule:
• Do not photograph or video record an injured person or the incident scene for social media or personal use

BY SIGNING, YOU ACKNOWLEDGE THAT:
• You understand PLCC's adult / volunteer incident-response expectations
• You will report incidents promptly to leadership and cooperate with any follow-up
• You will keep your emergency contact information reasonably current with the church office when serving or attending events
• This acknowledgment does not replace medical advice or insurance coverage

Related guidance: Child Injury & Incident Policy (for children's ministry) and church leadership for adult-campus incidents — see PLCC Canaan Playbook (/admin/policies).

This acknowledgment is valid for one (1) year from the date signed.`,
    is_required: false,
    requires_signature: true,
    valid_duration_days: 365,
  },
  {
    title: 'Volunteer Liability & Assumption of Risk',
    form_type: 'general_liability',
    audience: 'adults',
    content: `VOLUNTEER LIABILITY & ASSUMPTION OF RISK
Promised Land Christian Center (PLCC)

Thank you for serving. Volunteer activities may include lifting, setup/teardown, outdoor events, transportation support, children's ministry assistance, worship/media roles, and other on- or off-campus ministry work. PLCC takes reasonable steps to provide a safe environment, but risk cannot be eliminated entirely.

BY SIGNING, YOU ACKNOWLEDGE THAT:
• You understand there are inherent risks in volunteer service (slips, strains, equipment, weather, travel, interpersonal conflict, etc.)
• You voluntarily choose to serve and assume those ordinary risks
• You release PLCC, its staff, and fellow volunteers from liability for ordinary negligence to the fullest extent allowed by law
• This does not waive claims for intentional misconduct or gross negligence
• You will follow church safety, check-in, and supervision procedures that apply to your role
• You will report hazards and incidents promptly to leadership

Questions may be directed to the church office or your ministry lead.

This acknowledgment is valid for one (1) year from the date signed.`,
    is_required: false,
    requires_signature: true,
    valid_duration_days: 365,
  },
  {
    title: 'Adult Photo & Media Release',
    form_type: 'photo_release',
    audience: 'adults',
    content: `ADULT PHOTO & MEDIA RELEASE
Promised Land Christian Center (PLCC)

PLCC may photograph or video record services, events, and ministry activities. Crowd and worship moments may appear in church communications. This form records your written consent for use of your likeness in ministry media.

WHAT WE MAY USE PHOTOS/VIDEOS FOR:
• Church social media (Facebook, Instagram, etc.)
• Church website, bulletin, and announcements
• Ministry presentations, fundraising, and outreach materials

WHAT WE PROMISE:
• We will treat images with care and respect
• We will not sell your image to outside organizations
• You may ask us to remove a specific photo of you when reasonably possible

BY SIGNING, YOU GIVE PLCC PERMISSION to photograph and/or video record you during church activities and to use those images as described above.

Related policy: Photography & Media Policy in PLCC Canaan Playbook (/admin/policies).

This consent is valid for one (1) year from the date signed.`,
    is_required: false,
    requires_signature: true,
    valid_duration_days: 365,
  },
  {
    title: 'Adult Ministry Code of Conduct',
    form_type: 'custom',
    audience: 'adults',
    content: `ADULT MINISTRY CODE OF CONDUCT
Promised Land Christian Center (PLCC)

Serving at PLCC is a privilege and a responsibility. This Code of Conduct sets expectations for adult volunteers and serving members.

WE EXPECT SERVING ADULTS TO:
• Treat everyone with dignity — no harassment, bullying, or inappropriate language
• Respect church property, schedules, and leadership decisions
• Protect privacy — do not share personal or pastoral information without need
• Follow child-protection and check-in rules when serving near minors
• Avoid being alone one-on-one with a child behind closed doors; use open, visible spaces
• Report safety concerns, abuse suspicions, or policy violations promptly to leadership
• Represent PLCC well online and in person while serving in ministry roles

BY SIGNING, YOU AGREE TO FOLLOW THESE EXPECTATIONS while volunteering or serving at PLCC.
Repeated or serious violations may result in removal from a serving role.

This agreement is valid for one (1) year from the date signed.`,
    is_required: false,
    requires_signature: true,
    valid_duration_days: 365,
  },
];

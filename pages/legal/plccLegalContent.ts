/**
 * PLCC Terms of Service and Privacy Policy (Nov 2026).
 * Written for a church in Uganda under the Data Protection and Privacy Act, 2019
 * (Cap. 97) and the Data Protection and Privacy Regulations, 2021.
 * Have a Ugandan advocate review before relying on it; update LEGAL_UPDATED when changed.
 */

export const LEGAL_UPDATED = '18 November 2026';
export const CHURCH_NAME = 'Promised Land Christian Center';
export const CHURCH_WHATSAPP = '+256 780 914274';
export const CHURCH_WHATSAPP_LINK = 'https://wa.me/256780914274';
export const APPS = 'PLCC ONE, PLCC Canaan, PLCC Ka Link, Tribes, PLCC Sanctum and the PLCC website';

/** Rendered in order: lead, bullets, paragraphs. */
export type LegalSection = { heading: string; lead?: string; bullets?: string[]; paragraphs?: string[] };

export const PRIVACY_INTRO = `${CHURCH_NAME} ("PLCC", "the church", "we") cares for your privacy as part of caring for you. This policy explains what personal information we collect through ${APPS} (together, "the PLCC apps"), why we collect it, who can see it, and the rights you have under Uganda's Data Protection and Privacy Act, 2019.`;

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: '1. Who is responsible for your information',
    paragraphs: [
      `${CHURCH_NAME}, Uganda, is the data controller for the PLCC apps. For any privacy question or request, contact the church office on WhatsApp at ${CHURCH_WHATSAPP}, or speak to a pastor or church administrator. Ask for the church's data protection contact.`,
    ],
  },
  {
    heading: '2. What we collect',
    bullets: [
      'Account details: your name, mobile number, and email address if you choose to give one. Your password is stored by our sign-in provider in a protected (hashed) form; church staff cannot see it.',
      'Membership details: information in the church records, such as contact details, household, ministries and departments you serve in, attendance, and your role in the church.',
      'What you share: messages, posts, photos, prayer requests, comments and reactions you send in the PLCC apps.',
      'Prayer gatherings (Ka Link): who joined, when, and for how long. Calls are not recorded unless a moderator starts a recording; while recording, everyone sees a red REC sign. Live captions, when you turn them on, are produced by your own phone’s speech service.',
      'Giving: if you give through the PLCC apps, the amount, date and mobile money reference. We never ask for or store your mobile money PIN.',
      'Technical and safety information: device and browser type, failed sign-in attempts (with your number partly hidden), and error reports, so we can keep accounts secure and fix problems.',
      'Reports you send us, for example about scams, harassment or someone pretending to be a church leader, including any screenshots you attach.',
    ],
  },
  {
    heading: '3. Why we use it',
    bullets: [
      'To create and protect your account and confirm that you are a member.',
      'To care for you as a church: pastoral care, prayer, follow-up and fellowship.',
      'To run prayer gatherings, ministries, events, announcements and church communication.',
      'To record giving and provide statements when you ask for them.',
      'To keep the church community safe, including preventing scams and impersonation of the Apostle, pastors and leaders.',
      'To meet our legal obligations in Uganda.',
    ],
    paragraphs: [
      'We process your information with your consent, which you give when you create an account and agree to this policy, or where it is otherwise allowed by the Data Protection and Privacy Act, 2019. You may withdraw your consent at any time (see section 9). We do not use your information for advertising and we never sell it.',
    ],
  },
  {
    heading: '4. Children',
    paragraphs: [
      'Personal information about anyone under 18 is collected only with the consent of a parent or legal guardian, as the Act requires. Children’s ministry records are managed with parents and guardians, and a parent or guardian may ask to see, correct or delete their child’s information at any time.',
    ],
  },
  {
    heading: '5. Who can see your information',
    bullets: [
      'Church leaders and staff, only as much as their ministry role needs (for example, a ministry leader sees their own team).',
      'Other members see what you choose to share with them: your name and photo, and your messages and posts in the rooms you are part of.',
      'Service providers who run the PLCC apps for us, such as database and file storage, website hosting, voice and video calls, text-message sign-in codes and email. They may use your information only to provide their service to the church.',
      'Authorities, only where Ugandan law requires it.',
    ],
  },
  {
    heading: '6. Storage outside Uganda',
    paragraphs: [
      'Some of our service providers store information on secure servers outside Uganda. We choose providers with strong security and data protection standards. By using the PLCC apps you consent to your information being stored and processed outside Uganda for the purposes in this policy, as allowed by section 19 of the Act.',
    ],
  },
  {
    heading: '7. How long we keep it',
    bullets: [
      'Your account and membership details: while you are part of the church, and afterwards only as long as church record-keeping requires, unless you ask us to delete them.',
      'Messages and posts: until you or the room’s leaders delete them.',
      'Prayer gathering recordings: until church leaders delete them. They are kept for reference and are not shared outside the church.',
      'Giving records: as long as needed for church accounts and the law.',
      'Security logs: only as long as needed to keep accounts secure.',
    ],
  },
  {
    heading: '8. How we protect it',
    paragraphs: [
      'Information is sent over encrypted connections, access is limited by role, passwords are never visible to staff, recordings and files are private and opened only through short-lived links, and we review access regularly. No system is perfectly secure. If a breach affects your information, we will inform you and the Personal Data Protection Office as the law requires.',
    ],
  },
  {
    heading: '9. Your rights',
    bullets: [
      'Ask what information we hold about you and get a copy.',
      'Ask us to correct information that is wrong or out of date.',
      'Ask us to delete your information or close your account.',
      'Object to, or ask us to stop, a particular use of your information.',
      'Withdraw your consent at any time. Some features, such as signing in, may then stop working.',
      'Complain to the Personal Data Protection Office (PDPO) of Uganda if you believe your rights have not been respected.',
    ],
    paragraphs: [
      `To use these rights, contact the church office on WhatsApp at ${CHURCH_WHATSAPP}. We may ask you to confirm who you are, and we will respond as soon as we can and within the time the law allows.`,
    ],
  },
  {
    heading: '10. Changes to this policy',
    paragraphs: [
      'We may update this policy as the PLCC apps grow. We will show the new date at the top and, for important changes, tell you in the apps.',
    ],
  },
];

export const TERMS_INTRO = `Welcome to the PLCC apps (${APPS}) of ${CHURCH_NAME} ("PLCC", "the church", "we"). These Terms of Service explain how the apps may be used. By creating an account or using the apps you agree to these terms and to our Privacy Policy.`;

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: '1. Who may use the PLCC apps',
    paragraphs: [
      'The apps are for members, friends and visitors of the church. Some features are only for approved members or for leaders. Anyone under 18 may use the apps only with the permission of a parent or legal guardian.',
    ],
  },
  {
    heading: '2. Your account',
    bullets: [
      'Give your real name and a mobile number that belongs to you.',
      'Keep your password private. Do not share your account; each person needs their own.',
      'You are responsible for what is done with your account. Tell the church office at once if you think someone else is using it.',
    ],
  },
  {
    heading: '3. How we treat one another',
    lead: 'The PLCC apps are an extension of the church family. Speak to one another with love and respect (Ephesians 4:29). You agree not to:',
    bullets: [
      'Harass, insult, threaten or bully anyone, or post hateful, sexual, violent or offensive content.',
      'Pretend to be the Apostle, a pastor, a leader or any other person.',
      'Ask members for money, run collections, sell products or promote schemes, other than the church’s own official giving.',
      'Share anyone’s private information, photos or recordings without their permission.',
      'Spam, spread false information, or share anything illegal under the laws of Uganda.',
      'Try to break into, overload or misuse the apps or other people’s accounts.',
    ],
  },
  {
    heading: '4. Prayer gatherings (Ka Link)',
    bullets: [
      'Moderators lead each gathering. They may mute participants, lock microphones, lower hands, and remove or block anyone who disrupts the prayer.',
      'A gathering may be recorded for church reference. While recording, everyone sees a red REC sign. If you do not wish to be recorded, stay muted or leave the gathering.',
      'Do not record, screenshot or rebroadcast a gathering yourself without the church’s permission.',
    ],
  },
  {
    heading: '5. What you share',
    paragraphs: [
      'You keep ownership of the messages, prayer requests, photos and other content you share. You allow the church to show and store that content inside the PLCC apps so that the people you shared it with can see it. Church leaders may remove content that breaks these terms. Do not share content that belongs to someone else, including music, unless you have the right to.',
    ],
  },
  {
    heading: '6. Giving',
    paragraphs: [
      'Giving through the PLCC apps is voluntary and goes to the church through mobile money or other official channels shown in the apps. The church will never ask for your PIN or ask you to send money to a personal number. If anyone does, it is a scam: report it in the apps or to the church office.',
    ],
  },
  {
    heading: '7. Church content',
    paragraphs: [
      'The apps, their design, and church content such as sermons, music and recordings belong to PLCC or to those who license them to the church. Bible translations are used with the permission of their publishers. Please do not copy or distribute church content outside the church without permission.',
    ],
  },
  {
    heading: '8. Availability and responsibility',
    paragraphs: [
      'We work hard to keep the apps running, but we cannot promise they will always be available or free from errors, and features may change. To the extent allowed by the laws of Uganda, the church is not responsible for losses caused by using or being unable to use the apps, or by what other users post.',
    ],
  },
  {
    heading: '9. Suspending or closing accounts',
    paragraphs: [
      'The church may suspend or close an account that breaks these terms or puts others at risk. You may close your account at any time by contacting the church office.',
    ],
  },
  {
    heading: '10. Laws of Uganda',
    paragraphs: [
      'These terms are governed by the laws of the Republic of Uganda. If a disagreement arises, we will first seek to resolve it together in a spirit of reconciliation (Matthew 18:15). If that is not possible, the courts of Uganda will decide.',
    ],
  },
  {
    heading: '11. Changes and contact',
    paragraphs: [
      `We may update these terms. The date at the top shows the latest version, and continuing to use the apps means you accept the update. Questions? Contact the church office on WhatsApp at ${CHURCH_WHATSAPP}.`,
    ],
  },
];

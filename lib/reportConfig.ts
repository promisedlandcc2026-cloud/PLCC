/**
 * Church-specific wording for the Report dialog (PLCC).
 * ReportForm.tsx is the same file in every app; only this file differs.
 */

export type ReportOption = { value: string; label: string };

export type ReportSourceApp = 'canaan' | 'connect';

export const REPORT_ID_PREFIX = 'plcc-report';

/** Which app has the problem. First entry is the default when the host doesn't say. */
export const REPORT_APP_OPTIONS: ReportOption[] = [
  { value: 'canaan', label: 'PLCC Canaan' },
  { value: 'chat', label: 'Ka Link' },
  { value: 'connect', label: 'Tribes' },
  { value: 'sanctum', label: 'PLCC Sanctum (prayer rooms)' },
];

export const REPORT_GIVING_METHODS: ReportOption[] = [
  { value: 'MTN Mobile Money', label: 'MTN Mobile Money' },
  { value: 'Airtel Money', label: 'Airtel Money' },
  { value: 'Sendwave', label: 'Sendwave' },
  { value: 'Bank transfer', label: 'Bank transfer' },
  { value: 'Card', label: 'Debit or credit card' },
  { value: 'Cash at church', label: 'Cash at church' },
  { value: 'Other', label: 'Other' },
];

export const REPORT_SAFETY_OPTIONS: ReportOption[] = [
  { value: 'impersonation', label: 'Pretending to be the Apostle, a pastor or leader' },
  { value: 'money_request', label: 'Asking me for money' },
  { value: 'money_send', label: 'Asking me to send money or pay a fee' },
  { value: 'pin', label: 'Asking for my mobile money PIN or code' },
  { value: 'scam', label: 'Other scam (fake link, prize, job…)' },
  { value: 'harassment', label: 'Harassment or threats' },
  { value: 'inappropriate', label: 'Inappropriate or sexual messages' },
  { value: 'other', label: 'Something else' },
];

export const REPORT_IMPERSONATED_OPTIONS: ReportOption[] = [
  { value: 'apostle', label: 'The Apostle' },
  { value: 'pastor', label: 'A pastor' },
  { value: 'bishop', label: 'A bishop' },
  { value: 'elder', label: 'An elder' },
  { value: 'minister', label: 'A minister or ministry leader' },
  { value: 'deacon', label: 'A deacon' },
  { value: 'staff', label: 'Church staff or office' },
  { value: 'member', label: 'Another member' },
  { value: 'other', label: 'Someone else' },
];

export const REPORT_WHERE_OPTIONS: ReportOption[] = [
  { value: 'chat', label: 'Ka Link' },
  { value: 'connect', label: 'Tribes' },
  { value: 'canaan', label: 'PLCC Canaan' },
  { value: 'sanctum', label: 'PLCC Sanctum' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'call_sms', label: 'Phone call or SMS' },
  { value: 'social', label: 'Facebook / social media' },
  { value: 'in_person', label: 'In person' },
  { value: 'other', label: 'Somewhere else' },
];

export const REPORT_MONEY_CATEGORIES = ['money_request', 'money_send', 'pin', 'scam', 'impersonation'];

export const REPORT_SAFETY_WARNING =
  'PLCC pastors, the Apostle and church leaders will never ask you privately to send money, pay a fee, or share your mobile money PIN. Do not send money. Stop replying and report it here.';

export const REPORT_MONEY_SENT_TIP =
  'If you sent money by mobile money or bank, call your provider (MTN, Airtel or your bank) right away and ask them to stop or reverse the payment. If you shared your PIN, change it now.';

export const REPORT_MONEY_PLACEHOLDER = 'How much (UGX), and how (MTN, Airtel, Sendwave, bank…)';

export const REPORT_PHONE_PLACEHOLDER = '+256…';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Flag, Loader2, X, CheckCircle2, ShieldAlert, ImagePlus, Trash2 } from 'lucide-react';
import type { ReportRequest } from '../../lib/report';
import { MAX_REPORT_SCREENSHOTS, prepareScreenshot, type ReportScreenshot } from '../../lib/screenshot';
import {
  REPORT_APP_OPTIONS,
  REPORT_GIVING_METHODS,
  REPORT_ID_PREFIX,
  REPORT_IMPERSONATED_OPTIONS,
  REPORT_MONEY_CATEGORIES,
  REPORT_MONEY_PLACEHOLDER,
  REPORT_MONEY_SENT_TIP,
  REPORT_PHONE_PLACEHOLDER,
  REPORT_SAFETY_OPTIONS,
  REPORT_SAFETY_WARNING,
  REPORT_WHERE_OPTIONS,
  type ReportOption,
  type ReportSourceApp,
} from '../../lib/reportConfig';

/**
 * The Report dialog. Same as in AWC Vault, PLCC Canaan and Tribes;
 * church wording lives in lib/reportConfig.ts. The host passes `send`.
 *
 * Problem reports: the member picks what's wrong from a dropdown, then gets
 * questions that fit that choice (Huddle → room, device, microphone…). Answers
 * are sent as [{ q, a }] and listed in the email.
 */

type Question = {
  id: string;
  label: string;
  type: 'select' | 'text';
  options?: ReportOption[];
  placeholder?: string;
  required?: boolean;
  /** Only ask when an earlier answer matches. */
  showIf?: (a: Record<string, string>) => boolean;
};

type Flow = {
  value: string;
  label: string;
  questions: Question[];
  /** Label for the free-text box at the end. */
  detailsLabel: string;
  detailsPlaceholder?: string;
  detailsRequired?: boolean;
  /** Extra note shown under the questions. */
  note?: string;
};

const opts = (...labels: string[]): ReportOption[] => labels.map((l) => ({ value: l, label: l }));

const DEVICE: Question = {
  id: 'device',
  label: 'What are you using?',
  type: 'select',
  options: opts('iPhone', 'Android phone', 'iPad or tablet', 'Computer'),
};
const YES_NO_UNSURE = opts('Yes', 'No', 'Not sure');

const PROBLEM_FLOWS: Flow[] = [
  {
    value: 'huddle',
    label: 'Live Ka Link (prayer calls, audio or video)',
    questions: [
      {
        id: 'issue',
        label: 'What is happening?',
        type: 'select',
        required: true,
        options: opts(
          "I can't join the Ka Link",
          "I can't hear other people",
          "Other people can't hear me",
          'Video or camera not working',
          'It keeps dropping or freezing',
          "I can't mute or unmute",
          'Something else'
        ),
      },
      { id: 'room', label: 'Which room or channel?', type: 'text', placeholder: 'e.g. Morning Prayer' },
      DEVICE,
      {
        id: 'mic',
        label: 'When it asked to use your microphone, did you tap Allow?',
        type: 'select',
        options: YES_NO_UNSURE,
        showIf: (a) => a.issue === "Other people can't hear me" || a.issue === "I can't join the Ka Link",
      },
      { id: 'headphones', label: 'Are you using headphones or Bluetooth?', type: 'select', options: opts('Yes', 'No') },
      {
        id: 'others',
        label: 'Is it happening to other people on the call too?',
        type: 'select',
        options: YES_NO_UNSURE,
      },
    ],
    detailsLabel: 'Anything else we should know? (optional)',
  },
  {
    value: 'messages',
    label: 'Chat or messages',
    questions: [
      {
        id: 'issue',
        label: 'What is happening?',
        type: 'select',
        required: true,
        options: opts(
          "My messages won't send",
          "I'm not seeing new messages",
          "Photos, voice notes or files won't send or open",
          "I can't find a chat, room or person",
          'Something else'
        ),
      },
      { id: 'where', label: 'Which room, channel or person?', type: 'text' },
      { id: 'since', label: 'When did it start?', type: 'text', placeholder: 'e.g. This morning' },
      DEVICE,
    ],
    detailsLabel: 'Anything else we should know? (optional)',
  },
  {
    value: 'notifications',
    label: 'Not getting phone alerts',
    questions: [
      {
        id: 'which',
        label: 'Which alerts are missing?',
        type: 'select',
        required: true,
        options: opts('Messages', 'Ka Links starting', 'Prayer requests', 'Church news and announcements', 'All of them'),
      },
      DEVICE,
      {
        id: 'homescreen',
        label: 'Did you add the app to your home screen?',
        type: 'select',
        options: YES_NO_UNSURE,
      },
      {
        id: 'allowed',
        label: 'Are notifications turned on for the app in your phone settings?',
        type: 'select',
        options: YES_NO_UNSURE,
      },
    ],
    detailsLabel: 'Anything else we should know? (optional)',
  },
  {
    value: 'login',
    label: 'Signing in or my account',
    questions: [
      {
        id: 'issue',
        label: 'What is happening?',
        type: 'select',
        required: true,
        options: opts(
          'The sign-in code never arrives',
          "The code doesn't work",
          'It says my account was not found',
          'It keeps sending me back to sign in',
          'I forgot my password',
          "I'm signed in as the wrong person",
          'Something else'
        ),
      },
      {
        id: 'method',
        label: 'How do you sign in?',
        type: 'select',
        options: opts('Text message code to my phone', 'Email code', 'Email and password', 'Google', 'Not sure'),
      },
      {
        id: 'contact',
        label: 'Phone number or email you sign in with',
        type: 'text',
        placeholder: 'So we can find your account',
      },
    ],
    detailsLabel: 'Anything else we should know? (optional)',
  },
  {
    value: 'giving',
    label: 'Giving, tithes or payments',
    questions: [
      {
        id: 'issue',
        label: 'What is happening?',
        type: 'select',
        required: true,
        options: opts(
          "My payment didn't go through",
          "I was charged but it isn't showing",
          'I was charged twice',
          'The amount is wrong',
          'I need a receipt or giving statement',
          "I can't find where to give",
          'Something else'
        ),
      },
      { id: 'amount', label: 'Amount', type: 'text', placeholder: 'e.g. 50,000' },
      { id: 'date', label: 'Date you gave', type: 'text', placeholder: 'e.g. Sunday, Nov 9' },
      { id: 'method', label: 'How did you give?', type: 'select', options: REPORT_GIVING_METHODS },
    ],
    note: 'Never type a full card number, PIN or password here.',
    detailsLabel: 'Anything else we should know? (optional)',
  },
  {
    value: 'events',
    label: 'Events, RSVP or check-in',
    questions: [
      {
        id: 'issue',
        label: 'What is happening?',
        type: 'select',
        required: true,
        options: opts(
          "I can't RSVP",
          "My RSVP isn't showing",
          'I need to change or cancel my RSVP',
          "I can't check in",
          "The QR code won't scan",
          "My child's check-in or pickup",
          'Something else'
        ),
      },
      { id: 'event', label: 'Which event?', type: 'text' },
    ],
    detailsLabel: 'Anything else we should know? (optional)',
  },
  {
    value: 'profile',
    label: 'My profile or household',
    questions: [
      {
        id: 'issue',
        label: 'What is happening?',
        type: 'select',
        required: true,
        options: opts(
          'Some of my information is wrong',
          "My photo won't upload",
          'A family member is missing from my household',
          'I have two profiles',
          'Something else'
        ),
      },
      {
        id: 'fix',
        label: 'What should it say instead?',
        type: 'text',
        showIf: (a) => a.issue === 'Some of my information is wrong',
      },
      {
        id: 'who',
        label: 'Who is missing?',
        type: 'text',
        showIf: (a) => a.issue === 'A family member is missing from my household',
      },
    ],
    detailsLabel: 'Anything else we should know? (optional)',
  },
  {
    value: 'slow',
    label: 'Slow, stuck or not loading',
    questions: [
      {
        id: 'what',
        label: 'What is slow?',
        type: 'select',
        required: true,
        options: opts('The whole app', 'One page', 'Videos or sermons', 'Pictures', 'It shows a blank screen'),
      },
      { id: 'page', label: 'Which page?', type: 'text', showIf: (a) => a.what === 'One page' },
      { id: 'internet', label: 'Are you on Wi-Fi or mobile data?', type: 'select', options: opts('Wi-Fi', 'Mobile data', 'Not sure') },
      DEVICE,
    ],
    detailsLabel: 'Anything else we should know? (optional)',
  },
  {
    value: 'bug',
    label: 'Something else is broken or shows an error',
    questions: [
      { id: 'doing', label: 'What were you trying to do?', type: 'text', required: true },
      { id: 'error', label: 'Did you see an error message?', type: 'select', options: opts('Yes', 'No') },
      { id: 'errortext', label: 'What did it say?', type: 'text', showIf: (a) => a.error === 'Yes' },
      { id: 'often', label: 'Does it happen every time?', type: 'select', options: opts('Every time', 'Sometimes', 'Only once') },
      DEVICE,
    ],
    detailsLabel: 'Describe what happened',
    detailsRequired: true,
  },
  {
    value: 'idea',
    label: 'I have a suggestion',
    questions: [
      { id: 'idea', label: 'What would you like added or changed?', type: 'text', required: true },
      { id: 'helps', label: 'Who would it help?', type: 'text', placeholder: 'e.g. Parents, youth, elderly members' },
    ],
    detailsLabel: 'Tell us more (optional)',
  },
  {
    value: 'other',
    label: 'Something else',
    questions: [],
    detailsLabel: 'Describe the issue',
    detailsPlaceholder: 'What were you doing, and what went wrong?',
    detailsRequired: true,
  },
];

const CONTENT_REASONS: ReportOption[] = [
  { value: 'impersonation', label: 'Pretending to be a pastor, leader or member' },
  { value: 'money', label: 'Asking for money' },
  { value: 'spam', label: 'Spam or scam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'inappropriate', label: 'Inappropriate or offensive' },
  { value: 'false_info', label: 'False information' },
  { value: 'safety', label: 'Someone may be unsafe' },
  { value: 'other', label: 'Something else' },
];

const CONTENT_NOUN: Record<string, string> = {
  chat_message: 'message',
  dm_message: 'message',
  feed_post: 'post',
  feed_comment: 'comment',
  prayer_request: 'prayer request',
  profile: 'profile',
};

const MONEY_CATEGORIES = new Set(REPORT_MONEY_CATEGORIES);

export type ReportSender = (payload: Record<string, unknown>) => Promise<void>;

type Props = {
  request: ReportRequest;
  /** Which app this dialog is running in. */
  sourceApp: ReportSourceApp;
  send: ReportSender;
  onClose: () => void;
};

const inputCls =
  'w-full min-h-[48px] rounded-xl border border-gray-200 px-3 py-2.5 text-[16px] bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/30';
const labelCls = 'block text-[15px] font-semibold text-gray-800 mb-1.5';

const id = (s: string) => `${REPORT_ID_PREFIX}-${s}`;

function Select({
  fieldId,
  value,
  onChange,
  options,
  placeholder = 'Choose one…',
}: {
  fieldId: string;
  value: string;
  onChange: (v: string) => void;
  options: ReportOption[];
  placeholder?: string;
}) {
  return (
    <select id={fieldId} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export const ReportForm: React.FC<Props> = ({ request, sourceApp, send, onClose }) => {
  const kind = request.kind;
  const [choice, setChoice] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [app, setApp] = useState<string>(
    (request.kind === 'problem' && request.app) ||
      (REPORT_APP_OPTIONS.some((o) => o.value === sourceApp) ? sourceApp : REPORT_APP_OPTIONS[0].value)
  );
  const [details, setDetails] = useState('');
  const [impersonated, setImpersonated] = useState('');
  const [offenderName, setOffenderName] = useState((request.kind === 'safety' && request.offenderName) || '');
  const [offenderContact, setOffenderContact] = useState('');
  const [where, setWhere] = useState('');
  const [happenedAt, setHappenedAt] = useState('');
  const [moneySent, setMoneySent] = useState('');
  const [moneyDetails, setMoneyDetails] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');
  const [shots, setShots] = useState<ReportScreenshot[]>([]);
  const [shotBusy, setShotBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sending, onClose]);

  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const flow = kind === 'problem' ? PROBLEM_FLOWS.find((f) => f.value === choice) || null : null;
  const visibleQuestions = useMemo(
    () => (flow ? flow.questions.filter((q) => !q.showIf || q.showIf(answers)) : []),
    [flow, answers]
  );
  const askMoney = kind === 'safety' && MONEY_CATEGORIES.has(choice);

  const title =
    kind === 'problem'
      ? 'Report a problem'
      : kind === 'safety'
        ? 'Report harassment or a scam'
        : `Report this ${CONTENT_NOUN[request.contentType] || 'item'}`;

  const detailsRequired = kind === 'safety' || Boolean(flow?.detailsRequired);
  const requiredAnswered = visibleQuestions.every((q) => !q.required || Boolean((answers[q.id] || '').trim()));

  const canSend =
    !sending &&
    !shotBusy &&
    Boolean(choice) &&
    requiredAnswered &&
    (!detailsRequired || details.trim().length > 0) &&
    (kind !== 'safety' || choice !== 'impersonation' || Boolean(impersonated));

  const pickChoice = (v: string) => {
    setChoice(v);
    setAnswers({});
    setError('');
  };

  const setAnswer = (qid: string, v: string) => setAnswers((prev) => ({ ...prev, [qid]: v }));

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    const room = MAX_REPORT_SCREENSHOTS - shots.length;
    if (room <= 0) {
      setError(`You can attach up to ${MAX_REPORT_SCREENSHOTS} screenshots.`);
      return;
    }
    setShotBusy(true);
    try {
      const picked = Array.from(files).slice(0, room);
      const ready: ReportScreenshot[] = [];
      for (const f of picked) ready.push(await prepareScreenshot(f));
      setShots((prev) => [...prev, ...ready]);
      if (files.length > room) setError(`Only ${MAX_REPORT_SCREENSHOTS} screenshots can be attached.`);
    } catch (e: any) {
      setError(e?.message || 'Could not add that picture.');
    } finally {
      setShotBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeShot = (i: number) => {
    setShots((prev) => {
      const next = [...prev];
      const [gone] = next.splice(i, 1);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return next;
    });
  };

  const submit = async () => {
    if (!canSend) {
      if (!choice) setError('Please choose what is wrong first.');
      else if (!requiredAnswered) setError('Please answer the questions marked *.');
      else if (detailsRequired && !details.trim()) setError('Please describe what happened.');
      return;
    }
    setSending(true);
    setError('');
    const answerList = visibleQuestions
      .map((q) => {
        const raw = (answers[q.id] || '').trim();
        if (!raw) return null;
        const label = q.options?.find((o) => o.value === raw)?.label || raw;
        return { q: q.label, a: label };
      })
      .filter(Boolean);
    const common: Record<string, unknown> = {
      sourceApp,
      details: details.trim(),
      reporterPhone: reporterPhone.trim(),
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
      screen: `${window.innerWidth}x${window.innerHeight}`,
      screenshots: shots.map((s) => ({ type: s.type, data: s.data })),
    };
    let payload: Record<string, unknown>;
    if (request.kind === 'problem') {
      payload = { kind: 'problem', app, category: choice, answers: answerList, ...common };
    } else if (request.kind === 'safety') {
      payload = {
        kind: 'safety',
        category: choice,
        impersonated: choice === 'impersonation' ? impersonated : '',
        offenderName: offenderName.trim(),
        offenderContact: offenderContact.trim(),
        where,
        happenedAt: happenedAt.trim(),
        moneySent: askMoney ? moneySent : '',
        moneyDetails: askMoney && moneySent === 'yes' ? moneyDetails.trim() : '',
        ...common,
      };
    } else {
      payload = {
        kind: 'content',
        reason: choice,
        contentType: request.contentType,
        contentId: request.contentId || '',
        authorName: request.authorName || '',
        authorId: request.authorId || '',
        contentPreview: (request.contentPreview || '').slice(0, 1500),
        context: request.context || '',
        ...common,
      };
    }
    try {
      await send(payload);
      setSent(true);
    } catch (e: any) {
      setError(e?.message || 'Could not send the report. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const close = () => {
    if (!sending) onClose();
  };

  const choiceOptions: ReportOption[] =
    kind === 'problem' ? PROBLEM_FLOWS.map((f) => ({ value: f.value, label: f.label })) : kind === 'safety' ? REPORT_SAFETY_OPTIONS : CONTENT_REASONS;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={id('title')}
      onClick={close}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 pt-5 pb-3 z-10">
          <div className="flex items-center gap-2">
            {kind === 'safety' ? (
              <ShieldAlert size={20} className="text-red-600" aria-hidden />
            ) : (
              <Flag size={20} className="text-burgundy" aria-hidden />
            )}
            <h2 id={id('title')} className="text-lg font-bold text-gray-900">
              {sent ? 'Thank you' : title}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="p-2.5 -mr-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {sent ? (
          <div className="px-5 pb-6 text-center">
            <CheckCircle2 size={44} className="mx-auto text-green-600 mb-3" aria-hidden />
            <p className="text-[15px] text-gray-700">
              {kind === 'problem'
                ? 'Your report was sent. We will look into it as soon as we can.'
                : 'Your report was sent privately to church leadership. The person you reported will not be told who reported them.'}
            </p>
            {kind === 'safety' && moneySent === 'yes' ? (
              <p className="mt-3 text-[15px] text-gray-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-left">
                {REPORT_MONEY_SENT_TIP}
              </p>
            ) : null}
            <button
              type="button"
              onClick={close}
              className="mt-5 w-full min-h-[52px] rounded-xl bg-burgundy text-white text-[16px] font-semibold"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 pb-5 space-y-4">
            {kind === 'safety' ? (
              <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-[14px] text-red-900 leading-relaxed">
                <strong>Remember:</strong> {REPORT_SAFETY_WARNING}
              </div>
            ) : null}

            {request.kind === 'content' && (request.contentPreview || request.authorName) ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm">
                {request.authorName ? <p className="font-semibold text-gray-800">{request.authorName}</p> : null}
                {request.contentPreview ? (
                  <p className="text-gray-600 line-clamp-3 break-words">{request.contentPreview}</p>
                ) : null}
              </div>
            ) : null}

            {kind === 'problem' ? (
              <div>
                <label className={labelCls} htmlFor={id('app')}>
                  Which app?
                </label>
                <Select fieldId={id('app')} value={app} onChange={setApp} options={REPORT_APP_OPTIONS} />
              </div>
            ) : null}

            <div>
              <label className={labelCls} htmlFor={id('choice')}>
                {kind === 'problem' ? "What's wrong?" : kind === 'safety' ? 'What happened?' : 'Why are you reporting this?'} *
              </label>
              <Select fieldId={id('choice')} value={choice} onChange={pickChoice} options={choiceOptions} />
            </div>

            {/* Follow-up questions for the chosen problem */}
            {flow && visibleQuestions.length ? (
              <div className="space-y-4 rounded-2xl border border-burgundy/10 bg-burgundy/[0.03] p-3.5">
                {visibleQuestions.map((q) => (
                  <div key={q.id}>
                    <label className={labelCls} htmlFor={id(`q-${q.id}`)}>
                      {q.label}
                      {q.required ? ' *' : ''}
                    </label>
                    {q.type === 'select' ? (
                      <Select
                        fieldId={id(`q-${q.id}`)}
                        value={answers[q.id] || ''}
                        onChange={(v) => setAnswer(q.id, v)}
                        options={q.options || []}
                      />
                    ) : (
                      <input
                        id={id(`q-${q.id}`)}
                        value={answers[q.id] || ''}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        maxLength={300}
                        placeholder={q.placeholder}
                        className={inputCls}
                      />
                    )}
                  </div>
                ))}
                {flow.note ? <p className="text-[13px] text-amber-800">{flow.note}</p> : null}
              </div>
            ) : null}

            {kind === 'safety' && choice === 'impersonation' ? (
              <div>
                <label className={labelCls} htmlFor={id('imp')}>
                  Who were they pretending to be? *
                </label>
                <Select fieldId={id('imp')} value={impersonated} onChange={setImpersonated} options={REPORT_IMPERSONATED_OPTIONS} />
              </div>
            ) : null}

            {kind === 'safety' && choice ? (
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls} htmlFor={id('oname')}>
                      Name they used
                    </label>
                    <input
                      id={id('oname')}
                      value={offenderName}
                      onChange={(e) => setOffenderName(e.target.value)}
                      maxLength={120}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor={id('ocontact')}>
                      Their phone, username or link
                    </label>
                    <input
                      id={id('ocontact')}
                      value={offenderContact}
                      onChange={(e) => setOffenderContact(e.target.value)}
                      maxLength={200}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls} htmlFor={id('where')}>
                      Where did it happen?
                    </label>
                    <Select fieldId={id('where')} value={where} onChange={setWhere} options={REPORT_WHERE_OPTIONS} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor={id('when')}>
                      When? (date or time)
                    </label>
                    <input
                      id={id('when')}
                      value={happenedAt}
                      onChange={(e) => setHappenedAt(e.target.value)}
                      maxLength={80}
                      placeholder="e.g. Today, 3pm"
                      className={inputCls}
                    />
                  </div>
                </div>
                {askMoney ? (
                  <div>
                    <p className={labelCls}>Did you send any money?</p>
                    <div className="flex gap-2">
                      {[
                        { v: 'no', l: 'No' },
                        { v: 'yes', l: 'Yes, I sent money' },
                      ].map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setMoneySent(o.v)}
                          className={`flex-1 min-h-[48px] rounded-xl border text-[16px] ${
                            moneySent === o.v ? 'border-burgundy bg-burgundy/5 font-semibold' : 'border-gray-200'
                          }`}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                    {moneySent === 'yes' ? (
                      <input
                        value={moneyDetails}
                        onChange={(e) => setMoneyDetails(e.target.value)}
                        maxLength={200}
                        placeholder={REPORT_MONEY_PLACEHOLDER}
                        className={`${inputCls} mt-2`}
                        aria-label="Amount and how it was sent"
                      />
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}

            {choice ? (
              <>
                <div>
                  <label className={labelCls} htmlFor={id('details')}>
                    {kind === 'problem'
                      ? flow?.detailsLabel || 'Describe the issue'
                      : kind === 'safety'
                        ? 'Tell us what they said or did *'
                        : 'Anything else we should know? (optional)'}
                    {kind === 'problem' && flow?.detailsRequired ? ' *' : ''}
                  </label>
                  <textarea
                    id={id('details')}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    maxLength={4000}
                    rows={3}
                    placeholder={
                      kind === 'problem' ? flow?.detailsPlaceholder || '' : kind === 'safety' ? 'Copy their message if you can.' : ''
                    }
                    className={inputCls}
                  />
                </div>

                <div>
                  <p className={labelCls}>
                    Screenshots <span className="font-normal text-gray-500">(optional, up to {MAX_REPORT_SCREENSHOTS})</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {shots.map((s, i) => (
                      <div key={s.previewUrl} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200">
                        <img src={s.previewUrl} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeShot(i)}
                          className="absolute top-1 right-1 p-1.5 rounded-md bg-white/90 text-red-600 shadow"
                          aria-label={`Remove screenshot ${i + 1}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {shots.length < MAX_REPORT_SCREENSHOTS ? (
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={shotBusy}
                        className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:text-burgundy hover:border-burgundy/40 flex flex-col items-center justify-center gap-1 text-[12px] font-semibold disabled:opacity-60"
                      >
                        {shotBusy ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
                        {shotBusy ? 'Adding…' : 'Add'}
                      </button>
                    ) : null}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => void addFiles(e.target.files)}
                  />
                </div>

                {kind !== 'content' ? (
                  <div>
                    <label className={labelCls} htmlFor={id('phone')}>
                      Your phone number <span className="font-normal text-gray-500">(optional, so we can call you back)</span>
                    </label>
                    <input
                      id={id('phone')}
                      type="tel"
                      inputMode="tel"
                      value={reporterPhone}
                      onChange={(e) => setReporterPhone(e.target.value)}
                      maxLength={40}
                      placeholder={REPORT_PHONE_PLACEHOLDER}
                      className={inputCls}
                    />
                  </div>
                ) : null}
              </>
            ) : null}

            {error ? <p className="text-[15px] text-red-600">{error}</p> : null}

            <button
              type="button"
              onClick={submit}
              disabled={sending || shotBusy}
              className={`w-full min-h-[52px] rounded-xl bg-burgundy text-white text-[16px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 ${
                canSend ? '' : 'opacity-60'
              }`}
            >
              {sending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
              {sending ? 'Sending…' : 'Send report'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportForm;

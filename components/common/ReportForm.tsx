import React, { useEffect, useRef, useState } from 'react';
import { Flag, Loader2, X, CheckCircle2, ShieldAlert, ImagePlus, Trash2 } from 'lucide-react';
import type { ReportRequest, ReportAppKey } from '../../lib/report';
import { MAX_REPORT_SCREENSHOTS, prepareScreenshot, type ReportScreenshot } from '../../lib/screenshot';

/**
 * The Report dialog body, shared by PLCC Canaan and PLCC Connect.
 * Each app passes its own `send` (Canaan → /api/vault?resource=report,
 * Connect → /api/report bridge). Keep the two copies in sync.
 */

type Option = { value: string; label: string };

const APP_OPTIONS: Option[] = [
  { value: 'chat', label: 'PLCC Chat' },
  { value: 'canaan', label: 'PLCC Canaan' },
  { value: 'connect', label: 'PLCC Connect' },
  { value: 'sanctum', label: 'PLCC Sanctum' },
];

const PROBLEM_OPTIONS: Option[] = [
  { value: 'bug', label: 'Something is broken' },
  { value: 'login', label: 'Sign-in or account' },
  { value: 'messages', label: 'Messages not sending or showing' },
  { value: 'huddle', label: 'Live Huddle / audio / video' },
  { value: 'giving', label: 'Giving' },
  { value: 'slow', label: 'Slow or not loading' },
  { value: 'idea', label: 'Suggestion' },
  { value: 'other', label: 'Other' },
];

const SAFETY_OPTIONS: Option[] = [
  { value: 'impersonation', label: 'Pretending to be a pastor, the Apostle, a leader or a member' },
  { value: 'money_request', label: 'Asking me for money' },
  { value: 'money_send', label: 'Asking me to send money, pay a fee or share mobile money details' },
  { value: 'scam', label: 'Other scam (fake link, prize, investment, job, account details)' },
  { value: 'harassment', label: 'Harassment, bullying or threats' },
  { value: 'inappropriate', label: 'Unwanted sexual or inappropriate messages' },
  { value: 'other', label: 'Something else' },
];

const IMPERSONATED_OPTIONS: Option[] = [
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

const WHERE_OPTIONS: Option[] = [
  { value: 'chat', label: 'PLCC Chat' },
  { value: 'connect', label: 'PLCC Connect' },
  { value: 'canaan', label: 'PLCC Canaan' },
  { value: 'sanctum', label: 'PLCC Sanctum' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'call_sms', label: 'Phone call or SMS' },
  { value: 'social', label: 'Facebook / social media' },
  { value: 'in_person', label: 'In person' },
  { value: 'other', label: 'Somewhere else' },
];

const CONTENT_REASONS: Option[] = [
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

const MONEY_CATEGORIES = new Set(['money_request', 'money_send', 'scam', 'impersonation']);

export type ReportSender = (payload: Record<string, unknown>) => Promise<void>;

type Props = {
  request: ReportRequest;
  /** Which app this dialog is running in. */
  sourceApp: 'canaan' | 'connect';
  send: ReportSender;
  onClose: () => void;
};

const inputCls =
  'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[15px] bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/30';
const labelCls = 'block text-sm font-semibold text-gray-700 mb-1.5';

function Choices({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-1.5" role="radiogroup">
      {options.map((o) => (
        <label
          key={o.value}
          className={`flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
            value === o.value ? 'border-burgundy bg-burgundy/5' : 'border-gray-100 hover:bg-gray-50'
          }`}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="accent-burgundy shrink-0"
          />
          <span className="text-[15px] text-gray-800">{o.label}</span>
        </label>
      ))}
    </div>
  );
}

export const ReportForm: React.FC<Props> = ({ request, sourceApp, send, onClose }) => {
  const kind = request.kind;
  const [choice, setChoice] = useState('');
  const [app, setApp] = useState<string>(
    (request.kind === 'problem' && request.app) || sourceApp
  );
  const [details, setDetails] = useState('');
  const [impersonated, setImpersonated] = useState('');
  const [offenderName, setOffenderName] = useState(
    (request.kind === 'safety' && request.offenderName) || ''
  );
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

  const showScreenshots = true;
  const askMoney = kind === 'safety' && MONEY_CATEGORIES.has(choice);

  const title =
    kind === 'problem'
      ? 'Report a problem'
      : kind === 'safety'
        ? 'Report harassment or a scam'
        : `Report this ${CONTENT_NOUN[request.contentType] || 'item'}`;

  const canSend =
    !sending &&
    !shotBusy &&
    Boolean(choice) &&
    (kind === 'content' || details.trim().length > 0) &&
    (kind !== 'safety' || choice !== 'impersonation' || Boolean(impersonated));

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
    if (!canSend) return;
    setSending(true);
    setError('');
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
      payload = { kind: 'problem', app, category: choice, ...common };
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

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plcc-report-title"
      onClick={close}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 pt-5 pb-3 z-10">
          <div className="flex items-center gap-2">
            {kind === 'safety' ? (
              <ShieldAlert size={18} className="text-red-600" aria-hidden />
            ) : (
              <Flag size={18} className="text-burgundy" aria-hidden />
            )}
            <h2 id="plcc-report-title" className="text-lg font-bold text-gray-900">
              {sent ? 'Thank you' : title}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="p-2 -mr-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {sent ? (
          <div className="px-5 pb-6 text-center">
            <CheckCircle2 size={40} className="mx-auto text-green-600 mb-3" aria-hidden />
            <p className="text-sm text-gray-600">
              {kind === 'problem'
                ? 'Your report was sent. We will look into it as soon as we can.'
                : 'Your report was sent privately to church leadership. The person you reported will not be told who reported them.'}
            </p>
            {kind === 'safety' && moneySent === 'yes' ? (
              <p className="mt-3 text-sm text-gray-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-left">
                If you sent money by mobile money or bank, call your provider (MTN, Airtel or your bank) right away
                and ask them to stop or reverse the payment.
              </p>
            ) : null}
            <button
              type="button"
              onClick={close}
              className="mt-5 w-full min-h-[48px] rounded-xl bg-burgundy text-white font-semibold"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 pb-5 space-y-4">
            {kind === 'safety' ? (
              <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-[13px] text-red-900 leading-relaxed">
                <strong>Remember:</strong> PLCC pastors, the Apostle and church leaders will never ask you privately to
                send money, pay a fee, or share your mobile money PIN. Do not send money. Stop replying and report it here.
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
                <label className={labelCls} htmlFor="plcc-report-app">
                  Which app?
                </label>
                <select id="plcc-report-app" value={app} onChange={(e) => setApp(e.target.value)} className={inputCls}>
                  {APP_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <p className={labelCls}>
                {kind === 'problem'
                  ? 'What kind of problem?'
                  : kind === 'safety'
                    ? 'What happened?'
                    : 'Why are you reporting this?'}
              </p>
              <Choices
                name="plcc-report-choice"
                options={kind === 'problem' ? PROBLEM_OPTIONS : kind === 'safety' ? SAFETY_OPTIONS : CONTENT_REASONS}
                value={choice}
                onChange={setChoice}
              />
            </div>

            {kind === 'safety' && choice === 'impersonation' ? (
              <div>
                <label className={labelCls} htmlFor="plcc-report-imp">
                  Who were they pretending to be?
                </label>
                <select
                  id="plcc-report-imp"
                  value={impersonated}
                  onChange={(e) => setImpersonated(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Choose…</option>
                  {IMPERSONATED_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {kind === 'safety' ? (
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls} htmlFor="plcc-report-oname">
                      Name they used
                    </label>
                    <input
                      id="plcc-report-oname"
                      value={offenderName}
                      onChange={(e) => setOffenderName(e.target.value)}
                      maxLength={120}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="plcc-report-ocontact">
                      Their phone, username or link
                    </label>
                    <input
                      id="plcc-report-ocontact"
                      value={offenderContact}
                      onChange={(e) => setOffenderContact(e.target.value)}
                      maxLength={200}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls} htmlFor="plcc-report-where">
                      Where did it happen?
                    </label>
                    <select id="plcc-report-where" value={where} onChange={(e) => setWhere(e.target.value)} className={inputCls}>
                      <option value="">Choose…</option>
                      {WHERE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="plcc-report-when">
                      When? (date or time)
                    </label>
                    <input
                      id="plcc-report-when"
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
                          className={`flex-1 min-h-[44px] rounded-xl border text-[15px] ${
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
                        placeholder="How much, and how (MTN, Airtel, Sendwave, bank…)"
                        className={`${inputCls} mt-2`}
                        aria-label="Amount and how it was sent"
                      />
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}

            <div>
              <label className={labelCls} htmlFor="plcc-report-details">
                {kind === 'problem'
                  ? 'Describe the issue'
                  : kind === 'safety'
                    ? 'Tell us what they said or did'
                    : 'Anything else we should know? (optional)'}
              </label>
              <textarea
                id="plcc-report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={4000}
                rows={4}
                placeholder={
                  kind === 'problem'
                    ? 'What were you doing, and what went wrong?'
                    : kind === 'safety'
                      ? 'Copy their message if you can.'
                      : ''
                }
                className={inputCls}
              />
            </div>

            {showScreenshots ? (
              <div>
                <p className={labelCls}>
                  Screenshots <span className="font-normal text-gray-400">(optional, up to {MAX_REPORT_SCREENSHOTS})</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {shots.map((s, i) => (
                    <div key={s.previewUrl} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200">
                      <img src={s.previewUrl} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeShot(i)}
                        className="absolute top-1 right-1 p-1 rounded-md bg-white/90 text-red-600 shadow"
                        aria-label={`Remove screenshot ${i + 1}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  {shots.length < MAX_REPORT_SCREENSHOTS ? (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={shotBusy}
                      className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:text-burgundy hover:border-burgundy/40 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold disabled:opacity-60"
                    >
                      {shotBusy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
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
            ) : null}

            {kind !== 'content' ? (
              <div>
                <label className={labelCls} htmlFor="plcc-report-phone">
                  Your phone number <span className="font-normal text-gray-400">(optional, so we can call you back)</span>
                </label>
                <input
                  id="plcc-report-phone"
                  type="tel"
                  inputMode="tel"
                  value={reporterPhone}
                  onChange={(e) => setReporterPhone(e.target.value)}
                  maxLength={40}
                  placeholder="+256…"
                  className={inputCls}
                />
              </div>
            ) : null}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className="w-full min-h-[48px] rounded-xl bg-burgundy text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
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

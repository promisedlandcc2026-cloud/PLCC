import React, { useEffect, useState } from 'react';
import { Flag, Loader2, X, CheckCircle2 } from 'lucide-react';
import { apiFetch, ApiError } from '../../lib/api';
import { useNav } from '../../App';
import { REPORT_EVENT, type ReportRequest } from '../../lib/report';

const PROBLEM_OPTIONS: { value: string; label: string }[] = [
  { value: 'bug', label: 'Something is broken' },
  { value: 'login', label: 'Sign-in or account' },
  { value: 'huddle', label: 'Live Huddle / audio / video' },
  { value: 'giving', label: 'Giving' },
  { value: 'slow', label: 'Slow or not loading' },
  { value: 'idea', label: 'Suggestion' },
  { value: 'other', label: 'Other' },
];

const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: 'spam', label: 'Spam or scam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'inappropriate', label: 'Inappropriate or offensive' },
  { value: 'false_info', label: 'False information' },
  { value: 'safety', label: 'Someone may be unsafe' },
  { value: 'other', label: 'Something else' },
];

const CONTENT_LABEL: Record<string, string> = {
  chat_message: 'message',
  dm_message: 'message',
  feed_post: 'post',
  feed_comment: 'comment',
  prayer_request: 'prayer request',
  profile: 'profile',
};

/** Mounted once (AppShell). Listens for openReport() calls. */
export const ReportHost: React.FC = () => {
  const { userId } = useNav();
  const [request, setRequest] = useState<ReportRequest | null>(null);
  const [choice, setChoice] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<ReportRequest>).detail;
      if (!detail) return;
      setRequest(detail);
      setChoice('');
      setDetails('');
      setError('');
      setSent(false);
      setSending(false);
    };
    window.addEventListener(REPORT_EVENT, onOpen);
    return () => window.removeEventListener(REPORT_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) setRequest(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, sending]);

  if (!request) return null;

  const isProblem = request.kind === 'problem';
  const options = isProblem ? PROBLEM_OPTIONS : REASON_OPTIONS;
  const noun = request.kind === 'content' ? CONTENT_LABEL[request.contentType] || 'item' : '';
  const title = isProblem ? 'Report a problem' : `Report this ${noun}`;
  const canSend = !sending && Boolean(choice) && (!isProblem || details.trim().length > 0);

  const close = () => {
    if (!sending) setRequest(null);
  };

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    setError('');
    const common = {
      details: details.trim(),
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
      screen: `${window.innerWidth}x${window.innerHeight}`,
    };
    const payload =
      request.kind === 'problem'
        ? { kind: 'problem', category: choice, ...common }
        : {
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
    try {
      await apiFetch('/api/vault?resource=report', {
        method: 'POST',
        userId,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the report. Please try again.');
    } finally {
      setSending(false);
    }
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
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Flag size={18} className="text-burgundy" aria-hidden />
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
              {isProblem
                ? 'Your report was sent. We will look into it as soon as we can.'
                : 'Your report was sent privately. The person you reported will not be told who reported them.'}
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-5 w-full min-h-[48px] rounded-xl bg-burgundy text-white font-semibold"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 pb-5">
            {request.kind === 'content' && (request.contentPreview || request.authorName) ? (
              <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm">
                {request.authorName ? (
                  <p className="font-semibold text-gray-800">{request.authorName}</p>
                ) : null}
                {request.contentPreview ? (
                  <p className="text-gray-600 line-clamp-3 break-words">{request.contentPreview}</p>
                ) : null}
              </div>
            ) : null}

            <p className="text-sm font-semibold text-gray-700 mb-2">
              {isProblem ? 'What kind of problem?' : 'Why are you reporting this?'}
            </p>
            <div className="grid gap-1.5 mb-4">
              {options.map((o) => (
                <label
                  key={o.value}
                  className={`flex items-center gap-3 min-h-[44px] px-3 rounded-xl border cursor-pointer transition-colors ${
                    choice === o.value ? 'border-burgundy bg-burgundy/5' : 'border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="plcc-report-choice"
                    value={o.value}
                    checked={choice === o.value}
                    onChange={() => setChoice(o.value)}
                    className="accent-burgundy"
                  />
                  <span className="text-[15px] text-gray-800">{o.label}</span>
                </label>
              ))}
            </div>

            <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="plcc-report-details">
              {isProblem ? 'What happened?' : 'Anything else we should know? (optional)'}
            </label>
            <textarea
              id="plcc-report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={4000}
              rows={4}
              placeholder={isProblem ? 'Tell us what you were doing and what went wrong.' : ''}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-burgundy/30"
            />

            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className="mt-4 w-full min-h-[48px] rounded-xl bg-burgundy text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
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

export default ReportHost;

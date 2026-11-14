/**
 * Open the shared Report dialog from anywhere in PLCC Canaan.
 * The dialog itself (<ReportHost />) is mounted once in AppShell.
 */

export type ReportContentType =
  | 'chat_message'
  | 'dm_message'
  | 'feed_post'
  | 'feed_comment'
  | 'prayer_request'
  | 'profile';

export type ReportRequest =
  | { kind: 'problem' }
  | {
      kind: 'content';
      contentType: ReportContentType;
      contentId?: string | null;
      authorName?: string | null;
      authorId?: string | null;
      contentPreview?: string | null;
      /** e.g. "#general" or "Prayer Wall" */
      context?: string | null;
    };

export const REPORT_EVENT = 'plcc:open-report';

export function openReport(request: ReportRequest) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ReportRequest>(REPORT_EVENT, { detail: request }));
}

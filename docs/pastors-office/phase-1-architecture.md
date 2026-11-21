# Pastor’s Office — Phase 1 architecture audit and implementation plan

Status: design and source audit only, 21 November 2026. No production database or application changes have been made. Office access is not yet implemented. Source versions inspected: Canaan `origin/main` 8a80401; Tribes `origin/main` d534cea; Ka Link `origin/main` c3e1b3f. This report does not assert that the live database matches migrations or that cross-app sign-in and notifications work in production.

## Existing infrastructure and boundaries

- Canaan is the authoritative staff application. `api/_utils/auth.ts` verifies bearer-token claims and obtains the app role; `lib/permissions.ts` and the sidebar/router provide navigation checks. Neither broad `PASTOR` nor `SUPER_ADMIN` alone is an acceptable grant to private office records. Canaan uses a privileged Supabase client in handlers, which bypasses RLS: every handler must separately enforce explicit assignments and resource ownership.
- Canaan `pages/events/Overview.tsx` implements the church events calendar; `lib/eventDate.ts` has Kampala-related formatting. Those are useful UI/date references, but church event records and their existing access rules must not be reused to store confidential appointments. Existing best-effort event conversion is not a transactional appointment scheduler.
- The Canaan launcher in `pages/AwcOneLauncherPage.tsx` builds tiles and quick actions from role/path checks. A Pastor’s Office entry needs a server-verified office-assignment capability, not merely a client role check.
- Tribes `api/member-notifications.js` is a narrow bridge to Canaan notifications. It accepts a bearer token, fixes the upstream path, validates and sanitizes responses. Tribes `lib/memberNotificationsClient.ts` obtains an access token. This is a useful bridge pattern, not evidence of an appointment bridge. The local Tribes worktree was not at its `origin/main`; inspection of the bridge and push client used `git show origin/main`. The complete current Tribes application was not exhaustively audited.
- `supabase/migrations/create_user_notifications.sql` declares a per-user inbox with own-row read/update RLS; later migrations alter its type constraint. `push_subscriptions.sql` denies anon/authenticated direct access; server code in `api/_utils/pushAlerts.ts` sends web push. `topicForNotification` and URL mappings currently handle known types; new office notifications require explicit allowlisting and sanitization in both the Canaan sender and Tribes notification bridge. `lib/phoneAlerts.ts` requests web-push permission and notes the iOS installed-app requirement. This source audit does not prove subscriptions, push, or deep links work on real devices.
- Canaan has Resend-related event approval notification code (`api/_utils/eventApprovalNotify.ts`), and scheduled tasks in `vercel.json`; delivery, preferences, environment provisioning and durable retry semantics must be verified. Never send counseling details in push titles, previews, email subject lines, or logs.
- Ka Link has its own push and Vault-origin bridge code. A member-contact link may open an existing authorized conversation, but SSO, recipient identity, message delivery, consent and cross-app notification routing have not been end-to-end verified. No confidential information may be passed in a deep link.
- Existing repo migrations describe intended tables and policies, not the actual deployed database. Live schema, policies, grants, extensions, existing migrations, backup/restore, and assignment identities have not been inspected. Do not infer production readiness or execute SQL from this document.

## Proposed information architecture

Canaan desktop: a permission-filtered Pastor’s Office entry within the existing sidebar/launcher. Faith sees Overview, Requests, Counseling scheduling, Baptism requests, Calendar, Approvals, Follow-ups and Settings, subject to individual permissions. Grace gets Today, Approvals, Calendar, Availability and private notes. Role is determined from an explicit server-validated assignment, not a name, email, ordinary church role, or UI state. Both use the same office and calendar.

Tribes: members receive a low-detail appointment request and My Requests entry; only their own requests appear. Staff entry is displayed only after a server capability response; Faith and Grace see layouts appropriate to their assignments. Reuse existing navigation and session mechanisms. No automatic sharing of confidential data with Ka Link.

Office visual theme: locally scoped navy, ivory and restrained gold; confirmed green, pending amber. Preserve the existing forest-green PLCC shell outside this module. Mockup staff names and photographs are illustrative, not identity sources.

## Proposed minimal data model (subject to database audit)

Every row scoped to a real office/tenant identifier if a single-office deployment ever supports multiple churches; otherwise preserve existing PLCC project isolation and design for future tenant scoping. FK targets must be confirmed against actual Auth and member identity mappings before SQL is written.

1. `pastoral_offices`: office ID, owner/pastor auth identity, default IANA zone `Africa/Kampala`, lifecycle fields.
2. `office_assignments`: office ID, auth user ID, role/capabilities, grantor, effective/revoked times. Assignment administration is privileged and audited. An assistant gets coordination permissions only; private-note access is never implied by church admin or assistant role.
3. `appointment_requests`: office and requester auth/member IDs, category, preferred local date/time plus IANA zone, contact preference, limited optional message, state, revision, created/updated timestamps. No detailed counseling disclosures in the request. Minimize which staff can read messages; retention, consent and underage access need explicit decisions.
4. `office_events`: office ID, optional request ID, status, start/end instants as `timestamptz`, IANA display zone, pre/post buffers, version, and restricted coordination fields. Proposed times and confirmed times are distinct. Superseded/cancelled records retain audit history without blocking slots.
5. `office_availability_rules` and `office_time_blocks`: recurring weekly local-time rules with IANA zone and effective dates; UTC blocks for exceptions. Faith sees only generic busy/away; reasons and note text are separately protected. Handle nonexistent/ambiguous DST local times explicitly.
6. `office_private_notes`: separate table with office/author/event identifiers and private text; access strictly scoped to the intended pastor, with no default assistant or broad admin read. Consider encryption and operational key/backup controls after a threat-model review; RLS alone does not protect a service-role leak.
7. `office_audit_events`: actor, office, entity, event type, UTC time and minimal metadata; never store note bodies, counseling text or notification payloads. Append-only via controlled server function; define retention and access.
8. `office_notification_jobs`: recipient, event ID, event version, kind, due time, state, idempotency key, attempts and failure metadata. Store preferences/consents separately if existing preference model cannot safely represent office alerts; do not assume existing church-wide push opt-in equals consent to counseling reminders.

Implement an atomic server-side booking/reschedule transaction. Prefer a PostgreSQL exclusion constraint on `(office_id, tstzrange(buffered_start, buffered_end, '[)'))` for active reservations, with `btree_gist` only if available and approved; alternatively use a locked office row with a transaction and equivalent overlap constraint. Verify required extension privileges and deployment compatibility. Do not rely on UI checks. Ensure a failed reschedule leaves the previous reservation intact; define approval-held slot expiry and concurrency semantics. Recheck availability, assignment and request version within the same transaction. Approval creates/updates event and audit/outbox records together; network sends run only after commit.

## Authorization and privacy contract

- Member: submit and read only own request and generic status; request cancellation/reschedule for own record. No access to another requester’s details or unrestricted calendar. Treat child/dependent requests as out of scope until guardian, safeguarding and consent rules are approved.
- Assistant: explicitly assigned to this office; coordinate requests, generic availability, proposed times, status and consented contact information. Cannot read private notes or confidential counseling disclosures. Staff may need a redacted DTO with no table-level access to note bodies.
- Pastor: explicit office assignment; approve/decline, manage availability and own private notes. Approval/decline subject to version/state validation. Availability projection exposes no reason or private note to the assistant.
- Assignment administrator: explicitly authorized to manage assignments but **not** implicitly authorized to read note bodies. Decide separate emergency access/revocation recovery with the church.
- RLS should default-deny, enable RLS on all office tables, and revoke direct grants for sensitive tables; policies using `auth.uid()` and assignment predicates may support limited own-row reads only if policy behavior is verified in the actual environment. Prefer reviewed security-invoker/RPC interfaces and non-recursive assignment checks. Service-role API access bypasses RLS, so server authorization and DTO redaction are mandatory. No service-role key in browser code.
- All private responses use `Cache-Control: private, no-store`, token verification, narrow input schemas, generic errors, audit-safe logging, authorization on every request and conservative per-user rate limits.

## Workflow and safety rules

`requested → proposed → awaiting_approval → confirmed → completed/no_show`; allow explicit decline/cancel/reschedule transitions with actor and event revision, including rejection/reproposal without a second live event. Final status names, Grace approval policy, lead times, cancellation rules and staff visibility require product approval. Conflict checking occurs at database commit for all paths, including availability blocks and retries. All user-facing dates show local zone and an unambiguous zone label, retaining UTC instant plus IANA zone. Never trust a browser-supplied identity or computed availability.

Notifications use a transactional outbox with idempotent delivery attempts and generic wording such as “You have an appointment update.” Verify inbox destination/type handling, explicit per-channel consent, encrypted transport, push unsubscribe and expiry handling, retry/backoff, scheduled-job authorization, and Resend configuration. No claim of real push delivery until two-account, real-device tests pass. No reminders are sent in Phase 1.

## Phased implementation

1. **Audit and plan (this document).** Verify source versions, identify assumptions and unresolved access/security decisions. Review approved mockups and inspect a non-production schema when access is available. Do not touch production.
2. **Security and schema design.** Produce additive migration drafts, grants/RLS and rollback/restore instructions; use an isolated test database with synthetic identities. Test policies both directly and through service-role API, owner/assistant/member/cross-office, revocation and hostile IDs. Review privacy/retention and secret-management plans before applying migrations anywhere beyond authorized testing.
3. **Core transactional API.** Implement assignments, sanitized requests, availability, conflict-safe booking, state transitions, audit/outbox and timezone tests. No real notifications. Test race conditions and DST boundaries.
4. **Canaan staff UI.** Build role-scoped Faith and Grace dashboards and desktop/mobile calendar with existing auth; permission-check every operation; use fictional data only in tests and previews.
5. **Tribes member and staff UI.** Add a fixed-path, sanitized token-forwarding bridge and requested mobile interfaces. Test own-record isolation, assignment revocation, bridge errors, deep links and existing navigation. Coordinate with current `main`, not an unrelated feature branch.
6. **Notifications and reminders.** Add safe types/mappings, preferences and an idempotent worker on a verified scheduler. Test failures, consent, duplicate sends and real-device push in approved staging only. Email/SMS and provider credentials remain conditional; reuse current services where safe.
7. **Release review.** Run relevant Canaan/Tribes/Ka Link regression suites and record pre-existing failures separately. Review migration and rollback, data retention and role assignments. Explicit approval is required before production migration, merge, deployment or permission-sensitive operations. Merging PRs and deployment require Jerless’s authorization.

## Migration and recovery strategy

Create additive, ordered migrations and a reversible schema-only down script after the current deployed schema, extension availability and backup/restore process are verified. No dropping existing tables, resetting shared data, or applying migration to production as part of implementation. Before a production migration, obtain explicit approval and a verified backup/restore plan. Rollback of code must not silently delete records: disable writes and jobs, export/preserve office data under restricted access, restore prior code, and perform schema reversal only after a reviewed recovery decision. Test full restore in staging.

## Decisions and dependencies to resolve

- Exact assignment grants and identities for Grace and Faith; a safe bootstrap and revocation process; whether there are substitutes or multiple pastors.
- Appointment categories/durations, approval defaults, time zones, buffers, recurring availability, reservation expiry, cancellation/no-show policy and booking hours.
- What limited message and contact details Faith can see; whether counseling content is ever stored, who can see private notes, emergency access, retention and safeguarding rules.
- Which notification channels are enabled and consented; reminder timing, delivery failures, timezone display and accessible copy.
- How production and preview map to Supabase projects. Prior Canaan preview login reported “Supabase Admin not initialized”; a safe isolated staging project with configured authentication is needed for end-to-end QA. No credentials should be pasted into chat.
- Approved exact visual mockup assets and existing capabilities, since the attached request refers to mockups but does not attach them. The provided navy/ivory/gold direction is usable for planning.
- Audit and remediate the separate login security findings previously recorded in Agent Relay before expanding sensitive scheduling; confirm operational RLS, service-role exposure, session isolation and provider settings.

## Verification performed and limits

Read source and migrations in the three repositories, inspected token verification, notifications and push bridge, calendar/date helpers, and launcher. This was static analysis, not a live database inspection, authenticated integration test, real-device push test, legal/compliance assessment, or production penetration test. Existing baseline: Canaan TypeScript errors, known Tribes test failures, and a Canaan Ask Admin hints failure are recorded in the project handoff; counts must be rechecked on the relevant current heads. No feature, migration, deployment, assignment or notification was implemented in this phase.

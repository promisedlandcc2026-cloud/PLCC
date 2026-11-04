
import { z } from 'zod';
import { easternOffset } from '../../lib/eventDate';
import { randomInt } from 'node:crypto';
import {
    getSupabaseAdmin,
    verifyAuth,
    resolveAppUser,
    reconcileAuthPendingSignups,
    requireAuth,
    FINANCE_ROLES,
} from './auth.js';
import { ensureMemberForUser } from './ensureMemberForUser.js';
import {
    eventsStatsDecision,
    pickColumns as pickAllowed,
    toolsRouteDecision,
    RUN_OF_SHOW_COLUMNS,
    EVENT_TEMPLATE_COLUMNS,
    GALLERY_COLUMNS,
    VOICE_COLUMNS,
    SERMON_COLUMNS,
    INSPIRATION_COLUMNS,
    FOLLOW_UP_COLUMNS,
    FOLLOWUP_TEMPLATE_COLUMNS,
    FOLLOWUP_WORKFLOW_COLUMNS,
    TAG_COLUMNS,
    MINISTRY_COLUMNS,
    TEAM_COLUMNS,
    HOUSEHOLD_COLUMNS,
    CONNECT_CARD_COLUMNS,
    VISIT_COLUMNS,
    MEMBER_WRITE_COLUMNS,
    settingsWriteDecision,
    ORG_PROFILE_COLUMNS,
    CHURCH_SETTINGS_ROLES,
    publicOrgRow,
} from './routeAccess.js';
import {
    buildMemberPrayerInsert,
    buildVisitorPrayerInsert,
    canChangePrayerStatus,
    canDeletePrayer,
    filterPrayersForViewer,
    applyTeamSharing,
    canPublishPrayer,
    isIntercessorPrayer,
    isMissingPrayerWatchColumn,
    isMissingShareWithColumn,
    isPrayerTeam,
    parsePrayerListWindow,
    parsePrayerMark,
    prayerMarkPatch,
    PRAYER_CATEGORIES,
    toIntercessorListItem,
} from './prayerAccess.js';
import {
    canLeadIntercessors,
    canOpenIntercessorList,
    findIntercessorsRoom,
    firstNamesFor,
    sendPrayerToIntercessors,
} from './intercessors.js';
import { mergeIntegrationSettings, redactIntegrations, SERMON_BODY_MAX } from './rhemanotesIntegration.js';
import { getAudit, getResend, getBcrypt } from './deps.js';
import { VideoSchema, HowToVideoSchema, HowToVideoUpdateSchema } from './schemas.js';
import { handleFinance } from '../_handlers/finance.js';
import { handleGiving } from '../_handlers/giving.js';
import { handleStoreOrders } from '../_handlers/storeOrders.js';
import { handleAskAdmin } from '../_handlers/askAdmin.js';
import { parseCookoutFoodContribution, parseRsvpContribution } from './cookoutFoodContribution.js';
import {
    closedMessageForEvent,
    isEventRsvpClosed,
} from './cookoutRsvpWindow.js';
import { eventFundName, eventFundPreviousNames, getFellowshipEventConfig } from './fellowshipEventConfig.js';
import {
    closedMessageForName,
    isKnownFellowshipKitId,
    loadRsvpEventFundName,
    loadRsvpEventRow,
    isValidRsvpTemplate,
    publicRsvpConfigPayload,
    runtimeConfigFromDbEvent,
    runtimeConfigFromKit,
    type EventRsvpRuntimeConfig,
} from './eventRsvpConfig.js';
import {
    buildTitheRsvpPayUrl,
    isGiftPaymentMethod,
    parseGiftPaymentChoice,
    postRsvpGiftToGivingTransactions,
    rsvpPartyLine,
    rsvpPayStatus,
    rsvpReturnUrl,
    shortEventDate,
    renameVaultEventFund,
} from './rsvpGiftPayment.js';
import { ensureTitheEventFund, repairTitheRsvpGiftFunds, syncRsvpGiftsFromTithe } from './titheRsvpSync.js';
import { canViewPeopleRoster } from './peopleRosterLogic.js';
import { isAttendanceCheckinRole } from './attendanceCheckinLogic.js';
import {
    applyApproveTransition,
    canApproveEvents,
    canBypassEventDateLock,
    canDeleteEventRow,
    canEditEventRow,
    canSubmitEvents,
    filterEventsForViewer,
    isEventDateLocked,
    lockedDatesFromEvents,
    normalizeEventStatus,
    parseApproveRejectAction,
    resolveCreateStatus,
} from './eventApprovalLogic.js';
import {
    loadEventApproverUserIds,
    notifyEventApproversOfSubmit,
    notifyEventSubmitterOfDecision,
} from './eventApprovalNotify.js';
import {
    handleNotifications,
    notifyAllUsers,
    notifyFollowUpAssignee,
    notifyUser,
} from './notify.js';
import {
    CHAT_CHANNEL_CREATE_ROLES,
    canAccessChannel,
    canCreateCommunityChannels,
    canDeleteCommunityChannelSync,
    canManageChannelMembers,
    countUnreadByChannel,
    enrichMessagesWithAvatars,
    fetchChannel,
    filterEligibleMentionIds,
    isBroadChatAdmin,
    isClientVaultAiSpoofAttempt,
    listAccessibleChannels,
    listAuthorizedMinistryIds,
    listMentionCandidatesForChannel,
    normalizeVisibility,
    parseChannelCreateKind,
    sanitizeHumanChatDisplayName,
    slugifyChannelName,
    userCanAccessMinistryScope,
    upsertChatReadStatus,
} from './communityChatSecurity.js';
import {
    applyVoiceHuddleModAction,
    clearParticipantHandRaise,
    decideVoiceHuddleAccess,
    endVoiceRoom,
    ensureVoiceRoom,
    filterVoiceStatusChannelIds,
    getLiveKitServerConfig,
    listVoiceHuddleStatusesForChannels,
    listVoiceRoomParticipantCount,
    microphoneRestoreIsSelf,
    mintLiveKitAccessToken,
    muteParticipantMicrophoneTracks,
    resolveVoiceCanModerate,
    restoreOwnMicrophonePublish,
} from './livekitVoice.js';
import {
    canViewHuddleAttendance,
    getHuddleAttendanceForChannel,
} from './huddleAttendance.js';
import { isHuddleSessionModerator, parseHuddleModAction } from './huddleModeration.js';
import { handleVoiceTokenFallback, signHuddleFallbackPass } from './huddleFallbackPass.js';
import { DailyApiError, countDailyRoomParticipantsForChannels, getDailyApiKey, mintDailyMeetingToken } from './dailyVoice.js';
import { claimHuddleProvider, mergeDailyIntoHuddleStatuses, resolveHuddleProvider } from './huddleProvider.js';
import { waitUntil } from '@vercel/functions';
import {
    ANNOUNCE_ONLY_ERROR,
    cleanSearchQuery,
    decideCanPost,
    isAnnounceOnly,
    listArchivedChats,
    listPinnedMessages,
    searchMessages,
    setChatArchived,
    setMessagePinned,
} from './chatRooms.js';
import { alertChatMessage, broadcastChatEvent, chatRealtimeTopic, decideChatEdit, isRoomMuted, mentionsEveryone, setRoomMuted } from './chatLive.js';
import {
    CHAT_MEDIA_ALLOWED_MIME,
    CHAT_MEDIA_BUCKET,
    CHAT_MEDIA_MAX_BYTES,
    chatAttachmentKind,
    cleanChatFilename,
    createChatUploadUrl,
    normalizeChatMime,
    planChatAttachmentUpload,
    statChatUpload,
    storagePathBelongsToMessage,
} from './chatAttachmentUpload.js';
import {
    HUDDLE_START_FORBIDDEN_CODE,
    decideHuddleEntry,
    logHuddleAudit,
    readHuddleIsLive,
    resolveHuddleStartPermission,
} from './huddleStartPolicy.js';
import {
    extensionForAudioMime,
    formatMinutesTranscriptAsNotes,
    MINUTES_AUDIO_BUCKET,
    MINUTES_MAX_AUDIO_BYTES,
    parseAudioDataUrl,
    summarizeTranscript,
    transcribeAudioBuffer,
} from './minutesRecorder.js';
import { buildMinutesPdfBytes, minutesPdfFilename } from './minutesPdf.js';
import {
    addManualMembers,
    ensureCreatorModerator,
    ensureDmMembership,
    listChannelMembers,
    listCommunityMentors,
    listMemberPickerCandidates,
    listMinistryRosterUserIds,
    removeChannelMember,
    syncAllRoomMemberships,
    syncMinistryMembershipsForChannel,
    syncRoomMembershipsForUser,
} from './communityMembership.js';
import {
    FEED_COMMENTS_PREVIEW,
    FEED_IMAGE_BUCKET,
    FEED_IMAGE_SIGNED_URL_TTL_SEC,
    FEED_PAGE_SIZE,
    aggregateFeedReactions,
    assembleFeedPostCard,
    buildFeedImageStoragePath,
    canEditFeedPost,
    canPinFeedPost,
    canRemoveFeedComment,
    canRemoveFeedPost,
    clampFeedOffset,
    clampFeedPageSize,
    decideFeedReactionToggle,
    feedQueryStrategyDoc,
    isCommunityFeedEligibleUser,
    isCommunityFeedModerator,
    isFeedEdited,
    isFeedPostPinned,
    isFeedReactionKey,
    isSafeFeedImagePath,
    loadFeedAuthors,
    loadFeedCommentCounts,
    loadFeedCommentPreviews,
    loadFeedReactionsForTargets,
    parseFeedCategory,
    parseFeedImageUpload,
    parseFeedListCategoryFilter,
    sortFeedCommentsChronological,
    validateFeedCommentContent,
    validateFeedPostContent,
} from './communityFeed.js';
import {
    emailLocalPartHint,
    formatFeedContentForDisplay,
    notifyFeedPostComment,
    persistFeedMentionsThenNotify,
    resolveAuthorizedFeedMentionIds,
} from './communityFeedMentions.js';
import { vaultFrom } from './emailFrom.js';

const COMMUNITY_ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
]);
const COMMUNITY_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const COMMUNITY_BLOCKED_EXT = /\.(exe|bat|cmd|com|msi|scr|js|jar|sh|ps1|dll|dmg|app|apk)$/i;

// Schemas: see ./schemas.js (VideoSchema imported)

const cleanUuid = (id: any) => (id && typeof id === 'string' && id.length > 30) ? id : null;
const first = (val: any): string | undefined => Array.isArray(val) ? val[0] : (val as string | undefined);

const generateAccessCode = () => String(randomInt(10_000_000, 100_000_000));

const kioskLookupHits = new Map<string, { windowStart: number; count: number }>();
function kioskLookupAllowed(req: any): boolean {
    const fwd = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = fwd || String(req.socket?.remoteAddress || 'unknown');
    const now = Date.now();
    const entry = kioskLookupHits.get(ip);
    if (!entry || now - entry.windowStart > 60_000) {
        kioskLookupHits.set(ip, { windowStart: now, count: 1 });
        return true;
    }
    entry.count += 1;
    return entry.count <= 20;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @deprecated Prefer ensureMemberForUser — kept as alias for older call sites. */
async function syncUserProfileToMember(
    supabaseAdmin: any,
    userRow: { id?: string; email?: string | null; name?: string | null; role?: string | null } | null,
    fields: Record<string, any>
) {
    await ensureMemberForUser(supabaseAdmin, userRow, fields);
}

/** Fill missing members.birthday from users.email match (Settings vs directory split). */
async function enrichMembersBirthdayFromUsers(supabaseAdmin: any, members: any[]): Promise<any[]> {
    if (!supabaseAdmin || !Array.isArray(members) || members.length === 0) return members || [];

    const needsBirthday = members.filter((m) => !m?.birthday && m?.email);
    if (needsBirthday.length === 0) return members;

    const emails = [...new Set(
        needsBirthday.map((m) => String(m.email).toLowerCase().trim()).filter(Boolean)
    )];
    if (emails.length === 0) return members;

    try {
        // Load profile birthdays; match case-insensitively in memory (email casing can differ)
        const { data: users, error } = await supabaseAdmin
            .from('users')
            .select('email, birthday')
            .not('birthday', 'is', null);
        if (error) {
            console.error('[Vault API] enrichMembersBirthdayFromUsers:', error.message);
            return members;
        }

        const byEmail = new Map<string, string>();
        for (const u of users || []) {
            if (!u?.email || !u?.birthday) continue;
            const key = String(u.email).toLowerCase().trim();
            if (emails.includes(key)) byEmail.set(key, u.birthday);
        }
        if (byEmail.size === 0) return members;

        return members.map((m) => {
            if (m?.birthday || !m?.email) return m;
            const fromUser = byEmail.get(String(m.email).toLowerCase().trim());
            return fromUser ? { ...m, birthday: fromUser } : m;
        });
    } catch (err: any) {
        console.error('[Vault API] enrichMembersBirthdayFromUsers failed:', err?.message || err);
        return members;
    }
}

/** Parse Kids Check-In synthetic ids: json-{parentUuid}-{index} */
function parseSyntheticChildId(childId: string): { parentId: string; index: number } | null {
    if (typeof childId !== 'string' || !childId.startsWith('json-')) return null;
    const rest = childId.slice('json-'.length);
    const lastDash = rest.lastIndexOf('-');
    if (lastDash <= 0) return null;
    const parentId = rest.slice(0, lastDash);
    const index = parseInt(rest.slice(lastDash + 1), 10);
    if (!UUID_RE.test(parentId) || !Number.isFinite(index) || index < 0) return null;
    return { parentId, index };
}

/**
 * Household kids often only exist in members.children JSON (synthetic json-… ids).
 * child_consents.child_id is UUID — ensure a real Child member and return that id.
 */
async function resolveConsentChildId(
    supabaseAdmin: any,
    childId: string,
    parentId: string,
    childNameHint?: string
): Promise<{ childId: string; parentId: string; childName: string }> {
    if (UUID_RE.test(childId)) {
        return { childId, parentId: UUID_RE.test(parentId) ? parentId : childId, childName: childNameHint || 'Child' };
    }

    const parsed = parseSyntheticChildId(childId);
    if (!parsed) {
        throw new Error('Invalid child id for consent. Please refresh and try again.');
    }

    const resolvedParentId = UUID_RE.test(parentId) ? parentId : parsed.parentId;

    const { data: parent, error: parentErr } = await supabaseAdmin
        .from('members')
        .select('id, first_name, last_name, household_id, household_name, children')
        .eq('id', parsed.parentId)
        .maybeSingle();

    if (parentErr) throw parentErr;
    if (!parent) throw new Error('Could not find the parent/guardian for this child.');

    const kids = Array.isArray(parent.children) ? parent.children : [];
    const kid = kids[parsed.index] || null;
    const childName = String(kid?.name || childNameHint || 'Child').trim() || 'Child';

    // JSON child already linked to a real member uuid
    if (kid?.id && UUID_RE.test(String(kid.id))) {
        return { childId: String(kid.id), parentId: resolvedParentId || parent.id, childName };
    }

    const nameParts = childName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || 'Child';
    const lastName = nameParts.slice(1).join(' ') || parent.last_name || '';

    // Prefer an existing Child member in the same household with the same name
    let existingQuery = supabaseAdmin
        .from('members')
        .select('id, first_name, last_name, role')
        .ilike('first_name', firstName);
    if (parent.household_id) {
        existingQuery = existingQuery.eq('household_id', parent.household_id);
    } else if (parent.household_name) {
        existingQuery = existingQuery.eq('household_name', parent.household_name);
    }
    const { data: candidates } = await existingQuery.limit(25);
    const match = (candidates || []).find((c: any) => {
        const full = `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase();
        return full === childName.toLowerCase() || (c.first_name || '').toLowerCase() === firstName.toLowerCase();
    });

    let realChildId = match?.id as string | undefined;

    if (!realChildId) {
        const { data: created, error: createErr } = await supabaseAdmin
            .from('members')
            .insert({
                first_name: firstName,
                last_name: lastName,
                role: 'Child',
                status: 'Active',
                access_code: generateAccessCode(),
                household_id: parent.household_id || null,
                household_name: parent.household_name || null,
            })
            .select('id')
            .single();
        if (createErr) throw createErr;
        realChildId = created.id;
    }

    // Persist uuid onto the JSON child so future e-signs / check-ins reuse it
    if (kids[parsed.index]) {
        const updatedKids = kids.map((c: any, i: number) =>
            i === parsed.index ? { ...c, id: realChildId } : c
        );
        await supabaseAdmin.from('members').update({ children: updatedKids }).eq('id', parent.id);
    }

    return {
        childId: realChildId!,
        parentId: resolvedParentId || parent.id,
        childName,
    };
}

// =====================================================
// RESOURCE HANDLERS (Merged Logic)
// =====================================================

// --- AUTH ---
const handleAuth = async (req: any, res: any) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });

    const { data: user, error: userError } = await supabaseAdmin.from('users').select('*').eq('email', email).single();
    if (userError || !user) return res.status(401).json({ error: 'Invalid credentials' });

    const bcrypt = await getBcrypt();
    if (!bcrypt) return res.status(503).json({ error: 'Bcrypt library failed to load' });

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) return res.status(401).json({ error: 'Invalid credentials' });

    return res.status(200).json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role, title: user.title } });
};

/**
 * Same-origin OTP proxy so Safari / DuckDuckGo (tracker blocking) do not need
 * to call *.supabase.co directly from the browser for send/verify.
 */
const handleAuthOtp = async (req: any, res: any) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
    const anonKey = String(
        process.env.SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        ''
    ).trim();
    if (!supabaseUrl || !anonKey) {
        return res.status(503).json({ error: 'Auth service is not configured' });
    }

    const body = req.body || {};
    const action = String(body.action || '').toLowerCase();
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@') || (email.match(/@/g) || []).length !== 1) {
        return res.status(400).json({ error: 'Enter a valid email address.', code: 'validation_failed' });
    }

    const goTrueHeaders = {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
    };

    try {
        if (action === 'send') {
            const upstream = await fetch(`${supabaseUrl}/auth/v1/otp`, {
                method: 'POST',
                headers: goTrueHeaders,
                body: JSON.stringify({ email, create_user: false }),
            });
            const text = await upstream.text();
            let json: any = null;
            try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
            if (!upstream.ok) {
                const upstreamMsg = json?.msg || json?.error_description || json?.error || text || 'Failed to send code';
                const code = json?.error_code || json?.code || '';
                const signupBlocked = /signups not allowed|signup_disabled|user not found|otp_disabled/i.test(
                    `${upstreamMsg} ${code}`
                );
                const msg = signupBlocked
                    ? 'No account for that email yet. Create an account and enter your first and last name.'
                    : upstreamMsg;
                console.error('[auth-otp send]', upstream.status, upstreamMsg, code);
                return res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502).json({
                    error: msg,
                    code,
                });
            }
            return res.status(200).json({ ok: true });
        }

        if (action === 'verify') {
            const token = String(body.token || '').replace(/\D/g, '');
            if (token.length !== 6) {
                return res.status(400).json({ error: 'Enter the 6-digit code from your email.' });
            }
            const type = String(body.type || 'email').toLowerCase() === 'magiclink' ? 'magiclink' : 'email';
            const upstream = await fetch(`${supabaseUrl}/auth/v1/verify`, {
                method: 'POST',
                headers: goTrueHeaders,
                body: JSON.stringify({ email, token, type }),
            });
            const text = await upstream.text();
            let json: any = null;
            try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
            if (!upstream.ok) {
                const msg = json?.msg || json?.error_description || json?.error || text || 'Invalid code';
                const code = json?.error_code || json?.code || '';
                // Retry magiclink once when email type fails (template mismatch)
                if (type === 'email') {
                    const retry = await fetch(`${supabaseUrl}/auth/v1/verify`, {
                        method: 'POST',
                        headers: goTrueHeaders,
                        body: JSON.stringify({ email, token, type: 'magiclink' }),
                    });
                    const retryText = await retry.text();
                    let retryJson: any = null;
                    try { retryJson = retryText ? JSON.parse(retryText) : null; } catch { /* ignore */ }
                    if (retry.ok && (retryJson?.access_token || retryJson?.session?.access_token)) {
                        const access_token = retryJson.access_token || retryJson.session?.access_token;
                        const refresh_token = retryJson.refresh_token || retryJson.session?.refresh_token;
                        const user = retryJson.user || retryJson.session?.user || null;
                        return res.status(200).json({ ok: true, access_token, refresh_token, user, expires_in: retryJson.expires_in });
                    }
                }
                return res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502).json({
                    error: msg,
                    code,
                });
            }
            const access_token = json?.access_token || json?.session?.access_token;
            const refresh_token = json?.refresh_token || json?.session?.refresh_token;
            const user = json?.user || json?.session?.user || null;
            if (!access_token) {
                return res.status(401).json({ error: 'That code is invalid or expired. Request a new code and try again.' });
            }
            return res.status(200).json({
                ok: true,
                access_token,
                refresh_token: refresh_token || '',
                user,
                expires_in: json?.expires_in,
            });
        }

        return res.status(400).json({ error: 'Unknown auth action' });
    } catch (err: any) {
        console.error('[auth-otp]', err);
        return res.status(502).json({ error: err?.message || 'Auth proxy failed' });
    }
};

// --- USERS ---

/** Making someone an Accountant turns their Fundraiser access switch on. Best effort. */
async function ensureAccountantFundraiserSwitch(supabaseAdmin: any, userId: string | null | undefined, role: unknown, grantedBy?: string | null) {
    if (!userId || String(role || '').toUpperCase() !== 'ACCOUNTANT') return;
    try {
        await supabaseAdmin
            .from('users')
            .update({ fundraiser_access: true, fundraiser_access_granted_by: grantedBy || null, fundraiser_access_granted_at: new Date().toISOString() })
            .eq('id', userId)
            .eq('fundraiser_access', false);
    } catch {
        /* column not added yet — fundraisers_phase_2_access.sql turns existing Accountants on */
    }
}

const handleUsers = async (req: any, res: any) => {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });

    // Staff-verified Serve eligibility (person-level) — separate from signup / opportunities
    if (String(req.query?.subResource || '') === 'serve-eligibility') {
        const { handleServeEligibilityAdmin } = await import('./serveEligibilityAdminHandler.js');
        return handleServeEligibilityAdmin(req, res);
    }

    const { user, role } = await verifyAuth(req, supabaseAdmin);

    // Allow onboarding self-profile creation: PATCH where body.id === x-user-id header
    const isOnboardingPatch = req.method === 'PATCH'
        && req.body?.id
        && req.headers?.['x-user-id']
        && req.body.id === req.headers['x-user-id'];

    if (!user && !isOnboardingPatch) {
        return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    const effectiveUser = user ?? { id: req.body.id, email: req.body.email || null, metadata: null, name: null, title: null };
    const effectiveRole = role ?? 'user';
    const isAdmin = effectiveRole && ['SUPER_ADMIN', 'PASTOR', 'ADMIN_STAFF', 'ADMIN', 'SECRETARY', 'ASST_SECRETARY', 'FIRST_LADY', 'FINANCE'].includes(effectiveRole);
    const isSuperAdmin = effectiveRole === 'SUPER_ADMIN';

    if (req.method === 'GET') {
        // Check if this is a self-profile request (used during login)
        const selfOnly = req.query?.self === 'true';
        const emailLookup = typeof req.query?.email === 'string' ? req.query.email.toLowerCase().trim() : '';
        
        // For self-only requests or non-admin users, return only their own profile
        if (!isAdmin || selfOnly) {
            // Link invited email rows to Auth UUID when needed (fixes onboarding loop + missing roles)
            const data = await resolveAppUser(
                supabaseAdmin,
                effectiveUser.id,
                effectiveUser.email || req.headers?.['x-user-email'] || null,
                effectiveUser.metadata || null
            );
            // Backfill Members directory for Auth-only / PENDING stubs created before sync existed
            if (data?.id) {
                await ensureMemberForUser(supabaseAdmin, data);
            }
            return res.status(200).json({ ok: true, users: data ? [data] : [] });
        }

        // Admin: look up a single login account by email (Grant Access / role assignment)
        if (emailLookup) {
            const { data, error } = await supabaseAdmin
                .from('users')
                .select('id, email, name, role, title, created_at')
                .ilike('email', emailLookup)
                .maybeSingle();
            if (error) {
                console.error('Users email lookup error:', error);
                return res.status(500).json({ error: error.message });
            }
            return res.status(200).json({ ok: true, users: data ? [data] : [], exists: !!data });
        }
        
        // Admin fetching all users — first pull Auth-only signups into PENDING + Members
        if (isSuperAdmin) {
            await reconcileAuthPendingSignups(supabaseAdmin);
        }

        const { data, error } = await supabaseAdmin.from('users').select('*').order('created_at', { ascending: false });
        if (error) {
            console.error("Users Fetch Error:", error);
            const { data: d2, error: e2 } = await supabaseAdmin.from('users').select('id, email, name, role').limit(100);
            if (e2) throw e2;
            return res.status(200).json({ ok: true, users: d2 });
        }
        return res.status(200).json({ ok: true, users: data });
    }
    if (req.method === 'POST') {
        if (!isAdmin) return res.status(403).json({ error: 'Unauthorized: Only admins can manage users' });
        const data = req.body;
        const requestedRole = String(data.role || 'MEMBER').toUpperCase();
        if (requestedRole !== 'MEMBER' && !isSuperAdmin) {
            return res.status(403).json({ error: 'Only Super Admins can assign roles.' });
        }
        const assignedRole = isSuperAdmin ? requestedRole : 'MEMBER';
        const normalizedEmail = String(data.email || '').toLowerCase().trim();
        if (!normalizedEmail) {
            return res.status(400).json({ error: 'Email is required.' });
        }
        const name = String(data.name || `${data.firstName || ''} ${data.lastName || ''}`).trim();
        const title = data.title || '';

        // Existing login: assign role only — do not overwrite password unless resetPassword: true
        const { data: existingByEmail } = await supabaseAdmin
            .from('users')
            .select('*')
            .ilike('email', normalizedEmail)
            .maybeSingle();

        if (existingByEmail) {
            const wantReset =
                data.resetPassword === true ||
                data.reset_password === true;

            const profileUpdates: Record<string, any> = {
                role: assignedRole,
            };
            if (name) profileUpdates.name = name;
            if (title !== undefined && title !== '') profileUpdates.title = title;

            if (wantReset) {
        const bcrypt = await getBcrypt();
        if (!bcrypt) throw new Error('Bcrypt library failed to load');
                const pwd = typeof data.password === 'string' ? data.password.trim() : '';
                if (pwd.length < 6) {
                    return res.status(400).json({
                        error: 'To reset password, provide a temporary password (at least 6 characters).',
                    });
                }
                profileUpdates.password_hash = await bcrypt.hash(pwd, 10);
                profileUpdates.is_temporary_password = true;
            }

            console.log(
                `[Vault API] Existing account ${normalizedEmail}: role → ${assignedRole}` +
                    (wantReset ? ' (password reset)' : ' (password kept)')
            );

            const { data: updatedUser, error } = await supabaseAdmin
                .from('users')
                .update(profileUpdates)
                .eq('id', existingByEmail.id)
                .select()
                .single();

            if (error) {
                console.error('[Vault API] User role update Error:', error);
                throw error;
            }

            const logAudit = await getAudit();
            await logAudit({
                action: wantReset
                    ? 'Administrator Access Password Reset + Role Updated'
                    : 'Administrator Role Assigned (existing account)',
                details: { role: assignedRole, email: normalizedEmail, name, resetPassword: wantReset },
                resourceType: 'user',
                resourceId: existingByEmail.id,
                severity: 'info',
                req
            });
            await ensureAccountantFundraiserSwitch(supabaseAdmin, existingByEmail.id, assignedRole, user?.id);

            // Staff & Roles / Grant Access must also show in Members directory
            await ensureMemberForUser(supabaseAdmin, updatedUser || existingByEmail, {
                name: name || updatedUser?.name || existingByEmail.name,
                email: normalizedEmail,
            });

            return res.status(200).json({
                ok: true,
                user: updatedUser,
                alreadyHadAccess: true,
                passwordReset: wantReset,
            });
        }

        // New login: create with temporary password
        const nameParts = name.split(/\s+/).filter(Boolean);
        if (nameParts.length < 2) {
            return res.status(400).json({ error: 'First and last name are required.' });
        }
        const bcrypt = await getBcrypt();
        if (!bcrypt) throw new Error('Bcrypt library failed to load');
        const pwd = typeof data.password === 'string' ? data.password.trim() : '';
        if (pwd.length < 6) {
            return res.status(400).json({
                error: 'Temporary password is required for new accounts (at least 6 characters).',
            });
        }
        const hashedPassword = await bcrypt.hash(pwd, 10);

        console.log(`[Vault API] Creating access for: ${normalizedEmail} as ${assignedRole}`);

        const { data: newUser, error } = await supabaseAdmin.from('users').insert({
            email: normalizedEmail,
            password_hash: hashedPassword,
            name: name,
            role: assignedRole,
            title: title || '',
            is_temporary_password: true
        }).select().single();

        if (error) {
            console.error('[Vault API] User Insert Error:', error);
            throw error;
        }

        const logAudit = await getAudit();
        await logAudit({
            action: 'Administrator Access Granted/Updated',
            details: { role: assignedRole, email: normalizedEmail, name },
            resourceType: 'user',
            severity: 'info',
            req
        });
        await ensureAccountantFundraiserSwitch(supabaseAdmin, newUser?.id, assignedRole, user?.id);

        await ensureMemberForUser(supabaseAdmin, newUser, {
            name: name || newUser?.name,
            email: normalizedEmail,
        });

        return res.status(201).json({ ok: true, user: newUser, alreadyHadAccess: false });
    }
    if (req.method === 'PATCH') {
        const { id, ...updates } = req.body;
        
        // Check if user exists first to avoid ReferenceError below
        const { data: existingUser } = await supabaseAdmin.from('users').select('*').eq('id', id).single();
        
        if (!isAdmin && id !== effectiveUser.id) return res.status(403).json({ error: 'Unauthorized: You can only update your own profile' });

        // Only SUPER_ADMIN may assign or change roles
        if (updates.role !== undefined) {
            if (!isSuperAdmin) {
                if (!isAdmin) {
                    delete updates.role;
                } else {
                    return res.status(403).json({ error: 'Only Super Admins can assign roles.' });
                }
            } else {
                const nextRole = String(updates.role || '').toUpperCase();
                updates.role = nextRole;
                // Prevent demoting the last Super Admin
                if (
                    existingUser?.role === 'SUPER_ADMIN' &&
                    nextRole !== 'SUPER_ADMIN' &&
                    id === effectiveUser.id
                ) {
                    const { count } = await supabaseAdmin
                        .from('users')
                        .select('id', { count: 'exact', head: true })
                        .eq('role', 'SUPER_ADMIN');
                    if ((count || 0) <= 1) {
                        return res.status(400).json({
                            error: 'You are the last Super Admin. Promote someone else before changing your own role.',
                        });
                    }
                }
            }
        }

        // Strip fields that don't exist in the schema to prevent 500s
        const knownColumns = ['name', 'email', 'title', 'role', 'avatar_url', 'birthday', 'phone',
            'password_hash', 'is_temporary_password', 'children', 'ministries', 'notification_prefs'];
        const safeUpdates = Object.fromEntries(
            Object.entries(updates).filter(([k]) => knownColumns.includes(k))
        );

        // Allow clients to send `password` — hash it into password_hash
        if (typeof updates.password === 'string' && updates.password.trim().length >= 6) {
            const bcrypt = await getBcrypt();
            if (!bcrypt) throw new Error('Bcrypt library failed to load');
            safeUpdates.password_hash = await bcrypt.hash(updates.password.trim(), 10);
            safeUpdates.is_temporary_password = false;
        }

        // Convert empty strings to null for date/optional fields
        if (safeUpdates.birthday === '') safeUpdates.birthday = null;
        if (safeUpdates.phone === '') safeUpdates.phone = null;
        if (safeUpdates.avatar_url === '') safeUpdates.avatar_url = null;

        // Auto-approve public signups once onboarding completes (staff roles stay Super Admin-only)
        const incomingPrefs = (safeUpdates.notification_prefs ?? updates.notification_prefs) as any;
        const onboardingCompletedAt = incomingPrefs?.onboarding?.completedAt;
        if (onboardingCompletedAt) {
            const nameForSignup = String(safeUpdates.name ?? existingUser?.name ?? '').trim();
            const signupParts = nameForSignup.split(/\s+/).filter(Boolean);
            if (signupParts.length < 2) {
                return res.status(400).json({ error: 'First and last name are required.' });
            }
        }
        const existingRole = String(existingUser?.role || '').toUpperCase();
        if (
            onboardingCompletedAt &&
            (!existingRole || existingRole === 'PENDING') &&
            // Do not override an explicit Super Admin role assignment in the same PATCH
            !(isSuperAdmin && updates.role !== undefined)
        ) {
            safeUpdates.role = 'MEMBER';
        }

        let updatedUser;
        let error;

        if (existingUser) {
            const res = await supabaseAdmin.from('users').update(safeUpdates).eq('id', id).select().single();
            updatedUser = res.data;
            error = res.error;

            // If phone column doesn't exist yet, retry without it
            if (error?.message?.includes("phone")) {
                const { phone: _p, ...withoutPhone } = safeUpdates;
                const retry = await supabaseAdmin.from('users').update(withoutPhone).eq('id', id).select().single();
                updatedUser = retry.data;
                error = retry.error;
            }
        } else {
            // Insert new user from Onboarding
            const bcrypt = await getBcrypt();
            const tempHash = bcrypt ? await bcrypt.hash('Temporary123!', 10) : 'TEMP_HASH';
            
            const payload = {
                id,
                email: safeUpdates.email || 'pending@email.com',
                password_hash: tempHash,
                ...safeUpdates,
                // Onboarding complete → MEMBER; otherwise stay PENDING until Staff & Roles / onboarding
                role: (safeUpdates as any).role || (onboardingCompletedAt ? 'MEMBER' : 'PENDING'),
            };
            
            // Link invited/staff email row onto this Auth UUID when needed, then save profile
            const linked = await resolveAppUser(supabaseAdmin, id, payload.email);
            if (linked) {
                const { name, title, avatar_url, birthday } = safeUpdates as any;
                const profileUpdates: any = {};
                if (name !== undefined) profileUpdates.name = name;
                if (title !== undefined) profileUpdates.title = title;
                if (avatar_url !== undefined) profileUpdates.avatar_url = avatar_url;
                if (birthday !== undefined) profileUpdates.birthday = birthday;
                // Prefer Auth UUID row after a successful link
                const targetId = linked.id === id ? id : linked.id;
                const res = await supabaseAdmin
                    .from('users')
                    .update(profileUpdates)
                    .eq('id', targetId)
                    .select()
                    .single();
                updatedUser = res.data;
                error = res.error;
                // Ensure client session uses Auth UUID even if link could not rewrite the PK yet
                if (updatedUser && updatedUser.id !== id) {
                    updatedUser = { ...updatedUser, id };
                }
            } else {
                const res = await supabaseAdmin.from('users').insert([payload]).select().single();
                updatedUser = res.data;
                error = res.error;
            }
        }
        if (error) throw error;

        // Settings / onboarding / role changes on users — create or update Members directory row
        await ensureMemberForUser(
            supabaseAdmin,
            {
                id: updatedUser?.id || id,
                email: updatedUser?.email || existingUser?.email || safeUpdates.email,
                name: updatedUser?.name || safeUpdates.name || existingUser?.name,
                role: updatedUser?.role || safeUpdates.role || existingUser?.role,
                phone: updatedUser?.phone ?? safeUpdates.phone ?? existingUser?.phone,
                birthday: updatedUser?.birthday ?? safeUpdates.birthday ?? existingUser?.birthday,
                avatar_url: updatedUser?.avatar_url ?? safeUpdates.avatar_url ?? existingUser?.avatar_url,
                children: updatedUser?.children ?? safeUpdates.children ?? existingUser?.children,
            },
            {
                ...(('birthday' in safeUpdates) ? { birthday: safeUpdates.birthday } : {}),
                ...(('phone' in safeUpdates) ? { phone: safeUpdates.phone } : {}),
                ...(('avatar_url' in safeUpdates) ? { avatar_url: safeUpdates.avatar_url } : {}),
                ...(('children' in safeUpdates) ? { children: safeUpdates.children } : {}),
                ...(('name' in safeUpdates) ? { name: safeUpdates.name } : {}),
            }
        );

        const logAudit = await getAudit();
        await logAudit({ action: 'User Access Modified', details: updates, resourceType: 'user', resourceId: id, severity: updates.role ? 'critical' : 'warning', req });
        await ensureAccountantFundraiserSwitch(supabaseAdmin, id, (safeUpdates as any).role, user?.id);
        return res.status(200).json({ ok: true, user: updatedUser });
    }
    return res.status(405).json({ error: 'Method not allowed' });
};

// --- EVENTS ---
const handleEvents = async (req: any, res: any) => {
    const { subResource, query, type, id, limit, offset = '0', all } = req.query;
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });

    // Serve opportunities admin (member signup workflow) — separate from event_volunteers roster
    if (subResource === 'serve' || subResource === 'serve-signups') {
        const { handleServeAdmin } = await import('./serveAdminHandler.js');
        return handleServeAdmin(req, res);
    }

    if (subResource === 'stats') {
        const statsAuth = await requireAuth(req, res, supabaseAdmin);
        if (!statsAuth?.user) return;
        if (eventsStatsDecision(statsAuth.role) !== 'ok') {
            return res.status(403).json({ ok: false, error: 'This action requires a staff role.' });
        }
        const today = new Date().toISOString().split('T')[0];

        try {
            const [upcomingRes, memberRes, checkInRes] = await Promise.allSettled([
                supabaseAdmin
            .from('events')
                    .select('id, name, date, time, location, status', { count: 'exact' })
            .gte('date', today)
            .order('date', { ascending: true })
                    .limit(12),
                supabaseAdmin.from('members').select('*', { count: 'exact', head: true }),
                supabaseAdmin
            .from('event_checkins')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', `${today}T00:00:00`)
                    .lte('created_at', `${today}T23:59:59`),
            ]);

            const upcomingRaw =
                upcomingRes.status === 'fulfilled' && !upcomingRes.value.error
                    ? upcomingRes.value
                    : { data: [], count: 0 };
            const upcomingList = ((upcomingRaw.data as any[]) || [])
                .filter((ev) => normalizeEventStatus(ev?.status) === 'approved')
                .slice(0, 3);
            const upcoming = {
                data: upcomingList,
                count: upcomingList.length || (upcomingRaw.count || 0),
            };
            const memberCount =
                memberRes.status === 'fulfilled' && !memberRes.value.error
                    ? memberRes.value.count || 0
                    : 0;
            const checkInCount =
                checkInRes.status === 'fulfilled' && !checkInRes.value.error
                    ? checkInRes.value.count || 0
                    : 0;

        return res.status(200).json({
                upcomingEvents: upcoming.count || 0,
                upcomingEventsList: upcoming.data || [],
                totalMembers: memberCount,
                checkInsToday: checkInCount,
            });
        } catch (err: any) {
            console.error('[Events stats]', err);
            return res.status(200).json({
                upcomingEvents: 0,
                upcomingEventsList: [],
                totalMembers: 0,
                checkInsToday: 0,
            });
        }
    }

    if (subResource === 'rsvp-config') {
        try {
            const requestedEventId =
                (typeof req.query?.eventId === 'string' && req.query.eventId) || null;
            const id = String(requestedEventId || '').trim();
            if (!id) {
                return res.status(400).json({ ok: false, error: 'eventId is required' });
            }

            const { row } = await loadRsvpEventRow(supabaseAdmin, id);

            if (row) {
                const cfg = runtimeConfigFromDbEvent(row);
                if (!cfg) {
                    return res.status(404).json({
                        ok: false,
                        error: 'Signup is not enabled for this event',
                    });
                }
                return res.status(200).json(publicRsvpConfigPayload(cfg));
            }

            const kitCfg = runtimeConfigFromKit(id);
            if (kitCfg) {
                return res.status(200).json(publicRsvpConfigPayload(kitCfg));
            }

            return res.status(404).json({
                ok: false,
                error: 'Event not found or signup not enabled',
            });
        } catch (err: any) {
            console.error('[RSVP config] GET error:', err);
            return res.status(500).json({ ok: false, error: err.message || 'Could not load signup config' });
        }
    }

    if (subResource === 'rsvp-enabled-events') {
        try {
            const { user, role } = await verifyAuth(req, supabaseAdmin);
            if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
            if (String(role || '').toUpperCase() !== 'SUPER_ADMIN') {
                return res.status(403).json({ ok: false, error: 'Only Super Admin can list RSVP events' });
            }
            const { data, error } = await supabaseAdmin
                .from('events')
                .select('id, name, date, rsvp_enabled, rsvp_template, rsvp_close_at')
                .eq('rsvp_enabled', true)
                .order('date', { ascending: true });
            if (error) throw error;
            return res.status(200).json({ ok: true, events: data || [] });
        } catch (err: any) {
            console.error('[RSVP enabled events] GET error:', err);
            return res.status(500).json({ ok: false, error: err.message || 'Could not list RSVP events' });
        }
    }

    /**
     * GET ?subResource=rsvp-status&r=<registration id> — public, for the guest's own RSVP
     * confirmation (Tithe sends them back here after paying). The registration id is a random
     * UUID only the guest has. Checks PLCC Tithe first, so a just-confirmed payment shows Paid.
     */
    if (subResource === 'rsvp-status') {
        res.setHeader('Cache-Control', 'private, no-store');
        if (req.method !== 'GET') {
            return res.status(405).json({ ok: false, error: 'Method not allowed' });
        }
        const regId = String(req.query?.r || '').trim().toLowerCase();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(regId)) {
            return res.status(400).json({ ok: false, error: 'That signup link is not valid.' });
        }
        try {
            const { data: reg, error: regErr } = await supabaseAdmin
                .from('event_registrations')
                .select('*')
                .eq('id', regId)
                .maybeSingle();
            if (regErr) throw regErr;
            if (!reg) return res.status(404).json({ ok: false, error: 'We couldn’t find that signup.' });

            const evId = String(reg.event_id || '');
            const { row: evRow } = await loadRsvpEventRow(supabaseAdmin, evId);
            const cfg = (evRow && runtimeConfigFromDbEvent(evRow)) || runtimeConfigFromKit(evId);
            const eventName = cfg?.name || evRow?.name || 'your event';
            const fund = cfg?.fundName || eventFundName(evId, eventName);

            const amount = Number(reg.food_contribution_amount) || 0;
            const tracked =
                amount > 0 &&
                !reg.food_contribution_paid &&
                (reg.food_contribution_intent === 'pay_now' || reg.food_contribution_intent === 'pledge');
            if (tracked) {
                await syncRsvpGiftsFromTithe(supabaseAdmin, [reg], {
                    eventShortName: cfg?.shortName || eventName,
                    eventFundName: fund,
                    eventId: evId,
                    previousFundNames: eventFundPreviousNames(evId),
                });
            }
            const status = rsvpPayStatus({
                paid: reg.food_contribution_paid,
                intent: reg.food_contribution_intent,
                titheStatus: reg.tithe_status,
                titheMethod: reg.tithe_method,
            });
            const household = Number(reg.household_size) || 1;
            const children = Number(reg.children_count) || 0;
            const adults = Math.max(1, household - children);
            const guests = Number(reg.guests_invited) || 0;

            let payUrl: string | null = null;
            if (amount > 0 && (status === 'due' || status === 'pledged') && cfg?.paymentChoiceEnabled) {
                const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
                const origin = host
                    ? `${host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'}://${host}`
                    : 'https://plcc-vault.vercel.app';
                payUrl = buildTitheRsvpPayUrl({
                    registrationId: reg.id,
                    amount,
                    label: `${cfg?.shortName || eventName} RSVP`,
                    fund: fund || undefined,
                    name: reg.name,
                    email: reg.email,
                    detail: rsvpPartyLine({ name: reg.name, adults, children, guests, dateLabel: shortEventDate(cfg?.date) }),
                    returnUrl: rsvpReturnUrl(origin, evId, reg.id),
                });
            }

            const paidBy = String(reg.food_contribution_paid_by || '');
            return res.status(200).json({
                ok: true,
                eventId: evId,
                eventName,
                date: cfg?.date || String(evRow?.date || '').slice(0, 10),
                timeLabel: cfg?.timeLabel || '',
                location: cfg?.location || '',
                firstName: String(reg.name || '').trim().split(/\s+/)[0] || 'friend',
                adults,
                children,
                guests,
                amount,
                status,
                paidVia: status === 'paid' && paidBy.startsWith('PLCC Tithe') ? paidBy.split('·')[1]?.trim() || 'PLCC Tithe' : null,
                payUrl,
            });
        } catch (err: any) {
            console.error('[RSVP status] GET error:', err?.message || err);
            return res.status(500).json({ ok: false, error: 'We couldn’t check your signup right now.' });
        }
    }

    /** Who may open the RSVP Archive (read-only, except Super Admin who can restore). */
    const RSVP_ARCHIVE_VIEW_ROLES = new Set(['SUPER_ADMIN', 'PASTOR', 'FIRST_LADY', 'FINANCE']);
    const rsvpArchivedAt = async (eid: string): Promise<string | null> => {
        if (!eid) return null;
        const { data, error } = await supabaseAdmin
            .from('events')
            .select('rsvp_archived_at')
            .eq('id', eid)
            .maybeSingle();
        if (error) return null; // column not added yet → nothing is archived
        return data?.rsvp_archived_at || null;
    };
    const rsvpArchivedForRegistration = async (regId: string): Promise<boolean> => {
        if (!regId) return false;
        const { data } = await supabaseAdmin.from('event_registrations').select('event_id').eq('id', regId).maybeSingle();
        return Boolean(data?.event_id && (await rsvpArchivedAt(String(data.event_id))));
    };

    /**
     * RSVP Archive.
     *   GET  ?subResource=rsvp-archive            — archived RSVPs with totals (Super Admin, Pastor, First Lady, Finance)
     *   POST ?subResource=rsvp-archive {eventId, action: 'archive' | 'restore'} — Super Admin only
     * Archiving keeps every signup and paid record, turns online signup off, and takes the
     * RSVP off the active list and PLCC Connect. Restoring turns it back on.
     */
    if (subResource === 'rsvp-archive') {
        try {
            const { user, role } = await verifyAuth(req, supabaseAdmin);
            if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
            const r = String(role || '').toUpperCase();

            if (req.method === 'GET') {
                if (!RSVP_ARCHIVE_VIEW_ROLES.has(r)) {
                    return res.status(403).json({
                        ok: false,
                        error: 'The RSVP Archive is for the Pastor, First Lady, Finance and Super Admin.',
                    });
                }
                const { data: evs, error: evErr } = await supabaseAdmin
                    .from('events')
                    .select('id, name, date, time, end_time, location, rsvp_archived_at, rsvp_archived_by')
                    .not('rsvp_archived_at', 'is', null)
                    .order('date', { ascending: false });
                if (evErr) throw evErr;
                const ids = (evs || []).map((e: any) => e.id);
                const { data: regs } = ids.length
                    ? await supabaseAdmin
                          .from('event_registrations')
                          .select('event_id, household_size, children_count, guests_invited, food_contribution_amount, food_contribution_paid')
                          .in('event_id', ids)
                    : { data: [] as any[] };
                const stats = new Map<string, any>();
                for (const row of regs || []) {
                    const s0 = stats.get(row.event_id) || { signups: 0, people: 0, paidCount: 0, paidTotal: 0 };
                    s0.signups += 1;
                    s0.people += (Number(row.household_size) || 1) + (Number(row.guests_invited) || 0);
                    if (row.food_contribution_paid) {
                        s0.paidCount += 1;
                        s0.paidTotal += Number(row.food_contribution_amount) || 0;
                    }
                    stats.set(row.event_id, s0);
                }
                return res.status(200).json({
                    ok: true,
                    canRestore: r === 'SUPER_ADMIN',
                    events: (evs || []).map((e: any) => ({
                        id: e.id,
                        name: e.name,
                        date: String(e.date || '').slice(0, 10),
                        time: [e.time, e.end_time].filter(Boolean).join(' – '),
                        location: e.location || '',
                        archivedAt: e.rsvp_archived_at,
                        archivedBy: e.rsvp_archived_by || '',
                        ...(stats.get(e.id) || { signups: 0, people: 0, paidCount: 0, paidTotal: 0 }),
                    })),
                });
            }

            if (req.method === 'POST') {
                if (r !== 'SUPER_ADMIN') {
                    return res.status(403).json({ ok: false, error: 'Only Super Admin can archive or restore an RSVP' });
                }
                const eid = String(req.body?.eventId || '').trim();
                const action = String(req.body?.action || '');
                if (!/^[0-9a-f-]{36}$/i.test(eid)) return res.status(400).json({ ok: false, error: 'eventId is required' });
                if (action !== 'archive' && action !== 'restore') {
                    return res.status(400).json({ ok: false, error: 'action must be archive or restore' });
                }
                const { data: ev } = await supabaseAdmin.from('events').select('id, name').eq('id', eid).maybeSingle();
                if (!ev) return res.status(404).json({ ok: false, error: 'Event not found' });
                const who = String((user as any).name || (user as any).email || 'Super Admin');
                const patch =
                    action === 'archive'
                        ? { rsvp_archived_at: new Date().toISOString(), rsvp_archived_by: who, rsvp_enabled: false }
                        : { rsvp_archived_at: null, rsvp_archived_by: null, rsvp_enabled: true };
                const { error: upErr } = await supabaseAdmin.from('events').update(patch).eq('id', eid);
                if (upErr) throw upErr;
                const logAudit = await getAudit();
                await logAudit({
                    action: action === 'archive' ? 'Event RSVP Archived' : 'Event RSVP Restored',
                    details: { eventId: eid, name: ev.name },
                    resourceType: 'event',
                    resourceId: eid,
                    severity: 'info',
                    req,
                });
                return res.status(200).json({ ok: true, eventId: eid, action });
            }
            return res.status(405).json({ ok: false, error: 'Method not allowed' });
        } catch (err: any) {
            console.error('[RSVP archive] error:', err);
            return res.status(500).json({ ok: false, error: err.message || 'Could not update the RSVP Archive' });
        }
    }

    /**
     * DELETE ?subResource=rsvp-list&eventId=… — Super Admin removes an event's RSVP (the sign-up
     * list itself). Refused while anyone on it has paid, pledged, or has a gift waiting for
     * Finance. Otherwise every signup on it is removed and RSVP is turned off for the event;
     * the event itself stays on the calendar.
     */
    if (subResource === 'rsvp-list') {
        if (req.method !== 'DELETE') {
            return res.status(405).json({ ok: false, error: 'Method not allowed' });
        }
        try {
            const { user, role } = await verifyAuth(req, supabaseAdmin);
            if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
            if (String(role || '').toUpperCase() !== 'SUPER_ADMIN') {
                return res.status(403).json({ ok: false, error: 'Only Super Admin can delete an RSVP' });
            }
            const eid = String(req.query?.eventId || req.body?.eventId || '').trim();
            if (!/^[0-9a-f-]{36}$/i.test(eid)) return res.status(400).json({ ok: false, error: 'eventId is required' });

            const { data: ev } = await supabaseAdmin.from('events').select('id, name').eq('id', eid).maybeSingle();
            if (!ev) return res.status(404).json({ ok: false, error: 'Event not found' });
            if (await rsvpArchivedAt(eid)) {
                return res.status(409).json({ ok: false, error: 'This RSVP is archived. Restore it first if you want to delete it.' });
            }

            const { data: regRows, error: regErr } = await supabaseAdmin
                .from('event_registrations')
                .select('*')
                .eq('event_id', eid);
            if (regErr) throw regErr;
            const regs: any[] = regRows || [];

            const withGift = regs.filter(
                (r) =>
                    Number(r.food_contribution_amount) > 0 &&
                    (r.food_contribution_intent === 'pay_now' || r.food_contribution_intent === 'pledge')
            );
            const unpaidGifts = withGift.filter((r) => !r.food_contribution_paid);
            if (unpaidGifts.length) {
                // Ask PLCC Tithe first: a gift may have been paid or sent since the list was loaded.
                const check = await syncRsvpGiftsFromTithe(supabaseAdmin, unpaidGifts);
                if (check.warning && !/not configured/i.test(check.warning)) {
                    return res.status(503).json({
                        ok: false,
                        error: 'Could not check PLCC Tithe for gifts on this RSVP. Please try again in a minute.',
                    });
                }
                if (check.updated > 0) {
                    const { data: paidNow } = await supabaseAdmin
                        .from('event_registrations')
                        .select('id')
                        .eq('event_id', eid)
                        .eq('food_contribution_paid', true);
                    const paidIds = new Set((paidNow || []).map((x: any) => x.id));
                    for (const r of regs) if (paidIds.has(r.id)) r.food_contribution_paid = true;
                }
            }

            const blockers = regs.filter(
                (r) =>
                    r.food_contribution_paid ||
                    r.tithe_status === 'processing' ||
                    (r.food_contribution_intent === 'pledge' && Number(r.food_contribution_amount) > 0)
            );
            if (blockers.length) {
                const names = blockers.slice(0, 5).map((r) => String(r.name || 'A guest'));
                const more = blockers.length > 5 ? ` and ${blockers.length - 5} more` : '';
                return res.status(409).json({
                    ok: false,
                    code: 'RSVP_HAS_GIFTS',
                    blockers: blockers.map((r) => ({ id: r.id, name: r.name })),
                    error: `This RSVP can't be deleted: ${names.join(', ')}${more} ${
                        blockers.length === 1 ? 'has' : 'have'
                    } paid or pledged.`,
                });
            }

            if (regs.length) {
                const { error: delErr } = await supabaseAdmin.from('event_registrations').delete().eq('event_id', eid);
                if (delErr) throw delErr;
            }
            const { error: offErr } = await supabaseAdmin.from('events').update({ rsvp_enabled: false }).eq('id', eid);
            if (offErr) throw offErr;

            const logAudit = await getAudit();
            await logAudit({
                action: 'Event RSVP Deleted',
                details: { eventId: eid, name: ev.name, removedSignups: regs.length },
                resourceType: 'event',
                resourceId: eid,
                severity: 'warning',
                req,
            });
            return res.status(200).json({ ok: true, eventId: eid, removedSignups: regs.length });
        } catch (err: any) {
            console.error('[RSVP list] DELETE error:', err);
            return res.status(500).json({ ok: false, error: err.message || 'Could not delete the RSVP' });
        }
    }

    if (subResource === 'rsvp') {
        const requestedEventId =
            (typeof req.query?.eventId === 'string' && req.query.eventId) ||
            (typeof req.body?.eventId === 'string' && req.body.eventId) ||
            null;

        const ensureKitEventId = async (kitId: string): Promise<string | null> => {
            const fellowshipCfg = getFellowshipEventConfig(kitId);
            const COOKOUT_EVENT_ID = fellowshipCfg.eventId;
            const COOKOUT_DATE = fellowshipCfg.date;
            const COOKOUT_NAME = fellowshipCfg.name;

            const { data: byId } = await supabaseAdmin
                .from('events')
                .select('id')
                .eq('id', COOKOUT_EVENT_ID)
                .maybeSingle();
            if (byId?.id) return byId.id;

            const { data: byName } = await supabaseAdmin
                .from('events')
                .select('id')
                .eq('name', COOKOUT_NAME)
                .eq('date', COOKOUT_DATE)
                .maybeSingle();
            if (byName?.id) return byName.id;

            // Never re-create a built-in event here. Staff opening an RSVP list used to bring
            // back events that had been deleted from the calendar (the Nov 22 Thanksgiving copy).
            return null;
        };

        const resolveRsvpTarget = async (): Promise<
            | { ok: true; eventId: string; cfg: EventRsvpRuntimeConfig }
            | { ok: false; status: number; error: string }
        > => {
            const id = String(requestedEventId || '').trim();
            if (!id) {
                return { ok: false, status: 400, error: 'eventId is required' };
            }

            const { row } = await loadRsvpEventRow(supabaseAdmin, id);

            if (row) {
                const cfg = runtimeConfigFromDbEvent(row);
                if (!cfg) {
                    return {
                        ok: false,
                        status: 403,
                        error: 'Signup is not enabled for this event',
                    };
                }
                return { ok: true, eventId: row.id, cfg };
            }

            if (isKnownFellowshipKitId(id)) {
                const kitCfg = runtimeConfigFromKit(id);
                if (!kitCfg) {
                    return { ok: false, status: 404, error: 'Event not found or signup not enabled' };
                }
                const eventId = await ensureKitEventId(id);
                if (!eventId) {
                    return {
                        ok: false,
                        status: 404,
                        error: `${kitCfg.shortName || kitCfg.name} is no longer on the calendar, so it has no RSVP list.`,
                    };
                }
                return { ok: true, eventId, cfg: kitCfg };
            }

            return {
                ok: false,
                status: 404,
                error: 'Event not found or signup not enabled',
            };
        };

        // Legacy aliases used by staff GET messages when resolve fails early
        const fellowshipCfg = getFellowshipEventConfig(requestedEventId);

        if (req.method === 'POST') {
            try {
                const target = await resolveRsvpTarget();
                if (!target.ok) {
                    return res.status(target.status).json({ ok: false, error: target.error });
                }
                const { eventId, cfg } = target;

                // Staff "Add RSVP" from the Vault's RSVP list: Super Admin only. It works after
                // signups close, and skips the guest-only rules (Pledge/Pay Now choice, gift
                // minimum, T-shirts, adults-from-home limit). No money moves here — a Pay Now
                // gift is still finished on PLCC Tithe and recorded in PLCC DCB the usual way.
                const staffAdd = req.body?.staffAdd === true;
                let staffAddedBy: string | null = null;
                if (staffAdd) {
                    const { user: staffUser, role: staffRole } = await verifyAuth(req, supabaseAdmin);
                    if (!staffUser) return res.status(401).json({ ok: false, error: 'Unauthorized' });
                    if (String(staffRole || '').toUpperCase() !== 'SUPER_ADMIN') {
                        return res.status(403).json({ ok: false, error: 'Only Super Admin can add RSVPs' });
                    }
                    staffAddedBy = String(staffUser.name || staffUser.email || 'staff').trim();
                }

                if (cfg.closed && !staffAdd) {
                    return res.status(403).json({
                        ok: false,
                        error: closedMessageForName(cfg.name),
                    });
                }

                const body = req.body || {};
                const name = String(body.name || '').trim();
                const phone = String(body.phone || '').trim();
                const email = String(body.email || '').trim() || null;
                const allergies = String(body.allergies || '').trim() || null;
                const notes =
                    [String(body.notes || '').trim(), staffAdd ? `Added in the Vault by ${staffAddedBy}` : '']
                        .filter(Boolean)
                        .join(' | ') || null;
                const foodBringing = String(body.food_bringing ?? body.foodBringing ?? '').trim() || null;
                const tshirtSizes = String(body.tshirt_sizes ?? body.tshirtSizes ?? '').trim() || null;

                if (!name) return res.status(400).json({ ok: false, error: 'Please enter your name' });
                if (!phone && !staffAdd) return res.status(400).json({ ok: false, error: 'Please enter a phone number' });
                // Email is required on public RSVPs (confirmations and PLCC Tithe receipts); staff adding
                // someone in the Vault may leave it blank for a member who has no email.
                if (!email && !staffAdd) return res.status(400).json({ ok: false, error: 'Please enter your email' });
                if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
                    return res.status(400).json({ ok: false, error: 'Please enter a valid email, like name@example.com' });
                }
                if (!allergies) {
                    return res.status(400).json({
                        ok: false,
                        error: 'Food allergies is required. List allergies or write None.',
                    });
                }

                let householdSize = Number(body.household_size ?? body.householdSize);
                let childrenCount = Number(body.children_count ?? body.childrenCount ?? 0);
                let guestsInvited = Number(body.guests_invited ?? body.guestsInvited ?? 0);
                let foodContributionAmount: number | null = null;

                if (cfg.template === 'simple') {
                    if (!Number.isFinite(householdSize) || householdSize < 1) {
                        return res.status(400).json({
                            ok: false,
                            error: 'Please enter how many people are coming (at least 1)',
                        });
                    }
                    childrenCount = 0;
                    guestsInvited = 0;
                    foodContributionAmount = null;
                } else {
                    const rawContribution = body.food_contribution_amount ?? body.foodContributionAmount;
                    if (staffAdd) {
                        // Staff may leave the gift blank, or enter any amount (no minimum).
                        if (rawContribution == null || String(rawContribution).trim() === '') {
                            foodContributionAmount = null;
                        } else {
                            const n = Number(String(rawContribution).replace(/[$,\s]/g, ''));
                            if (!Number.isFinite(n) || n < 0) {
                                return res.status(400).json({ ok: false, error: 'Food funds must be a dollar amount.' });
                            }
                            foodContributionAmount = Math.round(n * 100) / 100;
                        }
                    } else {
                        const contributionParsed = parseRsvpContribution(rawContribution, cfg.giftMin);
                        if (!contributionParsed.ok) {
                            return res.status(400).json({
                                ok: false,
                                error: contributionParsed.error,
                            });
                        }
                        foodContributionAmount = contributionParsed.value;
                    }

                    if (cfg.tshirtsEnabled && !tshirtSizes && !staffAdd) {
                        return res.status(400).json({
                            ok: false,
                            error: 'Please choose at least one T-shirt size for your household.',
                        });
                    }
                    if (!Number.isFinite(householdSize) || householdSize < 1) {
                        return res.status(400).json({ ok: false, error: 'Household size must be at least 1' });
                    }
                    if (!Number.isFinite(childrenCount) || childrenCount < 0) {
                        return res.status(400).json({ ok: false, error: 'Children count cannot be negative' });
                    }
                    if (childrenCount > householdSize) {
                        return res.status(400).json({ ok: false, error: 'Children cannot be more than household size' });
                    }
                    const adultsFromHome = Math.floor(householdSize) - Math.floor(childrenCount);
                    const maxAdults = Math.max(1, Number(cfg.maxAdultsFromHome) || 2);
                    if (!staffAdd && (adultsFromHome < 1 || adultsFromHome > maxAdults)) {
                        return res.status(400).json({
                            ok: false,
                            error:
                                maxAdults <= 2
                                    ? 'Adults from your home must be 1 (just you) or 2 (you and your spouse). Other adults go under Guests.'
                                    : `Adults from your home must be between 1 and ${maxAdults} (include adult children who live with you). Visitors go under Guests.`,
                        });
                    }
                    if (!Number.isFinite(guestsInvited) || guestsInvited < 0) {
                        return res.status(400).json({ ok: false, error: 'Number of guests invited cannot be negative' });
                    }
                    // Per-person events (Marrieds Dinner): Me and my spouse = 2 × the minimum.
                    if (!staffAdd && cfg.giftPerPerson && foodContributionAmount != null) {
                        const needed = cfg.giftMin * Math.max(1, adultsFromHome);
                        if (foodContributionAmount < needed) {
                            return res.status(400).json({
                                ok: false,
                                error: `The contribution is $${cfg.giftMin} per person — $${needed} for ${adultsFromHome} adults.`,
                            });
                        }
                    }
                }

                let giftIntent: string | null = null;
                let giftMethod: string | null = null;
                if (staffAdd && cfg.template === 'fellowship' && cfg.paymentChoiceEnabled) {
                    // Optional for staff: keep a Pledge / Pay Now choice only if one was sent.
                    const choice = parseGiftPaymentChoice(body);
                    if (choice.ok && choice.intent) {
                        giftIntent = choice.intent;
                        giftMethod = choice.method;
                    }
                } else if (cfg.template === 'fellowship' && cfg.paymentChoiceEnabled) {
                    const choice = parseGiftPaymentChoice(body);
                    if (!choice.ok) {
                        return res.status(400).json({ ok: false, error: choice.error });
                    }
                    if (!choice.intent) {
                        return res.status(400).json({
                            ok: false,
                            error: 'Choose Pledge or Pay Now for your food contribution.',
                        });
                    }
                    if (choice.intent === 'pledge' && !cfg.allowPledge) {
                        return res.status(400).json({
                            ok: false,
                            error: 'Please choose Pay now for this event.',
                        });
                    }
                    giftIntent = choice.intent;
                    giftMethod = choice.method;
                }

                const allergyAck = Boolean(body.food_allergy_acknowledged ?? body.foodAllergyAcknowledged);
                const allergySignedName = String(body.food_allergy_signed_name ?? body.foodAllergySignedName ?? '').trim();
                const injuryAck = Boolean(body.injury_acknowledged ?? body.injuryAcknowledged);
                const injurySignedName = String(body.injury_signed_name ?? body.injurySignedName ?? '').trim();
                if (staffAdd && cfg.template === 'fellowship' && Math.floor(childrenCount) > 0) {
                    // Staff type the parent's name for the consents the parent agreed to.
                    const signed = allergySignedName || injurySignedName;
                    if (!signed || signed.length < 2) {
                        return res.status(400).json({
                            ok: false,
                            error: "When children attend, type the parent's name who agreed to the consents.",
                        });
                    }
                } else if (cfg.template === 'fellowship' && Math.floor(childrenCount) > 0) {
                    if (!allergyAck) {
                        return res.status(400).json({
                            ok: false,
                            error: 'Food Allergy Consent is required when children are attending. Please read and acknowledge it.',
                        });
                    }
                    if (!injuryAck) {
                        return res.status(400).json({
                            ok: false,
                            error: 'Premises Injury & Parent Supervision Consent is required when children are attending.',
                        });
                    }
                    const signed = allergySignedName || injurySignedName;
                    if (!signed || signed.length < 2) {
                        return res.status(400).json({
                            ok: false,
                            error: 'Please type your full name to sign the required parent consents.',
                        });
                    }
                }

                const kids = cfg.template === 'fellowship' && Math.floor(childrenCount) > 0;
                const signedName = (allergySignedName || injurySignedName || '').trim() || null;
                const signedAt = kids ? new Date().toISOString() : null;

                const row: Record<string, any> = {
                    event_id: eventId,
                    name,
                    phone: phone || null,
                    email,
                    household_size: Math.floor(householdSize),
                    children_count: Math.floor(childrenCount),
                    guests_invited: Math.floor(guestsInvited),
                    food_contribution_amount:
                        foodContributionAmount == null
                            ? null
                            : Math.round(foodContributionAmount * 100) / 100,
                    food_contribution_intent: giftIntent,
                    food_contribution_payment_method: giftMethod,
                    allergies,
                    food_bringing: foodBringing,
                    tshirt_sizes: cfg.template === 'fellowship' && cfg.tshirtsEnabled ? tshirtSizes : null,
                    notes,
                    rsvp_status: 'Going',
                    food_allergy_acknowledged: kids ? true : false,
                    food_allergy_signed_name: kids ? signedName : null,
                    food_allergy_signed_at: signedAt,
                    injury_acknowledged: kids ? true : false,
                    injury_signed_name: kids ? signedName : null,
                    injury_signed_at: signedAt,
                };

                // Pay Now guests finish on PLCC Tithe: make sure the event's fund is there first
                // (runs alongside the save; never blocks the signup).
                const fundSetup =
                    giftIntent === 'pay_now'
                        ? ensureTitheEventFund(eventFundName(cfg.eventId || eventId, cfg.name), {
                              eventId: cfg.eventId || eventId,
                              previousNames: eventFundPreviousNames(cfg.eventId || eventId),
                          })
                        : null;

                const { data, error } = await supabaseAdmin
                    .from('event_registrations')
                    .insert([row])
                    .select()
                    .single();

                if (error) {
                    const msg = String(error.message || '').toLowerCase();
                    if (
                        msg.includes('food_contribution_intent') ||
                        msg.includes('food_contribution_payment_method') ||
                        msg.includes('food_contribution_posted_tx_id')
                    ) {
                        const {
                            food_contribution_intent,
                            food_contribution_payment_method,
                            food_contribution_posted_tx_id,
                            ...withoutPay
                        } = row;
                        const noteBits = [
                            withoutPay.notes,
                            food_contribution_intent
                                ? `Gift intent: ${food_contribution_intent}`
                                : null,
                            food_contribution_payment_method
                                ? `Pay method: ${food_contribution_payment_method}`
                                : null,
                        ].filter(Boolean);
                        const retryPay = {
                            ...withoutPay,
                            notes: noteBits.join(' | ') || null,
                        };
                        const { data: retryPayData, error: retryPayErr } = await supabaseAdmin
                            .from('event_registrations')
                            .insert([retryPay])
                            .select()
                            .single();
                        if (!retryPayErr) {
                            return res.status(201).json({
                                ok: true,
                                registration: retryPayData,
                                warning:
                                    'Saved — run add_thanksgiving_gift_payment_choice.sql for dedicated payment columns.',
                            });
                        }
                    }
                    if (msg.includes('guests_invited') || msg.includes('food_contribution_amount')) {
                        const { guests_invited, food_contribution_amount, ...withoutNew } = row;
                        const noteBits = [
                            withoutNew.notes,
                            guests_invited ? `Guests invited: ${guests_invited}` : null,
                            food_contribution_amount != null ? `Food funds: $${food_contribution_amount}` : null,
                        ].filter(Boolean);
                        const retryRow = { ...withoutNew, notes: noteBits.join(' | ') || null };
                        const { data: retryNew, error: retryNewErr } = await supabaseAdmin
                            .from('event_registrations')
                            .insert([retryRow])
                            .select()
                            .single();
                        if (!retryNewErr) {
                            return res.status(201).json({
                                ok: true,
                                registration: retryNew,
                                warning: 'Saved — run add_cookout_guests_and_food_funds.sql for dedicated columns.',
                            });
                        }
                    }
                    if (msg.includes('food_bringing')) {
                        const { food_bringing, ...withoutFood } = row;
                        const retryRow = {
                            ...withoutFood,
                            notes: [food_bringing, notes].filter(Boolean).join(' | ') || null,
                        };
                        const { data: retryFood, error: retryFoodErr } = await supabaseAdmin
                            .from('event_registrations')
                            .insert([retryRow])
                            .select()
                            .single();
                        if (!retryFoodErr) {
                            return res.status(201).json({
                                ok: true,
                                registration: retryFood,
                                warning: 'Saved — run add_cookout_food_bringing.sql for a dedicated food column.',
                            });
                        }
                    }
                    if (msg.includes('tshirt_sizes')) {
                        const { tshirt_sizes, ...withoutShirt } = row;
                        const retryRow = {
                            ...withoutShirt,
                            notes: [withoutShirt.notes, tshirt_sizes ? `T-shirts: ${tshirt_sizes}` : null]
                                .filter(Boolean)
                                .join(' | ') || null,
                        };
                        const { data: retryShirt, error: retryShirtErr } = await supabaseAdmin
                            .from('event_registrations')
                            .insert([retryRow])
                            .select()
                            .single();
                        if (!retryShirtErr) {
                            return res.status(201).json({
                                ok: true,
                                registration: retryShirt,
                                warning: 'Saved — run add_cookout_tshirt_sizes.sql for a dedicated T-shirt column.',
                            });
                        }
                    }
                    if (msg.includes('food_allergy') || msg.includes('injury_')) {
                        const {
                            food_allergy_acknowledged,
                            food_allergy_signed_name,
                            food_allergy_signed_at,
                            injury_acknowledged,
                            injury_signed_name,
                            injury_signed_at,
                            ...withoutAck
                        } = row;
                        const { data: retry, error: retryErr } = await supabaseAdmin
                            .from('event_registrations')
                            .insert([withoutAck])
                            .select()
                            .single();
                        if (!retryErr) {
                            return res.status(201).json({
                                ok: true,
                                registration: retry,
                                warning: 'Saved — run cookout consent migrations to store signature fields.',
                            });
                        }
                    }
                    // Retry without extended columns if migration not applied yet
                    if (msg.includes('column') || msg.includes('household') || msg.includes('phone')) {
                        const { data: basic, error: basicErr } = await supabaseAdmin
                            .from('event_registrations')
                            .insert([{
                                event_id: eventId,
                                name,
                                email,
                                rsvp_status: 'Going',
                            }])
                            .select()
                            .single();
                        if (basicErr) throw basicErr;
                        return res.status(201).json({
                            ok: true,
                            registration: basic,
                            warning: 'Saved name only — run add_fellowship_cookout_rsvp.sql for full fields.',
                        });
                    }
                    throw error;
                }

                if (fundSetup) await fundSetup;
                return res.status(201).json({ ok: true, registration: data });
            } catch (err: any) {
                console.error('[RSVP] POST error:', err);
                return res.status(500).json({ ok: false, error: err.message || 'Could not save signup' });
            }
        }

        if (req.method === 'GET') {
            try {
                const { user, role } = await verifyAuth(req, supabaseAdmin);
                if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
                const viewerRole = String(role || '').toUpperCase();
                // Archived RSVPs are read-only for the Pastor, First Lady and Finance too.
                const archivedAt = await rsvpArchivedAt(String(requestedEventId || '').trim());
                if (viewerRole !== 'SUPER_ADMIN' && !(archivedAt && RSVP_ARCHIVE_VIEW_ROLES.has(viewerRole))) {
                    return res.status(403).json({
                        ok: false,
                        error: `Only Super Admin can view RSVPs for ${fellowshipCfg.shortName || fellowshipCfg.name}`,
                    });
                }

                let target = await resolveRsvpTarget();
                if (!target.ok && archivedAt) {
                    // Archiving turned signup off; still show the saved list (closed).
                    const { row } = await loadRsvpEventRow(supabaseAdmin, String(requestedEventId).trim());
                    const archivedCfg = row ? runtimeConfigFromDbEvent({ ...row, rsvp_enabled: true }) : null;
                    if (archivedCfg) target = { ok: true, eventId: row.id, cfg: { ...archivedCfg, closed: true } };
                }
                if (!target.ok) {
                    return res.status(target.status).json({ ok: false, error: target.error });
                }
                const { eventId, cfg } = target;
                let query = supabaseAdmin
                    .from('event_registrations')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (eventId) query = query.eq('event_id', eventId);

                const { data, error } = await query;
                if (error) throw error;

                const rows = data || [];
                // Pay Now gifts are finished on PLCC Tithe; mark the ones Tithe has confirmed.
                const rsvpFund = eventFundName(cfg.eventId || eventId, cfg.name);
                // Staff can share a guest's Tithe pay link from this list, so keep the event's fund set up.
                const [titheSync] = await Promise.all([
                    syncRsvpGiftsFromTithe(supabaseAdmin, rows, {
                        eventShortName: (cfg as any).shortName || (cfg as any).name,
                        eventFundName: rsvpFund,
                        eventId: cfg.eventId || eventId,
                        previousFundNames: eventFundPreviousNames(cfg.eventId || eventId),
                    }),
                    cfg.paymentChoiceEnabled
                        ? ensureTitheEventFund(rsvpFund, {
                              eventId: cfg.eventId || eventId,
                              previousNames: eventFundPreviousNames(cfg.eventId || eventId),
                          })
                        : Promise.resolve(null),
                    // A renamed event: the Vault ledger's fund takes the new name too (no-op otherwise).
                    rsvpFund && eventFundPreviousNames(cfg.eventId || eventId).length
                        ? renameVaultEventFund(supabaseAdmin, rsvpFund, eventFundPreviousNames(cfg.eventId || eventId))
                        : Promise.resolve(false),
                ]);
                // RSVP gifts Tithe filed under Tithes & Offerings by mistake move to this event's fund.
                const fundRepair = cfg.paymentChoiceEnabled
                    ? await repairTitheRsvpGiftFunds(rsvpFund, rows)
                    : { moved: 0 as number, warning: undefined as string | undefined };
                const totals = rows.reduce(
                    (acc: any, r: any) => {
                        const household = Number(r.household_size) || 1;
                        const children = Number(r.children_count) || 0;
                        const funds = Number(r.food_contribution_amount) || 0;
                        acc.adults += Math.max(0, household - children);
                        acc.children += children;
                        acc.guests += Number(r.guests_invited) || 0;
                        if (r.food_contribution_paid) acc.fundsPaid += funds;
                        else acc.funds += funds;
                        return acc;
                    },
                    { adults: 0, children: 0, guests: 0, funds: 0, fundsPaid: 0 }
                );
                totals.funds = Math.round(totals.funds * 100) / 100;
                totals.fundsPaid = Math.round(totals.fundsPaid * 100) / 100;

                return res.status(200).json({
                    ok: true,
                    registrations: rows,
                    totals,
                    titheSync: {
                        updated: titheSync.updated,
                        warning: [titheSync.warning, fundRepair.warning].filter(Boolean).join(' ') || null,
                        fundsCorrected: fundRepair.moved,
                    },
                    eventId,
                    closed: cfg.closed,
                    archived: Boolean(archivedAt),
                    event: {
                        id: cfg.eventId,
                        name: cfg.name,
                        shortName: cfg.shortName,
                        date: cfg.date,
                        timeLabel: cfg.timeLabel,
                        template: cfg.template,
                        tshirtsEnabled: cfg.tshirtsEnabled,
                    },
                });
            } catch (err: any) {
                console.error('[RSVP] GET error:', err);
                return res.status(500).json({ ok: false, error: err.message || 'Could not load RSVPs' });
            }
        }

        if (req.method === 'PATCH') {
            try {
                const { user, role } = await verifyAuth(req, supabaseAdmin);
                if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
                if (String(role || '').toUpperCase() !== 'SUPER_ADMIN') {
                    return res.status(403).json({
                        ok: false,
                        error: `Only Super Admin can update RSVPs for ${fellowshipCfg.shortName || fellowshipCfg.name}`,
                    });
                }

                const body = req.body || {};
                const id = String(body.id || '').trim();
                if (!id) return res.status(400).json({ ok: false, error: 'Registration id is required' });
                if (await rsvpArchivedForRegistration(id)) {
                    return res.status(409).json({ ok: false, error: 'This RSVP is archived. Restore it before making changes.' });
                }

                const updates: Record<string, any> = {};

                if (body.name !== undefined) {
                    const n = String(body.name || '').trim();
                    if (!n) return res.status(400).json({ ok: false, error: 'Name is required' });
                    updates.name = n;
                }
                if (body.phone !== undefined) {
                    const p = String(body.phone || '').trim();
                    if (!p) return res.status(400).json({ ok: false, error: 'Phone is required' });
                    updates.phone = p;
                }
                if (body.email !== undefined) {
                    updates.email = String(body.email || '').trim() || null;
                }
                if (body.household_size !== undefined || body.householdSize !== undefined) {
                    const h = Number(body.household_size ?? body.householdSize);
                    if (!Number.isFinite(h) || h < 1) {
                        return res.status(400).json({ ok: false, error: 'Household size must be at least 1' });
                    }
                    updates.household_size = Math.floor(h);
                }
                if (body.children_count !== undefined || body.childrenCount !== undefined) {
                    const c = Number(body.children_count ?? body.childrenCount);
                    if (!Number.isFinite(c) || c < 0) {
                        return res.status(400).json({ ok: false, error: 'Children count cannot be negative' });
                    }
                    updates.children_count = Math.floor(c);
                }
                if (body.tshirt_sizes !== undefined || body.tshirtSizes !== undefined) {
                    updates.tshirt_sizes = String(body.tshirt_sizes ?? body.tshirtSizes ?? '').trim() || null;
                }
                if (body.food_allergy_signed_name !== undefined || body.foodAllergySignedName !== undefined) {
                    const n = String(body.food_allergy_signed_name ?? body.foodAllergySignedName ?? '').trim();
                    if (n && n.length < 2) {
                        return res.status(400).json({ ok: false, error: 'Allergy signature name must be at least 2 characters' });
                    }
                    updates.food_allergy_signed_name = n || null;
                    if (n) {
                        updates.food_allergy_acknowledged = true;
                        updates.food_allergy_signed_at = new Date().toISOString();
                    }
                }
                if (body.injury_signed_name !== undefined || body.injurySignedName !== undefined) {
                    const n = String(body.injury_signed_name ?? body.injurySignedName ?? '').trim();
                    if (n && n.length < 2) {
                        return res.status(400).json({ ok: false, error: 'Injury signature name must be at least 2 characters' });
                    }
                    updates.injury_signed_name = n || null;
                    if (n) {
                        updates.injury_acknowledged = true;
                        updates.injury_signed_at = new Date().toISOString();
                    }
                }
                // Convenience: one signed_name updates both consent signatures
                if (body.signed_name !== undefined || body.signedName !== undefined) {
                    const n = String(body.signed_name ?? body.signedName ?? '').trim();
                    if (n && n.length < 2) {
                        return res.status(400).json({ ok: false, error: 'Signature name must be at least 2 characters' });
                    }
                    const now = new Date().toISOString();
                    updates.food_allergy_signed_name = n || null;
                    updates.injury_signed_name = n || null;
                    if (n) {
                        updates.food_allergy_acknowledged = true;
                        updates.injury_acknowledged = true;
                        updates.food_allergy_signed_at = now;
                        updates.injury_signed_at = now;
                    }
                }
                if (body.guests_invited !== undefined || body.guestsInvited !== undefined) {
                    const g = Number(body.guests_invited ?? body.guestsInvited);
                    if (!Number.isFinite(g) || g < 0) {
                        return res.status(400).json({ ok: false, error: 'Guests invited cannot be negative' });
                    }
                    updates.guests_invited = Math.floor(g);
                }
                if (body.food_contribution_amount !== undefined || body.foodContributionAmount !== undefined) {
                    const raw = body.food_contribution_amount ?? body.foodContributionAmount;
                    // Staff may set any whole-dollar amount (e.g. a partial payment agreed in person).
                    const parsed = parseRsvpContribution(raw, 1);
                    if (!parsed.ok) {
                        return res.status(400).json({
                            ok: false,
                            error: parsed.error,
                        });
                    }
                    updates.food_contribution_amount = parsed.value;
                }
                if (
                    body.food_contribution_payment_method !== undefined ||
                    body.foodContributionPaymentMethod !== undefined
                ) {
                    const rawMethod = body.food_contribution_payment_method ?? body.foodContributionPaymentMethod;
                    if (rawMethod == null || rawMethod === '') {
                        updates.food_contribution_payment_method = null;
                    } else if (!isGiftPaymentMethod(rawMethod)) {
                        return res.status(400).json({
                            ok: false,
                            error: 'Payment method must be zelle, cashapp, or venmo.',
                        });
                    } else {
                        updates.food_contribution_payment_method = rawMethod;
                    }
                }
                if (
                    body.food_contribution_intent !== undefined ||
                    body.foodContributionIntent !== undefined
                ) {
                    const choice = parseGiftPaymentChoice({
                        food_contribution_intent:
                            body.food_contribution_intent ?? body.foodContributionIntent,
                        food_contribution_payment_method:
                            body.food_contribution_payment_method ??
                            body.foodContributionPaymentMethod ??
                            updates.food_contribution_payment_method,
                    });
                    if (!choice.ok) {
                        return res.status(400).json({ ok: false, error: choice.error });
                    }
                    updates.food_contribution_intent = choice.intent;
                    if (choice.intent === 'pledge') {
                        updates.food_contribution_payment_method = null;
                    } else if (choice.method) {
                        updates.food_contribution_payment_method = choice.method;
                    }
                }
                if (body.food_contribution_paid !== undefined || body.foodContributionPaid !== undefined) {
                    const giftPaidRoles = ['SUPER_ADMIN', 'PASTOR', 'FIRST_LADY', 'FINANCE'];
                    if (!role || !giftPaidRoles.includes(role)) {
                        return res.status(403).json({
                            ok: false,
                            error: 'Only Super Admin, Pastor, First Lady, or Finance can mark gifts paid.',
                        });
                    }
                    const paid = Boolean(body.food_contribution_paid ?? body.foodContributionPaid);
                    updates.food_contribution_paid = paid;
                    if (paid) {
                        updates.food_contribution_paid_at = new Date().toISOString();
                        updates.food_contribution_paid_by =
                            user.name || user.email || user.id || 'staff';
                    } else {
                        updates.food_contribution_paid_at = null;
                        updates.food_contribution_paid_by = null;
                    }
                }
                if (body.allergies !== undefined) {
                    const a = String(body.allergies || '').trim();
                    if (!a) {
                        return res.status(400).json({
                            ok: false,
                            error: 'Food allergies is required. List allergies or write None.',
                        });
                    }
                    updates.allergies = a;
                }

                // Keep children ≤ household when both are present in this update or existing row
                if (updates.household_size != null || updates.children_count != null) {
                    let household = updates.household_size;
                    let children = updates.children_count;
                    if (household == null || children == null) {
                        const { data: existing } = await supabaseAdmin
                            .from('event_registrations')
                            .select('household_size, children_count')
                            .eq('id', id)
                            .maybeSingle();
                        if (household == null) household = Number(existing?.household_size) || 1;
                        if (children == null) children = Number(existing?.children_count) || 0;
                    }
                    if (children > household) {
                        return res.status(400).json({ ok: false, error: 'Children cannot be more than household size' });
                    }
                }

                if (Object.keys(updates).length === 0) {
                    return res.status(400).json({ ok: false, error: 'No fields to update' });
                }

                let patchUpdates = { ...updates };
                let { data, error } = await supabaseAdmin
                    .from('event_registrations')
                    .update(patchUpdates)
                    .eq('id', id)
                    .select()
                    .single();

                // Fallback if guests/funds/paid columns are not migrated yet
                if (error) {
                    const msg = String(error.message || '');
                    if (
                        msg.includes('guests_invited') ||
                        msg.includes('food_contribution_amount') ||
                        msg.includes('food_contribution_paid')
                    ) {
                        const {
                            guests_invited,
                            food_contribution_amount,
                            food_contribution_paid,
                            food_contribution_paid_at,
                            food_contribution_paid_by,
                            ...withoutNew
                        } = patchUpdates;
                        const noteBits = [
                            guests_invited ? `Guests invited: ${guests_invited}` : null,
                            food_contribution_amount != null ? `Food funds: $${food_contribution_amount}` : null,
                            food_contribution_paid != null
                                ? `Gift paid: ${food_contribution_paid ? 'yes' : 'no'}`
                                : null,
                        ].filter(Boolean) as string[];
                        patchUpdates = { ...withoutNew };
                        if (noteBits.length) {
                            patchUpdates.notes = noteBits.join(' | ');
                        }
                        // Paid toggle requires migration — surface a clear error if those cols are missing
                        if (
                            food_contribution_paid !== undefined ||
                            food_contribution_paid_at !== undefined ||
                            food_contribution_paid_by !== undefined
                        ) {
                            if (msg.includes('food_contribution_paid')) {
                                return res.status(503).json({
                                    ok: false,
                                    error: 'Run add_cookout_food_contribution_paid.sql in Supabase to enable gift paid tracking.',
                                });
                            }
                        }
                        const retry = await supabaseAdmin
                            .from('event_registrations')
                            .update(patchUpdates)
                            .eq('id', id)
                            .select()
                            .single();
                        data = retry.data;
                        error = retry.error;
                    }
                    if (
                        error &&
                        (msg.includes('food_contribution_intent') ||
                            msg.includes('food_contribution_payment_method') ||
                            msg.includes('food_contribution_posted_tx_id'))
                    ) {
                        return res.status(503).json({
                            ok: false,
                            error:
                                'Run add_thanksgiving_gift_payment_choice.sql in Supabase to enable gift payment tracking.',
                        });
                    }
                }

                if (error) throw error;

                let bridgeWarning: string | undefined;
                if (data?.food_contribution_paid && updates.food_contribution_paid === true) {
                    const kit = getFellowshipEventConfig(String(data.event_id || ''));
                    const posted = await postRsvpGiftToGivingTransactions(supabaseAdmin, data, {
                        eventShortName: kit.shortName || 'Event',
                        eventFundName: await loadRsvpEventFundName(supabaseAdmin, String(data.event_id || '')),
                        eventId: String(data.event_id || '') || null,
                        previousFundNames: eventFundPreviousNames(String(data.event_id || '')),
                    });
                    if (posted.warning) bridgeWarning = posted.warning;
                    const linkPatch: Record<string, string> = {};
                    if (posted.txId && posted.txId !== data.food_contribution_posted_tx_id) {
                        linkPatch.food_contribution_posted_tx_id = posted.txId;
                    }
                    if (
                        posted.dcbVoucherId
                        && posted.dcbVoucherId !== data.food_contribution_dcb_voucher_id
                    ) {
                        linkPatch.food_contribution_dcb_voucher_id = posted.dcbVoucherId;
                    }
                    if (Object.keys(linkPatch).length) {
                        let { data: linked, error: linkErr } = await supabaseAdmin
                            .from('event_registrations')
                            .update(linkPatch)
                            .eq('id', id)
                            .select()
                            .single();
                        if (
                            linkErr
                            && String(linkErr.message || '').includes('food_contribution_dcb_voucher_id')
                        ) {
                            const vaultOnly: Record<string, string> = {};
                            if (linkPatch.food_contribution_posted_tx_id) {
                                vaultOnly.food_contribution_posted_tx_id =
                                    linkPatch.food_contribution_posted_tx_id;
                            }
                            if (Object.keys(vaultOnly).length) {
                                const retry = await supabaseAdmin
                                    .from('event_registrations')
                                    .update(vaultOnly)
                                    .eq('id', id)
                                    .select()
                                    .single();
                                linked = retry.data;
                                linkErr = retry.error;
                            } else {
                                linkErr = null;
                            }
                            if (posted.dcbVoucherId) {
                                bridgeWarning = [
                                    bridgeWarning,
                                    'Run add_thanksgiving_dcb_voucher.sql to persist DCB voucher ids on RSVPs.',
                                ]
                                    .filter(Boolean)
                                    .join(' ');
                            }
                        }
                        if (!linkErr && linked) data = linked;
                        else if (linkErr) {
                            console.warn(
                                '[RSVP] Could not save gift bridge ids:',
                                linkErr.message
                            );
                        }
                    }
                }

                return res.status(200).json({
                    ok: true,
                    registration: data,
                    ...(bridgeWarning ? { warning: bridgeWarning } : {}),
                });
            } catch (err: any) {
                console.error('[RSVP] PATCH error:', err);
                return res.status(500).json({ ok: false, error: err.message || 'Could not update RSVP' });
            }
        }

        if (req.method === 'DELETE') {
            try {
                const { user, role } = await verifyAuth(req, supabaseAdmin);
                if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
                if (String(role || '').toUpperCase() !== 'SUPER_ADMIN') {
                    return res.status(403).json({
                        ok: false,
                        error: `Only Super Admin can delete RSVPs for ${fellowshipCfg.shortName || fellowshipCfg.name}`,
                    });
                }

                const id = String(req.body?.id || req.query?.id || '').trim();
                if (!id) return res.status(400).json({ ok: false, error: 'Registration id is required' });

                // An RSVP with a gift attached can't be deleted: paid on PLCC Tithe, or sent
                // (Zelle / Venmo / Cash App waiting for Finance, or a bank payment clearing).
                const { data: reg } = await supabaseAdmin
                    .from('event_registrations')
                    .select('*')
                    .eq('id', id)
                    .maybeSingle();
                if (!reg) return res.status(404).json({ ok: false, error: 'Signup not found' });
                if (await rsvpArchivedAt(String(reg.event_id || ''))) {
                    return res.status(409).json({ ok: false, error: 'This RSVP is archived. Restore it before making changes.' });
                }
                const hasGiftAmount =
                    Number(reg.food_contribution_amount) > 0 &&
                    (reg.food_contribution_intent === 'pay_now' || reg.food_contribution_intent === 'pledge');
                if (hasGiftAmount && !reg.food_contribution_paid) {
                    const check = await syncRsvpGiftsFromTithe(supabaseAdmin, [reg]);
                    if (check.updated > 0) reg.food_contribution_paid = true;
                    if (!reg.food_contribution_paid && check.warning && !/not configured/i.test(check.warning)) {
                        return res.status(503).json({
                            ok: false,
                            error: 'Could not check PLCC Tithe for a gift on this signup. Please try again in a minute.',
                        });
                    }
                }
                if (reg.food_contribution_paid || reg.tithe_status === 'processing') {
                    return res.status(409).json({
                        ok: false,
                        code: 'RSVP_HAS_GIFT',
                        error: reg.food_contribution_paid
                            ? `${reg.name} has a paid gift, so this signup can't be deleted. Edit it instead.`
                            : `${reg.name} has a gift waiting for Finance to confirm, so this signup can't be deleted yet.`,
                    });
                }

                const { error } = await supabaseAdmin
                    .from('event_registrations')
                    .delete()
                    .eq('id', id);

                if (error) throw error;
                return res.status(200).json({ ok: true, deleted_id: id });
            } catch (err: any) {
                console.error('[RSVP] DELETE error:', err);
                return res.status(500).json({ ok: false, error: err.message || 'Could not delete RSVP' });
            }
        }

        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    if (subResource === 'checkin') {
        const checkinAuth = await requireAuth(req, res, supabaseAdmin);
        if (!checkinAuth) return;
        if (!isAttendanceCheckinRole(checkinAuth.role)) {
            return res.status(403).json({ ok: false, error: 'Check-in requires an authorized desk or kiosk role.' });
        }
        try {
            if (req.method === 'GET') {
                console.log(`[Checkin API] Searching with query: "${query}"`);
                
                // 1. Search households by name
                const { data: hhByFamily, error: e1 } = await supabaseAdmin.from('households').select('id, name, members:members!members_household_name_fkey(id, first_name, last_name, role, avatar_url, access_code, children)').ilike('name', `%${query || ''}%`);
                if (e1) {
                    console.error('[Checkin API] Household Query Error:', e1);
                    throw e1;
                }

                // 2. Search members
                let memQuery = supabaseAdmin.from('members').select('id, household_name, access_code, first_name, last_name, role, avatar_url, children');
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query as string);
                const isAccessCode = /^\d{4,8}$/.test(query as string);

                if (isUuid) {
                    memQuery = memQuery.eq('id', query);
                } else if (isAccessCode) {
                    memQuery = memQuery.eq('access_code', query);
                } else {
                    memQuery = memQuery.or(`first_name.ilike.%${query || ''}%,last_name.ilike.%${query || ''}%,access_code.eq.${query || ''}`);
                }

                const { data: memByDetails, error: e2 } = await memQuery;
                if (e2) {
                    console.error('[Checkin API] Members Query Error:', e2);
                    throw e2;
                }

                // Stage 2: Also search within children JSON array for partial name matches.
                // PostgREST cannot do ilike on JSONB, so we fetch members with children and filter in-memory.
                let jsonChildMatches: any[] = [];
                if (query && !isUuid && !isAccessCode) {
                    const { data: membersWithChildren } = await supabaseAdmin
                        .from('members')
                        .select('id, household_name, access_code, first_name, last_name, role, avatar_url, children')
                        .not('children', 'eq', '[]')
                        .not('children', 'is', null);

                    jsonChildMatches = (membersWithChildren || []).filter(m =>
                        (m.children || []).some((c: any) =>
                            c.name?.toLowerCase().includes((query as string).toLowerCase())
                        )
                    );
                }

                // Merge: combine results from name-based search and JSON children search (deduplicated)
                const existingIds = new Set((memByDetails || []).map((m: any) => m.id));
                const mergedMembers = [
                    ...(memByDetails || []),
                    ...jsonChildMatches.filter(m => !existingIds.has(m.id))
                ];

                // Identify direct match
                let directMemberId = null;
                if (isUuid && mergedMembers?.length === 1) {
                    directMemberId = mergedMembers[0].id;
                } else if (isAccessCode && mergedMembers?.length === 1) {
                    directMemberId = mergedMembers[0].id;
                }

                const extraHouseholdNames = mergedMembers?.map(m => m.household_name).filter(Boolean) || [];

                // 3. Fetch full details for families found via members
                let allFamilies = [...(hhByFamily || [])];
                if (extraHouseholdNames.length > 0) {
                    const existingNames = new Set(allFamilies.map(f => f.name));
                    const uniqueExtraNames = [...new Set(extraHouseholdNames.filter(name => !existingNames.has(name)))];

                    if (uniqueExtraNames.length > 0) {
                        const { data: extraFamilies, error: e3 } = await supabaseAdmin.from('households').select('id, name, members:members!members_household_name_fkey(id, first_name, last_name, role, avatar_url, access_code, children)').in('name', uniqueExtraNames);
                        if (e3) {
                            console.error('[Checkin API] Extra Households Query Error:', e3);
                            throw e3;
                        }
                        if (extraFamilies) allFamilies = [...allFamilies, ...extraFamilies];
                    }
                }

                // Identify and include members who were not found in any household (orphans)
                const familiesMemberIds = new Set(allFamilies.flatMap(f => f.members?.map((m: any) => m.id) || []));
                const orphanMembers = mergedMembers?.filter(m => !familiesMemberIds.has(m.id)) || [];

                if (orphanMembers.length > 0) {
                    orphanMembers.forEach(m => {
                        allFamilies.push({
                            id: `orphan-${m.id}`,
                            name: m.household_name || `Individual: ${m.first_name} ${m.last_name}`,
                            members: [m]
                        });
                    });
                }

                // Map members to include a 'name' field for frontend compatibility
                const enrichedFamilies = allFamilies.map(f => ({
                    ...f,
                    members: (f.members || []).map((m: any) => ({
                        ...m,
                        name: `${m.first_name || ''} ${m.last_name || ''}`.trim()
                    }))
                }));

                return res.status(200).json({ ok: true, families: enrichedFamilies, directMemberId });
            }
        } catch (err: any) {
            console.error('[Checkin API Failure]:', err);
            return res.status(500).json({ ok: false, error: err.message || 'Internal Check-In Error', details: err });
        }
        if (req.method === 'POST') {
            try {
                const { memberIds, entries, kind } = req.body;
                const { user } = await verifyAuth(req, supabaseAdmin);

                // Generate a random 4-digit security code
                const securityCode = Math.floor(1000 + Math.random() * 9000).toString();

                // Prefer structured entries [{ id, name }] from Kids Check-in; fall back to memberIds
                const rawEntries: { id: string; name?: string }[] =
                    Array.isArray(entries) && entries.length > 0
                        ? entries
                        : (memberIds || []).map((mid: string) => ({ id: mid }));

                // memberIds may contain synthetic IDs like "json-{parentId}-{index}" for
                // JSON-based children (who don't exist as real member records).
                const records = rawEntries.map((entry) => {
                    let memberId = entry.id;
                    let guestName: string | null = entry.name || null;
                    if (typeof memberId === 'string' && memberId.startsWith('json-')) {
                        const parts = memberId.split('-');
                        memberId = parts.slice(1, parts.length - 1).join('-');
                        if (kind === 'kids' && guestName) {
                            // Keep child display name when parent UUID is stored as member_id
                        }
                    }
                    if (kind === 'kids' && !guestName && entry.name) {
                        guestName = entry.name;
                    }
                    return {
                        member_id: memberId,
                        check_in_time: new Date().toISOString(),
                        user_id: user?.id || null,
                        guest_name: kind === 'kids' ? (guestName || entry.name || 'Child') : guestName,
                    };
                }).filter((r) => r.member_id);

                // Deduplicate by member_id + guest_name so siblings under same parent both log
                const seen = new Set<string>();
                const uniqueRecords = records.filter((r) => {
                    const key = `${r.member_id}::${r.guest_name || ''}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });

                if (uniqueRecords.length === 0) {
                    return res.status(200).json({ ok: true, message: 'No valid member IDs to check in.', securityCode });
                }

                const { error } = await supabaseAdmin.from('attendance').insert(uniqueRecords);
                if (error) {
                    console.error('[Checkin POST] Attendance Insert Error:', error);
                    throw error;
                }
                return res.status(200).json({ ok: true, securityCode });
            } catch (err: any) {
                console.error('[Checkin POST Failure]:', err);
                return res.status(500).json({ ok: false, error: err.message || 'Check-In POST failed', details: err });
            }
        }
    }

    if (subResource === 'attendance') {
        if (req.method === 'GET') {
            try {
                const pageLimit = Math.min(Math.max(parseInt(String(limit || '25'), 10) || 25, 1), 100);
                const pageOffset = Math.max(parseInt(String(offset || '0'), 10) || 0, 0);
                const kidsOnly = String(req.query.kids || '') === 'true';

                let q = supabaseAdmin
                    .from('attendance')
                    .select(
                        '*, member:members!attendance_member_id_fkey(first_name, last_name, avatar_url, role), event:events(name)',
                        { count: 'exact' }
                    )
                    .order('check_in_time', { ascending: false })
                    .range(pageOffset, pageOffset + pageLimit - 1);

                if (all !== 'true') {
                    const today = new Date().toISOString().split('T')[0];
                    q = q.gte('check_in_time', today);
                }

                if (kidsOnly) {
                    // Kids Check-in writes guest_name (child's display name)
                    q = q.not('guest_name', 'is', null);
                }

                const { data, error, count } = await q;
                if (error) {
                    console.error('Attendance Fetch Error:', error);
                    // Fallback if event/role join or or-filter fails
                    let retry = supabaseAdmin
                        .from('attendance')
                        .select(
                            '*, member:members!attendance_member_id_fkey(first_name, last_name, avatar_url, role)',
                            { count: 'exact' }
                        )
                        .order('check_in_time', { ascending: false })
                        .range(pageOffset, pageOffset + pageLimit - 1);

                    if (all !== 'true') {
                        const today = new Date().toISOString().split('T')[0];
                        retry = retry.gte('check_in_time', today);
                    }
                    if (kidsOnly) {
                        retry = retry.not('guest_name', 'is', null);
                    }

                    const { data: retryData, error: retryError, count: retryCount } = await retry;
                    if (retryError) throw retryError;
                    return res.status(200).json({
                        ok: true,
                        attendance: retryData,
                        totalCount: retryCount ?? retryData?.length ?? 0,
                        limit: pageLimit,
                        offset: pageOffset,
                    });
                }
                return res.status(200).json({
                    ok: true,
                    attendance: data,
                    totalCount: count ?? data?.length ?? 0,
                    limit: pageLimit,
                    offset: pageOffset,
                });
            } catch (err) {
                console.error('Critical Attendance Error:', err);
                return res.status(500).json({ error: 'Failed to fetch attendance' });
            }
        }

        if (req.method === 'DELETE') {
            const { error } = await supabaseAdmin.from('attendance').delete().eq('id', id);
            if (error) throw error;
            const logAudit = await getAudit();
            await logAudit({ action: 'Attendance Record Purged', details: { attendanceId: id }, resourceType: 'attendance', resourceId: id as string, severity: 'warning', req });
            return res.status(200).json({ ok: true });
        }

        // Mark children / members as checked out (end of service)
        if (req.method === 'PATCH') {
            try {
                const body = req.body || {};
                const attendanceIds: string[] = Array.isArray(body.attendanceIds)
                    ? body.attendanceIds
                    : body.id
                      ? [body.id]
                      : [];
                if (attendanceIds.length === 0) {
                    return res.status(400).json({ ok: false, error: 'Missing attendance id(s)' });
                }
                const now = new Date().toISOString();
                const { data, error } = await supabaseAdmin
                    .from('attendance')
                    .update({ check_out_time: now })
                    .in('id', attendanceIds)
                    .is('check_out_time', null)
                    .select();
                if (error) {
                    // Column may not exist yet — fall back to deleting open records
                    const msg = String(error.message || '').toLowerCase();
                    if (msg.includes('check_out_time') || msg.includes('column')) {
                        const { error: delErr } = await supabaseAdmin
                            .from('attendance')
                            .delete()
                            .in('id', attendanceIds);
                        if (delErr) throw delErr;
                        return res.status(200).json({
                            ok: true,
                            checkedOut: attendanceIds.length,
                            warning: 'Checked out (run add_attendance_check_out.sql to keep checkout times).',
                        });
                    }
                    throw error;
                }
                return res.status(200).json({ ok: true, checkedOut: data?.length || 0, records: data });
            } catch (err: any) {
                console.error('[Checkout PATCH Failure]:', err);
                return res.status(500).json({ ok: false, error: err.message || 'Checkout failed' });
            }
        }
    }

    // Kiosk lookup: resolve QR / 4-digit / adult AWC1 to family children + today's in/out status
    // POST preferred for AWC1 (token in body, not query). GET keeps 4-digit / UUID / name.
    if (subResource === 'kiosk-lookup' && (req.method === 'GET' || req.method === 'POST')) {
        const kioskAuth = await requireAuth(req, res, supabaseAdmin);
        if (!kioskAuth) return;
        if (!isAttendanceCheckinRole(kioskAuth.role)) {
            return res.status(403).json({ ok: false, error: 'Kiosk lookup requires an authorized desk or kiosk role.' });
        }
        const kioskRole = String(kioskAuth.role || '').toUpperCase();
        if (!kioskLookupAllowed(req)) {
            return res.status(429).json({ ok: false, error: 'Too many lookup attempts. Wait a moment.' });
        }
        try {
            const bodyQ =
                req.method === 'POST'
                    ? String(req.body?.token || req.body?.query || '').trim()
                    : '';
            let q = (bodyQ || String(query || '')).trim();
            if (!q) return res.status(400).json({ ok: false, error: 'Enter a code or scan a QR' });

            const awc1Re = /^AWC1\.[0-9a-f]{64}$/i;
            if (awc1Re.test(q)) {
                // Never accept AWC1 on GET (token would land in URL/logs).
                if (req.method !== 'POST') {
                    return res.status(400).json({
                        ok: false,
                        error: 'Membership cards must be looked up with a secure scan (POST).',
                    });
                }
                const { createHash } = await import('node:crypto');
                const tokenHash = createHash('sha256').update(q, 'utf8').digest('hex');
                const [{ data: adultCard }, { data: depCard }] = await Promise.all([
                    supabaseAdmin
                        .from('member_digital_cards')
                        .select('member_id, status')
                        .eq('qr_token_hash', tokenHash)
                        .maybeSingle(),
                    supabaseAdmin
                        .from('dependent_digital_cards')
                        .select('member_id, status')
                        .eq('qr_token_hash', tokenHash)
                        .maybeSingle(),
                ]);
                if (adultCard?.member_id && depCard?.member_id) {
                    return res.status(409).json({
                        ok: false,
                        error: 'Card could not be resolved safely.',
                        code: 'card_resolution_conflict',
                    });
                }
                const memberId = String(
                    adultCard?.member_id || depCard?.member_id || ''
                ).trim();
                if (!memberId) {
                    return res.status(200).json({ ok: true, found: false, children: [], familyName: '' });
                }
                q = memberId;
            }

            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
            const isAccessCode = /^\d{4,8}$/.test(q);

            let memQuery = supabaseAdmin
                .from('members')
                .select('id, household_name, access_code, first_name, last_name, role, avatar_url, children');
            if (isUuid) memQuery = memQuery.eq('id', q);
            else if (isAccessCode) memQuery = memQuery.eq('access_code', q);
            else if (kioskRole === 'KIOSK') {
                return res.status(400).json({
                    ok: false,
                    error: 'Kiosk lookup requires a family access code or membership card scan.',
                });
            } else {
                memQuery = memQuery.or(
                    `first_name.ilike.%${q}%,last_name.ilike.%${q}%,access_code.eq.${q}`
                );
            }

            const { data: matches, error: memErr } = await memQuery;
            if (memErr) throw memErr;
            if (!matches?.length) {
                return res.status(200).json({ ok: true, found: false, children: [], familyName: '' });
            }

            const householdName = matches[0].household_name;
            let familyMembers = matches;
            if (householdName) {
                const { data: hhMembers } = await supabaseAdmin
                    .from('members')
                    .select('id, household_name, access_code, first_name, last_name, role, avatar_url, children')
                    .eq('household_name', householdName);
                if (hhMembers?.length) familyMembers = hhMembers;
            }

            const roomForAge = (age: number | string | undefined) => {
                const n = parseInt(String(age || 0), 10) || 0;
                if (n < 3) return 'Nursery';
                if (n < 6) return 'Pre-K';
                if (n < 11) return 'Elementary';
                return 'Youth';
            };

            const children: any[] = [];
            for (const m of familyMembers) {
                if (m.role === 'Child') {
                    children.push({
                        id: m.id,
                        name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Child',
                        age: null,
                        room: 'Youth',
                        access_code: m.access_code,
                        parent_id: m.id,
                    });
                }
                (m.children || []).forEach((c: any, i: number) => {
                    const notes = c.notes || c.allergies || '';
                    children.push({
                        id: `json-${m.id}-${i}`,
                        name: c.name || 'Child',
                        age: c.age,
                        notes,
                        allergyAlert: (() => {
                            const t = String(notes || '').trim();
                            if (!t) return null;
                            const line = t.split(/[\n;|]+/).map((l: string) => l.trim()).find((l: string) => /allerg/i.test(l));
                            if (line) return line.replace(/^allerg(y|ies)\s*[:\-]?\s*/i, '').trim() || line;
                            return t.length <= 80 ? t : t.slice(0, 80) + '…';
                        })(),
                        room: roomForAge(c.age),
                        access_code: m.access_code,
                        parent_id: m.id,
                    });
                });
            }

            // If scanned member is an adult with no listed children, still allow checking them in as youth helper
            if (children.length === 0 && matches[0]) {
                const m = matches[0];
                children.push({
                    id: m.id,
                    name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Member',
                    age: null,
                    room: 'Youth',
                    access_code: m.access_code,
                    parent_id: m.id,
                    isAdultPass: true,
                });
            }

            const today = new Date().toISOString().split('T')[0];
            const { data: todayAttendance } = await supabaseAdmin
                .from('attendance')
                .select('id, member_id, guest_name, check_in_time, check_out_time')
                .gte('check_in_time', today)
                .not('guest_name', 'is', null)
                .order('check_in_time', { ascending: false });

            const openByKey = new Map<string, any>();
            for (const row of todayAttendance || []) {
                const key = `${row.member_id}::${(row.guest_name || '').toLowerCase()}`;
                if (!openByKey.has(key)) openByKey.set(key, row);
                // Also index by member_id alone for Child-role members checked in without guest quirks
                const mid = String(row.member_id || '');
                if (mid && !openByKey.has(`member::${mid}`) && !row.check_out_time) {
                    openByKey.set(`member::${mid}`, row);
                }
                const gName = String(row.guest_name || '').toLowerCase().trim();
                if (gName && !openByKey.has(`guest::${gName}`) && !row.check_out_time) {
                    openByKey.set(`guest::${gName}`, row);
                }
            }

            // Family Pass custody (child_custody_records) — same "inside" signal as desk legacy rows
            const childUuidIds = children
                .map((c) => String(c.id || ''))
                .filter((id) =>
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
                );
            const custodyByChild = new Map<string, any>();
            if (childUuidIds.length) {
                try {
                    const { data: openKidsSessions } = await supabaseAdmin
                        .from('attendance_sessions')
                        .select('id')
                        .eq('type', 'kids')
                        .eq('status', 'open');
                    const kidsSessionIds = (openKidsSessions || []).map((s: any) => s.id);
                    if (kidsSessionIds.length) {
                        const { data: custodyRows } = await supabaseAdmin
                            .from('child_custody_records')
                            .select(
                                'id, child_member_id, checked_in_at, check_in_guardian_user_id, session_id'
                            )
                            .in('child_member_id', childUuidIds)
                            .in('session_id', kidsSessionIds)
                            .is('checked_out_at', null);
                        for (const row of custodyRows || []) {
                            const cid = String(row.child_member_id || '');
                            if (cid && !custodyByChild.has(cid)) custodyByChild.set(cid, row);
                        }
                    }
                } catch {
                    /* custody table may be unavailable — legacy status still works */
                }
            }

            const enriched = children.map((c) => {
                let memberId = c.id;
                if (typeof memberId === 'string' && memberId.startsWith('json-')) {
                    const parts = memberId.split('-');
                    memberId = parts.slice(1, parts.length - 1).join('-');
                }
                const key = `${memberId}::${(c.name || '').toLowerCase()}`;
                const altKey = `${c.parent_id || memberId}::${(c.name || '').toLowerCase()}`;
                const guestKey = `guest::${String(c.name || '')
                    .toLowerCase()
                    .trim()}`;
                const rec =
                    openByKey.get(key) ||
                    openByKey.get(altKey) ||
                    openByKey.get(`member::${memberId}`) ||
                    openByKey.get(guestKey);
                const custody = custodyByChild.get(String(c.id)) || null;
                const legacyIn = !!rec && !rec.check_out_time;
                const custodyIn = !!custody;
                const isIn = legacyIn || custodyIn;
                return {
                    ...c,
                    attendanceId: rec?.id || null,
                    custodyId: custody?.id || null,
                    checkInGuardianUserId: custody?.check_in_guardian_user_id || null,
                    status: isIn ? 'in' : rec?.check_out_time ? 'out' : 'none',
                    checkInTime: custody?.checked_in_at || rec?.check_in_time || null,
                    checkOutTime: rec?.check_out_time || null,
                };
            });

            const scanned = matches[0];
            const isKiosk = kioskRole === 'KIOSK';
            const publicChildren = enriched.map((c: any) => {
                const hasAllergyAlert = Boolean(c.allergyAlert || c.notes);
                if (isKiosk) {
                    const {
                        notes: _n,
                        allergyAlert: _a,
                        access_code: _ac,
                        checkInGuardianUserId: _g,
                        ...rest
                    } = c;
                    return { ...rest, hasAllergyAlert };
                }
                const { access_code: _code, ...rest } = c;
                return { ...rest, hasAllergyAlert };
            });
            return res.status(200).json({
                ok: true,
                found: true,
                familyName: householdName || `${scanned.first_name || ''} ${scanned.last_name || ''}`.trim(),
                scannedName: `${scanned.first_name || ''} ${scanned.last_name || ''}`.trim(),
                children: publicChildren,
            });
        } catch (err: any) {
            console.error('[Kiosk lookup Failure]:', err);
            return res.status(500).json({ ok: false, error: err.message || 'Lookup failed' });
        }
    }

    if (subResource === 'run_of_show') {
        const rosAuth = await requireAuth(req, res, supabaseAdmin);
        if (!rosAuth?.user) return;
        if (eventsStatsDecision(rosAuth.role) !== 'ok') {
            return res.status(403).json({ ok: false, error: 'This action requires a staff role.' });
        }
        const { eventId } = req.query;
        if (req.method === 'GET') {
            if (!eventId) return res.status(200).json({ ok: true, items: [] });
            const { data, error } = await supabaseAdmin.from('event_run_of_show').select('*').eq('event_id', eventId).order('sort_order', { ascending: true });
            if (error) throw error;
            return res.status(200).json({ ok: true, items: data || [] });
        }
        if (req.method === 'POST') {
            const { data, error } = await supabaseAdmin.from('event_run_of_show').insert([pickAllowed(req.body, RUN_OF_SHOW_COLUMNS)]).select().single();
            if (error) throw error;
            return res.status(201).json({ ok: true, item: data });
        }
        if (req.method === 'PATCH') {
            const itemId = req.body?.id;
            const { data, error } = await supabaseAdmin.from('event_run_of_show').update(pickAllowed(req.body, RUN_OF_SHOW_COLUMNS)).eq('id', itemId).select().single();
            if (error) throw error;
            return res.status(200).json({ ok: true, item: data });
        }
        if (req.method === 'DELETE') {
            const { id: itemId } = req.body || req.query;
            const { error } = await supabaseAdmin.from('event_run_of_show').delete().eq('id', itemId);
            if (error) throw error;
            return res.status(200).json({ ok: true });
        }
    }

    if (subResource === 'templates') {
        const tplAuth = await requireAuth(req, res, supabaseAdmin);
        if (!tplAuth?.user) return;
        if (eventsStatsDecision(tplAuth.role) !== 'ok') {
            return res.status(403).json({ ok: false, error: 'This action requires a staff role.' });
        }
        if (req.method === 'GET') {
            const { data, error } = await supabaseAdmin.from('event_templates').select('*').order('name');
            if (error) throw error;
            return res.status(200).json({ ok: true, templates: data || [] });
        }
        if (req.method === 'POST') {
            const { data, error } = await supabaseAdmin.from('event_templates').insert([pickAllowed(req.body, EVENT_TEMPLATE_COLUMNS)]).select().single();
            if (error) throw error;
            const logAudit = await getAudit();
            await logAudit({ action: 'Event Template Created', details: { name: req.body.name }, resourceType: 'template', resourceId: data.id, severity: 'info', req });
            return res.status(201).json({ ok: true, template: data });
        }
        if (req.method === 'DELETE') {
            const { id: templateId } = req.body || req.query;
            const { error } = await supabaseAdmin.from('event_templates').delete().eq('id', templateId);
            if (error) throw error;
            const logAudit = await getAudit();
            await logAudit({ action: 'Event Template Deleted', details: { templateId }, resourceType: 'template', resourceId: templateId, severity: 'warning', req });
            return res.status(200).json({ ok: true });
        }
    }

    if (subResource === 'volunteers') {
        const volAuth = await requireAuth(req, res, supabaseAdmin);
        if (!volAuth?.user) return;
        if (eventsStatsDecision(volAuth.role) !== 'ok') {
            return res.status(403).json({ ok: false, error: 'This action requires a staff role.' });
        }
        if (req.method === 'GET') {
            const { eventId } = req.query;
            if (!eventId) return res.status(200).json({ ok: true, volunteers: [] });
            const { data, error } = await supabaseAdmin.from('event_volunteers').select('*, member:members!member_id(id, first_name, last_name, avatar_url, role), team:teams!team_id(id, name)').eq('event_id', eventId);
            if (error) throw error;
            return res.status(200).json({ ok: true, volunteers: data || [] });
        }
        if (req.method === 'POST') {
            const volunteerRow = {
                event_id: req.body?.event_id || req.body?.eventId || null,
                member_id: req.body?.member_id || req.body?.memberId || null,
                team_id: req.body?.team_id || req.body?.teamId || null,
                role: req.body?.role || 'Volunteer',
                status: req.body?.status || 'Confirmed',
            };
            const { data, error } = await supabaseAdmin.from('event_volunteers').insert([volunteerRow]).select().single();
            if (error) throw error;
            return res.status(201).json({ ok: true, volunteer: data });
        }
        if (req.method === 'DELETE') {
            const { error } = await supabaseAdmin.from('event_volunteers').delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ ok: true });
        }
    }

    if (subResource === 'upload-image' && req.method === 'POST') {
        const authUpload = await requireAuth(req, res, supabaseAdmin);
        if (!authUpload) return;
        const configuredApproversUpload = await loadEventApproverUserIds(supabaseAdmin);
        const mayUpload = canSubmitEvents({
            role: authUpload.role,
            userId: authUpload.user?.id,
            configuredApproverIds: configuredApproversUpload,
        });
        if (!mayUpload) {
            return res.status(403).json({ ok: false, error: 'Not allowed to upload event images' });
        }

        const raw = String(req.body?.imageBase64 || '');
        if (!raw) return res.status(400).json({ error: 'Missing image' });

        const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        const contentType = match?.[1] || req.body?.contentType || 'image/jpeg';
        const base64 = match?.[2] || raw.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64, 'base64');
        if (!buffer.length) return res.status(400).json({ error: 'Invalid image data' });
        if (buffer.length > 6 * 1024 * 1024) return res.status(400).json({ error: 'Image too large' });

        const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
        const path = `events/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        let publicUrl: string | null = null;
        for (const bucket of ['event-images', 'avatars']) {
            const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, {
                contentType,
                upsert: false,
            });
            if (!uploadError) {
                const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
                publicUrl = pub?.publicUrl || null;
                break;
            }
            console.error(`Event image upload error (${bucket}):`, uploadError.message || uploadError);
        }
        if (!publicUrl) {
            return res.status(500).json({ error: 'Upload failed. Check storage bucket permissions.' });
        }
        return res.status(200).json({ ok: true, url: publicUrl });
    }

    const pickEventFields = (body: any) => {
        const allowed = [
            'name',
            'date',
            'time',
            'end_time',
            'location',
            'type',
            'image_url',
            'description',
            'template_id',
            'starts_at',
            'department',
            'rsvp_enabled',
            'rsvp_template',
            'rsvp_close_at',
            'rsvp_payments_enabled',
            'rsvp_gift_min',
            'rsvp_gift_options',
            'rsvp_allow_pledge',
        ];
        const out: Record<string, any> = {};
        for (const key of allowed) {
            if (body?.[key] !== undefined) out[key] = body[key];
        }
        if (!out.template_id) delete out.template_id;

        if (out.rsvp_enabled !== undefined) {
            out.rsvp_enabled = Boolean(out.rsvp_enabled);
        }
        // Payments (fellowship sign-ups): collect through PLCC Tithe, minimum, amount buttons, pledges.
        if (out.rsvp_payments_enabled !== undefined) {
            out.rsvp_payments_enabled = out.rsvp_payments_enabled == null ? null : Boolean(out.rsvp_payments_enabled);
        }
        if (out.rsvp_gift_min !== undefined) {
            const min = Math.floor(Number(out.rsvp_gift_min));
            if (out.rsvp_gift_min === null || out.rsvp_gift_min === '') out.rsvp_gift_min = null;
            else if (!Number.isFinite(min) || min < 1 || min > 1000) {
                throw Object.assign(new Error('Minimum per household must be between $1 and $1,000'), { statusCode: 400 });
            } else out.rsvp_gift_min = min;
        }
        if (out.rsvp_gift_options !== undefined) {
            const floor = Number(out.rsvp_gift_min) || 1;
            const list = Array.isArray(out.rsvp_gift_options) ? out.rsvp_gift_options : [];
            const clean = Array.from(
                new Set(list.map((n: unknown) => Math.round(Number(n))).filter((n: number) => Number.isFinite(n) && n >= floor && n <= 1000))
            ).sort((a: any, b: any) => a - b).slice(0, 6);
            out.rsvp_gift_options = clean.length ? clean : null;
        }
        if (out.rsvp_allow_pledge !== undefined) {
            out.rsvp_allow_pledge = out.rsvp_allow_pledge == null ? null : Boolean(out.rsvp_allow_pledge);
        }
        if (out.rsvp_enabled === false) {
            out.rsvp_template = null;
            out.rsvp_close_at = null;
        } else if (out.rsvp_enabled === true) {
            const tmpl = out.rsvp_template;
            if (!isValidRsvpTemplate(tmpl)) {
                throw Object.assign(new Error('Choose a signup template: simple or fellowship'), {
                    statusCode: 400,
                });
            }
            if (out.rsvp_close_at != null && out.rsvp_close_at !== '') {
                const closeMs = Date.parse(String(out.rsvp_close_at));
                if (!Number.isFinite(closeMs)) {
                    throw Object.assign(new Error('Invalid RSVP close date'), { statusCode: 400 });
                }
                out.rsvp_close_at = new Date(closeMs).toISOString();
            } else {
                out.rsvp_close_at = null;
            }
        }

        // Keep starts_at aligned with calendar date so Home never prefers a stale "created now" timestamp.
        const dateYmd = String(out.date || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
            const timeLabel = String(out.time || '').trim();
            if (!out.starts_at || String(out.starts_at).slice(0, 10) !== dateYmd) {
                const m = timeLabel.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
                let hour = 12;
                let minute = 0;
                if (m) {
                    hour = Number(m[1]);
                    minute = Number(m[2]);
                    const ampm = (m[3] || '').toUpperCase();
                    if (ampm === 'PM' && hour < 12) hour += 12;
                    if (ampm === 'AM' && hour === 12) hour = 0;
                }
                // Church time (Eastern), not UTC — see easternOffset in lib/eventDate.ts.
                out.starts_at = `${dateYmd}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${easternOffset(dateYmd, hour, minute)}`;
            }
        }
        return out;
    };

    const saveEventRow = async (mode: 'insert' | 'update', payload: Record<string, any>, eid?: string) => {
        const coreKeys = [
            'name',
            'date',
            'time',
            'location',
            'type',
            'starts_at',
            'status',
            'submitted_by',
            'approved_by',
            'approved_at',
            'department',
            'rejection_reason',
        ];
        const extraKeys = [
            'end_time',
            'image_url',
            'description',
            'template_id',
            'rsvp_enabled',
            'rsvp_template',
            'rsvp_close_at',
            'rsvp_payments_enabled',
            'rsvp_gift_min',
            'rsvp_gift_options',
            'rsvp_allow_pledge',
        ];
        const core: Record<string, any> = {};
        const extra: Record<string, any> = {};
        for (const [k, v] of Object.entries(payload)) {
            if (coreKeys.includes(k)) core[k] = v;
            else if (extraKeys.includes(k)) extra[k] = v;
        }

        let row: any = null;
        if (mode === 'insert') {
            const { data, error } = await supabaseAdmin.from('events').insert([core]).select().single();
            if (error) throw error;
            row = data;
            eid = data.id;
        } else {
            const { data, error } = await supabaseAdmin.from('events').update(core).eq('id', eid).select().single();
            if (error) throw error;
            row = data;
        }

        const warnings: string[] = [];
        for (const key of extraKeys) {
            if (extra[key] === undefined) continue;
            const { data, error } = await supabaseAdmin
                .from('events')
                .update({ [key]: extra[key] })
                .eq('id', eid)
                .select()
                .single();
            if (error) {
                console.warn(`Event field skipped (${key}):`, error.message || error);
                warnings.push(key);
            } else if (data) {
                row = data;
            }
        }

        return { row, warnings };
    };

    const eventSaveWarning = (warnings: string[], titheWarning?: string): string | undefined => {
        const bits: string[] = [];
        if (warnings.some((w) => w.startsWith('rsvp_payments') || w.startsWith('rsvp_gift') || w === 'rsvp_allow_pledge')) {
            bits.push('Payment settings need a one-time database update (supabase/migrations/event_rsvp_payments.sql).');
        }
        const other = warnings.filter((w) => !/^rsvp_(payments_enabled|gift_min|gift_options|allow_pledge)$/.test(w));
        if (other.length) bits.push(`Saved, but some fields could not be stored (${other.join(', ')}).`);
        if (titheWarning) bits.push(titheWarning);
        return bits.length ? bits.join(' ') : undefined;
    };

    /**
     * An event that collects RSVP payments gets its PLCC Tithe fund (named after the event) right away.
     * When the event is renamed, the SAME fund is renamed in PLCC Tithe, DCB and the Vault ledger
     * (it follows the event id), so gifts made under the old name stay with the event.
     */
    const connectEventTitheFund = async (
        row: any,
        previousEventName?: string | null
    ): Promise<{ titheFund: string | null; warning?: string }> => {
        const fund = eventFundName(row?.id, row?.name);
        const oldFund = previousEventName ? eventFundName(row?.id, previousEventName) : null;
        const renamed = Boolean(fund && oldFund && fund.toLowerCase() !== oldFund.toLowerCase());
        const collects =
            row?.rsvp_enabled && row?.rsvp_template === 'fellowship' && row?.rsvp_payments_enabled === true;
        // A renamed RSVP event may already hold gifts even if payments are now off.
        if (!fund || (!collects && !(renamed && row?.rsvp_template === 'fellowship'))) {
            return { titheFund: null };
        }
        const previousNames = eventFundPreviousNames(row.id, previousEventName);
        // No-op when the ledger already has the new name or no old fund exists.
        if (previousNames.length) await renameVaultEventFund(supabaseAdmin, fund, previousNames);
        const setup = await ensureTitheEventFund(fund, { eventId: row.id, previousNames });
        return setup.ok ? { titheFund: fund } : { titheFund: null, warning: setup.warning };
    };

    const resolveEventActor = async () => {
        const auth = await verifyAuth(req, supabaseAdmin);
        const configuredApproverIds = await loadEventApproverUserIds(supabaseAdmin);
        const viewerId = auth.user?.id || null;
        const role = auth.role || null;
        const canApprove = canApproveEvents({ role, userId: viewerId, configuredApproverIds });
        const canSubmit = canSubmitEvents({ role, userId: viewerId, configuredApproverIds });
        const canBypassDateLock = canBypassEventDateLock({ role });
        return { auth, configuredApproverIds, viewerId, role, canApprove, canSubmit, canBypassDateLock };
    };

    if (req.method === 'GET' && (!subResource || subResource === 'events')) {
        const from =
            typeof req.query?.from === 'string' ? String(req.query.from).trim().slice(0, 10) : '';
        const to =
            typeof req.query?.to === 'string' ? String(req.query.to).trim().slice(0, 10) : '';
        const hasRange = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);
        const wantAll = String(all || '').toLowerCase() === 'true' || String(all) === '1';
        const limitProvided = limit != null && String(limit).trim() !== '';
        const limitRaw = limitProvided ? parseInt(String(limit), 10) : NaN;
        // Month-scoped calendar queries default to 200; legacy unscoped list stays at 20.
        const effectiveLimit = wantAll
            ? null
            : Number.isFinite(limitRaw) && limitRaw > 0
              ? Math.min(limitRaw, 500)
              : hasRange
                ? 200
                : 20;

        const { viewerId, canApprove, canSubmit, canBypassDateLock } = await resolveEventActor();

        let evQuery = supabaseAdmin.from('events').select('*');

        if (type) {
            evQuery = evQuery.eq('type', type);
        }
        if (hasRange) {
            evQuery = evQuery.gte('date', from).lte('date', to);
        }

        evQuery = evQuery.order('date', { ascending: hasRange ? true : false });

        if (effectiveLimit != null) {
            const offsetRaw = typeof offset === 'string' ? parseInt(offset, 10) : Number(offset);
            if (!hasRange && Number.isFinite(offsetRaw) && offsetRaw > 0) {
                evQuery = evQuery.range(offsetRaw, offsetRaw + effectiveLimit - 1);
            } else {
                evQuery = evQuery.limit(effectiveLimit);
            }
        }

        const { data, error } = await evQuery;
        if (error) throw error;
        const rawEvents = data || [];
        const events = filterEventsForViewer(rawEvents, { viewerId, canApprove });
        const lockedDates = lockedDatesFromEvents(rawEvents);
        const pending = events.filter((e: any) => normalizeEventStatus(e.status) === 'pending');

        return res.status(200).json({
            ok: true,
            events,
            pending,
            lockedDates,
            meta: { canApprove, canSubmit, canBypassDateLock, viewerId },
        });
    }

    if (req.method === 'POST' && !subResource) {
        const auth = await requireAuth(req, res, supabaseAdmin);
        if (!auth) return;
        const configuredApproverIds = await loadEventApproverUserIds(supabaseAdmin);
        const viewerId = auth.user!.id;
        const canApprove = canApproveEvents({
            role: auth.role,
            userId: viewerId,
            configuredApproverIds,
        });
        const canSubmit = canSubmitEvents({
            role: auth.role,
            userId: viewerId,
            configuredApproverIds,
        });
        const canBypassDateLock = canBypassEventDateLock({ role: auth.role });
        if (!canSubmit) {
            return res.status(403).json({ ok: false, error: 'Not allowed to create events' });
        }

        let payload: Record<string, any>;
        try {
            payload = pickEventFields(req.body);
        } catch (pickErr: any) {
            return res.status(pickErr?.statusCode || 400).json({
                ok: false,
                error: pickErr?.message || 'Invalid event fields',
            });
        }
        const dateYmd = String(payload.date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
            return res.status(400).json({ ok: false, error: 'Valid event date is required' });
        }

        if (!canBypassDateLock) {
            const { data: dayRows } = await supabaseAdmin
                .from('events')
                .select('id, date, status')
                .eq('date', dateYmd);
            if (isEventDateLocked(dayRows || [], dateYmd)) {
                return res.status(403).json({
                    ok: false,
                    error: 'This day already has an approved event. Ask a Super Admin to add another.',
                    locked: true,
                });
            }
        }

        const status = resolveCreateStatus(canApprove);
        const insertPayload: Record<string, any> = {
            ...payload,
            status,
            submitted_by: viewerId,
            department: payload.department || payload.type || null,
        };
        if (status === 'approved') {
            insertPayload.approved_by = viewerId;
            insertPayload.approved_at = new Date().toISOString();
        }

        const { row, warnings } = await saveEventRow('insert', insertPayload);
        const tithe = await connectEventTitheFund(row);
        const logAudit = await getAudit();
        await logAudit({
            action: status === 'pending' ? 'Event Submitted' : 'Event Created',
            details: { name: row?.name, date: row?.date, type: row?.type, status },
            resourceType: 'event',
            resourceId: row?.id,
            severity: 'info',
            req,
        });

        if (status === 'pending') {
            await notifyEventApproversOfSubmit(supabaseAdmin, configuredApproverIds, {
                id: row?.id,
                name: row?.name,
                date: row?.date,
                time: row?.time,
                location: row?.location,
                type: row?.type,
                department: row?.department,
            });
        }

        return res.status(201).json({
            ok: true,
            event: row,
            titheFund: tithe.titheFund,
            warning: eventSaveWarning(warnings, tithe.warning),
        });
    }

    if (req.method === 'PATCH' && !subResource) {
        const auth = await requireAuth(req, res, supabaseAdmin);
        if (!auth) return;
        const configuredApproverIds = await loadEventApproverUserIds(supabaseAdmin);
        const viewerId = auth.user!.id;
        const canApprove = canApproveEvents({
            role: auth.role,
            userId: viewerId,
            configuredApproverIds,
        });

        const { id: eid, action: rawAction, rejection_reason: rejectionReason, ...rest } = req.body || {};
        if (!eid) return res.status(400).json({ error: 'Missing event id' });

        const { data: existing, error: loadErr } = await supabaseAdmin
            .from('events')
            .select('*')
            .eq('id', eid)
            .maybeSingle();
        if (loadErr) throw loadErr;
        if (!existing) return res.status(404).json({ ok: false, error: 'Event not found' });

        const decision = parseApproveRejectAction(rawAction);
        if (decision) {
            if (!canApprove) {
                return res.status(403).json({ ok: false, error: 'Not allowed to approve events' });
            }
            const transition = applyApproveTransition(decision, viewerId, rejectionReason);
            const { data: row, error } = await supabaseAdmin
                .from('events')
                .update(transition)
                .eq('id', eid)
                .select()
                .single();
            if (error) throw error;

            const logAudit = await getAudit();
            await logAudit({
                action: decision === 'approve' ? 'Event Approved' : 'Event Rejected',
                details: { name: row?.name, date: row?.date, status: row?.status },
                resourceType: 'event',
                resourceId: eid,
                severity: 'info',
                req,
            });

            await notifyEventSubmitterOfDecision(
                supabaseAdmin,
                existing.submitted_by,
                {
                    id: row?.id,
                    name: row?.name,
                    date: row?.date,
                    rejection_reason: row?.rejection_reason,
                },
                decision
            );

            return res.status(200).json({ ok: true, event: row });
        }

        if (!canEditEventRow(existing, { viewerId, canApprove })) {
            return res.status(403).json({ ok: false, error: 'Not allowed to edit this event' });
        }

        let updates: Record<string, any>;
        try {
            updates = pickEventFields(rest);
        } catch (pickErr: any) {
            return res.status(pickErr?.statusCode || 400).json({
                ok: false,
                error: pickErr?.message || 'Invalid event fields',
            });
        }
        if (!canApprove && Object.keys(updates).length) {
            // Submitters may only edit content while pending — never force status
            delete (updates as any).status;
        }

        const canBypassDateLock = canBypassEventDateLock({ role: auth.role });
        if (updates.date && !canBypassDateLock) {
            const nextDate = String(updates.date).slice(0, 10);
            const { data: dayRows } = await supabaseAdmin
                .from('events')
                .select('id, date, status')
                .eq('date', nextDate);
            const others = (dayRows || []).filter((r: any) => r.id !== eid);
            if (isEventDateLocked(others, nextDate)) {
                return res.status(403).json({
                    ok: false,
                    error: 'That day already has an approved event. Ask a Super Admin to move it there.',
                    locked: true,
                });
            }
        }

        const { row, warnings } = await saveEventRow('update', updates, eid);
        const tithe = await connectEventTitheFund(row, existing?.name ?? null);
        const logAudit = await getAudit();
        await logAudit({
            action: 'Event Updated',
            details: { name: row?.name, date: row?.date, fields: Object.keys(updates) },
            resourceType: 'event',
            resourceId: eid,
            severity: 'info',
            req,
        });
        return res.status(200).json({
            ok: true,
            event: row,
            titheFund: tithe.titheFund,
            warning: eventSaveWarning(warnings, tithe.warning),
        });
    }

    if (req.method === 'DELETE' && !subResource) {
        const auth = await requireAuth(req, res, supabaseAdmin);
        if (!auth) return;
        const configuredApproverIds = await loadEventApproverUserIds(supabaseAdmin);
        const viewerId = auth.user!.id;
        const canApprove = canApproveEvents({
            role: auth.role,
            userId: viewerId,
            configuredApproverIds,
        });

        const { id: eid } = req.body || {};
        if (!eid) return res.status(400).json({ ok: false, error: 'Missing event id' });

        const { data: existing, error: loadErr } = await supabaseAdmin
            .from('events')
            .select('id, status, submitted_by, name')
            .eq('id', eid)
            .maybeSingle();
        if (loadErr) throw loadErr;
        if (!existing) return res.status(404).json({ ok: false, error: 'Event not found' });
        if (!canDeleteEventRow(existing, { viewerId, canApprove })) {
            return res.status(403).json({ ok: false, error: 'Not allowed to delete this event' });
        }

        // Always clear RSVPs first — count can be wrong/null, and FK is RESTRICT until cascade migration runs.
        let removedRsvps = 0;
        const { data: removedRows, error: rsvpDelErr } = await supabaseAdmin
            .from('event_registrations')
            .delete()
            .eq('event_id', eid)
            .select('id');
        if (rsvpDelErr) {
            console.error('[events] RSVP cleanup before delete failed:', rsvpDelErr.message);
            return res.status(409).json({
                ok: false,
                error:
                    'This event has signup records that could not be removed. Clear the RSVP list first, then delete the event. If this keeps failing, run fix_event_registrations_event_delete_cascade.sql in Supabase.',
            });
        }
        removedRsvps = Array.isArray(removedRows) ? removedRows.length : 0;

        // Optional reconcile rows (ON DELETE RESTRICT when that migration is applied)
        const { error: reconDelErr } = await supabaseAdmin
            .from('event_attendance_reconciliations')
            .delete()
            .eq('event_id', eid);
        if (reconDelErr && !/does not exist|Could not find the table|schema cache/i.test(String(reconDelErr.message || ''))) {
            console.warn('[events] reconcile cleanup before delete:', reconDelErr.message);
        }

        const { error } = await supabaseAdmin.from('events').delete().eq('id', eid);
        if (error) {
            const msg = String(error.message || '');
            if (/foreign key|event_registrations|violates|reconciliations/i.test(msg)) {
                return res.status(409).json({
                    ok: false,
                    error:
                        'This event still has linked signup or attendance records, so it cannot be deleted yet. Clear RSVPs first, or run fix_event_registrations_event_delete_cascade.sql in Supabase.',
                });
            }
            throw error;
        }
        const logAudit = await getAudit();
        await logAudit({
            action: 'Event Deleted',
            details: {
                eventId: eid,
                name: existing.name,
                removedRsvps,
            },
            resourceType: 'event',
            resourceId: eid,
            severity: 'warning',
            req,
        });
        return res.status(200).json({
            ok: true,
            removedRsvps,
            warning:
                removedRsvps > 0
                    ? `Removed ${removedRsvps} signup${removedRsvps === 1 ? '' : 's'} with this event.`
                    : undefined,
        });
    }

    return res.status(405).json({ error: 'Method not allowed' });
};

// --- ORGANIZATION ---
const handleOrganization = async (req: any, res: any) => {
    try {
        const { subResource } = req.query;
        const supabaseAdmin = getSupabaseAdmin();
        if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });

        const { user } = await verifyAuth(req, supabaseAdmin);

        if (subResource === 'church-stats') {
            if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

            try {
                // Count-only / bounded reads — never pull full attendance/finance row sets (those hung Vercel at 60s).
                const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

                const settled = await Promise.allSettled([
                    supabaseAdmin.from('members').select('*', { count: 'exact', head: true }),
                    supabaseAdmin.from('households').select('*', { count: 'exact', head: true }),
                    supabaseAdmin
                        .from('attendance')
                        .select('*', { count: 'exact', head: true })
                        .gte('check_in_time', weekAgo),
                    supabaseAdmin
                        .from('finance_ledger')
                    .select('amount')
                    .eq('type', 'Inflow')
                        .gte('transaction_date', monthStart)
                        .limit(500),
                ]);

                const membersRes = settled[0].status === 'fulfilled' ? settled[0].value : null;
                const householdsRes = settled[1].status === 'fulfilled' ? settled[1].value : null;
                const attendanceRes = settled[2].status === 'fulfilled' ? settled[2].value : null;
                const financeRes = settled[3].status === 'fulfilled' ? settled[3].value : null;

                const mtdGiving =
                    financeRes?.data?.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0) || 0;

                return res.status(200).json({
                    ok: true,
                    stats: {
                        members: membersRes?.count || 0,
                        households: householdsRes?.count || 0,
                        recentAttendance: attendanceRes?.count || 0,
                        mtdGiving: mtdGiving
                    }
                });
            } catch (err) {
                console.error('Stats Error:', err);
                return res.status(200).json({ ok: true, stats: { members: 0, households: 0, recentAttendance: 0, mtdGiving: 0 } });
            }
        }

        if (subResource === 'birthdays-week') {
            if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
            if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

            try {
                const daysAhead = Math.min(14, Math.max(1, parseInt(String(req.query.days || '7'), 10) || 7));
                const { data: privacyRows, error: privErr } = await supabaseAdmin
                    .from('member_directory_privacy')
                    .select('member_id')
                    .eq('directory_opt_in', true)
                    .eq('show_birthday', true);
                if (privErr) {
                    console.warn('[birthdays-week] privacy unavailable:', privErr.message);
                    return res.status(200).json({ ok: true, birthdays: [], unavailable: true });
                }
                const allowedIds = (privacyRows || []).map((r: any) => String(r.member_id)).filter(Boolean);
                if (allowedIds.length === 0) {
                    return res.status(200).json({ ok: true, birthdays: [] });
                }

                const { data: members, error: memErr } = await supabaseAdmin
                    .from('members')
                    .select('id, name, birthday')
                    .in('id', allowedIds)
                    .not('birthday', 'is', null)
                    .limit(500);
                if (memErr) throw memErr;

                const now = new Date();
                const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const end = new Date(start);
                end.setDate(end.getDate() + daysAhead);

                const birthdays: Array<{ id: string; name: string; monthDay: string; nextDate: string }> = [];
                for (const m of members || []) {
                    const raw = String(m.birthday || '').slice(0, 10);
                    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
                    if (!parts) continue;
                    const month = Number(parts[2]);
                    const day = Number(parts[3]);
                    if (!month || !day) continue;

                    let next = new Date(start.getFullYear(), month - 1, day);
                    if (next < start) next = new Date(start.getFullYear() + 1, month - 1, day);
                    if (next > end) continue;

                    birthdays.push({
                        id: String(m.id),
                        name: String(m.name || 'Member').trim() || 'Member',
                        monthDay: `${parts[2]}-${parts[3]}`,
                        nextDate: next.toISOString().slice(0, 10),
                    });
                }
                birthdays.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
                return res.status(200).json({ ok: true, birthdays: birthdays.slice(0, 20) });
            } catch (err: any) {
                console.error('[birthdays-week]', err);
                return res.status(200).json({ ok: true, birthdays: [], error: err?.message || 'Failed' });
            }
        }

        if (req.method === 'GET') {
            if (!user) return res.status(401).json({ error: 'Unauthorized' });
            const { data, error } = await supabaseAdmin.from('organization_settings').select('*').single();
            if (error && error.code !== 'PGRST116') throw error;
            return res.status(200).json(publicOrgRow(data));
        }
        if (req.method === 'POST') {
            if (!user) return res.status(401).json({ error: 'Unauthorized' });
            const orgRole = String((await verifyAuth(req, supabaseAdmin)).role || '').toUpperCase();
            if (!CHURCH_SETTINGS_ROLES.has(orgRole)) {
                return res.status(403).json({ error: 'Only church leaders can change the Church Profile.' });
            }
            const body = pickAllowed(req.body, ORG_PROFILE_COLUMNS);

            const cleanPrimaryContactId = cleanUuid(body.primary_contact_id);
            const cleanOrgUserId = cleanUuid(user?.id);

            const upsertData: any = {
                id: 1,
                ...body,
                updated_at: new Date().toISOString()
            };
            if (Object.prototype.hasOwnProperty.call(body, 'primary_contact_id')) {
                upsertData.primary_contact_id = cleanPrimaryContactId;
            }

            const { data, error } = await supabaseAdmin.from('organization_settings').upsert(upsertData).select().single();
            if (error) {
                console.error('[API Error] Organization settings upsert failed:', error);
                return res.status(error.code === '23503' ? 400 : 500).json({ 
                    error: error.message, 
                    code: error.code,
                    details: 'Data integrity error. Check if primary contact exists and you have a valid UUID.'
                });
            }
            return res.status(200).json(publicOrgRow(data));
        }
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err: any) {
        console.error('[API Error] Organization Handler:', err);
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
};

// --- OPS (Email & Health) ---
const handleOps = async (req: any, res: any) => {
    const { action, check, subResource } = req.query;
    if (check === 'health') return res.status(200).json({ ok: true, status: 'Healthy', timestamp: new Date().toISOString() });

    if (action === 'send-email' || action === 'contact' || subResource === 'email') {
        if (req.method !== 'POST') return res.status(200).json({ ok: true, message: 'Email service ready for POST requests' });

        const resendClient = await getResend();
        if (!resendClient) return res.status(503).json({ error: 'Email service unavailable' });
        const { to, subject, body, from_name, from_email, message, category } = req.body || {};

        let targetTo = to || 'admin@portal-awc.org'; // Default admin email
        let targetSubject = subject || `Contact Form: ${category || 'General'}`;
        let targetHtml = body || `
            <h3>New Contact Form Submission</h3>
            <p><strong>From:</strong> ${from_name} (${from_email})</p>
            <p><strong>Category:</strong> ${category}</p>
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Message:</strong></p>
            <p>${message}</p>
        `;

        const { data, error } = await resendClient.emails.send({
            from: vaultFrom('Promised Land Christian Center'),
            to: targetTo,
            subject: targetSubject,
            html: targetHtml
        });
        if (error) throw error;
        return res.status(200).json({ ok: true, id: data?.id, message: 'Message dispatched successfully!' });
    }
    return res.status(405).json({ error: 'Method not allowed' });
};

// --- COMMUNICATION (Announcements) ---
const handleCommunication = async (req: any, res: any) => {
    try {
        const { subResource, id } = req.query;
        const supabaseAdmin = getSupabaseAdmin();
        if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });

        const auth = await requireAuth(req, res, supabaseAdmin);
        if (!auth) return;

        if (subResource === 'announcements') {
            if (req.method === 'GET') {
                const typeFilter = String(req.query.type || req.query.filterType || '')
                    .trim()
                    .toUpperCase();

                const { data, error } = await supabaseAdmin
                    .from('announcements')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (error) {
                    console.error('Announcements Fetch Error:', error);
                    throw error;
                }

                let announcements = (data || []) as any[];

                // Surface Events & Check-in calendar rows as EVENT cards so Connect
                // calendar and Announcements stay aligned (no dual-write required).
                try {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const todayIso = today.toISOString().slice(0, 10);
                    const { data: events, error: evErr } = await supabaseAdmin
                        .from('events')
                        .select('*')
                        .gte('date', todayIso)
                        .order('date', { ascending: true })
                        .limit(75);
                    if (evErr) {
                        console.warn('[Announcements] calendar merge skipped:', evErr.message || evErr);
                    } else {
                        const existingTitles = new Set(
                            announcements
                                .filter((a) => String(a.type || '').toUpperCase() === 'EVENT')
                                .map((a) => `${String(a.title || '').trim().toLowerCase()}|${String(a.event_date || '').slice(0, 10)}`)
                        );
                        for (const ev of events || []) {
                            const title = String(ev.name || '').trim() || 'Untitled event';
                            const dateKey = String(ev.date || ev.starts_at || '').slice(0, 10);
                            const dedupeKey = `${title.toLowerCase()}|${dateKey}`;
                            if (existingTitles.has(dedupeKey)) continue;

                            const locBits = [
                                ev.time ? String(ev.time) : null,
                                ev.end_time ? `– ${String(ev.end_time)}` : null,
                                ev.location ? String(ev.location) : null,
                            ]
                                .filter(Boolean)
                                .join(' ');
                            const content =
                                String(ev.description || '').trim() ||
                                locBits ||
                                'Church calendar event';
                            const eventDate =
                                ev.starts_at ||
                                (ev.date
                                    ? `${String(ev.date).slice(0, 10)}${ev.time ? 'T12:00:00' : ''}`
                                    : null);

                            announcements.push({
                                id: `calendar:${ev.id}`,
                                title,
                                content,
                                type: 'EVENT',
                                created_at: ev.created_at || ev.date || new Date().toISOString(),
                                event_date: eventDate,
                                image_url: ev.image_url || null,
                                created_by: null,
                                source: 'calendar',
                                source_event_id: ev.id,
                            });
                            existingTitles.add(dedupeKey);
                        }
                    }
                } catch (mergeErr) {
                    console.warn('[Announcements] calendar merge failed:', mergeErr);
                }

                if (typeFilter && typeFilter !== 'ALL') {
                    announcements = announcements.filter(
                        (a) => String(a.type || '').toUpperCase() === typeFilter
                    );
                }

                announcements.sort((a, b) => {
                    const aKey = String(a.event_date || a.created_at || '');
                    const bKey = String(b.event_date || b.created_at || '');
                    return bKey.localeCompare(aKey);
                });

                return res.status(200).json({ ok: true, announcements });
            }
            if (req.method === 'POST') {
                const { title, content, type, image_url, event_date } = req.body || {};
                const cleanedTitle = String(title || '').trim();
                const cleanedContent = String(content || '').trim();
                const cleanedType = String(type || 'ANNOUNCEMENT').trim().toUpperCase();
                if (!cleanedTitle || !cleanedContent) {
                    return res.status(400).json({ error: 'title and content are required' });
                }

                console.log('[Announcements] POST Payload:', {
                    title: cleanedTitle,
                    type: cleanedType,
                    created_by: auth.user.id,
                });

                const payload: any = {
                    title: cleanedTitle,
                    content: cleanedContent,
                    type: cleanedType,
                    image_url: image_url || null,
                    event_date:
                        event_date && String(event_date).trim() !== ''
                            ? event_date
                            : null,
                    created_by: auth.user.id,
                };

                const { data, error } = await supabaseAdmin
                    .from('announcements')
                    .insert([payload])
                    .select()
                    .single();

                if (error) {
                    console.error('[Announcements] Insert Error:', error);
                    return res.status(400).json({ error: 'Database error', details: error.message });
                }

                if (!data) {
                    console.error('[Announcements] No data returned from insert');
                    return res.status(500).json({ error: 'Insert failed', details: 'No data returned from database' });
                }

                // Audit Log (Non-blocking)
                try {
                    const logAudit = await getAudit();
                    await logAudit({
                        action: `CREATED_${cleanedType}`,
                        details: { title: cleanedTitle, type: cleanedType },
                        resourceType: 'announcement',
                        resourceId: data.id,
                        userId: auth.user.id,
                        severity: 'info',
                        req
                    });
                } catch (auditErr) {
                    console.error('[Announcements] Audit log failed:', auditErr);
                }

                const snippet = cleanedContent.replace(/\s+/g, ' ').trim();
                await notifyAllUsers(
                    supabaseAdmin,
                    {
                        type: 'announcement',
                        title: cleanedTitle || 'New announcement',
                        body: snippet.length > 160 ? `${snippet.slice(0, 159)}…` : snippet || 'Open announcements to read the full update.',
                        link: '/communication/announcements',
                        sourceId: data.id,
                    },
                    auth.user.id
                );

                return res.status(201).json({ ok: true, announcement: data });
            }
            if (req.method === 'DELETE') {
                const { id: aid } = req.body || req.query;
                const targetId = String(aid || id || '').trim();
                if (!targetId) {
                    return res.status(400).json({ error: 'id is required' });
                }
                if (targetId.startsWith('calendar:')) {
                    return res.status(400).json({
                        error: 'Calendar events are managed under Events & Check-in',
                    });
                }

                const { error } = await supabaseAdmin.from('announcements').delete().eq('id', targetId);
                if (error) throw error;

                // Audit
                const logAudit = await getAudit();
                await logAudit({
                    action: 'DELETED_ANNOUNCEMENT',
                    details: { announcementId: targetId },
                    resourceType: 'announcement',
                    resourceId: targetId,
                    userId: auth.user.id,
                    severity: 'warning',
                    req
                });

                return res.status(200).json({ ok: true });
            }
        }
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err: any) {
        console.error('Communication Handler Error:', err);
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
};

// --- COMMUNITY (Prayer, Worship, Chat, Audit) ---
/**
 * Insert a prayer request. If the share_with column is not there yet (setup SQL not run),
 * wall and Pastor-only requests still save; Intercessors-only asks for the setup first.
 */
async function insertPrayerRow(supabaseAdmin: any, row: Record<string, unknown>, select = '*') {
    const first = await supabaseAdmin.from('prayer_requests').insert([row]).select(select);
    if (!first.error || !isMissingShareWithColumn(first.error.message)) return first;
    if (String(row.share_with || '') === 'intercessors') {
        return {
            data: null,
            error: { message: 'Intercessors-only requests are not set up yet. Ask the admin to run the prayer sharing SQL.', code: 'needs_setup' },
        };
    }
    const { share_with: _drop, ...rest } = row;
    return supabaseAdmin.from('prayer_requests').insert([rest]).select(select);
}

const handleCommunity = async (req: any, res: any) => {
    const { subResource, status, limit = '50', id, type, channelId, partnerId } = req.query;
    // Saved huddle permission can open LiveKit without a live Supabase call.
    if (String(req.query?.chatType || '') === 'voice-token-fallback') {
        return handleVoiceTokenFallback(req, res);
    }
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });

    // Visitors (not signed in) may send a prayer from Connect; it waits for the prayer team.
    if (
        subResource === 'prayer' &&
        req.method === 'POST' &&
        !String(req.headers?.authorization || '').trim()
    ) {
        const built = buildVisitorPrayerInsert(req.body);
        if ('error' in built) return res.status(400).json({ error: built.error });
        const ins = await insertPrayerRow(supabaseAdmin, built.row, 'id, status');
        if (ins.error?.code === 'needs_setup') return res.status(409).json({ error: ins.error.message });
        if (ins.error) throw ins.error;
        const data = ins.data?.[0];
        if (isIntercessorPrayer(built.row)) {
            await sendPrayerToIntercessors(supabaseAdmin, { ...built.row, id: data?.id, created_at: new Date().toISOString() });
        }
        return res.status(201).json(data);
    }

    // Phase 2A: all Community API routes require a valid Vault Bearer JWT
    const auth = await requireAuth(req, res, supabaseAdmin);
    if (!auth?.user) return;
    const authUserId = auth.user.id;
    const authRole = String(auth.role || 'PENDING');
    const authDisplayName =
        String(auth.user.name || '').trim() ||
        String(auth.user.email || '').split('@')[0] ||
        'Member';
    // So logAudit({ req }) can attribute actions without every call passing userId.
    req.awcAuthUserId = authUserId;

    if (subResource === 'intercessors') {
        // Intercessors Prayer Watch: the Intercessor Channel's members (and the prayer team).
        const room = await findIntercessorsRoom(supabaseAdmin);
        const allowed = await canOpenIntercessorList(supabaseAdmin, authUserId, authRole, room);
        const canLead = allowed ? await canLeadIntercessors(supabaseAdmin, authUserId, authRole, room) : false;
        if (req.method === 'GET' && String(req.query.action || '') === 'access') {
            return res.status(200).json({
                ok: true,
                allowed,
                canLead,
                ministryName: room?.name || null,
                setUp: !!room,
                roomId: room?.id || null,
            });
        }
        if (!allowed) {
            return res.status(403).json({ error: 'The Prayer Watch is for the Intercessors and the prayer team.' });
        }

        if (req.method === 'POST' && String(req.body?.action || '') === 'join-room') {
            // Prayer team joining the call: add them to the private room so the Live Huddle lets them in.
            if (!room) return res.status(404).json({ error: 'There is no Intercessor Channel yet.' });
            const { data: existing } = await supabaseAdmin
                .from('chat_room_members')
                .select('id')
                .eq('channel_id', room.id)
                .eq('user_id', authUserId)
                .limit(1);
            if ((existing || []).length === 0) {
                const { error } = await supabaseAdmin
                    .from('chat_room_members')
                    .insert({ channel_id: room.id, user_id: authUserId, role: 'member', source: 'role_grant' });
                if (error) throw error;
            }
            return res.status(200).json({ ok: true, roomId: room.id });
        }

        if (req.method === 'POST' && String(req.body?.action || '') === 'remove') {
            // Head of the Intercessors / prayer team removes a request (e.g. a test prayer).
            if (!canLead) {
                return res.status(403).json({ error: 'Only the head of the Intercessors can remove a prayer request.' });
            }
            const rid = String(req.body?.id || '');
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rid)) {
                return res.status(400).json({ error: 'Invalid request' });
            }
            const { data: target } = await supabaseAdmin
                .from('prayer_requests')
                .select('id, status, is_confidential, member_name')
                .eq('id', rid)
                .maybeSingle();
            if (!target || !isIntercessorPrayer(target)) return res.status(404).json({ error: 'Prayer request not found' });
            const { error } = await supabaseAdmin.from('prayer_requests').delete().eq('id', rid);
            if (error) throw error;
            const logAudit = await getAudit();
            await logAudit({
                req,
                userId: authUserId,
                action: 'Prayer request removed (Prayer Watch)',
                resourceType: 'prayer_request',
                resourceId: rid,
                severity: 'warning',
                details: { name: target.member_name || null },
            });
            return res.status(200).json({ ok: true });
        }

        if (req.method === 'POST') {
            const mark = parsePrayerMark(req.body);
            if (!mark) return res.status(400).json({ error: 'Invalid request' });
            if (mark.action === 'answered' && !canLead) {
                return res.status(403).json({ error: 'Only the head of the Intercessors can mark a prayer answered.' });
            }
            const { data: target } = await supabaseAdmin
                .from('prayer_requests')
                .select('id, status, is_confidential')
                .eq('id', mark.id)
                .maybeSingle();
            if (!target || !isIntercessorPrayer(target)) return res.status(404).json({ error: 'Prayer request not found' });
            const { error } = await supabaseAdmin
                .from('prayer_requests')
                .update(prayerMarkPatch(mark, authUserId))
                .eq('id', mark.id);
            if (error) {
                if (isMissingPrayerWatchColumn(error.message)) {
                    return res.status(409).json({ error: 'Prayer Watch is not set up yet. Ask the admin to run the Prayer Watch SQL.', code: 'needs_setup' });
                }
                throw error;
            }
            return res.status(200).json({ ok: true });
        }

        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

        const answeredView = String(req.query.view || '') === 'answered';
        let rows: Record<string, unknown>[] = [];
        let from: Date | null = null;
        let to: Date | null = null;
        if (answeredView) {
            const { data, error } = await supabaseAdmin
                .from('prayer_requests')
                .select('*')
                .not('answered_at', 'is', null)
                .order('answered_at', { ascending: false })
                .limit(200);
            if (error && !isMissingPrayerWatchColumn(error.message)) throw error;
            rows = (data || []) as Record<string, unknown>[];
        } else {
            const win = parsePrayerListWindow(req.query.from, req.query.to);
            from = win.from;
            to = win.to;
            const base = () =>
                supabaseAdmin
                    .from('prayer_requests')
                    .select('*')
                    .gte('created_at', from!.toISOString())
                    .lte('created_at', to!.toISOString())
                    .order('created_at', { ascending: false })
                    .limit(500);
            let res1 = await base().or('status.in.(Published,Vetting),share_with.eq.intercessors');
            if (res1.error && isMissingShareWithColumn(res1.error.message)) {
                res1 = await base().in('status', ['Published', 'Vetting']);
            }
            if (res1.error) throw res1.error;
            rows = ((res1.data || []) as Record<string, unknown>[]).filter((r) => !r.answered_at);
        }
        const shared = rows.filter(isIntercessorPrayer);
        const names = await firstNamesFor(
            supabaseAdmin,
            shared.map((r) => String(r.intercessor_prayed_by || '')).filter(Boolean)
        );
        const items = shared.map((r) => ({
            ...toIntercessorListItem(r),
            prayedBy: r.intercessor_prayed_by ? names[String(r.intercessor_prayed_by)] || null : null,
        }));
        const watchReady = shared.length === 0 || Object.prototype.hasOwnProperty.call(shared[0], 'intercessor_prayed_at');
        return res.status(200).json({
            ok: true,
            ministryName: room?.name || null,
            roomId: room?.id || null,
            canLead,
            watchReady,
            view: answeredView ? 'answered' : 'requests',
            from: from ? from.toISOString() : null,
            to: to ? to.toISOString() : null,
            items,
        });
    }

    if (subResource === 'prayer') {
        if (req.method === 'GET') {
            let q = supabaseAdmin.from('prayer_requests').select('*').order('created_at', { ascending: false }).limit(parseInt(limit as string));
            if (status) q = q.eq('status', status);
            const { data, error } = await q;
            if (error) throw error;
            return res.status(200).json(filterPrayersForViewer(data || [], authRole, authUserId));
        }
        if (req.method === 'POST' && !isPrayerTeam(authRole)) {
            // Members: name and account come from the sign-in; public prayers go straight on the wall.
            const built = buildMemberPrayerInsert(req.body, { id: authUserId, displayName: authDisplayName });
            if ('error' in built) return res.status(400).json({ error: built.error });
            const ins = await insertPrayerRow(supabaseAdmin, built.row);
            if (ins.error?.code === 'needs_setup') return res.status(409).json({ error: ins.error.message });
            if (ins.error) throw ins.error;
            const data = ins.data;
            const created = data?.[0];
            if (created && isIntercessorPrayer(created)) {
                await sendPrayerToIntercessors(supabaseAdmin, created, authUserId);
            }
            if (created && String(created.status || '') === 'Published') {
                const who = created.is_anonymous ? 'A church member' : (created.member_name || 'A church member');
                const snippet = String(created.content || '').replace(/\s+/g, ' ').trim();
                await notifyAllUsers(
                    supabaseAdmin,
                    {
                        type: 'prayer',
                        title: 'New prayer request',
                        body: snippet
                            ? `${who}: ${snippet.length > 140 ? `${snippet.slice(0, 139)}…` : snippet}`
                            : `${who} shared a prayer request.`,
                        link: '/community/prayer-wall',
                        sourceId: created.id,
                    },
                    created.user_id
                );
            }
            return res.status(201).json(created);
        }
        if (req.method === 'POST') {
            const body = { ...(req.body || {}) } as Record<string, unknown>;
            if (!body.user_id) body.user_id = authUserId;
            if (!(PRAYER_CATEGORIES as readonly string[]).includes(String(body.category || ''))) body.category = 'Other';
            if (!String(body.member_name || '').trim()) body.member_name = authDisplayName;
            applyTeamSharing(body);
            const statusVal = String(body.status || 'Vetting');
            body.status = statusVal;
            if (body.is_confidential === undefined || body.is_confidential === null) {
                body.is_confidential = statusVal === 'Confidential';
            } else if (statusVal === 'Published') {
                body.is_confidential = false;
            } else if (statusVal === 'Confidential') {
                body.is_confidential = true;
            }
            const ins = await insertPrayerRow(supabaseAdmin, body);
            if (ins.error?.code === 'needs_setup') return res.status(409).json({ error: ins.error.message });
            if (ins.error) throw ins.error;
            const data = ins.data;
            const created = data?.[0];
            if (created && isIntercessorPrayer(created)) {
                await sendPrayerToIntercessors(supabaseAdmin, created, authUserId);
            }
            if (created && String(created.status || '') === 'Published') {
                const who = created.is_anonymous ? 'A church member' : (created.member_name || 'A church member');
                const snippet = String(created.content || '').replace(/\s+/g, ' ').trim();
                await notifyAllUsers(
                    supabaseAdmin,
                    {
                        type: 'prayer',
                        title: 'New prayer request',
                        body: snippet
                            ? `${who}: ${snippet.length > 140 ? `${snippet.slice(0, 139)}…` : snippet}`
                            : `${who} shared a prayer request.`,
                        link: '/community/prayer-wall',
                        sourceId: created.id,
                    },
                    created.user_id
                );
            }
            return res.status(201).json(created);
        }
        if (req.method === 'PATCH') {
            const { id: rid, status: rstatus, action } = req.body;
            if (action === 'pray') {
                const { error } = await supabaseAdmin.rpc('increment_prayer_count', { request_id: rid });
                if (error) {
                    const { data: current } = await supabaseAdmin.from('prayer_requests').select('prayed_count').eq('id', rid).single();
                    if (current) {
                        const { data: updated, error: uError } = await supabaseAdmin.from('prayer_requests').update({ prayed_count: (current.prayed_count || 0) + 1 }).eq('id', rid).select().single();
                        if (uError) throw uError;
                        return res.status(200).json(updated);
                    }
                    throw error;
                }
                return res.status(200).json({ success: true });
            }
            if (rstatus) {
                if (!canChangePrayerStatus(authRole)) {
                    return res.status(403).json({ error: 'Only the prayer team can approve or move prayer requests.' });
                }
                const { data: previous } = await supabaseAdmin
                    .from('prayer_requests')
                    .select('*')
                    .eq('id', rid)
                    .maybeSingle();
                const statusStr = String(rstatus);
                if (statusStr === 'Published' && !canPublishPrayer(previous)) {
                    return res.status(409).json({ error: 'This request was sent to the Intercessors only. It can’t go on the Prayer Wall.' });
                }
                const patch: Record<string, unknown> = { status: statusStr };
                // Keep Connect's public wall in sync: Published ⇒ not confidential.
                if (statusStr === 'Published') patch.is_confidential = false;
                else if (statusStr === 'Confidential') patch.is_confidential = true;
                const { data, error } = await supabaseAdmin.from('prayer_requests').update(patch).eq('id', rid).select().single();
                if (error) throw error;
                if (data && String(rstatus) === 'Published' && previous?.status !== 'Published') {
                    const who = data.is_anonymous ? 'A church member' : (data.member_name || 'A church member');
                    const snippet = String(data.content || '').replace(/\s+/g, ' ').trim();
                    await notifyAllUsers(
                        supabaseAdmin,
                        {
                            type: 'prayer',
                            title: 'New prayer request',
                            body: snippet
                                ? `${who}: ${snippet.length > 140 ? `${snippet.slice(0, 139)}…` : snippet}`
                                : `${who} shared a prayer request.`,
                            link: '/community/prayer-wall',
                            sourceId: data.id,
                        },
                        data.user_id || previous?.user_id
                    );
                }
                return res.status(200).json(data);
            }
        }
        if (req.method === 'DELETE') {
            const { data: target } = await supabaseAdmin
                .from('prayer_requests')
                .select('id, user_id')
                .eq('id', id)
                .maybeSingle();
            if (!canDeletePrayer(authRole, authUserId, target)) {
                return res.status(403).json({ error: 'Only the prayer team or the person who posted it can delete this request.' });
            }
            const { error } = await supabaseAdmin.from('prayer_requests').delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ success: true });
        }
    }

    if (subResource === 'worship') {
        const table = type === 'songs' ? 'worship_songs' : 'setlists';
        if (req.method === 'GET') {
            if (id) {
                const { data, error } = await supabaseAdmin.from(table).select('*').eq('id', id).single();
                if (error) throw error;
                return res.status(200).json(data);
            }
            const { data, error } = await supabaseAdmin.from(table).select('*').order('created_at', { ascending: false });
            if (error) throw error;
            return res.status(200).json(data);
        }
        if (req.method === 'POST') {
            const { id: rid, ...dataToUpsert } = req.body;
            let dbQuery = rid ? supabaseAdmin.from(table).update(dataToUpsert).eq('id', rid) : supabaseAdmin.from(table).insert([dataToUpsert]);
            const { data, error } = await dbQuery.select().single();
            if (error) throw error;
            return res.status(200).json(data);
        }
        if (req.method === 'DELETE') {
            const { error } = await supabaseAdmin.from(table).delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ success: true });
        }
    }

    if (subResource === 'chat') {
        const chatType = first(req.query.chatType);
        const accessOpts = { supabase: supabaseAdmin, userRole: authRole };

        const assertChannelAccess = async (
            channel: any
        ): Promise<{ ok: true; channel: any } | { ok: false; status: number; error: string }> => {
            if (!channel) return { ok: false as const, status: 404, error: 'Channel not found' };
            const allowed = await canAccessChannel(channel, authUserId, accessOpts);
            if (!allowed) {
                return { ok: false as const, status: 403, error: 'Forbidden: you cannot access this channel' };
            }
            return { ok: true as const, channel };
        };

        const resolveMessageChannelAccess = async (
            messageId: string
        ): Promise<
            | { ok: true; message: any; channel: any }
            | { ok: false; status: number; error: string }
        > => {
            const { data: msg } = await supabaseAdmin
                .from('chat_messages')
                // created_at: needed for the 24-hour edit window.
                .select('id, channel_id, user_id, content, deleted_at, created_at')
                .eq('id', messageId)
                .maybeSingle();
            if (!msg) return { ok: false as const, status: 404, error: 'Message not found' };
            const channel = await fetchChannel(supabaseAdmin, msg.channel_id);
            const gate = await assertChannelAccess(channel);
            if (gate.ok === false) {
                return { ok: false as const, status: gate.status, error: gate.error };
            }
            return { ok: true as const, message: msg, channel: gate.channel };
        };

        const recordMentionsAndNotify = async (
            messageId: string,
            channel: any,
            content: string,
            parentId?: string | null,
            explicitMentionIds?: string[]
        ) => {
            try {
                const mentioned = new Map<string, true>();

                const ids = (explicitMentionIds || [])
                    .map((id) => String(id || '').trim())
                    .filter((id) => id && id !== authUserId && UUID_RE.test(id));
                if (ids.length > 0) {
                    const { data: users } = await supabaseAdmin
                        .from('users')
                        .select('id')
                        .in('id', ids)
                        .neq('id', authUserId);
                    (users || []).forEach((u: any) => mentioned.set(u.id, true));
                }

                const mentionTokens = [...content.matchAll(/@([A-Za-z][A-Za-z0-9._-]{1,40})/g)].map((m) => m[1]);
                const uniqueNames = [...new Set(mentionTokens.map((t) => t.toLowerCase()))].filter(
                    (n) => n !== 'vault'
                );
                if (uniqueNames.length > 0) {
                    const { data: users } = await supabaseAdmin.from('users').select('id, name').neq('id', authUserId);
                    (users || []).forEach((u: any) => {
                        const nm = String(u.name || '').toLowerCase().replace(/\s+/g, '');
                        const firstName = String(u.name || '').split(/\s+/)[0]?.toLowerCase() || '';
                        const hit = uniqueNames.some(
                            (tok) =>
                                nm === tok.replace(/\./g, '') ||
                                firstName === tok.toLowerCase() ||
                                String(u.name || '').toLowerCase() === tok.toLowerCase()
                        );
                        if (hit) mentioned.set(u.id, true);
                    });
                }

                // Channel access is required to receive a mention notification.
                const eligibleIds = await filterEligibleMentionIds(
                    supabaseAdmin,
                    channel,
                    [...mentioned.keys()],
                    authUserId
                );
                const eligibleSet = new Set(eligibleIds);

                for (const uid of eligibleSet) {
                    await supabaseAdmin.from('chat_message_mentions').upsert(
                        { message_id: messageId, mentioned_user_id: uid },
                        { onConflict: 'message_id,mentioned_user_id' }
                    );
                    await notifyUser(supabaseAdmin, uid, {
                        type: 'community_mention',
                        title: `${authDisplayName} mentioned you`,
                        body: content.length > 140 ? `${content.slice(0, 139)}…` : content,
                        link: '/community/chat',
                        sourceId: messageId,
                    });
                }

                if (parentId) {
                    const { data: parent } = await supabaseAdmin
                        .from('chat_messages')
                        .select('id, user_id, channel_id')
                        .eq('id', parentId)
                        .maybeSingle();
                    if (parent?.user_id && parent.user_id !== authUserId) {
                        await notifyUser(supabaseAdmin, parent.user_id, {
                            type: 'community_reply',
                            title: `${authDisplayName} replied to you`,
                            body: content.length > 140 ? `${content.slice(0, 139)}…` : content,
                            link: '/community/chat',
                            sourceId: messageId,
                        });
                    }
                }

                const vis = String(channel?.visibility || '').toLowerCase();
                const isDm =
                    vis === 'dm' ||
                    (String(channel?.type) === 'private' && String(channel?.name || '').startsWith('DM_'));
                if (isDm) {
                    const { data: members } = await supabaseAdmin
                        .from('chat_room_members')
                        .select('user_id')
                        .eq('channel_id', channel.id);
                    const recipients = new Set<string>(
                        (members || []).map((m: any) => m.user_id).filter((id: string) => id && id !== authUserId)
                    );
                    for (const pid of channel.participants || []) {
                        if (pid && pid !== authUserId) recipients.add(String(pid));
                    }
                    for (const rid of recipients) {
                        await notifyUser(supabaseAdmin, rid, {
                            type: 'community_dm',
                            title: `Message from ${authDisplayName}`,
                            body: content.length > 140 ? `${content.slice(0, 139)}…` : content,
                            link: '/community/chat/dm',
                            sourceId: messageId,
                        });
                    }
                }
            } catch (e: any) {
                console.warn('[community notify]', e?.message || e);
            }
        };

        if (chatType === 'requests' || chatType === 'request-create' || chatType === 'request-update') {
            const { handleChatRequests } = await import('./chatRequests.js');
            return handleChatRequests(chatType, req, res, {
                supabase: supabaseAdmin,
                userId: String(authUserId),
                resolveMessageChannelAccess,
                fetchChannelForUser: async (cid: string) => {
                    const channel = await fetchChannel(supabaseAdmin, cid);
                    return assertChannelAccess(channel);
                },
                isRoomLeader: async (channel: any) => {
                    const leader = await resolveHuddleStartPermission({
                        supabase: supabaseAdmin,
                        channel,
                        userId: authUserId,
                        role: authRole,
                    });
                    return Boolean(leader.canStart);
                },
                canUserOpen: async (channel: any, uid: string) => {
                    const { data: target } = await supabaseAdmin.from('users').select('id, role').eq('id', uid).maybeSingle();
                    if (!target) return false;
                    return canAccessChannel(channel, uid, { supabase: supabaseAdmin, userRole: (target as any).role || null });
                },
                broadcast: (cid: string, messageId: string) => {
                    waitUntil(broadcastChatEvent(cid, 'message', { id: messageId }));
                },
                notify: (uid: string, payload) =>
                    notifyUser(supabaseAdmin, uid, { type: 'assignment', title: payload.title, body: payload.body, link: payload.link, sourceId: payload.sourceId }),
            });
        }
        if (chatType === 'cards' || chatType === 'card-options' || chatType === 'card-create' || chatType === 'card-going') {
            const { handleChatCards } = await import('./chatCards.js');
            return handleChatCards(chatType, req, res, {
                supabase: supabaseAdmin,
                userId: String(authUserId),
                resolveMessageChannelAccess,
                broadcast: (cid: string, messageId: string) => {
                    waitUntil(broadcastChatEvent(cid, 'message', { id: messageId }));
                },
            });
        }
        if (chatType === 'polls' || chatType === 'poll-create' || chatType === 'poll-vote' || chatType === 'poll-close') {
            const { handleChatPolls } = await import('./chatPolls.js');
            return handleChatPolls(chatType, req, res, {
                supabase: supabaseAdmin,
                userId: String(authUserId),
                resolveMessageChannelAccess,
                isRoomLeader: async (channel: any) => {
                    const leader = await resolveHuddleStartPermission({
                        supabase: supabaseAdmin,
                        channel,
                        userId: authUserId,
                        role: authRole,
                    });
                    return Boolean(leader.canStart);
                },
                broadcast: (cid: string, messageId: string) => {
                    waitUntil(broadcastChatEvent(cid, 'message', { id: messageId }));
                },
            });
        }

        if (req.method === 'GET') {
            if (chatType === 'channels') {
                await syncRoomMembershipsForUser(supabaseAdmin, authUserId);
                const data = await listAccessibleChannels(supabaseAdmin, authUserId, authRole);
                return res.status(200).json(data);
            }
            if (chatType === 'archives') {
                // Your archived chats (ones with a newer message from someone else come back).
                return res.status(200).json({ ok: true, archived: await listArchivedChats(supabaseAdmin, authUserId) });
            }
            if (chatType === 'dm-list') {
                // PLCC Chat: your direct conversations from the server, so they show on every
                // device and only for the account they belong to (newest first).
                const { data: memberRows } = await supabaseAdmin
                    .from('chat_room_members')
                    .select('channel_id')
                    .eq('user_id', authUserId)
                    .limit(1000);
                const memberIds = (memberRows || []).map((r: any) => String(r.channel_id)).filter(Boolean);
                const { data: byName } = await supabaseAdmin
                    .from('chat_channels')
                    .select('id, name, participants, visibility, type, created_at')
                    .like('name', `DM\\_%${authUserId}%`)
                    .limit(500);
                let dmRows: any[] = (byName || []).slice();
                if (memberIds.length) {
                    const { data: byMember } = await supabaseAdmin
                        .from('chat_channels')
                        .select('id, name, participants, visibility, type, created_at')
                        .in('id', memberIds.slice(0, 1000))
                        .like('name', 'DM\\_%');
                    for (const row of byMember || []) if (!dmRows.some((d) => d.id === row.id)) dmRows.push(row);
                }
                dmRows = dmRows.filter((c: any) => {
                    const parts = String(c.name || '').split('_');
                    return parts.length === 3 && parts[0] === 'DM' && (parts[1] === authUserId || parts[2] === authUserId);
                });
                if (!dmRows.length) return res.status(200).json({ ok: true, conversations: [] });
                const partnerOf = (name: string) => {
                    const [, a, b] = name.split('_');
                    return a === authUserId ? b : a;
                };
                const partnerIds = [...new Set(dmRows.map((c: any) => partnerOf(String(c.name))))];
                const { data: partners } = await supabaseAdmin.from('users').select('id, name').in('id', partnerIds);
                const names = new Map((partners || []).map((u: any) => [String(u.id), String(u.name || 'Member')]));
                const ids = dmRows.map((c: any) => String(c.id));
                const { data: recent } = await supabaseAdmin
                    .from('chat_messages')
                    .select('channel_id, content, created_at')
                    .in('channel_id', ids)
                    .is('deleted_at', null)
                    .order('created_at', { ascending: false })
                    .limit(1000);
                const last = new Map<string, { content: string; created_at: string }>();
                for (const m of recent || []) if (!last.has(String(m.channel_id))) last.set(String(m.channel_id), m as any);
                const conversations = dmRows
                    .map((c: any) => {
                        const partnerId = partnerOf(String(c.name));
                        const lm = last.get(String(c.id));
                        return {
                            channelId: String(c.id),
                            partnerId,
                            partnerName: names.get(partnerId) || 'Member',
                            lastMessageAt: lm?.created_at || null,
                            lastMessage: lm ? String(lm.content || '').slice(0, 120) : null,
                            createdAt: c.created_at || null,
                        };
                    })
                    .filter((c) => c.lastMessageAt || c.partnerId)
                    .sort((a, b) =>
                        String(b.lastMessageAt || b.createdAt || '').localeCompare(String(a.lastMessageAt || a.createdAt || ''))
                    )
                    .slice(0, 100);
                return res.status(200).json({ ok: true, conversations });
            }
            if (chatType === 'mentors') {
                try {
                    const mentors = await listCommunityMentors(supabaseAdmin, authUserId);
                    return res.status(200).json(Array.isArray(mentors) ? mentors : []);
                } catch (mentorErr: any) {
                    console.error('[chat mentors]', mentorErr?.message || mentorErr);
                    return res.status(200).json([]);
                }
            }
            if (chatType === 'mention-candidates') {
                const cid = String(first(channelId) || '').trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: 'Forbidden' });
                const q = typeof req.query.q === 'string' ? req.query.q : '';
                const candidates = await listMentionCandidatesForChannel(supabaseAdmin, gate.channel, {
                    excludeUserId: authUserId,
                    query: q,
                    limit: 25,
                });
                return res.status(200).json(candidates);
            }
            if (chatType === 'member-picker') {
                const manageCid = String(first(channelId) || req.query.channelId || '').trim();
                if (manageCid) {
                    const channel = await fetchChannel(supabaseAdmin, manageCid);
                    const mayManage = await canManageChannelMembers(
                        supabaseAdmin,
                        channel,
                        authUserId,
                        authRole
                    );
                    if (!mayManage) {
                        return res.status(403).json({ ok: false, error: 'Forbidden' });
                    }
                } else if (!canCreateCommunityChannels(authRole)) {
                    return res.status(403).json({ ok: false, error: 'Forbidden' });
                }
                const q = typeof req.query.q === 'string' ? req.query.q : '';
                const candidates = await listMemberPickerCandidates(supabaseAdmin, {
                    excludeUserId: authUserId,
                    query: q,
                    limit: 50,
                    excludeChannelId: manageCid || undefined,
                });
                return res.status(200).json(candidates);
            }
            if (chatType === 'chat-ministries') {
                if (!canCreateCommunityChannels(authRole)) {
                    return res.status(403).json({ ok: false, error: 'Forbidden' });
                }
                const { data: ministries, error } = await supabaseAdmin
                    .from('ministries')
                    .select('id, name, description')
                    .order('name', { ascending: true });
                if (error) throw error;
                const allowed = await listAuthorizedMinistryIds(supabaseAdmin, authUserId, authRole);
                const list =
                    allowed === 'all'
                        ? ministries || []
                        : (ministries || []).filter((m: any) => allowed.includes(String(m.id)));
                return res.status(200).json({ ok: true, ministries: list });
            }
            if (chatType === 'channel-members') {
                const cid = String(first(channelId) || req.query.channelId || '').trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                if (!channel) return res.status(404).json({ ok: false, error: 'Channel not found' });
                const mayManage = await canManageChannelMembers(
                    supabaseAdmin,
                    channel,
                    authUserId,
                    authRole
                );
                if (!mayManage) {
                    return res.status(403).json({ ok: false, error: 'Forbidden: cannot manage this channel' });
                }
                const members = await listChannelMembers(supabaseAdmin, channel);
                return res.status(200).json({
                    ok: true,
                    members,
                    created_by: channel.created_by || null,
                    visibility: channel.visibility || null,
                });
            }
            if (chatType === 'dm-channel') {
                const partner = cleanUuid(partnerId) || (typeof partnerId === 'string' ? partnerId : null);
                if (!partner || partner === authUserId) {
                    return res.status(400).json({ ok: false, error: 'Valid partnerId is required' });
                }
                const sortedIds = [partner, authUserId].sort();
                const deterministicName = `DM_${sortedIds[0]}_${sortedIds[1]}`;
                const { data: existing } = await supabaseAdmin
                    .from('chat_channels')
                    .select('*')
                    .eq('name', deterministicName)
                    .eq('type', 'private')
                    .maybeSingle();
                if (existing) {
                    const allowed = await canAccessChannel(existing, authUserId, accessOpts);
                    if (!allowed) {
                        return res.status(403).json({ ok: false, error: 'Forbidden: not a participant in this conversation' });
                    }
                    await ensureDmMembership(supabaseAdmin, existing.id, partner, authUserId);
                    return res.status(200).json(existing);
                }
                const { data: created, error } = await supabaseAdmin
                    .from('chat_channels')
                    .insert({
                        name: deterministicName,
                        type: 'private',
                        visibility: 'dm',
                        slug: slugifyChannelName(deterministicName),
                        participants: [partner, authUserId],
                        created_by: authUserId,
                    })
                    .select()
                    .single();
                if (error) throw error;
                await ensureDmMembership(supabaseAdmin, created.id, partner, authUserId);
                return res.status(200).json(created);
            }
            if (chatType === 'unread-count') {
                try {
                    const clientSince =
                        typeof req.query.since === 'string' ? req.query.since : null;
                    const { total, byChannel } = await countUnreadByChannel(
                        supabaseAdmin,
                        authUserId,
                        clientSince,
                        authRole
                    );
                    return res.status(200).json({ count: total, byChannel });
                } catch (e) {
                    console.warn('[chat unread-count]', e);
                    return res.status(200).json({ count: 0, byChannel: {} });
                }
            }
            if (chatType === 'voice-huddle-status') {
                const cid = String(first(channelId) || req.query.channelId || '').trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) {
                    return res.status(gate.status).json({ ok: false, error: gate.error });
                }
                const { data: membership } = await supabaseAdmin
                    .from('chat_room_members')
                    .select('role')
                    .eq('channel_id', cid)
                    .eq('user_id', authUserId)
                    .maybeSingle();
                const isMod =
                    String(membership?.role || '').toLowerCase() === 'moderator';
                const isCreator =
                    String(gate.channel.created_by || '') === String(authUserId);
                const voiceDecision = decideVoiceHuddleAccess({
                    canAccessChannel: true,
                    visibility: normalizeVisibility(gate.channel),
                    isChannelModerator: isMod,
                    isChannelCreator: isCreator,
                    isBroadAdmin: isBroadChatAdmin(authRole),
                    allowDm: normalizeVisibility(gate.channel) === 'dm',
                });
                if (voiceDecision.ok === false) {
                    return res.status(voiceDecision.status).json({ ok: false, error: voiceDecision.error });
                }
                const lk = getLiveKitServerConfig();
                if (!lk) {
                    return res.status(503).json({
                        ok: false,
                        error: 'Voice huddles are not configured yet',
                        configured: false,
                    });
                }
                try {
                    const status = await listVoiceRoomParticipantCount(lk, cid);
                    // Channel-level mod rights so prejoin can End a stuck room without joining first.
                    let canModerate = Boolean(voiceDecision.canModerate);
                    if (!canModerate && status.active) {
                        try {
                            const session = await resolveVoiceCanModerate(
                                lk,
                                cid,
                                authUserId,
                                voiceDecision.canModerate
                            );
                            canModerate = Boolean(session.canModerate);
                        } catch {
                            /* keep channel-level false */
                        }
                    }
                    return res.status(200).json({
                        ok: true,
                        configured: true,
                        channelId: cid,
                        active: status.active,
                        participantCount: status.participantCount,
                        roomName: status.roomName,
                        canModerate,
                        channelCanModerate: Boolean(voiceDecision.canModerate),
                        fallbackPass: signHuddleFallbackPass(
                            {
                                userId: authUserId,
                                channelId: cid,
                                displayName: authDisplayName,
                                canModerate,
                                channelCanModerate: Boolean(voiceDecision.canModerate),
                            },
                            lk.apiSecret
                        ),
                    });
                } catch (e: any) {
                    console.warn('[voice-huddle-status]', e);
                    return res.status(502).json({
                        ok: false,
                        error: 'Unable to check voice huddle status',
                    });
                }
            }
            if (chatType === 'voice-huddle-attendance') {
                const cid = String(first(channelId) || req.query.channelId || '').trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                if (!canViewHuddleAttendance(authRole)) {
                    return res.status(403).json({
                        ok: false,
                        error: 'Only Pastor, Admin, Super Admin, or Ministry Leader can view huddle attendance',
                    });
                }
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) {
                    return res.status(gate.status).json({ ok: false, error: gate.error });
                }
                try {
                    const payload = await getHuddleAttendanceForChannel({
                        supabase: supabaseAdmin,
                        channelId: cid,
                        historyLimit: Number(req.query.limit) || 10,
                    });
                    return res.status(200).json({
                        ...payload,
                        canViewAttendance: true,
                    });
                } catch (e: any) {
                    console.warn('[voice-huddle-attendance]', e);
                    return res.status(502).json({
                        ok: false,
                        error: 'Unable to load huddle attendance',
                    });
                }
            }
            if (chatType === 'voice-huddle-statuses') {
                // Batch presence for channels the caller can already access (ACL re-checked).
                const rawIds = String(
                    first(req.query.channelIds) || req.query.channelIds || ''
                ).trim();
                let requested = rawIds
                    ? rawIds.split(',').map((s) => String(s || '').trim()).filter(Boolean)
                    : [];

                const accessible = await listAccessibleChannels(
                    supabaseAdmin,
                    authUserId,
                    authRole
                );
                const accessibleById = new Map(
                    (accessible || []).map((c: any) => [String(c.id), c])
                );

                if (requested.length === 0) {
                    requested = filterVoiceStatusChannelIds(accessible || []);
                }

                const allowedChannels: { id: string; visibility: string | null }[] = [];
                for (const id of requested) {
                    const ch = accessibleById.get(id);
                    if (!ch) continue; // never leak inaccessible channel status
                    const vis = normalizeVisibility(ch);
                    const voiceDecision = decideVoiceHuddleAccess({
                        canAccessChannel: true,
                        visibility: vis,
                        isChannelModerator: false,
                        isChannelCreator: false,
                        isBroadAdmin: false,
                        allowDm: vis === 'dm',
                    });
                    if (voiceDecision.ok === false) continue; // DM / denied
                    allowedChannels.push({ id, visibility: vis });
                }

                const lk = getLiveKitServerConfig();
                const allowedIds = allowedChannels.map((c) => c.id);
                // Huddles on the Daily backup line (LiveKit out of quota) have an
                // empty LiveKit room — count them too so the LIVE badge shows.
                const dailyCounts = await countDailyRoomParticipantsForChannels(
                    getDailyApiKey(),
                    allowedIds
                ).catch(() => ({} as Record<string, number>));
                if (!lk) {
                    const byChannel = mergeDailyIntoHuddleStatuses({}, dailyCounts, allowedIds);
                    return res.status(200).json({
                        ok: true,
                        configured: Object.keys(dailyCounts).length > 0,
                        byChannel: Object.keys(dailyCounts).length > 0 ? byChannel : {},
                    });
                }

                try {
                    const liveKitByChannel = await listVoiceHuddleStatusesForChannels(lk, allowedIds);
                    const byChannel = mergeDailyIntoHuddleStatuses(liveKitByChannel, dailyCounts, allowedIds);
                    return res.status(200).json({
                        ok: true,
                        configured: true,
                        byChannel,
                    });
                } catch (e: any) {
                    console.warn('[voice-huddle-statuses]', e);
                    // Graceful: omit LIVE badges rather than fail Community
                    return res.status(200).json({
                        ok: true,
                        configured: true,
                        byChannel: {},
                        warning: 'Voice huddle status temporarily unavailable',
                    });
                }
            }
            if (chatType === 'messages') {
                const cid = first(channelId) || (typeof channelId === 'string' ? channelId : '');
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
                const { data, error } = await supabaseAdmin
                    .from('chat_messages')
                    .select('*')
                    .eq('channel_id', cid)
                    .order('created_at', { ascending: true });
                if (error) throw error;

                const rawMessages = (data || []).map((m: any) => {
                    if (m.deleted_at) {
                        return {
                            ...m,
                            content: '',
                            is_deleted: true,
                        };
                    }
                    return { ...m, is_deleted: false };
                });

                await upsertChatReadStatus(supabaseAdmin, authUserId, cid);
                let enriched = await enrichMessagesWithAvatars(supabaseAdmin, rawMessages);

                const messageIds = enriched.map((m: any) => m.id).filter(Boolean);
                const parentIds = [
                    ...new Set(enriched.map((m: any) => m.parent_id).filter(Boolean)),
                ] as string[];

                let reactionsByMessage = new Map<string, any[]>();
                let attachmentsByMessage = new Map<string, any[]>();
                let parentsById = new Map<string, any>();

                if (messageIds.length > 0) {
                    const { data: reactions } = await supabaseAdmin
                        .from('chat_message_reactions')
                        .select('id, message_id, user_id, emoji, created_at')
                        .in('message_id', messageIds);
                    (reactions || []).forEach((r: any) => {
                        const list = reactionsByMessage.get(r.message_id) || [];
                        list.push(r);
                        reactionsByMessage.set(r.message_id, list);
                    });

                    const { data: attachments } = await supabaseAdmin
                        .from('chat_attachments')
                        .select('*')
                        .in('message_id', messageIds);
                    for (const a of attachments || []) {
                        let signed_url: string | null = null;
                        try {
                            const { data: signed } = await supabaseAdmin.storage
                                .from('community-files')
                                .createSignedUrl(a.storage_path, 60 * 60);
                            signed_url = signed?.signedUrl || null;
                        } catch {
                            signed_url = null;
                        }
                        const list = attachmentsByMessage.get(a.message_id) || [];
                        list.push({ ...a, signed_url });
                        attachmentsByMessage.set(a.message_id, list);
                    }
                }

                if (parentIds.length > 0) {
                    const { data: parents } = await supabaseAdmin
                        .from('chat_messages')
                        .select('id, content, user_id, user_name, deleted_at')
                        .in('id', parentIds);
                    const parentEnriched = await enrichMessagesWithAvatars(supabaseAdmin, parents || []);
                    parentEnriched.forEach((p: any) => parentsById.set(p.id, p));
                }

                enriched = enriched.map((m: any) => {
                    const parent = m.parent_id ? parentsById.get(m.parent_id) : null;
                    return {
                        ...m,
                        reactions: reactionsByMessage.get(m.id) || [],
                        attachments: attachmentsByMessage.get(m.id) || [],
                        parent: parent
                            ? {
                                  id: parent.id,
                                  user_name: parent.display_name || parent.user_name || 'Member',
                                  avatar_url: parent.avatar_url || null,
                                  content: parent.deleted_at ? null : parent.content,
                                  is_deleted: Boolean(parent.deleted_at),
                              }
                            : m.parent_id
                              ? { id: m.parent_id, is_deleted: true, content: null, user_name: null }
                              : null,
                    };
                });

                return res.status(200).json(enriched);
            }
            if (chatType === 'reactions') {
                const messageId = String(first(req.query.messageId) || req.query.messageId || '').trim();
                if (!messageId) return res.status(400).json({ ok: false, error: 'messageId is required' });
                const gate = await resolveMessageChannelAccess(messageId);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
                const { data, error } = await supabaseAdmin
                    .from('chat_message_reactions')
                    .select('*')
                    .eq('message_id', messageId)
                    .order('created_at', { ascending: true });
                if (error) throw error;
                return res.status(200).json(data || []);
            }
            return res.status(200).json([]);
        }
        if (req.method === 'POST') {
            if (chatType === 'channels') {
                if (!canCreateCommunityChannels(authRole)) {
                    return res.status(403).json({
                        ok: false,
                        error: 'Forbidden: only church leadership/staff roles may create Community channels',
                    });
                }
                const name = String(req.body?.name || '').trim();
                if (!name) return res.status(400).json({ ok: false, error: 'Channel name is required' });

                // Default remains open for backward compatibility when channelType omitted
                const kind =
                    parseChannelCreateKind(req.body?.channelType || req.body?.channel_type || req.body?.kind) ||
                    'open';
                const description = req.body?.description != null ? String(req.body.description).trim() || null : null;
                const rawMemberIds = Array.isArray(req.body?.memberIds)
                    ? req.body.memberIds
                    : Array.isArray(req.body?.member_ids)
                      ? req.body.member_ids
                      : [];
                const memberIds = rawMemberIds.map((id: unknown) => String(id || '').trim()).filter(Boolean);

                let insertRow: Record<string, any> = {
                    name,
                    description,
                    slug: slugifyChannelName(name) || null,
                    created_by: authUserId,
                };

                if (kind === 'open') {
                    insertRow = {
                        ...insertRow,
                        type: 'public',
                        visibility: 'open',
                        ministry_id: null,
                    };
                } else if (kind === 'private') {
                    insertRow = {
                        ...insertRow,
                        type: 'private',
                        visibility: 'private',
                        ministry_id: null,
                    };
                } else if (kind === 'ministry') {
                    const ministryId = String(req.body?.ministryId || req.body?.ministry_id || '').trim();
                    if (!ministryId) {
                        return res.status(400).json({ ok: false, error: 'ministryId is required for ministry channels' });
                    }
                    const { data: ministry } = await supabaseAdmin
                        .from('ministries')
                        .select('id, name')
                        .eq('id', ministryId)
                        .maybeSingle();
                    if (!ministry) {
                        return res.status(400).json({ ok: false, error: 'Ministry not found' });
                    }
                    const scoped = await userCanAccessMinistryScope(
                        supabaseAdmin,
                        authUserId,
                        ministryId,
                        authRole
                    );
                    if (!scoped) {
                        return res.status(403).json({
                            ok: false,
                            error: 'Forbidden: ministry channel outside your authorized ministry scope',
                        });
                    }
                    insertRow = {
                        ...insertRow,
                        type: 'private',
                        visibility: 'ministry',
                        ministry_id: ministryId,
                    };
                }

                // Reject client attempts to create leadership/dm via this path
                if (['leadership', 'dm'].includes(String(req.body?.visibility || '').toLowerCase())) {
                    return res.status(400).json({ ok: false, error: 'Invalid channel visibility' });
                }

                const { data, error } = await supabaseAdmin
                    .from('chat_channels')
                    .insert(insertRow)
                    .select()
                    .single();
                if (error) throw error;

                // Private + ministry: creator must be moderator (server-enforced)
                if (kind === 'private' || kind === 'ministry') {
                    await ensureCreatorModerator(supabaseAdmin, data.id, authUserId);
                    const others = memberIds.filter((id: string) => id !== authUserId);

                    if (kind === 'ministry') {
                        // Order: creator → roster ministry_sync → explicit manual extras only
                        await syncMinistryMembershipsForChannel(supabaseAdmin, data);
                        await ensureCreatorModerator(supabaseAdmin, data.id, authUserId);
                        const rosterIds = new Set(
                            await listMinistryRosterUserIds(
                                supabaseAdmin,
                                String(data.ministry_id || '')
                            )
                        );
                        const extras = others.filter((id: string) => !rosterIds.has(id));
                        if (extras.length > 0) {
                            await addManualMembers(supabaseAdmin, data.id, extras, 'member');
                        }
                    } else if (others.length > 0) {
                        await addManualMembers(supabaseAdmin, data.id, others, 'member');
                    }
                }

                const logAudit = await getAudit();
                await logAudit({
                    userId: authUserId,
                    action: 'Chat Channel Created',
                    details: {
                        name: data?.name,
                        visibility: data?.visibility || kind,
                        slug: data?.slug,
                    },
                    resourceType: 'chat_channel',
                    resourceId: data?.id,
                    severity: 'info',
                    req,
                });

                return res.status(200).json(data);
            }
            if (chatType === 'share-image') {
                // Upload + save chat_channels.share_image_url for WhatsApp OG cards.
                const cid = String(
                    req.body?.channelId || req.body?.channel_id || first(channelId) || ''
                ).trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                if (!channel) return res.status(404).json({ ok: false, error: 'Channel not found' });
                const mayManage = await canManageChannelMembers(
                    supabaseAdmin,
                    channel,
                    authUserId,
                    authRole
                );
                const isCreator =
                    String((channel as any)?.created_by || '') === String(authUserId);
                if (!mayManage && !isCreator && !canCreateCommunityChannels(authRole)) {
                    return res.status(403).json({
                        ok: false,
                        error: 'Forbidden: cannot update this channel share card',
                    });
                }
                if (String((channel as any)?.visibility || '').toLowerCase() === 'dm') {
                    return res.status(400).json({ ok: false, error: 'DM channels cannot have share cards' });
                }

                const raw = String(req.body?.imageBase64 || req.body?.dataUrl || '');
                if (!raw) {
                    return res.status(400).json({ ok: false, error: 'Missing image data' });
                }
                const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
                const base64 = match?.[2] || raw.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64, 'base64');
                if (!buffer.length) {
                    return res.status(400).json({ ok: false, error: 'Invalid image data' });
                }
                if (buffer.length > 6 * 1024 * 1024) {
                    return res.status(400).json({ ok: false, error: 'Image too large (max 6MB)' });
                }

                // Always store a WhatsApp-safe JPEG (large PNGs are dropped by WhatsApp).
                let uploadBuf = buffer;
                let uploadType = 'image/jpeg';
                try {
                    const { compressImageForWhatsAppOg } = await import('./whatsappOgImage.js');
                    const compressed = await compressImageForWhatsAppOg(buffer);
                    uploadBuf = compressed.buffer;
                    uploadType = compressed.contentType;
                } catch (compressErr: any) {
                    console.error('[share-image] compress', compressErr?.message || compressErr);
                    return res.status(400).json({
                        ok: false,
                        error: 'Could not process that image. Try a JPEG under 2MB.',
                    });
                }

                const path = `huddle-share/${cid}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

                let publicUrl: string | null = null;
                for (const bucket of ['event-images', 'avatars']) {
                    const { error: uploadError } = await supabaseAdmin.storage
                        .from(bucket)
                        .upload(path, uploadBuf, { contentType: uploadType, upsert: false });
                    if (!uploadError) {
                        const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
                        publicUrl = pub?.publicUrl || null;
                        break;
                    }
                    console.error(`[share-image] upload (${bucket}):`, uploadError.message || uploadError);
                }
                if (!publicUrl) {
                    return res.status(500).json({
                        ok: false,
                        error: 'Image upload failed. Check storage bucket permissions.',
                    });
                }

                const { data: updated, error: updateError } = await supabaseAdmin
                    .from('chat_channels')
                    .update({ share_image_url: publicUrl })
                    .eq('id', cid)
                    .select('*')
                    .maybeSingle();

                if (updateError) {
                    console.error('[share-image] update', updateError.message);
                    if (/share_image_url/i.test(updateError.message)) {
                        return res.status(503).json({
                            ok: false,
                            error:
                                'Database column missing. Run migration add_chat_channel_share_image.sql in Supabase, then try again.',
                        });
                    }
                    return res.status(500).json({
                        ok: false,
                        error: 'Image uploaded but could not save channel card.',
                    });
                }
                if (!updated) {
                    return res.status(404).json({ ok: false, error: 'Channel not found' });
                }

                const logAudit = await getAudit();
                await logAudit({
                    userId: authUserId,
                    action: 'Chat Channel Share Image Updated',
                    details: { name: updated?.name, share_image_url: publicUrl },
                    resourceType: 'chat_channel',
                    resourceId: cid,
                    severity: 'info',
                    req,
                });

                return res.status(200).json({
                    ok: true,
                    url: publicUrl,
                    channel: updated,
                    shareUrl: null,
                });
            }
            if (chatType === 'channel-members') {
                const cid = String(req.body?.channelId || req.body?.channel_id || first(channelId) || '').trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                if (!channel) return res.status(404).json({ ok: false, error: 'Channel not found' });
                const mayManage = await canManageChannelMembers(
                    supabaseAdmin,
                    channel,
                    authUserId,
                    authRole
                );
                if (!mayManage) {
                    return res.status(403).json({ ok: false, error: 'Forbidden: cannot manage this channel' });
                }
                const rawIds = Array.isArray(req.body?.userIds)
                    ? req.body.userIds
                    : Array.isArray(req.body?.user_ids)
                      ? req.body.user_ids
                      : req.body?.userId
                        ? [req.body.userId]
                        : [];
                const userIds = rawIds.map((id: unknown) => String(id || '').trim()).filter(Boolean);
                if (userIds.length === 0) {
                    return res.status(400).json({ ok: false, error: 'userIds required' });
                }
                // Ministry leaders cannot add members to out-of-scope ministry rooms (already gated by canManage)
                const result = await addManualMembers(supabaseAdmin, cid, userIds, 'member');
                const members = await listChannelMembers(supabaseAdmin, channel);
                return res.status(200).json({ ok: true, ...result, members });
            }
            if (chatType === 'messages') {
                const cid = String(req.body?.channelId || '').trim();
                const content = String(req.body?.content || '').trim();
                // Attachment-only: allow empty content when client declares a follow-up upload.
                // Auth/access checks are unchanged; empty body alone is still rejected.
                const attachmentPending =
                    req.body?.attachmentPending === true || req.body?.attachment_pending === true;
                if (!cid) {
                    return res.status(400).json({ ok: false, error: 'channelId is required' });
                }
                if (!content && !attachmentPending) {
                    return res.status(400).json({
                        ok: false,
                        error: 'content is required unless attachmentPending is true',
                    });
                }
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });

                // Announcement rooms: only room leaders post (everyone can read and react).
                if (isAnnounceOnly(gate.channel)) {
                    const leader = await resolveHuddleStartPermission({
                        supabase: supabaseAdmin,
                        channel: gate.channel,
                        userId: authUserId,
                        role: authRole,
                    });
                    if (!decideCanPost({ announceOnly: true, isRoomLeader: leader.canStart })) {
                        return res.status(403).json({ ok: false, code: 'announce_only', error: ANNOUNCE_ONLY_ERROR });
                    }
                }

                // Phase 4E.1 — never trust client AI identity on the human message path.
                if (isClientVaultAiSpoofAttempt(req.body)) {
                    return res.status(400).json({
                        ok: false,
                        error:
                            'Cannot set AI identity on chat messages; use the server ai-message path',
                    });
                }

                let parentId: string | null = null;
                const rawParent = String(req.body?.parent_id || req.body?.parentId || '').trim();
                if (rawParent) {
                    const { data: parent } = await supabaseAdmin
                        .from('chat_messages')
                        .select('id, channel_id, deleted_at')
                        .eq('id', rawParent)
                        .maybeSingle();
                    if (!parent || parent.channel_id !== cid || parent.deleted_at) {
                        return res.status(400).json({ ok: false, error: 'Invalid parent_id for this channel' });
                    }
                    parentId = parent.id;
                }

                const explicitMentions = Array.isArray(req.body?.mentionedUserIds)
                    ? req.body.mentionedUserIds
                    : Array.isArray(req.body?.mentioned_user_ids)
                      ? req.body.mentioned_user_ids
                      : [];

                // Human identity is always the authenticated user (never client display-name tricks).
                const humanDisplayName = sanitizeHumanChatDisplayName(authDisplayName);

                const insertRow: Record<string, any> = {
                    channel_id: cid,
                    content,
                    user_id: authUserId,
                    user_name: humanDisplayName,
                    parent_id: parentId,
                };

                const { data, error } = await supabaseAdmin
                    .from('chat_messages')
                    .insert(insertRow)
                    .select()
                    .single();
                if (error) throw error;
                await upsertChatReadStatus(supabaseAdmin, authUserId, cid);
                await recordMentionsAndNotify(
                    data.id,
                    gate.channel,
                    content,
                    parentId,
                    explicitMentions
                );
                // @everyone from a room leader alerts the whole room (even muted). Others: plain text.
                let everyoneAlert = false;
                if (mentionsEveryone(content) && normalizeVisibility(gate.channel) !== 'dm') {
                    const leader = await resolveHuddleStartPermission({
                        supabase: supabaseAdmin,
                        channel: gate.channel,
                        userId: authUserId,
                        role: authRole,
                    });
                    everyoneAlert = leader.canStart;
                }
                // Instant delivery + phone alerts run after the reply (sender isn't kept waiting).
                waitUntil(
                    Promise.all([
                        broadcastChatEvent(cid, 'message', { id: String(data.id) }),
                        alertChatMessage(supabaseAdmin, {
                            channel: gate.channel,
                            authorId: authUserId,
                            authorName: humanDisplayName,
                            content,
                            everyone: everyoneAlert,
                        }),
                    ])
                );
                const [enriched] = await enrichMessagesWithAvatars(supabaseAdmin, [data]);
                return res.status(200).json(enriched || data);
            }
            if (chatType === 'ai-message') {
                // Phase 4E.1 — server-controlled Vault AI insert (no client isAi / userName trust).
                const cid = String(req.body?.channelId || req.body?.channel_id || first(channelId) || '').trim();
                const content = String(req.body?.content || req.body?.text || '').trim();
                if (!cid) {
                    return res.status(400).json({ ok: false, error: 'channelId is required' });
                }
                if (!content) {
                    return res.status(400).json({ ok: false, error: 'content is required' });
                }
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });

                const insertRow = {
                    channel_id: cid,
                    content,
                    user_id: null,
                    user_name: 'Vault AI',
                    parent_id: null as string | null,
                };
                const { data, error } = await supabaseAdmin
                    .from('chat_messages')
                    .insert(insertRow)
                    .select()
                    .single();
                if (error) throw error;
                await upsertChatReadStatus(supabaseAdmin, authUserId, cid);
                const [enriched] = await enrichMessagesWithAvatars(supabaseAdmin, [data]);
                return res.status(200).json(enriched || data);
            }
            if (chatType === 'mark-read') {
                const cid = String(req.body?.channelId || first(channelId) || '').trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: 'Forbidden' });
                await upsertChatReadStatus(supabaseAdmin, authUserId, cid);
                // Senders' ✓✓ turn to "seen" right away.
                waitUntil(broadcastChatEvent(cid, 'read', { id: String(authUserId) }));
                return res.status(200).json({ ok: true });
            }
            if (chatType === 'edit-message') {
                // Author fixes their own text message (within 24 hours), like WhatsApp's Edit.
                const messageId = String(req.body?.messageId || req.body?.message_id || '').trim();
                const content = String(req.body?.content || '').trim();
                if (!messageId) return res.status(400).json({ ok: false, error: 'messageId is required' });
                if (!content) return res.status(400).json({ ok: false, error: 'The message can’t be empty.' });
                if (content.length > 4000) return res.status(400).json({ ok: false, error: 'That message is too long.' });
                const gate = await resolveMessageChannelAccess(messageId);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
                const edit = decideChatEdit({
                    authorId: gate.message.user_id,
                    userId: authUserId,
                    createdAt: gate.message.created_at,
                    deletedAt: gate.message.deleted_at,
                });
                if (edit.ok === false) return res.status(edit.status).json({ ok: false, error: edit.error });
                const { data, error } = await supabaseAdmin
                    .from('chat_messages')
                    .update({ content, edited_at: new Date().toISOString() })
                    .eq('id', messageId)
                    .select()
                    .single();
                if (error) throw error;
                waitUntil(broadcastChatEvent(String(gate.channel.id), 'message', { id: messageId }));
                const [enrichedEdit] = await enrichMessagesWithAvatars(supabaseAdmin, [data]);
                return res.status(200).json(enrichedEdit || data);
            }
            if (chatType === 'read-receipts') {
                // Who has read this room up to when (for ✓✓ / "Seen by"). Never includes yourself.
                const cid = String(req.body?.channelId || first(channelId) || '').trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: 'Forbidden' });
                const { data: rows } = await supabaseAdmin
                    .from('chat_read_status')
                    .select('user_id, last_read_at')
                    .eq('channel_id', cid)
                    .neq('user_id', authUserId)
                    .order('last_read_at', { ascending: false })
                    .limit(300);
                const ids = (rows || []).map((r: any) => r.user_id).filter(Boolean);
                const names = new Map<string, string>();
                if (ids.length) {
                    const { data: users } = await supabaseAdmin.from('users').select('id, name').in('id', ids);
                    for (const u of users || []) names.set(String((u as any).id), String((u as any).name || 'Member'));
                }
                return res.status(200).json({
                    ok: true,
                    readers: (rows || []).map((r: any) => ({
                        userId: String(r.user_id),
                        name: names.get(String(r.user_id)) || 'Member',
                        lastReadAt: r.last_read_at,
                    })),
                });
            }
            if (chatType === 'reactions') {
                const messageId = String(req.body?.messageId || req.body?.message_id || '').trim();
                const emoji = String(req.body?.emoji || '').trim().slice(0, 32);
                if (!messageId || !emoji) {
                    return res.status(400).json({ ok: false, error: 'messageId and emoji are required' });
                }
                const gate = await resolveMessageChannelAccess(messageId);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
                if (gate.message.deleted_at) {
                    return res.status(400).json({ ok: false, error: 'Cannot react to a deleted message' });
                }
                const { data, error } = await supabaseAdmin
                    .from('chat_message_reactions')
                    .upsert(
                        { message_id: messageId, user_id: authUserId, emoji },
                        { onConflict: 'message_id,user_id,emoji' }
                    )
                    .select()
                    .single();
                if (error) throw error;
                waitUntil(broadcastChatEvent(String(gate.channel.id), 'message', { id: messageId }));
                return res.status(200).json(data);
            }
            if (chatType === 'attachments') {
                const messageId = String(req.body?.messageId || req.body?.message_id || '').trim();
                const filename = String(req.body?.filename || req.body?.original_filename || 'file').trim();
                const mimeType = String(req.body?.mimeType || req.body?.mime_type || '').toLowerCase().trim();
                const raw = String(req.body?.fileBase64 || req.body?.data || '');
                if (!messageId || !raw || !mimeType) {
                    return res.status(400).json({ ok: false, error: 'messageId, mimeType, and fileBase64 are required' });
                }
                if (!COMMUNITY_ALLOWED_MIME.has(mimeType)) {
                    return res.status(400).json({ ok: false, error: 'File type not allowed' });
                }
                if (COMMUNITY_BLOCKED_EXT.test(filename)) {
                    return res.status(400).json({ ok: false, error: 'Executable uploads are not allowed' });
                }
                const gate = await resolveMessageChannelAccess(messageId);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
                if (gate.message.user_id && gate.message.user_id !== authUserId) {
                    return res.status(403).json({ ok: false, error: 'Only the message author may attach files' });
                }

                const match = raw.match(/^data:([^;]+);base64,(.+)$/);
                const base64 = match?.[2] || raw.replace(/^data:[^;]+;base64,/, '');
                const buffer = Buffer.from(base64, 'base64');
                if (!buffer.length) return res.status(400).json({ ok: false, error: 'Invalid file data' });
                if (buffer.length > COMMUNITY_MAX_ATTACHMENT_BYTES) {
                    return res.status(400).json({ ok: false, error: 'File too large (max 10MB)' });
                }

                const extFromName = filename.includes('.') ? filename.split('.').pop() : '';
                const safeExt = (extFromName || mimeType.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8);
                const storagePath = `${gate.channel.id}/${messageId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;
                const { error: uploadError } = await supabaseAdmin.storage
                    .from('community-files')
                    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
                if (uploadError) {
                    console.error('[community attachment]', uploadError);
                    return res.status(500).json({ ok: false, error: 'Upload failed' });
                }

                const kind = mimeType.startsWith('image/') ? 'image' : 'file';
                const { data: att, error: attErr } = await supabaseAdmin
                    .from('chat_attachments')
                    .insert({
                        message_id: messageId,
                        storage_path: storagePath,
                        original_filename: filename.slice(0, 255),
                        mime_type: mimeType,
                        size_bytes: buffer.length,
                        kind,
                    })
                    .select()
                    .single();
                if (attErr) throw attErr;

                const { data: signed } = await supabaseAdmin.storage
                    .from('community-files')
                    .createSignedUrl(storagePath, 60 * 60);
                return res.status(200).json({ ...att, signed_url: signed?.signedUrl || null });
            }
            if (chatType === 'attachment-upload-url' || chatType === 'attachment-confirm') {
                // Direct-to-storage uploads (photos, voice notes, videos, documents up to 25 MB).
                const messageId = String(req.body?.messageId || req.body?.message_id || '').trim();
                if (!messageId) return res.status(400).json({ ok: false, error: 'messageId is required' });
                const gate = await resolveMessageChannelAccess(messageId);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
                if (!gate.message.user_id || gate.message.user_id !== authUserId) {
                    return res.status(403).json({ ok: false, error: 'Only the message author may attach files' });
                }
                const channelIdForMsg = String(gate.channel.id);

                if (chatType === 'attachment-upload-url') {
                    const plan = planChatAttachmentUpload({
                        channelId: channelIdForMsg,
                        messageId,
                        filename: req.body?.filename,
                        mimeType: req.body?.mimeType,
                        sizeBytes: req.body?.sizeBytes,
                    });
                    if (plan.ok === false) return res.status(plan.status).json({ ok: false, error: plan.error });
                    try {
                        const up = await createChatUploadUrl(supabaseAdmin.storage as any, plan.storagePath);
                        return res.status(200).json({
                            ok: true,
                            bucket: CHAT_MEDIA_BUCKET,
                            storagePath: up.path,
                            uploadToken: up.token,
                            uploadUrl: up.signedUrl,
                            mimeType: plan.mime,
                        });
                    } catch (e: any) {
                        console.error('[attachment-upload-url]', e?.message || e);
                        return res.status(500).json({ ok: false, error: 'Could not start the upload. Please try again.' });
                    }
                }

                // attachment-confirm
                const storagePath = String(req.body?.storagePath || '').trim();
                if (!storagePathBelongsToMessage(storagePath, channelIdForMsg, messageId)) {
                    return res.status(400).json({ ok: false, error: 'That upload does not belong to this message' });
                }
                const { data: existing } = await supabaseAdmin
                    .from('chat_attachments')
                    .select('*')
                    .eq('message_id', messageId)
                    .eq('storage_path', storagePath)
                    .maybeSingle();
                let att = existing;
                if (!att) {
                    const stat = await statChatUpload(supabaseAdmin.storage as any, storagePath);
                    if (!stat) return res.status(400).json({ ok: false, error: 'Upload not found. Please try again.' });
                    const mime = normalizeChatMime(req.body?.mimeType) || stat.mime;
                    if (
                        !CHAT_MEDIA_ALLOWED_MIME.has(mime) ||
                        stat.size <= 0 ||
                        stat.size > CHAT_MEDIA_MAX_BYTES
                    ) {
                        await supabaseAdmin.storage.from(CHAT_MEDIA_BUCKET).remove([storagePath]);
                        return res.status(400).json({ ok: false, error: 'That file can’t be sent in chat.' });
                    }
                    const { data: inserted, error: insErr } = await supabaseAdmin
                        .from('chat_attachments')
                        .insert({
                            message_id: messageId,
                            storage_path: storagePath,
                            original_filename: cleanChatFilename(req.body?.filename),
                            mime_type: mime,
                            size_bytes: stat.size,
                            kind: chatAttachmentKind(mime),
                        })
                        .select()
                        .single();
                    if (insErr) throw insErr;
                    att = inserted;
                }
                const { data: signedRead } = await supabaseAdmin.storage
                    .from(CHAT_MEDIA_BUCKET)
                    .createSignedUrl(storagePath, 60 * 60);
                waitUntil(broadcastChatEvent(channelIdForMsg, 'message', { id: messageId }));
                return res.status(200).json({ ok: true, attachment: { ...att, signed_url: signedRead?.signedUrl || null } });
            }
            if (chatType === 'delete-message') {
                const messageId = String(req.body?.messageId || req.body?.message_id || '').trim();
                if (!messageId) return res.status(400).json({ ok: false, error: 'messageId is required' });
                const gate = await resolveMessageChannelAccess(messageId);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
                if (gate.message.user_id !== authUserId && !CHAT_CHANNEL_CREATE_ROLES.has(authRole)) {
                    return res.status(403).json({ ok: false, error: 'Forbidden: cannot delete this message' });
                }
                const { data, error } = await supabaseAdmin
                    .from('chat_messages')
                    .update({ deleted_at: new Date().toISOString() })
                    .eq('id', messageId)
                    .select()
                    .single();
                if (error) throw error;
                waitUntil(broadcastChatEvent(String(gate.channel.id), 'deleted', { id: messageId }));
                return res.status(200).json({ ok: true, message: data });
            }
            if (chatType === 'sync-memberships') {
                if (!CHAT_CHANNEL_CREATE_ROLES.has(authRole)) {
                    return res.status(403).json({ ok: false, error: 'Forbidden' });
                }
                const scope = String(req.body?.scope || 'self');
                const result =
                    scope === 'all'
                        ? await syncAllRoomMemberships(supabaseAdmin)
                        : await syncRoomMembershipsForUser(supabaseAdmin, authUserId);
                return res.status(200).json({ ok: true, ...result });
            }
            if (chatType === 'voice-token') {
                // Never trust client userId/role — identity from requireAuth only.
                const cid = String(
                    req.body?.channelId || req.body?.channel_id || first(channelId) || ''
                ).trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) {
                    return res.status(gate.status).json({ ok: false, error: gate.error });
                }

                const { data: membership } = await supabaseAdmin
                    .from('chat_room_members')
                    .select('role')
                    .eq('channel_id', cid)
                    .eq('user_id', authUserId)
                    .maybeSingle();
                const isMod =
                    String(membership?.role || '').toLowerCase() === 'moderator';
                const isCreator =
                    String(gate.channel.created_by || '') === String(authUserId);
                const voiceDecision = decideVoiceHuddleAccess({
                    canAccessChannel: true,
                    visibility: normalizeVisibility(gate.channel),
                    isChannelModerator: isMod,
                    isChannelCreator: isCreator,
                    isBroadAdmin: isBroadChatAdmin(authRole),
                    allowDm: normalizeVisibility(gate.channel) === 'dm',
                });
                if (voiceDecision.ok === false) {
                    return res
                        .status(voiceDecision.status)
                        .json({ ok: false, error: voiceDecision.error });
                }

                const lk = getLiveKitServerConfig();
                if (!lk) {
                    return res.status(503).json({
                        ok: false,
                        error: 'Voice huddles are not configured yet',
                        configured: false,
                    });
                }

                // Prefer vault display name; never use client-supplied identity.
                let displayName = authDisplayName;
                const { data: profile } = await supabaseAdmin
                    .from('users')
                    .select('name')
                    .eq('id', authUserId)
                    .maybeSingle();
                if (profile?.name) displayName = String(profile.name).trim() || displayName;

                // Start vs join: only leaders / room moderators may open an empty huddle.
                // Checked BEFORE ensureVoiceRoom so an empty room never counts as live.
                const startPerm = await resolveHuddleStartPermission({
                    supabase: supabaseAdmin,
                    channel: gate.channel,
                    userId: authUserId,
                    role: authRole,
                    membershipRole: membership?.role ?? null,
                });
                const entry = decideHuddleEntry({
                    isLive: await readHuddleIsLive(cid),
                    canStart: startPerm.canStart,
                });
                if (entry.ok === false) {
                    if (entry.code === HUDDLE_START_FORBIDDEN_CODE) {
                        await logHuddleAudit({
                            action: 'Live Huddle start denied',
                            userId: authUserId,
                            channelId: cid,
                            details: { role: authRole, line: 'livekit' },
                            req,
                        });
                    }
                    return res
                        .status(entry.status)
                        .json({ ok: false, code: entry.code, error: entry.error, canStart: false });
                }

                try {
                    // Ensure room has a long emptyTimeout BEFORE anyone connects.
                    // Client-auto-created rooms often use emptyTimeout=0 and get deleted
                    // when a second participant joins (brief ICE blip → everyone kicked).
                    await ensureVoiceRoom(lk, cid);

                    // Session co-host / host from LiveKit room metadata (rejoin keeps canModerate).
                    // First joiner claims host when empty (huddle starter → Play Music + session mod).
                    let session = await resolveVoiceCanModerate(
                        lk,
                        cid,
                        authUserId,
                        voiceDecision.canModerate
                    );
                    if (!session.roles.hostId) {
                        const claimed = await applyVoiceHuddleModAction(lk, {
                            channelId: cid,
                            actorId: authUserId,
                            action: 'claim',
                            channelCanModerate: voiceDecision.canModerate,
                        });
                        if (claimed.ok) {
                            session = {
                                canModerate: claimed.canModerate,
                                roles: claimed.roles,
                            };
                        }
                    }
                    const canModerate = session.canModerate;
                    // Only session host/co-host need LiveKit roomAdmin. Channel mods still
                    // moderate via our APIs (mute/end) without displacing the active host.
                    const roomAdmin = isHuddleSessionModerator(session.roles, authUserId);

                    const minted = await mintLiveKitAccessToken(lk, {
                        userId: authUserId,
                        displayName,
                        channelId: cid,
                        canModerate,
                        roomAdmin,
                    });
                    if (entry.mode === 'start') {
                        await logHuddleAudit({
                            action: 'Live Huddle started',
                            userId: authUserId,
                            channelId: cid,
                            details: { role: authRole, reason: startPerm.reason, line: 'livekit' },
                            req,
                        });
                    }
                    return res.status(200).json({
                        ok: true,
                        token: minted.token,
                        url: minted.url,
                        roomName: minted.roomName,
                        expiresIn: minted.expiresIn,
                        canModerate,
                        canStart: startPerm.canStart,
                        channelCanModerate: voiceDecision.canModerate,
                        hostId: session.roles.hostId,
                        coHostIds: session.roles.coHostIds,
                        channelId: cid,
                        channelName: gate.channel.name || 'Channel',
                        fallbackPass: signHuddleFallbackPass(
                            {
                                userId: authUserId,
                                channelId: cid,
                                displayName,
                                canModerate,
                                channelCanModerate: voiceDecision.canModerate,
                                canStart: startPerm.canStart,
                            },
                            lk.apiSecret
                        ),
                    });
                } catch (e: any) {
                    console.warn('[voice-token]', e);
                    return res.status(500).json({
                        ok: false,
                        error: 'Could not issue voice huddle token',
                    });
                }
            }
            if (chatType === 'room-archive') {
                const cid = String(req.body?.channelId || '').trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
                const result = await setChatArchived(supabaseAdmin, authUserId, cid, req.body?.archived === true);
                if (result.ok === false) return res.status(503).json({ ok: false, error: result.error });
                return res.status(200).json({ ok: true, channelId: cid, archived: req.body?.archived === true });
            }
            if (chatType === 'pin') {
                const messageId = String(req.body?.messageId || '').trim();
                if (!messageId) return res.status(400).json({ ok: false, error: 'messageId is required' });
                const gate = await resolveMessageChannelAccess(messageId);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
                if (gate.message.deleted_at) return res.status(400).json({ ok: false, error: 'That message was removed.' });
                const leader = await resolveHuddleStartPermission({
                    supabase: supabaseAdmin,
                    channel: gate.channel,
                    userId: authUserId,
                    role: authRole,
                });
                if (!leader.canStart) {
                    return res.status(403).json({ ok: false, error: 'Only leaders of this room can pin messages.' });
                }
                const cidPin = String(gate.channel.id);
                const result = await setMessagePinned(supabaseAdmin, {
                    channelId: cidPin,
                    messageId,
                    userId: authUserId,
                    pinned: req.body?.pinned === true,
                });
                if (result.ok === false) return res.status(result.status).json({ ok: false, error: result.error });
                waitUntil(broadcastChatEvent(cidPin, 'message', { id: messageId }));
                return res.status(200).json({ ok: true, pinned: await listPinnedMessages(supabaseAdmin, cidPin) });
            }
            if (chatType === 'room-settings') {
                // Group admins: rename, describe, turn "only leaders can post" on/off.
                const cid = String(req.body?.channelId || '').trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
                const mayManage =
                    normalizeVisibility(gate.channel) !== 'dm' &&
                    (await canManageChannelMembers(supabaseAdmin, gate.channel, authUserId, authRole));
                if (!mayManage) return res.status(403).json({ ok: false, error: 'Only this group’s admins can change its settings.' });
                const patch: Record<string, unknown> = {};
                if (typeof req.body?.announceOnly === 'boolean') patch.announce_only = req.body.announceOnly;
                if (typeof req.body?.name === 'string') {
                    const name = req.body.name.trim().slice(0, 80);
                    if (!name) return res.status(400).json({ ok: false, error: 'The group needs a name.' });
                    patch.name = name;
                }
                if (typeof req.body?.description === 'string') patch.description = req.body.description.trim().slice(0, 300) || null;
                if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'Nothing to change.' });
                const { data, error } = await supabaseAdmin.from('chat_channels').update(patch).eq('id', cid).select().single();
                if (error) {
                    return res.status(/announce_only/.test(error.message) ? 503 : 500).json({
                        ok: false,
                        error: /announce_only/.test(error.message)
                            ? 'Run supabase/migrations/chat_groups_announce_pins.sql in the Supabase SQL editor first.'
                            : 'Could not save the group settings.',
                    });
                }
                const logAudit = await getAudit();
                await logAudit({
                    userId: authUserId,
                    action: 'Chat group settings changed',
                    details: { fields: Object.keys(patch), announceOnly: patch.announce_only },
                    resourceType: 'chat_channel',
                    resourceId: cid,
                    req,
                });
                return res.status(200).json({ ok: true, channel: data });
            }
            if (chatType === 'search') {
                // Search messages in one room, or in every room you can open (not DMs).
                const q = cleanSearchQuery(req.body?.q);
                if (!q) return res.status(200).json({ ok: true, results: [] });
                const cid = String(req.body?.channelId || '').trim();
                let rooms: Array<{ id: string; name: string | null }> = [];
                if (cid) {
                    const channel = await fetchChannel(supabaseAdmin, cid);
                    const gate = await assertChannelAccess(channel);
                    if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
                    rooms = [{ id: cid, name: gate.channel.name || null }];
                } else {
                    const list = await listAccessibleChannels(supabaseAdmin, authUserId, authRole);
                    rooms = list.map((c: any) => ({ id: String(c.id), name: c.name || null }));
                }
                const names = new Map(rooms.map((r) => [r.id, r.name]));
                const hits = await searchMessages(supabaseAdmin, rooms.map((r) => r.id), q);
                return res.status(200).json({
                    ok: true,
                    results: hits.map((h) => ({
                        id: h.id,
                        channelId: h.channel_id,
                        channelName: names.get(h.channel_id) || null,
                        content: h.content,
                        authorName: h.user_name,
                        createdAt: h.created_at,
                    })),
                });
            }
            if (chatType === 'room-info' || chatType === 'room-mute') {
                // PLCC Chat: live-update topic, Start-button hint and mute switch for one room.
                const cid = String(req.body?.channelId || req.body?.channel_id || first(channelId) || '').trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
                if (chatType === 'room-mute') {
                    const result = await setRoomMuted(supabaseAdmin, cid, authUserId, req.body?.muted === true);
                    if (result.ok === false) return res.status(503).json({ ok: false, error: result.error });
                    return res.status(200).json({ ok: true, channelId: cid, muted: req.body?.muted === true });
                }
                const perm = await resolveHuddleStartPermission({
                    supabase: supabaseAdmin,
                    channel: gate.channel,
                    userId: authUserId,
                    role: authRole,
                });
                const announceOnly = isAnnounceOnly(gate.channel);
                const canManage =
                    normalizeVisibility(gate.channel) !== 'dm' &&
                    (await canManageChannelMembers(supabaseAdmin, gate.channel, authUserId, authRole));
                const pinned = await listPinnedMessages(supabaseAdmin, cid);
                return res.status(200).json({
                    ok: true,
                    channelId: cid,
                    visibility: normalizeVisibility(gate.channel),
                    description:
                        normalizeVisibility(gate.channel) === 'dm' ? null : String(gate.channel.description || '') || null,
                    announceOnly,
                    canPost: decideCanPost({ announceOnly, isRoomLeader: perm.canStart }),
                    // Room leaders pin; in a DM either person can.
                    canPin: perm.canStart,
                    canManage,
                    pinned: pinned.map((p) => ({
                        id: p.id,
                        content: p.content,
                        authorName: p.user_name,
                        pinnedAt: p.pinned_at,
                        createdAt: p.created_at,
                    })),
                    topic: chatRealtimeTopic(cid) || null,
                    // Room title for direct links (DMs show the other person, so no raw DM_ name).
                    name: normalizeVisibility(gate.channel) === 'dm' ? null : String(gate.channel.name || '') || null,
                    canStart: perm.canStart,
                    muted: await isRoomMuted(supabaseAdmin, cid, authUserId),
                });
            }
            if (chatType === 'voice-huddle-can-start') {
                // UI hint only (hide Start for members). voice-token still enforces the rule.
                const cid = String(
                    req.body?.channelId || req.body?.channel_id || first(channelId) || ''
                ).trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) {
                    return res.status(gate.status).json({ ok: false, error: gate.error });
                }
                const perm = await resolveHuddleStartPermission({
                    supabase: supabaseAdmin,
                    channel: gate.channel,
                    userId: authUserId,
                    role: authRole,
                });
                return res.status(200).json({ ok: true, channelId: cid, canStart: perm.canStart });
            }
            if (chatType === 'voice-huddle-provider' || chatType === 'voice-daily-token') {
                const cid = String(
                    req.body?.channelId || req.body?.channel_id || first(channelId) || ''
                ).trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) {
                    return res.status(gate.status).json({ ok: false, error: gate.error });
                }
                let displayName = authDisplayName;
                const { data: profile } = await supabaseAdmin
                    .from('users')
                    .select('name')
                    .eq('id', authUserId)
                    .maybeSingle();
                if (profile?.name) displayName = String(profile.name).trim() || displayName;

                if (chatType === 'voice-huddle-provider' && !req.body?.provider) {
                    try {
                        const resolved = await resolveHuddleProvider(supabaseAdmin, cid);
                        return res.status(200).json({ ok: true, ...resolved, channelId: cid });
                    } catch (e: any) {
                        console.warn('[voice-huddle-provider]', e);
                        return res.status(500).json({ ok: false, error: 'Could not read the huddle line.' });
                    }
                }

                const requested = String(req.body?.provider || (chatType === 'voice-daily-token' ? 'daily' : ''))
                    .trim()
                    .toLowerCase();
                if (requested !== 'livekit' && requested !== 'daily') {
                    return res.status(400).json({ ok: false, error: 'Choose a huddle line.' });
                }
                if (chatType === 'voice-daily-token' && !getDailyApiKey()) {
                    return res.status(503).json({
                        ok: false,
                        error: 'Backup huddle audio is not configured yet.',
                        configured: false,
                    });
                }
                // Claiming a line / opening Daily on an empty room is a start — same rule as voice-token.
                const lineStartPerm = await resolveHuddleStartPermission({
                    supabase: supabaseAdmin,
                    channel: gate.channel,
                    userId: authUserId,
                    role: authRole,
                });
                const lineEntry = decideHuddleEntry({
                    isLive: await readHuddleIsLive(cid),
                    canStart: lineStartPerm.canStart,
                });
                if (lineEntry.ok === false) {
                    if (lineEntry.code === HUDDLE_START_FORBIDDEN_CODE) {
                        await logHuddleAudit({
                            action: 'Live Huddle start denied',
                            userId: authUserId,
                            channelId: cid,
                            details: { role: authRole, line: requested },
                            req,
                        });
                    }
                    return res
                        .status(lineEntry.status)
                        .json({ ok: false, code: lineEntry.code, error: lineEntry.error, canStart: false });
                }
                try {
                    const claimed = await claimHuddleProvider(supabaseAdmin, cid, requested);
                    if (!claimed.ok) {
                        return res.status(claimed.status).json({
                            ok: false,
                            error: claimed.error,
                            provider: claimed.provider,
                            occupied: claimed.occupied || false,
                        });
                    }
                    if (chatType === 'voice-huddle-provider') {
                        return res.status(200).json({ ok: true, provider: claimed.provider, channelId: cid });
                    }
                    const apiKey = getDailyApiKey();
                    if (!apiKey) {
                        return res.status(503).json({
                            ok: false,
                            error: 'Backup huddle audio is not configured yet.',
                            configured: false,
                        });
                    }
                    const minted = await mintDailyMeetingToken(apiKey, cid, displayName);
                    if (lineEntry.mode === 'start') {
                        await logHuddleAudit({
                            action: 'Live Huddle started',
                            userId: authUserId,
                            channelId: cid,
                            details: { role: authRole, reason: lineStartPerm.reason, line: 'daily' },
                            req,
                        });
                    }
                    return res.status(200).json({
                        ok: true,
                        provider: 'daily',
                        token: minted.token,
                        url: minted.url,
                        roomName: minted.roomName,
                        expiresIn: minted.expiresIn,
                        channelId: cid,
                    });
                } catch (e: any) {
                    if (e instanceof DailyApiError || e?.name === 'DailyApiError') {
                        console.warn('[voice-daily-token]', e.detail || e.message);
                        return res.status(502).json({
                            ok: false,
                            error: 'Backup huddle audio is unavailable right now.',
                        });
                    }
                    console.warn('[voice-daily-token]', e?.message || 'Could not open backup huddle audio.');
                    return res.status(500).json({
                        ok: false,
                        error: 'Could not open backup huddle audio.',
                    });
                }
            }
            if (chatType === 'voice-huddle-end') {
                const cid = String(
                    req.body?.channelId || req.body?.channel_id || first(channelId) || ''
                ).trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) {
                    return res.status(gate.status).json({ ok: false, error: gate.error });
                }
                const { data: membership } = await supabaseAdmin
                    .from('chat_room_members')
                    .select('role')
                    .eq('channel_id', cid)
                    .eq('user_id', authUserId)
                    .maybeSingle();
                const isMod =
                    String(membership?.role || '').toLowerCase() === 'moderator';
                const isCreator =
                    String(gate.channel.created_by || '') === String(authUserId);
                const voiceDecision = decideVoiceHuddleAccess({
                    canAccessChannel: true,
                    visibility: normalizeVisibility(gate.channel),
                    isChannelModerator: isMod,
                    isChannelCreator: isCreator,
                    isBroadAdmin: isBroadChatAdmin(authRole),
                    allowDm: normalizeVisibility(gate.channel) === 'dm',
                });
                if (voiceDecision.ok === false) {
                    return res
                        .status(voiceDecision.status)
                        .json({ ok: false, error: voiceDecision.error });
                }
                const lk = getLiveKitServerConfig();
                if (!lk) {
                    return res.status(503).json({
                        ok: false,
                        error: 'Voice huddles are not configured yet',
                    });
                }
                const session = await resolveVoiceCanModerate(
                    lk,
                    cid,
                    authUserId,
                    voiceDecision.canModerate
                );
                if (!session.canModerate) {
                    await logHuddleAudit({
                        action: 'Live Huddle end denied',
                        userId: authUserId,
                        channelId: cid,
                        details: { role: authRole },
                        req,
                    });
                    return res.status(403).json({
                        ok: false,
                        error: 'Only moderators can end the voice huddle for everyone',
                    });
                }
                try {
                    const result = await endVoiceRoom(lk, cid);
                    await logHuddleAudit({
                        action: 'Live Huddle ended for everyone',
                        userId: authUserId,
                        channelId: cid,
                        details: { role: authRole },
                        req,
                    });
                    return res.status(200).json({ ok: true, ...result });
                } catch (e: any) {
                    console.warn('[voice-huddle-end]', e);
                    return res.status(500).json({ ok: false, error: 'Could not end voice huddle' });
                }
            }
            if (chatType === 'voice-hand-lower') {
                const cid = String(
                    req.body?.channelId || req.body?.channel_id || first(channelId) || ''
                ).trim();
                const targetIdentity = String(
                    req.body?.targetIdentity || req.body?.userId || req.body?.user_id || ''
                ).trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                if (!targetIdentity) {
                    return res.status(400).json({ ok: false, error: 'targetIdentity is required' });
                }
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) {
                    return res.status(gate.status).json({ ok: false, error: gate.error });
                }
                const { data: membership } = await supabaseAdmin
                    .from('chat_room_members')
                    .select('role')
                    .eq('channel_id', cid)
                    .eq('user_id', authUserId)
                    .maybeSingle();
                const isMod =
                    String(membership?.role || '').toLowerCase() === 'moderator';
                const isCreator =
                    String(gate.channel.created_by || '') === String(authUserId);
                const voiceDecision = decideVoiceHuddleAccess({
                    canAccessChannel: true,
                    visibility: normalizeVisibility(gate.channel),
                    isChannelModerator: isMod,
                    isChannelCreator: isCreator,
                    isBroadAdmin: isBroadChatAdmin(authRole),
                    allowDm: normalizeVisibility(gate.channel) === 'dm',
                });
                if (voiceDecision.ok === false) {
                    return res
                        .status(voiceDecision.status)
                        .json({ ok: false, error: voiceDecision.error });
                }
                const lk = getLiveKitServerConfig();
                if (!lk) {
                    return res.status(503).json({
                        ok: false,
                        error: 'Voice huddles are not configured yet',
                    });
                }
                const session = await resolveVoiceCanModerate(
                    lk,
                    cid,
                    authUserId,
                    voiceDecision.canModerate
                );
                if (!session.canModerate) {
                    return res.status(403).json({
                        ok: false,
                        error: 'Only moderators can lower another participant’s hand',
                    });
                }
                try {
                    const result = await clearParticipantHandRaise(lk, cid, targetIdentity);
                    return res.status(200).json({ ok: true, ...result });
                } catch (e: any) {
                    console.warn('[voice-hand-lower]', e);
                    return res.status(500).json({
                        ok: false,
                        error: 'Could not lower participant hand',
                    });
                }
            }
            if (chatType === 'voice-huddle-mod') {
                // Session-only add/pass co-host (LiveKit room metadata — not chat_room_members).
                const cid = String(
                    req.body?.channelId || req.body?.channel_id || first(channelId) || ''
                ).trim();
                const targetUserId = String(
                    req.body?.targetUserId ||
                        req.body?.targetIdentity ||
                        req.body?.userId ||
                        req.body?.user_id ||
                        ''
                ).trim();
                const action = parseHuddleModAction(req.body?.action);
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                if (!action || (action !== 'add' && action !== 'pass')) {
                    return res.status(400).json({
                        ok: false,
                        error: "action must be 'add' or 'pass'",
                    });
                }
                if (!targetUserId) {
                    return res.status(400).json({ ok: false, error: 'targetUserId is required' });
                }
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) {
                    return res.status(gate.status).json({ ok: false, error: gate.error });
                }
                const { data: membership } = await supabaseAdmin
                    .from('chat_room_members')
                    .select('role')
                    .eq('channel_id', cid)
                    .eq('user_id', authUserId)
                    .maybeSingle();
                const isMod =
                    String(membership?.role || '').toLowerCase() === 'moderator';
                const isCreator =
                    String(gate.channel.created_by || '') === String(authUserId);
                const voiceDecision = decideVoiceHuddleAccess({
                    canAccessChannel: true,
                    visibility: normalizeVisibility(gate.channel),
                    isChannelModerator: isMod,
                    isChannelCreator: isCreator,
                    isBroadAdmin: isBroadChatAdmin(authRole),
                    allowDm: normalizeVisibility(gate.channel) === 'dm',
                });
                if (voiceDecision.ok === false) {
                    return res
                        .status(voiceDecision.status)
                        .json({ ok: false, error: voiceDecision.error });
                }
                const lk = getLiveKitServerConfig();
                if (!lk) {
                    return res.status(503).json({
                        ok: false,
                        error: 'Voice huddles are not configured yet',
                    });
                }
                try {
                    const result = await applyVoiceHuddleModAction(lk, {
                        channelId: cid,
                        actorId: authUserId,
                        targetUserId,
                        action,
                        channelCanModerate: voiceDecision.canModerate,
                    });
                    if (result.ok === false) {
                        return res.status(result.status).json({ ok: false, error: result.error });
                    }
                    return res.status(200).json({
                        ok: true,
                        action,
                        hostId: result.roles.hostId,
                        coHostIds: result.roles.coHostIds,
                        canModerate: result.canModerate,
                    });
                } catch (e: any) {
                    console.warn('[voice-huddle-mod]', e);
                    return res.status(500).json({
                        ok: false,
                        error: 'Could not update huddle moderator',
                    });
                }
            }
            if (chatType === 'voice-participant-mute') {
                // Phase 4E.1 — server-mediated microphone mute (LiveKit RoomService).
                const cid = String(
                    req.body?.channelId || req.body?.channel_id || first(channelId) || ''
                ).trim();
                const targetIdentity = String(
                    req.body?.targetIdentity || req.body?.userId || req.body?.user_id || ''
                ).trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                if (!targetIdentity) {
                    return res.status(400).json({ ok: false, error: 'targetIdentity is required' });
                }
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) {
                    return res.status(gate.status).json({ ok: false, error: gate.error });
                }
                const { data: membership } = await supabaseAdmin
                    .from('chat_room_members')
                    .select('role')
                    .eq('channel_id', cid)
                    .eq('user_id', authUserId)
                    .maybeSingle();
                const isMod =
                    String(membership?.role || '').toLowerCase() === 'moderator';
                const isCreator =
                    String(gate.channel.created_by || '') === String(authUserId);
                const voiceDecision = decideVoiceHuddleAccess({
                    canAccessChannel: true,
                    visibility: normalizeVisibility(gate.channel),
                    isChannelModerator: isMod,
                    isChannelCreator: isCreator,
                    isBroadAdmin: isBroadChatAdmin(authRole),
                    allowDm: normalizeVisibility(gate.channel) === 'dm',
                });
                if (voiceDecision.ok === false) {
                    return res
                        .status(voiceDecision.status)
                        .json({ ok: false, error: voiceDecision.error });
                }
                const lk = getLiveKitServerConfig();
                if (!lk) {
                    return res.status(503).json({
                        ok: false,
                        error: 'Voice huddles are not configured yet',
                    });
                }
                const session = await resolveVoiceCanModerate(
                    lk,
                    cid,
                    authUserId,
                    voiceDecision.canModerate
                );
                if (!session.canModerate) {
                    return res.status(403).json({
                        ok: false,
                        error: 'Only moderators can mute another participant',
                    });
                }
                try {
                    const wantMuted = req.body?.muted !== false && req.body?.unmute !== true;
                    const result = await muteParticipantMicrophoneTracks(
                        lk,
                        cid,
                        targetIdentity,
                        wantMuted
                    );
                    if (!result.participantFound) {
                        return res.status(404).json({
                            ok: false,
                            error: 'Participant is not in the active huddle',
                            ...result,
                        });
                    }
                    return res.status(200).json({ ok: true, ...result });
                } catch (e: any) {
                    console.warn('[voice-participant-mute]', e);
                    return res.status(500).json({
                        ok: false,
                        error: 'Could not mute participant',
                    });
                }
            }
            if (chatType === 'voice-mic-restore') {
                const cid = String(
                    req.body?.channelId || req.body?.channel_id || first(channelId) || ''
                ).trim();
                const targetIdentity = String(
                    req.body?.targetIdentity || req.body?.userId || authUserId || ''
                ).trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                if (!microphoneRestoreIsSelf(authUserId, targetIdentity)) {
                    return res.status(403).json({
                        ok: false,
                        error: 'You can only restore your own microphone',
                    });
                }
                const channel = await fetchChannel(supabaseAdmin, cid);
                const gate = await assertChannelAccess(channel);
                if (gate.ok === false) {
                    return res.status(gate.status).json({ ok: false, error: gate.error });
                }
                const lk = getLiveKitServerConfig();
                if (!lk) {
                    return res.status(503).json({
                        ok: false,
                        error: 'Voice huddles are not configured yet',
                    });
                }
                try {
                    const result = await restoreOwnMicrophonePublish(lk, cid, authUserId);
                    if (!result.participantFound) {
                        return res.status(404).json({
                            ok: false,
                            error: 'You are not in the active huddle',
                            ...result,
                        });
                    }
                    return res.status(200).json({ ok: true, ...result });
                } catch (e: any) {
                    console.warn('[voice-mic-restore]', e);
                    return res.status(500).json({
                        ok: false,
                        error: 'Could not restore your microphone',
                    });
                }
            }
        }
        if (req.method === 'PATCH') {
            if (chatType === 'channels') {
                const cid = String(
                    first(channelId) ||
                        req.query.channelId ||
                        req.body?.channelId ||
                        req.body?.channel_id ||
                        req.body?.id ||
                        ''
                ).trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                if (!channel) return res.status(404).json({ ok: false, error: 'Channel not found' });
                const mayManage = await canManageChannelMembers(
                    supabaseAdmin,
                    channel,
                    authUserId,
                    authRole
                );
                const isCreator =
                    String((channel as any)?.created_by || '') === String(authUserId);
                if (!mayManage && !isCreator && !canCreateCommunityChannels(authRole)) {
                    return res.status(403).json({
                        ok: false,
                        error: 'Forbidden: cannot update this channel',
                    });
                }

                const patch: Record<string, unknown> = {};
                if (
                    req.body?.share_image_url !== undefined ||
                    req.body?.shareImageUrl !== undefined
                ) {
                    const raw = req.body?.share_image_url ?? req.body?.shareImageUrl;
                    if (raw === null || raw === '') {
                        patch.share_image_url = null;
                    } else {
                        const url = String(raw || '').trim().slice(0, 2000);
                        if (
                            !url ||
                            (!/^https:\/\//i.test(url) && !url.startsWith('/'))
                        ) {
                            return res.status(400).json({
                                ok: false,
                                error: 'share_image_url must be an https:// or site-relative URL',
                            });
                        }
                        if (/^(javascript|data|vbscript):/i.test(url)) {
                            return res.status(400).json({
                                ok: false,
                                error: 'Invalid share_image_url',
                            });
                        }
                        patch.share_image_url = url;
                    }
                }

                if (Object.keys(patch).length === 0) {
                    return res.status(400).json({ ok: false, error: 'No updates provided' });
                }

                const { data, error } = await supabaseAdmin
                    .from('chat_channels')
                    .update(patch)
                    .eq('id', cid)
                    .select('*')
                    .maybeSingle();
                if (error) {
                    console.error('[chat channels PATCH]', error.message);
                    if (/share_image_url/i.test(error.message)) {
                        return res.status(503).json({
                            ok: false,
                            error:
                                'Database column missing. Run migration add_chat_channel_share_image.sql in Supabase, then try again.',
                        });
                    }
                    return res.status(500).json({ ok: false, error: 'Could not update channel' });
                }
                if (!data) {
                    return res.status(404).json({ ok: false, error: 'Channel not found' });
                }
                const logAudit = await getAudit();
                await logAudit({
                    userId: authUserId,
                    action: 'Chat Channel Updated',
                    details: { fields: Object.keys(patch), name: data?.name },
                    resourceType: 'chat_channel',
                    resourceId: cid,
                    severity: 'info',
                    req,
                });
                return res.status(200).json({ ok: true, channel: data });
            }
        }
        if (req.method === 'DELETE') {
            if (chatType === 'channels') {
                const cid = String(
                    first(channelId) || req.query.channelId || req.body?.channelId || req.body?.channel_id || ''
                ).trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                if (!channel) return res.status(404).json({ ok: false, error: 'Channel not found' });
                if (
                    !canDeleteCommunityChannelSync(channel, authUserId, {
                        userRole: authRole,
                    })
                ) {
                    return res.status(403).json({
                        ok: false,
                        error: 'Forbidden: you cannot delete this channel',
                    });
                }
                // Clear pin first so message FK SET NULL cannot block channel removal edge cases.
                await supabaseAdmin
                    .from('chat_channels')
                    .update({ pinned_message_id: null })
                    .eq('id', cid);
                const { error } = await supabaseAdmin.from('chat_channels').delete().eq('id', cid);
                if (error) throw error;
                const logAudit = await getAudit();
                await logAudit({
                    userId: authUserId,
                    action: 'Chat Channel Deleted',
                    details: {
                        name: channel?.name,
                        visibility: channel?.visibility,
                        slug: (channel as any)?.slug,
                    },
                    resourceType: 'chat_channel',
                    resourceId: cid,
                    severity: 'warning',
                    req,
                });
                return res.status(200).json({ ok: true, deletedId: cid });
            }
            if (chatType === 'channel-members') {
                const cid = String(
                    first(channelId) || req.query.channelId || req.body?.channelId || req.body?.channel_id || ''
                ).trim();
                const targetUserId = String(
                    first(req.query.userId) || req.query.userId || req.body?.userId || req.body?.user_id || ''
                ).trim();
                if (!cid) return res.status(400).json({ ok: false, error: 'channelId is required' });
                if (!targetUserId) return res.status(400).json({ ok: false, error: 'userId is required' });
                const channel = await fetchChannel(supabaseAdmin, cid);
                if (!channel) return res.status(404).json({ ok: false, error: 'Channel not found' });
                const mayManage = await canManageChannelMembers(
                    supabaseAdmin,
                    channel,
                    authUserId,
                    authRole
                );
                if (!mayManage) {
                    return res.status(403).json({ ok: false, error: 'Forbidden: cannot manage this channel' });
                }
                const result = await removeChannelMember(supabaseAdmin, channel, targetUserId);
                if (result.ok === false) {
                    return res.status(result.status).json({ ok: false, error: result.error });
                }
                const members = await listChannelMembers(supabaseAdmin, channel);
                return res.status(200).json({ ok: true, members });
            }
            if (chatType === 'reactions') {
                const messageId = String(first(req.query.messageId) || req.body?.messageId || req.body?.message_id || '').trim();
                const emoji = String(first(req.query.emoji) || req.body?.emoji || '').trim();
                if (!messageId || !emoji) {
                    return res.status(400).json({ ok: false, error: 'messageId and emoji are required' });
                }
                const gate = await resolveMessageChannelAccess(messageId);
                if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
                const { error } = await supabaseAdmin
                    .from('chat_message_reactions')
                    .delete()
                    .eq('message_id', messageId)
                    .eq('user_id', authUserId)
                    .eq('emoji', emoji);
                if (error) throw error;
                waitUntil(broadcastChatEvent(String(gate.channel.id), 'message', { id: messageId }));
                return res.status(200).json({ ok: true });
            }
        }
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    if (subResource === 'audit') {
        const { user_id, action, severity, resource_type } = req.query;
        if (req.method === 'GET') {
            // Admins / pastors only — same gate as Settings Audit Log UI.
            const role = String(authRole || '').toUpperCase();
            const mayView = ['SUPER_ADMIN', 'PASTOR', 'ADMIN', 'ADMIN_STAFF'].includes(role);
            if (!mayView) {
                return res.status(403).json({ ok: false, error: 'Forbidden: audit log is admin-only' });
            }

            const limitRaw = parseInt(String(limit || '200'), 10);
            const effectiveLimit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 200;

            let query = supabaseAdmin
                .from('audit_logs')
                .select(`*, user:users(id, name, email, role)`)
                .order('created_at', { ascending: false })
                .limit(effectiveLimit);
            if (user_id) query = query.eq('user_id', user_id);
            if (action) query = query.ilike('action', `%${action}%`);
            if (severity) query = query.eq('severity', String(severity).toLowerCase());
            if (resource_type) query = query.eq('resource_type', String(resource_type));

            const { data, error } = await query;
            if (error) throw error;
            const logs = data || [];
            // Keep array response for older callers; wrap for the Settings Audit Log page.
            res.setHeader('X-PLCC-Audit-Count', String(logs.length));
            return res.status(200).json({ ok: true, logs, count: logs.length });
        }
        if (req.method === 'POST') {
            const logAudit = await getAudit();
            await logAudit({
                userId: authUserId,
                action: String(req.body?.action || 'Manual Audit Note').trim() || 'Manual Audit Note',
                details: req.body?.details ?? null,
                resourceType: req.body?.resource_type || req.body?.resourceType || 'manual',
                resourceId: req.body?.resource_id || req.body?.resourceId || undefined,
                severity: req.body?.severity || 'info',
                req,
            });
            return res.status(201).json({ ok: true });
        }
    }

    if (subResource === 'gallery') {
        if (req.method === 'GET') {
            const { data, error } = await supabaseAdmin.from('gallery_items').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            return res.status(200).json(data || []);
        }
        if (req.method === 'POST') {
            const { data, error } = await supabaseAdmin.from('gallery_items').insert([pickAllowed(req.body, GALLERY_COLUMNS)]).select().single();
            if (error) throw error;
            return res.status(201).json(data);
        }
        if (req.method === 'PATCH') {
            const gid = req.body?.id;
            const { data, error } = await supabaseAdmin.from('gallery_items').update(pickAllowed(req.body, GALLERY_COLUMNS)).eq('id', gid).select().single();
            if (error) throw error;
            return res.status(200).json(data);
        }
        if (req.method === 'DELETE') {
            const { error } = await supabaseAdmin.from('gallery_items').delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ ok: true });
        }
    }

    if (subResource === 'voices') {
        if (req.method === 'GET') {
            let query = supabaseAdmin.from('community_voices').select('*').order('created_at', { ascending: false });
            if (status) query = query.eq('status', status);
            const { data, error } = await query;
            if (error) throw error;
            return res.status(200).json(data || []);
        }
        if (req.method === 'POST') {
            const voiceRow = pickAllowed(req.body, VOICE_COLUMNS);
            if (!voiceRow.status) voiceRow.status = 'published';
            const { data, error } = await supabaseAdmin.from('community_voices').insert([voiceRow]).select().single();
            if (error) throw error;
            return res.status(201).json(data);
        }
        if (req.method === 'PATCH') {
            const vid = req.body?.id;
            const { data, error } = await supabaseAdmin.from('community_voices').update(pickAllowed(req.body, VOICE_COLUMNS)).eq('id', vid).select().single();
            if (error) throw error;
            return res.status(200).json(data);
        }
        if (req.method === 'DELETE') {
            const { error } = await supabaseAdmin.from('community_voices').delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ ok: true });
        }
    }

    if (subResource === 'sermons') {
        if (req.method === 'GET') {
            const { data, error } = await supabaseAdmin.from('sermons').select('*').order('date', { ascending: false });
            if (error) throw error;
            return res.status(200).json({ ok: true, sermons: data });
        }
        if (req.method === 'POST') {
            const row = pickAllowed(req.body, SERMON_COLUMNS);
            if (typeof row.body === 'string' && row.body.length > SERMON_BODY_MAX) {
                return res.status(400).json({ error: 'Sermon message must be 50,000 characters or fewer.' });
            }
            const { data, error } = await supabaseAdmin.from('sermons').insert([row]).select().single();
            if (error) throw error;
            return res.status(201).json({ ok: true, sermon: data });
        }
        if (req.method === 'PATCH') {
            const sid = req.body?.id;
            const row = pickAllowed(req.body, SERMON_COLUMNS);
            if (typeof row.body === 'string' && row.body.length > SERMON_BODY_MAX) {
                return res.status(400).json({ error: 'Sermon message must be 50,000 characters or fewer.' });
            }
            const { data, error } = await supabaseAdmin.from('sermons').update(row).eq('id', sid).select().single();
            if (error) throw error;
            return res.status(200).json({ ok: true, sermon: data });
        }
        if (req.method === 'DELETE') {
            const { error } = await supabaseAdmin.from('sermons').delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ ok: true });
        }
    }

    if (subResource === 'inspiration') {
        if (req.method === 'GET') {
            const todayOnly =
                String(req.query.today || '').trim() === '1' ||
                String(req.query.today || '').toLowerCase() === 'true';
            if (todayOnly) {
                const todayYmd = new Date().toISOString().slice(0, 10);
                const { data: todayRow, error: todayErr } = await supabaseAdmin
                    .from('daily_inspiration')
                    .select('*')
                    .eq('publish_date', todayYmd)
                    .maybeSingle();
                if (todayErr) throw todayErr;
                if (todayRow) {
                    return res.status(200).json({ ok: true, inspiration: todayRow, inspirations: [todayRow] });
                }
                // Fallback: most recent published row
                const { data: latest, error: latestErr } = await supabaseAdmin
                    .from('daily_inspiration')
                    .select('*')
                    .order('publish_date', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (latestErr) throw latestErr;
                return res.status(200).json({
                    ok: true,
                    inspiration: latest || null,
                    inspirations: latest ? [latest] : [],
                    fallback: Boolean(latest),
                });
            }
            const { data, error } = await supabaseAdmin.from('daily_inspiration').select('*').order('publish_date', { ascending: false });
            if (error) throw error;
            return res.status(200).json({ ok: true, inspiratons: data, inspirations: data });
        }
        if (req.method === 'POST') {
            const { data, error } = await supabaseAdmin.from('daily_inspiration').insert([pickAllowed(req.body, INSPIRATION_COLUMNS)]).select().single();
            if (error) throw error;
            return res.status(201).json({ ok: true, inspiration: data });
        }
        if (req.method === 'PATCH') {
            const iid = req.body?.id;
            const { data, error } = await supabaseAdmin.from('daily_inspiration').update(pickAllowed(req.body, INSPIRATION_COLUMNS)).eq('id', iid).select().single();
            if (error) throw error;
            return res.status(200).json({ ok: true, inspiration: data });
        }
        if (req.method === 'DELETE') {
            const { error } = await supabaseAdmin.from('daily_inspiration').delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ ok: true });
        }
    }

    // ── Phase 4A Community Feed ─────────────────────────────────────────────
    if (subResource === 'feed') {
        const feedType = String(req.query.feedType || 'posts').trim();
        const { data: feedUserRow } = await supabaseAdmin
            .from('users')
            .select('id, email, role, name, avatar_url')
            .eq('id', authUserId)
            .maybeSingle();
        if (!feedUserRow || !isCommunityFeedEligibleUser(feedUserRow)) {
            return res.status(403).json({ error: 'Community Feed access denied' });
        }

        if (feedType === 'mention-candidates' && req.method === 'GET') {
            const q = String(req.query.q || '').trim();
            const candidates = await listMemberPickerCandidates(supabaseAdmin, {
                excludeUserId: authUserId,
                query: q,
                limit: 20,
            });
            return res.status(200).json({
                ok: true,
                candidates: candidates.map((c) => ({
                    id: c.id,
                    name: c.name,
                    avatar_url: c.avatar_url,
                    role: c.role || null,
                    emailHint: emailLocalPartHint(c.email),
                })),
            });
        }

        if (feedType === 'posts') {
            if (req.method === 'GET') {
                const deepPostId = String(req.query.id || req.query.postId || '').trim();
                const pageSize = clampFeedPageSize(req.query.limit, FEED_PAGE_SIZE);
                const offset = clampFeedOffset(req.query.offset);
                const categoryFilter = parseFeedListCategoryFilter(req.query.category);
                if (categoryFilter.ok !== true) {
                    return res.status(400).json({ error: categoryFilter.error });
                }

                let postsQuery = supabaseAdmin
                    .from('feed_posts')
                    .select(
                        'id, author_id, category, content, created_at, updated_at, image_path, image_mime, image_bytes, pinned_at, pinned_by'
                    )
                    .is('deleted_at', null);

                if (deepPostId) {
                    // Focused deep-link loads the post by id regardless of active list filter / pin order.
                    postsQuery = postsQuery.eq('id', deepPostId).limit(1);
                } else {
                    if (categoryFilter.category) {
                        postsQuery = postsQuery.eq('category', categoryFilter.category);
                    }
                    // Phase 4D.2 — pinned first; nullsFirst:false ⇒ NULLS LAST (required).
                    postsQuery = postsQuery
                        .order('pinned_at', { ascending: false, nullsFirst: false })
                        .order('created_at', { ascending: false })
                        .range(offset, offset + pageSize - 1);
                }

                const { data: posts, error } = await postsQuery;
                if (error) throw error;
                const list = posts || [];
                if (deepPostId && list.length === 0) {
                    return res.status(404).json({
                        ok: false,
                        error: 'This Community item is no longer available.',
                        unavailable: true,
                    });
                }
                const postIds = list.map((p: any) => p.id);
                const authorIds = list.map((p: any) => p.author_id);
                const [authors, reactionRows, commentCounts] = await Promise.all([
                    loadFeedAuthors(supabaseAdmin, authorIds),
                    loadFeedReactionsForTargets(supabaseAdmin, 'post', postIds),
                    loadFeedCommentCounts(supabaseAdmin, postIds),
                ]);

                const imageUrlByPost: Record<string, string | null> = {};
                await Promise.all(
                    list.map(async (p: any) => {
                        imageUrlByPost[p.id] = null;
                        if (!p.image_path || !isSafeFeedImagePath(p.image_path)) return;
                        const { data: signed } = await supabaseAdmin.storage
                            .from(FEED_IMAGE_BUCKET)
                            .createSignedUrl(String(p.image_path), FEED_IMAGE_SIGNED_URL_TTL_SEC);
                        imageUrlByPost[p.id] = signed?.signedUrl || null;
                    })
                );

                let commentPreviewByPost: Record<string, any[]> = {};
                if (postIds.length > 0) {
                    const previewByPost = await loadFeedCommentPreviews(
                        supabaseAdmin,
                        postIds,
                        FEED_COMMENTS_PREVIEW
                    );
                    const previewFlat = Object.values(previewByPost).flat();
                    const commentAuthors = await loadFeedAuthors(
                        supabaseAdmin,
                        previewFlat.map((c) => c.author_id)
                    );
                    const commentReactionRows = await loadFeedReactionsForTargets(
                        supabaseAdmin,
                        'comment',
                        previewFlat.map((c) => c.id)
                    );
                    const viewerRole = (feedUserRow as any).role;
                    for (const pid of postIds) {
                        commentPreviewByPost[pid] = (previewByPost[pid] || []).map((c) => ({
                            id: c.id,
                            content: c.content,
                            contentDisplay: formatFeedContentForDisplay(c.content),
                            created_at: c.created_at,
                            updated_at: c.updated_at,
                            edited: isFeedEdited(c.created_at, c.updated_at),
                            author: commentAuthors[c.author_id] || {
                                id: c.author_id,
                                name: 'Member',
                                avatar_url: null,
                            },
                            reactions: aggregateFeedReactions(
                                commentReactionRows.filter((r) => r.target_id === c.id),
                                authUserId
                            ),
                            canEdit: canEditFeedPost({ viewerId: authUserId, authorId: c.author_id }),
                            canRemove: canRemoveFeedComment({
                                viewerId: authUserId,
                                authorId: c.author_id,
                                viewerRole,
                            }),
                        }));
                    }
                }

                const viewerRole = (feedUserRow as any).role;
                const cards = list.map((p: any) => {
                    const rx = reactionRows.filter((r) => r.target_id === p.id);
                    const card = assembleFeedPostCard({
                        post: p,
                        author: authors[p.author_id] || null,
                        reactions: rx,
                        commentCount: commentCounts[p.id] || 0,
                        viewerId: authUserId,
                        viewerRole,
                        commentsPreview: commentPreviewByPost[p.id] || [],
                        imageUrl: imageUrlByPost[p.id] || null,
                    });
                    return {
                        ...card,
                        contentDisplay: formatFeedContentForDisplay(String(p.content || '')),
                    };
                });

                return res.status(200).json({
                    ok: true,
                    posts: cards,
                    pageSize: deepPostId ? 1 : pageSize,
                    offset: deepPostId ? 0 : offset,
                    hasMore: deepPostId ? false : list.length === pageSize,
                    viewerCanModerate: isCommunityFeedModerator(viewerRole),
                    queryStrategy: feedQueryStrategyDoc(),
                    deepLink: Boolean(deepPostId),
                });
            }

            if (req.method === 'POST') {
                const category = parseFeedCategory(req.body?.category);
                if (!category) return res.status(400).json({ error: 'Invalid category' });

                const imagePayload = req.body?.image;
                const hasImageAttempt =
                    imagePayload != null &&
                    (imagePayload.fileBase64 || imagePayload.mimeType || imagePayload.imagePath || imagePayload.storagePath);
                let parsedImage: ReturnType<typeof parseFeedImageUpload> | null = null;
                if (hasImageAttempt) {
                    parsedImage = parseFeedImageUpload({
                        mimeType: imagePayload?.mimeType,
                        fileBase64: imagePayload?.fileBase64,
                        imagePath: imagePayload?.imagePath ?? req.body?.imagePath,
                        storagePath: imagePayload?.storagePath ?? req.body?.storagePath,
                    });
                    if (parsedImage.ok !== true) {
                        return res.status(400).json({ error: (parsedImage as { error: string }).error });
                    }
                }

                const contentCheck = validateFeedPostContent(req.body?.content, {
                    allowEmptyWithImage: Boolean(parsedImage && parsedImage.ok),
                });
                if (contentCheck.ok !== true) {
                    return res.status(400).json({ error: (contentCheck as { error: string }).error });
                }
                if (!contentCheck.content && !(parsedImage && parsedImage.ok)) {
                    return res.status(400).json({ error: 'Post cannot be empty' });
                }

                const mentionResolve = resolveAuthorizedFeedMentionIds({
                    content: contentCheck.content,
                    claimedIds: req.body?.mentionedUserIds ?? req.body?.mentioned_user_ids,
                });
                if (mentionResolve.ok !== true) {
                    return res.status(400).json({ error: (mentionResolve as { error: string }).error });
                }

                let image_path: string | null = null;
                let image_mime: string | null = null;
                let image_bytes: number | null = null;
                if (parsedImage && parsedImage.ok) {
                    const objectId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                    image_path = buildFeedImageStoragePath(authUserId, objectId, parsedImage.ext);
                    const { error: upErr } = await supabaseAdmin.storage
                        .from(FEED_IMAGE_BUCKET)
                        .upload(image_path, parsedImage.buffer, {
                            contentType: parsedImage.mime,
                            upsert: false,
                        });
                    if (upErr) {
                        console.error('[CommunityFeed] image upload failed:', upErr.message);
                        return res.status(500).json({ error: 'Could not upload photo' });
                    }
                    image_mime = parsedImage.mime;
                    image_bytes = parsedImage.bytes;
                }

                // Author always from auth — never trust client author_id / image paths
                const { data, error } = await supabaseAdmin
                    .from('feed_posts')
                    .insert([
                        {
                            author_id: authUserId,
                            category,
                            content: contentCheck.content,
                            image_path,
                            image_mime,
                            image_bytes,
                        },
                    ])
                    .select(
                        'id, author_id, category, content, created_at, updated_at, image_path, image_mime, image_bytes, pinned_at, pinned_by'
                    )
                    .single();
                if (error) {
                    if (image_path) {
                        await supabaseAdmin.storage.from(FEED_IMAGE_BUCKET).remove([image_path]).catch(() => null);
                    }
                    throw error;
                }

                let imageUrl: string | null = null;
                if (data.image_path && isSafeFeedImagePath(data.image_path)) {
                    const { data: signed } = await supabaseAdmin.storage
                        .from(FEED_IMAGE_BUCKET)
                        .createSignedUrl(String(data.image_path), FEED_IMAGE_SIGNED_URL_TTL_SEC);
                    imageUrl = signed?.signedUrl || null;
                }

                const card = assembleFeedPostCard({
                    post: data,
                    author: {
                        id: authUserId,
                        name: authDisplayName,
                        avatar_url: (feedUserRow as any).avatar_url || null,
                    },
                    reactions: [],
                    commentCount: 0,
                    viewerId: authUserId,
                    viewerRole: (feedUserRow as any).role,
                    commentsPreview: [],
                    imageUrl,
                });

                const mentionPersist = await persistFeedMentionsThenNotify({
                    supabase: supabaseAdmin,
                    createdBy: authUserId,
                    actorName: authDisplayName || 'Member',
                    postId: data.id,
                    mentionedUserIds: mentionResolve.ids,
                    target: 'post',
                });
                if (mentionPersist.ok !== true) {
                    const mentionErr = (mentionPersist as { error: string }).error;
                    console.error('[CommunityFeed] post mention persist failed:', mentionErr);
                    return res.status(500).json({
                        ok: false,
                        error: mentionErr,
                        post: {
                            ...card,
                            contentDisplay: formatFeedContentForDisplay(String(data.content || '')),
                        },
                        mentionWarning: true,
                    });
                }
                if (mentionPersist.notifyFailed) {
                    console.error(
                        '[CommunityFeed] post mention notify partial failure:',
                        mentionPersist.notify.errors.join('; ')
                    );
                }

                return res.status(201).json({
                    ok: true,
                    post: {
                        ...card,
                        contentDisplay: formatFeedContentForDisplay(String(data.content || '')),
                    },
                    mentionNotify: {
                        delivered: mentionPersist.notify.delivered,
                        conflicts: mentionPersist.notify.conflicts,
                        failed: mentionPersist.notify.failed,
                    },
                });
            }

            if (req.method === 'PATCH') {
                const postId = String(req.body?.id || req.query.id || '').trim();
                if (!postId) return res.status(400).json({ error: 'Post id required' });

                const pinActionRaw = String(req.body?.action || '').trim().toLowerCase();
                if (pinActionRaw === 'pin' || pinActionRaw === 'unpin') {
                    // Phase 4D.2 — pin/unpin before author content-edit path.
                    // Never trust client pinned_at / pinned_by.
                    const viewerRole = (feedUserRow as any).role;
                    if (!canPinFeedPost({ viewerRole })) {
                        return res.status(403).json({ error: 'Forbidden: cannot pin Community posts' });
                    }
                    if (req.body?.pinned_at != null || req.body?.pinned_by != null) {
                        return res.status(400).json({
                            error: 'pinned_at and pinned_by cannot be set by the client',
                        });
                    }

                    const { data: pinTarget, error: pinExErr } = await supabaseAdmin
                        .from('feed_posts')
                        .select(
                            'id, author_id, category, content, created_at, updated_at, image_path, image_mime, image_bytes, pinned_at, pinned_by, deleted_at'
                        )
                        .eq('id', postId)
                        .maybeSingle();
                    if (pinExErr) throw pinExErr;
                    if (!pinTarget || pinTarget.deleted_at) {
                        return res.status(404).json({ error: 'Post not found' });
                    }

                    let row = pinTarget;
                    if (pinActionRaw === 'pin') {
                        if (!isFeedPostPinned(pinTarget.pinned_at)) {
                            const now = new Date().toISOString();
                            const { data: updated, error: pinErr } = await supabaseAdmin
                                .from('feed_posts')
                                .update({
                                    pinned_at: now,
                                    pinned_by: authUserId,
                                })
                                .eq('id', postId)
                                .is('deleted_at', null)
                                .is('pinned_at', null)
                                .select(
                                    'id, author_id, category, content, created_at, updated_at, image_path, image_mime, image_bytes, pinned_at, pinned_by, deleted_at'
                                )
                                .maybeSingle();
                            if (pinErr) throw pinErr;
                            if (updated) {
                                row = updated;
                            } else {
                                const { data: again, error: againErr } = await supabaseAdmin
                                    .from('feed_posts')
                                    .select(
                                        'id, author_id, category, content, created_at, updated_at, image_path, image_mime, image_bytes, pinned_at, pinned_by, deleted_at'
                                    )
                                    .eq('id', postId)
                                    .maybeSingle();
                                if (againErr) throw againErr;
                                if (!again || again.deleted_at) {
                                    return res.status(404).json({ error: 'Post not found' });
                                }
                                row = again;
                            }
                        }
                    } else {
                        // unpin
                        if (isFeedPostPinned(pinTarget.pinned_at)) {
                            const { data: updated, error: unpinErr } = await supabaseAdmin
                                .from('feed_posts')
                                .update({
                                    pinned_at: null,
                                    pinned_by: null,
                                })
                                .eq('id', postId)
                                .is('deleted_at', null)
                                .not('pinned_at', 'is', null)
                                .select(
                                    'id, author_id, category, content, created_at, updated_at, image_path, image_mime, image_bytes, pinned_at, pinned_by, deleted_at'
                                )
                                .maybeSingle();
                            if (unpinErr) throw unpinErr;
                            if (updated) {
                                row = updated;
                            } else {
                                const { data: again, error: againErr } = await supabaseAdmin
                                    .from('feed_posts')
                                    .select(
                                        'id, author_id, category, content, created_at, updated_at, image_path, image_mime, image_bytes, pinned_at, pinned_by, deleted_at'
                                    )
                                    .eq('id', postId)
                                    .maybeSingle();
                                if (againErr) throw againErr;
                                if (!again || again.deleted_at) {
                                    return res.status(404).json({ error: 'Post not found' });
                                }
                                row = again;
                            }
                        }
                    }

                    let imageUrl: string | null = null;
                    if (row.image_path && isSafeFeedImagePath(row.image_path)) {
                        const { data: signed } = await supabaseAdmin.storage
                            .from(FEED_IMAGE_BUCKET)
                            .createSignedUrl(String(row.image_path), FEED_IMAGE_SIGNED_URL_TTL_SEC);
                        imageUrl = signed?.signedUrl || null;
                    }
                    const authors = await loadFeedAuthors(supabaseAdmin, [String(row.author_id)]);
                    const card = assembleFeedPostCard({
                        post: row,
                        author: authors[String(row.author_id)] || {
                            id: String(row.author_id),
                            name: 'Member',
                            avatar_url: null,
                        },
                        reactions: [],
                        commentCount: 0,
                        viewerId: authUserId,
                        viewerRole,
                        imageUrl,
                    });
                    return res.status(200).json({
                        ok: true,
                        action: pinActionRaw,
                        noop: pinActionRaw === 'pin'
                            ? isFeedPostPinned(pinTarget.pinned_at)
                            : !isFeedPostPinned(pinTarget.pinned_at),
                        post: {
                            ...card,
                            contentDisplay: formatFeedContentForDisplay(String(row.content || '')),
                        },
                    });
                }

                const { data: existing, error: exErr } = await supabaseAdmin
                    .from('feed_posts')
                    .select('id, author_id, deleted_at, image_path, pinned_at, pinned_by')
                    .eq('id', postId)
                    .maybeSingle();
                if (exErr) throw exErr;
                if (!existing || existing.deleted_at) return res.status(404).json({ error: 'Post not found' });
                if (
                    !canEditFeedPost({
                        viewerId: authUserId,
                        authorId: String(existing.author_id),
                    })
                ) {
                    return res.status(403).json({ error: 'Only the author can edit this post' });
                }
                const contentCheck = validateFeedPostContent(req.body?.content, {
                    allowEmptyWithImage: Boolean(existing.image_path),
                });
                if (contentCheck.ok !== true) {
                    return res.status(400).json({ error: (contentCheck as { error: string }).error });
                }
                const mentionResolve = resolveAuthorizedFeedMentionIds({
                    content: contentCheck.content,
                    claimedIds: req.body?.mentionedUserIds ?? req.body?.mentioned_user_ids,
                });
                if (mentionResolve.ok !== true) {
                    return res.status(400).json({ error: (mentionResolve as { error: string }).error });
                }
                const { data, error } = await supabaseAdmin
                    .from('feed_posts')
                    .update({ content: contentCheck.content, updated_at: new Date().toISOString() })
                    .eq('id', postId)
                    .eq('author_id', authUserId)
                    .select(
                        'id, author_id, category, content, created_at, updated_at, image_path, image_mime, image_bytes, pinned_at, pinned_by'
                    )
                    .single();
                if (error) throw error;

                const mentionPersist = await persistFeedMentionsThenNotify({
                    supabase: supabaseAdmin,
                    createdBy: authUserId,
                    actorName: authDisplayName || 'Member',
                    postId,
                    mentionedUserIds: mentionResolve.ids,
                    target: 'post',
                });
                if (mentionPersist.ok !== true) {
                    const mentionErr = (mentionPersist as { error: string }).error;
                    console.error('[CommunityFeed] post edit mention persist failed:', mentionErr);
                    return res.status(500).json({ ok: false, error: mentionErr });
                }
                if (mentionPersist.notifyFailed) {
                    console.error(
                        '[CommunityFeed] post edit mention notify partial failure:',
                        mentionPersist.notify.errors.join('; ')
                    );
                }

                let imageUrl: string | null = null;
                if (data.image_path && isSafeFeedImagePath(data.image_path)) {
                    const { data: signed } = await supabaseAdmin.storage
                        .from(FEED_IMAGE_BUCKET)
                        .createSignedUrl(String(data.image_path), FEED_IMAGE_SIGNED_URL_TTL_SEC);
                    imageUrl = signed?.signedUrl || null;
                }
                return res.status(200).json({
                    ok: true,
                    post: {
                        ...assembleFeedPostCard({
                            post: data,
                            author: {
                                id: authUserId,
                                name: authDisplayName,
                                avatar_url: (feedUserRow as any).avatar_url || null,
                            },
                            reactions: [],
                            commentCount: 0,
                            viewerId: authUserId,
                            viewerRole: (feedUserRow as any).role,
                            imageUrl,
                        }),
                        contentDisplay: formatFeedContentForDisplay(String(data.content || '')),
                    },
                    mentionNotify: {
                        delivered: mentionPersist.notify.delivered,
                        conflicts: mentionPersist.notify.conflicts,
                        failed: mentionPersist.notify.failed,
                    },
                });
            }

            if (req.method === 'DELETE') {
                const postId = String(req.query.id || req.body?.id || '').trim();
                if (!postId) return res.status(400).json({ error: 'Post id required' });
                const reasonRaw = req.body?.reason != null ? String(req.body.reason).trim() : '';
                const reason = reasonRaw ? reasonRaw.slice(0, 500) : null;
                const { data: existing, error: exErr } = await supabaseAdmin
                    .from('feed_posts')
                    .select('id, author_id, deleted_at')
                    .eq('id', postId)
                    .maybeSingle();
                if (exErr) throw exErr;
                if (!existing || existing.deleted_at) return res.status(404).json({ error: 'Post not found' });
                const viewerRole = (feedUserRow as any).role;
                const isAuthor = String(existing.author_id) === authUserId;
                const isMod = isCommunityFeedModerator(viewerRole);
                if (!canRemoveFeedPost({ viewerId: authUserId, authorId: String(existing.author_id), viewerRole })) {
                    return res.status(403).json({ error: 'Forbidden: cannot remove this post' });
                }
                const now = new Date().toISOString();
                const { error } = await supabaseAdmin
                    .from('feed_posts')
                    .update({ deleted_at: now, updated_at: now, deleted_by: authUserId })
                    .eq('id', postId)
                    .is('deleted_at', null);
                if (error) throw error;
                await supabaseAdmin
                    .from('feed_comments')
                    .update({ deleted_at: now, updated_at: now, deleted_by: authUserId })
                    .eq('post_id', postId)
                    .is('deleted_at', null);
                if (isMod && !isAuthor) {
                    await supabaseAdmin.from('community_moderation_log').insert([
                        {
                            moderator_id: authUserId,
                            action: 'remove_post',
                            target_type: 'post',
                            target_id: postId,
                            target_author_id: existing.author_id,
                            reason,
                        },
                    ]);
                }
                return res.status(200).json({
                    ok: true,
                    moderated: Boolean(isMod && !isAuthor),
                });
            }
        }

        if (feedType === 'comments') {
            if (req.method === 'GET') {
                const postId = String(req.query.postId || '').trim();
                if (!postId) return res.status(400).json({ error: 'postId required' });
                const { data: post } = await supabaseAdmin
                    .from('feed_posts')
                    .select('id, deleted_at')
                    .eq('id', postId)
                    .maybeSingle();
                if (!post || post.deleted_at) return res.status(404).json({ error: 'Post not found' });
                const { data: comments, error } = await supabaseAdmin
                    .from('feed_comments')
                    .select('id, post_id, author_id, content, created_at, updated_at')
                    .eq('post_id', postId)
                    .is('deleted_at', null)
                    .order('created_at', { ascending: true })
                    .limit(100);
                if (error) throw error;
                const list = sortFeedCommentsChronological(comments || []);
                const authors = await loadFeedAuthors(
                    supabaseAdmin,
                    list.map((c: any) => c.author_id)
                );
                const reactionRows = await loadFeedReactionsForTargets(
                    supabaseAdmin,
                    'comment',
                    list.map((c: any) => c.id)
                );
                const viewerRole = (feedUserRow as any).role;
                const out = list.map((c: any) => ({
                    id: c.id,
                    post_id: c.post_id,
                    content: c.content,
                    created_at: c.created_at,
                    updated_at: c.updated_at,
                    edited: isFeedEdited(c.created_at, c.updated_at),
                    author: authors[c.author_id] || {
                        id: c.author_id,
                        name: 'Member',
                        avatar_url: null,
                    },
                    reactions: aggregateFeedReactions(
                        reactionRows.filter((r) => r.target_id === c.id),
                        authUserId
                    ),
                    canEdit: canEditFeedPost({ viewerId: authUserId, authorId: c.author_id }),
                    canRemove: canRemoveFeedComment({
                        viewerId: authUserId,
                        authorId: c.author_id,
                        viewerRole,
                    }),
                }));
                return res.status(200).json({ ok: true, comments: out });
            }

            if (req.method === 'POST') {
                const postId = String(req.body?.postId || '').trim();
                if (!postId) return res.status(400).json({ error: 'postId required' });
                const contentCheck = validateFeedCommentContent(req.body?.content);
                if (contentCheck.ok !== true) {
                    return res.status(400).json({ error: (contentCheck as { error: string }).error });
                }
                const mentionResolve = resolveAuthorizedFeedMentionIds({
                    content: contentCheck.content,
                    claimedIds: req.body?.mentionedUserIds ?? req.body?.mentioned_user_ids,
                });
                if (mentionResolve.ok !== true) {
                    return res.status(400).json({ error: (mentionResolve as { error: string }).error });
                }
                const { data: post } = await supabaseAdmin
                    .from('feed_posts')
                    .select('id, author_id, deleted_at')
                    .eq('id', postId)
                    .maybeSingle();
                if (!post || post.deleted_at) return res.status(404).json({ error: 'Post not found' });
                const { data, error } = await supabaseAdmin
                    .from('feed_comments')
                    .insert([
                        {
                            post_id: postId,
                            author_id: authUserId,
                            content: contentCheck.content,
                        },
                    ])
                    .select('id, post_id, author_id, content, created_at, updated_at')
                    .single();
                if (error) throw error;

                const mentionPersist = await persistFeedMentionsThenNotify({
                    supabase: supabaseAdmin,
                    createdBy: authUserId,
                    actorName: authDisplayName || 'Member',
                    postId,
                    commentId: data.id,
                    mentionedUserIds: mentionResolve.ids,
                    target: 'comment',
                });
                if (mentionPersist.ok !== true) {
                    const mentionErr = (mentionPersist as { error: string }).error;
                    console.error('[CommunityFeed] comment mention persist failed:', mentionErr);
                    return res.status(500).json({
                        ok: false,
                        error: mentionErr,
                        comment: {
                            ...data,
                            contentDisplay: formatFeedContentForDisplay(String(data.content || '')),
                            edited: false,
                            author: {
                                id: authUserId,
                                name: authDisplayName,
                                avatar_url: (feedUserRow as any).avatar_url || null,
                            },
                            reactions: [],
                        },
                        mentionWarning: true,
                    });
                }
                if (mentionPersist.notifyFailed) {
                    console.error(
                        '[CommunityFeed] comment mention notify partial failure:',
                        mentionPersist.notify.errors.join('; ')
                    );
                }
                await notifyFeedPostComment({
                    supabase: supabaseAdmin,
                    postAuthorId: String(post.author_id),
                    commenterId: authUserId,
                    commenterName: authDisplayName || 'Member',
                    postId,
                    commentId: data.id,
                    postDeleted: Boolean(post.deleted_at),
                    // Confirmed persisted mention ids only (Phase 4D.1 suppress).
                    confirmedMentionedUserIds: mentionPersist.mentionSync.nextIds,
                });

                return res.status(201).json({
                    ok: true,
                    comment: {
                        ...data,
                        contentDisplay: formatFeedContentForDisplay(String(data.content || '')),
                        edited: false,
                        author: {
                            id: authUserId,
                            name: authDisplayName,
                            avatar_url: (feedUserRow as any).avatar_url || null,
                        },
                        reactions: [],
                    },
                    mentionNotify: {
                        delivered: mentionPersist.notify.delivered,
                        conflicts: mentionPersist.notify.conflicts,
                        failed: mentionPersist.notify.failed,
                    },
                });
            }

            if (req.method === 'PATCH') {
                const commentId = String(req.body?.id || '').trim();
                if (!commentId) return res.status(400).json({ error: 'Comment id required' });
                const contentCheck = validateFeedCommentContent(req.body?.content);
                if (contentCheck.ok !== true) {
                    return res.status(400).json({ error: (contentCheck as { error: string }).error });
                }
                const mentionResolve = resolveAuthorizedFeedMentionIds({
                    content: contentCheck.content,
                    claimedIds: req.body?.mentionedUserIds ?? req.body?.mentioned_user_ids,
                });
                if (mentionResolve.ok !== true) {
                    return res.status(400).json({ error: (mentionResolve as { error: string }).error });
                }
                const { data: existing } = await supabaseAdmin
                    .from('feed_comments')
                    .select('id, author_id, post_id, deleted_at')
                    .eq('id', commentId)
                    .maybeSingle();
                if (!existing || existing.deleted_at) return res.status(404).json({ error: 'Comment not found' });
                if (String(existing.author_id) !== authUserId) {
                    return res.status(403).json({ error: 'Only the author can edit this comment' });
                }
                const { data, error } = await supabaseAdmin
                    .from('feed_comments')
                    .update({ content: contentCheck.content, updated_at: new Date().toISOString() })
                    .eq('id', commentId)
                    .eq('author_id', authUserId)
                    .select('id, post_id, author_id, content, created_at, updated_at')
                    .single();
                if (error) throw error;

                const mentionPersist = await persistFeedMentionsThenNotify({
                    supabase: supabaseAdmin,
                    createdBy: authUserId,
                    actorName: authDisplayName || 'Member',
                    postId: String(existing.post_id),
                    commentId,
                    mentionedUserIds: mentionResolve.ids,
                    target: 'comment',
                });
                if (mentionPersist.ok !== true) {
                    const mentionErr = (mentionPersist as { error: string }).error;
                    console.error('[CommunityFeed] comment edit mention persist failed:', mentionErr);
                    return res.status(500).json({ ok: false, error: mentionErr });
                }
                if (mentionPersist.notifyFailed) {
                    console.error(
                        '[CommunityFeed] comment edit mention notify partial failure:',
                        mentionPersist.notify.errors.join('; ')
                    );
                }

                return res.status(200).json({
                    ok: true,
                    comment: {
                        ...data,
                        contentDisplay: formatFeedContentForDisplay(String(data.content || '')),
                    },
                    mentionNotify: {
                        delivered: mentionPersist.notify.delivered,
                        conflicts: mentionPersist.notify.conflicts,
                        failed: mentionPersist.notify.failed,
                    },
                });
            }

            if (req.method === 'DELETE') {
                const commentId = String(req.query.id || req.body?.id || '').trim();
                if (!commentId) return res.status(400).json({ error: 'Comment id required' });
                const reasonRaw = req.body?.reason != null ? String(req.body.reason).trim() : '';
                const reason = reasonRaw ? reasonRaw.slice(0, 500) : null;
                const { data: existing } = await supabaseAdmin
                    .from('feed_comments')
                    .select('id, author_id, deleted_at')
                    .eq('id', commentId)
                    .maybeSingle();
                if (!existing || existing.deleted_at) return res.status(404).json({ error: 'Comment not found' });
                const viewerRole = (feedUserRow as any).role;
                const isAuthor = String(existing.author_id) === authUserId;
                const isMod = isCommunityFeedModerator(viewerRole);
                if (
                    !canRemoveFeedComment({
                        viewerId: authUserId,
                        authorId: String(existing.author_id),
                        viewerRole,
                    })
                ) {
                    return res.status(403).json({ error: 'Forbidden: cannot remove this comment' });
                }
                const now = new Date().toISOString();
                const { error } = await supabaseAdmin
                    .from('feed_comments')
                    .update({ deleted_at: now, updated_at: now, deleted_by: authUserId })
                    .eq('id', commentId)
                    .is('deleted_at', null);
                if (error) throw error;
                if (isMod && !isAuthor) {
                    await supabaseAdmin.from('community_moderation_log').insert([
                        {
                            moderator_id: authUserId,
                            action: 'remove_comment',
                            target_type: 'comment',
                            target_id: commentId,
                            target_author_id: existing.author_id,
                            reason,
                        },
                    ]);
                }
                return res.status(200).json({
                    ok: true,
                    moderated: Boolean(isMod && !isAuthor),
                });
            }
        }

        if (feedType === 'reactions' && req.method === 'POST') {
            const targetType = String(req.body?.targetType || '').trim();
            const targetId = String(req.body?.targetId || '').trim();
            const reaction = String(req.body?.reaction || '').trim();
            if (targetType !== 'post' && targetType !== 'comment') {
                return res.status(400).json({ error: 'Invalid target type' });
            }
            if (!targetId) return res.status(400).json({ error: 'targetId required' });
            if (!isFeedReactionKey(reaction)) {
                return res.status(400).json({ error: 'Invalid reaction' });
            }
            if (targetType === 'post') {
                const { data: post } = await supabaseAdmin
                    .from('feed_posts')
                    .select('id, deleted_at')
                    .eq('id', targetId)
                    .maybeSingle();
                if (!post || post.deleted_at) return res.status(404).json({ error: 'Post not found' });
            } else {
                const { data: comment } = await supabaseAdmin
                    .from('feed_comments')
                    .select('id, deleted_at')
                    .eq('id', targetId)
                    .maybeSingle();
                if (!comment || comment.deleted_at) return res.status(404).json({ error: 'Comment not found' });
            }

            const { data: existing } = await supabaseAdmin
                .from('feed_reactions')
                .select('id')
                .eq('target_type', targetType)
                .eq('target_id', targetId)
                .eq('user_id', authUserId)
                .eq('reaction', reaction)
                .maybeSingle();

            const action = decideFeedReactionToggle({ existingSameReaction: Boolean(existing) });
            if (action === 'delete') {
                const { error } = await supabaseAdmin
                    .from('feed_reactions')
                    .delete()
                    .eq('id', existing!.id);
                if (error) throw error;
            } else {
                const { error } = await supabaseAdmin.from('feed_reactions').insert([
                    {
                        target_type: targetType,
                        target_id: targetId,
                        user_id: authUserId,
                        reaction,
                    },
                ]);
                if (error) throw error;
            }

            const rows = await loadFeedReactionsForTargets(supabaseAdmin, targetType as any, [targetId]);
            return res.status(200).json({
                ok: true,
                action,
                reactions: aggregateFeedReactions(rows, authUserId),
            });
        }

        return res.status(400).json({ error: 'Unknown feed action' });
    }

    return res.status(200).json({ ok: true, message: 'Community resource ready', subResource });
};

// --- FINANCE ---


// ─── Role Tier Helper ──────────────────────────────────────────────────────
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'PASTOR', 'ADMIN_STAFF', 'ADMIN', 'SECRETARY', 'ASST_SECRETARY', 'FIRST_LADY', 'FINANCE']);
const MEMBER_ROLES = new Set(['MEMBER', 'GUEST', 'PARENT', 'TEACHER', 'YOUTH', 'USER']);

function getRoleTier(role: string): 'admin' | 'leader' | 'member' {
    if (ADMIN_ROLES.has(role)) return 'admin';
    if (MEMBER_ROLES.has(role)) return 'member';
    return 'leader'; // MINISTRY_LEADER, STAFF, WORSHIP_TEAM, MEDIA_TEAM, VOLUNTEER, etc.
}

// ─── MINUTES & ACKNOWLEDGEMENTS ──────────────────────────────────────────────
const handleMinutes = async (req: any, res: any) => {
    const { subResource, id, documentId } = req.query;
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });

    const { user, role } = await verifyAuth(req, supabaseAdmin);
    const isAdmin = role && ['SUPER_ADMIN', 'PASTOR', 'ADMIN_STAFF', 'ADMIN', 'SECRETARY', 'ASST_SECRETARY', 'FIRST_LADY', 'FINANCE'].includes(role);

    if (subResource === 'audio-upload-url' && req.method === 'POST') {
        if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
        if (getRoleTier(role || '') !== 'admin') {
            return res.status(403).json({ error: 'Only administrators can upload minutes audio.' });
        }
        const mimeType = String(req.body?.mimeType || 'audio/webm');
        const ext = extensionForAudioMime(mimeType);
        const sessionId = String(req.body?.sessionId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
        const chunkIndex = Math.max(0, Number(req.body?.chunkIndex) || 0);
        const path = `minutes/${user.id}/${sessionId}/chunk-${String(chunkIndex).padStart(3, '0')}.${ext}`;
        const { data, error } = await supabaseAdmin.storage
            .from(MINUTES_AUDIO_BUCKET)
            .createSignedUploadUrl(path);
        if (error || !data?.signedUrl) {
            return res.status(500).json({ error: error?.message || 'Could not create upload URL' });
        }
        return res.status(200).json({
            ok: true,
            path,
            signedUrl: data.signedUrl,
            token: data.token,
            bucket: MINUTES_AUDIO_BUCKET,
        });
    }

    if (subResource === 'transcribe-stored' && req.method === 'POST') {
        if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
        if (getRoleTier(role || '') !== 'admin') {
            return res.status(403).json({ error: 'Only administrators can transcribe minutes audio.' });
        }
        const path = String(req.body?.path || '').trim();
        if (!path.startsWith(`minutes/${user.id}/`)) {
            return res.status(400).json({ error: 'Invalid audio path' });
        }
        const mimeType = String(req.body?.mimeType || 'audio/webm');
        const { data: file, error: dlErr } = await supabaseAdmin.storage.from(MINUTES_AUDIO_BUCKET).download(path);
        if (dlErr || !file) {
            return res.status(404).json({ error: dlErr?.message || 'Audio chunk not found' });
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = extensionForAudioMime(mimeType);
        const result = await transcribeAudioBuffer({
            buffer,
            mimeType,
            filename: `minutes.${ext}`,
        });
        if (result.ok === false) {
            return res.status(503).json({ ok: false, error: result.error });
        }
        const { data: signed } = await supabaseAdmin.storage
            .from(MINUTES_AUDIO_BUCKET)
            .createSignedUrl(path, 60 * 60 * 24 * 7);
        return res.status(200).json({
            ok: true,
            transcript: result.text,
            notes: formatMinutesTranscriptAsNotes(result.text),
            summary: summarizeTranscript(result.text),
            audioUrl: signed?.signedUrl || null,
            audioPath: path,
        });
    }

    if (subResource === 'transcribe' && req.method === 'POST') {
        if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
        if (getRoleTier(role || '') !== 'admin') {
            return res.status(403).json({ error: 'Only administrators can transcribe minutes audio.' });
        }
        const parsed = parseAudioDataUrl(req.body?.audioDataUrl || req.body?.audioBase64);
        if (!parsed) {
            return res.status(400).json({ error: 'audioDataUrl is required' });
        }
        const mimeType = String(req.body?.mimeType || parsed.mimeType || 'audio/webm');
        const buffer = Buffer.from(parsed.base64, 'base64');
        if (!buffer.length) return res.status(400).json({ error: 'Invalid audio data' });
        if (buffer.length > MINUTES_MAX_AUDIO_BYTES) {
            return res.status(400).json({
                error: `Recording is too large (${Math.round(buffer.length / 1024)} KB). Keep under ${Math.round(MINUTES_MAX_AUDIO_BYTES / 1024)} KB.`,
            });
        }
        const ext = extensionForAudioMime(mimeType);
        const path = `minutes/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        let audioUrl: string | null = null;
        const { error: upErr } = await supabaseAdmin.storage.from(MINUTES_AUDIO_BUCKET).upload(path, buffer, {
            contentType: mimeType,
            upsert: false,
        });
        if (upErr) {
            console.warn('[minutes transcribe] storage upload:', upErr.message || upErr);
        } else {
            const { data: signed } = await supabaseAdmin.storage
                .from(MINUTES_AUDIO_BUCKET)
                .createSignedUrl(path, 60 * 60 * 24 * 7);
            audioUrl = signed?.signedUrl || null;
        }

        const result = await transcribeAudioBuffer({
            buffer,
            mimeType,
            filename: `minutes.${ext}`,
        });
        if (result.ok === false) {
            return res.status(503).json({
                ok: false,
                error: result.error || 'Transcription is not configured. Set OPENAI_API_KEY or GEMINI_API_KEY.',
            });
        }
        return res.status(200).json({
            ok: true,
            transcript: result.text,
            notes: formatMinutesTranscriptAsNotes(result.text),
            summary: summarizeTranscript(result.text),
            audioUrl,
            audioPath: upErr ? null : path,
        });
    }

    if (subResource === 'pdf' && req.method === 'GET') {
        if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
        const docId = String(id || documentId || req.query.documentId || '').trim();
        if (!docId) return res.status(400).json({ error: 'id is required' });
        const { data: doc, error } = await supabaseAdmin.from('minutes_documents').select('*').eq('id', docId).single();
        if (error || !doc) return res.status(404).json({ error: 'Document not found' });
        const bytes = buildMinutesPdfBytes({
            title: doc.title,
            meetingDate: doc.meeting_date,
            department: doc.department,
            summary: doc.summary,
            content: doc.content,
            typedSignature: doc.typed_signature,
            signerName: doc.typed_signature,
            handSignature: doc.secretary_signature,
            documentId: doc.id,
        });
        const filename = minutesPdfFilename(doc.title, doc.meeting_date);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.status(200).send(Buffer.from(bytes));
    }

    if (subResource === 'acknowledgements') {
        if (req.method === 'GET') {
            const { userId, documentId } = req.query;
            let q = supabaseAdmin.from('minutes_acknowledgements').select('id, document_id, user_id, status, ip_address, user_agent, signed_at, signature_data, typed_name');
            if (documentId || id) q = q.eq('document_id', documentId || id);
            if (userId) q = q.eq('user_id', userId);
            const { data, error } = await q;
            if (error) throw error;

            // Enrich with user data manually to avoid schema cache issues with joins
            const enrichedAcks = await Promise.all((data || []).map(async (ack: any) => {
                const { data: userData } = await supabaseAdmin.from('users').select('id, name, role').eq('id', ack.user_id).single();
                return { ...ack, user: userData };
            }));

            return res.status(200).json({ ok: true, acknowledgements: enrichedAcks });
        }
        if (req.method === 'POST') {
            const { documentId: dId, userId: uId, requesterRole } = req.body;

            // Only leaders and admins may sign; members are read-only
            const tier = getRoleTier(requesterRole || 'MEMBER');
            if (tier === 'member') {
                return res.status(403).json({ error: 'Members cannot acknowledge minutes. Contact your Ministry Leader.' });
            }

            const ipAddress = req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || null;
            const userAgent = req.headers?.['user-agent'] || null;
            const typedName = String(req.body.typedName || req.body.typed_name || '').trim() || null;

            const { data, error } = await supabaseAdmin
                .from('minutes_acknowledgements')
                .insert([{
                    document_id: dId,
                    user_id: uId,
                    ip_address: ipAddress,
                    user_agent: userAgent,
                    status: 'read',
                    signature_data: req.body.signatureData || null,
                    typed_name: typedName,
                }])
                .select()
                .single();

            if (error) {
                if (error.code === '23505') return res.status(409).json({ error: 'Already acknowledged' });
                throw error;
            }
            return res.status(201).json({ ok: true, acknowledgement: data });
        }
    }

    if (subResource === 'tracking') {
        if (!isAdmin) return res.status(403).json({ error: 'Unauthorized: Only admins can access tracking data' });
        if (req.method === 'GET') {
            const { data, error } = await supabaseAdmin.from('minutes_tracking_summary').select('*');
            if (error) throw error;
            return res.status(200).json({ ok: true, summary: data || [] });
        }
    }

    if (req.query.action === 'send-reminders') {
        const { documentId, mode = 'manual', requesterRole } = req.query;

        // Only admins can send reminders
        if (getRoleTier(requesterRole as string || '') !== 'admin') {
            return res.status(403).json({ error: 'Only administrators can send reminder emails.' });
        }

        // Determine which documents to scan
        let docsToRemind: any[] = [];
        if (documentId) {
            const { data: singleDoc } = await supabaseAdmin.from('minutes_documents').select('*').eq('id', documentId).single();
            if (singleDoc) docsToRemind = [singleDoc];
        } else {
            // Scan all documents with deadlines
            const now = new Date().toISOString();
            const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

            let docsQuery = supabaseAdmin.from('minutes_documents').select('*').not('deadline', 'is', null);
            if (mode === 'overdue') {
                docsQuery = docsQuery.lt('deadline', now);
            } else if (mode === 'due') {
                docsQuery = docsQuery.gte('deadline', now).lte('deadline', in48h);
            } else {
                // manual: all docs with deadlines
                docsQuery = docsQuery.gt('deadline', '2000-01-01');
            }
            const { data: scannedDocs } = await docsQuery;
            docsToRemind = scannedDocs || [];
        }

        if (docsToRemind.length === 0) {
            return res.status(200).json({ ok: true, remindedCount: 0, message: 'No matching documents found.' });
        }

        let totalReminded = 0;
        const resendClient = await getResend();

        for (const doc of docsToRemind) {
            // Find leaders in this document's department
            const { data: leaders } = await supabaseAdmin
                .from('users')
                .select('id, email, name, role')
                .eq('department', doc.department)
                .not('role', 'in', '("MEMBER","GUEST","PARENT","TEACHER","YOUTH","USER")');

            // Find who hasn't acknowledged
            const { data: acks } = await supabaseAdmin
                .from('minutes_acknowledgements')
                .select('user_id')
                .eq('document_id', doc.id);

            const ackedIds = new Set((acks || []).map((a: any) => a.user_id));
            const pendingLeaders = (leaders || []).filter((l: any) => !ackedIds.has(l.id));

            if (pendingLeaders.length > 0 && resendClient) {
                const isOverdue = doc.deadline && new Date(doc.deadline) < new Date();
                const subjectPrefix = isOverdue ? '🚨 OVERDUE' : '⏰ REMINDER';
                const urgencyColor = isOverdue ? '#dc2626' : '#d97706';
                const urgencyText = isOverdue ? 'This acknowledgement is OVERDUE.' : 'This acknowledgement is due soon.';
                const deadlineStr = doc.deadline ? new Date(doc.deadline).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) : 'No deadline set';

                await Promise.all(pendingLeaders.map((l: any) => resendClient.emails.send({
                    from: vaultFrom('PLCC Vault'),
                    to: l.email,
                    subject: `${subjectPrefix}: Sign Meeting Minutes — ${doc.title}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f7; padding: 0; border-radius: 16px; overflow: hidden;">
                            <div style="background: #0d1a14; padding: 32px; text-align: center;">
                                <h1 style="color: #C9A35A; font-size: 20px; margin: 0 0 4px 0; font-weight: 900; letter-spacing: 2px;">PLCC VAULT</h1>
                                <p style="color: rgba(255,255,255,0.6); font-size: 11px; margin: 0; text-transform: uppercase; letter-spacing: 3px;">Meeting Minutes</p>
                            </div>
                            <div style="padding: 32px;">
                                <div style="background: ${urgencyColor}; color: white; padding: 12px 16px; border-radius: 10px; margin-bottom: 24px; font-size: 13px; font-weight: 700; text-align: center;">
                                    ${urgencyText}
                                </div>
                                <p style="color: #333; font-size: 15px;">Hi <strong>${l.name}</strong>,</p>
                                <p style="color: #666; font-size: 14px; line-height: 1.6;">You have not yet acknowledged the following meeting minutes for the <strong>${doc.department}</strong> department:</p>
                                <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 20px 0;">
                                    <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 900; color: #0d1a14;">${doc.title}</p>
                                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #888;">📅 Meeting: ${new Date(doc.meeting_date).toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
                                    <p style="margin: 0; font-size: 12px; color: ${isOverdue ? '#dc2626' : '#d97706'}; font-weight: 700;">⏱ Deadline: ${deadlineStr}</p>
                                </div>
                                <div style="text-align: center; margin: 28px 0;">
                                    <a href="https://portal-awc.org/communication/minutes" style="background: #0d1a14; color: #C9A35A; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: 900; font-size: 13px; display: inline-block; letter-spacing: 2px;">SIGN NOW →</a>
                                </div>
                                <p style="color: #999; font-size: 11px; text-align: center;">This is an automated reminder from PLCC Vault Leadership System.</p>
                            </div>
                        </div>
                    `
                })));
                totalReminded += pendingLeaders.length;
            }
        }

        return res.status(200).json({ ok: true, remindedCount: totalReminded, documentsScanned: docsToRemind.length });
    }

    // Main Minutes Documents
    if (req.method === 'GET') {
        const { parentId, allVersions } = req.query;
        if (id) {
            const { data, error } = await supabaseAdmin.from('minutes_documents').select('*').eq('id', id).single();
            if (error) throw error;
            return res.status(200).json({ ok: true, document: data });
        }

        let q = supabaseAdmin.from('minutes_documents').select('*');
        if (parentId) {
            q = q.eq('parent_id', parentId).order('version', { ascending: false });
        } else if (allVersions !== 'true') {
            q = q.eq('is_latest', true);
        }

        const { data, error } = await q.order('meeting_date', { ascending: false });
        if (error) throw error;
        return res.status(200).json({ ok: true, documents: data || [] });
    }

    if (req.method === 'POST') {
        const { parent_id, requesterRole, audio_url, transcript, typed_signature, secretary_signature, ...docData } = req.body;

        // Only admins can upload/create minutes
        if (getRoleTier(requesterRole || role || '') !== 'admin') {
            return res.status(403).json({ error: 'Only administrators can upload meeting minutes.' });
        }

        let targetVersion = 1;
        let targetParentId = parent_id || null;

        if (parent_id) {
            // Fetch current latest to calculate next version
            const { data: latest } = await supabaseAdmin
                .from('minutes_documents')
                .select('version')
                .eq('parent_id', parent_id)
                .eq('is_latest', true)
                .order('version', { ascending: false })
                .limit(1)
                .single();

            targetVersion = (latest?.version || 1) + 1;

            // Mark previous as not latest
            await supabaseAdmin
                .from('minutes_documents')
                .update({ is_latest: false })
                .eq('parent_id', parent_id);
        }

        const insertRow: Record<string, any> = {
            ...docData,
            parent_id: targetParentId,
            version: targetVersion,
            is_latest: true,
            created_by: user?.id || docData.created_by || null,
            audio_url: audio_url || null,
            transcript: transcript || null,
            typed_signature: typed_signature || null,
            secretary_signature: secretary_signature || null,
        };

        let { data, error } = await supabaseAdmin.from('minutes_documents').insert([insertRow]).select().single();
        if (error && /column|schema cache/i.test(String(error.message || ''))) {
            const { audio_url: _a, transcript: _t, typed_signature: _ts, secretary_signature: _ss, ...coreRow } = insertRow;
            const retry = await supabaseAdmin.from('minutes_documents').insert([coreRow]).select().single();
            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;

        // If new root, self-reference as parent
        if (!targetParentId && data) {
            await supabaseAdmin.from('minutes_documents').update({ parent_id: data.id }).eq('id', data.id);
            data.parent_id = data.id;
        }

        let pdfBuffer: Buffer | null = null;
        let pdfName = minutesPdfFilename(data.title, data.meeting_date);
        try {
            const pdfBytes = buildMinutesPdfBytes({
                title: data.title,
                meetingDate: data.meeting_date,
                department: data.department,
                summary: data.summary,
                content: data.content,
                typedSignature: typed_signature || data.typed_signature,
                signerName: typed_signature || data.typed_signature,
                handSignature: secretary_signature || data.secretary_signature,
                documentId: data.id,
            });
            pdfBuffer = Buffer.from(pdfBytes);
            const pdfPath = `minutes/${data.id}/${pdfName}`;
            const { error: pdfUpErr } = await supabaseAdmin.storage
                .from(MINUTES_AUDIO_BUCKET)
                .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: true });
            if (!pdfUpErr) {
                const { data: signed } = await supabaseAdmin.storage
                    .from(MINUTES_AUDIO_BUCKET)
                    .createSignedUrl(pdfPath, 60 * 60 * 24 * 30);
                if (signed?.signedUrl) {
                    await supabaseAdmin
                        .from('minutes_documents')
                        .update({ file_url: signed.signedUrl })
                        .eq('id', data.id);
                    data.file_url = signed.signedUrl;
                }
            }
        } catch (pdfErr) {
            console.warn('[minutes] PDF generate failed:', pdfErr);
        }

        // --- EMAIL NOTIFICATION (new upload) ---
        try {
            const POLICY_NOTIFY_ROLES = [
                'SUPER_ADMIN', 'PASTOR', 'FIRST_LADY', 'ADMIN', 'ADMIN_STAFF',
                'SECRETARY', 'ASST_SECRETARY', 'FINANCE',
            ];
            let leaders: any[] | null = null;
            if (data.department === 'Policy') {
                const { data: roleLeaders } = await supabaseAdmin
                    .from('users')
                    .select('email, name, role')
                    .in('role', POLICY_NOTIFY_ROLES);
                leaders = roleLeaders;
            } else {
                const { data: deptLeaders } = await supabaseAdmin
                .from('users')
                .select('email, name')
                .eq('department', data.department)
                    .not('role', 'in', '("MEMBER","GUEST","PARENT","TEACHER","YOUTH","USER","PENDING")');
                leaders = deptLeaders;
            }

            if (leaders && leaders.length > 0) {
                const resendClient = await getResend();
                if (resendClient) {
                    const deadlineStr = data.deadline
                        ? `<p style="margin: 0; font-size: 12px; color: #d97706; font-weight: 700;">⏱ Signature Deadline: ${new Date(data.deadline).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}</p>`
                        : '';
                    const kindLabel = data.department === 'Policy' ? 'policy acknowledgement' : 'meeting minutes';
                    await Promise.all(leaders.map((l: any) => resendClient.emails.send({
                        from: vaultFrom('PLCC Vault'),
                        to: l.email,
                        subject: data.department === 'Policy'
                            ? `📋 Policy acknowledgement required — ${data.title}`
                            : `📋 Meeting Minutes PDF — ${data.title}`,
                        html: `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f7; padding: 0; border-radius: 16px; overflow: hidden;">
                                <div style="background: #0d1a14; padding: 32px; text-align: center;">
                                    <h1 style="color: #C9A35A; font-size: 20px; margin: 0 0 4px 0; font-weight: 900; letter-spacing: 2px;">PROMISED LAND CHRISTIAN CENTER</h1>
                                    <p style="color: rgba(255,255,255,0.6); font-size: 11px; margin: 0; text-transform: uppercase; letter-spacing: 3px;">${data.department === 'Policy' ? 'Policy Acknowledgement' : 'Official Meeting Minutes'}</p>
                                </div>
                                <div style="padding: 32px;">
                                    <p style="color: #333; font-size: 15px;">Hi <strong>${l.name}</strong>,</p>
                                    <p style="color: #666; font-size: 14px; line-height: 1.6;">A signed PDF of the ${kindLabel} for <strong>${data.department}</strong> is attached. Please review and add your digital signature in Vault.</p>
                                    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 20px 0;">
                                        <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 900; color: #0d1a14;">${data.title}</p>
                                        <p style="margin: 0 0 4px 0; font-size: 12px; color: #888;">📅 Date: ${new Date(data.meeting_date).toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
                                        ${deadlineStr}
                                    </div>
                                    <div style="text-align: center; margin: 28px 0;">
                                        <a href="https://plcc-vault.vercel.app/#/communication/minutes/${data.id}" style="background: #0d1a14; color: #C9A35A; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: 900; font-size: 13px; display: inline-block; letter-spacing: 2px;">VIEW, SIGN & DOWNLOAD PDF →</a>
                                    </div>
                                </div>
                            </div>
                        `,
                        attachments: pdfBuffer
                            ? [{ filename: pdfName, content: pdfBuffer }]
                            : undefined,
                    })));
                }
            }
        } catch (emailErr) {
            console.error("New-upload email notification failed:", emailErr);
        }

        return res.status(201).json({ ok: true, document: data });
    }

    if (req.method === 'PATCH') {
        const { id: docId, ...updates } = req.body;
        const { data, error } = await supabaseAdmin.from('minutes_documents').update(updates).eq('id', docId).select().single();
        if (error) throw error;
        return res.status(200).json({ ok: true, document: data });
    }

    if (req.method === 'DELETE') {
        const { id: docId } = req.body?.id ? req.body : req.query;
        if (!docId) return res.status(400).json({ error: 'Document ID required' });

        // 1. Delete all acknowledgements for this document first (FK constraint)
        const { error: ackDeleteError } = await supabaseAdmin
            .from('minutes_acknowledgements')
            .delete()
            .eq('document_id', docId);

        if (ackDeleteError) {
            console.error('Failed to delete acknowledgements:', ackDeleteError.message);
            // Non-fatal — continue to attempt document deletion
        }

        // 2. Delete the document itself
        const { error } = await supabaseAdmin
            .from('minutes_documents')
            .delete()
            .eq('id', docId);

        if (error) throw error;
        return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
};

// --- GIVING ---


// --- VIDEOS ---
const handleVideos = async (req: any, res: any) => {
    const { id } = req.query;
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });

    const { user } = await verifyAuth(req, supabaseAdmin);

    if (req.method === 'GET') {
        const { data, error } = await supabaseAdmin.from('videos').select('*').order('is_default', { ascending: false }).order('created_at', { ascending: false });
        if (error) throw error;
        return res.status(200).json({ ok: true, videos: data });
    }

    if (req.method === 'POST') {
        const { title, type, url, scheduleNote } = VideoSchema.parse(req.body);
        const { count } = await supabaseAdmin.from('videos').select('*', { count: 'exact', head: true });
        const { data, error } = await supabaseAdmin.from('videos').insert({
            title,
            type,
            url,
            schedule_note: scheduleNote,
            is_default: count === 0,
            user_id: user?.id || null
        }).select().single();
        if (error) throw error;
        return res.status(201).json({ ok: true, video: data });
    }

    if (req.method === 'DELETE') {
        if (!id) return res.status(400).json({ error: 'ID required' });
        const { error } = await supabaseAdmin.from('videos').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
    }

    if (req.method === 'PATCH') {
        if (!id) return res.status(400).json({ error: 'ID required' });
        await supabaseAdmin.from('videos').update({ is_default: false }).eq('is_default', true);
        const { data, error } = await supabaseAdmin.from('videos').update({ is_default: true }).eq('id', id).select().single();
        if (error) throw error;
        return res.status(200).json({ ok: true, video: data });
    }

    return res.status(405).end();
};

/** Infer provider label from an external video URL. */
const deriveHowToVideoProvider = (url: string): 'youtube' | 'vimeo' | 'direct' | 'other' => {
    const u = String(url || '').toLowerCase();
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
    if (u.includes('vimeo.com')) return 'vimeo';
    if (/\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(u)) return 'direct';
    return 'other';
};

let howtoCategoryColumnReady: boolean | null = null;
const howtoCategorySupported = async (supabaseAdmin: any): Promise<boolean> => {
    if (howtoCategoryColumnReady !== null) return howtoCategoryColumnReady;
    const { error } = await supabaseAdmin.from('howto_videos').select('category').limit(1);
    howtoCategoryColumnReady = !error;
    return howtoCategoryColumnReady;
};

// --- HOW TO VIDEOS (external hotlink library) ---
const handleHowToVideos = async (req: any, res: any) => {
    const { id } = req.query;
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });
    const hasCategory = await howtoCategorySupported(supabaseAdmin);

    if (req.method === 'GET') {
        const auth = await requireAuth(req, res, supabaseAdmin);
        if (!auth) return;
        const { data, error } = await supabaseAdmin
            .from('howto_videos')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        const canSeeDcb = FINANCE_ROLES.has(String(auth.role || '').toUpperCase());
        const videos = (data || [])
            .map((row: any) => ({
                ...row,
                category: row?.category || 'vault',
            }))
            .filter((row: any) => {
                if (row.category === 'dcb' && !canSeeDcb) return false;
                return true;
            });
        return res.status(200).json({ ok: true, videos, categoriesReady: hasCategory });
    }

    if (req.method === 'POST') {
        const auth = await requireAuth(req, res, supabaseAdmin);
        if (!auth) return;
        const parsed = HowToVideoSchema.parse(req.body);
        const category = parsed.category || 'vault';
        if (category === 'dcb' && !FINANCE_ROLES.has(String(auth.role || '').toUpperCase())) {
            return res.status(403).json({ error: 'Only the finance team can add PLCC-DCB how-to videos.' });
        }
        if (!hasCategory && category !== 'vault') {
            return res.status(503).json({
                error: 'How-to sections are not enabled in the database yet. Apply howto_videos_category.sql, then retry.',
            });
        }
        const provider = deriveHowToVideoProvider(parsed.videoUrl);
        const row: Record<string, unknown> = {
            title: parsed.title.trim(),
            description: parsed.description?.trim() || null,
            video_url: parsed.videoUrl.trim(),
            thumbnail_url: parsed.thumbnailUrl.trim(),
            provider,
            created_by: auth.user?.id || null,
        };
        if (hasCategory) row.category = category;
        const { data, error } = await supabaseAdmin
            .from('howto_videos')
            .insert(row)
            .select()
            .single();
        if (error) throw error;
        return res.status(201).json({
            ok: true,
            video: { ...data, category: (data as any)?.category || category },
        });
    }

    if (req.method === 'PATCH') {
        const auth = await requireAuth(req, res, supabaseAdmin);
        if (!auth) return;
        if (!id) return res.status(400).json({ error: 'ID required' });
        const parsed = HowToVideoUpdateSchema.parse(req.body);
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (parsed.title !== undefined) updates.title = parsed.title.trim();
        if (parsed.description !== undefined) {
            updates.description = parsed.description?.trim() || null;
        }
        if (parsed.videoUrl !== undefined) {
            updates.video_url = parsed.videoUrl.trim();
            updates.provider = deriveHowToVideoProvider(parsed.videoUrl);
        }
        if (parsed.thumbnailUrl !== undefined) updates.thumbnail_url = parsed.thumbnailUrl.trim();
        if (parsed.category !== undefined) {
            if (
                parsed.category === 'dcb' &&
                !FINANCE_ROLES.has(String(auth.role || '').toUpperCase())
            ) {
                return res.status(403).json({ error: 'Only the finance team can move videos into PLCC-DCB.' });
            }
            if (!hasCategory) {
                return res.status(503).json({
                    error: 'How-to sections are not enabled in the database yet. Apply howto_videos_category.sql, then retry.',
                });
            }
            updates.category = parsed.category;
        }

        const { data, error } = await supabaseAdmin
            .from('howto_videos')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return res.status(200).json({
            ok: true,
            video: { ...data, category: (data as any)?.category || 'vault' },
        });
    }

    if (req.method === 'DELETE') {
        const auth = await requireAuth(req, res, supabaseAdmin);
        if (!auth) return;
        if (!id) return res.status(400).json({ error: 'ID required' });
        const { error } = await supabaseAdmin.from('howto_videos').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
    }

    return res.status(405).end();
};

// --- TOOLS (Forms, Security) ---
// --- Tools security (forms, submissions, reports, follow-ups, security log) ---
// Every tools route uses the service-role client, which bypasses RLS, so access
// MUST be enforced here. Only the two narrow public-form routes skip login.
const TOOLS_STAFF_ROLES = new Set([
    'SUPER_ADMIN', 'ADMIN', 'ADMIN_STAFF', 'PASTOR', 'FIRST_LADY',
    'SECRETARY', 'ASST_SECRETARY', 'STAFF', 'MINISTRY_LEADER',
]);
const TOOLS_SECURITY_LOG_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'PASTOR']);
const TOOLS_DENIED_ROLES = new Set(['PENDING', 'GUEST', 'KIOSK', '']);
const FORM_WRITABLE_COLUMNS = ['title', 'description', 'type', 'status', 'fields', 'settings'];
const SUBMISSION_WRITABLE_COLUMNS = ['status', 'notes'];

const pickColumns = (body: any, allowed: string[]): Record<string, any> => {
    const out: Record<string, any> = {};
    if (!body || typeof body !== 'object') return out;
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
    }
    return out;
};

const stripServerColumns = (row: any): Record<string, any> => {
    if (!row || typeof row !== 'object') return {};
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = row;
    return rest;
};

// Simple per-instance limiter for the public submission route (serverless
// instances are short-lived; this blunts bursts, Turnstile/WAF is the next step).
const publicSubmissionHits = new Map<string, { windowStart: number; count: number }>();
const PUBLIC_SUBMISSION_LIMIT = 10;
const PUBLIC_SUBMISSION_WINDOW_MS = 10 * 60 * 1000;
const publicSubmissionAllowed = (req: any): boolean => {
    const fwd = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = fwd || String(req.socket?.remoteAddress || 'unknown');
    const now = Date.now();
    const entry = publicSubmissionHits.get(ip);
    if (!entry || now - entry.windowStart > PUBLIC_SUBMISSION_WINDOW_MS) {
        publicSubmissionHits.set(ip, { windowStart: now, count: 1 });
        return true;
    }
    entry.count += 1;
    return entry.count <= PUBLIC_SUBMISSION_LIMIT;
};

const handleTools = async (req: any, res: any) => {
    const { resource: rType, type, id, subResource } = req.query; // type is legacy query param
    const effectiveType = rType === 'tools' ? subResource : (type || rType);
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });

    // ---------- PUBLIC: read ONE active form's definition ----------
    if (effectiveType === 'public-form') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const formId = String(first(req.query.id) || '').trim();
        if (!formId) return res.status(400).json({ ok: false, error: 'Form id is required' });
        const { data, error } = await supabaseAdmin
            .from('forms')
            .select('id, title, description, type, status, fields')
            .eq('id', formId)
            .maybeSingle();
        if (error || !data || data.status !== 'Active') {
            return res.status(404).json({ ok: false, error: 'Form not found or not active' });
        }
        return res.status(200).json({ ok: true, form: data });
    }

    // ---------- PUBLIC: submit to ONE active form ----------
    if (effectiveType === 'public-submission') {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        if (!publicSubmissionAllowed(req)) {
            return res.status(429).json({ ok: false, error: 'Too many submissions. Please try again later.' });
        }
        const formId = String(req.body?.formId || '').trim();
        const raw = req.body?.submissionData;
        if (!formId || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return res.status(400).json({ ok: false, error: 'Invalid submission' });
        }
        const { data: form, error: formErr } = await supabaseAdmin
            .from('forms')
            .select('id, status, fields')
            .eq('id', formId)
            .maybeSingle();
        if (formErr || !form || form.status !== 'Active') {
            return res.status(404).json({ ok: false, error: 'Form not found or not active' });
        }
        // Keep only fields the form actually defines; cap sizes.
        const fields: any[] = Array.isArray(form.fields) ? form.fields : [];
        const clean: Record<string, any> = {};
        for (const field of fields) {
            const name = String(field?.name || '');
            if (!name || !Object.prototype.hasOwnProperty.call(raw, name)) continue;
            const value = raw[name];
            if (typeof value === 'boolean' || typeof value === 'number') clean[name] = value;
            else if (typeof value === 'string') clean[name] = value.slice(0, 5000);
            else if (Array.isArray(value)) clean[name] = value.slice(0, 50).map((v) => String(v).slice(0, 500));
        }
        const { error } = await supabaseAdmin
            .from('form_submissions')
            .insert([{ form_id: formId, submission_data: clean, status: 'Pending' }]);
        if (error) {
            console.error('[Tools] public submission insert failed:', error.message);
            return res.status(500).json({ ok: false, error: 'Failed to submit form' });
        }
        return res.status(201).json({ ok: true });
    }

    // ---------- Everything below requires a signed-in, approved user ----------
    const toolsAuth = await requireAuth(req, res, supabaseAdmin);
    if (!toolsAuth?.user) return;
    const toolsDecision = toolsRouteDecision(toolsAuth.role, String(effectiveType || ''), String(req.method || 'GET'));
    if (toolsDecision === 'forbidden') {
        const securityLog = String(effectiveType || '') === 'security_logs';
        return res.status(403).json({
            ok: false,
            error: securityLog
                ? 'Security logs are limited to administrators.'
                : 'This action requires a staff role.',
        });
    }

    if (effectiveType === 'forms') {
        if (req.method === 'GET') {
            const { data, error } = await supabaseAdmin.from('forms').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            return res.status(200).json({ ok: true, forms: data });
        }
        if (req.method === 'POST') {
            const { data, error } = await supabaseAdmin.from('forms').insert([pickColumns(req.body, FORM_WRITABLE_COLUMNS)]).select().single();
            if (error) throw error;
            return res.status(201).json({ ok: true, form: data });
        }
        if (req.method === 'PATCH') {
            const fid = req.body?.id;
            if (!fid) return res.status(400).json({ ok: false, error: 'id is required' });
            const updates = pickColumns(req.body, FORM_WRITABLE_COLUMNS);
            const { data, error } = await supabaseAdmin.from('forms').update(updates).eq('id', fid).select().single();
            if (error) throw error;
            return res.status(200).json({ ok: true, form: data });
        }
        if (req.method === 'DELETE') {
            const { error } = await supabaseAdmin.from('forms').delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ ok: true });
        }
    }

    if (effectiveType === 'submissions') {
        if (req.method === 'GET') {
            let subQuery = supabaseAdmin.from('form_submissions').select('*, form:forms(title, fields), submitted_by_member:members(first_name, last_name, email)').order('created_at', { ascending: false });
            const filterFormId = first(req.query.formId);
            if (filterFormId) subQuery = subQuery.eq('form_id', filterFormId);
            const { data, error } = await subQuery;
            if (error) throw error;
            return res.status(200).json({ ok: true, submissions: data });
        }
        if (req.method === 'POST') {
            // Staff-entered submission (public visitors use subResource=public-submission)
            const row = {
                form_id: req.body?.form_id || req.body?.formId,
                submission_data: req.body?.submission_data || req.body?.submissionData || {},
                status: req.body?.status || 'Pending',
            };
            if (!row.form_id) return res.status(400).json({ ok: false, error: 'form_id is required' });
            const { data, error } = await supabaseAdmin.from('form_submissions').insert([row]).select().single();
            if (error) throw error;
            return res.status(201).json({ ok: true, submission: data });
        }
        if (req.method === 'PATCH') {
            const sid = req.body?.id;
            if (!sid) return res.status(400).json({ ok: false, error: 'id is required' });
            const updates = pickColumns(req.body, SUBMISSION_WRITABLE_COLUMNS);
            const { data, error } = await supabaseAdmin.from('form_submissions').update(updates).eq('id', sid).select().single();
            if (error) throw error;
            return res.status(200).json({ ok: true, submission: data });
        }
        if (req.method === 'DELETE') {
            const { error } = await supabaseAdmin.from('form_submissions').delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ ok: true });
        }
    }

    if (effectiveType === 'security_logs') {
        if (req.method === 'GET') {
            const { data, error } = await supabaseAdmin.from('security_logs').select('*, created_by_user:users(name)').order('created_at', { ascending: false });
            if (error) throw error;
            return res.status(200).json({ ok: true, logs: data });
        }
        if (req.method === 'POST') {
            const user = toolsAuth.user;
            const { data, error } = await supabaseAdmin.from('security_logs').insert({ ...stripServerColumns(req.body), created_by: user?.id }).select().single();
            if (error) throw error;
            const logAudit = await getAudit();
            await logAudit({
                userId: user?.id,
                action: 'Security Log Entry Created',
                details: {
                    officer: data?.officer_name,
                    activity: data?.activity_type || data?.activity,
                    location: data?.location,
                },
                resourceType: 'security_log',
                resourceId: data?.id,
                severity: 'info',
                req,
            });
            return res.status(201).json({ ok: true, log: data });
        }
        if (req.method === 'PATCH') {
            const { id: logId, ...updates } = req.body || {};
            const targetId = logId || id;
            if (!targetId) return res.status(400).json({ error: 'Missing log id' });
            const allowed = [
                'officer_name',
                'shift',
                'shift_type',
                'activity',
                'activity_type',
                'location',
                'notes',
                'description',
                'status',
            ];
            const safe = Object.fromEntries(
                Object.entries(updates).filter(([k]) => allowed.includes(k))
            );
            const { data, error } = await supabaseAdmin
                .from('security_logs')
                .update(safe)
                .eq('id', targetId)
                .select()
                .single();
            if (error) throw error;
            const logAudit = await getAudit();
            await logAudit({
                action: 'Security Log Entry Updated',
                details: { fields: Object.keys(safe) },
                resourceType: 'security_log',
                resourceId: targetId,
                severity: 'info',
                req,
            });
            return res.status(200).json({ ok: true, log: data });
        }
        if (req.method === 'DELETE') {
            const { error } = await supabaseAdmin.from('security_logs').delete().eq('id', id);
            if (error) throw error;
            const logAudit = await getAudit();
            await logAudit({
                action: 'Security Log Entry Deleted',
                details: { logId: id },
                resourceType: 'security_log',
                resourceId: id as string,
                severity: 'warning',
                req,
            });
            return res.status(200).json({ ok: true });
        }
    }
    if (effectiveType === 'reports') {
        if (req.method === 'GET') {
            const { data, error } = await supabaseAdmin.from('reports').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            return res.status(200).json({ ok: true, reports: data });
        }
        if (req.method === 'GET' && req.query.action === 'run') {
            const { reportId } = req.query;
            if (!reportId) return res.status(400).json({ error: 'Report ID required' });

            const { data: report, error: rErr } = await supabaseAdmin.from('reports').select('*').eq('id', reportId).single();
            if (rErr || !report) throw rErr || new Error('Report not found');

            const config = report.query_config || {};
            let columns: any[] = [];
            let results: any[] = [];

            // Execute logic based on report type in config
            if (config.type === 'finance_summary') {
                const { data } = await supabaseAdmin.from('finance_ledger')
                    .select('amount, type, category, transaction_date')
                    .gte('transaction_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

                const summary = (data || []).reduce((acc: any, curr: any) => {
                    const cat = curr.category || 'Uncategorized';
                    if (!acc[cat]) acc[cat] = { category: cat, inflow: 0, outflow: 0 };
                    if (curr.type === 'Inflow') acc[cat].inflow += Number(curr.amount);
                    else acc[cat].outflow += Number(curr.amount);
                    return acc;
                }, {});

                columns = [
                    { key: 'category', label: 'Category' },
                    { key: 'inflow', label: 'Total Inflow ($)' },
                    { key: 'outflow', label: 'Total Outflow ($)' }
                ];
                results = Object.values(summary);
            } else if (config.type === 'expense_breakdown') {
                const { data } = await supabaseAdmin.from('finance_ledger')
                    .select('amount, category, description, transaction_date')
                    .eq('type', 'Outflow')
                    .order('transaction_date', { ascending: false });

                columns = [
                    { key: 'transaction_date', label: 'Date' },
                    { key: 'category', label: 'Category' },
                    { key: 'amount', label: 'Amount ($)' },
                    { key: 'description', label: 'Description' }
                ];
                results = (data || []).map(r => ({
                    ...r,
                    transaction_date: r.transaction_date ? new Date(r.transaction_date).toLocaleDateString() : ''
                }));
            } else if (config.type === 'member_growth') {
                const { data } = await supabaseAdmin.from('members').select('id, first_name, last_name, email, created_at, status');

                const uniqueMembers = new Map();
                (data || []).forEach(m => {
                    const key = m.email ? m.email.toLowerCase().trim() : `${m.first_name || ''}_${m.last_name || ''}`.toLowerCase().trim();
                    if (!uniqueMembers.has(key)) {
                        uniqueMembers.set(key, m);
                    } else if (m.created_at) {
                        const existing = uniqueMembers.get(key);
                        if (new Date(m.created_at) < new Date(existing.created_at)) {
                            uniqueMembers.set(key, m);
                        }
                    }
                });

                const growthMap = Array.from(uniqueMembers.values()).reduce((acc: any, curr: any) => {
                    if (!curr.created_at) return acc;
                    const d = new Date(curr.created_at);
                    const monthKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                    const displayMonth = d.toLocaleString('default', { month: 'short', year: '2-digit' });
                    if (!acc[monthKey]) acc[monthKey] = { month: displayMonth, new_members: 0, _sort: monthKey };
                    acc[monthKey].new_members += 1;
                    return acc;
                }, {});

                columns = [
                    { key: 'month', label: 'Month' },
                    { key: 'new_members', label: 'New Members' }
                ];
                results = Object.values(growthMap).sort((a: any, b: any) => a._sort.localeCompare(b._sort)).map(({ _sort, ...rest }: any) => rest);
            } else if (config.type === 'demographic_spread') {
                const { data } = await supabaseAdmin.from('members').select('id, first_name, last_name, email, status, role');

                const uniqueMembers = new Map();
                (data || []).forEach(m => {
                    const key = m.email ? m.email.toLowerCase().trim() : `${m.first_name || ''}_${m.last_name || ''}`.toLowerCase().trim();
                    if (!uniqueMembers.has(key)) uniqueMembers.set(key, m);
                });

                const spread = Array.from(uniqueMembers.values()).reduce((acc: any, curr: any) => {
                    const status = curr.status || 'Active';
                    if (!acc[status]) acc[status] = { status, count: 0 };
                    acc[status].count += 1;
                    return acc;
                }, {});

                columns = [
                    { key: 'status', label: 'Member Status' },
                    { key: 'count', label: 'Count' }
                ];
                results = Object.values(spread);
            } else if (config.type === 'attendance_trends') {
                const { data } = await supabaseAdmin.from('attendance').select('check_in_time');
                const weekly = (data || []).reduce((acc: any, curr: any) => {
                    const date = new Date(curr.check_in_time);
                    const week = `Week of ${new Date(date.setDate(date.getDate() - date.getDay())).toLocaleDateString()}`;
                    if (!acc[week]) acc[week] = { week, count: 0 };
                    acc[week].count += 1;
                    return acc;
                }, {});

                columns = [
                    { key: 'week', label: 'Service Week' },
                    { key: 'count', label: 'Attendance' }
                ];
                results = Object.values(weekly);
            } else {
                const { data } = await supabaseAdmin.from('members').select('first_name, last_name, email, role, created_at');
                const uniqueMembers = new Map();
                (data || []).forEach(m => {
                    const key = m.email ? m.email.toLowerCase().trim() : `${m.first_name || ''}_${m.last_name || ''}`.toLowerCase().trim();
                    if (!uniqueMembers.has(key)) uniqueMembers.set(key, m);
                });

                columns = [
                    { key: 'name', label: 'Name' },
                    { key: 'email', label: 'Email' },
                    { key: 'role', label: 'Role' }
                ];
                results = Array.from(uniqueMembers.values()).map(m => ({ name: `${m.first_name} ${m.last_name}`, email: m.email, role: m.role }));
            }

            const logAudit = await getAudit();
            await logAudit({ action: 'Report Generated', details: { reportName: report.name, reportId }, resourceType: 'report', resourceId: reportId as string, severity: 'info', req });

            return res.status(200).json({ ok: true, columns, results });
        }
    }

    if (effectiveType === 'followup_templates') {
        if (req.method === 'GET') {
            const { data, error } = await supabaseAdmin.from('followup_templates').select('*').order('name');
            if (error) throw error;
            return res.status(200).json({ ok: true, templates: data });
        }
        if (req.method === 'POST') {
            const { data, error } = await supabaseAdmin.from('followup_templates').insert([pickAllowed(req.body, FOLLOWUP_TEMPLATE_COLUMNS)]).select().single();
            if (error) throw error;
            return res.status(201).json({ ok: true, template: data });
        }
        if (req.method === 'PATCH') {
            const fid = req.body?.id;
            const { data, error } = await supabaseAdmin.from('followup_templates').update(pickAllowed(req.body, FOLLOWUP_TEMPLATE_COLUMNS)).eq('id', fid).select().single();
            if (error) throw error;
            return res.status(200).json({ ok: true, template: data });
        }
        if (req.method === 'DELETE') {
            const { error } = await supabaseAdmin.from('followup_templates').delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ ok: true });
        }
    }

    if (effectiveType === 'followup_workflows') {
        const { action } = req.query;
        if (req.method === 'GET') {
            const { data, error } = await supabaseAdmin.from('followup_workflows').select('*, steps:followup_workflow_steps(*)').order('name');
            if (error) throw error;
            return res.status(200).json({ ok: true, workflows: data });
        }
        if (req.method === 'POST' && action === 'enroll') {
            const { member_id, workflow_id } = req.body;
            // Get workflow steps
            const { data: steps } = await supabaseAdmin.from('followup_workflow_steps').select('*').eq('workflow_id', workflow_id).order('step_order');
            if (steps && steps.length > 0) {
                // Insert first followup
                const firstStep = steps[0];
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + firstStep.delay_days);

                await supabaseAdmin.from('follow_ups').insert({
                    member_id,
                    status: 'Pending',
                    priority: 'Medium',
                    type: 'General',
                    notes: `Enrolled in Pathway Step: ${firstStep.name}`,
                    due_date: dueDate.toISOString()
                });
            }
            return res.status(200).json({ ok: true });
        }
        if (req.method === 'POST') {
            const { steps } = req.body || {};
            const { data: workflow, error } = await supabaseAdmin.from('followup_workflows').insert([pickAllowed(req.body, FOLLOWUP_WORKFLOW_COLUMNS)]).select().single();
            if (error) throw error;
            if (steps && Array.isArray(steps)) {
                const stepsToInsert = steps.map((s: any) => ({
                    ...pickAllowed(s, ['step_order', 'name', 'type', 'delay_days', 'template_id']),
                    workflow_id: workflow.id,
                }));
                await supabaseAdmin.from('followup_workflow_steps').insert(stepsToInsert);
            }
            return res.status(201).json({ ok: true, workflow });
        }
        if (req.method === 'PATCH') {
            const fid = req.body?.id;
            const steps = req.body?.steps;
            const { data: workflow, error } = await supabaseAdmin.from('followup_workflows').update(pickAllowed(req.body, FOLLOWUP_WORKFLOW_COLUMNS)).eq('id', fid).select().single();
            if (error) throw error;
            if (steps && Array.isArray(steps)) {
                await supabaseAdmin.from('followup_workflow_steps').delete().eq('workflow_id', fid);
                const stepsToInsert = steps.map((s: any) => ({
                    ...pickAllowed(s, ['step_order', 'name', 'type', 'delay_days', 'template_id']),
                    workflow_id: fid,
                }));
                await supabaseAdmin.from('followup_workflow_steps').insert(stepsToInsert);
            }
            return res.status(200).json({ ok: true, workflow });
        }
        if (req.method === 'DELETE') {
            const { error } = await supabaseAdmin.from('followup_workflows').delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ ok: true });
        }
    }
    return res.status(405).json({ error: 'Method not allowed or subResource not found' });
};

// =====================================================
// MAIN ENTRY POINT
// =====================================================
export default async function handler(req: any, res: any) {
    try {
        console.log(`[API Request] ${req.method} ${req.url}`);
        const healthResource = String(
            Array.isArray(req.query?.resource) ? req.query.resource[0] : req.query?.resource || ''
        );
        if (healthResource === 'health') {
            const { handleVaultHealth } = await import('./vaultNewsHandler.js');
            return handleVaultHealth(req, res);
        }
        const supabaseAdmin = getSupabaseAdmin();
        if (!supabaseAdmin) {
            console.error('[API Error] Supabase Admin not initialized');
            if (req.query.resource === 'ping') {
                return res.status(200).json({ ok: true, message: 'API Module is alive, but Supabase is not configured' });
            }
            return res.status(503).json({ error: 'Supabase Admin not initialized. Check environment variables.', ok: false });
        }

        if (req.query.resource === 'ping') {
            return res.status(200).json({ ok: true, message: 'API Module and Supabase are both operational' });
        }
        const rawResource = first(req.query.resource);
        const rawSubResource = first(req.query.subResource);
        const rawType = first(req.query.type); // Legacy param

        let resource = rawResource;
        let subResource = rawSubResource || rawType;

        // Auto-detect resource from URL path
        const pathParts = req.url.split('?')[0].split('/').filter(Boolean);
        const pathResource = pathParts[pathParts.length - 1]; // e.g. 'finance' from '/api/finance'

        if (pathResource && pathResource !== 'vault' && pathResource !== 'core') {
            // if resource from query exists but differs from path, assume query resource is the sub-resource
            if (resource && resource !== pathResource && !subResource) {
                subResource = resource;
            }
            resource = pathResource;
        }

        // Normalize subResource if it matches resource (e.g. ?resource=events&subResource=events)
        if (subResource === resource) {
            subResource = null;
        }

        // Legacy Aliasing Logic
        if (!resource || resource === 'chat' || resource === 'prayer' || resource === 'worship' || resource === 'community') {
            subResource = subResource || resource || rawType;
            resource = 'community';
        } else if (resource === 'forms' || resource === 'reports' || resource === 'submissions' || resource === 'security_logs' || resource === 'followup_templates' || resource === 'followup_workflows') {
            subResource = subResource || resource || rawType;
            resource = 'tools';
        } else if (resource === 'minutes') {
            // Minutes is its own resource now
            resource = 'minutes';
        } else if (resource === 'audit') {
            // Audit is handled in community for now
            resource = 'community';
            subResource = 'audit';
        } else if (resource === 'followups' || resource === 'follow_ups') {
            // New alias for followups to point to people resource
            subResource = 'followups';
            resource = 'people';
        }

        // Handle subResource arrays (e.g., ?subResource=chat&subResource=channels)
        if (Array.isArray(req.query.subResource)) {
            const [mainSub, secondarySub] = req.query.subResource;
            subResource = mainSub;
            if (secondarySub) {
                if (resource === 'community' && subResource === 'chat') {
                    req.query.chatType = secondarySub;
                } else if (resource === 'community' && subResource === 'feed') {
                    req.query.feedType = secondarySub;
                } else if (resource === 'tools') {
                    // Potential secondary tools resource? 
                }
            }
        }

        // Normalize subResource for Community
        if (resource === 'community') {
            if (subResource === 'unread-count' || subResource === 'channels' || subResource === 'messages' || subResource === 'ai-message' || subResource === 'dm-channel' || subResource === 'mentors' || subResource === 'mention-candidates' || subResource === 'mark-read' || subResource === 'channel-members' || subResource === 'member-picker' || subResource === 'chat-ministries' || subResource === 'share-image' || subResource === 'voice-token' || subResource === 'voice-token-fallback' || subResource === 'voice-huddle-provider' || subResource === 'voice-daily-token' || subResource === 'voice-huddle-status' || subResource === 'voice-huddle-statuses' || subResource === 'voice-huddle-attendance' || subResource === 'voice-huddle-end' || subResource === 'voice-huddle-can-start' || subResource === 'attachment-upload-url' || subResource === 'room-info' || subResource === 'dm-list' || subResource === 'archives' || subResource === 'room-archive' || subResource === 'pin' || subResource === 'room-settings' || subResource === 'search' || subResource === 'edit-message' || subResource === 'read-receipts' || subResource === 'room-mute' || subResource === 'attachment-confirm' || subResource === 'voice-hand-lower' || subResource === 'voice-participant-mute' || subResource === 'voice-mic-restore' || subResource === 'voice-huddle-mod' || subResource === 'polls' || subResource === 'poll-create' || subResource === 'poll-vote' || subResource === 'poll-close' || subResource === 'cards' || subResource === 'card-options' || subResource === 'card-create' || subResource === 'card-going' || subResource === 'requests' || subResource === 'request-create' || subResource === 'request-update') {
                req.query.chatType = subResource;
                subResource = 'chat';
            }
            if (!subResource) subResource = 'chat';
        }

        // Override the query for handlers that read it directly
        req.query.resource = resource;
        req.query.subResource = subResource;


const DEFAULT_EVENT_SETTINGS = {
    automaticCheckIn: true,
    labelPrinting: false,
    smsReminders: true,
    secureMode: false,
};

const DEFAULT_SYSTEM_SETTINGS = {
    general: {
        publicSearch: false,
        kioskMode: false,
        language: 'English (US)',
        timezone: 'Eastern Standard Time',
    },
    security: {
        mfaRequired: true,
        sessionTimeout: '2 Hours',
        accountLockout: true,
        auditRetention: '7 Years',
    },
    notifications: {
        stewardshipAlerts: true,
        stewardshipThreshold: '1000',
        volunteerShortage: true,
        memberOnboarding: false,
    },
    branding: {
        primaryColor: '#1d372c',
        accentColor: '#C9A35A',
        customDomain: '',
        compactMode: false,
    },
    seasonal: {
        mode: 'automatic',
        effects: true,
        anniversaryMonth: null,
        anniversaryDay: null,
    },
};

const DEFAULT_NOTIFICATION_PREFS = {
    financial: { email: true, push: true, freq: 'Immediate' },
    membership: { email: true, push: false, freq: 'Daily Summary' },
    system: { email: false, push: true, freq: 'Immediate' },
    smartGroup: true,
    insightAccepted: false,
};

const handleSettings = async (req: any, res: any) => {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });

    const { user } = await verifyAuth(req, supabaseAdmin);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const scope = String(req.query.scope || req.body?.scope || 'system');

    const ensureOrgRow = async () => {
        const { data } = await supabaseAdmin.from('organization_settings').select('*').eq('id', 1).maybeSingle();
        if (data) return data;
        const { data: created, error } = await supabaseAdmin
            .from('organization_settings')
            .upsert({ id: 1, updated_at: new Date().toISOString() })
            .select()
            .single();
        if (error) throw error;
        return created;
    };

    try {
        if (req.method === 'GET') {
            if (scope === 'notifications') {
                const { data, error } = await supabaseAdmin
                    .from('users')
                    .select('notification_prefs')
                    .eq('id', user.id)
                    .maybeSingle();
                if (error && String(error.message || '').toLowerCase().includes('notification_prefs')) {
                    return res.status(200).json({ ok: true, settings: DEFAULT_NOTIFICATION_PREFS, warning: 'Run add_settings_persistence.sql' });
                }
                if (error) throw error;
                return res.status(200).json({
                    ok: true,
                    settings: { ...DEFAULT_NOTIFICATION_PREFS, ...(data?.notification_prefs || {}) },
                });
            }

            const org = await ensureOrgRow();
            if (scope === 'events') {
                return res.status(200).json({
                    ok: true,
                    settings: { ...DEFAULT_EVENT_SETTINGS, ...(org.event_settings || {}) },
                });
            }
            if (scope === 'integrations') {
                return res.status(200).json({
                    ok: true,
                    settings: redactIntegrations(org.integrations || {}),
                });
            }
            // system (default)
            return res.status(200).json({
                ok: true,
                settings: {
                    ...DEFAULT_SYSTEM_SETTINGS,
                    ...(org.system_settings || {}),
                    general: { ...DEFAULT_SYSTEM_SETTINGS.general, ...(org.system_settings?.general || {}) },
                    security: { ...DEFAULT_SYSTEM_SETTINGS.security, ...(org.system_settings?.security || {}) },
                    notifications: { ...DEFAULT_SYSTEM_SETTINGS.notifications, ...(org.system_settings?.notifications || {}) },
                    branding: { ...DEFAULT_SYSTEM_SETTINGS.branding, ...(org.system_settings?.branding || {}) },
                    seasonal: { ...DEFAULT_SYSTEM_SETTINGS.seasonal, ...(org.system_settings?.seasonal || {}) },
                },
            });
        }

        if (req.method === 'PATCH' || req.method === 'POST') {
            const settingsDecision = settingsWriteDecision((await verifyAuth(req, supabaseAdmin)).role, scope);
            if (settingsDecision !== 'ok') {
                return res.status(403).json({
                    error: scope === 'events'
                        ? 'Only staff can change check-in settings.'
                        : 'Only church leaders can change church-wide settings.',
                });
            }
            const payload = req.body?.settings ?? req.body?.data ?? req.body;
            if (!payload || typeof payload !== 'object') {
                return res.status(400).json({ error: 'Missing settings payload' });
            }

            if (scope === 'notifications') {
                const merged = { ...DEFAULT_NOTIFICATION_PREFS, ...payload };
                const { data, error } = await supabaseAdmin
                    .from('users')
                    .update({ notification_prefs: merged })
                    .eq('id', user.id)
                    .select('notification_prefs')
                    .single();
                if (error) {
                    if (String(error.message || '').toLowerCase().includes('notification_prefs')) {
                        return res.status(200).json({
                            ok: true,
                            settings: merged,
                            warning: 'Saved locally only — run add_settings_persistence.sql for DB storage.',
                        });
                    }
                    throw error;
                }
                return res.status(200).json({ ok: true, settings: data?.notification_prefs || merged });
            }

            await ensureOrgRow();
            const column =
                scope === 'events' ? 'event_settings' : scope === 'integrations' ? 'integrations' : 'system_settings';

            let toStore = payload;
            if (scope === 'events') toStore = { ...DEFAULT_EVENT_SETTINGS, ...payload };
            if (scope === 'integrations') {
                const org = await ensureOrgRow();
                toStore = mergeIntegrationSettings(org.integrations || {}, payload);
            }
            if (scope === 'system') {
                toStore = {
                    ...DEFAULT_SYSTEM_SETTINGS,
                    ...payload,
                    general: { ...DEFAULT_SYSTEM_SETTINGS.general, ...(payload.general || {}) },
                    security: { ...DEFAULT_SYSTEM_SETTINGS.security, ...(payload.security || {}) },
                    notifications: { ...DEFAULT_SYSTEM_SETTINGS.notifications, ...(payload.notifications || {}) },
                    branding: { ...DEFAULT_SYSTEM_SETTINGS.branding, ...(payload.branding || {}) },
                    seasonal: { ...DEFAULT_SYSTEM_SETTINGS.seasonal, ...(payload.seasonal || {}) },
                };
            }

            const { data, error } = await supabaseAdmin
                .from('organization_settings')
                .update({ [column]: toStore, updated_at: new Date().toISOString() })
                .eq('id', 1)
                .select(column)
                .single();

            if (error) {
                if (String(error.message || '').toLowerCase().includes(column)) {
                    return res.status(200).json({
                        ok: true,
                        settings: scope === 'integrations' ? redactIntegrations(toStore) : toStore,
                        warning: 'Saved in session only — run add_settings_persistence.sql for DB storage.',
                    });
                }
                throw error;
            }
            const saved = (data as any)?.[column] || toStore;
            return res.status(200).json({
                ok: true,
                settings: scope === 'integrations' ? redactIntegrations(saved) : saved,
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err: any) {
        console.error('[Settings] Error:', err);
        return res.status(500).json({ error: err.message || 'Settings error' });
    }
};


        // Accountants may use Fundraisers only. Enforced here, before any handler runs.
        if (req.headers?.authorization) {
            const { accountantRouteDecision } = await import('./routeAccess.js');
            const gateAuth = await verifyAuth(req, supabaseAdmin);
            const decision = accountantRouteDecision(gateAuth.role, {
                resource: String(resource || ''),
                subResource: String(subResource || ''),
                method: String(req.method || 'GET'),
                selfQuery: first(req.query?.self) === 'true',
                bodyId: String(req.body?.id || ''),
                userId: String(gateAuth.user?.id || ''),
                scope: first(req.query?.scope),
            });
            if (decision === 'forbidden') {
                return res.status(403).json({ ok: false, code: 'accountant_scope', error: 'Accountants can use Fundraisers only.' });
            }
        }

        switch (resource) {
            case 'auth': return await handleAuth(req, res);
            case 'auth-otp': return await handleAuthOtp(req, res);
            case 'auth-phone': {
                const { handleAuthPhone } = await import('./authPhone.js');
                return handleAuthPhone(req, res);
            }
            case 'auth-phone-code': {
                const { handleAuthPhoneCode } = await import('./authPhoneCode.js');
                return handleAuthPhoneCode(req, res);
            }
            case 'users': return await handleUsers(req, res);
            case 'events': return await handleEvents(req, res);
            case 'organization': return await handleOrganization(req, res);
            case 'settings': return await handleSettings(req, res);
            case 'rhemanotes': {
                const { default: handleRhemaNotes } = await import('../_handlers/rhemanotes.js');
                return handleRhemaNotes(req, res);
            }
            case 'notifications': return await handleNotifications(req, res);
            case 'ops': return await handleOps(req, res);
            case 'community': return await handleCommunity(req, res);
            case 'family': {
                const { handleFamily } = await import('./familyHuddleHandler.js');
                return handleFamily(req, res);
            }
            case 'ark': {
                const { handleArk } = await import('./arkHandler.js');
                return handleArk(req, res);
            }
            case 'sso': {
                const { handleSsoHandoff } = await import('./ssoHandoffHandler.js');
                return handleSsoHandoff(req, res);
            }
            case 'kids-bucks': {
                const { handleKidsBucks } = await import('./kidsBucksHandler.js');
                return handleKidsBucks(req, res);
            }
            case 'fundraisers': {
                const { handleFundraisers } = await import('./fundraisersHandler.js');
                return handleFundraisers(req, res);
            }
            case 'tools': return await handleTools(req, res);
            case 'finance': return await handleFinance(req, res);
            case 'minutes': return await handleMinutes(req, res);
            case 'giving': return await handleGiving(req, res);
            case 'store-orders': return await handleStoreOrders(req, res);
            case 'ask-admin': return await handleAskAdmin(req, res);
            case 'vault-repair': {
                const { handleVaultRepair } = await import('./vaultRepairHandler.js');
                return handleVaultRepair(req, res);
            }
            case 'daily': {
                const { handleDaily } = await import('./dailyHandler.js');
                return handleDaily(req, res);
            }
            case 'push': {
                const { handlePush } = await import('./pushAlerts.js');
                return handlePush(req, res);
            }
            case 'celebrations': {
                const { handleCelebrations } = await import('./celebrations.js');
                return handleCelebrations(req, res);
            }
            case 'vault-news': {
                const { handleVaultNews } = await import('./vaultNewsHandler.js');
                return handleVaultNews(req, res);
            }
            case 'vault-search': {
                const { handleVaultSearch } = await import('./vaultSearchHandler.js');
                return handleVaultSearch(req, res);
            }
            case 'health': {
                const { handleVaultHealth } = await import('./vaultNewsHandler.js');
                return handleVaultHealth(req, res);
            }
            case 'kids-plans': {
                const { handleKidsMinistryPlans } = await import('./kidsMinistryPlansHandler.js');
                return handleKidsMinistryPlans(req, res);
            }
            case 'share-flyers': {
                const { handleShareFlyers } = await import('./shareFlyersHandler.js');
                return handleShareFlyers(req, res);
            }
            case 'videos': return await handleVideos(req, res);
            case 'howto-videos': return await handleHowToVideos(req, res);
            case 'audit': {
                req.query.subResource = 'audit';
                return await handleCommunity(req, res);
            }
            case 'communication': return await handleCommunication(req, res);
            case 'attendance': {
                const { subResource: attendanceSub } = req.query;
                if (String(attendanceSub || '') === 'sessions') {
                    const { handleAttendanceSessions } = await import('./attendanceSessionHandler.js');
                    return handleAttendanceSessions(req, res);
                }
                if (String(attendanceSub || '') === 'check-in') {
                    const { handleAttendanceCheckin } = await import('./attendanceCheckinHandler.js');
                    return handleAttendanceCheckin(req, res);
                }
                if (String(attendanceSub || '') === 'records') {
                    const { handleAttendanceRecords } = await import('./attendanceRecordsHandler.js');
                    return handleAttendanceRecords(req, res);
                }
                if (String(attendanceSub || '') === 'today') {
                    const { handleAttendanceToday } = await import('./attendanceTodayHandler.js');
                    return handleAttendanceToday(req, res);
                }
                if (
                    String(attendanceSub || '') === 'kids-custody-lookup' ||
                    String(attendanceSub || '') === 'kids-custody-checkin' ||
                    String(attendanceSub || '') === 'kids-custody-checkout' ||
                    String(attendanceSub || '') === 'kids-custody-open'
                ) {
                    const { handleKidsCustody } = await import('./kidsCustodyHandler.js');
                    return handleKidsCustody(req, res);
                }
                if (
                    String(attendanceSub || '') === 'household-preview' ||
                    String(attendanceSub || '') === 'household-checkin'
                ) {
                    const { handleHouseholdCheckin } = await import('./householdCheckinHandler.js');
                    return handleHouseholdCheckin(req, res);
                }
                if (
                    String(attendanceSub || '') === 'self-qr' ||
                    String(attendanceSub || '') === 'self-check-in' ||
                    String(attendanceSub || '') === 'kids-self-check-in' ||
                    String(attendanceSub || '') === 'my-points' ||
                    String(attendanceSub || '') === 'points-leaderboard'
                ) {
                    const { handleCheckinPoints } = await import('./checkinPointsHandler.js');
                    return handleCheckinPoints(req, res);
                }
                if (String(attendanceSub || '') === 'dashboard') {
                    const { handleAttendanceDashboard } = await import('./attendanceDashboardHandler.js');
                    return handleAttendanceDashboard(req, res);
                }
                return res.status(404).json({
                    ok: false,
                    error: 'Unknown attendance subResource.',
                    code: 'not_found',
                });
            }
            case 'people': {
                const supabaseAdmin = getSupabaseAdmin();
                if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });
                const { user, role: peopleRole } = await verifyAuth(req, supabaseAdmin);
                const { subResource, memberId, tagId, action, userId, id } = req.query;
                const peopleRosterAllowed = canViewPeopleRoster(peopleRole);
                const requirePeopleStaff = () => {
                    if (!user) {
                        res.status(401).json({ ok: false, error: 'Unauthorized: valid Bearer token required' });
                        return false;
                    }
                    if (!peopleRosterAllowed) {
                        res.status(403).json({ ok: false, error: 'Only pastoral and admin staff can change people records.' });
                        return false;
                    }
                    return true;
                };

                if (String(subResource || '') === 'family-identity') {
                    const { handleFamilyAdmin } = await import('./familyAdminHandler.js');
                    return handleFamilyAdmin(req, res);
                }

                if (String(subResource || '') === 'card-resolver') {
                    const { handleCardResolver } = await import('./cardResolverHandler.js');
                    return handleCardResolver(req, res);
                }

                if (String(subResource || '') === 'directory-privacy') {
                    if (req.method !== 'GET') {
                        return res.status(405).json({ ok: false, error: 'Method not allowed' });
                    }
                    if (!user) {
                        return res.status(401).json({ ok: false, error: 'Unauthorized: valid Bearer token required' });
                    }
                    if (!peopleRosterAllowed) {
                        return res.status(403).json({
                            ok: false,
                            error: 'Only pastoral and admin staff can view member directory privacy.',
                        });
                    }
                    const mId = String(memberId || req.query.member_id || '').trim();
                    if (!mId || !UUID_RE.test(mId)) {
                        return res.status(400).json({ ok: false, error: 'memberId required' });
                    }
                    const { data: priv, error: privErr } = await supabaseAdmin
                        .from('member_directory_privacy')
                        .select(
                            'member_id, directory_opt_in, show_photo, show_phone, show_email, show_birthday, show_anniversary, show_household, show_ministries, updated_at'
                        )
                        .eq('member_id', mId)
                        .maybeSingle();
                    if (privErr) {
                        // Table may not be applied yet — fail soft for staff UI.
                        console.error('[Vault API] directory-privacy:', privErr.message);
                        return res.status(200).json({
                            ok: true,
                            privacy: null,
                            unavailable: true,
                        });
                    }
                    if (!priv) {
                        return res.status(200).json({
                            ok: true,
                            privacy: {
                                directoryOptIn: false,
                                showPhoto: false,
                                showPhone: false,
                                showEmail: false,
                                showBirthday: false,
                                showAnniversary: false,
                                showHousehold: false,
                                showMinistries: false,
                                updatedAt: null,
                            },
                        });
                    }
                    return res.status(200).json({
                        ok: true,
                        privacy: {
                            directoryOptIn: Boolean(priv.directory_opt_in),
                            showPhoto: Boolean(priv.show_photo),
                            showPhone: Boolean(priv.show_phone),
                            showEmail: Boolean(priv.show_email),
                            showBirthday: Boolean(priv.show_birthday),
                            showAnniversary: Boolean(priv.show_anniversary),
                            showHousehold: Boolean(priv.show_household),
                            showMinistries: Boolean(priv.show_ministries),
                            updatedAt: priv.updated_at || null,
                        },
                    });
                }

                if (subResource === 'followups') {
                    if (req.method === 'GET') {
                        if (!requirePeopleStaff()) return;
                        const mId = memberId || req.query.member_id;
                        let q = supabaseAdmin.from('follow_ups').select('*, member:members!member_id(first_name, last_name, avatar_url), assigned_to_members:members!assigned_to_id(first_name, last_name, avatar_url)').order('due_date', { ascending: false });
                        if (mId) q = q.eq('member_id', mId);
                        const { data, error } = await q;
                        if (error) throw error;
                        // Clean up relationship name for UI expectations
                        const followUps = (data || []).map((f: any) => ({
                            ...f,
                            assigned_to: f.assigned_to_members
                        }));
                        return res.status(200).json({ ok: true, followUps });
                    }
                    if (req.method === 'POST') {
                        if (!requirePeopleStaff()) return;
                        const { data, error } = await supabaseAdmin.from('follow_ups').insert([pickAllowed(req.body, FOLLOW_UP_COLUMNS)]).select().single();
                        if (error) throw error;
                        await notifyFollowUpAssignee(supabaseAdmin, data);
                        return res.status(201).json({ ok: true, followUp: data });
                    }
                    if (req.method === 'PATCH') {
                        if (!requirePeopleStaff()) return;
                        const fid = req.body?.id;
                        const updates = pickAllowed(req.body, FOLLOW_UP_COLUMNS);
                        const { data: previous } = await supabaseAdmin
                            .from('follow_ups')
                            .select('assigned_to_id')
                            .eq('id', fid)
                            .maybeSingle();
                        const { data, error } = await supabaseAdmin.from('follow_ups').update(updates).eq('id', fid).select().single();
                        if (error) throw error;
                        if (data?.assigned_to_id && data.assigned_to_id !== previous?.assigned_to_id) {
                            await notifyFollowUpAssignee(supabaseAdmin, data);
                        }
                        return res.status(200).json({ ok: true, followUp: data });
                    }
                    if (req.method === 'DELETE') {
                        if (!requirePeopleStaff()) return;
                        const { id: fid } = req.body || req.query;
                        const { error } = await supabaseAdmin.from('follow_ups').delete().eq('id', fid);
                        if (error) throw error;
                        return res.status(200).json({ ok: true });
                    }
                }

                if (subResource === 'tags') {
                    if (req.method === 'GET') {
                        if (memberId) {
                            const { data, error } = await supabaseAdmin.from('member_tags').select('tags(*)').eq('member_id', memberId);
                            if (error) throw error;
                            return res.status(200).json({ ok: true, tags: (data || []).map((d: any) => d.tags).filter(Boolean) });
                        }
                        const { data, error } = await supabaseAdmin.from('tags').select('*').order('name');
                        if (error) throw error;
                        return res.status(200).json({ ok: true, tags: data });
                    }
                    if (req.method === 'POST' && action === 'assign') {
                        if (!requirePeopleStaff()) return;
                        const { memberId: mId, tagId: tId } = req.body;
                        const { error } = await supabaseAdmin.from('member_tags').upsert({ member_id: mId || memberId, tag_id: tId || tagId }, { onConflict: 'member_id, tag_id' });
                        if (error) throw error;
                        return res.status(200).json({ ok: true });
                    }
                    if (req.method === 'DELETE' && action === 'assign') {
                        if (!requirePeopleStaff()) return;
                        const { memberId: mId, tagId: tId } = req.body || req.query;
                        const { error } = await supabaseAdmin.from('member_tags').delete().eq('member_id', mId || memberId).eq('tag_id', tId || tagId);
                        if (error) throw error;
                        return res.status(200).json({ ok: true });
                    }
                    if (req.method === 'POST') {
                        if (!requirePeopleStaff()) return;
                        const { data, error } = await supabaseAdmin.from('tags').insert([pickAllowed(req.body, TAG_COLUMNS)]).select().single();
                        if (error) throw error;
                        return res.status(201).json({ ok: true, tag: data });
                    }
                    if (req.method === 'DELETE') {
                        if (!requirePeopleStaff()) return;
                        const { error } = await supabaseAdmin.from('tags').delete().eq('id', id || tagId);
                        if (error) throw error;
                        return res.status(200).json({ ok: true });
                    }
                }

                if (subResource === 'ministries') {
                    if (req.method === 'GET') {
                        const { data, error } = await supabaseAdmin.from('ministries').select('*').order('name');
                        if (error) throw error;
                        return res.status(200).json({ ok: true, ministries: data });
                    }
                    if (req.method === 'POST') {
                        if (!requirePeopleStaff()) return;
                        const { data, error } = await supabaseAdmin.from('ministries').insert([pickAllowed(req.body, MINISTRY_COLUMNS)]).select().single();
                        if (error) throw error;
                        return res.status(201).json({ ok: true, ministry: data });
                    }
                    if (req.method === 'PATCH') {
                        if (!requirePeopleStaff()) return;
                        const mid = req.body?.id;
                        const { data, error } = await supabaseAdmin.from('ministries').update(pickAllowed(req.body, MINISTRY_COLUMNS)).eq('id', mid).select().single();
                        if (error) throw error;
                        return res.status(200).json({ ok: true, ministry: data });
                    }
                    if (req.method === 'DELETE') {
                        if (!requirePeopleStaff()) return;
                        const { id: mid } = req.body;
                        const { error } = await supabaseAdmin.from('ministries').delete().eq('id', mid);
                        if (error) throw error;
                        return res.status(200).json({ ok: true });
                    }
                }

                if (subResource === 'teams') {
                    if (req.method === 'GET' && action === 'memberships') {
                        const { data, error } = await supabaseAdmin.from('team_members').select('team_id').eq('member_id', userId || user?.id);
                        if (error) throw error;
                        return res.status(200).json({ ok: true, teamIds: (data || []).map((m: any) => m.team_id) });
                    }
                    if (req.method === 'GET') {
                        // Ensure Events Ministry exists for onboarding + Identity Profile pickers.
                        // Use limit(1) — maybeSingle() returns null when duplicates exist, which
                        // previously re-inserted "Events Ministry" on every teams list request.
                        const { data: existingEvents } = await supabaseAdmin
                            .from('teams')
                            .select('id, created_at')
                            .ilike('name', 'Events Ministry')
                            .order('created_at', { ascending: true });
                        if (!existingEvents?.length) {
                            await supabaseAdmin.from('teams').insert([{
                                name: 'Events Ministry',
                                description: 'Plan and serve church events, cookouts, and special gatherings.',
                                category: 'Events',
                                color: 'bg-burgundy',
                                icon_name: 'Calendar',
                            }]);
                        } else if (existingEvents.length > 1) {
                            // Collapse accidental duplicates into the oldest row.
                            const keepId = existingEvents[0].id;
                            const dropIds = existingEvents.slice(1).map((r: any) => r.id);
                            const { data: orphanMembers } = await supabaseAdmin
                                .from('team_members')
                                .select('member_id')
                                .in('team_id', dropIds);
                            for (const row of orphanMembers || []) {
                                const { error: moveErr } = await supabaseAdmin
                                    .from('team_members')
                                    .insert({ team_id: keepId, member_id: row.member_id });
                                if (moveErr && !String(moveErr.message || '').toLowerCase().includes('duplicate')) {
                                    console.warn('[teams] Events Ministry member merge skipped:', moveErr.message);
                                }
                            }
                            await supabaseAdmin.from('team_members').delete().in('team_id', dropIds);
                            await supabaseAdmin.from('teams').delete().in('id', dropIds);
                        }

                        const { data, error } = await supabaseAdmin.from('teams').select('*').order('name');
                        if (error) throw error;

                        const enrichedTeams = await Promise.all((data || []).map(async (t: any) => {
                            try {
                                // Get member IDs for this team (no FK join — avoids ambiguity errors)
                                const { data: tmRows, count } = await supabaseAdmin
                                    .from('team_members')
                                    .select('member_id', { count: 'exact' })
                                    .eq('team_id', t.id);

                                let isJoined = false;
                                if (userId) {
                                    isJoined = (tmRows || []).some((r: any) => r.member_id === userId);
                                }

                                // Fetch member details separately using the collected IDs
                                const memberIds = (tmRows || []).map((r: any) => r.member_id).filter(Boolean);
                                let members: any[] = [];
                                if (memberIds.length > 0) {
                                    const { data: memberData } = await supabaseAdmin
                                        .from('members')
                                        .select('id, first_name, last_name, avatar_url, role')
                                        .in('id', memberIds);
                                    members = (memberData || []).map((m: any) => ({
                                        id: m.id,
                                        firstName: m.first_name,
                                        lastName: m.last_name,
                                        avatarUrl: m.avatar_url,
                                        role: m.role || 'Member'
                                    }));
                                }

                                return { ...t, memberCount: count || memberIds.length, isJoined, members };
                            } catch (e) {
                                return { ...t, memberCount: 0, isJoined: false, members: [] };
                            }
                        }));

                        // Display-safe unique list (normalized name) in case other dupes remain.
                        const seenNames = new Set<string>();
                        const uniqueTeams = enrichedTeams.filter((t: any) => {
                            const key = String(t?.name || '').trim().toLowerCase();
                            if (!key || seenNames.has(key)) return false;
                            seenNames.add(key);
                            return true;
                        });

                        return res.status(200).json({ ok: true, teams: uniqueTeams });
                    }
                    if (req.method === 'POST' && action === 'join') {
                        const { teamId, memberId: mId } = req.body;
                        const targetMemberId = mId || userId || user?.id;
                        console.log(`[Join Action] Team: ${teamId}, Member: ${targetMemberId}`);

                        const performJoin = async (id: string) => {
                            return await supabaseAdmin.from('team_members').insert({
                                team_id: teamId,
                                member_id: id
                            });
                        };

                        let { error } = await performJoin(targetMemberId);

                        if (error) {
                            console.error('[Join Error Initial]', error);
                            
                            // 1. Handle Duplicate
                            if (error.code === '23505') {
                                return res.status(200).json({ ok: true, message: 'Already joined' });
                            }

                            // 2. Handle Missing Member (FK Violation)
                            if (error.code === '23503' && error.message?.includes('member_id')) {
                                console.log(`[Join Action] Member ${targetMemberId} missing. Attempting auto-creation...`);
                                
                                // Fetch user info to populate member record
                                const { data: userData } = await supabaseAdmin.from('users').select('*').eq('id', targetMemberId).maybeSingle();
                                
                                if (userData) {
                                    const names = (userData.name || 'User').split(' ');
                                    const firstName = names[0];
                                    const lastName = names.slice(1).join(' ') || 'Admin';

                                    const { error: createError } = await supabaseAdmin.from('members').insert({
                                        id: targetMemberId,
                                        first_name: firstName,
                                        last_name: lastName,
                                        email: userData.email,
                                        status: 'Active',
                                        role: userData.role || 'Member',
                                        access_code: generateAccessCode()
                                    });

                                    if (!createError) {
                                        console.log(`[Join Action] Successfully created missing member ${targetMemberId}. Retrying join...`);
                                        const { error: retryError } = await performJoin(targetMemberId);
                                        error = retryError;
                                    } else {
                                        console.error('[Join Action] Failed to auto-create member:', createError);
                                        error = createError;
                                    }
                                } else {
                                    console.error('[Join Action] Cannot auto-create member: User not found in users table.');
                                }
                            }
                        }

                        if (error) {
                            return res.status(500).json({ ok: false, error: error.message, details: error });
                        }
                        return res.status(200).json({ ok: true });
                    }
                    if (req.method === 'POST' && action === 'leave') {
                        const { teamId, memberId: mId } = req.body;
                        const { error } = await supabaseAdmin.from('team_members').delete().eq('team_id', teamId).eq('member_id', mId);
                        if (error) throw error;
                        return res.status(200).json({ ok: true });
                    }
                    if (req.method === 'POST') {
                        if (!requirePeopleStaff()) return;
                        const { data, error } = await supabaseAdmin.from('teams').insert([{
                            name: req.body.name, description: req.body.description, leader_id: req.body.leaderId || null,
                            color: req.body.color, icon_name: req.body.iconName, ministry_id: req.body.ministryId || null
                        }]).select().single();
                        if (error) throw error;
                        return res.status(201).json({ ok: true, team: data });
                    }
                    if (req.method === 'PATCH') {
                        if (!requirePeopleStaff()) return;
                        const tid = req.body?.id;
                        const { data, error } = await supabaseAdmin.from('teams').update({
                            ...pickAllowed(req.body, TEAM_COLUMNS),
                            leader_id: req.body?.leaderId || req.body?.leader_id || null,
                            ministry_id: req.body?.ministryId || req.body?.ministry_id || null,
                        }).eq('id', tid).select().single();
                        if (error) throw error;
                        return res.status(200).json({ ok: true, team: data });
                    }
                    if (req.method === 'DELETE') {
                        if (!requirePeopleStaff()) return;
                        const { id: tid } = req.body;
                        const { error } = await supabaseAdmin.from('teams').delete().eq('id', tid);
                        if (error) throw error;
                        return res.status(200).json({ ok: true });
                    }
                }

                if (subResource === 'connect-cards') {
                    if (req.method === 'GET') {
                        if (!requirePeopleStaff()) return;
                        const { data, error } = await supabaseAdmin
                            .from('connect_cards')
                            .select('*')
                            .order('created_at', { ascending: false });
                        if (error) throw error;
                        return res.status(200).json({ ok: true, cards: data || [] });
                    }
                    if (req.method === 'PATCH') {
                        if (!requirePeopleStaff()) return;
                        const id = req.body?.id;
                        const { data, error } = await supabaseAdmin
                            .from('connect_cards')
                            .update(pickAllowed(req.body, CONNECT_CARD_COLUMNS))
                            .eq('id', id)
                            .select()
                            .single();
                        if (error) throw error;
                        return res.status(200).json({ ok: true, card: data });
                    }
                    if (req.method === 'DELETE') {
                        if (!requirePeopleStaff()) return;
                        const { id: cid } = req.body || req.query;
                        const { error } = await supabaseAdmin
                            .from('connect_cards')
                            .delete()
                            .eq('id', cid);
                        if (error) throw error;
                        return res.status(200).json({ ok: true });
                    }
                }

                if (subResource === 'plan-a-visit') {
                    if (req.method === 'GET') {
                        if (!requirePeopleStaff()) return;
                        const { data, error } = await supabaseAdmin
                            .from('visit_registrations')
                            .select('*')
                            .order('created_at', { ascending: false });
                        if (error) throw error;
                        return res.status(200).json({ ok: true, registrations: data || [] });
                    }
                    if (req.method === 'PATCH') {
                        if (!requirePeopleStaff()) return;
                        const id = req.body?.id;
                        const { data, error } = await supabaseAdmin
                            .from('visit_registrations')
                            .update(pickAllowed(req.body, VISIT_COLUMNS))
                            .eq('id', id)
                            .select()
                            .single();
                        if (error) throw error;
                        return res.status(200).json({ ok: true, registration: data });
                    }
                    if (req.method === 'DELETE') {
                        if (!requirePeopleStaff()) return;
                        const { id: rid } = req.body || req.query;
                        const { error } = await supabaseAdmin
                            .from('visit_registrations')
                            .delete()
                            .eq('id', rid);
                        if (error) throw error;
                        return res.status(200).json({ ok: true });
                    }
                }

                if (subResource === 'households') {
                    const householdErrorResponse = (error: any) => {
                        const code = String(error?.code || '');
                        if (code === '23505') {
                            return res.status(409).json({ ok: false, error: 'Another household already uses that name. Please choose a different name.' });
                        }
                        if (code === '23503') {
                            return res.status(409).json({ ok: false, error: 'This household still has members linked to it. Remove or move them first, then try again.' });
                        }
                        if (code === 'PGRST116') {
                            return res.status(404).json({ ok: false, error: 'Household not found. Refresh the page and try again.' });
                        }
                        console.error('[households]', error);
                        return res.status(500).json({ ok: false, error: error?.message || 'Could not save household.' });
                    };
                    if (req.method === 'GET') {
                        if (!user) {
                            return res.status(401).json({ ok: false, error: 'Unauthorized: valid Bearer token required' });
                        }
                        if (!peopleRosterAllowed) {
                            return res.status(403).json({
                                ok: false,
                                error: 'Only pastoral and admin staff can view household member contacts.',
                            });
                        }
                        const { data, error } = await supabaseAdmin.from('households').select('*').order('name');
                        if (error) throw error;

                        // Attempt to get members if possible, otherwise return basic households
                        const enrichedHouseholds = await Promise.all(data.map(async (h: any) => {
                            try {
                                // Try household_id first, fallback to household_name if it fails (schema mismatch)
                                let { data: members, error } = await supabaseAdmin.from('members').select('*').eq('household_id', h.id);
                                if (error && error.message.includes('household_id')) {
                                    const { data: membersByName } = await supabaseAdmin.from('members').select('*').eq('household_name', h.name);
                                    members = membersByName;
                                }
                                return { ...h, members: members || [] };
                            } catch (e) {
                                return { ...h, members: [] };
                            }
                        }));
                        return res.status(200).json({ ok: true, households: enrichedHouseholds });
                    }
                    if (req.method === 'POST' && String(req.query?.action || '') === 'merge') {
                        if (!requirePeopleStaff()) return;
                        const mergeRole = String(peopleRole || '').toUpperCase();
                        if (!['SUPER_ADMIN', 'ADMIN', 'PASTOR'].includes(mergeRole)) {
                            return res.status(403).json({ ok: false, error: 'Only Admin, Super Admin or Pastor can merge households.' });
                        }
                        const keepId = String(req.body?.keepId || '').trim();
                        const mergeIds: string[] = Array.isArray(req.body?.mergeIds)
                            ? Array.from(new Set(req.body.mergeIds.map((v: any) => String(v || '').trim()).filter(Boolean)))
                            : [];
                        if (!keepId || mergeIds.length === 0) {
                            return res.status(400).json({ ok: false, error: 'Choose the household to keep and at least one to merge into it.' });
                        }
                        const { data: mergeResult, error: mergeErr } = await supabaseAdmin.rpc('merge_households', {
                            p_keep: keepId,
                            p_merge: mergeIds,
                        });
                        if (mergeErr) {
                            const mcode = String((mergeErr as any).code || '');
                            if (mcode === 'PGRST202' || mcode === '42883') {
                                return res.status(503).json({ ok: false, error: 'Merging isn\'t set up yet. Ask your admin to run the household merge update in Supabase.' });
                            }
                            if (mcode === '22023' || mcode === 'P0002') {
                                return res.status(400).json({ ok: false, error: mergeErr.message });
                            }
                            return householdErrorResponse(mergeErr);
                        }
                        return res.status(200).json({ ok: true, result: mergeResult });
                    }
                    if (req.method === 'POST') {
                        if (!requirePeopleStaff()) return;
                        const { head_member_id: _ignoredHead, ...newHousehold } = pickAllowed(req.body, HOUSEHOLD_COLUMNS);
                        const { data, error } = await supabaseAdmin.from('households').insert([{ ...newHousehold, user_id: user?.id || null }]).select().single();
                        if (error) return householdErrorResponse(error);
                        return res.status(201).json({ ok: true, household: data });
                    }
                    if (req.method === 'PATCH') {
                        if (!requirePeopleStaff()) return;
                        const id = req.body?.id;
                        if (!id) return res.status(400).json({ ok: false, error: 'Household id is required.' });
                        const patch = pickAllowed(req.body, HOUSEHOLD_COLUMNS);
                        if ('name' in patch) {
                            patch.name = String(patch.name || '').trim();
                            if (!patch.name) return res.status(400).json({ ok: false, error: 'Household name is required.' });
                        }
                        if ('head_member_id' in patch) {
                            const headId = String(patch.head_member_id || '').trim();
                            patch.head_member_id = headId || null;
                            if (headId) {
                                const { data: headRow } = await supabaseAdmin
                                    .from('members')
                                    .select('id, household_id')
                                    .eq('id', headId)
                                    .maybeSingle();
                                if (!headRow || String(headRow.household_id || '') !== String(id)) {
                                    return res.status(400).json({ ok: false, error: 'The head of household must be a member of this household.' });
                                }
                            }
                        }
                        patch.updated_at = new Date().toISOString();
                        const { data, error } = await supabaseAdmin.from('households').update(patch).eq('id', id).select().single();
                        if (error) return householdErrorResponse(error);
                        return res.status(200).json({ ok: true, household: data });
                    }
                    if (req.method === 'DELETE') {
                        if (!requirePeopleStaff()) return;
                        const { id: hId } = req.body;
                        const { error } = await supabaseAdmin.from('households').delete().eq('id', hId);
                        if (error) return householdErrorResponse(error);
                        return res.status(200).json({ ok: true });
                    }
                }

                if (String(subResource || '') === 'team-applications') {
                    const { handleTeamApplications } = await import('./teamApplicationsHandler.js');
                    return handleTeamApplications(req, res);
                }

                if (String(subResource || '') === 'member-pass') {
                    const { handleMemberPass } = await import('./memberPassHandler.js');
                    return handleMemberPass(req, res);
                }

                if (String(subResource || '') === 'member-directory') {
                    const { handleMemberDirectorySearch } = await import('./memberDirectorySearchHandler.js');
                    return handleMemberDirectorySearch(req, res, supabaseAdmin, user);
                }

                if (String(subResource || '') === 'member-presence') {
                    const { handleMemberPresence } = await import('./memberPresenceHandler.js');
                    return handleMemberPresence(req, res, supabaseAdmin, user, peopleRole);
                }

                if (String(subResource || '') === 'keep-in-touch') {
                    const { handleKeepInTouch } = await import('./keepInTouchHandler.js');
                    return handleKeepInTouch(req, res, supabaseAdmin, user);
                }

                if (String(subResource || '') === 'member-self') {
                    const { handleMemberSelfProfile } = await import('./memberSelfProfileHandler.js');
                    return handleMemberSelfProfile(req, res, supabaseAdmin, user, peopleRole);
                }

                if (String(subResource || '') === 'member-household') {
                    const { handleMemberHousehold } = await import('./memberHouseholdHandler.js');
                    return handleMemberHousehold(req, res);
                }

                if (String(subResource || '') === 'member-profile') {
                    const { handleMemberProfileRead } = await import('./memberProfileReadHandler.js');
                    return handleMemberProfileRead(req, res);
                }

                if (String(subResource || '') === 'member-activity') {
                    const { handleMemberProfileActivity } = await import('./memberProfileActivityHandler.js');
                    return handleMemberProfileActivity(req, res);
                }

                if (req.method === 'GET') {
                    // Staff directory — require a valid session before hitting members.
                    if (!user) {
                        return res.status(401).json({ ok: false, error: 'Unauthorized: valid Bearer token required' });
                    }
                    if (!peopleRosterAllowed) {
                        return res.status(403).json({
                            ok: false,
                            error: 'Only pastoral and admin staff can view the full member roster.',
                        });
                    }

                    const requestedMemberId = String(req.query?.memberId || '').trim();
                    if (requestedMemberId) {
                        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedMemberId)) {
                            return res.status(400).json({ ok: false, error: 'Member id is not valid.' });
                        }
                        const { data: oneMember, error: oneError } = await supabaseAdmin
                            .from('members')
                            .select(
                                'id, first_name, last_name, email, phone, status, household_id, household_name, avatar_url, role, birthday, created_at, ministries, children'
                            )
                            .eq('id', requestedMemberId)
                            .maybeSingle();
                        if (oneError) {
                            console.error('People member fetch error:', oneError);
                            return res.status(502).json({ ok: false, error: 'Could not load that member.' });
                        }
                        if (!oneMember) {
                            return res.status(404).json({ ok: false, error: 'Member not found.' });
                        }
                        return res.status(200).json({ ok: true, member: oneMember });
                    }

                    const { query } = req.query;
                    let dbQuery = supabaseAdmin
                        .from('members')
                        .select(
                            'id, first_name, last_name, email, phone, status, household_id, household_name, avatar_url, role, access_code, birthday, created_at, ministries, children'
                        );
                    const rawQuery = String(query || '')
                        .trim()
                        .slice(0, 80)
                        .replace(/[%(),]/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();

                    if (rawQuery) {
                        // Server-side search across identity fields (not just the newest 200 loaded client-side).
                        const tokens = rawQuery.split(' ').filter(Boolean).slice(0, 4);
                        const fields = [
                            'first_name',
                            'last_name',
                            'email',
                            'household_name',
                            'phone',
                        ];
                        const ors = tokens.flatMap((t) =>
                            fields.map((f) => `${f}.ilike.%${t}%`)
                        );
                        dbQuery = dbQuery.or(ors.join(','));
                    }

                    const limit = rawQuery ? 300 : 200;
                    const sortMembersAlpha = (rows: any[]) =>
                        [...(rows || [])].sort((a, b) => {
                            const ln = String(a?.last_name || '').localeCompare(String(b?.last_name || ''), undefined, {
                                sensitivity: 'base',
                            });
                            if (ln !== 0) return ln;
                            return String(a?.first_name || '').localeCompare(String(b?.first_name || ''), undefined, {
                                sensitivity: 'base',
                            });
                        });
                    const { data, error } = await dbQuery
                        .order('last_name', { ascending: true })
                        .order('first_name', { ascending: true })
                        .limit(limit);
                    if (error) {
                        console.error("People Fetch Error:", error);
                        const { data: data2, error: error2 } = await supabaseAdmin
                            .from('members')
                            .select(
                                'id, first_name, last_name, email, phone, status, household_id, household_name, avatar_url, role, access_code, birthday, created_at, ministries, children'
                            )
                            .order('last_name', { ascending: true })
                            .order('first_name', { ascending: true })
                            .limit(200);
                        if (error2) {
                            return res.status(502).json({
                                ok: false,
                                error: error2.message || 'Could not load members from the database',
                            });
                        }
                        const enrichedFallback = await enrichMembersBirthdayFromUsers(
                            supabaseAdmin,
                            sortMembersAlpha(data2 || [])
                        );
                        return res.status(200).json({ ok: true, members: enrichedFallback });
                    }
                    let enriched = await enrichMembersBirthdayFromUsers(supabaseAdmin, data || []);
                    // Multi-word: keep rows where every token appears somewhere in the member identity text.
                    if (rawQuery) {
                        const tokens = rawQuery.toLowerCase().split(' ').filter(Boolean);
                        if (tokens.length > 1) {
                            enriched = enriched.filter((m: any) => {
                                const hay = [
                                    m.first_name,
                                    m.last_name,
                                    m.email,
                                    m.household_name,
                                    m.phone,
                                ]
                                    .map((v) => String(v || '').toLowerCase())
                                    .join(' ');
                                return tokens.every((t) => hay.includes(t));
                            });
                        }
                    }
                    return res.status(200).json({ ok: true, members: sortMembersAlpha(enriched) });
                }
                if (req.method === 'POST') {
                    if (!requirePeopleStaff()) return;
                    const { firstName, lastName, email, phone, status, householdName, birthday, avatar_url, ministries, children } = req.body;
                    let householdId = null;
                    if (householdName) {
                        const { data: hh } = await supabaseAdmin.from('households').select('id').eq('name', householdName).single();
                        if (hh) householdId = hh.id;
                        else {
                            const { data: newHh, error: hhErr } = await supabaseAdmin.from('households').insert({ name: householdName, user_id: user?.id || null }).select().single();
                            if (hhErr) console.error('[Vault API] Household Create Error:', hhErr);
                            if (newHh) householdId = newHh.id;
                        }
                    }
                    console.log(`[Vault API] Inserting member: ${firstName} ${lastName} for Household: ${householdName}`);

                    const memberData: any = {
                        first_name: firstName,
                        last_name: lastName,
                        email: email || null,
                        phone,
                        status: status || 'Active',
                        birthday: birthday || null,
                        avatar_url,
                        role: 'Member',
                        access_code: generateAccessCode()
                    };

                    // Add household info based on what's available
                    if (householdId) memberData.household_id = householdId;
                    if (householdName) memberData.household_name = householdName;

                    const { data, error } = await supabaseAdmin.from('members').insert(memberData).select().single();

                    if (error) {
                        console.error('[Vault API] Member Insert Error:', error);
                        // If household_id is the issue, try once more without it (relying on household_name)
                        if (error.message.includes('household_id')) {
                            console.log('[Vault API] Retrying insert without household_id...');
                            delete memberData.household_id;
                            const { data: retryData, error: retryError } = await supabaseAdmin.from('members').insert(memberData).select().single();
                            if (retryError) throw retryError;
                            return res.status(201).json({ ok: true, member: retryData });
                        }
                        throw error;
                    }

                    if (data && ministries && Array.isArray(ministries)) {
                        const ministryRecords = ministries
                            .map((m: any) => {
                                // If it's a string, we might need to resolve it, but for now we look for .id
                                const mId = typeof m === 'object' ? m.id : null;
                                return mId ? { member_id: data.id, ministry_id: mId } : null;
                            })
                            .filter(Boolean);

                        if (ministryRecords.length > 0) {
                            const { error: minErr } = await supabaseAdmin.from('member_ministries').insert(ministryRecords);
                            if (minErr) console.error('[Vault API] Member Ministries Insert Error:', minErr);
                        }
                    }
                    return res.status(201).json({ ok: true, member: data });
                }
                if (req.method === 'PATCH') {
                    if (!requirePeopleStaff()) return;
                    const mId = req.body?.id;
                    const rawUpdates: any = { ...(req.body || {}) };
                    const updates: any = pickAllowed({
                        ...rawUpdates,
                        first_name: rawUpdates.first_name ?? rawUpdates.firstName,
                        last_name: rawUpdates.last_name ?? rawUpdates.lastName,
                        household_name: rawUpdates.household_name ?? rawUpdates.householdName,
                        avatar_url: rawUpdates.avatar_url ?? rawUpdates.avatarUrl,
                        joined_date: rawUpdates.joined_date ?? rawUpdates.joinedDate,
                    }, MEMBER_WRITE_COLUMNS);

                    // Sanitize fields
                    if (updates.birthday === '') updates.birthday = null;
                    if (updates.joined_date === '') updates.joined_date = null;

                    if (updates.household_name === '') {
                        updates.household_name = null;
                        updates.household_id = null;
                    } else if (updates.household_name) {
                        const { data: hh } = await supabaseAdmin.from('households').select('id').eq('name', updates.household_name).single();
                        if (hh) updates.household_id = hh.id;
                    }

                    const { data, error } = await supabaseAdmin.from('members').update(updates).eq('id', mId).select().single();
                    if (error) throw error;
                    if ('household_id' in updates) {
                        // A member who leaves a household can't stay its head.
                        let clearHead = supabaseAdmin.from('households').update({ head_member_id: null }).eq('head_member_id', mId);
                        if (updates.household_id) clearHead = clearHead.neq('id', updates.household_id);
                        const { error: headErr } = await clearHead;
                        if (headErr) console.warn('[members] clear household head failed:', headErr.message);
                    }
                    return res.status(200).json({ ok: true, member: data });
                }
                if (req.method === 'DELETE') {
                    const auth = await requireAuth(req, res, supabaseAdmin);
                    if (!auth?.user) return;

                    const role = String(auth.role || '');
                    if (!['SUPER_ADMIN', 'ADMIN', 'PASTOR'].includes(role)) {
                        return res.status(403).json({
                            ok: false,
                            error: 'Forbidden: insufficient permissions to delete members',
                        });
                    }

                    const { id: mId } = req.body || req.query;
                    if (!mId) {
                        return res.status(400).json({ ok: false, error: 'Member id required' });
                    }

                    // attendance_records.member_id is ON DELETE RESTRICT — clear check-ins first
                    // so Super Admin can remove test / orphan members.
                    const { error: attendanceErr } = await supabaseAdmin
                        .from('attendance_records')
                        .delete()
                        .eq('member_id', mId);
                    if (attendanceErr) {
                        console.error('[people DELETE] attendance cleanup failed:', attendanceErr.message);
                        return res.status(409).json({
                            ok: false,
                            error: 'Cannot delete member: failed to clear attendance history',
                            details: attendanceErr.message,
                        });
                    }

                    // teams.leader_id has no ON DELETE — null it so FK does not block delete
                    const { error: teamLeaderErr } = await supabaseAdmin
                        .from('teams')
                        .update({ leader_id: null })
                        .eq('leader_id', mId);
                    if (teamLeaderErr) {
                        console.warn('[people DELETE] teams.leader_id clear:', teamLeaderErr.message);
                    }

                    const { error } = await supabaseAdmin.from('members').delete().eq('id', mId);
                    if (error) {
                        if (error.code === '23503') {
                            return res.status(409).json({
                                ok: false,
                                error: 'Cannot delete this member because related records still reference them',
                                details: error.message,
                            });
                        }
                        throw error;
                    }
                    return res.status(200).json({ ok: true });
                }
                return res.status(405).end();
            }

            case 'consent': {
                const supabaseAdmin = getSupabaseAdmin();
                if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });
                const { action } = req.query;

                if (action === 'check') {
                    // Check if child has missing consents
                    const { child_id, child_name, parent_id } = req.query;
                    if (!child_id) return res.status(400).json({ error: 'child_id required' });

                    try {
                        let resolvedChildId = String(child_id);
                        try {
                            const resolved = await resolveConsentChildId(
                                supabaseAdmin,
                                String(child_id),
                                String(parent_id || ''),
                                child_name ? String(child_name) : undefined
                            );
                            resolvedChildId = resolved.childId;
                        } catch (resolveErr: any) {
                            // Synthetic id that cannot resolve yet — treat as all required forms missing
                            if (String(child_id).startsWith('json-')) {
                                const { data: requiredForms } = await supabaseAdmin
                                    .from('consent_forms')
                                    .select('id, title, form_type, content, requires_signature')
                                    .eq('is_active', true)
                                    .eq('is_required', true)
                                    .in('audience', ['children', 'all']);
                                const missing = (requiredForms || []).map((f: any) => ({
                                    form_id: f.id,
                                    form_title: f.title,
                                    form_type: f.form_type,
                                    form_content: f.content,
                                    requires_signature: f.requires_signature,
                                }));
                                return res.status(200).json({
                                    ok: true,
                                    missing_consents: missing,
                                    has_missing: missing.length > 0,
                                    resolve_error: resolveErr?.message,
                                });
                            }
                            throw resolveErr;
                        }

                        const { data: missingConsents, error } = await supabaseAdmin
                            .rpc('get_missing_consents_for_child', { p_child_id: resolvedChildId });

                        if (error) {
                            // If consent tables don't exist yet, just allow check-in
                            console.warn('Consent check failed (tables may not exist):', error.message);
                            return res.status(200).json({ ok: true, missing_consents: [], has_missing: false });
                        }
                        return res.status(200).json({
                            ok: true,
                            missing_consents: missingConsents || [],
                            has_missing: (missingConsents?.length || 0) > 0,
                            resolved_child_id: resolvedChildId,
                        });
                    } catch (err) {
                        // Gracefully handle missing tables
                        console.warn('Consent system not set up yet, allowing check-in');
                        return res.status(200).json({ ok: true, missing_consents: [], has_missing: false });
                    }
                }

                if (action === 'submit') {
                    // Submit a consent form
                    const { child_id, parent_id, consent_form_id, status, signature_method, signed_name, signature_data, child_name } = req.body;

                    if (!child_id || !parent_id || !consent_form_id) {
                        return res.status(400).json({ error: 'Missing required fields' });
                    }

                    let resolved;
                    try {
                        resolved = await resolveConsentChildId(
                            supabaseAdmin,
                            String(child_id),
                            String(parent_id),
                            child_name ? String(child_name) : undefined
                        );
                    } catch (resolveErr: any) {
                        return res.status(400).json({
                            error: resolveErr?.message || 'Could not resolve child for consent signing.',
                        });
                    }

                    // Get form details to calculate expiration
                    const { data: form } = await supabaseAdmin
                        .from('consent_forms')
                        .select('valid_duration_days')
                        .eq('id', consent_form_id)
                        .single();

                    const expiresAt = form?.valid_duration_days 
                        ? new Date(Date.now() + form.valid_duration_days * 24 * 60 * 60 * 1000).toISOString()
                        : null;

                    // Insert or update consent
                    const { data: consent, error } = await supabaseAdmin
                        .from('child_consents')
                        .upsert({
                            child_id: resolved.childId,
                            parent_id: resolved.parentId,
                            consent_form_id,
                            status,
                            signature_method,
                            signed_name,
                            signature_data,
                            signed_at: new Date().toISOString(),
                            expires_at: expiresAt,
                            ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
                            user_agent: req.headers['user-agent']
                        }, {
                            onConflict: 'child_id,consent_form_id'
                        })
                        .select()
                        .single();

                    if (error) throw error;

                    // Log audit
                    await supabaseAdmin.from('consent_audit_log').insert({
                        child_consent_id: consent.id,
                        action: 'signed',
                        performed_by: resolved.parentId,
                        details: {
                            signature_method,
                            form_id: consent_form_id,
                            child_name: resolved.childName,
                            original_child_id: child_id,
                        },
                        ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress
                    });

                    return res.status(200).json({ ok: true, consent, resolved_child_id: resolved.childId });
                }

                if (action === 'list') {
                    // List consents for a child and/or by signing parent (member profile Acknowledgements)
                    const child_id = req.query?.child_id ? String(req.query.child_id).trim() : '';
                    const parent_id = req.query?.parent_id ? String(req.query.parent_id).trim() : '';
                    if (!child_id && !parent_id) {
                        return res.status(400).json({ error: 'child_id or parent_id required' });
                    }

                    let query = supabaseAdmin
                        .from('child_consents')
                        .select('*, consent_form:consent_forms(*)')
                        .order('created_at', { ascending: false });

                    if (child_id && parent_id && child_id === parent_id) {
                        // Adult self-sign + forms they signed as parent
                        query = query.or(`child_id.eq.${child_id},parent_id.eq.${parent_id}`);
                    } else if (child_id && parent_id) {
                        query = query.eq('child_id', child_id).eq('parent_id', parent_id);
                    } else if (child_id) {
                        query = query.eq('child_id', child_id);
                    } else {
                        query = query.eq('parent_id', parent_id);
                    }

                    const { data: consents, error } = await query;
                    if (error) throw error;
                    return res.status(200).json({ ok: true, consents: consents || [] });
                }

                if (action === 'revoke') {
                    // Revoke a consent
                    const { consent_id, parent_id } = req.body;
                    if (!consent_id || !parent_id) return res.status(400).json({ error: 'Missing required fields' });

                    const { data: consent, error } = await supabaseAdmin
                        .from('child_consents')
                        .update({ status: 'revoked', updated_at: new Date().toISOString() })
                        .eq('id', consent_id)
                        .eq('parent_id', parent_id)
                        .select()
                        .single();

                    if (error) throw error;

                    // Log audit
                    await supabaseAdmin.from('consent_audit_log').insert({
                        child_consent_id: consent_id,
                        action: 'revoked',
                        performed_by: parent_id,
                        ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress
                    });

                    return res.status(200).json({ ok: true, consent });
                }

                if (action === 'stats') {
                    try {
                        // Get consent statistics
                        const { data: allConsents } = await supabaseAdmin
                            .from('child_consents')
                            .select('child_id, status, expires_at, consent_form_id');

                        const { data: requiredForms } = await supabaseAdmin
                            .from('consent_forms')
                            .select('id')
                            .eq('is_required', true)
                            .eq('is_active', true)
                            .in('audience', ['children', 'all']);

                        const requiredFormCount = requiredForms?.length || 0;
                        const requiredIds = new Set((requiredForms || []).map((f: any) => f.id));
                        const childrenMap = new Map();

                        // Group by child — only required forms affect complete/partial
                        allConsents?.forEach(consent => {
                            if (requiredIds.size > 0 && !requiredIds.has(consent.consent_form_id)) return;
                            if (!childrenMap.has(consent.child_id)) {
                                childrenMap.set(consent.child_id, []);
                            }
                            childrenMap.get(consent.child_id).push(consent);
                        });

                        let complete = 0, partial = 0, none = 0, expiring_soon = 0;
                        const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

                        childrenMap.forEach((consents, childId) => {
                            const validConsents = consents.filter((c: any) => 
                                c.status === 'granted' && 
                                (!c.expires_at || new Date(c.expires_at) > new Date())
                            );

                            if (requiredFormCount > 0 && validConsents.length >= requiredFormCount) {
                                complete++;
                                // Check if any expiring soon
                                if (validConsents.some((c: any) => c.expires_at && new Date(c.expires_at) < thirtyDaysFromNow)) {
                                    expiring_soon++;
                                }
                            } else if (validConsents.length > 0) {
                                partial++;
                            } else {
                                none++;
                            }
                        });

                        return res.status(200).json({
                            ok: true,
                            stats: {
                                total_children: childrenMap.size,
                                complete,
                                partial,
                                none,
                                expiring_soon
                            }
                        });
                    } catch (error) {
                        console.error('Consent stats error:', error);
                        return res.status(200).json({
                            ok: true,
                            stats: {
                                total_children: 0,
                                complete: 0,
                                partial: 0,
                                none: 0,
                                expiring_soon: 0
                            }
                        });
                    }
                }

                if (action === 'children_status') {
                    try {
                        const { data: requiredForms } = await supabaseAdmin
                            .from('consent_forms')
                            .select('id')
                            .eq('is_required', true)
                            .eq('is_active', true)
                            .in('audience', ['children', 'all']);

                        const requiredFormCount = requiredForms?.length || 0;
                        const requiredIds = new Set((requiredForms || []).map((f: any) => f.id));

                        const { data: consents } = await supabaseAdmin
                            .from('child_consents')
                            .select('child_id, parent_id, status, expires_at, consent_form_id');

                        const childrenMap = new Map<string, any>();

                        const ensureChild = (id: string, parentHint?: string | null) => {
                            if (!childrenMap.has(id)) {
                                childrenMap.set(id, {
                                    child_id: id,
                                    parent_id: parentHint || null,
                                    completed: 0,
                                    also_signed: 0,
                                    expired: 0,
                                    oldest_expiration: null as string | null,
                                });
                            }
                            return childrenMap.get(id);
                        };

                        consents?.forEach((consent: any) => {
                            const child = ensureChild(consent.child_id, consent.parent_id || null);
                            if (!child.parent_id && consent.parent_id) child.parent_id = consent.parent_id;

                            const isGranted =
                                consent.status === 'granted' &&
                                (!consent.expires_at || new Date(consent.expires_at) > new Date());
                            const isExpired =
                                consent.status === 'expired' ||
                                (consent.expires_at && new Date(consent.expires_at) <= new Date());
                            const isRequired = requiredIds.size === 0 || requiredIds.has(consent.consent_form_id);

                            if (isGranted) {
                                if (isRequired) {
                                child.completed++;
                                    if (
                                        consent.expires_at &&
                                        (!child.oldest_expiration ||
                                            new Date(consent.expires_at) < new Date(child.oldest_expiration))
                                    ) {
                                    child.oldest_expiration = consent.expires_at;
                                }
                                } else {
                                    child.also_signed++;
                                }
                            } else if (isExpired && isRequired) {
                                child.expired++;
                            }
                        });

                        // Also include young members / JSON household children so staff can Collect E-Sign before first check-in
                        let members: any[] = [];
                        {
                            const full = await supabaseAdmin
                                .from('members')
                                .select('id, first_name, last_name, email, role, household_id, household_name, birthday, children')
                                .limit(2000);
                            if (full.error) {
                                const basic = await supabaseAdmin
                                    .from('members')
                                    .select('id, first_name, last_name, email, role, household_id, household_name, birthday')
                                    .limit(2000);
                                members = basic.data || [];
                            } else {
                                members = full.data || [];
                            }
                        }

                        const now = new Date();
                        const isUnder18 = (m: any) => {
                            if (String(m.role || '').toLowerCase() === 'child') return true;
                            const dob = m.birthday;
                            if (!dob) return false;
                            const d = new Date(dob);
                            if (Number.isNaN(d.getTime())) return false;
                            const age = (now.getTime() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
                            return age < 18;
                        };

                        const displayNames = new Map<string, { name: string; household_name: string; email: string; household_id: string | null; parent_hint: string | null }>();
                        const skipIds = new Set<string>(); // hide duplicate synthetic rows when linked uuid exists

                        (members || []).forEach((m: any) => {
                            if (childrenMap.has(m.id) || isUnder18(m)) {
                                ensureChild(m.id, null);
                                displayNames.set(m.id, {
                                    name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Child',
                                    household_name: m.household_name || 'Unassigned',
                                    email: m.email || '',
                                    household_id: m.household_id || null,
                                    parent_hint: null,
                                });
                            }

                            // Kids stored as JSON on a parent member (Kids Check-In path)
                            const jsonKids = Array.isArray(m.children) ? m.children : [];
                            jsonKids.forEach((c: any, i: number) => {
                                const syntheticId = `json-${m.id}-${i}`;
                                const linkedId =
                                    c?.id && UUID_RE.test(String(c.id)) ? String(c.id) : null;
                                const childId = linkedId || syntheticId;

                                if (linkedId) {
                                    skipIds.add(syntheticId);
                                    // Merge any orphan stats if they somehow landed on synthetic id
                                    const orphan = childrenMap.get(syntheticId);
                                    const row = ensureChild(linkedId, m.id);
                                    if (orphan) {
                                        row.completed += orphan.completed || 0;
                                        row.also_signed += orphan.also_signed || 0;
                                        row.expired += orphan.expired || 0;
                                        if (!row.parent_id) row.parent_id = m.id;
                                        childrenMap.delete(syntheticId);
                                    }
                                } else {
                                    ensureChild(syntheticId, m.id);
                                }

                                displayNames.set(childId, {
                                    name: c?.name || 'Child',
                                    household_name: m.household_name || 'Unassigned',
                                    email: m.email || '',
                                    household_id: m.household_id || null,
                                    parent_hint: m.id,
                                });
                            });
                        });

                        const memberById = new Map((members || []).map((m: any) => [m.id, m]));

                        // Suggest a parent_id: another household adult if available
                        const householdAdults = new Map<string, string>();
                        (members || []).forEach((m: any) => {
                            if (!m.household_id) return;
                            if (isUnder18(m)) return;
                            if (!householdAdults.has(m.household_id)) householdAdults.set(m.household_id, m.id);
                        });

                        const childrenStatus = Array.from(childrenMap.values())
                            .filter((child) => !skipIds.has(child.child_id))
                            .map((child) => {
                            const meta = displayNames.get(child.child_id);
                            const m = memberById.get(child.child_id);
                            const parentId =
                                child.parent_id ||
                                meta?.parent_hint ||
                                (meta?.household_id ? householdAdults.get(meta.household_id) : null) ||
                                (m?.household_id ? householdAdults.get(m.household_id) : null) ||
                                null;
                            const completed = child.completed || 0;
                            const alsoSigned = child.also_signed || 0;
                            return {
                                child_id: child.child_id,
                                parent_id: parentId,
                                child_name: meta?.name || (m
                                    ? `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Child'
                                    : 'Child (unknown member)'),
                                household_name: meta?.household_name || m?.household_name || 'Unassigned',
                                parent_email: meta?.email || m?.email || '',
                                total_forms: requiredFormCount,
                                completed_forms: completed,
                                also_signed_forms: alsoSigned,
                                expired_forms: child.expired,
                                oldest_expiration: child.oldest_expiration,
                                status:
                                    requiredFormCount > 0 && completed >= requiredFormCount
                                        ? 'complete'
                                        : completed > 0
                                          ? 'partial'
                                          : alsoSigned > 0
                                          ? 'partial'
                                          : child.expired > 0
                                            ? 'expired'
                                            : 'none',
                            };
                        });

                        childrenStatus.sort((a, b) => a.child_name.localeCompare(b.child_name));

                        return res.status(200).json({ ok: true, children: childrenStatus });
                    } catch (error) {
                        console.error('Children status error:', error);
                        return res.status(200).json({ ok: true, children: [] });
                    }
                }

                if (action === 'list_forms') {
                    try {
                        // List all consent forms
                        const { data: forms, error } = await supabaseAdmin
                            .from('consent_forms')
                            .select('*')
                            .order('created_at', { ascending: false });

                        if (error) throw error;
                        return res.status(200).json({ ok: true, forms: forms || [] });
                    } catch (error) {
                        console.error('List forms error:', error);
                        return res.status(200).json({ ok: true, forms: [] });
                    }
                }

                if (action === 'seed_defaults') {
                    try {
                        const { DEFAULT_CONSENT_FORMS } = await import('./defaultConsentForms.js');
                        let inserted = 0;
                        let reactivated = 0;
                        let skipped = 0;

                        for (const form of DEFAULT_CONSENT_FORMS) {
                            const { data: existing } = await supabaseAdmin
                                .from('consent_forms')
                                .select('id, is_active')
                                .eq('title', form.title)
                                .maybeSingle();

                            if (existing?.id) {
                                const patch: Record<string, any> = {
                                    audience: form.audience || 'children',
                                    updated_at: new Date().toISOString(),
                                };
                                if (!existing.is_active) {
                                    Object.assign(patch, {
                                        is_active: true,
                                        is_required: form.is_required,
                                        requires_signature: form.requires_signature,
                                        valid_duration_days: form.valid_duration_days,
                                        form_type: form.form_type,
                                        content: form.content,
                                    });
                                    reactivated++;
                                } else {
                                    skipped++;
                                }
                                await supabaseAdmin
                                    .from('consent_forms')
                                    .update(patch)
                                    .eq('id', existing.id);
                                continue;
                            }

                            const { error } = await supabaseAdmin.from('consent_forms').insert({
                                title: form.title,
                                form_type: form.form_type,
                                content: form.content,
                                is_required: form.is_required,
                                requires_signature: form.requires_signature,
                                valid_duration_days: form.valid_duration_days,
                                audience: form.audience || 'children',
                                is_active: true,
                            });
                            if (error) throw error;
                            inserted++;
                        }

                        // Backfill audience for any forms still missing it (column may be new)
                        await supabaseAdmin
                            .from('consent_forms')
                            .update({ audience: 'children' })
                            .is('audience', null);

                        const { data: forms } = await supabaseAdmin
                            .from('consent_forms')
                            .select('*')
                            .eq('is_active', true)
                            .order('title', { ascending: true });

                        return res.status(200).json({
                            ok: true,
                            inserted,
                            reactivated,
                            skipped,
                            forms: forms || [],
                        });
                    } catch (error: any) {
                        console.error('Seed defaults error:', error);
                        return res.status(500).json({ ok: false, error: error.message || 'Failed to seed forms' });
                    }
                }

                if (action === 'update_form') {
                    try {
                        const { id, title, form_type, content, is_required, requires_signature, valid_duration_days, is_active, audience } = req.body;
                        if (!id) return res.status(400).json({ error: 'id is required' });
                        const safeAudience =
                            audience === 'adults' || audience === 'all' || audience === 'children' ? audience : undefined;
                        const { data: form, error } = await supabaseAdmin
                            .from('consent_forms')
                            .update({
                                title,
                                form_type,
                                content,
                                is_required,
                                requires_signature,
                                valid_duration_days,
                                is_active,
                                ...(safeAudience ? { audience: safeAudience } : {}),
                                updated_at: new Date().toISOString(),
                            })
                            .eq('id', id)
                            .select()
                            .single();
                        if (error) throw error;
                        return res.status(200).json({ ok: true, form });
                    } catch (error: any) {
                        console.error('Update form error:', error);
                        return res.status(500).json({ ok: false, error: error.message });
                    }
                }

                if (action === 'create_form') {
                    try {
                        const { title, form_type, content, is_required, requires_signature, valid_duration_days, audience } = req.body;
                        if (!title || !content) return res.status(400).json({ error: 'title and content are required' });
                        const safeAudience =
                            audience === 'adults' || audience === 'all' ? audience : 'children';

                        const { data: form, error } = await supabaseAdmin
                            .from('consent_forms')
                            .insert({
                                title,
                                form_type: form_type || 'custom',
                                content,
                                is_required: is_required ?? true,
                                requires_signature: requires_signature ?? true,
                                valid_duration_days: valid_duration_days || 365,
                                audience: safeAudience,
                                is_active: true,
                            })
                            .select()
                            .single();

                        if (error) throw error;
                        return res.status(200).json({ ok: true, form });
                    } catch (error: any) {
                        console.error('Create form error:', error);
                        return res.status(500).json({ ok: false, error: error.message });
                    }
                }

                if (action === 'export') {
                    // Export consent records
                    const { format = 'csv' } = req.query;
                    
                    const { data: consents } = await supabaseAdmin
                        .from('child_consents')
                        .select('*, consent_form:consent_forms(title)')
                        .order('signed_at', { ascending: false });

                    if (format === 'csv') {
                        const csv = [
                            'Child ID,Parent ID,Form,Status,Signed At,Expires At,Signature Method',
                            ...(consents || []).map(c => 
                                `${c.child_id},${c.parent_id},${c.consent_form?.title || 'Unknown'},${c.status},${c.signed_at || ''},${c.expires_at || ''},${c.signature_method || ''}`
                            )
                        ].join('\n');

                        return res.status(200).json({ ok: true, data: csv });
                    }

                    return res.status(400).json({ error: 'Unsupported format' });
                }

                if (action === 'send_reminders') {
                    // Send reminder emails
                    const { child_ids } = req.body;
                    if (!child_ids || !Array.isArray(child_ids)) {
                        return res.status(400).json({ error: 'child_ids array required' });
                    }

                    // TODO: Implement email sending logic
                    // For now, just return success
                    return res.status(200).json({ ok: true, sent_count: child_ids.length });
                }

                return res.status(400).json({ error: 'Invalid action' });
            }

            default: return res.status(404).json({ error: 'Resource handler not found' });
        }
    } catch (err: any) {
        console.error('[Vault API Error]:', err);
        const responseBody = {
            ok: false,
            error: 'Internal Server Error',
        };
        if (!res.headersSent) {
            res.status(500).json(responseBody);
        }
    }
}

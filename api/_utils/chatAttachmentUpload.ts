/**
 * Chat media: photos, voice notes, videos and documents (PLCC Chat / Connect / Vault).
 *
 * Big files can't pass through Vercel functions (~4.5 MB request limit), so:
 *   1. App sends the message (caption or "📷 Photo") → messageId
 *   2. attachment-upload-url → Vault checks author + type + size, returns a one-time
 *      signed upload URL for community-files/<channel>/<message>/<random>.<ext>
 *   3. App uploads the file straight to Supabase Storage with that URL
 *   4. attachment-confirm → Vault checks the stored object (path, type, real size)
 *      and records it in chat_attachments
 * The bucket stays private; files are only ever read through signed URLs.
 */

/** Base types allowed in chat (no codec params). Bucket allowed_mime_types must match. */
export const CHAT_MEDIA_ALLOWED_MIME = new Set<string>([
  // photos
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // voice notes (Chrome/Android record webm/ogg; iPhone records mp4/aac)
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/aac',
  'audio/x-m4a',
  'audio/wav',
  // videos
  'video/mp4',
  'video/quicktime',
  'video/webm',
  // documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

/** Must not exceed the community-files bucket file_size_limit. */
export const CHAT_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
export const CHAT_MEDIA_BUCKET = 'community-files';

const BLOCKED_EXT = /\.(exe|bat|cmd|com|msi|scr|js|jar|sh|ps1|dll|dmg|app|apk|html?|svg)$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};

/** "audio/webm;codecs=opus" → "audio/webm". */
export function normalizeChatMime(raw: unknown): string {
  return String(raw || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

/** chat_attachments.kind only allows image|file; apps read mime_type for audio/video. */
export function chatAttachmentKind(mime: string): 'image' | 'file' {
  return normalizeChatMime(mime).startsWith('image/') ? 'image' : 'file';
}

export function cleanChatFilename(raw: unknown): string {
  const base = String(raw || 'file')
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001f]/g, '')
    .trim();
  return (base || 'file').slice(0, 200);
}

export type ChatUploadPlan =
  | { ok: true; storagePath: string; mime: string; filename: string; kind: 'image' | 'file' }
  | { ok: false; status: number; error: string };

/** Pure: validate an upload request and choose where it goes. */
export function planChatAttachmentUpload(input: {
  channelId: string;
  messageId: string;
  filename: unknown;
  mimeType: unknown;
  sizeBytes: unknown;
  random?: string;
  now?: number;
}): ChatUploadPlan {
  if (!UUID_RE.test(String(input.channelId)) || !UUID_RE.test(String(input.messageId))) {
    return { ok: false, status: 400, error: 'Invalid message' };
  }
  const mime = normalizeChatMime(input.mimeType);
  if (!CHAT_MEDIA_ALLOWED_MIME.has(mime)) {
    return { ok: false, status: 400, error: 'That kind of file can’t be sent in chat.' };
  }
  const filename = cleanChatFilename(input.filename);
  if (BLOCKED_EXT.test(filename)) {
    return { ok: false, status: 400, error: 'That kind of file can’t be sent in chat.' };
  }
  const size = Number(input.sizeBytes);
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, status: 400, error: 'The file is empty.' };
  }
  if (size > CHAT_MEDIA_MAX_BYTES) {
    return { ok: false, status: 413, error: 'That file is too big (25 MB max).' };
  }
  const ext = EXT_BY_MIME[mime] || (filename.includes('.') ? filename.split('.').pop()! : 'bin');
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase() || 'bin';
  const rand = (input.random || Math.random().toString(36).slice(2, 10)).replace(/[^a-z0-9]/gi, '');
  const storagePath = `${input.channelId}/${input.messageId}/${input.now ?? Date.now()}-${rand}.${safeExt}`;
  return { ok: true, storagePath, mime, filename, kind: chatAttachmentKind(mime) };
}

/** Pure: a confirm may only register a file inside this message's own folder. */
export function storagePathBelongsToMessage(path: unknown, channelId: string, messageId: string): boolean {
  const p = String(path || '');
  const prefix = `${channelId}/${messageId}/`;
  if (!p.startsWith(prefix)) return false;
  const rest = p.slice(prefix.length);
  return /^[0-9]+-[a-z0-9]+\.[a-z0-9]{1,8}$/i.test(rest);
}

type StorageLike = {
  from: (bucket: string) => {
    createSignedUploadUrl: (path: string) => Promise<{ data: { signedUrl: string; token: string; path: string } | null; error: any }>;
    list: (folder: string, opts?: any) => Promise<{ data: any[] | null; error: any }>;
    remove: (paths: string[]) => Promise<{ error: any }>;
    createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl: string } | null; error: any }>;
  };
};

export async function createChatUploadUrl(storage: StorageLike, storagePath: string) {
  const { data, error } = await storage.from(CHAT_MEDIA_BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data) throw error || new Error('No upload URL');
  return { signedUrl: data.signedUrl, token: data.token, path: data.path || storagePath };
}

/** Real size/type of an uploaded object, or null if it isn't there. */
export async function statChatUpload(
  storage: StorageLike,
  storagePath: string
): Promise<{ size: number; mime: string } | null> {
  const slash = storagePath.lastIndexOf('/');
  const folder = storagePath.slice(0, slash);
  const name = storagePath.slice(slash + 1);
  const { data, error } = await storage.from(CHAT_MEDIA_BUCKET).list(folder, { search: name, limit: 5 });
  if (error || !data) return null;
  const hit = data.find((o: any) => o?.name === name);
  if (!hit) return null;
  return {
    size: Number(hit.metadata?.size ?? hit.metadata?.contentLength ?? 0),
    mime: normalizeChatMime(hit.metadata?.mimetype),
  };
}

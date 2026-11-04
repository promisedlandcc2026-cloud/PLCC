/**
 * Meeting Minutes recorder + transcription helpers (pure).
 * Browser records with MediaRecorder; server transcribes via Whisper/Gemini.
 */

export const MINUTES_AUDIO_BUCKET = 'minutes-audio';
/** Direct JSON upload cap (Vercel body). Hour-long meetings use signed-URL chunks instead. */
export const MINUTES_MAX_AUDIO_BYTES = 2_500_000;
export const MINUTES_CHUNK_SECONDS = 5 * 60;
export const MINUTES_MAX_RECORD_SECONDS = 90 * 60;
export const MINUTES_WHISPER_MAX_BYTES = 24 * 1024 * 1024;

export const MINUTES_AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
] as const;

export function pickMinutesRecorderMimeType(
  isTypeSupported?: (type: string) => boolean
): string {
  const check =
    typeof isTypeSupported === 'function'
      ? isTypeSupported
      : typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
        ? (t: string) => MediaRecorder.isTypeSupported(t)
        : () => false;
  for (const mime of MINUTES_AUDIO_MIME_CANDIDATES) {
    try {
      if (check(mime)) return mime;
    } catch {
      /* ignore */
    }
  }
  return 'audio/webm';
}

export function extensionForAudioMime(mime: string): string {
  const m = String(mime || '').toLowerCase();
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  if (m.includes('ogg')) return 'ogg';
  return 'webm';
}

export function formatRecorderDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function parseAudioDataUrl(raw: string | null | undefined): {
  mimeType: string;
  base64: string;
} | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  const match = text.match(/^data:(audio\/[a-zA-Z0-9.+-]+(?:;[^,]+)?);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1].split(';')[0], base64: match[2] };
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(text) && text.length > 80) {
    return { mimeType: 'audio/webm', base64: text.replace(/\s/g, '') };
  }
  return null;
}

export function summarizeTranscript(transcript: string, maxLen = 220): string {
  const clean = String(transcript || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const sentence = clean.split(/(?<=[.!?])\s+/)[0] || clean;
  if (sentence.length <= maxLen) return sentence;
  return `${sentence.slice(0, maxLen - 1).trim()}…`;
}

export function formatMinutesTranscriptAsNotes(transcript: string): string {
  const clean = String(transcript || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return `Meeting transcript (draft — edit before publishing)\n\n${clean}`;
}

export function joinTranscriptChunks(chunks: string[]): string {
  return (chunks || [])
    .map((c) => String(c || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

export function minutesChunkCount(totalSeconds: number, chunkSeconds = MINUTES_CHUNK_SECONDS): number {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const size = Math.max(1, Number(chunkSeconds) || MINUTES_CHUNK_SECONDS);
  if (s <= 0) return 0;
  return Math.ceil(s / size);
}

export function huddleMinutesPrefill(opts: {
  channelName?: string | null;
  department?: string | null;
}): { title: string; department: string } {
  const channel = String(opts.channelName || '')
    .replace(/^#/, '')
    .trim();
  const dept = String(opts.department || '').trim() || 'Leadership';
  const title = channel ? `${channel} Live Huddle` : 'Live Huddle Minutes';
  return { title, department: dept };
}

export const HUDDLE_MINUTES_DRAFT_KEY = 'awc_huddle_minutes_draft';

export type HuddleMinutesDraft = {
  transcript: string;
  summary: string;
  audioUrl?: string | null;
  title?: string;
  updatedAt: number;
};

export function saveHuddleMinutesDraft(draft: Omit<HuddleMinutesDraft, 'updatedAt'> & { updatedAt?: number }): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const payload: HuddleMinutesDraft = {
      transcript: String(draft.transcript || ''),
      summary: String(draft.summary || ''),
      audioUrl: draft.audioUrl || null,
      title: draft.title || '',
      updatedAt: draft.updatedAt || Date.now(),
    };
    sessionStorage.setItem(HUDDLE_MINUTES_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function loadHuddleMinutesDraft(): HuddleMinutesDraft | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(HUDDLE_MINUTES_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HuddleMinutesDraft;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      transcript: String(parsed.transcript || ''),
      summary: String(parsed.summary || ''),
      audioUrl: parsed.audioUrl || null,
      title: parsed.title || '',
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return null;
  }
}

export function clearHuddleMinutesDraft(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(HUDDLE_MINUTES_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export async function transcribeWithOpenAIWhisper(opts: {
  apiKey: string;
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const key = String(opts.apiKey || '').trim();
  if (!key) return { ok: false, error: 'OPENAI_API_KEY is not set' };
  const form = new FormData();
  const blob = new Blob([new Uint8Array(opts.buffer)], { type: opts.mimeType || 'audio/webm' });
  form.append('file', blob, opts.filename || 'minutes.webm');
  form.append('model', 'whisper-1');
  form.append('language', 'en');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return { ok: false, error: json?.error?.message || text.slice(0, 240) || `Whisper HTTP ${res.status}` };
  }
  const transcript = String(json?.text || '').trim();
  if (!transcript) return { ok: false, error: 'Empty Whisper transcript' };
  return { ok: true, text: transcript };
}

export async function transcribeAudioBuffer(opts: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!opts.buffer?.length) return { ok: false, error: 'Empty audio' };
  if (opts.buffer.length > MINUTES_WHISPER_MAX_BYTES) {
    return {
      ok: false,
      error: `Audio chunk is too large for transcription (${Math.round(opts.buffer.length / 1024 / 1024)} MB).`,
    };
  }
  const whisper = await transcribeWithOpenAIWhisper({
    apiKey: process.env.OPENAI_API_KEY || '',
    buffer: opts.buffer,
    mimeType: opts.mimeType,
    filename: opts.filename,
  });
  if (whisper.ok === true) return whisper;
  const gemini = await transcribeWithGemini({
    apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '',
    buffer: opts.buffer,
    mimeType: opts.mimeType,
  });
  if (gemini.ok === true) return gemini;
  return {
    ok: false,
    error: `${whisper.error}; ${gemini.error}`,
  };
}

export async function transcribeWithGemini(opts: {
  apiKey: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const key = String(opts.apiKey || '').trim();
  if (!key) return { ok: false, error: 'GEMINI_API_KEY is not set' };
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: key });
    const result = await ai.models.generateContent({
      model: process.env.GEMINI_MINUTES_MODEL || 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: opts.mimeType || 'audio/webm',
                data: opts.buffer.toString('base64'),
              },
            },
            {
              text: 'Transcribe this church meeting audio verbatim in English. Output only the transcript, no commentary.',
            },
          ],
        },
      ],
    });
    const transcript = String((result as any)?.text || '').trim();
    if (!transcript) return { ok: false, error: 'Empty Gemini transcript' };
    return { ok: true, text: transcript };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Gemini transcription failed' };
  }
}

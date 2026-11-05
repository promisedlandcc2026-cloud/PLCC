/**
 * Client-side Community Feed image preparation (Phase 4C).
 * Optimize large phone photos before upload — never send raw 20MB originals.
 */
export const FEED_CLIENT_IMAGE_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const FEED_CLIENT_IMAGE_MAX_EDGE = 1800;
/** Canaan News card photos. Smaller than Feed so a flyer stays a banner. */
export const VAULT_NEWS_IMAGE_MAX_EDGE = 1200;
export const FEED_CLIENT_IMAGE_JPEG_QUALITY = 0.82;
/** Practical binary target after compression (under Vercel JSON/base64 body limits). */
export const FEED_CLIENT_IMAGE_MAX_OUTPUT_BYTES = Math.floor(2.5 * 1024 * 1024);
export const FEED_CLIENT_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type PreparedFeedImage = {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileBase64: string;
  previewUrl: string;
  bytes: number;
  width: number;
  height: number;
};

function rejectType(): never {
  throw new Error('Please choose a JPG, PNG, or WebP image.');
}

function rejectHeic(): never {
  throw new Error(
    "This photo format isn't supported yet. Please choose a JPG, PNG, or WebP image."
  );
}

function rejectSize(): never {
  throw new Error('That photo is too large.');
}

function rejectStillTooLarge(): never {
  throw new Error('This photo is still too large. Please choose another photo.');
}

export function isHeicLikeFile(file: File): boolean {
  const t = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return (
    t === 'image/heic' ||
    t === 'image/heif' ||
    t.includes('heic') ||
    t.includes('heif') ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

export function isAcceptedFeedImageFile(file: File): boolean {
  if (!file) return false;
  if (isHeicLikeFile(file)) return false;
  const t = String(file.type || '').toLowerCase();
  if (t === 'image/svg+xml' || t.includes('svg')) return false;
  if (t === 'image/gif' || t.includes('gif')) return false;
  return (FEED_CLIENT_ACCEPTED_TYPES as readonly string[]).includes(t);
}

function scaleDimensions(width: number, height: number, maxEdge: number): { width: number; height: number; scale: number } {
  const longEdge = Math.max(width, height);
  const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

async function canvasToPrepared(
  canvas: HTMLCanvasElement,
  preferPng: boolean
): Promise<PreparedFeedImage> {
  let outMime: 'image/jpeg' | 'image/png' | 'image/webp' = preferPng ? 'image/png' : 'image/jpeg';
  let quality = FEED_CLIENT_IMAGE_JPEG_QUALITY;
  let outDataUrl = '';
  let base64 = '';
  let bytes = 0;

  const encode = (mime: 'image/jpeg' | 'image/png', q?: number) => {
    outDataUrl =
      mime === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', q ?? quality);
    base64 = outDataUrl.replace(/^data:[^;]+;base64,/, '');
    bytes = Math.ceil((base64.length * 3) / 4);
    outMime = mime;
  };

  if (preferPng) {
    encode('image/png');
    // If PNG is huge after resize, fall back to JPEG (transparency may be lost — acceptable for Feed).
    if (bytes > FEED_CLIENT_IMAGE_MAX_OUTPUT_BYTES) {
      encode('image/jpeg', quality);
      while (bytes > FEED_CLIENT_IMAGE_MAX_OUTPUT_BYTES && quality > 0.5) {
        quality = Math.max(0.5, quality - 0.08);
        encode('image/jpeg', quality);
      }
    }
  } else {
    encode('image/jpeg', quality);
    while (bytes > FEED_CLIENT_IMAGE_MAX_OUTPUT_BYTES && quality > 0.5) {
      quality = Math.max(0.5, quality - 0.08);
      encode('image/jpeg', quality);
    }
  }

  if (bytes > FEED_CLIENT_IMAGE_MAX_OUTPUT_BYTES) rejectStillTooLarge();
  if (bytes > FEED_CLIENT_IMAGE_MAX_SOURCE_BYTES) rejectSize();

  return {
    mimeType: outMime,
    fileBase64: base64,
    previewUrl: outDataUrl,
    bytes,
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * Read + resize to max long edge, apply EXIF orientation when the browser supports it,
 * never upscale, prefer JPEG for photos; keep PNG when transparency likely matters and size OK.
 */
export async function prepareFeedImageFile(
  file: File,
  options?: { maxEdge?: number }
): Promise<PreparedFeedImage> {
  if (!file) rejectType();
  if (isHeicLikeFile(file)) rejectHeic();
  if (!isAcceptedFeedImageFile(file)) rejectType();
  if (file.size > FEED_CLIENT_IMAGE_MAX_SOURCE_BYTES) rejectSize();

  const maxEdge =
    Number(options?.maxEdge) > 0 ? Number(options?.maxEdge) : FEED_CLIENT_IMAGE_MAX_EDGE;
  const sourceIsPng = file.type === 'image/png';
  let width = 0;
  let height = 0;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare image');

  // Prefer createImageBitmap with EXIF orientation when available (Safari/Chrome modern).
  const bitmapFactory = (globalThis as any).createImageBitmap as
    | ((image: ImageBitmapSource, options?: ImageBitmapOptions) => Promise<ImageBitmap>)
    | undefined;

  if (typeof bitmapFactory === 'function') {
    let bitmap: ImageBitmap;
    try {
      bitmap = await bitmapFactory(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      bitmap = await bitmapFactory(file);
    }
    const scaled = scaleDimensions(bitmap.width, bitmap.height, maxEdge);
    width = scaled.width;
    height = scaled.height;
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(bitmap, 0, 0, width, height);
    if (typeof bitmap.close === 'function') bitmap.close();
  } else {
    const dataUrl = await readFileAsDataUrl(file);
    const img = await loadImage(dataUrl);
    const scaled = scaleDimensions(img.width, img.height, maxEdge);
    width = scaled.width;
    height = scaled.height;
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);
  }

  return canvasToPrepared(canvas, sourceIsPng);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Invalid image'));
    img.src = src;
  });
}

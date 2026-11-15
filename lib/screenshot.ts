/**
 * Shrink a picture the member picked so it can be emailed with a report.
 * Phone screenshots are often 2–5 MB; this brings them to roughly 150–500 KB.
 * (Shared with Tribes — keep the two copies in sync.)
 */

export type ReportScreenshot = {
  /** object URL for the preview thumbnail */
  previewUrl: string;
  type: 'image/jpeg';
  /** base64 without the data: prefix */
  data: string;
  bytes: number;
};

export const MAX_REPORT_SCREENSHOTS = 3;
const MAX_EDGE = 1600;
const TARGET_BYTES = 900_000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That picture could not be opened. Please try a screenshot or photo (JPG or PNG).'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not prepare the picture.'))), 'image/jpeg', quality);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      resolve(s.slice(s.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Could not read the picture.'));
    reader.readAsDataURL(blob);
  });
}

export async function prepareScreenshot(file: File): Promise<ReportScreenshot> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a picture (screenshot or photo).');
  }
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the picture.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let quality = 0.82;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > TARGET_BYTES && quality > 0.45) {
    quality -= 0.12;
    blob = await canvasToBlob(canvas, quality);
  }
  if (blob.size > 1_400_000) throw new Error('That picture is too large. Please try a smaller one.');

  return {
    previewUrl: URL.createObjectURL(blob),
    type: 'image/jpeg',
    data: await blobToBase64(blob),
    bytes: blob.size,
  };
}

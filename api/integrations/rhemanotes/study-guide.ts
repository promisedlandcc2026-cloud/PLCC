import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleRhemaStudyGuide } from '../../_handlers/rhemanotes.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return handleRhemaStudyGuide(req, res);
}

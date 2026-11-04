/**
 * Detect crawlers that fetch Open Graph / link previews.
 * These must receive OG HTML without an instant redirect — WhatsApp/Facebook
 * often follow meta-refresh to the HashRouter destination and then lose og:image.
 */
export function isSocialPreviewCrawler(userAgent: unknown): boolean {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return false;
  return (
    ua.includes('whatsapp') ||
    ua.includes('facebookexternalhit') ||
    ua.includes('facebot') ||
    ua.includes('twitterbot') ||
    ua.includes('linkedinbot') ||
    ua.includes('slackbot') ||
    ua.includes('discordbot') ||
    ua.includes('telegrambot') ||
    ua.includes('embedly') ||
    ua.includes('quora link preview') ||
    ua.includes('pinterest') ||
    ua.includes('vkshare') ||
    ua.includes('w3c_validator')
  );
}

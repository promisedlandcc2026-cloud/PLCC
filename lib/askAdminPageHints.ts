/**
 * Everyday sidebar path → Ask Admin how-to question (auto-sent from page title link).
 * Keys match SIMPLE_NAV paths (skip external Finance / DCB).
 */
export const ASK_ADMIN_PAGE_HINTS: Record<string, string> = {
  '/dashboard': 'How do I use the Home dashboard?',
  '/': 'How do I use the Home dashboard?',
  '/members': 'How do I enable Connect child cards for a parent?',
  '/family': 'How do I turn on Connect child cards (Family Pass) for household kids?',
  '/church-profile': 'How do I use My Profile, see my check-in points, and open Kids View?',
  '/households': 'How do I manage households?',
  '/attendance/sessions': 'How do I open an attendance session and check people in?',
  '/attendance/dashboard': 'How do I read the Attendance Dashboard?',
  '/events/who-checked-in': 'How do I see who checked in today?',
  '/events/overview': 'How do I use the Events calendar and request or approve an event?',
  '/events/serve': 'What are Serve opportunities, and where do members sign up?',
  '/events/cookout-rsvps': 'How do I add a guest, see who paid, or delete or archive an event RSVP?',
  '/events/rsvp-archive': 'What is the RSVP Archive, and who can see or restore it?',
  '/events/alerts': 'How do I send an alert to the check-in stations?',
  '/community/daily-devotional': 'How do I write and schedule the Daily Devotional for PLCC Connect?',
  '/thanksgiving-rsvp': 'How do I RSVP for the Grand Family Celebration?',
  '/grand-family-celebration-rsvp': 'How do I RSVP for the Grand Family Celebration?',
  '/marrieds-dinner-rsvp': 'How do I RSVP for the Marrieds Dinner?',
  '/events/check-someone-in': 'How does Desk check-in work for adult and child cards?',
  '/events/kids-kiosk': 'How do I use Kids Kiosk check-in?',
  '/events/kids-bucks': 'How do I give PLCC Bucks to a child, and how do I fix a mistake?',
  '/events/ark': 'How do PLCC Ark scores and PLCC Bucks work, and how do I remove or approve a score?',
  '/fundraisers': 'How do I run a fundraiser, add fun charges and see who still owes?',
  '/community/prayer-watch': 'How does the Intercessors Prayer Watch work?',
  '/events/kids-plans': 'How do I view or manage Kids Ministry Sunday plans?',
  '/events/flyer-share': 'How do I upload a flyer and copy a WhatsApp or text share link?',
  '/admin/consent-management': 'How do I find and sign consent forms?',
  '/giving': 'How do I give my tithes and offerings online?',
  '/finance/contribution-manager': 'How do I use Contribution Manager / Finance?',
  '/community/feed': 'How do I use the Community feed?',
  '/community/sermon-notes': 'Where do I read the study guides published in RhemaNotes?',
  '/community/sermons': 'How do I write a sermon in Sermon Manager and send it to RhemaNotes?',
  '/community/prayer-wall': 'How do I use the Prayer Wall?',
  '/communication/announcements': 'How do I post or find announcements?',
  '/communication/minutes': 'How do I find meeting minutes?',
  '/admin/policies': 'Where are church policies and playbooks?',
  '/help/how-to-videos': 'How do I find or add Vault how-to videos?',
  '/community/chat': 'How do I use Chat and start a Live Huddle?',
  '/settings': 'How do I update my Settings and profile?',
};

/** Normalize pathname (no trailing slash except root) for hint lookup. */
export function normalizeAskAdminPath(pathname: string): string {
  const raw = String(pathname || '/').split('?')[0].split('#')[0] || '/';
  if (raw.length > 1 && raw.endsWith('/')) return raw.slice(0, -1);
  return raw || '/';
}

export function getAskAdminHintForPath(pathname: string): string | null {
  const path = normalizeAskAdminPath(pathname);
  if (ASK_ADMIN_PAGE_HINTS[path]) return ASK_ADMIN_PAGE_HINTS[path];
  // Household detail URLs share the households hint
  if (path.startsWith('/households/')) return ASK_ADMIN_PAGE_HINTS['/households'];
  // Each child's Kids View dashboard
  if (path.startsWith('/family/kids/')) return 'How do Kids View points, badges, and themes work?';
  return null;
}

/** Everyday SIMPLE_NAV paths that should have a catalog hint (excludes external hrefs). */
export function everydayNavPathsNeedingHints(
  items: Array<{ path?: string; href?: string }>
): string[] {
  return items
    .map((i) => String(i.path || '').trim())
    .filter((p) => p.startsWith('/') && !p.startsWith('http'))
    .filter((p, idx, arr) => arr.indexOf(p) === idx);
}

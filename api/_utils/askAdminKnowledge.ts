import fs from 'fs';
import path from 'path';

export type ChurchKnowledgeDoc = {
  name: string;
  type: string;
  /** Public URL path e.g. /docs/sop/SOP_Child_Check_In.md */
  path: string;
  excerpt: string;
};

/** Same catalog as Policies UI — titles + paths under public/docs */
export const CHURCH_DOC_CATALOG: Array<{ name: string; type: string; path: string }> = [
  { name: 'Member Onboarding SOP', type: 'SOP', path: '/docs/sop/SOP_Member_Onboarding.md' },
  { name: 'Meeting Minutes Workflow SOP', type: 'SOP', path: '/docs/sop/SOP_Meeting_Minutes.md' },
  { name: 'How to Add a Member', type: 'Guide', path: '/docs/guides/HowTo_Add_Member.md' },
  { name: 'How to Create Your PLCC Vault Account', type: 'Guide', path: '/docs/guides/HowTo_Member_Setup.md' },
  { name: 'How to Enable Connect Child Cards', type: 'Guide', path: '/docs/guides/HowTo_Connect_Child_Cards.md' },
  { name: 'Child Check-In SOP', type: 'SOP', path: '/docs/sop/SOP_Child_Check_In.md' },
  { name: 'Child Check-In For Dummies', type: 'Guide', path: '/docs/guides/HowTo_Child_Check_In_Visual.md' },
  { name: 'Child Check-In Flowchart (Print)', type: 'Quick Ref', path: '/docs/guides/Child_Check_In_Flowchart.md' },
  { name: 'Counting Session Workflow SOP', type: 'SOP', path: '/docs/sop/SOP_Counting_Session.md' },
  { name: 'Contribution Manager How-To', type: 'Guide', path: '/docs/guides/HowTo_Contribution_Manager.md' },
  { name: 'Giving Insights SOP', type: 'SOP', path: '/docs/sop/SOP_Giving_Insights.md' },
  { name: 'Using the Event Check-In System', type: 'Guide', path: '/docs/guides/HowTo_Event_Check_In.md' },
  { name: 'Managing Ministry Teams', type: 'Guide', path: '/docs/guides/HowTo_Manage_Teams.md' },
  { name: 'Setting Up Follow-Up Workflows', type: 'Guide', path: '/docs/guides/HowTo_Follow_Up_Workflows.md' },
  { name: 'Building Custom Forms', type: 'Guide', path: '/docs/guides/HowTo_Create_Forms.md' },
  { name: 'Using Giving Insights', type: 'Guide', path: '/docs/guides/HowTo_Giving_Insights.md' },
  { name: 'Servant Keeper 8 Integration', type: 'Guide', path: '/docs/guides/HowTo_Servant_Keeper_Integration.md' },
  { name: 'Child Injury & Incident Policy', type: 'Policy', path: '/docs/policies/POLICY_Child_Injury.md' },
  { name: 'Photography & Media Policy', type: 'Policy', path: '/docs/policies/POLICY_Photography_Media.md' },
];

const MAX_DOCS = 4;
const MAX_EXCERPT_CHARS = 900;
const MAX_TOTAL_CHARS = 3500;

function resolveDocFile(publicPath: string): string | null {
  const rel = publicPath.replace(/^\//, '');
  const candidates = [
    path.join(process.cwd(), 'public', rel.replace(/^docs\//, 'docs/')),
    path.join(process.cwd(), rel),
    path.join(process.cwd(), 'public', rel),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function readExcerpt(publicPath: string): string {
  const file = resolveDocFile(publicPath);
  if (!file) return '';
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const cleaned = raw.replace(/\r\n/g, '\n').trim();
    if (cleaned.length <= MAX_EXCERPT_CHARS) return cleaned;
    return `${cleaned.slice(0, MAX_EXCERPT_CHARS).trim()}…`;
  } catch (err) {
    console.warn('[ask-admin-knowledge] read failed', publicPath, err);
    return '';
  }
}

function scoreDoc(
  doc: { name: string; type: string; path: string },
  query: string
): number {
  const q = query.toLowerCase();
  if (!q.trim()) return 0;
  const tokens = q
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
  const hay = `${doc.name} ${doc.type} ${doc.path}`.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 3;
  }
  // Boost common ministry topics
  if (/check.?in|kids|child|nursery|pickup|allerg/i.test(q) && /child|kids|check/i.test(hay)) score += 5;
  if (/giving|count|contribution|finance|offering/i.test(q) && /giving|count|contribution|finance/i.test(hay)) score += 5;
  if (/minute|signature|acknowledge|meeting/i.test(q) && /minute/i.test(hay)) score += 5;
  if (/policy|photo|injur|media/i.test(q) && /policy/i.test(hay)) score += 5;
  if (/member|onboard|signup|sign.?up/i.test(q) && /member|onboard/i.test(hay)) score += 4;
  if (/connect|family.?pass|child.?card|view.?card|guardian|my.?family|dependent/i.test(q) && /connect|child|family|card|guardian/i.test(hay)) score += 6;
  if (/team|volunteer|follow.?up/i.test(q) && /team|follow/i.test(hay)) score += 4;
  if (/form|consent/i.test(q) && /form|consent/i.test(hay)) score += 3;
  if (/chat|huddle|live.?huddle|dm|community/i.test(q) && /community|chat|connect/i.test(hay))
    score += 4;
  return score;
}

/**
 * Pick relevant church docs for the user question and return short excerpts.
 */
export function loadChurchKnowledgeForQuery(userQuery: string): ChurchKnowledgeDoc[] {
  const ranked = CHURCH_DOC_CATALOG
    .map((doc) => ({ doc, score: scoreDoc(doc, userQuery || '') }))
    .sort((a, b) => b.score - a.score);

  const picked =
    ranked[0]?.score > 0
      ? ranked.filter((r) => r.score > 0).slice(0, MAX_DOCS)
      : ranked.slice(0, 2); // default: first two catalog entries as general context

  const out: ChurchKnowledgeDoc[] = [];
  let total = 0;
  for (const { doc } of picked) {
    const excerpt = readExcerpt(doc.path);
    const body = excerpt || `(Document ${doc.path} — open in Policies at ${doc.path})`;
    if (total + body.length > MAX_TOTAL_CHARS) break;
    out.push({ ...doc, excerpt: body });
    total += body.length;
  }
  return out;
}

export function formatChurchKnowledgeBlock(docs: ChurchKnowledgeDoc[]): string {
  if (!docs.length) {
    return `CHURCH KNOWLEDGE (excerpts):
  (No local docs loaded — point members to (/admin/policies) for SOPs and policies.)`;
  }
  const blocks = docs.map(
    (d) => `### ${d.name} [${d.type}] (${d.path})
${d.excerpt}`
  );
  return `CHURCH KNOWLEDGE (excerpts from PLCC Vault docs — cite the path in parentheses when you use them):
${blocks.join('\n\n')}
When answering from these excerpts, mention the path like (${docs[0].path}) so the member can open Policies.`;
}

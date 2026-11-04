
import fs from 'fs';
import path from 'path';

const filePath = path.resolve('api/people/index.ts');
console.log(`Reading ${filePath}...`);
let content = fs.readFileSync(filePath, 'utf8');

// Add memberships action
const membershipsLogic = `
    // --- Action: Get Memberships ---
    if (action === 'memberships') {
        if (req.method === 'GET') {
            try {
                const { user } = await verifyAuth(req);
                const authUserId = user?.id;
                if (!authUserId) return res.status(401).json({ error: "Unauthorized" });

                const { data, error } = await supabaseAdmin!
                    .from('team_members')
                    .select('team_id')
                    .eq('member_id', authUserId);

                if (error) throw error;
                return res.status(200).json({ ok: true, teamIds: data.map((m: any) => m.team_id) });
            } catch (e: any) {
                console.error("[API] Memberships GET Failed:", e);
                throw e;
            }
        }
    }
`;

// Insert after action check if (action === 'join' || action === 'leave') block
// Find the end of that block (which ends with a large catch block)
const searchMarker = "return res.status(200).json({ ok: true });";
const secondOccurrenceIndex = content.indexOf(searchMarker, content.indexOf(searchMarker) + 1); // Usually and end of join/leave

// I'll be more precise. Let's find: if (action === 'join' || action === 'leave') { ... } 
// And insert after it.

const blockStart = "if (action === 'join' || action === 'leave') {";
const startIndex = content.indexOf(blockStart);

if (startIndex === -1) {
    console.error("Could not find teams action block!");
    process.exit(1);
}

// Find the matching closing brace for this block is hard, so I'll just find the next major if for GET
const nextMarker = "// --- GET: List Teams ---";
const insertIndex = content.indexOf(nextMarker);

if (insertIndex === -1) {
    console.error("Could not find GET Teams marker!");
    process.exit(1);
}

const finalContent = content.substring(0, insertIndex) + membershipsLogic + "\n    " + content.substring(insertIndex);

fs.writeFileSync(filePath, finalContent);
console.log("Successfully added memberships action to api/people/index.ts");

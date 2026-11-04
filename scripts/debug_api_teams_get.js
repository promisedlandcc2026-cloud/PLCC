import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugApiGet() {
    console.log("--- Debugging API GET /teams logic ---");

    // Mimic the exact query from api/people/index.ts
    const { data, error } = await supabase
        .from('teams')
        .select(`
            *,
            leader:leader_id (
                first_name,
                last_name,
                avatar_url
            ),
            ministry:ministries (id, name),
            team_members (count, member_id)
        `)
        .order('name');

    if (error) {
        console.error("❌ API Query Error:", JSON.stringify(error, null, 2));
    } else {
        console.log(`✅ Success. Retrieved ${data.length} teams.`);
        // Try to access nested properties to see if JS fails
        try {
            const mapped = data.map((t) => ({
                id: t.id,
                ministryName: t.ministry?.name,
                membersRaw: t.team_members
            }));
            console.log("Mapped Sample:", mapped[0]);
        } catch (jsError) {
            console.error("❌ JS Processing Error:", jsError);
        }
    }
}

debugApiGet();

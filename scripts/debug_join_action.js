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

async function debugJoinAction() {
    console.log("--- Debugging Join Action Logic ---");

    // 1. Get Setup Data
    const { data: teams } = await supabase.from('teams').select('id, name').limit(1);
    const { data: members } = await supabase.from('members').select('id').limit(1);

    if (!teams?.length || !members?.length) {
        console.error("Missing data");
        return;
    }

    const teamId = teams[0].id; // "3dc1ddc2-e8b6-4425-8c38-b41ffcd844b2"
    const memberId = members[0].id; // "3a81c683-fab0-4a5d-96be-ff46661b0aef"

    console.log(`Attempting to join Team: ${teamId}, Member: ${memberId}`);

    // Mimic the exact logic in api/people/index.ts
    // handleTeams -> if (action === 'join')

    // Clean up first
    await supabase.from('team_members').delete().match({ team_id: teamId, member_id: memberId });

    try {
        const { error } = await supabase
            .from('team_members')
            .insert({ team_id: teamId, member_id: memberId, role: 'Member' });

        if (error) {
            console.error("❌ Join API Logic Failed:", JSON.stringify(error, null, 2));
            // Check specific code
            if (error.code === '23505') console.log("   (Duplicate key error - ignored in API)");
        } else {
            console.log("✅ Join API Logic Success.");
        }
    } catch (err) {
        console.error("❌ Crashed:", err);
    }
}

debugJoinAction();

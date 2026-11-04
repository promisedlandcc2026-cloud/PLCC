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

async function debugTeamCreation() {
    console.log("--- Debugging Team Creation ---");

    // 1. Get a Ministry ID
    const { data: ministries } = await supabase.from('ministries').select('id, name').limit(1);
    if (!ministries || ministries.length === 0) {
        console.error("No ministries found to test with.");
        return;
    }
    const ministryId = ministries[0].id;
    console.log(`Using Ministry: ${ministries[0].name} (${ministryId})`);

    // 2. Simulate POST payload (as sent by Frontend)
    const payload = {
        name: "Debug Team " + Date.now(),
        description: "Created via debug script",
        leaderId: "", // Frontend sends empty string if no leader
        color: "bg-burgundy",
        iconName: "Star",
        ministryId: ministryId
    };

    console.log("Payload:", payload);

    // 3. Validate Zod Schema (manually mimicking api/people/index.ts)
    // We can't import Zod easily here without modules set up, but we can verify the API call directly if we mock the handler
    // Instead, let's just insert directly via Supabase to check DB constraints, 
    // AND then try to "fetch" it like the frontend does to check if it returns.

    // Insert directly to DB first to verify DB accepts it
    const { data: team, error: insertError } = await supabase.from('teams').insert({
        name: payload.name,
        description: payload.description,
        leader_id: null, // Frontend sends "", Backend converts to null?
        color: payload.color,
        icon_name: payload.iconName,
        ministry_id: payload.ministryId
    }).select().single();

    if (insertError) {
        console.error("❌ DB Insert Failed:", insertError);
    } else {
        console.log("✅ DB Insert Success:", team);
    }

    // 4. Fetch teams and check if it has ministry_id
    const { data: fetchedTeams, error: fetchError } = await supabase.from('teams').select('*, ministry:ministries(id,name)').eq('id', team?.id);

    if (fetchError) {
        console.error("❌ DB Fetch Failed:", fetchError);
    } else {
        console.log("Fetched Team:", fetchedTeams[0]);
        if (fetchedTeams[0].ministry_id === ministryId) {
            console.log("✅ Ministry ID persisted correctly.");
        } else {
            console.error("❌ Ministry ID mismatch:", fetchedTeams[0].ministry_id);
        }
    }
}

debugTeamCreation();

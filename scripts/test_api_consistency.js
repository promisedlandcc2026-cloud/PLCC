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

async function testApiConsistency() {
    console.log("--- Testing API Consistency ---");

    // 1. Setup
    const { data: teams } = await supabase.from('teams').select('id, name').limit(1);
    const { data: members } = await supabase.from('members').select('id').limit(1);
    const teamId = teams[0].id;
    const memberId = members[0].id;

    // 2. Clear
    await supabase.from('team_members').delete().match({ team_id: teamId, member_id: memberId });

    // 3. Join
    console.log("Inserting member...");
    await supabase.from('team_members').insert({ team_id: teamId, member_id: memberId, role: 'Member' });

    // 4. Immediate Fetch (Race Condition Test)
    console.log("Fetching immediately...");
    const start = Date.now();
    const { data: fetchedTeams } = await supabase
        .from('teams')
        .select(`id, team_members (member_id)`)
        .eq('id', teamId);

    const duration = Date.now() - start;
    const count = fetchedTeams[0].team_members?.length || 0;

    console.log(`Fetch took ${duration}ms. Count: ${count}`);

    if (count > 0) {
        console.log("✅ API is consistent immediately.");
    } else {
        console.error("❌ API shows old data (replica lag?).");
    }
}

testApiConsistency();

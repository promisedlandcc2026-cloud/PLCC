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

async function debugTeamJoin() {
    console.log("--- Debugging Team Join Logic ---");

    // 1. Get a team and a member
    const { data: teams } = await supabase.from('teams').select('id, name').limit(1);
    const { data: members } = await supabase.from('members').select('id, first_name').limit(1);

    if (!teams?.length || !members?.length) {
        console.error("Missing teams or members data.");
        return;
    }

    const team = teams[0];
    const member = members[0];
    console.log(`Team: ${team.name}, Member: ${member.first_name}`);

    // 2. Clear existing membership
    await supabase.from('team_members').delete().match({ team_id: team.id, member_id: member.id });

    // 3. Simulate Join (mimic API)
    const { error: joinError } = await supabase
        .from('team_members')
        .insert({ team_id: team.id, member_id: member.id, role: 'Member' });

    if (joinError) {
        console.error("❌ Join Failed:", joinError);
    } else {
        console.log("✅ Join Inserted.");
    }

    // 4. Fetch Teams (mimic API GET)
    const { data: fetchedTeams } = await supabase
        .from('teams')
        .select(`
            id,
            team_members (member_id)
        `)
        .eq('id', team.id);

    const targetTeam = fetchedTeams[0];
    console.log("Fetched Raw:", JSON.stringify(targetTeam, null, 2));

    const count = targetTeam.team_members?.length || 0;
    console.log(`Calculated Count: ${count}`);

    if (count > 0) {
        console.log("✅ Count is updating correctly.");
    } else {
        console.error("❌ Count is still 0.");
    }
}

debugTeamJoin();

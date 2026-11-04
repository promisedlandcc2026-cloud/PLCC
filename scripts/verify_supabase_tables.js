import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local
dotenv.config({ path: path.join(__dirname, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAndSeed() {
    console.log("Checking Supabase Connection to:", supabaseUrl);

    // Check Ministries
    const { data: ministries, error: minError } = await supabase.from('ministries').select('*');

    if (minError) {
        console.log("❌ 'ministries' table error:", minError.code, minError.message);
        return;
    }

    console.log(`✅ 'ministries' table exists. Count: ${ministries.length}`);

    if (ministries.length === 0) {
        console.log("⚠️ Ministries table is empty. Seeding defaults...");
        const { error: seedError } = await supabase.from('ministries').insert([
            { name: 'Worship Arts', description: 'Choir, Band, and Media Team' },
            { name: 'Next Gen', description: 'Youth and Children Ministry' },
            { name: 'Guest Services', description: 'Ushers, Greeters, and Parking' },
            { name: 'Discipleship', description: 'Small Groups and Bible Studies' },
            { name: 'Outreach', description: 'Community Service and Evangelism' }
        ]);

        if (seedError) {
            console.error("Seed failed:", seedError);
        } else {
            console.log("✅ Seeded default ministries.");
        }
    } else {
        console.log("ℹ️ Ministries already exist, skipping seed.");
    }

    // Check Teams
    const { data: teams, error: teamError } = await supabase.from('teams').select('*');

    if (teamError) {
        console.log("❌ 'teams' table error:", teamError.code, teamError.message);
    } else {
        console.log(`✅ 'teams' table exists. Count: ${teams.length}`);
    }

    // Check Team Members
    const { data: teamMembers, error: tmError } = await supabase.from('team_members').select('count', { count: 'exact', head: true });

    if (tmError) {
        console.log("❌ 'team_members' table error:", tmError.code, tmError.message);
    } else {
        console.log("✅ 'team_members' table exists.");
    }
}

checkAndSeed();

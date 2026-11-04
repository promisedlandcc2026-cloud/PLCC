import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local
dotenv.config({ path: path.join(__dirname, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkAnonAccess() {
    console.log("Checking Anon Access to:", supabaseUrl);

    // Check Ministries
    const { data: ministries, error: minError } = await supabase.from('ministries').select('*');

    if (minError) {
        console.log("❌ Anon 'ministries' access failed:", minError.code, minError.message);
    } else {
        console.log(`✅ Anon 'ministries' count: ${ministries.length}`);
    }

    // Check Teams
    const { data: teams, error: teamError } = await supabase.from('teams').select('*');

    if (teamError) {
        console.log("❌ Anon 'teams' access failed:", teamError.code, teamError.message);
    } else {
        console.log(`✅ Anon 'teams' count: ${teams.length}`);
    }
}

checkAnonAccess();

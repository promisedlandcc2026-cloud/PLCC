
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE URL or KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Checking Supabase connection...");
    
    // Check organization_settings
    const { data: org, error: orgErr } = await supabase.from('organization_settings').select('*').limit(1);
    if (orgErr) {
        console.error("Error fetching organization_settings:", orgErr);
    } else {
        console.log("ORGANIZATION_SETTINGS:", JSON.stringify(org, null, 2));
    }
    
    // Check specific user in auth
    const targetId = 'eca646c4-857d-4149-8def-f5a017dbec63';
    console.log(`Checking if user ${targetId} exists in auth.users...`);
    const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(targetId);
    if (authErr) {
        console.error("Auth User Error:", authErr.message);
    } else {
        console.log("AUTH USER found:", authUser.user.email);
    }
}

check();

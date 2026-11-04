
import { createClient } from '@supabase/supabase-js';

const url = 'https://yrpwdrioomdihjlmcfnu.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!key) {
    console.error("No SUPABASE_SERVICE_ROLE_KEY found in environment (check .env.local)");
    process.exit(1);
}

const supabase = createClient(url, key);

async function check() {
    console.log("Checking Supabase connection...");

    // Check members table
    const { data: members, error: memberError } = await supabase.from('members').select('count', { count: 'exact', head: true });

    if (memberError) {
        console.error("❌ Table 'members' check failed:", memberError.message);
    } else {
        console.log("✅ Table 'members' exists.");
    }

    // Check users table
    const { data: users, error: userError } = await supabase.from('users').select('*');
    if (userError) {
        console.error("❌ Table 'users' check failed:", userError.message);
    } else if (users.length === 0) {
        console.log("⚠️ Table 'users' exists but is EMPTY.");
    } else {
        console.log(`✅ Table 'users' has ${users.length} rows.`);
        console.log("   First user:", users[0].email);
    }
}

check();

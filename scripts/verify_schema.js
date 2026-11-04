
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    console.log("Checking columns in minutes_documents...");
    const { data, error } = await supabase.from('minutes_documents').select('id, version, parent_id, is_latest').limit(1);

    if (error) {
        console.error("Verification failed (Columns missing?):", error.message);
    } else {
        console.log("Columns exist! Data:", data);
    }

    console.log("Checking users for department column...");
    const { data: userData, error: userError } = await supabase.from('users').select('id, department').limit(1);
    if (userError) {
        console.error("Users verification failed:", userError.message);
    } else {
        console.log("Users department column exists! Data:", userData);
    }
}

verify();

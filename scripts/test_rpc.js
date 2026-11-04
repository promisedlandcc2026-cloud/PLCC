
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testRpc() {
    console.log("Testing RPC exec_sql...");
    const { data, error } = await supabase.rpc('exec_sql', { sql: 'SELECT 1' });

    if (error) {
        console.error("RPC exec_sql failed:", error.message);
    } else {
        console.log("RPC exec_sql exists!", data);
    }
}

testRpc();

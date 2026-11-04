
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
    console.log('Checking if signature_data column exists...');

    // Check by trying to select the column
    const { data: checkData, error: checkError } = await supabase
        .from('minutes_acknowledgements')
        .select('id')
        .limit(1);

    if (checkError) {
        console.error('Could not read table:', checkError.message);
        return;
    }

    console.log('Table accessible. Attempting to add signature_data column via upsert trick...');

    // We can't run DDL directly. We'll verify using schema inspection.
    const { data: cols, error: colErr } = await supabase
        .from('minutes_acknowledgements')
        .select('signature_data')
        .limit(1);

    if (!colErr) {
        console.log('✅ signature_data column already exists!');
        return;
    }

    console.log('❌ Column does not exist yet. Error:', colErr.message);
    console.log('');
    console.log('⚠️  You need to run this SQL in Supabase Dashboard > SQL Editor:');
    console.log('');
    console.log('ALTER TABLE public.minutes_acknowledgements');
    console.log("ADD COLUMN IF NOT EXISTS signature_data TEXT;");
    console.log('');
    console.log('Go to: https://supabase.com/dashboard/project/yrpwdrioomdihjlmcfnu/sql');
}

applyMigration();

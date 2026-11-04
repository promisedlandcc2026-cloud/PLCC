
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Env Vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
    const userId = 'eca646c4-857d-4149-8def-f5a017dbec63';

    console.log(`Checking if user ${userId} exists in 'members'...`);

    // Check if member exists with this ID
    const { data: member, error } = await supabase
        .from('members')
        .select('*')
        .eq('id', userId)
        .single();

    if (member) {
        console.log("Member found:", member);
    } else {
        console.log("Member NOT found. Creating one...");

        // Fetch user data from Auth to get name/email
        const { data: { user }, error: authError } = await supabase.auth.admin.getUserById(userId);

        if (authError || !user) {
            console.error("Auth user not found!", authError);
            return;
        }

        const firstName = user.user_metadata?.name?.split(' ')[0] || "Admin";
        const lastName = user.user_metadata?.name?.split(' ').slice(1).join(' ') || "User";

        const { data: newMember, error: createError } = await supabase
            .from('members')
            .insert({
                id: userId, // Use same ID as Auth ID if possible?
                firstName: firstName,
                lastName: lastName,
                email: user.email,
                status: 'Active'
            })
            .select()
            .single();

        if (createError) {
            console.error("Failed to create member:", createError);
            // If ID constraint fails, maybe we need to let it auto-generate and store auth_id?
            // Let's check schema first by failing.
        } else {
            console.log("Created Member:", newMember);
        }
    }
}

run();

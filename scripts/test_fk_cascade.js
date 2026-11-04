
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConstraints() {
    console.log("Checking Foreign Key Constraints on 'team_members'...");

    // We can't easily query information_schema via JS client unless we have a stored procedure or direct SQL access.
    // However, we can try to TEST the update on a dummy record if we can't read schema.
    // Or we can try to call a raw RPC if one exists.

    // Attempt 1: RPC call (if you have a 'exec_sql' function, which is common in some setups, but unlikely here).
    // Attempt 2: Just try to create a dummy parent/child, update parent ID, see if child updates.

    try {
        // Create dummy member
        const dummyMemberId = '00000000-0000-0000-0000-000000000001';
        const newMemberId = '00000000-0000-0000-0000-000000000002';
        const dummyTeamId = '3d9ebe3f-87b6-4d1c-8eba-e393ebebdb72'; // Stewardship Team (using existing ID)

        console.log("Creating dummy member...");
        const { error: mError } = await supabase.from('members').insert({
            id: dummyMemberId,
            first_name: 'Test',
            last_name: 'Constraint',
            email: 'test_constraint@example.com',
            status: 'Active'
        });

        if (mError) {
            console.log("Setup failed (maybe exists):", mError.message);
            // Try to clean up first
            await supabase.from('team_members').delete().eq('member_id', dummyMemberId);
            await supabase.from('team_members').delete().eq('member_id', newMemberId);
            await supabase.from('members').delete().eq('id', dummyMemberId);
            await supabase.from('members').delete().eq('id', newMemberId);

            // Retry insert
            await supabase.from('members').insert({
                id: dummyMemberId,
                first_name: 'Test',
                last_name: 'Constraint',
                email: 'test_constraint@example.com',
                status: 'Active'
            });
        }

        console.log("Creating dummy team_member...");
        const { error: tmError } = await supabase.from('team_members').insert({
            team_id: dummyTeamId,
            member_id: dummyMemberId,
            role: 'Member'
        });

        if (tmError) {
            console.error("Failed to insert team_member:", tmError);
            return;
        }

        console.log("Attempting to UPDATE member ID (Cascading check)...");
        const { error: updateError } = await supabase.from('members')
            .update({ id: newMemberId })
            .eq('id', dummyMemberId);

        if (updateError) {
            console.error("Update Failed! Constraint likely restricts update:", updateError.message);
            console.log("CONCLUSION: ON UPDATE CASCADE is likely MISSING.");
        } else {
            console.log("Update Successful!");

            // Verify child
            const { data: child } = await supabase.from('team_members').select('*').eq('member_id', newMemberId);
            if (child && child.length > 0) {
                console.log("CONCLUSION: Child record updated. ON UPDATE CASCADE is PRESENT.");
            } else {
                console.log("CONCLUSION: Child record NOT found under new ID. Weird state.");
            }
        }

        // Cleanup
        console.log("Cleaning up...");
        await supabase.from('team_members').delete().eq('member_id', newMemberId);
        await supabase.from('team_members').delete().eq('member_id', dummyMemberId);
        await supabase.from('members').delete().eq('id', newMemberId);
        await supabase.from('members').delete().eq('id', dummyMemberId);

    } catch (err) {
        console.error("Test failed:", err);
    }
}

checkConstraints();

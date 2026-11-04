import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUserRole() {
    try {
        // Get all users to see what roles exist
        const { data: users, error } = await supabase
            .from('users')
            .select('id, email, name, role')
            .limit(10);

        if (error) {
            console.error('Error fetching users:', error);
            return;
        }

        console.log('Users in database:');
        console.log(JSON.stringify(users, null, 2));

        // Check specifically for super_admin or admin roles
        const admins = users.filter(u =>
            u.role && (u.role.toLowerCase().includes('admin') || u.role.toLowerCase().includes('super'))
        );

        console.log('\nAdmin users found:');
        console.log(JSON.stringify(admins, null, 2));
    } catch (err) {
        console.error('Error:', err);
    }
}

checkUserRole();

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Try using rpc or raw sql approach
async function testRpcSearch(query) {
    console.log(`\nRPC search with query: "${query}"`);
    
    // Try to find members where children array contains name matching the query
    // using Supabase's rpc for a raw SQL call
    const { data, error } = await supabase.rpc('search_members_by_child_name', { search_query: query });
    
    if (error) {
        console.error('RPC Error:', error);
    } else {
        console.log('RPC Results:', data);
    }
}

// Alternative: fetch all members with children and filter in-memory
async function testInMemorySearch(query) {
    console.log(`\nIn-memory search with query: "${query}"`);
    
    // Get members with children
    const { data, error } = await supabase
        .from('members')
        .select('id, first_name, last_name, household_name, children')
        .not('children', 'eq', '[]')
        .not('children', 'is', null);
    
    if (error) {
        console.error('Error:', error);
        return;
    }
    
    // Filter in memory
    const matching = (data || []).filter(m => 
        (m.children || []).some((c) => 
            c.name?.toLowerCase().includes(query.toLowerCase())
        )
    );
    
    console.log('Matching members with JSON children:', matching.map(m => 
        `${m.first_name} ${m.last_name} - children: ${m.children.map(c => c.name).join(', ')}`
    ));
}

async function run() {
    await testInMemorySearch('Had');
    await testInMemorySearch('Bit');
    await testInMemorySearch('Hadassah');
}

run();

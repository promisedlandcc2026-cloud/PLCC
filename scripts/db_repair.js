
import pg from 'pg';

const client = new pg.Client({
    connectionString: "postgresql://neondb_owner:npg_wi5HnauAO0Zy@ep-round-dream-ahntp5nw-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
});

async function runFix() {
    await client.connect();
    try {
        console.log("Checking and adding is_temporary_password to USERS...");
        await client.query(\`
            ALTER TABLE public.users 
            ADD COLUMN IF NOT EXISTS is_temporary_password BOOLEAN DEFAULT TRUE;
            
            UPDATE public.users 
            SET is_temporary_password = TRUE 
            WHERE is_temporary_password IS NULL;
        \`);

        console.log("Checking and adding is_temporary_password to MEMBERS...");
        await client.query(\`
            ALTER TABLE public.members 
            ADD COLUMN IF NOT EXISTS is_temporary_password BOOLEAN DEFAULT TRUE;
            
            UPDATE public.members 
            SET is_temporary_password = TRUE 
            WHERE is_temporary_password IS NULL;
        \`);

        console.log("Database repair successful.");
    } catch (err) {
        console.error("Database repair failed:", err);
    } finally {
        await client.end();
    }
}

runFix();

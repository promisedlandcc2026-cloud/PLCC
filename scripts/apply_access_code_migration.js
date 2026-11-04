
import pg from 'pg';
import fs from 'fs';

// Connection string from setup-users-table.js
const connectionString = "postgresql://neondb_owner:npg_wi5HnauAO0Zy@ep-round-dream-ahntp5nw-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";

const client = new pg.Client({
    connectionString: connectionString
});

async function runMigration() {
    await client.connect();
    try {
        console.log("Applying access_code migration...");

        const sql = `
            -- Add access_code column to members table
            ALTER TABLE members 
            ADD COLUMN IF NOT EXISTS access_code VARCHAR(4);

            -- Populate existing members with random 4-digit codes where missing
            UPDATE members 
            SET access_code = lpad(floor(random() * 10000)::text, 4, '0')
            WHERE access_code IS NULL;

            -- Create an index for fast lookup
            CREATE INDEX IF NOT EXISTS idx_members_access_code ON members(access_code);
        `;

        await client.query(sql);
        console.log("Migration applied successfully.");

        // Verifying
        const res = await client.query("SELECT count(*) as count FROM members WHERE access_code IS NOT NULL");
        console.log(`Members with access codes: ${res.rows[0].count}`);

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

runMigration();

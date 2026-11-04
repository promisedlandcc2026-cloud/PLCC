import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connection string from previous scripts
const connectionString = "postgresql://neondb_owner:npg_wi5HnauAO0Zy@ep-round-dream-ahntp5nw-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";

const client = new pg.Client({
    connectionString: connectionString
});

async function runMigration() {
    await client.connect();
    try {
        console.log("Reading migration files...");
        const teamsSqlPath = path.join(__dirname, 'create_teams_table.sql');
        const ministriesSqlPath = path.join(__dirname, 'update_ministry_teams_schema.sql');

        const teamsSql = fs.readFileSync(teamsSqlPath, 'utf8');
        const ministriesSql = fs.readFileSync(ministriesSqlPath, 'utf8');

        console.log("Creating teams table...");
        await client.query(teamsSql);

        console.log("Applying ministry teams schema migration...");
        await client.query(ministriesSql);
        console.log("Migration applied successfully.");

        // Verification
        const res = await client.query("SELECT count(*) as count FROM information_schema.tables WHERE table_name = 'ministries'");
        console.log(`Ministries table exists: ${res.rows[0].count > 0}`);

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

runMigration();

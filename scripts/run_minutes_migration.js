
import pg from 'pg';
import fs from 'fs';

const client = new pg.Client({
    connectionString: "postgresql://neondb_owner:npg_wi5HnauAO0Zy@ep-round-dream-ahntp5nw-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
});

async function runMigration() {
    try {
        await client.connect();
        console.log("Connected to database.");

        const fileName = process.argv[2] || 'migrate_minutes_versioning.sql';
        console.log(`Reading ${fileName}...`);
        const sql = fs.readFileSync(fileName, 'utf8');
        console.log("Executing migration SQL...");
        await client.query(sql);

        console.log("Migration completed successfully!");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

runMigration();

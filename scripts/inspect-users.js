
import pg from 'pg';

const client = new pg.Client({
    connectionString: "postgresql://neondb_owner:npg_wi5HnauAO0Zy@ep-round-dream-ahntp5nw-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
});

async function inspectUsers() {
    await client.connect();
    try {
        console.log("Inspecting 'organization_settings' table...");
        const columns = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'organization_settings'");
        console.log("COLUMNS:", JSON.stringify(columns.rows, null, 2));
        
        const res = await client.query("SELECT * FROM organization_settings LIMIT 1");
        console.log("DATA:", JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error("Error inspecting users:", err);
    } finally {
        await client.end();
    }
}

inspectUsers();

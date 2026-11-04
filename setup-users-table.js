
import pg from 'pg';
import bcrypt from 'bcryptjs';

const client = new pg.Client({
    connectionString: "postgresql://neondb_owner:npg_wi5HnauAO0Zy@ep-round-dream-ahntp5nw-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
});

async function setupUsers() {
    await client.connect();

    try {
        console.log("Setting up Users table...");

        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT DEFAULT 'member',
                avatar_url TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Table 'users' verified.");

        // Check if admin exists
        const res = await client.query("SELECT * FROM users WHERE email = $1", ['admin@portal-awc.org']);
        if (res.rows.length === 0) {
            console.log("Creating Admin User...");
            const hash = await bcrypt.hash('awc-vault-admin', 10);
            await client.query(`
                INSERT INTO users (email, password_hash, name, role)
                VALUES ($1, $2, $3, $4)
            `, ['admin@portal-awc.org', hash, 'Synergy Admin', 'admin']);
            console.log("Admin user created.");
        } else {
            console.log("Admin user already exists.");
        }

    } catch (err) {
        console.error("Error setting up users:", err);
    } finally {
        await client.end();
    }
}

setupUsers();

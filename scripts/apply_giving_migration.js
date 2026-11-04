
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

async function runSql() {
    console.log("Reading SQL file...");
    const sql = fs.readFileSync('create_giving_transactions.sql', 'utf8');

    try {
        const { Client } = await import('pg');
        if (!process.env.DATABASE_URL) {
            console.error("No DATABASE_URL found in .env.local");
            return;
        }

        const client = new Client({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });

        await client.connect();
        console.log("Connected to Postgres!");
        await client.query(sql);
        console.log("Migration executed successfully!");
        await client.end();

    } catch (err) {
        console.error("Failed to run SQL via PG client:", err.message);
    }
}

runSql();

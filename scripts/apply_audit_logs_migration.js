import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import pg from 'pg';

dotenv.config({ path: '.env.local' });

const { Client } = pg;

async function runSql() {
    console.log("Reading SQL file...");
    const sql = fs.readFileSync('create_audit_logs_table.sql', 'utf8');

    if (!process.env.DATABASE_URL) {
        console.error("No DATABASE_URL found in .env.local");
        process.exit(1);
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log("Connected to Postgres!");
        await client.query(sql);
        console.log("Migration executed successfully!");
    } catch (err) {
        console.error("Failed to run SQL via PG client:", err.message);
    } finally {
        await client.end();
    }
}

runSql();

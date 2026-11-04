#!/usr/bin/env node
/**
 * Apply howto_videos.category migration.
 *
 *   DATABASE_URL='postgresql://…' node scripts/apply-howto-videos-category.mjs
 *
 * Get DATABASE_URL from Supabase → Project Settings → Database → Connection string (URI).
 * If DATABASE_URL is missing, prints the SQL path and exits 2.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, '../supabase/migrations/howto_videos_category.sql');
const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DB_URL ||
  '';

if (!databaseUrl) {
  console.error(`
Cannot apply automatically — no DATABASE_URL in the environment.

Apply manually in Supabase → SQL Editor:
  ${sqlPath}

Or set DATABASE_URL and re-run:
  DATABASE_URL='postgresql://…' node scripts/apply-howto-videos-category.mjs
`);
  process.exit(2);
}

const { default: pg } = await import('pg');
const sql = fs.readFileSync(sqlPath, 'utf8');
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(sql);
  console.log('Applied howto_videos_category.sql');
  const { rows } = await client.query(
    `UPDATE public.howto_videos SET category = 'vault' WHERE category IS NULL OR category = '' RETURNING id, title, category`
  );
  console.log(`Tagged ${rows.length} row(s) as vault (if any needed).`);
} finally {
  await client.end();
}

/**
 * Upsert Linkr-sourced content (60 rows) into Neon Postgres.
 * Requires DATABASE_URL. Safe to re-run (replaces rows with author_label Linkr Discover%).
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const manifestPath = join(root, 'data', 'livelinkr-content.json');
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.error('Run: node scripts/build-livelinkr-manifest.mjs first', e.message);
  process.exit(1);
}

const now = () =>
  new Date(Date.now() + 9 * 3600_000).toISOString().replace('Z', '+09:00').slice(0, 19);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const prov = await client.query(
  `SELECT id FROM providers WHERE status = 'active' ORDER BY id ASC LIMIT 1`,
);
if (!prov.rows.length) {
  console.error('No providers — run seed-neon.mjs first');
  process.exit(1);
}
const defaultProviderId = prov.rows[0].id;

await client.query(`DELETE FROM content WHERE author_label LIKE 'Linkr Discover%'`);

let inserted = 0;
for (const item of manifest.items || []) {
  const priority =
    item.kind === 'blog' ? 30 : item.kind === 'shorts' ? 25 : item.kind === 'video' ? 20 : 10;
  await client.query(
    `INSERT INTO content (provider_id, doctor_id, title, summary, kind, category, url, author_label, approved, published_at, editorial_priority)
     VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, 1, $8::timestamptz, $9)`,
    [
      defaultProviderId,
      item.title,
      item.summary || '',
      item.kind,
      item.category || '내과',
      item.url || '',
      item.author_label || 'Linkr Discover',
      now(),
      priority,
    ],
  );
  inserted += 1;
}

console.log('imported', inserted, 'Linkr content rows', manifest.counts || {});
await client.end();

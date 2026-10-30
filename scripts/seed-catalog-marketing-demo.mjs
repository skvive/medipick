/**
 * Demo: a few smart-store PRO (monthly marketing) listings for UI QA.
 * Run after catalog import + migration 004.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const root = process.cwd();
const envPath = join(root, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
    if (m) process.env.DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, '');
  }
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const demos = [
  {
    nameLike: '%강남%',
    trade_category: '피부과 · 성형',
    video_url: '',
    google_blog_url: 'https://blog.google/',
    naver_blog_url: 'https://blog.naver.com/',
    priority_boost: 50,
  },
  {
    nameLike: '%한의원%',
    trade_category: '한의원',
    google_blog_url: 'https://blog.google/',
    priority_boost: 40,
  },
  {
    nameLike: '%치과%',
    trade_category: '치과',
    naver_blog_url: 'https://blog.naver.com/',
    priority_boost: 30,
  },
];

async function main() {
  const client = await pool.connect();
  try {
    for (const d of demos) {
      const r = await client.query(
        `UPDATE public_hospital_stores SET
          listing_tier = 'premium',
          marketing_active = TRUE,
          marketing_expires_at = '2099-12-31T23:59:59+09:00',
          trade_category = $2,
          video_url = COALESCE(NULLIF($3,''), video_url),
          google_blog_url = COALESCE(NULLIF($4,''), google_blog_url),
          naver_blog_url = COALESCE(NULLIF($5,''), naver_blog_url),
          priority_boost = $6,
          hero_image_url = '',
          updated_at = NOW()
        WHERE id = (
          SELECT id FROM public_hospital_stores
          WHERE store_listing = 'listed' AND name ILIKE $1
          ORDER BY review_count DESC NULLS LAST LIMIT 1
        )
        RETURNING id, name`,
        [
          d.nameLike,
          d.trade_category,
          d.video_url || '',
          d.google_blog_url || '',
          d.naver_blog_url || '',
          d.priority_boost,
        ],
      );
      console.log('premium demo', r.rows[0] || d.nameLike, '—', r.rowCount ? 'ok' : 'skip');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

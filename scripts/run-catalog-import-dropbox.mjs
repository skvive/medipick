import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dropbox = join('C:', 'Users', 'user', 'Dropbox', 'PC (9)', 'Downloads', '구글주소록_3000건단위');
process.env.IMPORT_UNNI_CSV = join(dropbox, 'unni_hospitals.csv');
process.env.IMPORT_PLATFORMS_XLSX = join(dropbox, 'med_platforms_hospitals.xlsx');

if (!existsSync(process.env.IMPORT_UNNI_CSV)) {
  console.error('Missing', process.env.IMPORT_UNNI_CSV);
  process.exit(1);
}

const envLocal = join(root, '.env.local');
if (!process.env.DATABASE_URL && existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
    if (m) process.env.DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, '');
  }
}
if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL (Neon connection string) then re-run npm run catalog:import:dropbox');
  process.exit(1);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('npm', ['run', 'db:migrate']);
run('python', ['scripts/import-public-hospital-catalog.py']);
run('node', ['scripts/seed-catalog-marketing-demo.mjs']);
console.log('Catalog import complete.');

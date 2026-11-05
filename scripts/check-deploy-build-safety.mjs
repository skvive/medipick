#!/usr/bin/env node
// Deployment builds must not modify a live medical catalog by running DB migrations/imports.
import { readFileSync } from 'node:fs';

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const commands = [String(vercel.buildCommand || ''), String(pkg.scripts?.build || '')];
const unsafe = /\b(?:db:migrate|db:seed|catalog:import|content:linkr|run-sql|import-(?:hira|public)|seed-neon)\b/i;

if (vercel.framework !== 'nextjs' || vercel.buildCommand !== 'npm run build') {
  console.error('Refusing unsafe/unexpected Vercel build command');
  process.exit(1);
}
for (const command of commands) {
  if (unsafe.test(command)) {
    console.error('Deployment build must not run database migrations/importers/seed jobs:', command);
    process.exit(1);
  }
}
console.log('PASS: Next.js build uses no implicit database migration/import/seed');

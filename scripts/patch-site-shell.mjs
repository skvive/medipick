#!/usr/bin/env node
/** Adds site-shell.css + site-chrome.js + data-mp-page to static HTML pages */
import fs from 'node:fs';
import path from 'node:path';

const web = path.join(process.cwd(), 'web');
const pages = [
  'consult.html',
  'my-health.html',
  'doctor-finance.html',
  'marketing-console.html',
  'clinic-access.html',
  'clinic-ops.html',
  'integrations.html',
  'doctors.html',
  'premium-admin.html',
  'advertiser.html',
];

const css = '<link rel="stylesheet" href="/assets/site-shell.css">';
const js = '<script src="/assets/site-chrome.js" defer></script>';

for (const file of pages) {
  const fp = path.join(web, file);
  let html = fs.readFileSync(fp, 'utf8');
  const key = file.replace('.html', '');

  if (!html.includes('site-shell.css')) {
    html = html.replace('</head>', `${css}</head>`);
  }
  if (!html.includes('site-chrome.js')) {
    html = html.replace('</body>', `${js}</body>`);
  }
  if (!html.includes('data-mp-page')) {
    html = html.replace('<body', `<body data-mp-page="${key}"`);
  }
  fs.writeFileSync(fp, html);
  console.log('patched', file);
}

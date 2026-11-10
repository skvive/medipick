import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const pages=['admin','advertiser','clinic-access','clinic-ops','clinic-store','consult',
 'doctor-finance','doctors','health-content','hospital','index','insurance-claims',
 'integrations','marketing-console','medical-center','my-health','offline','pharmacy',
 'portal','premium-admin','smart-store','specialties'];

test('all 22 HTML pages use a consistent first-paint header and no site-owned top ribbon',()=>{
 const css=read('web/assets/unified-navigation.css');
 assert.match(css,/position:fixed!important/);
 assert.match(css,/scrollbar-gutter:stable/);
 assert.match(css,/body\{padding-top:var\(--mu-header\)!important\}/);
 assert.match(css,/body > header:not\(#mpUnifiedHeader\)/);
 assert.match(css,/\.mp-u-nav \.mp-u-link\.is-active/);
 assert.match(css,/\.mp-u-auth-link\[hidden\]/);
 for(const page of pages){
   const source=read('web/'+page+'.html');
   assert.match(source,/\/assets\/unified-navigation\.css/,'missing stable CSS '+page);
   assert.match(source,/\/assets\/site-chrome\.js/,'missing shared header '+page);
   assert.doesNotMatch(source,/<div class="(?:demo-ribbon|notice-bar)">/,'obsolete ribbon '+page);
 }
});
test('exactly seven primary menu entries and one session-aware account action',()=>{
 const js=read('web/assets/site-chrome.js');
 const nav=js.slice(js.indexOf('const NAV=['),js.indexOf('];',js.indexOf('const NAV=[')));
 assert.equal((nav.match(/\['(?:home|hospitals|pharmacy|specialties|consult|medical|enroll)'/g)||[]).length,7);
 assert.match(js,/\/api\/account\/session/);
 assert.match(js,/credentials:'same-origin'/);
 assert.match(js,/data\?\.authenticated===true/);
 assert.match(js,/verified_neon_session/);
 assert.doesNotMatch(js,/localStorage\.getItem\(['"]logged/);
 const res=spawnSync(process.execPath,['--check',resolve(root,'web/assets/site-chrome.js')],{encoding:'utf8'});
 assert.equal(res.status,0,res.stderr);
});
test('Google remains the only interactive login method on sign-in and sign-up',()=>{
 const google=read('app/auth/OAuthButtons.tsx');
 for(const path of ['app/auth/sign-in/page.tsx','app/auth/sign-up/page.tsx']){
   const page=read(path);
   assert.match(page,/<OAuthButtons/);
   assert.doesNotMatch(page,/type="password"|signInWithEmail|signUpWithEmail|auth-divider/);
   assert.match(page,/auth\.getSession/);
 }
 assert.match(google,/provider:\s*'google'/);
 assert.doesNotMatch(google,/['"]github['"]|['"]vercel['"]|signIn\.email/);
 assert.match(google,/callbackURL\s*=\s*'\/account'/);
});
test('real Neon session endpoint is private, server authenticated and exposes no tokens',()=>{
 const file=read('app/api/account/session/route.ts');
 assert.match(file,/auth\.getSession/);
 assert.match(file,/private, no-store/);
 assert.match(file,/Vary.*Cookie/);
 assert.match(file,/authenticated:\s*false/);
 assert.match(file,/verified_neon_session/);
 assert.doesNotMatch(file,/session\.token|set-cookie|process\.env\.NEON_AUTH_COOKIE_SECRET/);
});
test('My Page reads real session and links only to existing services',()=>{
 const page=read('app/account/page.tsx');
 assert.match(page,/auth\.getSession\(\)/);
 assert.match(page,/redirect\('\/auth\/sign-in'\)/);
 assert.match(page,/signOutAction/);
 for(const path of ['/my-health','/smart-store','/pharmacy','/consult','/medical-center','/clinic-store']){
   assert.ok(page.includes(path),'missing dashboard module '+path);
 }
 assert.match(page,/서버 동기화 전/);
 assert.match(page,/별도 기관 승인 필요/);
});

test('same-origin Neon Auth proxy rejects non-Google login methods',()=>{
 const route=read('app/api/auth/[...path]/route.ts');
 assert.match(route,/sign-in\\/email/);
 assert.match(route,/sign-up\\/email/);
 assert.match(route,/sign-in\\/social/);
 assert.match(route,/data\\?\\.provider !== 'google'/);
 assert.match(route,/return handlers\.POST\(request\)/);
 assert.match(route,/status: 403/);
});

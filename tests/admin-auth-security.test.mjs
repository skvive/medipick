import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const authSource = readFileSync(new URL('../lib/medipick/auth.ts', import.meta.url), 'utf8');
const publicHtml = readFileSync(new URL('../web/admin.html', import.meta.url), 'utf8');
const js = ts.transpileModule(authSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const require = createRequire(import.meta.url);

function loadAuth(env = {}) {
  const module = { exports: {} };
  runInNewContext(js, {
    exports: module.exports,
    module,
    require,
    process: { env },
    Buffer,
    Date,
    Error,
  }, { filename: 'auth.cjs', timeout: 2000 });
  return module.exports;
}

test('no default admin password or signing secret is embedded in production code', () => {
  assert.doesNotMatch(authSource, /MEDIPICK_ADMIN_PASSWORD\s*\|\|/);
  assert.doesNotMatch(authSource, /MEDIPICK_SECRET\s*\|\|/);
  assert.doesNotMatch(publicHtml, /medipick-demo-2026|dev-only-change-me/);
});

test('missing admin credentials fail closed', () => {
  const auth = loadAuth({ NODE_ENV: 'production' });
  assert.equal(auth.passwordOk('medipick-demo-2026'), false);
  assert.equal(auth.passwordOk('any'), false);
  assert.equal(auth.sessionOk('medipick_admin=not-a-signed-session'), false);
  assert.throws(() => auth.makeSession());
});

test('password or session secret missing individually fails closed', () => {
  assert.equal(loadAuth({ MEDIPICK_ADMIN_PASSWORD: 'private-test-pass' }).passwordOk('private-test-pass'), false);
  assert.equal(loadAuth({ MEDIPICK_SECRET: 'test-only-signing-secret' }).passwordOk('private-test-pass'), false);
});

test('configured credentials log in and verify session with bounded lifetime', () => {
  const auth = loadAuth({ NODE_ENV: 'production', MEDIPICK_ADMIN_PASSWORD: 'private-test-pass', MEDIPICK_SECRET: 'test-only-signing-secret' });
  assert.equal(auth.passwordOk('private-test-pass'), true);
  assert.equal(auth.passwordOk('incorrect'), false);
  const token = auth.makeSession();
  assert.equal(auth.sessionOk('medipick_admin=' + token), true);
  assert.equal(auth.sessionOk('medipick_admin=' + token + 'fake'), false);
  assert.equal(auth.sessionOk('medipick_admin=0.a.b'), false);
  const cookie = auth.sessionCookie(token);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Strict/);
  assert.match(auth.clearSessionCookie(), /; Secure/);
  assert.match(auth.clearSessionCookie(), /Max-Age=0/);
});

test('local HTTP dev is not forcibly marked Secure unless explicitly configured', () => {
  const env = { NODE_ENV: 'development', MEDIPICK_ADMIN_PASSWORD: 'test', MEDIPICK_SECRET: 'secret' };
  const auth = loadAuth(env);
  assert.doesNotMatch(auth.sessionCookie('test'), /; Secure/);
  assert.match(loadAuth({ ...env, MEDIPICK_COOKIE_SECURE: '1' }).sessionCookie('test'), /; Secure/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path, env) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, require, process: {env}, Buffer, Date, Error },
    {filename: path, timeout: 2000});
  return module.exports;
}

test('privileged clinic HMAC fails closed when MEDIPICK_SECRET is absent', () => {
  for (const env of [{NODE_ENV: 'production'}, {NODE_ENV: 'development'}]) {
    const keys = load('../lib/medipick/helpers.ts', env);
    assert.throws(() => keys.medipickSecret(), /MEDIPICK_SECRET/);
    assert.throws(() => keys.issueClinicKey(1, 'test', 'schedule_read'), /MEDIPICK_SECRET/);
    assert.throws(() => keys.issueDoctorKey('test'), /MEDIPICK_SECRET/);
  }
});

test('publicly documented development secret is rejected for signing all privileged tokens', () => {
  const env={NODE_ENV:'production', MEDIPICK_SECRET:'dev-only-change-me'};
  const keys=load('../lib/medipick/helpers.ts',env);
  assert.throws(() => keys.tokenDigest('clinic','private-test-token'), /MEDIPICK_SECRET/);
  const admin=load('../lib/medipick/auth.ts',{...env,MEDIPICK_ADMIN_PASSWORD:'private-test-pass'});
  assert.equal(admin.passwordOk('private-test-pass'), false);
  assert.throws(()=>admin.makeSession(), /MEDIPICK/);
});

test('known demo admin password cannot authenticate when configured in environment', () => {
  const admin=load('../lib/medipick/auth.ts',{
    NODE_ENV:'production',MEDIPICK_ADMIN_PASSWORD:'medipick-demo-2026',
    MEDIPICK_SECRET:'non-public-unique-test-signing-secret',
  });
  assert.equal(admin.passwordOk('medipick-demo-2026'),false);
});

test('unique configured secret preserves existing HMAC token semantics', () => {
  const env={NODE_ENV:'production',MEDIPICK_SECRET:'unique-test-only-secret-do-not-use-in-real-app'};
  const keys=load('../lib/medipick/helpers.ts',env);
  const clinic=keys.issueClinicKey(7,'test','schedule_read');
  const doctor=keys.issueDoctorKey('test');
  assert.match(clinic.token,/^mpclinic_/);
  assert.match(doctor.token,/^mpdoc_/);
  assert.equal(clinic.digest,keys.tokenDigest('clinic',clinic.token));
  assert.equal(doctor.digest,keys.tokenDigest('doctor',doctor.token));
  assert.equal(keys.medipickSecret().toString('utf8'),env.MEDIPICK_SECRET);
});

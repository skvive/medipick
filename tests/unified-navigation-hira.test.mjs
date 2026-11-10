import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=(p)=>readFileSync(resolve(root,p),'utf8');
const pages=['admin','advertiser','clinic-access','clinic-ops','clinic-store','consult',
 'doctor-finance','doctors','health-content','hospital','index','insurance-claims',
 'integrations','marketing-console','my-health','offline','portal','premium-admin','smart-store',
 'pharmacy','specialties','medical-center'];
test('all 22 public and detail pages use one canonical shared navigation',()=>{
 const common=read('web/assets/site-chrome.js');
 const expected=['홈','병원찾기','약국찾기','진료과목','AI 건강상담','메디컬센터','입점안내'];
 for(const name of expected)assert.ok(common.includes(name),'missing menu '+name);
 const navOnly=common.slice(common.indexOf('const NAV=['),common.indexOf('];',common.indexOf('const NAV=['))+2);
 assert.equal((navOnly.match(/\['(?:home|hospitals|pharmacy|specialties|consult|medical|enroll)'/g)||[]).length,7);
 for(const name of pages){
  const src=read('web/'+name+'.html');
  assert.ok(src.includes('/assets/unified-navigation.css'),'no shared CSS on '+name);
  assert.ok(src.includes('/assets/site-chrome.js'),'no unified JS on '+name);
 }
 assert.match(read('web/assets/unified-navigation.css'),/mp-old-header/);
 assert.match(common,/aria-current/);
 assert.match(common,/aria-expanded/);
});
test('HIRA public-portal v2 is server-only and never echoes credential',()=>{
 const client=read('lib/medipick/hira-client.ts');
 assert.match(client,/hospInfoServicev2\/getHospBasisList/);
 assert.match(client,/process\.env\.HIRA_HOSPITAL_SERVICE_KEY/);
 assert.match(client,/redirect:'error'/);
 assert.match(client,/latitude:coordinateValid/);
 assert.doesNotMatch(read('web/assets/smart-store.js'),/process\.env\.HIRA_HOSPITAL_SERVICE_KEY/);
 assert.doesNotMatch(client,/[0-9a-f]{64}/);
 assert.match(read('app/api/hira/status/route.ts'),/queryHira/);
 assert.match(read('app/api/hira/hospitals/route.ts'),/allowRequest/);
 assert.match(read('web/assets/smart-store.js'),/searchHiraOnDemand/);
 assert.match(read('web/index.html'),/id="smartHiraSearch"/);
 assert.match(read('web/smart-store.html'),/id="smartHiraSearch"/);
});
test('pharmacy and medical magazine distinguish public Google places and approved content',()=>{
 const pharmacy=read('web/pharmacy.html');
 assert.match(pharmacy,/id="phGeo"/);assert.match(pharmacy,/id="phSearch"/);
 assert.match(pharmacy,/24시간/);assert.match(pharmacy,/e-gen\.or\.kr/);
 const js=read('web/assets/pharmacy.js');
 assert.match(js,/getCurrentPosition/);assert.match(js,/Place\.searchNearby/);
 assert.match(js,/includedTypes:\['pharmacy'\]/);
 const center=read('web/assets/medical-center.js');
 assert.match(center,/Number\(p\.approved\)!==1/);
 assert.match(center,/\/api\/content/);
 assert.match(center,/youtube/);
 assert.match(read('web/medical-center.html'),/id="medicalFeed"/);
});
test('new static routes are registered and JS parses',()=>{
 const routes=read('next.config.ts');
 for(const page of ['pharmacy','specialties','medical-center'])assert.ok(routes.includes("'"+page+"'"));
 const js=['site-chrome','pharmacy','medical-center','smart-store'];
 for(const name of js){
  const path=resolve(root,'web/assets/'+name+'.js');assert.ok(existsSync(path));
  const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  assert.equal(result.status,0,name+': '+result.stderr);
 }
});

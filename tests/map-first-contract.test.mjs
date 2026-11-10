import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root,path), 'utf8');

test('map-first homepage keeps exactly one map/result widget and all required controls', () => {
  const src=read('web/index.html');
  const required=['smartSearchForm','smartQ','smartTrade','smartRegion','smartRadius',
    'smartEstimated','smartLocate','smartDemo','smartList','smartDetail','smartStoreMap','smartModes','smartStats','smartNotice','toast'];
  for(const id of required) assert.equal((src.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'missing/duplicate '+id);
  assert.match(src,/smart-store\.js/);
  assert.doesNotMatch(src,/<script[^>]+src="\/assets\/app\.js"/);
  assert.match(src,/class="mp-ref-hero"/,'reference hero must exist');
  assert.match(src,/class="mp-ref-services"/,'horizontal category ribbon must exist');
  assert.match(src,/class="mp-ref-columns"/,'map/list/department panels must exist');
  assert.match(src,/class="mp-ref-dept-grid"/,'department shortcuts must exist');
});

test('existing long homepage and legacy navigation are kept in separate portal', () => {
  const portal=read('web/portal.html');
  assert.match(portal,/id="directoryPage"/);
  assert.match(portal,/id="nearMap"/);
  assert.match(portal,/src="\/assets\/app\.js"/);
  const next=read('next.config.ts');
  assert.match(next,/'portal'/);assert.match(next,/'clinic-store'/);
  assert.match(read('web/index.html'),/location\.replace\([\"']\/portal[\"']/);
});

test('geolocation searches nearby exact locations with explicit consent and no approximation default', () => {
  const src=read('web/assets/smart-store.js');
  assert.match(src,/locationMode === 'geo'/);
  assert.match(src,/api\/public-catalog\/nearby/);
  assert.match(src,/include_estimated: usingEstimates\?'1':'0'/);
  assert.match(src,/getCurrentPosition/);
  assert.match(src,/precise = x\.geocode_status === 'exact'/);
  assert.match(src,/if \(!precise && !\$\('#smartEstimated'\)\?\.checked\) continue/);
  assert.doesNotMatch(src,/radiusMode = usingEstimates && !q/);
  assert.match(src,/google\.maps\.marker\?\.AdvancedMarkerElement/);
});

test('unapproved directory records are not treated as clinic storefronts', () => {
  const src=read('web/assets/clinic-store.js');
  assert.match(src,/store\.is_premium!==true/);
  assert.match(src,/store\.ui\?\.variant!=='premium'/);
  assert.match(src,/textContent/);
  const api=read('app/api/clinic-store/[id]/posts/route.ts');
  assert.match(api,/!store\.is_premium/);
  assert.match(api,/endsWith\('\.blogspot\.com'\)/);
  assert.match(api,/redirect:'error'/);
  assert.match(api,/AbortSignal\.timeout/);
  assert.match(api,/content-length/);
  assert.doesNotMatch(api,/innerHTML/);
});

test('store activation uses existing admin-protected catalog marketing API and compliance check',()=>{
  const s=read('web/assets/premium-admin.js');
  assert.match(s,/storeAdminCompliance/);
  assert.match(s,/\/api\/admin\/public-catalog\//);
  assert.match(s,/marketing/);
  assert.match(read('web/premium-admin.html'),/id="catalogStoreForm"/);
});

test('local JavaScript syntax parses without adding dependencies',()=>{
  const files=['web/assets/smart-store.js','web/assets/clinic-store.js','web/assets/premium-admin.js','web/assets/site-chrome.js'];
  for(const file of files){
    assert.ok(existsSync(resolve(root,file)));
    const r=spawnSync(process.execPath,['--check',resolve(root,file)],{encoding:'utf8'});
    assert.equal(r.status,0,file+'\n'+r.stderr);
  }
});

test('Google Places (New) search is user-initiated, attributed, and kept separate from internal provider records',()=>{
  const js=read('web/assets/smart-store.js');
  const home=read('web/index.html');
  const directory=read('web/smart-store.html');
  for(const page of [home,directory]){
    assert.match(page,/id="smartGooglePlaces"/);
    assert.match(page,/id="googlePlacesSection"/);
    assert.match(page,/id="googlePlacesResults"/);
    assert.match(page,/id="clearGooglePlaces"/);
  }
  assert.match(js,/addEventListener\('click', searchGooglePlacesOnDemand\)/);
  assert.match(js,/Place\.searchNearby\(query\)/);
  assert.match(js,/google\.maps\.importLibrary\('places'\)/);
  assert.match(js,/includedTypes:\['hospital','doctor','dentist'\]/);
  assert.match(js,/Google Places 검색 결과/);
  assert.match(js,/googleSource\?'#7651dc'/);
  assert.match(js,/clearGooglePlacesResults\(\);\s*center = \{ lat, lng \};/);
  assert.doesNotMatch(js,/fetch\(['"]\/api\/admin\/locations['"]/);
});
test('clinic storefront has actual no-JS onboarding content instead of a blank page',()=>{
  const html=read('web/clinic-store.html');
  assert.match(html,/<section id="clinicStoreLanding" class="mp-store-landing">/);
  assert.match(html,/id="clinicStoreProfile" class="mp-store-profile" hidden/);
  assert.match(html,/Blogger/);
});

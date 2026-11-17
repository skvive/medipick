import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');

test('main, full directory and pharmacy default to actual 2km search radius',()=>{
 for(const page of ['index','smart-store']){
  const src=read('web/'+page+'.html');
  assert.match(src,/<option value="2" selected>2km<\/option>/);
  assert.match(src,/id="smartLocate"/);
 }
 const pharmacy=read('web/pharmacy.html');
 assert.match(pharmacy,/<option value="2" selected>2km<\/option>/);
 assert.match(pharmacy,/id="phGeo"/);
});

test('nearby search automatically prioritizes HIRA coordinates, without relabeling Google pins',()=>{
 const src=read('web/assets/smart-store.js');
 assert.match(src,/getCurrentPosition/);
 assert.match(src,/locationMode='geo'/);
 assert.match(src,/void searchHiraOnDemand\(\{automatic:true\}\)/);
 assert.match(src,/hiraActivePlaces=places/);
 assert.match(src,/renderHiraMarkers\(\)/);
 assert.match(src,/locationMode!=='region'/);
 assert.match(src,/Number\(\$\('#smartRadius'\)\?\.value\|\|2\)\*1000/);
 assert.match(src,/HIRA 공식 좌표/);
});
test('catalog details verify exact HIRA identity and doctor counts are from official detail API',()=>{
 const client=read('web/assets/smart-store.js');
 const resolve=read('app/api/hira/resolve/route.ts');
 const details=read('app/api/hira/details/route.ts');
 const source=read('lib/medipick/hira-client.ts');
 assert.match(client,/enrichCatalogWithHira\(item,detail\)/);
 assert.match(client,/openHiraDetail\(hospital,null,\{catalogPhone:item.phone\}\)/);
 assert.match(client,/개인 확인 대기목록/);
 assert.match(resolve,/queryHira/);
 assert.match(resolve,/roadKey\(x.address\)===road/);
 assert.match(details,/queryHiraDetails/);
 assert.match(source,/getDgsbjtInfo2\.8/);
 assert.match(source,/getSpcSbjtSdrInfo2\.8/);
 assert.match(source,/physicianNamesAvailable:false/);
});
test('server does not return hospital locations beyond selected official 2km radius',()=>{
 const src=read('app/api/hira/hospitals/route.ts');
 assert.match(src,/radius\/1000/);
 assert.match(src,/item\.coordinateSource==='HIRA_API'/);
 assert.match(src,/item\.distanceKm!==null/);
 assert.match(src,/items:insideRadius/);
 assert.match(src,/getHospBasisList|queryHira/);
});
test('pharmacy location button immediately searches actual Places data',()=>{
 const src=read('web/assets/pharmacy.js');
 assert.match(src,/getCurrentPosition/);
 assert.match(src,/search\(\); \/\/ This follows the user's explicit location-search action/);
 assert.match(src,/includedTypes:\['pharmacy'\]/);
 assert.match(src,/Number\(\$\('phRadius'\)\.value\|\|2\)\*1000/);
});
test('map and pharmacy JavaScript remain syntactically valid',()=>{
 for(const name of ['smart-store','pharmacy']){
  const p=resolve(root,'web/assets/'+name+'.js');
  const result=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
 }
});

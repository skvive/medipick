import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');

test('HIRA client requests up to 500 genuine rows rather than silently dropping records after 30',()=>{
 const client=read('lib/medipick/hira-client.ts');
 assert.match(client,/\.slice\(0,500\)\.map/);
 assert.match(client,/Math\.min\(100,Math\.max\(1,Math\.trunc\(Number\(opts\.pageNo\)/);
 assert.match(client,/Math\.min\(500,Math\.max\(1,Math\.trunc\(Number\(opts\.numOfRows\)/);
 assert.match(client,/pageSize:numberOrNull\(get\(xml,'numOfRows'\)\)\|\|undefined/);
 assert.doesNotMatch(client,/xml\.matchAll\([^\n]+\)\)\.slice\(0,30\)/);
});
test('HIRA route accepts pages and makes partial coverage visible without caching upstream errors',()=>{
 const src=read('app/api/hira/hospitals/route.ts');
 assert.match(src,/searchParams\.get\('page'\)/);
 assert.match(src,/pageNo:page,numOfRows:size/);
 assert.match(src,/pageSize:effectiveSize,hasMore/);
 assert.match(src,/item\.coordinateSource==='HIRA_API'/);
 assert.match(src,/item\.distanceKm<=radius\/1000/);
 assert.match(src,/'no-store'/);
 assert.doesNotMatch(src,/pageNo:1,numOfRows:20/);
});
test('browser processes bounded official pages, deduplicates and distinguishes total from verified pins',()=>{
 const js=read('web/assets/smart-store.js');
 assert.match(js,/for\(let page=1;page<=10&&more;page\+\+\)/);
 assert.match(js,/size:'500'/);
 assert.match(js,/if\(!seen\.has\(id\)\)/);
 assert.match(js,/const incomplete=more\|\|partial/);
 assert.match(js,/officialTotal\.toLocaleString\(\)/);
 assert.match(js,/HIRA_API/);
 assert.match(js,/locationMode==='default'&&viewMode==='catalog'/);
 assert.doesNotMatch(js,/data\.items\)\?data\.items\.slice\(0,20\)/);
});
test('HIRA health-check 502 is not cached as success',()=>{
 const s=read('app/api/hira/status/route.ts');
 assert.match(s,/data\.ok\?'public,s-maxage=180,stale-while-revalidate=300':'no-store'/);
});

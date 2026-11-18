import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
test('five reusable Korean clinic photo fallback assets exist as compact WebP files',()=>{
  for(let i=1;i<=5;i++){
    const name='web/assets/photos/medipick-clinic-fallback-'+String(i).padStart(2,'0')+'.webp';
    const raw=readFileSync(resolve(root,name));
    assert.equal(raw.toString('ascii',0,4),'RIFF',name);
    assert.equal(raw.toString('ascii',8,12),'WEBP',name);
    assert.ok(raw.byteLength>1000&&raw.byteLength<50000,name);
  }
});
test('hospital, HIRA and Google Places cards use a stable illustrative fallback without photo labels',()=>{
  const js=read('web/assets/smart-store.js');
  assert.match(js,/function clinicFallbackImage\(identity\)/);
  assert.match(js,/Math\.imul\(hash,31\)/);
  assert.match(js,/clinicPhotoMarkup\(x\.ui\?\.hero_image,x\.id\|\|x\.name\)/);
  assert.match(js,/createClinicPhoto\(p\.id\|\|p\.name\)/);
  assert.match(js,/createClinicPhoto\(place\.id\|\|place\.displayName\)/);
  assert.doesNotMatch(js,/AI 연출|mp-clinic-photo-label/);
  assert.match(js,/<img src=/);
  assert.match(js,/alt=""/);
  const css=read('web/assets/smart-store.css');
  assert.doesNotMatch(css,/mp-clinic-photo-label/);
});

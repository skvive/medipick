import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Read-only production smoke. Never submits forms, follows login links,
// runs migrations, or supplies user/API credentials.
const root = process.cwd();
const base = (process.env.MEDIPICK_PUBLIC_BASE || 'https://medipick.lexid.site').replace(/\/$/, '');
const pages = readdirSync(join(root, 'web'))
  .filter(name => name.endsWith('.html') && name !== 'offline.html')
  .map(name => name === 'index.html' ? '/' : '/' + name.slice(0, -5));
const routes = [...new Set([...pages, '/auth/sign-in', '/auth/sign-up', '/account'])];
const rows = [];
function defer(ms){return new Promise(resolve => setTimeout(resolve,ms));}

async function check(path) {
  for(let attempt=1; attempt<=2; attempt++) {
    try {
      const res = await fetch(base + path, {
        method:'GET', redirect:'manual', signal:AbortSignal.timeout(15000),
        headers:{'Accept':'text/html'}
      });
      const type=res.headers.get('content-type') || '';
      const redirect=res.headers.get('location') || '';
      const body=res.status === 200 ? (await res.text()).slice(0,120000) : '';
      const htmlOk=res.status === 200 &&
        /text\/html/.test(type) && /<html\b/i.test(body) &&
        !/<title>404\b|this page could not be found|NEXT_NOT_FOUND/i.test(body);
      const isProtected=path === '/account';
      const legitimateRedirect=isProtected &&
        [301,302,303,307,308].includes(res.status) &&
        /\/auth\/sign-in/.test(redirect);
      const cleanRedirect=[301,302,303,307,308].includes(res.status) &&
        !redirect.startsWith('http:') && !redirect.startsWith('//') &&
        (!redirect.startsWith('https://') || redirect.startsWith(base));
      const ok=htmlOk || legitimateRedirect || (!isProtected && cleanRedirect);
      return {path,status:res.status,type:type.slice(0,48),redirect:redirect.slice(0,200),
        html:htmlOk,ok,error:ok?'':('Unexpected response for public page')};
    }catch(e){
      if(attempt===2)return {path,status:0,ok:false,error:String(e?.name || e).slice(0,120)};
      await defer(800);
    }
  }
}
for(let offset=0;offset<routes.length;offset+=4) {
  const part=await Promise.all(routes.slice(offset,offset+4).map(check));
  rows.push(...part);
  for(const p of part)console.log((p.ok?'PASS ':'FAIL ') + p.path + ' ('+p.status+') ' + (p.error||''));
}
const dir=process.env.MEDIPICK_QA_OUTPUT || 'docs/live_navigation_qa';
mkdirSync(dir,{recursive:true});
const report={base,checkedAt:new Date().toISOString(),routeCount:routes.length,
 passed:rows.filter(x=>x.ok).length,failed:rows.filter(x=>!x.ok).length,rows};
writeFileSync(resolve(dir,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');
console.log('PUBLIC_ROUTE_SMOKE '+report.passed+'/'+report.routeCount);
if(report.failed>0)process.exitCode=1;

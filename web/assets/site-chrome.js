/* MEDIPICK unified navigation v9 — every public, detail and admin page shares exactly the same 7 primary links. */
(() => {
'use strict';
const NAV=[
 ['home','/','홈'],
 ['hospitals','/smart-store','병원찾기'],
 ['pharmacy','/pharmacy','약국찾기'],
 ['specialties','/specialties','진료과목'],
 ['consult','/consult','AI 건강상담'],
 ['medical','/medical-center','메디컬센터'],
 ['enroll','/clinic-store','입점안내']
];
const SECONDARY=[
 ['/health-content','건강정보'],['/doctors','Blogger 소유권 확인'],['/my-health','건강노트'],
 ['/insurance-claims','보험·약제비'],['/clinic-ops','예약 운영'],['/doctor-finance','병원 경영'],
 ['/premium-admin','스마트스토어 관리'],['/integrations','서비스 연동'],['/admin','관리자']
];
const getPage=()=>{
 const path=location.pathname.replace(/\/$/,'')||'/';
 const key=path.split('/').pop()?.replace(/\.html$/,'')||'home';
 if(path==='/')return 'home';
 if(['smart-store','hospital'].includes(key))return 'hospitals';
 if(key==='pharmacy')return 'pharmacy';
 if(['specialties','portal'].includes(key))return 'specialties';
 if(key==='consult')return 'consult';
 if(['medical-center','health-content','doctors'].includes(key))return 'medical';
 if(['clinic-store','premium-admin'].includes(key))return 'enroll';
 return '';
};
function a(href,label,active,key){
 const el=document.createElement('a');el.href=href;el.textContent=label;
 el.className='mp-u-link'+(key===active?' is-active':'');
 if(key===active)el.setAttribute('aria-current','page');
 return el;
}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;}
function install(){
 if(document.getElementById('mpUnifiedHeader'))return;
 const active=getPage();
 const old=Array.from(document.body.children).filter(e=>e.tagName==='HEADER' && !e.closest('main'));
 // Keep original DOM to preserve legacy event bindings, but never show conflicting primary navigation.
 for(const h of old){h.classList.add('mp-old-header');h.setAttribute('aria-hidden','true');h.setAttribute('inert','');}
 // Prevent a duplicated legacy nav drawer when earlier page scripts create their own.
 document.querySelectorAll('body > .mp-nav-drawer').forEach(d=>{d.hidden=true;d.classList.add('mp-old-header');});
 const header=el('header','mp-unified-header');header.id='mpUnifiedHeader';header.setAttribute('role','banner');
 const inner=el('div','mp-u-inner');
 const brand=a('/','',null,'brand');brand.className='mp-u-brand';brand.setAttribute('aria-label','메디픽 홈페이지');
 const logo=document.createElement('img');logo.src='/assets/logo-full.svg';logo.alt='MediPick 메디픽';logo.width=165;logo.height=38;logo.decoding='async';
 brand.appendChild(logo);
 const nav=el('nav','mp-u-nav');nav.setAttribute('aria-label','메디픽 주 메뉴');
 NAV.forEach(([key,path,label])=>nav.appendChild(a(path,label,active,key)));
 const actions=el('div','mp-u-actions');
 const signIn=a('/auth/sign-in','Google로 로그인');signIn.className='mp-u-signin mp-u-auth-link';
 const account=a('/account','마이페이지');account.className='mp-u-account mp-u-auth-link';account.hidden=true;
 if(location.pathname==='/account'){account.setAttribute('aria-current','page');account.classList.add('is-active');}
 const toggle=el('button','mp-u-toggle','☰');toggle.id='mpUnifiedMenuToggle';toggle.type='button';
 toggle.setAttribute('aria-label','전체 메뉴 열기');toggle.setAttribute('aria-controls','mpUnifiedDrawer');toggle.setAttribute('aria-expanded','false');
 actions.append(signIn,account,toggle);
 inner.append(brand,nav,actions);header.appendChild(inner);
 const drawer=el('div','mp-u-drawer');drawer.id='mpUnifiedDrawer';drawer.hidden=true;
 const backdrop=el('button','mp-u-backdrop');backdrop.type='button';backdrop.setAttribute('aria-label','메뉴 닫기');
 const panel=el('nav','mp-u-panel');panel.setAttribute('aria-label','메디픽 전체 메뉴');
 const top=el('div','mp-u-panel-head');
 top.appendChild(el('strong','','MEDIPICK'));
 const close=el('button','mp-u-close','×');close.type='button';close.setAttribute('aria-label','메뉴 닫기');
 top.appendChild(close);panel.appendChild(top);
 NAV.forEach(([key,path,label])=>panel.appendChild(a(path,label,active,key)));
 panel.appendChild(el('div','mp-u-panel-section','부가 서비스'));
 SECONDARY.forEach(([href,label])=>panel.appendChild(a(href,label,active,'secondary')));
 const drawerSignIn=a('/auth/sign-in','Google로 로그인');drawerSignIn.classList.add('mp-u-drawer-login');
 const drawerAccount=a('/account','마이페이지');drawerAccount.classList.add('mp-u-drawer-account');drawerAccount.hidden=true;
 panel.append(drawerSignIn,drawerAccount);
 drawer.append(backdrop,panel);
 function setOpen(next,restoreFocus=true){
   drawer.hidden=!next;document.body.classList.toggle('mp-u-menu-open',next);
   toggle.setAttribute('aria-expanded',String(next));
   if(next)close.focus({preventScroll:true});
   else if(restoreFocus)toggle.focus({preventScroll:true});
 }
 toggle.addEventListener('click',()=>setOpen(drawer.hidden));
 close.addEventListener('click',()=>setOpen(false));
 backdrop.addEventListener('click',()=>setOpen(false));
 drawer.addEventListener('click',e=>{if(e.target.closest('a[href]'))setOpen(false,false)});
 document.addEventListener('keydown',e=>{
   if(drawer.hidden)return;
   if(e.key==='Escape'){setOpen(false);return;}
   if(e.key!=='Tab')return;
   const controls=[...panel.querySelectorAll('a[href],button:not([disabled])')];
   if(!controls.length)return;
   const first=controls[0],last=controls[controls.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 });
 const before=old[0]||document.querySelector('main')||document.body.firstElementChild;
 if(before)before.before(header);else document.body.prepend(header);
 header.after(drawer);
 document.body.classList.add('mp-has-unified-header');
 // Verify the real HttpOnly Neon Auth session on the same origin.
 // Never infer authentication from cookies, localStorage, URL params, or a Google email.
 (async () => {
   try {
     const controller=new AbortController();
     const timeout=setTimeout(()=>controller.abort(),6000);
     let response;
     try {response=await fetch('/api/account/session',{credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});}
     finally {clearTimeout(timeout);}
     if(!response.ok)return; // fail closed: keep the anonymous login link
     const data=await response.json();
     if(data?.authenticated===true && data.status==='verified_neon_session'){
       signIn.hidden=true;drawerSignIn.hidden=true;
       account.hidden=false;drawerAccount.hidden=false;
       account.title=data.user?.name?String(data.user.name).slice(0,80)+' · 마이페이지':'내 계정';
       document.body.dataset.mpSession='authenticated';
     }else{
       document.body.dataset.mpSession='anonymous';
     }
   }catch{
     document.body.dataset.mpSession='unavailable';
   }
 })();
 // Preserve the PWA manifest without altering the existing registration logic.
 if(!document.querySelector('link[rel="manifest"]')){
   const manifest=document.createElement('link');manifest.rel='manifest';manifest.href='/manifest.webmanifest';document.head.appendChild(manifest);
 }
 // Maintain legacy PWA install behavior; do not duplicate explicit asset tags.
 if(!document.querySelector('link[href="/assets/pwa/install.css"]')){
   const css=document.createElement('link');css.rel='stylesheet';css.href='/assets/pwa/install.css';document.head.appendChild(css);
 }
 if(!document.querySelector('script[src="/assets/pwa/install.js"]')){
   const script=document.createElement('script');script.src='/assets/pwa/install.js';script.defer=true;document.body.appendChild(script);
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();

/* MEDIPICK v4 design interactions. No private data, analytics, or external calls added. */
(()=>{'use strict';
const a=document.querySelectorAll('[data-v4-nav]');
a.forEach(el=>el.addEventListener('click',e=>{
 const section=el.dataset.v4Nav;
 if(location.pathname==='/' && typeof window.setNav==='function'){
   e.preventDefault();window.setNav(section);document.getElementById(section==='explore'?'directoryPage':'contentPage')?.scrollIntoView({behavior:'smooth'});
 }
}));
// Readable page metadata for keyboard navigation; no persisted personal data.
if(!document.querySelector('meta[name="color-scheme"]')){
 const meta=document.createElement('meta');meta.name='color-scheme';meta.content='light';document.head.append(meta)
}
})();
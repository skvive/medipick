/* MediPick medical editorial board — real approved medical content only. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const medicalWords=/(의료|병원|의사|약국|진료|검진|건강|질병|심장|혈압|당뇨|호흡|감염|치과|수술|복약|처방|의학|피부과|정형외과|소아|응급|신경과|비뇨|산부인과)/i;
const state={all:[],kind:'all',q:'',shown:8,loaded:false,failed:false};
const labels={blog:'의사·병원 블로그',guide:'건강 가이드',video:'의학 영상',shorts:'유튜브 쇼츠',paper:'의료 리서치'};
const kindOf=x=>['blog','guide','video','shorts','paper'].includes(x?.kind)?x.kind:'';
function secureUrl(value){
 try{const u=new URL(String(value||''));return u.protocol==='https:'&&!u.username&&!u.password?u.toString():'';}catch{return'';}
}
function videoId(uri){
 try{const u=new URL(uri);
  if(u.hostname==='youtu.be')return /^[a-zA-Z0-9_-]{11}$/.test(u.pathname.split('/')[1])?u.pathname.split('/')[1]:'';
  if(['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)){
    const id=u.pathname.startsWith('/shorts/')?u.pathname.split('/')[2]:u.searchParams.get('v');
    return /^[a-zA-Z0-9_-]{11}$/.test(id||'')?id:'';
  }
 }catch{}return'';
}
function cleanRecord(p){
 const kind=kindOf(p);
 if(!p||Number(p.approved)!==1||!kind)return null;
 const title=String(p.title||'').trim().slice(0,160),text=String(p.summary||'').trim().slice(0,250);
 if(!medicalWords.test(title+' '+text+' '+p.category)||/시연|예시|데모|fake|test provider/i.test(title+' '+text))return null;
 if(/Linkr|LEXI 스타일|Commerce|쇼핑|광고 시연/i.test(String(p.author_label||'')))return null;
 const url=secureUrl(p.url),source=String(p.author_label||'메디픽 승인 콘텐츠').slice(0,100);
 if(['blog','video','shorts'].includes(kind)&&!url)return null;
 const date=String(p.published_at||'').slice(0,10);
 return {id:String(p.id),kind,title,text,source,url,date,category:String(p.category||'건강').slice(0,50)};
}
function filtered(){
 const q=state.q.toLocaleLowerCase('ko-KR');
 return state.all.filter(p=>(state.kind==='all'||p.kind===state.kind)&&(!q||[p.title,p.text,p.source,p.category].join(' ').toLocaleLowerCase('ko-KR').includes(q)));
}
function makeCard(p){
 const article=document.createElement('article');article.className='mp-medical-card';
 const thumb=document.createElement('div');thumb.className='mp-medical-thumb';
 const id=(p.kind==='video'||p.kind==='shorts')?videoId(p.url):'';
 if(id){
  const im=document.createElement('img');im.src='https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';im.alt=p.title+' 유튜브 썸네일';im.loading='lazy';
  im.onerror=()=>{im.remove();const icon=document.createElement('span');icon.textContent='▶';thumb.appendChild(icon);};
  thumb.appendChild(im);
 }else{const icon=document.createElement('span');icon.textContent=({'blog':'▤','guide':'✚','paper':'▣'})[p.kind]||'✚';thumb.appendChild(icon);}
 const tag=document.createElement('small');tag.className='mp-medical-type';tag.textContent=labels[p.kind];thumb.appendChild(tag);
 const body=document.createElement('div');body.className='mp-medical-card-body';
 const name=document.createElement('h3');name.textContent=p.title;
 const summary=document.createElement('p');summary.textContent=p.text||'원문에서 자세한 내용과 출처를 확인하세요.';
 const meta=document.createElement('div');meta.className='mp-medical-card-meta';
 const author=document.createElement('span');author.textContent=p.source;
 const date=document.createElement('time');date.textContent=p.date;
 meta.append(author,date);
 body.append(name,summary,meta);
 if(p.url){const a=document.createElement('a');a.href=p.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='게시물 원문 읽기 ↗';body.appendChild(a);}
 article.append(thumb,body);return article;
}
function render(){
 const list=$('medicalList'),data=filtered(),shown=data.slice(0,state.shown);
 list.replaceChildren();
 $('medicalCount').textContent=data.length+'건 · 승인된 자료';
 if(!shown.length){
  const el=document.createElement('div');el.className='mp-medical-empty';
  el.textContent=state.failed?'승인 콘텐츠 서버에 연결할 수 없습니다. 의료정보와 공식 안내는 오른쪽 출처를 확인하세요.':
  '현재 조건에 맞는 승인된 의료 게시물이 없습니다. 병원·의료진의 Blogger 소유권 인증과 콘텐츠 심사 후 게시물이 노출됩니다.';
  list.appendChild(el);
 }else shown.forEach(p=>list.appendChild(makeCard(p)));
 $('medicalMore').hidden=data.length<=state.shown;
}
async function load(){
 try{const response=await fetch('/api/content',{cache:'no-store'});
  if(!response.ok)throw Error('content service unavailable');
  const data=await response.json();
  state.all=(Array.isArray(data.items)?data.items:[]).map(cleanRecord).filter(Boolean);
  state.all.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
 }catch{state.failed=true;state.all=[];}
 state.loaded=true;render();
}
$('medicalSearch').addEventListener('submit',e=>{
 e.preventDefault();state.q=$('medicalQuery').value.trim().slice(0,80);state.shown=8;render();
});
$('medicalTabs').addEventListener('click',e=>{
 const button=e.target.closest('button[data-kind]');if(!button)return;
 state.kind=button.dataset.kind;state.shown=8;
 [...$('medicalTabs').querySelectorAll('button')].forEach(b=>{
  const selected=b===button;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));
 });
 render();
});
$('medicalMore').addEventListener('click',()=>{state.shown+=8;render();});
load();
})();
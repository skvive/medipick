(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const medicalWords = /(병원|약국|진료|건강|의료|질환|약물|복약|처방|치료|검진|수술|의학|의사|내과|치과|피부과|정형외과|산부인과|소아청소년과|이비인후과|안과|정신건강|약제|실손)/i;
  const OFFICIAL = [
    { id:'official-hira', type:'official', category:'병원', title:'건강보험심사평가원 병원정보서비스', summary:'병원·약국 등 의료기관의 공식 정보 확인처입니다. 메디픽 주소록 전체가 공식 검증되었다는 의미는 아닙니다.', url:'https://www.data.go.kr/data/15001698/openapi.do', source:'공공데이터포털 · HIRA' },
    { id:'official-hospitals', type:'official', category:'병원', title:'전국 병의원 및 약국 현황', summary:'공공데이터포털의 전국 의료기관 현황 파일을 확인하세요. 제공 기준일과 실제 운영 여부를 별도로 확인해야 합니다.', url:'https://www.data.go.kr/data/15051059/fileData.do', source:'공공데이터포털' },
    { id:'official-health', type:'official', category:'건강', title:'국민건강보험공단', summary:'건강보험 제도와 건강 관련 공식 정보를 확인할 수 있는 기관 홈페이지입니다.', url:'https://www.nhis.or.kr/', source:'국민건강보험공단' },
    { id:'official-medicine', type:'official', category:'약국', title:'식품의약품안전처 의약품 안전정보', summary:'의약품 사용·안전 관련 공식 안내와 규제 정보를 확인하세요. 개별 약의 복용법은 약사와 상담하세요.', url:'https://www.mfds.go.kr/', source:'식품의약품안전처' },
    { id:'official-kdca', type:'official', category:'건강', title:'질병관리청 건강 정보', summary:'감염병 예방과 국가 보건 안내를 제공하는 기관 홈페이지입니다.', url:'https://www.kdca.go.kr/', source:'질병관리청' },
    { id:'official-silson', type:'official', category:'보험', title:'실손24 병원비·약제비 보험금 청구', summary:'보험개발원 실손24 공식 사이트에서 본인확인 후 진료·처방내역을 선택해 청구할 수 있습니다. 연계 의료기관만 전산청구를 지원합니다.', url:'https://www.silson24.or.kr/claim/web/', source:'실손24 · 공식 청구 채널' },
  ];
  const state = { page:1, pageSize:6, type:'all', query:'', category:'전체', sort:'recommended', articles:[], saved:new Set(), loadFailed:false };
  const validExternal = (value) => {
    try { const u=new URL(String(value||'')); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
  };
  const kindLabel = (item) => ({ official:'공식 정보 확인처', blog:'외부 의료 블로그', video:'의료 영상 링크', guide:'메디픽 안내 샘플' }[item.type] || '의료정보');
  const isMedicalArticle = (p) => {
    if (!p || !Number(p.approved) || /Linkr|LEXI 스타일|Commerce|쇼핑/i.test(String(p.author_label||''))) return false;
    const title=String(p.title||'');
    if (!medicalWords.test(title)) return false;
    const kind=String(p.kind||'');
    if (!['blog','guide','video','shorts','paper'].includes(kind)) return false;
    if ((kind==='blog'||kind==='video'||kind==='shorts') && !validExternal(p.url)) return false;
    return true;
  };
  const normalizedArticle = (p) => ({
    id:'content-'+String(p.id), type:p.kind==='shorts'?'video':p.kind==='paper'?'guide':p.kind,
    category:String(p.category||'건강'), title:String(p.title||'의료정보'),
    summary:/데모|시연|예시/i.test(String(p.summary||''))?'의료전문가가 작성·검증한 실제 진료지침이 아닌 시연용 안내입니다.':
      String(p.summary||'원문을 열어 출처와 의료광고 여부를 확인하세요.').slice(0,180),
    source:String(p.author_label||'메디픽 등록 콘텐츠'), url:validExternal(p.url),
    demo:/데모|시연|예시/i.test(String(p.summary||'')+' '+String(p.author_label||'')),
    published:String(p.published_at||''),
  });
  const categoryMatches = (item,category) => {
    if(category==='전체')return true;
    const z=[item.title,item.summary,item.category].join(' ');
    if(category==='병원') return /병원|의료기관|내과|외과|치과|피부과|정형외과|진료|검진/.test(z);
    if(category==='약국') return /약국|약제|의약품|복약|처방/.test(z);
    if(category==='건강') return /건강|검진|질병|질환|진료/.test(z);
    return /보험|실손|청구|약제비/.test(z);
  };
  const allCards = () => OFFICIAL.concat(state.articles);
  const filtered = () => {
    const q=state.query.trim().toLocaleLowerCase('ko-KR');
    let a=allCards().filter(x => (state.type==='all'||state.type==='saved'||x.type===state.type)
      && categoryMatches(x,state.category)
      && (!q||[x.title,x.summary,x.category,x.source].join(' ').toLocaleLowerCase('ko-KR').includes(q))
      && (state.type!=='saved'||state.saved.has(x.id)));
    if(state.sort==='title')a.sort((x,y)=>x.title.localeCompare(y.title,'ko'));
    return a;
  };
  const card = (x) => {
    const link=validExternal(x.url);
    const saved=state.saved.has(x.id);
    const isOfficial=x.type==='official';
    return '<article class="mp-c-card" data-card-id="'+escapeHTML(x.id)+'">'+
      '<div class="mp-c-card-top"><span class="mp-c-type'+(isOfficial?' mp-c-official':'')+'">'+kindLabel(x)+'</span>'+
      '<button type="button" data-save="'+escapeHTML(x.id)+'" aria-pressed="'+String(saved)+'" aria-label="이 콘텐츠를 임시 보관함에 '+(saved?'보관 해제':'보관')+'">'+(saved?'♥ 보관됨':'♡ 보관')+'</button></div>'+
      '<div class="mp-c-card-body"><p class="mp-c-source">'+escapeHTML(x.source)+'</p>'+
      '<h3>'+escapeHTML(x.title)+'</h3><p>'+escapeHTML(x.summary)+'</p></div>'+
      (x.demo?'<p class="mp-c-demo">데모 콘텐츠 · 의료자문·진료지침 아님</p>':'')+
      '<div class="mp-c-card-bottom"><span>'+escapeHTML(x.category)+'</span><div>'+
      (link?'<a href="'+escapeHTML(link)+'" target="_blank" rel="noopener noreferrer">출처 원문 ↗</a>':
        '<span class="mp-c-not-linked">원문 링크 미등록</span>')+
      (link?'<button type="button" data-copy="'+escapeHTML(x.id)+'" aria-label="원문 링크 복사">링크 복사</button>':'')+
      '</div></div></article>';
  };
  const draw = () => {
    const a=filtered(), pages=Math.max(1,Math.ceil(a.length/state.pageSize));
    state.page=Math.min(state.page,pages);
    const slice=a.slice((state.page-1)*state.pageSize,state.page*state.pageSize);
    $('#mpContentCount').textContent=a.length.toLocaleString('ko-KR')+'건 · 출처 확인 필요';
    $('#mpSavedCount').textContent=String(state.saved.size);
    $('#mpContentList').innerHTML=slice.length?slice.map(card).join(''):
      '<div class="mp-c-empty"><strong>일치하는 콘텐츠가 없습니다.</strong><p>검색어를 바꾸거나 공식 정보 탭을 확인하세요. 미검증 블로그·쇼츠를 임의로 노출하지 않습니다.</p><button type="button" id="mpEmptySearch">병원·약국 외부 검색</button></div>';
    const p=$('#mpContentPages');p.innerHTML=a.length>state.pageSize?
      '<button type="button" data-pagenum="prev" '+(state.page===1?'disabled':'')+'>‹ 이전</button>'+
      Array.from({length:pages},(_,i)=>'<button type="button" data-pagenum="'+(i+1)+'" '+(i+1===state.page?'aria-current="page"':'')+'>'+(i+1)+'</button>').join('')+
      '<button type="button" data-pagenum="next" '+(state.page===pages?'disabled':'')+'>다음 ›</button><span>'+state.page+' / '+pages+'</span>':'';
    $$('[data-save]').forEach(b=>b.addEventListener('click',()=>{
      const id=b.dataset.save;state.saved.has(id)?state.saved.delete(id):state.saved.add(id);draw();
    }));
    $$('[data-copy]').forEach(b=>b.addEventListener('click',async()=>{
      const x=allCards().find(v=>v.id===b.dataset.copy);const url=validExternal(x?.url);
      if(!url)return;
      try{await navigator.clipboard.writeText(url);b.textContent='복사됨 ✓';}
      catch{window.prompt('링크를 복사하세요',url);}
    }));
    $$('[data-pagenum]').forEach(b=>b.addEventListener('click',()=>{
      const n=b.dataset.pagenum;state.page=n==='prev'?Math.max(1,state.page-1):
        n==='next'?Math.min(pages,state.page+1):Number(n);draw();
      $('#mpContentList').scrollIntoView({behavior:'smooth',block:'start'});
    }));
    $('#mpEmptySearch')?.addEventListener('click',()=>$('#mpSearchYoutube').click());
  };
  const showType = (type) => {
    state.type=type;state.page=1;
    $$('[data-type]').forEach(b=>{const selected=b.dataset.type===type;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
    draw();
  };
  const medicalSearchTerm = () => {
    const user=state.query.trim().replace(/[\r\n]/g,' ').slice(0,75);
    const category=state.category==='전체'?'':state.category;
    return ['병원','약국','건강정보',category,user].filter(Boolean).join(' ');
  };
  function openExternal(url) {
    const tab=window.open(url,'_blank','noopener,noreferrer');
    if(!tab){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.click();}
  }
  const submit = (event) => {
    event?.preventDefault();
    state.query=($('#mpContentQ').value||'').trim().slice(0,80);
    state.category=$('#mpContentCategory').value;state.page=1;
    const params=new URLSearchParams();if(state.query)params.set('q',state.query);if(state.category!=='전체')params.set('category',state.category);
    history.replaceState(null,'',location.pathname+(params.size?'?'+params:''));
    draw();
  };
  async function load() {
    try {
      const r=await fetch('/api/content',{cache:'no-store'});
      if(!r.ok)throw Error('internal source unavailable');
      const j=await r.json();
      state.articles=(Array.isArray(j.items)?j.items:[]).filter(isMedicalArticle).map(normalizedArticle);
    } catch { state.loadFailed=true;state.articles=[]; }
    draw();
  }
  function init() {
    const params=new URLSearchParams(location.search);
    if(params.get('q')){$('#mpContentQ').value=params.get('q').slice(0,80);state.query=$('#mpContentQ').value;}
    if(['전체','병원','약국','건강','보험'].includes(params.get('category'))){
      $('#mpContentCategory').value=params.get('category');state.category=params.get('category');
    }
    $('#mpContentSearch').addEventListener('submit',submit);
    $('#mpContentCategory').addEventListener('change',submit);
    $('#mpContentSort').addEventListener('change',()=>{state.sort=$('#mpContentSort').value;state.page=1;draw();});
    $$('[data-type]').forEach(b=>b.addEventListener('click',()=>showType(b.dataset.type)));
    $$('[data-topic]').forEach(b=>b.addEventListener('click',()=>{
      $('#mpContentQ').value=b.dataset.topic;submit();
    }));
    $('[data-topic-reset]')?.addEventListener('click',()=>{
      $('#mpContentQ').value='';$('#mpContentCategory').value='전체';submit();showType('all');
    });
    $('#mpSearchYoutube').addEventListener('click',()=>{
      openExternal('https://www.youtube.com/results?'+new URLSearchParams({search_query:medicalSearchTerm()}));
    });
    $('#mpSearchBlog').addEventListener('click',()=>{
      openExternal('https://www.google.com/search?'+new URLSearchParams({q:'site:blogspot.com '+medicalSearchTerm()}));
    });
    load();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();

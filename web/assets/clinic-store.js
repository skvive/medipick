/* MediPick public clinic storefront: existing premium catalog authorization is the sole access gate. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const rawId = (params.get('id') || '').trim();
  const id = /^\d{1,9}$/.test(rawId) && Number(rawId) > 0 ? Number(rawId) : null;

  function url(raw) {
    try {
      const u = new URL(String(raw || ''));
      return (u.protocol === 'https:' && !u.username && !u.password) ? u.href : '';
    } catch { return ''; }
  }
  function label(message) { const el = $('clinicStoreStatus'); if(el) el.textContent = message; }
  function showLanding(message) {
    $('clinicStoreLanding').hidden = false;
    $('clinicStoreProfile').hidden = true;
    label(message || '병원 스마트스토어 입점 안내');
  }
  function safeNumber(x) { const n=Number(x); return Number.isFinite(n)?n:null; }
  function set(id,value) { const el=$(id); if(el) el.textContent=String(value||'정보 확인 전'); }
  async function getJson(path) {
    const res=await fetch(path,{cache:'no-store'});
    let data;
    try { data=await res.json(); } catch { throw new Error('응답 형식 확인 실패'); }
    if(!res.ok) throw new Error(data.error||'병원 정보 요청 실패');
    return data;
  }
  function renderPost(item) {
    const link = url(item?.url);
    if(!link) return null;
    const a = document.createElement('a');
    a.className = 'mp-store-post';
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const time=document.createElement('time');
    time.textContent = String(item.published||'').slice(0,10);
    const strong=document.createElement('strong');
    strong.textContent = String(item.title||'제목 없음').slice(0,120);
    const text=document.createElement('p');
    text.textContent = String(item.summary||'Blogger 원문에서 자세한 내용을 확인하세요.').slice(0,190);
    a.append(time,strong,text);
    return a;
  }
  function emptyPost(message) {
    const div=document.createElement('div');
    div.className='mp-store-no-posts';
    div.textContent=message;
    $('clinicPosts').replaceChildren(div);
  }
  async function loadPosts() {
    try {
      const data=await getJson('/api/clinic-store/'+id+'/posts');
      set('clinicBlogStatus', data.enabled?'Blogger 공개 글 · 출처 확인':'Blogger 연동 대기');
      const articles=(data.items||[]).map(renderPost).filter(Boolean);
      if(articles.length) $('clinicPosts').replaceChildren(...articles);
      else emptyPost(String(data.note||'아직 공개된 Blogger 글이 없습니다.'));
    } catch {
      set('clinicBlogStatus','Blogger 콘텐츠를 확인할 수 없습니다');
      emptyPost('외부 콘텐츠를 현재 불러오지 못했습니다. 병원 블로그 원문에서 직접 확인해 주세요.');
    }
  }
  async function init() {
    if(!id) { showLanding('승인된 입점 병원을 지도에서 선택하거나 입점 절차를 확인해 주세요.'); return; }
    label('병원 구독 및 정보 공개 상태를 확인하고 있습니다…');
    try {
      const store = await getJson('/api/public-catalog/store/'+id);
      // Never expose an expanded medical advertisement page based on an unapproved/free directory entry.
      if(store.is_premium!==true || store.ui?.variant!=='premium') {
        showLanding('이 병원은 공개 스마트스토어 입점 상태가 아닙니다. 기본 주소록 정보만 병원 지도에서 확인할 수 있습니다.');
        return;
      }
      const ui=store.ui||{};
      $('clinicStoreLanding').hidden=true;
      $('clinicStoreProfile').hidden=false;
      label('유료 구독 정보 화면입니다. 진료·의료광고의 적법성·기관 운영 여부는 별도 확인이 필요합니다.');
      const name=String(store.name||'의료기관');
      set('clinicName', name);
      set('clinicSummary', store.summary||'기관 기본정보와 공개 의료정보를 확인할 수 있습니다.');
      set('clinicRegion',[store.region,store.district].filter(Boolean).join(' '));
      set('clinicSpecialty',store.trade_category||'의료기관');
      set('clinicCategory',store.trade_category||'정보 확인 전');
      set('clinicAddress',store.address||'주소 확인 전');
      set('clinicPhone',store.phone||'연락처 미등록');
      set('clinicCoordinateStatus',store.geocode_status==='exact'?'좌표 검증 자료 있음 · 운영 여부 별도 확인':'좌표 확인 전 · Google 지도에서 주소 확인');
      document.title=name+' 스마트스토어 | MEDIPICK';
      const photo=url(ui.hero_image);
      if(photo){
        const hero=$('clinicHero');
        hero.src=photo;
        hero.hidden=false;
        hero.addEventListener('error',()=>{hero.hidden=true;}, {once:true});
        $('clinicHeroFallback').textContent='병원 소개 이미지 · 실제 시설사진 여부는 병원에 확인하세요';
      }
      if(store.address){
        const link=$('clinicMapsLink');
        link.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(name+' '+store.address);
        link.hidden=false;
      }
      const digits=String(store.phone||'').replace(/[^0-9+]/g,'');
      if(/^\+?\d{8,15}$/.test(digits)){
        const link=$('clinicCallLink');link.href='tel:'+digits;link.hidden=false;
      }
      const blog=url(ui.google_blog_url);
      if(blog){
        $('clinicBlogLink').href=blog;
        $('clinicBlogLink').textContent='Blogger 원문 보기 ↗';
        $('clinicBlogLink').hidden=false;
      }
      await loadPosts();
    } catch(e) {
      showLanding('병원 정보를 불러오지 못했습니다. 검색 목록에서 다시 선택해 주세요.');
      const help=document.createElement('a');help.href='/smart-store';help.textContent='병원 지도에서 다시 찾기 ↗';help.className='mp-store-map-retry';
      $('clinicStoreStatus').append(' ',help);
    }
  }
  init();
})();

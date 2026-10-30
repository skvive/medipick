'use strict';
(()=>{
  const root=document.getElementById('hospitalPage');
  const notice=document.getElementById('detailError');
  const query=new URLSearchParams(location.search);
  const id=Number(query.get('id'));
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const picNum={'피부과':1,'성형외과':2,'정형외과':3,'내과':4,'치과':5,'산부인과':6,'소아청소년과':7,'이비인후과':8,'안과':9,'정신건강의학과':10,'건강검진':11,'약국':12};
  const photo=c=>'/assets/photos/cat'+String(picNum[c]||4).padStart(2,'0')+'.webp';
  const safeUrl=x=>{try{const u=new URL(String(x));return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}};
  function showError(message){notice.hidden=false;notice.textContent=message;root.textContent='기관 정보를 표시할 수 없습니다. 메인에서 다른 기관을 찾아보세요.'}
  const info=(label,value)=>`<div class="v34-fact"><small>${esc(label)}</small><b>${esc(value||'정보 확인 전')}</b></div>`;
  const contentItem=x=>`<div class="v34-entry"><span class="v34-label">${esc(x.kind==='blog'?'BLOG':x.kind==='shorts'?'SHORTS':x.kind==='video'?'VIDEO':'GUIDE')} · ${x.doctor_verification==='verified'?'의료진 자격 확인':'작성자 미검증'}</span><b>${esc(x.title)}</b><p>${esc(x.summary||'원문 내용 확인이 필요합니다.')}</p>${safeUrl(x.url)?`<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">작성자 원문 보기 ↗</a>`:'<span class="v34-label">데모 원문 링크 없음</span>'}</div>`;
  function render(p){
    document.title=`${p.name} · MEDIPICK 병원 상세`;
    const doctors=p.doctors||[],content=p.content||[],reviews=p.reviews||[];
    const isDemo=String(p.external_key||'').startsWith('demo-');
    const paid=Array.isArray(p.ads)&&p.ads.length>0;
    const showPhone=/^[+\d()\s-]{6,35}$/.test(p.phone||'');
    root.innerHTML=`<div class="v34-detail-shell">
      <div class="v34-detail-primary">
      <div class="v34-cover"><img src="${photo(p.category)}" alt="${esc(p.category)} 관련 의료환경 연출 이미지"><div class="v34-cover-tags">${paid?'<span class="v34-paid">유료광고 · 스폰서</span>':''}${isDemo?'<span>가상 시연 기관</span>':''}<span>${p.verified?'출처 확인됨':'정보 미검증'}</span></div></div>
      <section class="v34-heading"><span class="v34-eyebrow">MEDIPICK CLINIC PROFILE · ${esc(p.category)}</span><h1>${esc(p.name)}</h1><p>${esc(p.description||'의료기관 상세정보를 확인해 주세요.')}</p><div class="v34-links"><button class="primary" id="bookFocus" type="button">예약 요청하기 ↗</button>${showPhone?`<a href="tel:${esc(p.phone.replace(/[^\d+]/g,''))}" id="hospitalCall">전화 문의</a>`:''}${safeUrl(p.website)?`<a href="${esc(safeUrl(p.website))}" target="_blank" rel="noopener noreferrer">공식 홈페이지 ↗</a>`:''}<a href="/">병원 다시 찾기</a></div></section>
      <div class="v34-facts">${info('진료·등록 분야',p.specialties||p.category)}${info('주소',p.address||`${p.region||''} ${p.district||''} · 상세주소 확인 전`)}${info('대표 연락처',p.phone)}${info('운영·진료시간',p.hours)}</div>
      <section class="v34-detail-card"><h2>의료진과 전문분야</h2><p>의사의 전문의 자격 및 학회 소속은 기관 광고와 별개로 검증 상태를 확인해야 합니다.</p><div class="v34-doctor-list">${doctors.length?doctors.map(d=>`<article class="v34-doctor"><span class="v34-doctor-icon">✚</span><div><b>${esc(d.name)}</b><small>${esc(d.specialty)} · ${esc(d.credentials||'자격 확인 전')}</small><small>${esc(d.society||'학회 소속 확인 전')}</small><small>${d.verification==='verified'?'운영자 검증 표시 — 증빙자료 확인 권장':'자격·학회 소속 검증 전'}</small></div></article>`).join(''):'<p>등록된 의료진 자료가 없습니다.</p>'}</div></section>
      <section class="v34-detail-card"><h2>의사가 작성한 블로그 · 영상</h2><p>실제 연결된 콘텐츠와 원문을 확인하세요. 의료광고·시연 자료는 별도로 표시합니다.</p><div class="v34-content-list">${content.length?content.slice(0,8).map(contentItem).join(''):'<p>아직 연결된 원문이 없습니다.</p>'}</div>${p.blog_links?.length?`<div class="v34-entry"><b>연결된 Google 블로그</b>${p.blog_links.filter(x=>safeUrl(x.blog_url)).map(x=>`<a href="${esc(safeUrl(x.blog_url))}" target="_blank" rel="noopener noreferrer">${esc(x.doctor_name)} · 블로그 원문 ↗</a>`).join('<br>')}</div>`:''}</section>
      <section class="v34-detail-card"><h2>방문 편의 후기</h2><p>치료 결과·시술 효과가 아닌 예약과 접근성 정보만 제공하며, 운영 검수를 거친 내용입니다.</p>${reviews.length?reviews.slice(0,5).map(x=>`<div class="v34-entry"><b>${esc(x.nickname)} · ${esc(x.aspect)}</b><p>${esc(x.body)}</p></div>`).join(''):'<p>승인된 방문 편의 정보가 없습니다.</p>'}</section>
      <div class="v34-disclosure">이 페이지의 사진은 AI 생성 연출 이미지입니다. 광고비가 의료진의 실력·치료효과에 대한 인증을 뜻하지 않습니다. 병원 정보가 가상이거나 갱신되지 않았을 수 있습니다. 응급 상황은 119에 연락하세요.</div>
      </div>
      <aside class="v34-booking-side" id="bookingPanel"><span class="v34-label">BOOKING REQUEST</span><h2>방문을 문의해 보세요</h2><p class="v34-booking-sub">예약 확정이 아니라 의료기관에 전달할 <b>접수 요청</b>입니다. 병원 확인 후 확정됩니다.</p><div class="v34-progress"><i>1</i> 원하는 날짜·시간 <span>→</span><i>2</i> 연락처 입력 <span>→</span><i>3</i> 확인 요청</div>
      <form class="v34-booking-form" id="hospitalBooking">
      <label>희망일<input name="date" id="hospitalDate" type="date" required></label><label>희망 시간<input name="time" type="time" value="10:00" min="08:00" max="20:30" step="1800" required></label>
      <label>예약자 성함<input name="name" type="text" maxlength="40" autocomplete="name" required placeholder="성함 입력"></label><label>연락처<input name="phone" type="tel" inputmode="tel" maxlength="25" required placeholder="010-0000-0000"></label>
      <label class="v34-check"><input name="consent" type="checkbox" required><span>예약 요청 접수를 위해 성함·연락처·희망일시를 처리하는 데 동의합니다. 증상과 진료내용은 입력받지 않습니다.</span></label>
      <button id="hospitalSubmit" class="v34-submit" type="submit">예약 요청 접수하기 ↗</button><div id="hospitalFeedback" class="v34-form-feedback" role="status" aria-live="polite" hidden></div>
      </form><div class="v34-disclosure">개인정보 제공 동의 전 전송하지 않습니다. 실제 병원과 계약·연동되지 않은 시연 데이터는 실제 예약으로 확정되지 않습니다.</div></aside></div><div class="v34-mobile-booking"><button type="button" id="mobileBook">희망 예약일 선택하기 ↗</button></div>`;
    const booking=root.querySelector('#bookingPanel');
    const focus=()=>{booking.scrollIntoView({behavior:'smooth',block:'start'});root.querySelector('#hospitalDate').focus({preventScroll:true})};
    root.querySelector('#bookFocus').onclick=focus;root.querySelector('#mobileBook').onclick=focus;
    root.querySelector('#hospitalCall')?.addEventListener('click',()=>{fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'phone_click',provider_id:p.id})}).catch(()=>{})});
    const date=root.querySelector('#hospitalDate');
    const inDays=n=>{const d=new Date();d.setDate(d.getDate()+n);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
    date.min=inDays(1);date.max=inDays(90);date.value=inDays(1);
    root.querySelector('#hospitalBooking').addEventListener('submit',async event=>{
      event.preventDefault();const form=event.currentTarget;const fd=new FormData(form),btn=root.querySelector('#hospitalSubmit'),feedback=root.querySelector('#hospitalFeedback');
      if(!form.reportValidity())return;
      const payload={provider_id:p.id,name:String(fd.get('name')||''),phone:String(fd.get('phone')||''),date:String(fd.get('date')||''),time:String(fd.get('time')||''),consent:fd.get('consent')==='on',client_key:sessionStorage.getItem('mp_client')||'clinic-detail'};
      btn.disabled=true;btn.textContent='접수 요청 중…';feedback.hidden=true;
      try{const resp=await fetch('/api/appointments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await resp.json();if(!resp.ok)throw Error(result.error||'접수가 처리되지 않았습니다.');feedback.hidden=false;feedback.textContent=`${result.public_id||'접수'} · ${result.message||'요청이 접수되었습니다.'} 병원에서 확인하기 전에는 예약이 확정되지 않습니다.`;form.reset();date.value=inDays(1);}
      catch(err){feedback.hidden=false;feedback.textContent=`접수 실패: ${err.message}`}
      finally{btn.disabled=false;btn.textContent='예약 요청 접수하기 ↗'}
    });
  }
  if(!Number.isInteger(id)||id<1||id>99999999){showError('주소에 올바른 병원 식별번호가 없습니다.');return}
  fetch('/api/provider/'+id).then(async r=>{const x=await r.json();if(!r.ok)throw Error(x.error||'등록된 기관을 찾지 못했습니다.');return x}).then(render).catch(e=>showError(e.message));
})();

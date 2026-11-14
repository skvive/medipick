/* MediPick reference homepage enhancements.
 * All data comes from shared smart-store.js + existing API; no sample hospitals/ratings.
 */
(() => {
'use strict';
const qs=(sel)=>document.querySelector(sel);
const all=(sel)=>Array.from(document.querySelectorAll(sel));
const status=(message)=>{const el=qs('#smartPinCount');if(el)el.textContent=message};
const filterClear=()=>{
  const field=qs('#smartTrade');if(field)field.value='';
  all('[data-smart-category]').forEach(b=>b.classList.remove('is-active'));
};
function submitSearch(){
  qs('#smartSearchForm')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
}
function setMapView(mode){
  if(typeof map==='undefined'||!map){
    status('지도가 연결되면 위성·지도 보기를 전환할 수 있습니다.');
    return;
  }
  try{
    map.setMapTypeId(mode);
    qs('#refMapRoad')?.classList.toggle('selected',mode==='roadmap');
    qs('#refMapSatellite')?.classList.toggle('selected',mode==='satellite');
  }catch(e){status('지도 종류 변경이 일시적으로 불가능합니다.')}
}
const safeNum=(n)=>Number.isFinite(Number(n))?Number(n):null;
function sortHospitals(value){
  if(typeof items==='undefined'||!Array.isArray(items))return;
  if(value==='name')items.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ko'));
  else if(value==='distance'){
    const known=items.filter(x=>x.geocode_status==='exact' && safeNum(x.distance_km)!=null);
    if(known.length===0){status('검증된 거리 정보가 없어 거리순 정렬할 수 없습니다.');return;}
    items.sort((a,b)=>{
      const d1=a.geocode_status==='exact'?safeNum(a.distance_km):null;
      const d2=b.geocode_status==='exact'?safeNum(b.distance_km):null;
      if(d1===null)return 1;
      if(d2===null)return -1;
      return d1-d2;
    });
  } else {items.sort((a,b)=>Number(a.id)-Number(b.id));}
  if(typeof renderList==='function')renderList();
}
function setupMobileDisclosure(){
  const details=qs('.mp-ref-mobile-menu');
  const summary=details?.querySelector('summary');
  if(!summary)return;
  const syncLabel=()=>summary.setAttribute('aria-label', details.open?'전체 메뉴 닫기':'전체 메뉴 열기');
  details.addEventListener('toggle',syncLabel);
  document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape'&&details.open){
      event.preventDefault();
      details.open=false;
      summary.focus();
    }
  });
  document.addEventListener('pointerdown',(event)=>{
    if(details.open&&!details.contains(event.target))details.open=false;
  });
  syncLabel();
}
document.addEventListener('DOMContentLoaded',()=>{
  setupMobileDisclosure();
  qs('#refMapRoad')?.addEventListener('click',()=>setMapView('roadmap'));
  qs('#refMapSatellite')?.addEventListener('click',()=>setMapView('satellite'));
  qs('#refSort')?.addEventListener('change',(e)=>sortHospitals(e.target.value));
  qs('#refMapAll')?.addEventListener('click',()=>{
    filterClear();qs('#refMapAll')?.classList.add('selected');submitSearch();
  });
  all('[data-smart-category]').forEach(button=>button.addEventListener('click',()=>{
    qs('#refMapAll')?.classList.remove('selected');
  }));
  qs('#refNearbyShortcut')?.addEventListener('click',()=>{
    const target=qs('#smartLocate');if(target)target.click();
  });
  const search=qs('#smartSearchForm');
  search?.addEventListener('submit',()=>{
    const input=qs('#smartQ');
    if(input&&input.value.length>80)input.value=input.value.slice(0,80);
  });
  const notice=qs('#smartNotice');
  if(notice)notice.title='메디픽 공공 주소록의 미검증 좌표와 외부 Google Places 결과는 실제 진료기관 확인을 대신할 수 없습니다.';
});
})();

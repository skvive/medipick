/* Pharmacy finder — only user-triggered Places API (New), no fake 24h status. */
(()=>{'use strict';
const $=id=>document.getElementById(id), DEFAULT={lat:37.5665,lng:126.9780};
let point={...DEFAULT},map=null,mapReady=false,markers=[],places=[],busy=false;
const setStatus=(text)=>{$('phLocation').textContent=text;};
const setCount=(text)=>{$('phCount').textContent=text;};
function safeMapsUrl(uri){
 try{const u=new URL(String(uri||''));if(u.protocol==='https:'&&(['www.google.com','google.com','maps.google.com'].includes(u.hostname)))return u.href;}catch{}return'';
}
function clearMarkers(){markers.forEach(m=>{if(typeof m.setMap==='function')m.setMap(null);else m.map=null;});markers=[];}
function addPin(pos,name){
 const markerAPI=google.maps.marker;
 if(markerAPI?.AdvancedMarkerElement&&markerAPI.PinElement){
  const glyph=new markerAPI.PinElement({background:'#0b76f7',borderColor:'#fff',glyphColor:'#fff',glyph:'✚',scale:1.1});
  const m=new markerAPI.AdvancedMarkerElement({map,position:pos,content:glyph.element,title:'Google Places 약국 · '+name});markers.push(m);return m;
 }
 const m=new google.maps.Marker({map,position:pos,title:'Google Places 약국 · '+name});markers.push(m);return m;
}
function drawCards(){
 const list=$('phResults');list.replaceChildren();
 if(!places.length){const p=document.createElement('p');p.className='mp-ph-empty';p.textContent='선택한 지역에 Google 지도 약국 검색 결과가 없습니다. 반경을 넓혀 다시 검색해 주세요.';list.appendChild(p);return;}
 for(let i=0;i<places.length;i++){
  const place=places[i],name=String(place.displayName||'약국 장소'),card=document.createElement('article');
  card.className='mp-ph-item';const title=document.createElement('strong');title.textContent=name;
  const address=document.createElement('p');address.textContent=String(place.formattedAddress||'주소를 Google 지도에서 확인하세요');
  const caution=document.createElement('p');caution.textContent='운영시간·현재 조제 가능 여부 확인 필요 · Google Places 검색 결과';
  const row=document.createElement('div');row.className='mp-ph-actions';
  const mapBtn=document.createElement('button');mapBtn.type='button';mapBtn.textContent='지도에서 보기';
  mapBtn.addEventListener('click',()=>{if(map&&place.location){map.panTo(place.location);map.setZoom(16);}});
  row.appendChild(mapBtn);
  const uri=safeMapsUrl(place.googleMapsURI);
  if(uri){const a=document.createElement('a');a.href=uri;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Google 지도 원문 ↗';row.appendChild(a);}
  card.append(title,address,caution,row);list.appendChild(card);
 }
}
async function prepareMaps(){
 const config=await fetch('/api/config',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(new Error('지도 설정 조회 실패')));
 const key=String(config.google_maps_browser_key||'');
 if(!key)throw Error('Google 지도 키가 설정되지 않았습니다');
 if(!window.google?.maps){
   await new Promise((resolve,reject)=>{
     const callback='medipickPharmacyReady';
     window[callback]=resolve;
     const script=document.createElement('script');
     script.src='https://maps.googleapis.com/maps/api/js?'+new URLSearchParams({key,language:'ko',region:'KR',libraries:'marker,places',v:'weekly',callback});
     script.async=true;script.onerror=()=>reject(new Error('지도 스크립트 불러오기 실패'));document.head.appendChild(script);
     setTimeout(()=>reject(new Error('지도 연결 시간 초과')),10000);
   });
 }
 map=new google.maps.Map($('phMap'),{center:point,zoom:14,mapId:config.google_maps_map_id||'DEMO_MAP_ID',streetViewControl:false,fullscreenControl:false,mapTypeControl:false});
 mapReady=true;
 return config;
}
async function search(){
 if(busy)return;
 busy=true;$('phSearch').disabled=true;setCount('조회 중…');
 $('phResults').textContent='Google Places 공개 장소 정보를 가져오고 있습니다.';
 try{
  if(!mapReady)await prepareMaps();
  const {Place,SearchNearbyRankPreference}=await google.maps.importLibrary('places');
  if(!Place?.searchNearby)throw Error('Google Places API (New)가 활성화되지 않았습니다');
  const radius=Math.max(1000,Math.min(20000,Number($('phRadius').value||2)*1000));
  const {places:returned}=await Place.searchNearby({
   fields:['displayName','formattedAddress','location','googleMapsURI'],
   locationRestriction:{center:point,radius},
   includedTypes:['pharmacy'],
   rankPreference:SearchNearbyRankPreference?.DISTANCE||'DISTANCE',
   maxResultCount:20
  });
  places=(returned||[]).filter(x=>x.location&&x.displayName);
  clearMarkers();const bounds=new google.maps.LatLngBounds();
  places.forEach(p=>{addPin(p.location,String(p.displayName||'약국'));bounds.extend(p.location)});
  if(places.length){bounds.extend(point);map.fitBounds(bounds,45);}
  setCount(places.length+'곳 · Google Places');
  drawCards();
 }catch(e){
  places=[];clearMarkers();setCount('연동 확인 필요');
  const p=document.createElement('p');p.className='mp-ph-empty';
  p.textContent='Google 지도 약국 검색을 현재 표시하지 못했습니다: '+String(e?.message||'서비스 연결 실패')+'. Google Cloud의 Maps JavaScript/Places API (New) 권한·과금 설정을 확인하세요.';
  $('phResults').replaceChildren(p);
 }finally{busy=false;$('phSearch').disabled=false;}
}
$('phSearch').addEventListener('click',search);
$('phGeo').addEventListener('click',()=>{
 if(!navigator.geolocation){setStatus('현재 위치 기능을 지원하지 않습니다. 서울시청 기본 위치를 사용합니다.');return;}
 setStatus('현위치 사용 권한을 요청하고 있습니다…');
 navigator.geolocation.getCurrentPosition(({coords})=>{
  point={lat:coords.latitude,lng:coords.longitude};
  setStatus('내 현위치 중심 '+$('phRadius').value+'km 약국 검색 · 위치 정확도 약 '+Math.round(coords.accuracy||0)+'m');
  if(map)map.panTo(point);
  search(); // This follows the user's explicit location-search action.
 },()=>setStatus('위치를 사용할 수 없습니다. 서울시청 기본 위치에서 검색할 수 있습니다.'),{enableHighAccuracy:true,timeout:10000,maximumAge:60000});
});
})();
const $=s=>document.querySelector(s);const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(u,d){let opt=d?{method:'POST',headers:{'Content-Type':'application/json','X-Medipick-Admin':'1'},body:JSON.stringify(d)}:{};const r=await fetch(u,opt);let b=await r.json();if(!r.ok)throw Error(b.error||'요청 실패');return b}
function feedback(s){let el=$('#premiumFeedback');el.textContent=s;el.classList.remove('hidden')}
async function load(){try{let [b,s,l]=await Promise.all(['/api/admin/blog-links','/api/admin/subscriptions','/api/admin/locations'].map(u=>api(u)));
$('#blogItems').innerHTML=b.items.map(x=>`<div class="premium-item"><b>${safe(x.doctor_name)} / ${safe(x.blog_url)}</b><small>연결 #${x.id} · 소유권: ${safe(x.verification)} · 게시승인 ${x.editorial_approved?'예':'아니오'}</small><div class="premium-actions"><button data-action="approve" data-id="${x.id}">연동 승인</button><button data-action="deny" data-id="${x.id}">승인 취소</button><button data-action="import" data-id="${x.id}">게시글 수집</button></div></div>`).join('')||'연동 신청 없음';
$('#subItems').innerHTML=s.items.map(x=>`<div class="premium-item"><b>${safe(x.provider_name)}</b> · ${safe(x.status)} / 결제 ${x.paid?'✓':'×'} / 심사 ${x.compliance_approved?'✓':'×'}<small>${safe(x.expires_at)}</small></div>`).join('')||'구독 기관 없음';
$('#locItems').innerHTML=l.items.map(x=>`<div class="premium-item"><b>${safe(x.provider_name)}</b><small>${x.latitude}, ${x.longitude} · ${safe(x.coordinate_source)}</small></div>`).join('')||'지도 좌표 없음';
$('#blogItems').querySelectorAll('button').forEach(bt=>bt.onclick=async()=>{try{let a=bt.dataset.action,id=+bt.dataset.id,d=a==='import'?await api('/api/admin/blog-links/import',{link_id:id}):await api('/api/admin/blog-links/approve',{link_id:id,approved:a==='approve'});feedback(d.created_pending!==undefined?`${d.created_pending}개 게시물이 검수 대기 목록에 등록되었습니다.`:'검수 상태를 변경했습니다');load()}catch(e){feedback(e.message)}})
}catch(e){feedback('관리자 로그인이 필요하거나 조회 실패: '+e.message)}}
for(let id of ['subForm','locForm'])$('#'+id).onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target);let d=Object.fromEntries(f.entries());if(id==='subForm'){d.provider_id=+d.provider_id;d.paid=f.has('paid');d.compliance_approved=f.has('compliance_approved')}else{d.provider_id=+d.provider_id;d.lat=+d.lat;d.lng=+d.lng;d.place_reviewed=false}try{let r=await api(id==='subForm'?'/api/admin/subscriptions':'/api/admin/locations',d);feedback('저장 완료'+(r.eligible!==undefined?` · 광고노출 적격 ${r.eligible?'예':'아니오'}`:''));load()}catch(e){feedback(e.message)}};
$('#placeCheckForm').onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target);try{let r=await api('/api/admin/google-place/verify',{provider_id:+f.get('provider_id'),google_place_id:f.get('google_place_id')});feedback('Places 대조 성공: '+r.google_name+' / 거리 '+r.distance_km+'km');load()}catch(e){feedback('장소 대조 실패: '+e.message)}};
load();

const storeForm=$('#catalogStoreForm');
if(storeForm) storeForm.addEventListener('submit',async(event)=>{
 event.preventDefault();
 const target=$('#catalogStoreResult');
 const data=new FormData(storeForm);
 const id=Number(data.get('catalog_id'));
 if(!Number.isSafeInteger(id)||id<1){target.textContent='올바른 공공 주소록 병원 ID가 필요합니다.';return;}
 if(!$('#storeAdminCompliance')?.checked){target.textContent='구독·광고 준수·Blogger 소유권을 확인한 경우에만 활성화할 수 있습니다.';return;}
 const blog=String(data.get('google_blog_url')||'').trim();
 if(blog){try{const u=new URL(blog);if(u.protocol!=='https:'||!u.hostname.endsWith('.blogspot.com'))throw Error('주소 오류');}catch{target.textContent='자동 글 가져오기는 HTTPS blogspot.com 주소만 허용합니다. URL을 확인해 주세요.';return;}}
 const enabled=data.has('marketing_active');
 const body={listing_tier:enabled?'premium':'free',marketing_active:enabled,
   marketing_expires_at:String(data.get('marketing_expires_at')||''),
   trade_category:String(data.get('trade_category')||'').trim(),
   google_blog_url:blog,hero_image_url:String(data.get('hero_image_url')||'').trim(),video_url:String(data.get('video_url')||'').trim(),
   compliance_ack:true};
 const button=storeForm.querySelector('button[type=submit]');
 button.disabled=true;target.textContent='설정 저장 및 승인 상태 확인 중…';
 try{
   const result=await api('/api/admin/public-catalog/'+encodeURIComponent(id)+'/marketing',body);
   target.replaceChildren();
   const text=document.createElement('span');text.textContent=result.is_premium?'활성 스마트스토어 저장 완료. Google Blogger 공개글은 원문에서 가져옵니다.':'비활성 상태로 저장했습니다. 무료 주소록만 유지됩니다.';
   target.append(text);
   if(result.is_premium){
     const link=document.createElement('a');link.href='/clinic-store?id='+encodeURIComponent(id);
     link.textContent=' 스마트스토어 미리보기 ↗';link.target='_blank';link.rel='noopener noreferrer';link.style.marginLeft='12px';target.append(link);
   }
 }catch(e){target.textContent='저장 실패: '+e.message;}
 finally{button.disabled=false;}
});

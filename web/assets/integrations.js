(()=>{'use strict';const $=s=>document.querySelector(s);const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const box=$('#integrationFeedback');let ready=false,activeOrder=null,widget=null;
function say(text,type='info'){box.textContent=text;box.dataset.type=type}
async function request(url,body){const r=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Medipick-Admin':'1'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||'요청을 처리하지 못했습니다');return d}
async function load(){const session=await fetch('/api/admin/me',{credentials:'same-origin'}).then(r=>r.json());if(!session.authenticated){say('관리자 로그인이 필요합니다. 운영자 콘솔에서 로그인한 뒤 다시 접속하세요.','warn');return}ready=true;
const [d,p,s]=await Promise.all(['/api/admin/doctors','/api/admin/providers','/api/integrations/status'].map(u=>fetch(u,{credentials:'same-origin'}).then(r=>r.json())));
$('#googleDoctor').innerHTML='<option value="">의료진 선택</option>'+(d.items||[]).map(x=>`<option value="${Number(x.id)}">${E(x.name)} · ${E(x.specialty)}</option>`).join('');
$('#payProvider').innerHTML='<option value="">의료기관 선택</option>'+(p.items||[]).map(x=>`<option value="${Number(x.id)}">${E(x.name)}</option>`).join('');
$('#googleConnections').innerHTML=s.google_accounts.length?s.google_accounts.map(a=>`<article class="connected-acc"><b>의료진 #${a.doctor_id} · ${E(a.email)}</b>${(a.blogs||[]).length?(a.blogs||[]).map(b=>`<div class="blog-sync"><a href="${E(b.url)}" target="_blank" rel="noopener noreferrer">${E(b.name||b.id)}</a><button data-doctor="${a.doctor_id}" data-blog="${E(b.id)}" type="button">게시물 가져오기 · 검수대기</button></div>`).join(''):'<p>접근 가능한 공개 블로그가 없습니다.</p>'}</article>`).join(''):'연결된 Google 계정이 없습니다.';
$('#paymentOrders').innerHTML=s.orders.length?s.orders.slice(0,12).map(o=>`<div class="order-item">${E(o.order_id)} · ${E(o.plan)} · ${Number(o.amount_krw).toLocaleString('ko-KR')}원 <b>${o.status==='paid'?'승인완료':'결제 대기'}</b></div>`).join(''):'주문 내역이 없습니다.';
say(`Google 연결: ${s.google_configured?'설정됨':'키 미설정'} · 토스 결제: ${s.toss_configured?'승인 API 사용 가능':'미설정 / 안전하게 차단'} · 시연 데이터는 실제 운영기관이 아닙니다.`,s.google_configured||s.toss_configured?'info':'warn');
$('#googleConnections').querySelectorAll('button[data-doctor]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const result=await request('/api/admin/google/sync',{doctor_id:+b.dataset.doctor,blog_id:b.dataset.blog});say(`검수 대기열에 ${result.created_pending}개 콘텐츠를 추가했습니다.`,'success');await load()}catch(err){say(err.message,'warn')}finally{b.disabled=false}});
const u=new URL(location.href);if(u.searchParams.get('google'))say(u.searchParams.get('google')==='connected'?'Google 인증 확인 완료. 블로그 동기화 전에 의사 신원과 저작권을 다시 확인하세요.':'Google 인증 실패. 관리자 연결 설정과 Google Cloud 리디렉션 URI를 확인하세요.',u.searchParams.get('google')==='connected'?'success':'warn');
if(u.searchParams.has('paymentKey')){const orderId=u.searchParams.get('orderId'),amount=Number(u.searchParams.get('amount'));const paymentKey=u.searchParams.get('paymentKey');
if(confirm('사업자 광고 구독료의 결제 승인을 진행하시겠습니까?')){try{const r=await request('/api/admin/checkout/confirm',{orderId,amount,paymentKey});say(r.notice,'success');history.replaceState(null,'','/integrations');await load()}catch(e){say('승인 확인 실패: '+e.message,'warn')}}}
}
$('#googleConnect').onclick=()=>{if(!ready)return say('관리자 로그인이 필요합니다','warn');const id=$('#googleDoctor').value;if(!id)return say('의료진을 먼저 선택하세요','warn');location.assign('/api/google/connect/start?doctor_id='+encodeURIComponent(id))};
$('#prepareOrder').onclick=async()=>{if(!ready)return say('관리자 로그인이 필요합니다','warn');const pid=Number($('#payProvider').value);if(!pid)return say('의료기관을 선택하세요','warn');
try{const order=await request('/api/admin/checkout/order',{provider_id:pid,plan:$('#payPlan').value});activeOrder=order;$('#orderResult').textContent=`주문번호: ${order.orderId} · 결제금액 ${order.amount.toLocaleString('ko-KR')}원 · ${order.enabled?'결제위젯 준비 중':'연동키 미설정: 실제 결제를 사용할 수 없습니다'}`;
if(!order.enabled){$('#payNow').hidden=true;return}
if(!window.TossPayments){const s=document.createElement('script');s.src='https://js.tosspayments.com/v2/standard';await new Promise((resolve,reject)=>{s.onload=resolve;s.onerror=reject;document.head.append(s)})}
widget=window.TossPayments(order.clientKey).widgets({customerKey:'MP_'+crypto.randomUUID()});await widget.setAmount({currency:'KRW',value:order.amount});await widget.renderPaymentMethods({selector:'#tossPaymentMethods',variantKey:'DEFAULT'});await widget.renderAgreement({selector:'#tossAgreement',variantKey:'AGREEMENT'});$('#payNow').hidden=false;
}catch(e){say(e.message,'warn')}};
$('#payNow').onclick=async()=>{if(!widget||!activeOrder||!activeOrder.enabled)return;try{await widget.requestPayment({orderId:activeOrder.orderId,orderName:'MEDIPICK 광고 구독 '+activeOrder.plan,successUrl:location.origin+'/integrations',failUrl:location.origin+'/integrations?pay=failed'})}catch(e){say('결제창을 열지 못했습니다: '+e.message,'warn')}};
load().catch(e=>say('연동 정보 조회 실패: '+e.message,'warn'));
})();

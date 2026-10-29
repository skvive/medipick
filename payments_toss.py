"""Toss Payments one-time B2B platform-subscription checkout. NOT patient treatment payments."""
import os,json,secrets,base64,urllib.request,urllib.error
from datetime import datetime,timezone,timedelta
PRICE={'basic':190000,'premium':490000,'signature':990000}
def utc():return datetime.now(timezone.utc).isoformat()
def enabled():return bool(os.getenv('TOSS_CLIENT_KEY') and os.getenv('TOSS_SECRET_KEY') and os.getenv('MEDIPICK_ENABLE_REAL_PAYMENTS')=='1')
def install(c):
 c.executescript('''CREATE TABLE IF NOT EXISTS checkout_orders(
   order_id TEXT PRIMARY KEY,provider_id INTEGER NOT NULL REFERENCES providers(id),plan TEXT NOT NULL,
   amount_krw INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',
   payment_key TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 ''')
def create(c,pid,plan):
 if plan not in PRICE:raise ValueError('등록되지 않은 광고 구독 상품입니다')
 if not c.execute('SELECT 1 FROM providers WHERE id=?',(int(pid),)).fetchone():raise ValueError('기관 ID 오류')
 oid='MPB2B_'+secrets.token_hex(12)
 c.execute('INSERT INTO checkout_orders VALUES(?,?,?,?,?,?,?,?)',(oid,int(pid),plan,PRICE[plan],'pending','',utc(),utc()))
 return {'orderId':oid,'amount':PRICE[plan],'plan':plan,'currency':'KRW','enabled':enabled(),
  'clientKey':os.getenv('TOSS_CLIENT_KEY','') if enabled() else '',
  'notice':'메디픽 플랫폼 광고 구독료만 결제합니다. 진료비·환자 소개료 결제가 아닙니다.'}
def confirm_gateway(order_id,payment_key,amount):
 key=os.environ['TOSS_SECRET_KEY']
 auth=base64.b64encode((key+':').encode()).decode()
 raw=json.dumps({'paymentKey':payment_key,'orderId':order_id,'amount':amount}).encode()
 req=urllib.request.Request('https://api.tosspayments.com/v1/payments/confirm',data=raw,
  headers={'Authorization':'Basic '+auth,'Content-Type':'application/json','Idempotency-Key':order_id},method='POST')
 with urllib.request.urlopen(req,timeout=15) as r:return json.loads(r.read(200000))
def confirm(c,order_id,payment_key,amount,gateway=None):
 if not enabled():raise ValueError('실결제 기능이 비활성화되어 있습니다. 사업자 토스페이먼츠 계약과 키 설정이 필요합니다')
 row=c.execute('SELECT * FROM checkout_orders WHERE order_id=?',(str(order_id),)).fetchone()
 if not row:raise ValueError('등록되지 않은 주문입니다')
 if row['status']!='pending':raise ValueError('이미 처리된 주문입니다')
 if type(amount) is not int or amount!=row['amount_krw']:raise ValueError('결제 요청 금액과 서버 주문 금액이 다릅니다')
 if not 8<=len(str(payment_key))<=200:raise ValueError('결제 키 형식 오류')
 result=(gateway or confirm_gateway)(str(order_id),str(payment_key),amount)
 if (result.get('orderId')!=str(order_id) or result.get('totalAmount')!=amount
     or result.get('status')!='DONE' or result.get('paymentKey')!=str(payment_key)):
     raise ValueError('결제사 승인 응답의 주문·금액·상태가 일치하지 않습니다')
 c.execute('UPDATE checkout_orders SET status=?,payment_key=?,updated_at=? WHERE order_id=? AND status=?',('paid',str(payment_key),utc(),str(order_id),'pending'))
 # Payment success alone does not claim medical advertising compliance; manual separate approval required.
 c.execute('INSERT INTO subscriptions(provider_id,status,paid,compliance_approved,expires_at,started_at,plan,updated_at) VALUES(?,?,?,?,?,?,?,?) '
           "ON CONFLICT(provider_id) DO UPDATE SET paid=1,status='paused',compliance_approved=0,expires_at=excluded.expires_at,plan=excluded.plan,updated_at=excluded.updated_at",
  (row['provider_id'],'paused',1,0,(datetime.now(timezone.utc)+timedelta(days=30)).isoformat(),utc(),row['plan'],utc()))
 return {'ok':True,'orderId':str(order_id),'paid':True,'requires_ad_approval':True,'notice':'결제 확인 완료. 광고 준법심사 및 구독 활성화는 별도 단계입니다.'}

"""Consent-focused engagement sandbox; no monetary medical incentives.
Marketing dispatch always dry-run; no third party provider credentials embedded.
"""
from datetime import datetime,timezone,timedelta
import re,secrets,hashlib,hmac,json
KST=timezone(timedelta(hours=9))

def install(c):
    c.executescript('''
    CREATE TABLE IF NOT EXISTS outreach_contacts(id INTEGER PRIMARY KEY AUTOINCREMENT,
     contact_hash TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('email','sms','kakao')),
     consent_campaign INTEGER NOT NULL DEFAULT 0, contact_verified INTEGER NOT NULL DEFAULT 0, consent_at TEXT, withdrawn_at TEXT,
     purpose TEXT DEFAULT '메디픽 일반 정보 뉴스레터', UNIQUE(channel,contact_hash));
    CREATE TABLE IF NOT EXISTS outreach_campaigns(id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL, channel TEXT NOT NULL, body TEXT NOT NULL,
     category TEXT DEFAULT '일반 건강상식', reviewed INTEGER DEFAULT 0,
     dispatch_state TEXT DEFAULT 'draft', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attendance_demo(id INTEGER PRIMARY KEY AUTOINCREMENT,
     provider_id INTEGER NOT NULL REFERENCES providers(id), visit_alias TEXT NOT NULL,
     checked_at TEXT NOT NULL, UNIQUE(provider_id,visit_alias,checked_at));
    CREATE TABLE IF NOT EXISTS benefit_rules(id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL, benefit_type TEXT NOT NULL, discount_won INTEGER DEFAULT 0,
     medical_service INTEGER DEFAULT 1, state TEXT NOT NULL DEFAULT 'blocked_legal_review', created_at TEXT NOT NULL);
    ''')

def today():return datetime.now(KST).isoformat(timespec='seconds')
def validate_contact(channel,value):
    val=str(value).strip()[:120]
    if channel not in ('email','sms','kakao'):raise ValueError('채널 오류')
    if channel=='email' and not re.fullmatch(r'[^@\s]+@[^@\s]+\.[A-Za-z]{2,}',val):raise ValueError('이메일 주소 오류')
    if channel in ('sms','kakao') and not re.fullmatch(r'01[0-9]-?\d{3,4}-?\d{4}',val):raise ValueError('국내 휴대전화 번호 형식 오류')
    return val

def consent(c,data,secret):
    channel=data.get('channel');contact=validate_contact(channel,data.get('contact',''))
    enabled=data.get('consent_campaign') is True
    when=today()
    contact_hash=hmac.new(secret,(channel+':'+contact).encode(),'sha256').hexdigest()
    c.execute('INSERT INTO outreach_contacts(contact_hash,channel,consent_campaign,consent_at,withdrawn_at) VALUES(?,?,?,?,?) ON CONFLICT(channel,contact_hash) DO UPDATE SET consent_campaign=excluded.consent_campaign,consent_at=excluded.consent_at,withdrawn_at=excluded.withdrawn_at',
        (contact_hash,channel,int(enabled),when if enabled else None,None if enabled else when))
    return {'ok':True,'consent_requested':enabled,'contact_verified':False,'eligible_for_send':False,'note':'시연 모드: 전화/메일 소유권 미검증으로 실제 수신동의 효력이 발생하지 않습니다. 실제 발송 전 인증과 별도 동의 획득이 필요합니다.'}

def campaign(c,data):
    name=str(data.get('name','')).strip()[:120];body=str(data.get('body','')).strip()[:500]
    channel=data.get('channel')
    if channel not in ('email','sms','kakao') or not name or len(body)<10:raise ValueError('캠페인명, 채널, 10자 이상의 문구가 필요합니다')
    forbidden=['진료비 할인','급여 진료 할인','본인부담금 할인','시술비 할인','치료비 할인','수술비 할인','쿠폰 구매','방문시 포인트','진료받으면 리워드']
    if any(x in body.replace(' ','') or x in body for x in forbidden):raise ValueError('의료 유인·진료비 할인 소지가 있는 캠페인은 차단됩니다')
    cur=c.execute('INSERT INTO outreach_campaigns(name,channel,body,created_at) VALUES(?,?,?,?)',(name,channel,body,today()))
    return {'id':cur.lastrowid,'dispatch_state':'draft','note':'실발송이 아닌 내부 초안입니다. 법률·광고 검토 및 별도 사업자 발송 연동 필요'}

def preview(c,cid):
    r=c.execute('SELECT * FROM outreach_campaigns WHERE id=?',(cid,)).fetchone()
    if not r:raise ValueError('캠페인이 없습니다')
    count=c.execute('SELECT COUNT(*) FROM outreach_contacts WHERE channel=? AND consent_campaign=1 AND contact_verified=1 AND withdrawn_at IS NULL',(r['channel'],)).fetchone()[0]
    hour=datetime.now(KST).hour
    time_ok=not (r['channel']!='email' and (hour>=21 or hour<8))
    return {'campaign':dict(r),'consented_recipients':count,'time_allowed_without_night_consent':time_ok,
      'can_send':False,'reason':'실발송 연동은 비활성화되어 있습니다. 외부 승인/광고심사/수신거부/발신번호 검증 후 사용하세요.',
      'note':'개인 질환, 투약 정보로 홍보 대상을 분류하지 않습니다.'}

def checkin(c,pid,data):
    # No check-in cashback or medical treatment reward, just explicit demo record.
    alias=str(data.get('alias','')).strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]{4,32}',alias):raise ValueError('4~32자 익명 별칭이 필요합니다')
    if data.get('consent') is not True:raise ValueError('방문기록 생성 동의가 필요합니다')
    if not c.execute('SELECT 1 FROM providers WHERE id=?',(pid,)).fetchone():raise ValueError('기관이 없습니다')
    key=hashlib.sha256((alias+'medipick-demo').encode()).hexdigest()[:20]
    cur=c.execute('INSERT INTO attendance_demo(provider_id,visit_alias,checked_at) VALUES(?,?,?)',(pid,key,today()))
    return {'ok':True,'id':cur.lastrowid,'reward_points':0,'note':'자가 신고된 시연 체크인입니다. 실제 병원 방문·진료내역을 인증하거나 보상하지 않습니다.'}

def benefit(c,data):
    name=str(data.get('name','')).strip()[:100]
    if not name:raise ValueError('혜택명이 없습니다')
    typ=str(data.get('benefit_type',''))[:50]
    if typ not in ('information_coupon','prepaid_wallet_simulator','attendance_reward'):raise ValueError('혜택 종류 오류')
    cur=c.execute('INSERT INTO benefit_rules(name,benefit_type,medical_service,discount_won,state,created_at) VALUES(?,?,?,?,?,?)',
       (name,typ,1,0,'blocked_legal_review',today()))
    return {'id':cur.lastrowid,'state':'blocked_legal_review',
     'message':'의료행위 쿠폰 구매, 선불충전금 수취, 방문 대가 리워드는 법률·결제업 인허가 검토 전 거래·발급 불가'}

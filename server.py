#!/usr/bin/env python3
"""MEDIPICK: dependency-free, runnable medical discovery MVP (Python 3.10+).
Real-world medical claims require source verification; demo records are fictional.
"""
import os, re, json, csv, io, sys, time, uuid, hmac, html, base64, hashlib, secrets, sqlite3, mimetypes, argparse, logging
from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlsplit, parse_qs, unquote
from pathlib import Path
from threading import Lock
import premium
import google_places
import billing
import medical_assist
import engagement
import oauth_google
import payments_toss
import privacy
import clinic_ops

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get('MEDIPICK_DB', str(ROOT / 'data' / 'medipick.sqlite3')))
SECRET_FILE = ROOT / 'data' / '.secret'
TZ = timezone(timedelta(hours=9))
WRITE_LOCK = Lock()
CHAT_THROTTLE = {}  # memory-only request timestamps; no persistent IP logs
LOG = logging.getLogger('medipick')
CATEGORIES = ['전체','피부과','성형외과','내과','정형외과','치과','산부인과','소아청소년과','이비인후과','안과','정신건강의학과','건강검진','약국']
SYNONYMS = {'야간':'심야','밤':'심야','새벽':'심야','24시':'심야','24시간':'심야','약':'약국','아이':'소아청소년과','어린이':'소아청소년과','아기':'소아청소년과','허리':'정형외과','무릎':'정형외과','피부':'피부과','여드름':'피부과','미용':'피부과','눈':'안과','귀':'이비인후과','코':'이비인후과','치아':'치과','치통':'치과','임신':'산부인과','검진':'건강검진','스트레스':'정신건강의학과','마음':'정신건강의학과'}

def now(): return datetime.now(TZ).isoformat(timespec='seconds')
def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH), timeout=12, check_same_thread=False, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA foreign_keys=ON'); con.execute('PRAGMA busy_timeout=12000')
    return con

def get_secret():
    if os.environ.get('MEDIPICK_SECRET'): return os.environ['MEDIPICK_SECRET'].encode()
    SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not SECRET_FILE.exists():
        SECRET_FILE.write_text(secrets.token_hex(48), encoding='utf-8')
        try: SECRET_FILE.chmod(0o600)
        except OSError: pass
    return SECRET_FILE.read_text(encoding='utf-8').encode()

SECRET = get_secret()

def init_db():
    with db() as c:
        c.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS providers(id INTEGER PRIMARY KEY AUTOINCREMENT, external_key TEXT UNIQUE, name TEXT NOT NULL,
        category TEXT NOT NULL, kind TEXT NOT NULL DEFAULT '병원', region TEXT NOT NULL DEFAULT '서울', district TEXT DEFAULT '',
        address TEXT DEFAULT '', phone TEXT DEFAULT '', website TEXT DEFAULT '', hours TEXT DEFAULT '', night INTEGER DEFAULT 0,
        description TEXT DEFAULT '', specialties TEXT DEFAULT '', source TEXT DEFAULT '운영자 등록', verified INTEGER DEFAULT 0,
        image_style TEXT DEFAULT 'mint', status TEXT DEFAULT 'active', updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS doctors(id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL REFERENCES providers(id),
        name TEXT NOT NULL, specialty TEXT DEFAULT '', credentials TEXT DEFAULT '', society TEXT DEFAULT '', intro TEXT DEFAULT '',
        verification TEXT DEFAULT 'unverified', profile_url TEXT DEFAULT '', updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS content(id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL REFERENCES providers(id),
        doctor_id INTEGER REFERENCES doctors(id), title TEXT NOT NULL, summary TEXT DEFAULT '', kind TEXT NOT NULL DEFAULT 'blog',
        category TEXT DEFAULT '', url TEXT DEFAULT '', evidence_url TEXT DEFAULT '', author_label TEXT DEFAULT '',
        approved INTEGER DEFAULT 0, published_at TEXT NOT NULL, editorial_priority INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS ads(id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL REFERENCES providers(id),
        category TEXT NOT NULL, headline TEXT NOT NULL, priority INTEGER DEFAULT 0, active INTEGER DEFAULT 0,
        approved INTEGER DEFAULT 0, start_at TEXT DEFAULT '', end_at TEXT DEFAULT '', created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS appointments(id INTEGER PRIMARY KEY AUTOINCREMENT, public_id TEXT NOT NULL UNIQUE, provider_id INTEGER NOT NULL REFERENCES providers(id),
        visitor_name TEXT NOT NULL, phone TEXT NOT NULL, visit_date TEXT NOT NULL, visit_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'requested', consent_at TEXT NOT NULL, created_at TEXT NOT NULL, notes TEXT DEFAULT '');
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, provider_id INTEGER,
        content_id INTEGER, category TEXT DEFAULT '', query TEXT DEFAULT '', client_key TEXT DEFAULT '', created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL REFERENCES providers(id),
        nickname TEXT NOT NULL, aspect TEXT NOT NULL, body TEXT NOT NULL, status TEXT DEFAULT 'pending', created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS advertiser_keys(id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL REFERENCES providers(id),
        label TEXT NOT NULL DEFAULT '광고주 리포트', token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, revoked INTEGER DEFAULT 0, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT, appointment_id INTEGER NOT NULL REFERENCES appointments(id),
        channel TEXT NOT NULL, state TEXT DEFAULT 'pending_configuration', attempts INTEGER DEFAULT 0, last_error TEXT DEFAULT '', created_at TEXT NOT NULL);
        ''')
        if c.execute('SELECT COUNT(*) FROM providers').fetchone()[0] == 0:
            seed(c)
        premium.install(c)
        billing.install(c)
        engagement.install(c)
        oauth_google.install(c)
        payments_toss.install(c)
        clinic_ops.install(c)

def seed(c):
    # Deliberately fictional entries: NEVER pass demos as real verified hospitals or specialists.
    entries = [
        ('메디픽 데모 피부클리닉','피부과','의원','서울','강남구','피부 고민별 진료정보와 전문자료를 한곳에서 확인하는 예시 병원입니다.','피부과,여드름,레이저','mint',0),
        ('메디픽 데모 바른정형외과','정형외과','의원','서울','송파구','무릎·허리 등 근골격계 관련 진료 및 의학 콘텐츠 소개 예시입니다.','정형외과,척추,관절','blue',0),
        ('메디픽 데모 온가족내과','내과','의원','서울','마포구','만성질환 관리와 건강검진 관련 콘텐츠를 모아보는 예시입니다.','내과,건강검진,고혈압','peach',0),
        ('메디픽 데모 미소치과','치과','치과의원','서울','서초구','치과 진료과목과 의료정보를 비교할 수 있는 예시입니다.','치과,예방치료','lavender',0),
        ('메디픽 데모 여성의원','산부인과','의원','경기','성남시','여성건강 정보를 찾아볼 수 있는 예시 의원입니다.','산부인과,검진','pink',0),
        ('메디픽 데모 아이소아과','소아청소년과','의원','서울','영등포구','소아청소년과에서 제공하는 교육 콘텐츠를 볼 수 있는 예시입니다.','소아청소년과,예방접종','yellow',0),
        ('메디픽 데모 공공심야약국','약국','약국','서울','종로구','공공심야약국 UI를 시험하기 위한 가상 약국입니다. 실제 운영 여부와 관계없습니다.','약국,심야,야간','indigo',1),
        ('메디픽 데모 마음의원','정신건강의학과','의원','부산','해운대구','정신건강 관련 일반 지식을 살펴보는 예시입니다.','정신건강의학과,상담','green',0),
        ('메디픽 데모 라인성형외과','성형외과','의원','서울','강남구','수술 전 일반적으로 확인할 정보와 의학 콘텐츠를 소개하는 예시입니다.','성형외과,수술안전','rose',0),
    ]
    for ix,(name,category,kind,region,district,descr,spec,style,night) in enumerate(entries):
        cur = c.execute('INSERT INTO providers(external_key,name,category,kind,region,district,description,specialties,image_style,night,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
            ('demo-'+str(ix+1), name,category,kind,region,district,descr,spec,style,night,now()))
        pid=cur.lastrowid
        if category != '약국':
            d = c.execute('INSERT INTO doctors(provider_id,name,specialty,credentials,society,intro,verification,updated_at) VALUES(?,?,?,?,?,?,?,?)',
              (pid,'샘플 의료진 '+str(ix+1),category,'전문의 자격 확인 전 (데모)','학회 소속 확인 전 (데모)',
               '운영자가 자격·소속·면허 정보를 검증한 후 공개되는 의료진 소개 공간입니다.','unverified',now()))
            docid=d.lastrowid
            c.execute('INSERT INTO content(provider_id,doctor_id,title,summary,kind,category,url,evidence_url,author_label,approved,published_at,editorial_priority) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                (pid,docid,category+' 진료 전에 확인할 기본 정보','이 자료는 의사가 작성한 실제 게시물이 아닌 데모 예시입니다. 담당 의료진의 원문과 검증 자료를 연결해 제공하는 구조입니다.',
                 'guide',category,'','','메디픽 데모 편집본',1,now(),1))
            c.execute('INSERT INTO content(provider_id,doctor_id,title,summary,kind,category,url,evidence_url,author_label,approved,published_at,editorial_priority) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                (pid,docid,'의사 블로그·쇼츠 콘텐츠 연동 예시','실제 블로그·쇼츠 URL을 운영자 승인을 통해 연결하면 이 위치에서 소개됩니다.',
                 'shorts',category,'','','메디픽 데모 콘텐츠',1,now(),0))
        if ix in (0,1,2,8):
            c.execute('INSERT INTO ads(provider_id,category,headline,priority,active,approved,created_at) VALUES(?,?,?,?,?,?,?)',
               (pid,category,category+' 정보 탐색 스폰서 영역 (데모)',100-ix,1,1,now()))

def asdict(row): return dict(row) if row else None

def valid_url(v):
    if not v: return ''
    if len(v)>1000: raise ValueError('URL이 너무 깁니다')
    p=urlsplit(v)
    if p.scheme not in ('https','http') or not p.hostname or p.username or p.password: raise ValueError('올바른 http(s) URL이 필요합니다')
    if p.hostname in ('localhost','127.0.0.1','::1') or p.hostname.endswith('.local'): raise ValueError('내부 URL은 사용할 수 없습니다')
    return v

def field(data,key,maxlen=200,required=False):
    val = str(data.get(key,'')).strip()
    if len(val)>maxlen: raise ValueError(key+' 길이 초과')
    if required and not val: raise ValueError(key+' 필수')
    return val

def provider_query(c, category='', region='', q='', night=False):
    clauses=["p.status='active'"]; args=[]
    if category and category != '전체': clauses.append('(p.category=? OR p.specialties LIKE ?)');args +=[category,'%'+category+'%']
    if region and region != '전국': clauses.append('(p.region LIKE ? OR p.district LIKE ?)'); args +=['%'+region+'%','%'+region+'%']
    if night: clauses.append('p.night=1')
    rawq=q.strip().lower()
    tokens=[t for t in re.split(r'\s+',rawq) if t and len(t)>1][:6]
    if tokens:
        search_clauses=[]
        for t in tokens:
            if t in ('추천','찾아줘','알려줘','병원','의원','근처','있는','어디','좋은','정보','전문','전문의','검색','싶어','관련','하는'): continue
            use=SYNONYMS.get(t,t)
            if use=='심야': continue
            search_clauses.append("(p.name LIKE ? OR p.category LIKE ? OR p.region LIKE ? OR p.district LIKE ? OR p.specialties LIKE ? OR p.description LIKE ? OR EXISTS (SELECT 1 FROM doctors d WHERE d.provider_id=p.id AND (d.name LIKE ? OR d.specialty LIKE ?)))")
            args += ['%'+use+'%']*8
        if search_clauses: clauses.append('('+' OR '.join(search_clauses)+')')
    sql='SELECT p.* FROM providers p WHERE '+' AND '.join(clauses)+' ORDER BY p.name LIMIT 250'
    data=[dict(row) for row in c.execute(sql,args)]
    return data

def match_intent(q):
    q=q.lower().strip()
    category=''; night=any(x in q for x in ['심야','야간','새벽','밤','24시','24시간']) and any(x in q for x in ['약','약국'])
    if '약국' in q or '약 ' in q: category='약국'
    for key,c in SYNONYMS.items():
        if key in q and c in CATEGORIES and not category: category=c
    return {'category':category, 'night':night, 'method':'규칙 기반 자연어 의도 분석 (생성형 AI 연결 전)',
            'note':'진료 적합성을 판단하거나 특정 의료기관의 치료 성과를 보증하지 않습니다.'}

def public_provider(c,row):
    p=dict(row);pid=p['id']
    p['doctors']=[dict(d) for d in c.execute('SELECT * FROM doctors WHERE provider_id=?',(pid,))]
    p['content']=[dict(x) for x in c.execute('SELECT x.*,d.name doctor_name,d.verification doctor_verification FROM content x LEFT JOIN doctors d ON d.id=x.doctor_id WHERE x.provider_id=? AND x.approved=1 ORDER BY x.editorial_priority DESC,x.id DESC LIMIT 30',(pid,))]
    p['ads']=[dict(x) for x in c.execute('SELECT * FROM ads WHERE provider_id=? AND active=1 AND approved=1',(pid,))]
    p['blog_links']=premium.approved_links(c,doctor_id=None)
    p['blog_links']=[x for x in p['blog_links'] if x['provider_id']==pid]
    p['subscription_active']=premium.is_subscribed(c,pid)
    p['reviews']=[dict(x) for x in c.execute("SELECT id,nickname,aspect,body,created_at FROM reviews WHERE provider_id=? AND status='approved' ORDER BY id DESC LIMIT 30",(pid,))]
    return p

def search(c,params):
    q=params.get('q',[''])[0].strip()[:120]; category=params.get('category',[''])[0][:40]; region=params.get('region',[''])[0][:40]
    guided=params.get('mode',[''])[0]=='ai'; intent=match_intent(q) if guided else {'category':'','night':False,'method':'카테고리 검색'}
    category=category if category and category != '전체' else intent['category'] or category
    rows=provider_query(c,category,region,q,intent['night'])
    # Paid exposure is allowed ONLY among context-matching results; always labelled.
    ids=[r['id'] for r in rows]; ads={}
    if ids:
        ph=','.join('?' for _ in ids)
        for a in c.execute('SELECT * FROM ads WHERE active=1 AND approved=1 AND provider_id IN ('+ph+') ORDER BY priority DESC,id DESC',ids):
            if premium.is_subscribed(c,a['provider_id']) and (a['category']==category or a['category']=='전체' or not category or category=='전체'): ads[a['provider_id']]=dict(a)
    for r in rows:
        r['sponsored']=r['id'] in ads
        r['ad_headline']=ads.get(r['id'],{}).get('headline','')
        r['sponsor_priority']=ads.get(r['id'],{}).get('priority',0)
        r['doctor_count']=c.execute('SELECT count(*) FROM doctors WHERE provider_id=?',(r['id'],)).fetchone()[0]
        r['content_count']=c.execute('SELECT count(*) FROM content WHERE provider_id=? AND approved=1',(r['id'],)).fetchone()[0]
    rows.sort(key=lambda r:(not r['sponsored'],-r['sponsor_priority'],-r['verified'],-r['content_count'],r['name']))
    return {'items':rows,'count':len(rows),'intent':intent,'category':category or '전체','region':region or '전국','query':q,
            'notice':'광고 상품은 관련 카테고리 상단에 노출되며 광고임을 표시합니다. 진료수준·치료성공률 순위가 아닙니다.'}

def password_ok(candidate):
    expected = os.environ.get('MEDIPICK_ADMIN_PASSWORD','medipick-demo-2026')
    return hmac.compare_digest(candidate.encode(),expected.encode())

def make_session():
    ts=str(int(time.time())); nonce=secrets.token_hex(14)
    payload=ts+'.'+nonce
    sig=hmac.new(SECRET,payload.encode(),hashlib.sha256).hexdigest()
    return payload+'.'+sig

def session_ok(cookie):
    m=re.search(r'(?:^|;\s*)medipick_admin=([^;]+)',cookie)
    if not m:return False
    try:
        ts,nonce,signature=m.group(1).split('.')
        payload=ts+'.'+nonce
        if not hmac.compare_digest(signature,hmac.new(SECRET,payload.encode(),hashlib.sha256).hexdigest()):return False
        age=time.time()-int(ts)
        return 0<=age<=8*3600
    except Exception:return False

def event(c,kind,provider_id=None,content_id=None,category='',query='',client_key=''):
    allowed={'search','provider_view','ad_impression','ad_click','content_open','booking_request','phone_click','category_click'}
    if kind not in allowed: raise ValueError('이벤트 유형 오류')
    # Never persist the user's free-text health question or identifiers in ad analytics.
    safe_query=category[:40] if category in CATEGORIES else '검색'
    c.execute('INSERT INTO events(kind,provider_id,content_id,category,query,client_key,created_at) VALUES(?,?,?,?,?,?,?)',
        (kind,provider_id,content_id,category[:40],safe_query,client_key[:70],now()))

def stats(c,provider_id=None):
    q='';args=[]
    if provider_id: q=' WHERE provider_id=?';args=[provider_id]
    counts={r['kind']:r['num'] for r in c.execute('SELECT kind,count(*) num FROM events'+q+' GROUP BY kind',args)}
    bookings =c.execute('SELECT COUNT(*) FROM appointments'+q,args).fetchone()[0]
    return {'events':counts,'bookings':bookings,'searches':counts.get('search',0),'views':counts.get('provider_view',0),
            'ad_impressions':counts.get('ad_impression',0),'ad_clicks':counts.get('ad_click',0),
            'click_through_rate':round(counts.get('ad_click',0)/max(counts.get('ad_impression',0),1)*100,1)}

def ics(booking,provider):
    # No medical condition or diagnostic detail is ever inserted into the calendar export.
    start=booking['visit_date'].replace('-','')+'T'+booking['visit_time'].replace(':','')+'00'
    date=datetime.strptime(booking['visit_date']+' '+booking['visit_time'],'%Y-%m-%d %H:%M')+timedelta(minutes=30)
    end=date.strftime('%Y%m%dT%H%M%S')
    def clean(s):return str(s).replace('\\','\\\\').replace('\n',' ').replace(',','\\,').replace(';','\\;')
    return '\r\n'.join(['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//MEDIPICK//Reservation//KO','BEGIN:VEVENT','UID:'+booking['public_id']+'@medipick.local',
        'DTSTAMP:'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'),'DTSTART;TZID=Asia/Seoul:'+start,'DTEND;TZID=Asia/Seoul:'+end,
        'SUMMARY:'+clean(provider['name']+' 예약 요청 (미확정)'),'DESCRIPTION:MEDIPICK 예약 요청, 병원 확정 연락 필수','END:VEVENT','END:VCALENDAR',''])

class Handler(BaseHTTPRequestHandler):
    server_version='MEDIPICK-MVP/3.3'
    def log_message(self,fmt,*args):LOG.info('HTTP %s %s',self.command,urlsplit(self.path).path)  # never log health queries
    def headers_common(self,ctype='application/json; charset=utf-8',status=200,length=None,extra=None):
        self.send_response(status)
        self.send_header('Content-Type',ctype)
        self.send_header('Cache-Control','no-store' if ctype.startswith('application/json') else 'public, max-age=300')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('X-Frame-Options','DENY')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Permissions-Policy','geolocation=(self), camera=(), microphone=()')
        self.send_header('Cross-Origin-Resource-Policy','same-origin')
        self.send_header('Content-Security-Policy',"default-src 'self'; img-src 'self' data: https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' https://www.googletagmanager.com https://maps.googleapis.com https://maps.gstatic.com https://js.tosspayments.com; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.google.com https://*.tosspayments.com https://*.tosspayments.net; frame-src https://www.youtube-nocookie.com https://*.tosspayments.com https://*.tosspayments.net; base-uri 'self'; object-src 'none'; frame-ancestors 'none'")
        if length is not None:self.send_header('Content-Length',str(length))
        for k,v in (extra or {}).items():self.send_header(k,v)
        self.end_headers()
    def send_json(self,obj,status=200,extra=None):
        raw=json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode()
        self.headers_common(status=status,length=len(raw),extra=extra);self.wfile.write(raw)
    def error(self,msg,status=400):self.send_json({'error':str(msg)},status)
    def read_json(self):
        if not self.headers.get('Content-Type','').startswith('application/json'):raise ValueError('JSON 요청만 허용됩니다')
        n=int(self.headers.get('Content-Length',0))
        limit=2_400_000 if urlsplit(self.path).path=='/api/consult/photo-chat' else 65536
        if n<=0 or n>limit:raise ValueError('요청 크기 제한 초과')
        obj=json.loads(self.rfile.read(n))
        if not isinstance(obj,dict):raise ValueError('JSON 객체가 필요합니다')
        return obj
    def require_admin(self):
        if not session_ok(self.headers.get('Cookie','')):self.error('관리자 로그인이 필요합니다',401);return False
        return True
    def serve_static(self,path):
        if path=='/':path='/index.html'
        elif path=='/admin':path='/admin.html'
        elif path=='/advertiser':path='/advertiser.html'
        elif path=='/doctors':path='/doctors.html'
        elif path=='/premium-admin':path='/premium-admin.html'
        elif path=='/doctor-finance':path='/doctor-finance.html'
        elif path=='/consult':path='/consult.html'
        elif path=='/my-health':path='/my-health.html'
        elif path=='/marketing-console':path='/marketing-console.html'
        elif path=='/integrations':path='/integrations.html'
        elif path=='/clinic-ops':path='/clinic-ops.html'
        elif path=='/clinic-access':path='/clinic-access.html'
        if path=='/favicon.ico':path='/assets/favicon.svg'
        base=(ROOT/'web').resolve();full=(base/path.lstrip('/')).resolve()
        if not full.is_relative_to(base) or not full.is_file():self.error('존재하지 않는 페이지',404);return
        ctype=mimetypes.guess_type(str(full))[0] or 'application/octet-stream'
        if ctype in ('text/html','text/css','application/javascript','text/javascript','image/svg+xml'):ctype+='; charset=utf-8'
        raw=full.read_bytes()
        self.headers_common(ctype,length=len(raw));self.wfile.write(raw)
    def do_HEAD(self):
        u=urlsplit(self.path); path=u.path if u.path != '/' else '/index.html'
        full=((ROOT/'web').resolve()/path.lstrip('/')).resolve()
        if not full.is_relative_to((ROOT/'web').resolve()) or not full.is_file():
            self.headers_common(status=404,length=0);return
        ct=mimetypes.guess_type(str(full))[0] or 'application/octet-stream'
        self.headers_common(ct,length=full.stat().st_size)
    def do_GET(self):
        try:
            u=urlsplit(self.path);path=u.path;params=parse_qs(u.query)
            if not path.startswith('/api/'):return self.serve_static(path)
            with db() as c:
                if path=='/api/health':
                    return self.send_json({'ok':True,'service':'medipick','version':'3.3','db':'sqlite'})
                if path=='/api/google/connect/start':
                    if not self.require_admin():return
                    doctor_id=int(params.get('doctor_id',['0'])[0]);redirect=oauth_google.begin(c,doctor_id)
                    self.send_response(302);self.send_header('Location',redirect);self.send_header('Cache-Control','no-store');self.end_headers();return
                if path=='/api/google/connect/callback':
                    try:
                        outcome=oauth_google.finish(c,params.get('state',[''])[0],params.get('code',[''])[0],SECRET)
                        LOG.info('Google Blogger OAuth connected doctor_id=%d',outcome['doctor_id'])
                        dest='/integrations?google=connected'
                    except Exception:
                        LOG.exception('Google OAuth callback failed')
                        dest='/integrations?google=failed'
                    self.send_response(303);self.send_header('Location',dest);self.send_header('Cache-Control','no-store');self.end_headers();return
                if path=='/api/integrations/status':
                    if not self.require_admin():return
                    ac=[{'doctor_id':r['doctor_id'],'email':r['google_email'],
                      'blogs':json.loads(r['blog_items']),'has_refresh':bool(r['refresh_encrypted']),
                      'updated_at':r['updated_at']} for r in c.execute('SELECT * FROM google_doctor_accounts ORDER BY doctor_id')]
                    orders=[dict(x) for x in c.execute('SELECT order_id,provider_id,plan,amount_krw,status,created_at FROM checkout_orders ORDER BY created_at DESC LIMIT 40')]
                    return self.send_json({'google_configured':oauth_google.ready(),'toss_configured':payments_toss.enabled(),
                      'google_accounts':ac,'orders':orders,'note':'실제 인증·실결제는 사업자 계정 키가 있어야 활성화됩니다.'})
                if path=='/api/config':return self.send_json({'categories':CATEGORIES,'ga_id':os.environ.get('MEDIPICK_GA_ID',''),'google_maps_browser_key':os.environ.get('GOOGLE_MAPS_BROWSER_KEY',''),'demo':True,'source_notice':'초기 데이터는 가상의 시연용 샘플입니다. 공공데이터를 가져오면 출처가 분리되어 표기됩니다.'})
                if path=='/api/home':
                    providers=search(c,{'category':['전체']})['items']
                    content=[dict(x) for x in c.execute('SELECT x.*,p.name provider_name,p.image_style,p.category provider_category,d.verification doctor_verification FROM content x JOIN providers p LEFT JOIN doctors d ON x.doctor_id=d.id ON p.id=x.provider_id WHERE x.approved=1 AND p.status=\'active\' ORDER BY x.editorial_priority DESC,x.id DESC LIMIT 12')]
                    return self.send_json({'featured':providers[:6],'latest':content,'categories':CATEGORIES})
                if path=='/api/search':return self.send_json(search(c,params))
                if path=='/api/health-data/connection':
                    return self.send_json({'connected':False,'available':False,'mode':'official_portal_link_only', 'official_portal':'https://www.myhealthway.go.kr/portal/', 'reason':'건강정보 고속도로 활용서비스 등록·본인인증·동적 동의·API 계약 전 개인정보 자동조회 불가', 'storable_health_data':False})
                if path=='/api/nearby':
                    if 'lat' not in params or 'lng' not in params:return self.error('위치정보 동의 및 좌표가 필요합니다')
                    return self.send_json(premium.nearby(c,params['lat'][0],params['lng'][0],params.get('radius',['10'])[0],params.get('category',[''])[0]))
                if path=='/api/doctors':
                    cat=params.get('category',[''])[0][:40]
                    query='SELECT d.id,d.provider_id,d.name,d.specialty,d.credentials,d.society,d.verification,p.name provider_name,p.category FROM doctors d JOIN providers p ON p.id=d.provider_id WHERE p.status=\'active\''
                    args=[]
                    if cat and cat!='전체':query+=' AND p.category=?';args.append(cat)
                    query+=' ORDER BY d.id DESC LIMIT 200'
                    return self.send_json({'items':[dict(x) for x in c.execute(query,args)]})
                if path=='/api/blog-links':
                    return self.send_json({'items':premium.approved_links(c)})
                m=re.fullmatch(r'/api/provider/(\d+)',path)
                if m:
                    row=c.execute("SELECT * FROM providers WHERE id=? AND status='active'",(int(m.group(1)),)).fetchone()
                    if not row:return self.error('기관이 없습니다',404)
                    return self.send_json(public_provider(c,row))
                if path=='/api/content':
                    cat=params.get('category',[''])[0][:40]
                    sql="SELECT x.*,p.name provider_name,p.image_style,p.category provider_category,d.name doctor_name,d.verification doctor_verification FROM content x JOIN providers p ON x.provider_id=p.id LEFT JOIN doctors d ON x.doctor_id=d.id WHERE x.approved=1 AND p.status='active'"
                    args=[]
                    if cat and cat!='전체':sql+=' AND x.category=?';args=[cat]
                    sql+=' ORDER BY x.editorial_priority DESC,x.id DESC LIMIT 100'
                    return self.send_json({'items':[dict(x) for x in c.execute(sql,args)]})
                if path=='/api/advertiser/stats':
                    bearer=self.headers.get('Authorization','')
                    if not bearer.startswith('Bearer ') or len(bearer)>150:return self.error('광고주 액세스 키를 입력하세요',401)
                    sha=hashlib.sha256(bearer[7:].encode()).hexdigest()
                    key=c.execute('SELECT * FROM advertiser_keys WHERE token_hash=? AND revoked=0',(sha,)).fetchone()
                    if not key or key['expires_at']<now():return self.error('광고주 키가 유효하지 않거나 만료되었습니다',401)
                    p=c.execute('SELECT id,name,category,region FROM providers WHERE id=?',(key['provider_id'],)).fetchone()
                    d=stats(c,key['provider_id'])
                    daily=[dict(x) for x in c.execute('SELECT substr(created_at,1,10) day,kind,count(*) count FROM events WHERE provider_id=? GROUP BY day,kind ORDER BY day DESC LIMIT 100',(key['provider_id'],))]
                    return self.send_json({'provider':dict(p),'metrics':d,'daily':daily,'expires_at':key['expires_at'],
                        'notice':'집계 수치만 제공하며 환자의 성명·전화번호·상담 내용은 제공하지 않습니다. 실제 집행 전 이벤트/GA4 값 대조가 필요합니다.'})
                if path=='/api/admin/marketing/contacts':
                    if not self.require_admin():return
                    totals=[dict(x) for x in c.execute('SELECT channel,COUNT(*) count FROM outreach_contacts WHERE consent_campaign=1 AND contact_verified=1 AND withdrawn_at IS NULL GROUP BY channel')]
                    return self.send_json({'consenting_counts':totals,'no_sensitive_targeting':True})
                if path=='/api/admin/marketing/campaigns':
                    if not self.require_admin():return
                    return self.send_json({'items':[dict(x) for x in c.execute('SELECT * FROM outreach_campaigns ORDER BY id DESC LIMIT 100')]})
                m=re.fullmatch(r'/api/admin/marketing/campaigns/(\d+)/preview',path)
                if m:
                    if not self.require_admin():return
                    return self.send_json(engagement.preview(c,int(m.group(1))))
                if path=='/api/doctor/profile' or path.startswith('/api/doctor/'):
                    key=billing.authenticate(c,self.headers.get('Authorization',''),SECRET)
                    if not key:return self.error('의사용 접근키가 필요하거나 만료되었습니다',401)
                    pid=key['provider_id']
                    if not premium.is_subscribed(c,pid):return self.error('활성 구독 기관만 이용할 수 있습니다',403)
                    p=c.execute('SELECT id,name,category,region FROM providers WHERE id=?',(pid,)).fetchone()
                    if path=='/api/doctor/profile':return self.send_json({'provider':dict(p),'key_label':key['label'],'expires_at':key['expires_at'],'notice':'의료 진료비 공식 청구·지급 시스템이 아닌 내부 관리용입니다.'})
                    if path=='/api/doctor/fees':return self.send_json({'items':billing.fee_list(c,pid)})
                    if path=='/api/doctor/claims':return self.send_json({'items':billing.list_claims(c,pid)})
                    if path=='/api/doctor/deposits':return self.send_json({'items':billing.deposits(c,pid)})
                    if path=='/api/doctor/dashboard':return self.send_json(billing.dashboard(c,pid))
                    if path=='/api/doctor/audit':return self.send_json({'items':billing.audit_list(c,pid)})
                    if path=='/api/doctor/export.xlsx':
                        raw=billing.export_xlsx(c,pid)
                        self.headers_common('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',length=len(raw),extra={'Content-Disposition':'attachment; filename="MEDIPICK_Doctor_Finance.xlsx"','Cache-Control':'no-store'})
                        self.wfile.write(raw);return
                    m=re.fullmatch(r'/api/doctor/claims/(\d+)/preflight',path)
                    if m:return self.send_json(billing.preflight(c,pid,int(m.group(1))))
                    return self.error('의사 API를 찾을 수 없습니다',404)
                if path.startswith('/api/clinic/'):
                    key=clinic_ops.authenticate(c,self.headers.get('Authorization',''),SECRET)
                    if not key:return self.error('병원 예약 운영 접근키가 필요합니다',401)
                    pid=key['provider_id']
                    if path=='/api/clinic/dashboard':return self.send_json(clinic_ops.dashboard(c,pid))
                    if path=='/api/clinic/schedule':
                        today=datetime.now(TZ).date();start=params.get('from',[today.isoformat()])[0]
                        end=params.get('to',[(today+timedelta(days=30)).isoformat()])[0]
                        return self.send_json({'events':clinic_ops.schedule(c,pid,start,end),'provider_id':pid})
                    if path=='/api/clinic/profile':
                        record=c.execute('SELECT id,name,category FROM providers WHERE id=?',(pid,)).fetchone()
                        return self.send_json({'provider':dict(record),'permission':key['permission'],'expires_at':key['expires_at']})
                    return self.error('병원 일정 API 없음',404)
                if path=='/api/admin/clinic-keys':
                    if not self.require_admin():return
                    return self.send_json({'items':[dict(r) for r in c.execute('SELECT id,provider_id,label,permission,expires_at,revoked,created_at FROM clinic_access ORDER BY id DESC LIMIT 200')]})
                if path=='/api/admin/me':return self.send_json({'authenticated':session_ok(self.headers.get('Cookie',''))})
                if path.startswith('/api/admin/'):
                    if not self.require_admin():return
                    if path=='/api/admin/stats':
                        prov=params.get('provider_id',[''])[0]
                        pid=int(prov) if prov.isdigit() else None
                        return self.send_json({'summary':stats(c,pid),'by_day':[dict(r) for r in c.execute("SELECT substr(created_at,1,10) day,kind,count(*) total FROM events GROUP BY day,kind ORDER BY day DESC LIMIT 120")],
                          'by_provider':[dict(r) for r in c.execute("SELECT p.id,p.name, count(CASE WHEN e.kind='provider_view' THEN 1 END) views, count(CASE WHEN e.kind='ad_click' THEN 1 END) clicks FROM providers p LEFT JOIN events e ON e.provider_id=p.id GROUP BY p.id ORDER BY views DESC LIMIT 25")],
                          'top_queries':[dict(r) for r in c.execute("SELECT query,count(*) count FROM events WHERE kind='search' AND query!='' GROUP BY query ORDER BY count DESC LIMIT 12")]})
                    if path=='/api/admin/doctor-keys':
                        return self.send_json({'items':[dict(x) for x in c.execute('SELECT id,provider_id,label,expires_at,revoked,created_at FROM doctor_access ORDER BY id DESC LIMIT 150')]})
                    if path=='/api/admin/subscriptions':
                        return self.send_json({'items':[dict(x) for x in c.execute('SELECT s.*,p.name provider_name FROM subscriptions s JOIN providers p ON p.id=s.provider_id ORDER BY s.provider_id')]})
                    if path=='/api/admin/locations':
                        return self.send_json({'items':[dict(x) for x in c.execute('SELECT l.*,p.name provider_name FROM locations l JOIN providers p ON p.id=l.provider_id ORDER BY l.provider_id')]})
                    if path=='/api/admin/blog-links':
                        return self.send_json({'items':[dict(x) for x in c.execute('SELECT b.id,b.doctor_id,b.provider_id,b.blog_url,b.verification,b.editorial_approved,b.created_at,d.name doctor_name FROM blog_links b JOIN doctors d ON b.doctor_id=d.id ORDER BY b.id DESC LIMIT 150')]})
                    if path=='/api/admin/providers':return self.send_json({'items':[dict(x) for x in c.execute('SELECT * FROM providers ORDER BY id DESC LIMIT 500')]})
                    if path=='/api/admin/content':return self.send_json({'items':[dict(x) for x in c.execute('SELECT * FROM content ORDER BY id DESC LIMIT 300')]})
                    if path=='/api/admin/doctors':return self.send_json({'items':[dict(x) for x in c.execute('SELECT * FROM doctors ORDER BY id DESC LIMIT 300')]})
                    if path=='/api/admin/ads':return self.send_json({'items':[dict(x) for x in c.execute('SELECT * FROM ads ORDER BY id DESC LIMIT 300')]})
                    if path=='/api/admin/appointments':return self.send_json({'items':[privacy.admin_appointment(x,SECRET) for x in c.execute("SELECT a.*,p.name provider_name FROM appointments a JOIN providers p ON p.id=a.provider_id ORDER BY a.id DESC LIMIT 250")]})
                    if path=='/api/admin/reviews':return self.send_json({'items':[dict(x) for x in c.execute('SELECT * FROM reviews ORDER BY id DESC LIMIT 200')]})
                    if path=='/api/admin/advertiser-keys':return self.send_json({'items':[dict(x) for x in c.execute('SELECT id,provider_id,label,expires_at,revoked,created_at FROM advertiser_keys ORDER BY id DESC LIMIT 200')]})
                    if path=='/api/admin/notifications':return self.send_json({'items':[dict(x) for x in c.execute('SELECT * FROM notifications ORDER BY id DESC LIMIT 200')]})
                    m=re.fullmatch(r'/api/admin/appointments/(\d+)/calendar',path)
                    if m:
                        b=c.execute('SELECT * FROM appointments WHERE id=?',(int(m.group(1)),)).fetchone()
                        if not b:return self.error('예약이 없습니다',404)
                        p=c.execute('SELECT * FROM providers WHERE id=?',(b['provider_id'],)).fetchone()
                        raw=ics(privacy.admin_appointment(b,SECRET),p).encode('utf-8')
                        self.headers_common('text/calendar; charset=utf-8',length=len(raw),extra={'Content-Disposition':'attachment; filename=medipick-appointment.ics'});self.wfile.write(raw);return
                self.error('API를 찾을 수 없습니다',404)
        except (ValueError,TypeError,json.JSONDecodeError) as e:self.error(e)
        except Exception:LOG.exception('GET failure');self.error('서버 오류',500)
    def do_POST(self):
        try:
            u=urlsplit(self.path);path=u.path
            data=self.read_json()
            # Admin-only integration changes. Google callback uses one-time OAuth state, no browser POST.
            with db() as c:
                if path=='/api/admin/google/sync':
                    if not self.require_admin():return
                    if self.headers.get('X-Medipick-Admin')!='1':return self.error('관리자 CSRF 헤더 필요',403)
                    return self.send_json(oauth_google.sync(c,int(data.get('doctor_id',0)),str(data.get('blog_id','')),SECRET))
                if path=='/api/admin/checkout/order':
                    if not self.require_admin():return
                    if self.headers.get('X-Medipick-Admin')!='1':return self.error('관리자 CSRF 헤더 필요',403)
                    return self.send_json(payments_toss.create(c,int(data.get('provider_id',0)),str(data.get('plan',''))),201)
                if path=='/api/admin/checkout/confirm':
                    if not self.require_admin():return
                    if self.headers.get('X-Medipick-Admin')!='1':return self.error('관리자 CSRF 헤더 필요',403)
                    # Atomic payment status + subscription transition. External provider may be slow.
                    c.execute('BEGIN IMMEDIATE')
                    out=payments_toss.confirm(c,str(data.get('orderId','')),str(data.get('paymentKey','')),data.get('amount'))
                    c.commit()
                    return self.send_json(out)

                if path.startswith('/api/doctor/'):
                    c.execute('BEGIN IMMEDIATE')  # atomic finance writes across concurrent server threads
                if path=='/api/login':
                    if not password_ok(field(data,'password',200)):
                        time.sleep(.15);return self.error('관리자 암호가 일치하지 않습니다',401)
                    cookie='medipick_admin='+make_session()+'; HttpOnly; Path=/; SameSite=Strict; Max-Age=28800'
                    if os.environ.get('MEDIPICK_COOKIE_SECURE')=='1':cookie+='; Secure'
                    return self.send_json({'ok':True},extra={'Set-Cookie':cookie})
                if path=='/api/logout':return self.send_json({'ok':True},extra={'Set-Cookie':'medipick_admin=; Path=/; SameSite=Strict; HttpOnly; Max-Age=0'})
                if path=='/api/events':
                    kind=field(data,'kind',40)
                    eid=data.get('provider_id');cid=data.get('content_id')
                    # Rate limit soft deduplication by client key for views/impressions within same hour.
                    client=field(data,'client_key',70)
                    if kind in ('ad_impression','provider_view') and client and eid:
                        recent=c.execute("SELECT 1 FROM events WHERE kind=? AND provider_id=? AND client_key=? AND created_at>? LIMIT 1",(kind,eid,client,(datetime.now(TZ)-timedelta(hours=1)).isoformat(timespec='seconds'))).fetchone()
                        if recent:return self.send_json({'ok':True,'deduplicated':True})
                    event(c,kind,int(eid) if eid else None,int(cid) if cid else None,field(data,'category',40),field(data,'query',120),client)
                    return self.send_json({'ok':True})
                if path=='/api/appointments':
                    pid=int(data.get('provider_id',0))
                    p=c.execute("SELECT id FROM providers WHERE id=? AND status='active'",(pid,)).fetchone()
                    if not p:return self.error('등록되지 않은 의료기관',404)
                    if data.get('consent') is not True:raise ValueError('예약정보 수집 및 병원 전달 동의가 필요합니다')
                    name=field(data,'name',40,True);phone=field(data,'phone',25,True)
                    if not re.fullmatch(r'[0-9+\- ]{9,20}',phone):raise ValueError('연락처 형식을 확인하세요')
                    date=field(data,'date',10,True);t=field(data,'time',5,True)
                    dt=datetime.strptime(date+' '+t,'%Y-%m-%d %H:%M').replace(tzinfo=TZ)
                    if dt.date() <= datetime.now(TZ).date() or dt>datetime.now(TZ)+timedelta(days=91):raise ValueError('예약 희망일은 내일부터 90일 이내로 지정하세요')
                    if dt.minute not in (0,30) or not (8<=dt.hour<=20):raise ValueError('08:00~20:30, 30분 단위만 신청 가능합니다')
                    public_id='MP-'+secrets.token_hex(5).upper()
                    cur=c.execute('INSERT INTO appointments(public_id,provider_id,visitor_name,phone,visit_date,visit_time,consent_at,created_at) VALUES(?,?,?,?,?,?,?,?)',
                       (public_id,pid,privacy.encrypt(name,SECRET),privacy.encrypt(phone,SECRET),date,t,now(),now()))
                    for channel in ('kakao','sms'):c.execute('INSERT INTO notifications(appointment_id,channel,created_at) VALUES(?,?,?)',(cur.lastrowid,channel,now()))
                    event(c,'booking_request',pid,category='',client_key=field(data,'client_key',70))
                    return self.send_json({'ok':True,'public_id':public_id,'status':'requested','message':'예약 요청이 접수되었습니다. 병원 확정 전이며 알림톡·문자는 연동 설정 전에는 발송되지 않습니다.'},201)
                if path=='/api/consult/photo-chat':
                    # Basic per-source throttle limits financial abuse; replace with gateway limits for production.
                    source=self.client_address[0]
                    with WRITE_LOCK:
                        tick=time.monotonic()
                        CHAT_THROTTLE[source]=[t for t in CHAT_THROTTLE.get(source,[]) if tick-t<600]
                        if len(CHAT_THROTTLE[source])>=15:return self.error('AI 상담 호출 한도: 10분 후 다시 시도하세요',429)
                        CHAT_THROTTLE[source].append(tick)
                    return self.send_json(medical_assist.respond(c,data,provider_query))
                if path=='/api/engagement/consent':
                    return self.send_json(engagement.consent(c,data,SECRET),201)
                if path=='/api/engagement/checkin':
                    return self.send_json(engagement.checkin(c,int(data.get('provider_id',0)),data),201)
                if path=='/api/ai/answer':
                    from ai_service import answer
                    query=field(data,'query',160,True)
                    category=field(data,'category',40)
                    return self.send_json(answer(c,query,category,data.get('external_consent') is True))
                if path=='/api/blog/request':
                    return self.send_json(premium.request_blog(c,int(data.get('doctor_id',0)),field(data,'blog_url',500,True)),201)
                if path=='/api/blog/verify':
                    return self.send_json(premium.verify_blog(c,int(data.get('link_id',0)),field(data,'verification_code',100,True)))
                if path=='/api/reviews':
                    pid=int(data.get('provider_id',0));aspect=field(data,'aspect',30,True)
                    if aspect not in ('접근성','예약편의','시설안내','정보정확성'):raise ValueError('후기 항목 오류')
                    nickname=field(data,'nickname',30,True);body=field(data,'body',500,True)
                    if not 10<=len(body)<=500:raise ValueError('후기는 10~500자')
                    if any(x in body for x in ('완치','치료 효과','치료효과','최고의 의사','수술 결과','시술 결과')):raise ValueError('치료효과 후기 및 우월성 표현은 게시할 수 없습니다')
                    if not c.execute('SELECT 1 FROM providers WHERE id=?',(pid,)).fetchone():return self.error('기관 없음',404)
                    c.execute('INSERT INTO reviews(provider_id,nickname,aspect,body,created_at) VALUES(?,?,?,?,?)',(pid,nickname,aspect,body,now()))
                    return self.send_json({'ok':True,'message':'운영자 검토 후 게시됩니다'},201)
                if path.startswith('/api/clinic/'):
                    key=clinic_ops.authenticate(c,self.headers.get('Authorization',''),SECRET)
                    if not key:return self.error('병원 예약 운영 접근키가 필요합니다',401)
                    if key['permission']!='schedule_manage':return self.error('일정 변경 권한이 없습니다',403)
                    if self.headers.get('X-Medipick-Clinic')!='1':return self.error('변경 요청 검증 헤더 필요',403)
                    m=re.fullmatch(r'/api/clinic/appointments/(\d+)/status',path)
                    if m:
                        c.execute('BEGIN IMMEDIATE')
                        result=clinic_ops.transition(c,key['provider_id'],key['id'],int(m.group(1)),str(data.get('status','')))
                        c.commit()
                        return self.send_json(result)
                    return self.error('병원 일정 변경 API 없음',404)
                if path.startswith('/api/doctor/'):
                    key=billing.authenticate(c,self.headers.get('Authorization',''),SECRET)
                    if not key:return self.error('의사용 접근키가 필요하거나 만료되었습니다',401)
                    if self.headers.get('X-Medipick-Doctor')!='1':return self.error('의사 API 변경 헤더 필요',403)
                    pid=key['provider_id']
                    if not premium.is_subscribed(c,pid):return self.error('활성 구독 기관만 이용할 수 있습니다',403)
                    kid=key['id']
                    def committed(result,status=200):
                        # Commit the atomic ledger mutation BEFORE the HTTP response is sent.
                        # Without this, a fast subsequent GET could see an uncommitted claim.
                        c.commit()
                        return self.send_json(result,status)
                    if path=='/api/doctor/fees':return committed(billing.add_fee(c,pid,kid,data),201)
                    if path=='/api/doctor/claims':return committed(billing.add_claim(c,pid,kid,data),201)
                    if path=='/api/doctor/deposits':return committed(billing.add_deposit(c,pid,kid,data),201)
                    if path=='/api/doctor/allocations':return committed(billing.allocate(c,pid,kid,data),201)
                    m=re.fullmatch(r'/api/doctor/claims/(\d+)/(prepare|submission-record|review)',path)
                    if m:
                        cid=int(m.group(1));operation=m.group(2)
                        if operation=='prepare':return committed(billing.prepare(c,pid,kid,cid))
                        if operation=='submission-record':return committed(billing.record_submission(c,pid,kid,cid,data))
                        if operation=='review':return committed(billing.record_review(c,pid,kid,cid,data))
                    return self.error('의사 API를 찾을 수 없습니다',404)
                if path.startswith('/api/admin/'):
                    if not self.require_admin():return
                    if self.headers.get('X-Medipick-Admin')!='1':return self.error('관리자 CSRF 헤더 필요',403)
                    if path=='/api/admin/marketing/campaigns':return self.send_json(engagement.campaign(c,data),201)
                    if path=='/api/admin/marketing/benefits':return self.send_json(engagement.benefit(c,data),201)
                    if path=='/api/admin/clinic-keys':
                        return self.send_json(clinic_ops.key_issue(c,int(data.get('provider_id',0)),data.get('label',''),data.get('permission','schedule_read'),SECRET),201)
                    m=re.fullmatch(r'/api/admin/clinic-keys/(\d+)/revoke',path)
                    if m:
                        cur=c.execute('UPDATE clinic_access SET revoked=1 WHERE id=?',(int(m.group(1)),))
                        if cur.rowcount==0:return self.error('키를 찾을 수 없습니다',404)
                        return self.send_json({'ok':True})
                    if path=='/api/admin/doctor-keys':
                        return self.send_json(billing.issue_key(c,int(data.get('provider_id',0)),data.get('label',''),SECRET),201)
                    m=re.fullmatch(r'/api/admin/doctor-keys/(\d+)/revoke',path)
                    if m:
                        record=c.execute('SELECT provider_id FROM doctor_access WHERE id=?',(int(m.group(1)),)).fetchone()
                        if not record:return self.error('키가 없습니다',404)
                        c.execute('UPDATE doctor_access SET revoked=1 WHERE id=?',(int(m.group(1)),))
                        billing.audit(c,record['provider_id'],'admin','revoke_key','doctor_access',int(m.group(1)))
                        return self.send_json({'ok':True})
                    if path=='/api/admin/subscriptions':
                        pid=int(data.get('provider_id',0))
                        if not c.execute('SELECT 1 FROM providers WHERE id=?',(pid,)).fetchone():raise ValueError('기관 ID 오류')
                        status=field(data,'status',20) or 'inactive'
                        if status not in ('active','inactive','paused'):raise ValueError('구독 상태 오류')
                        expires=field(data,'expires_at',40) or '2099-12-31T23:59:59+09:00'
                        datetime.fromisoformat(expires)
                        paid=int(data.get('paid') is True);approved=int(data.get('compliance_approved') is True)
                        c.execute('INSERT INTO subscriptions(provider_id,status,paid,compliance_approved,expires_at,started_at,plan,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET status=excluded.status,paid=excluded.paid,compliance_approved=excluded.compliance_approved,expires_at=excluded.expires_at,plan=excluded.plan,updated_at=excluded.updated_at',
                          (pid,status,paid,approved,expires,premium.now(),field(data,'plan',40) or 'basic',premium.now()))
                        return self.send_json({'ok':True,'eligible':premium.is_subscribed(c,pid)})
                    if path=='/api/admin/locations':
                        pid=int(data.get('provider_id',0))
                        if not c.execute('SELECT 1 FROM providers WHERE id=?',(pid,)).fetchone():raise ValueError('기관 ID 오류')
                        lat=float(data.get('lat'));lng=float(data.get('lng'))
                        if not (-90<=lat<=90 and -180<=lng<=180):raise ValueError('위치 범위 오류')
                        placeid=field(data,'google_place_id',180)
                        if placeid and not re.fullmatch(r'[A-Za-z0-9_\-]{10,180}',placeid):raise ValueError('Google Place ID 형식 오류')
                        # A Places-matched ID must pass the separate server-side live verification.
                        reviewed=0
                        c.execute('INSERT INTO locations(provider_id,latitude,longitude,google_place_id,place_reviewed,coordinate_source,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,google_place_id=excluded.google_place_id,place_reviewed=excluded.place_reviewed,coordinate_source=excluded.coordinate_source,updated_at=excluded.updated_at',
                           (pid,lat,lng,placeid,reviewed,field(data,'coordinate_source',120) or '운영자 확인',premium.now()))
                        return self.send_json({'ok':True})
                    if path=='/api/admin/google-place/verify':
                        pid=int(data.get('provider_id',0));place_id=field(data,'google_place_id',180,True)
                        row=c.execute('SELECT p.name,l.latitude,l.longitude,l.google_place_id FROM providers p JOIN locations l ON l.provider_id=p.id WHERE p.id=?',(pid,)).fetchone()
                        if not row:raise ValueError('기관과 독립 검증 좌표를 먼저 등록하세요')
                        if row['google_place_id']!=place_id:raise ValueError('위치에 등록된 Google Place ID와 다릅니다')
                        official=google_places.fetch_place(place_id)
                        check=google_places.verify_match(row['name'],row['latitude'],row['longitude'],official)
                        if not check['matched']:return self.send_json({'ok':False,**check},422)
                        c.execute('UPDATE locations SET place_reviewed=1,updated_at=? WHERE provider_id=?',(premium.now(),pid))
                        return self.send_json({'ok':True,**check,'notice':'Google Places와 독립 확인정보를 대조했습니다. 원문 장소정보는 DB에 캐시하지 않습니다.'})
                    if path=='/api/admin/blog-links/approve':
                        lid=int(data.get('link_id',0));approved=int(data.get('approved') is True)
                        record=c.execute('SELECT * FROM blog_links WHERE id=?',(lid,)).fetchone()
                        if not record:return self.error('블로그 연결이 없습니다',404)
                        if approved and record['verification']!='proof_verified':raise ValueError('블로그 소유권 검증 먼저 필요')
                        c.execute('UPDATE blog_links SET editorial_approved=? WHERE id=?',(approved,lid))
                        return self.send_json({'ok':True,'approved':bool(approved)})
                    if path=='/api/admin/blog-links/import':
                        lid=int(data.get('link_id',0))
                        record=c.execute("SELECT * FROM blog_links WHERE id=? AND verification='proof_verified' AND editorial_approved=1",(lid,)).fetchone()
                        if not record:raise ValueError('소유권 검증 및 운영자 승인된 블로그만 가져올 수 있습니다')
                        from scripts.import_blogger import fetch_blog
                        posts=fetch_blog(record['blog_url']);created=0
                        p=c.execute('SELECT category FROM providers WHERE id=?',(record['provider_id'],)).fetchone()
                        for x in posts[:30]:
                            if not x['title'] or not x['url'].startswith(record['blog_url']):continue
                            if c.execute('SELECT 1 FROM content WHERE provider_id=? AND url=?',(record['provider_id'],x['url'])).fetchone():continue
                            c.execute('INSERT INTO content(provider_id,doctor_id,title,summary,kind,category,url,author_label,approved,published_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
                              (record['provider_id'],record['doctor_id'],x['title'][:200],x['summary'][:900],'blog',p['category'],x['url'],x['author'][:100],0,now()))
                            created+=1
                        return self.send_json({'ok':True,'created_pending':created,'note':'수집한 메타데이터는 콘텐츠 검수 전에는 노출되지 않습니다.'})
                    if path=='/api/admin/advertiser-keys':
                        pid=int(data.get('provider_id',0))
                        if not c.execute('SELECT 1 FROM providers WHERE id=?',(pid,)).fetchone():raise ValueError('의료기관 ID 오류')
                        token='mpad_'+secrets.token_urlsafe(32)
                        expiry=(datetime.now(TZ)+timedelta(days=30)).isoformat(timespec='seconds')
                        cur=c.execute('INSERT INTO advertiser_keys(provider_id,label,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)',
                         (pid,field(data,'label',80) or '광고주 리포트',hashlib.sha256(token.encode()).hexdigest(),expiry,now()))
                        return self.send_json({'ok':True,'id':cur.lastrowid,'token':token,'expires_at':expiry,'note':'비밀 키는 이번 응답에서만 표시됩니다. 광고주에게 별도 안전한 채널로 전달하세요.'},201)
                    m=re.fullmatch(r'/api/admin/advertiser-keys/(\d+)/revoke',path)
                    if m:
                        c.execute('UPDATE advertiser_keys SET revoked=1 WHERE id=?',(int(m.group(1)),))
                        return self.send_json({'ok':True})
                    if path=='/api/admin/providers':
                        item=(field(data,'name',120,True),field(data,'category',40,True),field(data,'kind',30) or '병원',field(data,'region',50) or '서울',field(data,'district',50),field(data,'address',200),field(data,'phone',40),valid_url(field(data,'website',1000)),field(data,'hours',100),int(bool(data.get('night'))),field(data,'description',1000),field(data,'specialties',200),field(data,'source',100) or '운영자 등록',int(bool(data.get('verified'))),field(data,'image_style',30) or 'mint',now())
                        cur=c.execute('INSERT INTO providers(name,category,kind,region,district,address,phone,website,hours,night,description,specialties,source,verified,image_style,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',item)
                        return self.send_json({'ok':True,'id':cur.lastrowid},201)
                    if path=='/api/admin/doctors':
                        pid=int(data.get('provider_id',0))
                        if not c.execute('SELECT 1 FROM providers WHERE id=?',(pid,)).fetchone():raise ValueError('의료기관 ID 오류')
                        cur=c.execute('INSERT INTO doctors(provider_id,name,specialty,credentials,society,intro,verification,profile_url,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
                         (pid,field(data,'name',100,True),field(data,'specialty',100),field(data,'credentials',300),field(data,'society',200),field(data,'intro',1000),field(data,'verification',30) or 'unverified',valid_url(field(data,'profile_url',1000)),now()))
                        return self.send_json({'ok':True,'id':cur.lastrowid},201)
                    if path=='/api/admin/content':
                        pid=int(data.get('provider_id',0));doctor_id=data.get('doctor_id') or None
                        if not c.execute('SELECT 1 FROM providers WHERE id=?',(pid,)).fetchone():raise ValueError('의료기관 ID 오류')
                        if doctor_id and not c.execute('SELECT 1 FROM doctors WHERE id=? AND provider_id=?',(int(doctor_id),pid)).fetchone():raise ValueError('의료진 소속 확인 필요')
                        kind=field(data,'kind',30)
                        if kind not in ('blog','shorts','video','guide','paper'):raise ValueError('콘텐츠 유형 오류')
                        url=valid_url(field(data,'url',1000))
                        if kind in ('blog','shorts','video') and not url:raise ValueError('외부 콘텐츠 원문 주소 필요')
                        # Manager-controlled publishing, never automatically approve unverified submitted material.
                        cur=c.execute('INSERT INTO content(provider_id,doctor_id,title,summary,kind,category,url,evidence_url,author_label,approved,published_at,editorial_priority) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                           (pid,int(doctor_id) if doctor_id else None,field(data,'title',200,True),field(data,'summary',1500),kind,field(data,'category',40),url,valid_url(field(data,'evidence_url',1000)),field(data,'author_label',100),0,now(),int(data.get('editorial_priority',0))))
                        return self.send_json({'ok':True,'id':cur.lastrowid,'approved':False},201)
                    if path=='/api/admin/ads':
                        pid=int(data.get('provider_id',0));p=c.execute('SELECT * FROM providers WHERE id=?',(pid,)).fetchone()
                        if not p:raise ValueError('의료기관 ID 오류')
                        category=field(data,'category',40) or p['category']
                        if category not in ('전체',p['category']):raise ValueError('광고 카테고리는 해당 의료기관 분야와 일치해야 합니다')
                        cur=c.execute('INSERT INTO ads(provider_id,category,headline,priority,active,approved,created_at) VALUES(?,?,?,?,?,?,?)',
                          (pid,category,field(data,'headline',200,True),max(0,min(1000,int(data.get('priority',10)))),1,0,now()))
                        return self.send_json({'ok':True,'id':cur.lastrowid,'approved':False},201)
                    m=re.fullmatch(r'/api/admin/(content|ads|reviews)/(\d+)/moderate',path)
                    if m:
                        table,id=m.group(1),int(m.group(2));approved=bool(data.get('approved'))
                        if table=='reviews':c.execute('UPDATE reviews SET status=? WHERE id=?',('approved' if approved else 'rejected',id))
                        else:c.execute('UPDATE '+table+' SET approved=? WHERE id=?',(int(approved),id))
                        return self.send_json({'ok':True,'approved':approved})
                    m=re.fullmatch(r'/api/admin/appointments/(\d+)/status',path)
                    if m:
                        status=field(data,'status',30)
                        if status not in ('requested','confirmed','declined','completed','cancelled'):raise ValueError('예약 상태 오류')
                        record=c.execute('SELECT provider_id FROM appointments WHERE id=?',(int(m.group(1)),)).fetchone()
                        if not record:return self.error('예약 없음',404)
                        c.execute('BEGIN IMMEDIATE')
                        outcome=clinic_ops.transition(c,record['provider_id'],0,int(m.group(1)),status)
                        c.commit()
                        return self.send_json(outcome)
                return self.error('API가 없습니다',404)
        except LookupError as e:self.error(str(e),404)
        except (ValueError,TypeError,json.JSONDecodeError,sqlite3.IntegrityError) as e:self.error(str(e))
        except Exception:LOG.exception('POST failure');self.error('서버 오류',500)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--host',default=os.environ.get('MEDIPICK_HOST','127.0.0.1'));parser.add_argument('--port',type=int,default=int(os.environ.get('MEDIPICK_PORT','8765')))
    args=parser.parse_args();
    if args.host not in ('127.0.0.1','localhost','::1') and (not os.environ.get('MEDIPICK_ADMIN_PASSWORD') or os.environ.get('MEDIPICK_ADMIN_PASSWORD')=='medipick-demo-2026' or not os.environ.get('MEDIPICK_COOKIE_SECURE')=='1'):
        parser.error('외부 바인딩은 강한 관리자 암호·HTTPS 보안 쿠키 설정이 필요합니다. 공개 배포 전 보안감사 필수.')
    logging.basicConfig(level=logging.INFO,format='%(asctime)s %(message)s')
    init_db()
    if os.environ.get('MEDIPICK_ADMIN_PASSWORD') is None:
        print('\n[주의] 데모 관리자 암호: medipick-demo-2026 / 외부 공개 전 반드시 MEDIPICK_ADMIN_PASSWORD 지정')
    print('MEDIPICK http://%s:%d  |  관리자 /admin\n'%(args.host,args.port),flush=True)
    try:ThreadingHTTPServer((args.host,args.port),Handler).serve_forever()
    except KeyboardInterrupt:pass

"""MEDIPICK premium discovery: first-party paid placements, subscriber-only proximity,
and doctor-owned Blogger source connections. Never implies clinical ranking.
Only Google Place IDs are retained from Places; lat/lng are operator-entered first-party coordinates.
"""
from __future__ import annotations
import os,re,hashlib,hmac,secrets,math,urllib.parse,urllib.request,xml.etree.ElementTree as ET,html
from datetime import datetime,timezone,timedelta

FIELDS=('doctor_id','provider_id','blog_url')
KST=timezone(timedelta(hours=9))
def now():return datetime.now(KST).isoformat(timespec='seconds')
def clean_host(url):
    p=urllib.parse.urlsplit(str(url).strip())
    h=(p.hostname or '').lower()
    if p.scheme!='https' or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,60}\.blogspot\.com',h) or p.username or p.password or p.port:
        raise ValueError('Blogger 공개 https://계정.blogspot.com 주소만 연결할 수 있습니다')
    return 'https://'+h

def install(c):
    c.executescript('''
    CREATE TABLE IF NOT EXISTS subscriptions(provider_id INTEGER PRIMARY KEY REFERENCES providers(id),
      status TEXT NOT NULL DEFAULT 'inactive', paid INTEGER NOT NULL DEFAULT 0,
      compliance_approved INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL DEFAULT '', started_at TEXT NOT NULL DEFAULT '',
      plan TEXT NOT NULL DEFAULT 'basic', updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS locations(provider_id INTEGER PRIMARY KEY REFERENCES providers(id),
      latitude REAL NOT NULL, longitude REAL NOT NULL,
      google_place_id TEXT DEFAULT '', place_reviewed INTEGER NOT NULL DEFAULT 0,
      coordinate_source TEXT NOT NULL DEFAULT '운영자 확인', updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS blog_links(id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL REFERENCES doctors(id), provider_id INTEGER NOT NULL REFERENCES providers(id),
      blog_url TEXT NOT NULL, code_digest TEXT NOT NULL, verification TEXT NOT NULL DEFAULT 'pending_proof',
      editorial_approved INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, verified_at TEXT DEFAULT '',
      UNIQUE(doctor_id,blog_url));
    ''')
    # Demo coordinates are district-center approximations for UI verification, NOT clinic locations.
    if c.execute('SELECT count(*) FROM subscriptions').fetchone()[0]==0:
        demo=[(1,37.4979,127.0276),(2,37.5145,127.1059),(3,37.5566,126.9235),(4,37.4913,127.0082),(9,37.4964,127.0349)]
        for pid,lat,lng in demo:
            if not c.execute('SELECT 1 FROM providers WHERE id=? AND external_key LIKE ?', (pid,'demo-%')).fetchone():continue
            c.execute('INSERT OR IGNORE INTO subscriptions(provider_id,status,paid,compliance_approved,expires_at,started_at,plan,updated_at) VALUES(?,?,?,?,?,?,?,?)',
              (pid,'active',1,1,'2099-12-31T23:59:59+09:00',now(),'demo',now()))
            c.execute('INSERT OR IGNORE INTO locations(provider_id,latitude,longitude,coordinate_source,updated_at) VALUES(?,?,?,?,?)',
              (pid,lat,lng,'가상 시연좌표(실제 병원 위치 아님)',now()))

def is_subscribed(c,pid):
    r=c.execute('SELECT * FROM subscriptions WHERE provider_id=?',(pid,)).fetchone()
    if not (r and r['status']=='active' and r['paid'] and r['compliance_approved']):return False
    try:
        expires=datetime.fromisoformat(r['expires_at'])
        return bool(expires.tzinfo and expires>datetime.now(expires.tzinfo))
    except (TypeError,ValueError):return False

def eligible_ad(c,pid):return is_subscribed(c,pid)

def subscription_map(c):
    return {int(r['provider_id']):dict(r) for r in c.execute('SELECT * FROM subscriptions') if is_subscribed(c,r['provider_id'])}

def haversine(lat1,lon1,lat2,lon2):
    r=6371.0088
    p1,p2=math.radians(lat1),math.radians(lat2)
    dp=p2-p1;dl=math.radians(lon2-lon1)
    a=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*r*math.asin(min(1,math.sqrt(a)))

def nearby(c,lat,lon,radius=10,category='',limit=30):
    lat=float(lat);lon=float(lon);radius=float(radius)
    if not (-90<=lat<=90 and -180<=lon<=180):raise ValueError('위도/경도 범위 오류')
    if not (0.2<=radius<=50):raise ValueError('검색 반경은 0.2~50km')
    if category not in ('','전체') and category not in ('피부과','성형외과','내과','정형외과','치과','산부인과','소아청소년과','이비인후과','안과','정신건강의학과','건강검진','약국'):
        raise ValueError('진료과 카테고리 오류')
    rows=c.execute("SELECT p.*,l.latitude,l.longitude,l.google_place_id,l.place_reviewed,l.coordinate_source,s.plan FROM providers p JOIN locations l ON l.provider_id=p.id JOIN subscriptions s ON s.provider_id=p.id WHERE p.status='active' AND s.status='active' AND s.paid=1 AND s.compliance_approved=1")
    results=[]
    for row in rows:
        obj=dict(row)
        if not is_subscribed(c,obj['id']):continue
        # Real clinics require a live, server-verified Google Place ID. Demo rows are clearly marked.
        if not (str(obj.get('external_key') or '').startswith('demo-') or (obj.get('google_place_id') and obj.get('place_reviewed'))):continue
        if category and category!='전체' and not (obj['category']==category or category in obj['specialties']):continue
        d=haversine(lat,lon,obj['latitude'],obj['longitude'])
        if d>radius:continue
        obj.update(distance_km=round(d,2),sponsored=True,subscription_only=True,
                   disclosure='유료 구독 의료기관 · 광고 (의료 수준의 순위 아님)')
        results.append(obj)
    results.sort(key=lambda x:(x['distance_km'],x['name']))
    return {'items':results[:max(1,min(int(limit),50))], 'count':len(results), 'radius_km':radius,
     'notice':'가까운 병원에는 유효한 유료 구독 의료기관만 표시됩니다. 구독하지 않은 기관이 없다는 의미가 아닙니다. 거리 순이며 진료실력 순위가 아닙니다.'}

def sponsor_matches(c,rows,category='',limit=5):
    result=[]
    for r in rows:
        if not is_subscribed(c,r['id']):continue
        a=c.execute('SELECT * FROM ads WHERE provider_id=? AND active=1 AND approved=1 ORDER BY priority DESC,id DESC LIMIT 1',(r['id'],)).fetchone()
        if a is None:continue
        if category not in ('','전체') and a['category'] not in ('전체',category):continue
        result.append({'provider_id':r['id'],'name':r['name'],'category':r['category'],
          'region':r['region'],'district':r['district'],'headline':a['headline'],
          'priority':a['priority'],'advertising':True,'disclosure':'유료광고 · 구독 입점 의료기관',
          'clinical_quality_claim':False})
    return sorted(result,key=lambda x:(-x['priority'],x['name']))[:limit]

def request_blog(c,doctor_id,blog_url):
    doctor=c.execute('SELECT id,provider_id FROM doctors WHERE id=?',(int(doctor_id),)).fetchone()
    if not doctor:raise ValueError('등록된 의료진이 아닙니다')
    url=clean_host(blog_url)
    pending=c.execute('SELECT count(*) FROM blog_links WHERE doctor_id=? AND verification=?',(doctor['id'],'pending_proof')).fetchone()[0]
    if pending>=3:raise ValueError('해당 의료진의 미확인 연결 요청이 3건 이상입니다')
    code='MEDIPICK-VERIFY-'+secrets.token_hex(12).upper()
    digest=hashlib.sha256(code.encode()).hexdigest()
    c.execute('INSERT INTO blog_links(doctor_id,provider_id,blog_url,code_digest,created_at) VALUES(?,?,?,?,?) ON CONFLICT(doctor_id,blog_url) DO UPDATE SET code_digest=excluded.code_digest,verification=\'pending_proof\',editorial_approved=0,created_at=excluded.created_at,verified_at=\'\'',
      (doctor['id'],doctor['provider_id'],url,digest,now()))
    link_id=c.execute('SELECT id FROM blog_links WHERE doctor_id=? AND blog_url=?',(doctor['id'],url)).fetchone()['id']
    return {'ok':True,'link_id':link_id,'blog_url':url,'verification_code':code,
       'instructions':'블로그 소유자가 Blogger 공개 프로필 설명이나 새 공개 게시글에 이 코드를 넣고 검증을 요청하세요. 이후 운영자 승인 및 콘텐츠 검수를 거칩니다.',
       'warning':'이 요청만으로 의료진 신원·전문의 자격을 인증하지 않습니다.'}

def blog_proof_matches(code,raw):
    # Parsed metadata only; no execution or credential storage. Given feed content, confirm a unique unguessable code.
    if len(raw)>2_000_000:return False
    s=raw.decode('utf-8','replace') if isinstance(raw,bytes) else str(raw)
    return bool(code and code in s)

def verify_blog(c,link_id,code,document=None):
    r=c.execute('SELECT * FROM blog_links WHERE id=?',(int(link_id),)).fetchone()
    if not r:raise ValueError('연결 요청이 없습니다')
    if not hmac.compare_digest(hashlib.sha256(code.encode()).hexdigest(),r['code_digest']):raise ValueError('검증코드 불일치')
    if document is None:
        host=urllib.parse.urlsplit(r['blog_url']).hostname
        url='https://'+host+'/feeds/posts/default?alt=atom&max-results=10'
        # Google hosted, fixed host, and do not follow redirects to arbitrary hosts.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,req,fp,code,msg,headers,newurl):raise ValueError('리디렉션은 허용되지 않습니다')
        opener=urllib.request.build_opener(NoRedirect())
        req=urllib.request.Request(url,headers={'User-Agent':'MEDIPICK/2.0'})
        with opener.open(req,timeout=9) as f:document=f.read(2_000_001)
    if not blog_proof_matches(code,document):raise ValueError('공개 블로그 게시물에서 소유권 코드를 확인하지 못했습니다')
    c.execute("UPDATE blog_links SET verification='proof_verified',verified_at=? WHERE id=?",(now(),int(link_id)))
    return {'verified':True,'editorial_approved':False,'notice':'블로그 소유권 코드만 확인했습니다. 신원 검증과 운영자 공개 승인은 별개입니다.'}

def approved_links(c,doctor_id=None):
    sql="SELECT b.id,b.doctor_id,b.provider_id,b.blog_url,b.verification,b.editorial_approved,d.name doctor_name FROM blog_links b JOIN doctors d ON b.doctor_id=d.id WHERE b.verification='proof_verified' AND b.editorial_approved=1"
    args=[]
    if doctor_id:sql+=' AND b.doctor_id=?';args=[doctor_id]
    return [dict(x) for x in c.execute(sql,args)]

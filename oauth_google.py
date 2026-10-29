"""Admin-initiated, doctor-account Google OAuth code flow; Blogger content goes to moderation.
No Google credentials are fabricated. Login proves Google identity, not medical licensure.
"""
import os, re, json, hashlib, base64, secrets, urllib.parse, urllib.request
from datetime import datetime, timezone, timedelta
from cryptography.fernet import Fernet

AUTH='https://accounts.google.com/o/oauth2/v2/auth'
TOKEN='https://oauth2.googleapis.com/token'
SCOPE='openid email profile https://www.googleapis.com/auth/blogger.readonly'

def ready():
    return all(os.environ.get(x) for x in ('GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REDIRECT_URI'))
def crypto(secret): return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret + b'|oauth-google-v1').digest()))
def install(c):
    c.executescript('''
      CREATE TABLE IF NOT EXISTS google_oauth_pending(state_digest TEXT PRIMARY KEY,doctor_id INTEGER NOT NULL,
       nonce TEXT NOT NULL,verifier TEXT NOT NULL,expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS google_doctor_accounts(doctor_id INTEGER PRIMARY KEY REFERENCES doctors(id),
       google_sub TEXT NOT NULL,google_email TEXT NOT NULL,refresh_encrypted TEXT NOT NULL,
       blog_items TEXT NOT NULL DEFAULT '[]',connected_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    ''')
def utc():return datetime.now(timezone.utc).isoformat()
def begin(c,doctor_id):
    if not ready():raise ValueError('Google OAuth 키와 허용된 redirect URI를 먼저 설정하세요')
    if not c.execute('SELECT 1 FROM doctors WHERE id=?',(int(doctor_id),)).fetchone():raise ValueError('의료진 ID 오류')
    state=secrets.token_urlsafe(32);nonce=secrets.token_urlsafe(24);verifier=secrets.token_urlsafe(48)
    challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    expires=(datetime.now(timezone.utc)+timedelta(minutes=8)).isoformat()
    c.execute('DELETE FROM google_oauth_pending WHERE expires_at<?',(utc(),))
    c.execute('INSERT INTO google_oauth_pending VALUES(?,?,?,?,?)',(hashlib.sha256(state.encode()).hexdigest(),int(doctor_id),nonce,verifier,expires))
    q={'client_id':os.environ['GOOGLE_CLIENT_ID'],'redirect_uri':os.environ['GOOGLE_REDIRECT_URI'],
       'response_type':'code','scope':SCOPE,'state':state,'nonce':nonce,'access_type':'offline',
       'prompt':'consent','code_challenge':challenge,'code_challenge_method':'S256'}
    return AUTH+'?'+urllib.parse.urlencode(q)
def post_form(url,values):
    data=urllib.parse.urlencode(values).encode()
    req=urllib.request.Request(url,data=data,headers={'Content-Type':'application/x-www-form-urlencoded'},method='POST')
    with urllib.request.urlopen(req,timeout=12) as r:return json.loads(r.read(200000))
def get_json(url,access_token):
    if not url.startswith('https://www.googleapis.com/blogger/v3/'):
        raise ValueError('Blogger API 주소 오류')
    req=urllib.request.Request(url,headers={'Authorization':'Bearer '+access_token,'Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=12) as r:return json.loads(r.read(2000000))
def finish(c,state,code,secret, token_exchange=None, token_verify=None, blogs_fetch=None):
    if not state or not code:raise ValueError('OAuth 승인 코드가 없습니다')
    digest=hashlib.sha256(state.encode()).hexdigest()
    r=c.execute('SELECT * FROM google_oauth_pending WHERE state_digest=?',(digest,)).fetchone()
    if not r:raise ValueError('OAuth state 누락/재사용 의심')
    c.execute('DELETE FROM google_oauth_pending WHERE state_digest=?',(digest,))
    if r['expires_at']<utc():raise ValueError('OAuth state 만료')
    if not ready():raise ValueError('Google OAuth 환경변수 누락')
    args={'code':code,'client_id':os.environ['GOOGLE_CLIENT_ID'],'client_secret':os.environ['GOOGLE_CLIENT_SECRET'],
      'redirect_uri':os.environ['GOOGLE_REDIRECT_URI'],'grant_type':'authorization_code','code_verifier':r['verifier']}
    tok=(token_exchange or post_form)(TOKEN,args)
    if not tok.get('id_token') or not tok.get('access_token'):raise ValueError('Google 토큰 응답에 필수 필드가 없습니다')
    if token_verify is None:
        from google.oauth2 import id_token
        from google.auth.transport import requests
        claims=id_token.verify_oauth2_token(tok['id_token'],requests.Request(),os.environ['GOOGLE_CLIENT_ID'])
    else: claims=token_verify(tok['id_token'],os.environ['GOOGLE_CLIENT_ID'])
    if claims.get('iss') not in ('https://accounts.google.com','accounts.google.com') or claims.get('aud')!=os.environ['GOOGLE_CLIENT_ID']:
        raise ValueError('Google 토큰 발급자/대상 불일치')
    if claims.get('nonce')!=r['nonce'] or not claims.get('sub') or claims.get('email_verified') is not True:
        raise ValueError('Google nonce 또는 계정 검증 실패')
    url='https://www.googleapis.com/blogger/v3/users/self/blogs?view=AUTHOR'
    raw=(blogs_fetch or get_json)(url,tok['access_token'])
    blogs=[{'id':str(b.get('id','')),'name':str(b.get('name',''))[:180], 'url':str(b.get('url',''))[:1000]}
           for b in raw.get('items',[])[:50] if b.get('id') and b.get('url','').startswith('https://')]
    prior=c.execute('SELECT refresh_encrypted FROM google_doctor_accounts WHERE doctor_id=?',(r['doctor_id'],)).fetchone()
    enc=crypto(secret).encrypt(tok['refresh_token'].encode()).decode() if tok.get('refresh_token') else (prior['refresh_encrypted'] if prior else '')
    c.execute('INSERT INTO google_doctor_accounts VALUES(?,?,?,?,?,?,?) ON CONFLICT(doctor_id) DO UPDATE SET google_sub=excluded.google_sub,google_email=excluded.google_email,refresh_encrypted=excluded.refresh_encrypted,blog_items=excluded.blog_items,updated_at=excluded.updated_at',
       (r['doctor_id'],str(claims['sub']),str(claims.get('email',''))[:200],enc,json.dumps(blogs,ensure_ascii=False),utc(),utc()))
    return {'doctor_id':r['doctor_id'],'blogs':blogs,'has_refresh':bool(enc),'notice':'Google 로그인과 Blogger 접근권한을 확인했습니다. 의료진 자격이나 콘텐츠 게재 승인과는 별개입니다.'}
def sync(c,doctor_id,blog_id,secret,refresh_func=None,posts_fetch=None):
    a=c.execute('SELECT * FROM google_doctor_accounts WHERE doctor_id=?',(int(doctor_id),)).fetchone()
    if not a:raise ValueError('Google Blogger 계정 연결 필요')
    known=next((b for b in json.loads(a['blog_items']) if b['id']==str(blog_id)),None)
    if not known:raise ValueError('인증된 계정 소유 Blogger ID가 아닙니다')
    if not a['refresh_encrypted']:raise ValueError('재연결하여 오프라인 접근을 승인하세요')
    refresh=crypto(secret).decrypt(a['refresh_encrypted'].encode()).decode()
    if refresh_func:token=(refresh_func)(refresh)
    else:token=post_form(TOKEN,{'grant_type':'refresh_token','refresh_token':refresh,'client_id':os.environ['GOOGLE_CLIENT_ID'],'client_secret':os.environ['GOOGLE_CLIENT_SECRET']})
    if not token.get('access_token'):raise ValueError('Blogger 갱신 토큰 사용 실패')
    url='https://www.googleapis.com/blogger/v3/blogs/'+urllib.parse.quote(str(blog_id),safe='')+'/posts?maxResults=25&fetchBodies=false'
    raw=(posts_fetch or get_json)(url,token['access_token'])
    doctor=c.execute('SELECT d.id,d.provider_id,p.category FROM doctors d JOIN providers p ON p.id=d.provider_id WHERE d.id=?',(int(doctor_id),)).fetchone()
    added=0
    for item in raw.get('items',[])[:25]:
        link=str(item.get('url',''))[:1000]
        if not link.startswith(known['url'].rstrip('/')+'/') or not item.get('title'):continue
        if c.execute('SELECT 1 FROM content WHERE provider_id=? AND url=?',(doctor['provider_id'],link)).fetchone():continue
        c.execute('INSERT INTO content(provider_id,doctor_id,title,summary,kind,category,url,author_label,approved,published_at) VALUES(?,?,?,?,?,?,?,?,0,?)',
          (doctor['provider_id'],doctor['id'],str(item['title'])[:200],'Google 인증 계정에서 가져온 제목·원문 링크입니다. 전문성·광고심의 검수 대기 중입니다.',
           'blog',doctor['category'],link,a['google_email'],str(item.get('published') or utc())[:35]))
        added+=1
    return {'created_pending':added,'blog_id':str(blog_id),'all_moderation_required':True}

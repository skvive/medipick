import os,sys,time,socket,tempfile,subprocess,json,unittest,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class PlatformE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.database=Path(cls.tmp.name)/'testing.sqlite3'
        s=socket.socket();s.bind(('127.0.0.1',0));cls.port=s.getsockname()[1];s.close()
        cls.base=f'http://127.0.0.1:{cls.port}';env=os.environ.copy();env.update({'MEDIPICK_DB':str(cls.database),'MEDIPICK_ADMIN_PASSWORD':'test-super-secret'})
        cls.process=subprocess.Popen([sys.executable,str(ROOT/'server.py'),'--port',str(cls.port)],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for i in range(65):
            try:
                cls.fetch('/api/config');break
            except Exception:time.sleep(.1)
        else:raise RuntimeError('server boot timeout')
    @classmethod
    def tearDownClass(cls):cls.process.terminate();cls.process.wait(timeout=5);cls.tmp.cleanup()
    @classmethod
    def fetch(cls,path,data=None,cookie='',admin=False):
        headers={'Content-Type':'application/json'} if data is not None else {}
        if cookie:headers['Cookie']=cookie
        if admin:headers['X-Medipick-Admin']='1'
        req=urllib.request.Request(cls.base+path,data=json.dumps(data).encode() if data is not None else None,headers=headers)
        try:
            with urllib.request.urlopen(req,timeout=5) as r:
                raw=r.read();typ=r.headers.get('Content-Type','')
                return r.status,json.loads(raw) if 'application/json' in typ else raw,r.headers
        except urllib.error.HTTPError as e:
            raw=e.read();return e.code,json.loads(raw) if 'application/json' in e.headers.get('Content-Type','') else raw,e.headers
    def login(self):
        status,body,headers=self.fetch('/api/login',{'password':'test-super-secret'})
        self.assertEqual(status,200)
        return headers['Set-Cookie'].split(';')[0]
    def test_01_home_static(self):
        status,data,h=self.fetch('/');self.assertEqual(status,200);self.assertIn('MEDIPICK'.encode(),data);self.assertIn(b'assets/app.js',data)
        self.assertIn('nosniff',h['X-Content-Type-Options'])
        status,data,h=self.fetch('/assets/style.css');self.assertEqual(status,200);self.assertIn(b'hero',data)
    def test_02_demo_and_search_priority(self):
        status,data,_=self.fetch('/api/search?category=%ED%94%BC%EB%B6%80%EA%B3%BC')
        self.assertEqual(status,200);self.assertTrue(data['items']);self.assertTrue(data['items'][0]['sponsored']);self.assertEqual(data['category'],'피부과')
        self.assertTrue(all(x['category']=='피부과' for x in data['items']))
    def test_03_natural_language_night_pharmacy(self):
        status,data,_=self.fetch('/api/search?mode=ai&q=%EC%95%BC%EA%B0%84%20%EC%95%BD%EA%B5%AD')
        self.assertEqual(status,200);self.assertEqual(data['category'],'약국');self.assertTrue(all(x['night'] for x in data['items']))
        self.assertIn('규칙',data['intent']['method'])
    def test_04_details_and_doctor(self):
        status,data,_=self.fetch('/api/provider/1');self.assertEqual(status,200)
        self.assertGreater(len(data['doctors']),0);self.assertGreater(len(data['content']),0)
        self.assertEqual(data['doctors'][0]['verification'],'unverified')
    def test_05_admin_access_control(self):
        code,_,_=self.fetch('/api/admin/stats');self.assertEqual(code,401)
        code,_,_=self.fetch('/api/admin/providers',{'name':'bad'});self.assertEqual(code,401)
        code,_,_=self.fetch('/api/login',{'password':'wrong'});self.assertEqual(code,401)
    def test_06_events_and_stats(self):
        code,_,_=self.fetch('/api/events',{'kind':'search','query':'피부과','category':'피부과'});self.assertEqual(code,200)
        cookie=self.login();code,data,_=self.fetch('/api/admin/stats',cookie=cookie);self.assertEqual(code,200);self.assertGreaterEqual(data['summary']['searches'],1)
        code,_,_=self.fetch('/api/events',{'kind':'MADE_UP_EVENT'});self.assertEqual(code,400)
    def test_07_admin_provider_creation(self):
        cookie=self.login()
        body={'name':'테스트 의원','category':'피부과','region':'서울','district':'강동구','description':'테스트 병원','website':'https://example.org'}
        code,data,_=self.fetch('/api/admin/providers',body,cookie,True);self.assertEqual(code,201)
        self.assertGreater(data['id'],0)
        code,search,_=self.fetch('/api/search?category=%ED%94%BC%EB%B6%80%EA%B3%BC')
        self.assertTrue(any(x['name']=='테스트 의원' for x in search['items']))
        code,_,_=self.fetch('/api/admin/providers',body,cookie,False);self.assertEqual(code,403)
    def test_08_content_pending_and_moderation(self):
        cookie=self.login();content={'provider_id':1,'kind':'blog','title':'검증 전 의료 블로그','category':'피부과',
            'url':'https://example.org/doctors-blog','summary':'작성자 검증 전','author_label':'테스트 의사'}
        code,data,_=self.fetch('/api/admin/content',content,cookie,True);self.assertEqual(code,201);cid=data['id']
        _,home,_=self.fetch('/api/content');self.assertFalse(any(x['id']==cid for x in home['items']))
        code,_,_=self.fetch(f'/api/admin/content/{cid}/moderate',{'approved':True},cookie,True);self.assertEqual(code,200)
        _,home,_=self.fetch('/api/content');self.assertTrue(any(x['id']==cid for x in home['items']))
        code,_,_=self.fetch('/api/admin/content',dict(content,url='javascript:alert(1)'),cookie,True);self.assertEqual(code,400)
    def test_09_ads_relevance_and_moderation(self):
        cookie=self.login();body={'provider_id':1,'headline':'피부과 전문 데모 광고','category':'정형외과','priority':200}
        code,_,_=self.fetch('/api/admin/ads',body,cookie,True);self.assertEqual(code,400)
        body['category']='피부과';code,data,_=self.fetch('/api/admin/ads',body,cookie,True);self.assertEqual(code,201)
        _,result,_=self.fetch('/api/admin/ads',cookie=cookie);ad=next(x for x in result['items'] if x['id']==data['id']);self.assertEqual(ad['approved'],0)
    def test_10_booking_outbox_and_calendar(self):
        from datetime import datetime,timedelta,timezone
        visit=(datetime.now(timezone(timedelta(hours=9)))+timedelta(days=2)).date().isoformat()
        body={'provider_id':1,'name':'예약테스트','phone':'010-1234-5678','date':visit,'time':'10:30','consent':True}
        code,data,_=self.fetch('/api/appointments',dict(body,consent=False));self.assertEqual(code,400)
        code,data,_=self.fetch('/api/appointments',body);self.assertEqual(code,201);self.assertEqual(data['status'],'requested')
        cookie=self.login();_,book,_=self.fetch('/api/admin/appointments',cookie=cookie)
        ap=next(x for x in book['items'] if x['public_id']==data['public_id'])
        code,_,_=self.fetch(f"/api/admin/appointments/{ap['id']}/calendar");self.assertEqual(code,401)
        code,ics,_=self.fetch(f"/api/admin/appointments/{ap['id']}/calendar",cookie=cookie)
        self.assertEqual(code,200);self.assertIn(b'BEGIN:VCALENDAR',ics)
        code,_,_=self.fetch(f"/api/admin/appointments/{ap['id']}/status",{'status':'confirmed'},cookie,True);self.assertEqual(code,200)
        _,out,_=self.fetch('/api/admin/notifications',cookie=cookie)
        self.assertTrue(any(x['appointment_id']==ap['id'] and x['state']=='pending_configuration' for x in out['items']))
    def test_11_review_moderation(self):
        body={'provider_id':1,'nickname':'테스트방문자','aspect':'접근성','body':'지하철 출구에서 도보로 찾아가기 쉬웠어요.'}
        code,data,_=self.fetch('/api/reviews',body);self.assertEqual(code,201)
        code,_,_=self.fetch('/api/reviews',dict(body,body='수술 결과 최고의 의사'));self.assertEqual(code,400)
        cookie=self.login();_,r,_=self.fetch('/api/admin/reviews',cookie=cookie);self.assertTrue(r['items']);rid=r['items'][0]['id']
        code,_,_=self.fetch(f'/api/admin/reviews/{rid}/moderate',{'approved':True},cookie,True);self.assertEqual(code,200)
        _,p,_=self.fetch('/api/provider/1');self.assertTrue(p['reviews'])
    def test_13_advertiser_scoped_report_and_revocation(self):
        code,html,_=self.fetch('/advertiser');self.assertEqual(code,200);self.assertIn(b'assets/advertiser.js',html)
        code,_,_=self.fetch('/api/advertiser/stats');self.assertEqual(code,401)
        cookie=self.login()
        code,issued,_=self.fetch('/api/admin/advertiser-keys',{'provider_id':1,'label':'테스트 입점 고객'},cookie,True)
        self.assertEqual(code,201);self.assertTrue(issued['token'].startswith('mpad_'))
        token=issued['token'];headers={'Authorization':'Bearer '+token}
        with urllib.request.urlopen(urllib.request.Request(self.base+'/api/advertiser/stats',headers=headers),timeout=4) as r:
            result=json.loads(r.read())
        self.assertEqual(result['provider']['id'],1)
        self.assertIn('ad_impressions',result['metrics'])
        self.assertIn('bookings',result['metrics'])
        self.assertNotIn('visitor_name',json.dumps(result))
        self.assertNotIn('phone',json.dumps(result))
        code,keys,_=self.fetch('/api/admin/advertiser-keys',cookie=cookie)
        self.assertEqual(code,200);self.assertTrue(any(k['id']==issued['id'] for k in keys['items']))
        self.assertNotIn(token,json.dumps(keys))
        code,_,_=self.fetch('/api/admin/advertiser-keys/'+str(issued['id'])+'/revoke',{},cookie,True)
        self.assertEqual(code,200)
        try:
            urllib.request.urlopen(urllib.request.Request(self.base+'/api/advertiser/stats',headers=headers),timeout=4)
            self.fail('Revoked token should never be valid')
        except urllib.error.HTTPError as exc:self.assertEqual(exc.code,401)
    def test_14_ai_source_based_without_api_key(self):
        code,result,_=self.fetch('/api/ai/answer',{'query':'허리 통증 정형외과 어디를 봐야 하나요?','category':'정형외과','external_consent':False})
        self.assertEqual(code,200)
        self.assertEqual(result['mode'],'local')
        self.assertIn('text',result);self.assertGreater(len(result['text']),20)
    def test_12_input_guard(self):
        code,_,_=self.fetch('/api/appointments',{'provider_id':1,'consent':True,'name':'x','phone':'bad','date':'2026-11-20','time':'10:00'});self.assertEqual(code,400)
        code,_,_=self.fetch('/api/provider/99999');self.assertEqual(code,404)
        code,_,_=self.fetch('/api/admin/appointments',{'unexpected':True});self.assertEqual(code,401)


    def test_15_nearby_only_subscribed_and_valid_location(self):
        code,d,_=self.fetch('/api/nearby?lat=37.4979&lng=127.0276&radius=30')
        self.assertEqual(code,200);self.assertTrue(d['items'])
        self.assertTrue(all(x['subscription_only'] and x['sponsored'] for x in d['items']))
        self.assertTrue(any(x['id']==1 for x in d['items']))
        self.assertTrue(all(x['distance_km']<=30 for x in d['items']))
        code,_,_=self.fetch('/api/nearby?lat=99&lng=127');self.assertEqual(code,400)
        code,d,_=self.fetch('/api/nearby?lat=37.4979&lng=127.0276&radius=0.2')
        self.assertEqual(code,200);self.assertTrue(all(x['distance_km']<=0.2 for x in d['items']))

    def test_16_subscription_guards_and_expiration(self):
        cookie=self.login();path='/api/admin/subscriptions'
        code,_,_=self.fetch(path,{'provider_id':1,'status':'active','paid':False,'compliance_approved':True},cookie,True)
        self.assertEqual(code,200)
        code,d,_=self.fetch('/api/nearby?lat=37.4979&lng=127.0276&radius=5')
        self.assertEqual(code,200);self.assertFalse(any(x['id']==1 for x in d['items']))
        code,d,_=self.fetch('/api/search?category=%ED%94%BC%EB%B6%80%EA%B3%BC')
        self.assertEqual(code,200);self.assertFalse(next(x for x in d['items'] if x['id']==1)['sponsored'])
        self.fetch(path,{'provider_id':1,'status':'active','paid':True,'compliance_approved':True,'expires_at':'2020-01-01T00:00:00+09:00'},cookie,True)
        _,d,_=self.fetch('/api/nearby?lat=37.4979&lng=127.0276&radius=5')
        self.assertFalse(any(x['id']==1 for x in d['items']))
        self.fetch(path,{'provider_id':1,'status':'active','paid':True,'compliance_approved':True,'expires_at':'2099-12-31T23:59:59+09:00'},cookie,True)
        _,d,_=self.fetch('/api/nearby?lat=37.4979&lng=127.0276&radius=5')
        self.assertTrue(any(x['id']==1 for x in d['items']))

    def test_17_ai_paid_separate_from_medical_guidance(self):
        code,d,_=self.fetch('/api/ai/answer',{'query':'피부과 여드름 정보 검색','category':'피부과','external_consent':False})
        self.assertEqual(code,200);self.assertIn('sponsored',d)
        self.assertTrue(d['sponsored'])
        self.assertTrue(all(x['advertising'] and not x['clinical_quality_claim'] for x in d['sponsored']))
        self.assertIn('disclaimer',d);self.assertIn('sources',d)

    def test_18_blog_claim_verification_and_approval(self):
        code,doctors,_=self.fetch('/api/doctors');self.assertEqual(code,200);self.assertTrue(doctors['items'])
        doc=doctors['items'][0]['id']
        code,d,_=self.fetch('/api/blog/request',{'doctor_id':doc,'blog_url':'https://test-doctor.blogspot.com/'})
        self.assertEqual(code,201);self.assertIn('verification_code',d);lid=d['link_id']
        code,_,_=self.fetch('/api/blog/request',{'doctor_id':doc,'blog_url':'http://127.0.0.1/admin'})
        self.assertEqual(code,400)
        code,_,_=self.fetch('/api/blog/verify',{'link_id':lid,'verification_code':'WRONG'})
        self.assertEqual(code,400)
        cookie=self.login()
        code,_,_=self.fetch('/api/admin/blog-links/approve',{'link_id':lid,'approved':True},cookie,True)
        self.assertEqual(code,400)
        code,_,_=self.fetch('/api/admin/blog-links/import',{'link_id':lid},cookie,True)
        self.assertEqual(code,400)
        code,blog,_=self.fetch('/api/admin/blog-links',cookie=cookie)
        self.assertEqual(code,200);self.assertTrue(any(x['id']==lid and x['editorial_approved']==0 for x in blog['items']))

    def test_19_admin_location_and_page_images(self):
        code,_,_=self.fetch('/api/admin/locations',{'provider_id':1,'lat':37.5,'lng':127.0})
        self.assertEqual(code,401)
        cookie=self.login()
        code,_,_=self.fetch('/api/admin/locations',{'provider_id':1,'lat':999,'lng':127},cookie,True)
        self.assertEqual(code,400)
        for page in ['/doctors','/premium-admin','/assets/photos/cat01.webp','/assets/photos/cat12.webp']:
            code,body,_=self.fetch(page);self.assertEqual(code,200);self.assertTrue(body)
        code,_,_=self.fetch('/api/config');self.assertEqual(code,200)

    def test_20_blog_proof_pure_logic(self):
        import sys
        sys.path.insert(0,str(ROOT))
        from premium import blog_proof_matches,clean_host
        self.assertTrue(blog_proof_matches('MEDIPICK-VERIFY-TEST',b'<feed><title>MEDIPICK-VERIFY-TEST</title></feed>'))
        self.assertFalse(blog_proof_matches('MEDIPICK-VERIFY-TEST',b'<feed><title>something else</title></feed>'))
        self.assertEqual(clean_host('https://clinic.blogspot.com/'), 'https://clinic.blogspot.com')
        with self.assertRaises(ValueError):clean_host('https://clinic.blogspot.com.evil.com')


    def test_21_google_places_requires_live_server_key(self):
        cookie=self.login()
        code,_,_=self.fetch('/api/admin/google-place/verify',{'provider_id':1,'google_place_id':'ChIJTESTPLACE98765'},cookie,True)
        self.assertEqual(code,400)  # No GOOGLE_PLACES_SERVER_KEY configured in this test.
        code,_,_=self.fetch('/api/admin/locations',{'provider_id':1,'lat':37.5,'lng':127.03,'google_place_id':'invalid+id'},cookie,True)
        self.assertEqual(code,400)

    def test_22_google_place_pure_crosscheck(self):
        import sys
        sys.path.insert(0,str(ROOT))
        from google_places import verify_match
        place={'id':'ChIJTESTPLACE98765','displayName':{'text':'메디픽 데모 피부클리닉'},'location':{'latitude':37.4979,'longitude':127.0276},'formattedAddress':'서울 강남구'}
        match=verify_match('메디픽 데모 피부클리닉',37.4979,127.0276,place)
        self.assertTrue(match['matched'])
        self.assertFalse(verify_match('다른 의원',37.4979,127.0276,place)['matched'])
        self.assertFalse(verify_match('메디픽 데모 피부클리닉',35.0,129.0,place)['matched'])

if __name__=='__main__':unittest.main(verbosity=2)

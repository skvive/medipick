import os,sys,json,tempfile,sqlite3,unittest,urllib.parse,contextlib
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import oauth_google,payments_toss
from test_platform import PlatformE2E

class IntegrationHTTP(PlatformE2E):
    # Reuse live test server fixture but run only the newly added endpoints here.
    def test_40_page_and_admin_gate(self):
        code,page,_=self.fetch('/integrations');self.assertEqual(code,200);self.assertIn('공식 계정 연결'.encode(),page)
        code,data,_=self.fetch('/api/integrations/status');self.assertEqual(code,401)
        code,data,_=self.fetch('/api/admin/checkout/order',{'provider_id':1,'plan':'basic'});self.assertEqual(code,401)
        code,data,_=self.fetch('/api/admin/google/sync',{'doctor_id':1,'blog_id':'abc'});self.assertEqual(code,401)
    def test_41_payment_order_price_cannot_be_client_overridden(self):
        cookie=self.login()
        code,data,_=self.fetch('/api/admin/checkout/order',{'provider_id':1,'plan':'basic','amount':0},cookie,True)
        self.assertEqual(code,201);self.assertEqual(data['amount'],190000);self.assertFalse(data['enabled'])
        code,_,_=self.fetch('/api/admin/checkout/confirm',{'orderId':data['orderId'],'amount':190000,'paymentKey':'payment_dummy_345'},cookie,True)
        self.assertEqual(code,400)
        code,_,_=self.fetch('/api/admin/checkout/order',{'provider_id':1,'plan':'patient-treatment'},cookie,True)
        self.assertEqual(code,400)
    def test_42_google_oauth_needs_setup(self):
        code,_,_=self.fetch('/api/google/connect/start?doctor_id=1');self.assertEqual(code,401)
        cookie=self.login();code,data,_=self.fetch('/api/google/connect/start?doctor_id=1',cookie=cookie)
        self.assertEqual(code,400);self.assertIn('Google OAuth',data['error'])

class IntegrationPure(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.con=sqlite3.connect(Path(self.temp.name)/'t.db',isolation_level=None)
        self.con.row_factory=sqlite3.Row
        self.con.executescript('CREATE TABLE providers(id INTEGER PRIMARY KEY,name TEXT,category TEXT);CREATE TABLE doctors(id INTEGER PRIMARY KEY,provider_id INTEGER); CREATE TABLE content(provider_id INTEGER,doctor_id INTEGER,title TEXT,summary TEXT,kind TEXT,category TEXT,url TEXT,author_label TEXT,approved INTEGER,published_at TEXT);INSERT INTO providers VALUES(1,"테스트","피부과"); INSERT INTO doctors VALUES(4,1);')
        oauth_google.install(self.con);payments_toss.install(self.con)
        self.con.execute("CREATE TABLE subscriptions(provider_id INTEGER PRIMARY KEY,status TEXT,paid INTEGER,compliance_approved INTEGER,expires_at TEXT,started_at TEXT,plan TEXT,updated_at TEXT)")
    def tearDown(self):self.con.close();self.temp.cleanup()
    def test_43_oauth_pkce_state_nonce_and_moderation(self):
        env={'GOOGLE_CLIENT_ID':'TEST.apps.googleusercontent.com','GOOGLE_CLIENT_SECRET':'dummy','GOOGLE_REDIRECT_URI':'http://localhost:8765/api/google/connect/callback'}
        with patch.dict(os.environ,env):
            url=oauth_google.begin(self.con,4)
            params=urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
            self.assertEqual(params['code_challenge_method'],['S256'])
            self.assertNotIn('client_secret',params)
            nonce=params['nonce'][0];state=params['state'][0]
            claims={'iss':'https://accounts.google.com','aud':env['GOOGLE_CLIENT_ID'],'nonce':nonce,'sub':'ga-123','email_verified':True,'email':'doc@example.org'}
            payload={'id_token':'token','access_token':'access','refresh_token':'private-refresh'}
            blogs={'items':[{'id':'12345','name':'우리 의학 블로그','url':'https://example.blogspot.com/'}]}
            call=lambda url,args:payload
            verify=lambda token,aud:claims
            fetch=lambda url,token:blogs
            info=oauth_google.finish(self.con,state,'code',b'good-secret',call,verify,fetch)
            self.assertTrue(info['has_refresh']);self.assertEqual(info['blogs'][0]['id'],'12345')
            row=self.con.execute('SELECT * FROM google_doctor_accounts').fetchone()
            self.assertNotIn('private-refresh',row['refresh_encrypted'])
            with self.assertRaises(ValueError):oauth_google.finish(self.con,state,'code',b'good-secret',call,verify,fetch)
            added=oauth_google.sync(self.con,4,'12345',b'good-secret',lambda refresh:{'access_token':'new'},
                     lambda url,tok:{'items':[{'title':'가상 글','url':'https://example.blogspot.com/2026/10/post.html'}]})
            self.assertEqual(added['created_pending'],1)
            self.assertEqual(self.con.execute('SELECT approved FROM content').fetchone()[0],0)
    def test_44_oauth_nonce_replay_rejected(self):
        with patch.dict(os.environ,{'GOOGLE_CLIENT_ID':'test','GOOGLE_CLIENT_SECRET':'dummy','GOOGLE_REDIRECT_URI':'http://localhost/x'}):
            url=oauth_google.begin(self.con,4);state=urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)['state'][0]
            bad=lambda token,aud:{'iss':'https://accounts.google.com','aud':'test','nonce':'WRONG','sub':'1','email_verified':True}
            with self.assertRaisesRegex(ValueError,'nonce'):
                oauth_google.finish(self.con,state,'code',b'secret',lambda url,args:{'id_token':'fake','access_token':'fake'},bad,lambda u,t:{'items':[]})
            with self.assertRaisesRegex(ValueError,'state'):
                oauth_google.finish(self.con,state,'code',b'secret',lambda url,args:{},bad,lambda u,t:{'items':[]})
    def test_45_payment_confirm_invariant_and_idempotency(self):
        with patch.dict(os.environ,{'TOSS_CLIENT_KEY':'test_ck_dummy','TOSS_SECRET_KEY':'test_sk_dummy','MEDIPICK_ENABLE_REAL_PAYMENTS':'1'}):
            o=payments_toss.create(self.con,1,'premium');self.assertEqual(o['amount'],490000)
            called=[]
            gateway=lambda a,b,c:(called.append((a,b,c)) or {'orderId':a,'paymentKey':b,'totalAmount':c,'status':'DONE'})
            with self.assertRaisesRegex(ValueError,'금액'):
                payments_toss.confirm(self.con,o['orderId'],'valid_test_key_payment',1,gateway)
            self.assertEqual(called,[])
            with self.assertRaisesRegex(ValueError,'응답'):
                payments_toss.confirm(self.con,o['orderId'],'valid_test_key_payment',490000,lambda a,b,c:{'orderId':a,'paymentKey':b,'totalAmount':10,'status':'DONE'})
            result=payments_toss.confirm(self.con,o['orderId'],'valid_test_key_payment',490000,gateway)
            self.assertTrue(result['requires_ad_approval'])
            self.assertEqual(self.con.execute('SELECT status,paid,compliance_approved FROM subscriptions').fetchone()['status'],'paused')
            with self.assertRaisesRegex(ValueError,'이미 처리'):
                payments_toss.confirm(self.con,o['orderId'],'valid_test_key_payment',490000,gateway)
    def test_46_pii_encryption_roundtrip_and_no_plaintext_storage(self):
        import privacy
        val=privacy.encrypt('010-1111-2222',b'good-secret')
        self.assertTrue(val.startswith('ENC_V1:'))
        self.assertNotIn('010-1111-2222',val)
        self.assertEqual(privacy.decrypt(val,b'good-secret'),'010-1111-2222')
        with self.assertRaises(ValueError):privacy.decrypt(val,b'bad-secret')
    def test_47_image_assets_not_medical_identification(self):
        from PIL import Image
        files=list((ROOT/'web/assets/photos').glob('*.webp'))
        self.assertGreaterEqual(len(files),12)
        for f in files:
            with Image.open(f) as i:
                self.assertGreater(i.width,60);self.assertGreater(i.height,60)

if __name__=='__main__':unittest.main()

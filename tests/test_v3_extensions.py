import unittest,sys,json,os,io,base64,urllib.request,urllib.error,zipfile
from pathlib import Path
from PIL import Image
import test_platform
ROOT=test_platform.ROOT

class ExtendedE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_platform.PlatformE2E.setUpClass.__func__(cls)
    @classmethod
    def tearDownClass(cls):
        test_platform.PlatformE2E.tearDownClass.__func__(cls)
    @classmethod
    def fetch(cls,path,data=None,cookie='',admin=False):
        return test_platform.PlatformE2E.fetch.__func__(cls,path,data,cookie,admin)
    def login(self):
        return test_platform.PlatformE2E.login(self)
    def doc(self,path,token,body=None):
        headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'}
        if body is not None:headers['X-Medipick-Doctor']='1'
        req=urllib.request.Request(self.base+'/api/doctor/'+path,headers=headers,data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(req,timeout=5) as r:
                raw=r.read();return r.status,json.loads(raw) if 'application/json' in r.headers.get('Content-Type','') else raw
        except urllib.error.HTTPError as e:return e.code,json.loads(e.read())

    def test_23_ui_pages(self):
        for route,string in [('/consult','AI 사진'),('/my-health','나의 건강'),('/doctor-finance','청구'),('/marketing-console','캠페인')]:
            code,body,_=self.fetch(route);self.assertEqual(code,200);self.assertIn(string.encode(),body)
        for asset in ['consult.js','health.js','doctor-finance.js','marketing.js','v3.css']:
            code,body,_=self.fetch('/assets/'+asset);self.assertEqual(code,200);self.assertGreater(len(body),200)
    def test_24_chat_text_sponsored(self):
        code,d,_=self.fetch('/api/consult/photo-chat',{'question':'피부 발진이 며칠째 있어요'})
        self.assertEqual(code,200);self.assertEqual(d['category'],'피부과');self.assertFalse(d['emergency']);self.assertTrue(d['sponsored'])
        self.assertTrue(all(x['paid'] and x['ad_label']=='광고·스폰서' for x in d['sponsored']))
        self.assertTrue(d['disclaimer']);self.assertEqual(d['model_mode'],'safety_information')
    def test_25_emergency_overrides_sponsors(self):
        code,d,_=self.fetch('/api/consult/photo-chat',{'question':'가슴통증과 호흡곤란이 갑자기 있어요'})
        self.assertEqual(code,200);self.assertTrue(d['emergency']);self.assertIn('119',d['message']);self.assertEqual(d['sponsored'],[])
    def test_26_photo_requires_consent_and_rejects_garbage(self):
        image='data:image/jpeg;base64,'+base64.b64encode(b'not an image').decode()
        code,_,_=self.fetch('/api/consult/photo-chat',{'question':'피부 사진이 궁금해요','image':image});self.assertEqual(code,400)
        code,_,_=self.fetch('/api/consult/photo-chat',{'question':'피부 사진이 궁금해요','image':image,'sensitive_consent':True});self.assertEqual(code,400)
    def test_27_real_image_without_model_not_misrepresented(self):
        img=Image.new('RGB',(20,20),'lightblue');data=io.BytesIO();img.save(data,format='PNG')
        payload='data:image/png;base64,'+base64.b64encode(data.getvalue()).decode()
        code,result,_=self.fetch('/api/consult/photo-chat',{'question':'사진의 피부 상태를 설명해주세요','image':payload,'sensitive_consent':True})
        self.assertEqual(code,200);self.assertTrue(result['image_received']);self.assertFalse(result['image_analyzed'])
        self.assertIn('API 키',result['model_notice']);self.assertFalse(result['emergency'])
    def test_28_query_validation(self):
        for q in ['', 'a'*701]:
            code,d,_=self.fetch('/api/consult/photo-chat',{'question':q});self.assertEqual(code,400)
    def test_29_sponsor_expiration(self):
        cookie=self.login();body={'provider_id':1,'status':'active','paid':False,'compliance_approved':True}
        code,_,_=self.fetch('/api/admin/subscriptions',body,cookie,True);self.assertEqual(code,200)
        code,d,_=self.fetch('/api/consult/photo-chat',{'question':'피부과 뾰루지 상담'});self.assertEqual(code,200)
        self.assertFalse(any(x['id']==1 for x in d['sponsored']))
        self.fetch('/api/admin/subscriptions',dict(body,paid=True,expires_at='2099-12-31T23:59:59+09:00'),cookie,True)
    def test_30_official_data_disconnected(self):
        code,d,_=self.fetch('/api/health-data/connection');self.assertEqual(code,200);self.assertFalse(d['connected']);self.assertFalse(d['storable_health_data'])
        self.assertIn('myhealthway',d['official_portal'])
    def test_31_consent_unverified_not_counted(self):
        code,d,_=self.fetch('/api/engagement/consent',{'channel':'email','contact':'fake-qa@example.com','consent_campaign':True})
        self.assertEqual(code,201);self.assertFalse(d['eligible_for_send']);self.assertFalse(d['contact_verified'])
        cookie=self.login();code,result,_=self.fetch('/api/admin/marketing/contacts',cookie=cookie);self.assertEqual(code,200)
        self.assertFalse(any(item['channel']=='email' and item['count']>0 for item in result['consenting_counts']))
        code,d,_=self.fetch('/api/engagement/consent',{'channel':'email','contact':'fake-qa@example.com','consent_campaign':False});self.assertEqual(code,201)
    def test_32_campaign_requires_admin_and_no_sending(self):
        body={'channel':'sms','name':'메디픽 건강정보 안내','body':'안녕하세요. 메디픽의 일반 건강정보를 소개합니다. 수신거부 080 안내'}
        code,_,_=self.fetch('/api/admin/marketing/campaigns',body);self.assertEqual(code,401)
        cookie=self.login();code,d,_=self.fetch('/api/admin/marketing/campaigns',body,cookie,True);self.assertEqual(code,201)
        code,prev,_=self.fetch('/api/admin/marketing/campaigns/'+str(d['id'])+'/preview',cookie=cookie);self.assertEqual(code,200)
        self.assertFalse(prev['can_send']);self.assertEqual(prev['consented_recipients'],0)
    def test_33_medical_coupon_and_wallet_blocked(self):
        cookie=self.login()
        code,_,_=self.fetch('/api/admin/marketing/campaigns',{'channel':'sms','name':'위험','body':'진료비 할인 쿠폰으로 방문하세요.'},cookie,True);self.assertEqual(code,400)
        code,d,_=self.fetch('/api/admin/marketing/benefits',{'name':'병원 결제 선불충전','benefit_type':'prepaid_wallet_simulator'},cookie,True)
        self.assertEqual(code,201);self.assertEqual(d['state'],'blocked_legal_review')
    def test_34_checkin_never_issues_rewards(self):
        body={'provider_id':1,'alias':'qaVisitor_001','consent':False}
        code,d,_=self.fetch('/api/engagement/checkin',body);self.assertEqual(code,400)
        code,d,_=self.fetch('/api/engagement/checkin',dict(body,consent=True));self.assertEqual(code,201);self.assertEqual(d['reward_points'],0)
    def test_35_doctor_claim_and_excel_protection(self):
        code,_,_=self.fetch('/api/doctor/dashboard');self.assertEqual(code,401)
        cookie=self.login();code,d,_=self.fetch('/api/admin/doctor-keys',{'provider_id':1,'label':'테스트 재무'},cookie,True);self.assertEqual(code,201)
        token=d['token'];status,profile=self.doc('profile',token);self.assertEqual(status,200);self.assertEqual(profile['provider']['id'],1)
        status,fees=self.doc('fees',token);self.assertEqual(status,200);self.assertTrue(fees['items'])
        status,claim=self.doc('claims',token,{'encounter_ref':'CASE-XG334','visit_date':'2026-05-21','patient_copay_won':0,'lines':[{'code':'DEMO-EXAM','quantity':2}]})
        self.assertEqual(status,201);self.assertEqual(claim['requested_won'],46000)
        status,pre=self.doc('claims/'+str(claim['id'])+'/preflight',token);self.assertEqual(status,200);self.assertFalse(pre['can_prepare'])
        status,res=self.doc('claims/'+str(claim['id'])+'/prepare',token,{});self.assertEqual(status,400)
        status,xlsx=self.doc('export.xlsx',token);self.assertEqual(status,200)
        archive=zipfile.ZipFile(io.BytesIO(xlsx));self.assertIn('xl/workbook.xml',archive.namelist())
        self.assertEqual(self.doc('dashboard','mpdoc_invalid')[0],401)
        status,d2,_=self.fetch('/api/admin/doctor-keys',{'provider_id':2,'label':'테스트 2'},cookie,True)
        self.assertEqual(status,201)
        status,claims=self.doc('claims',d2['token']);self.assertEqual(status,200);self.assertFalse(any(x['encounter_ref']=='CASE-XG334' for x in claims['items']))
    def test_36_no_sensitive_fields_in_ad_reports(self):
        cookie=self.login();_,k,_=self.fetch('/api/admin/advertiser-keys',{'provider_id':1},cookie,True)
        request=urllib.request.Request(self.base+'/api/advertiser/stats',headers={'Authorization':'Bearer '+k['token']})
        with urllib.request.urlopen(request,timeout=5) as r:payload=r.read().decode()
        self.assertNotIn('CASE-XG334',payload);self.assertNotIn('visitor_name',payload)

class MedicalAssistUnit(unittest.TestCase):
    def test_photo_reencode_removes_exif(self):
        sys.path.insert(0,str(ROOT));import medical_assist
        img=Image.new('RGB',(20,20),'pink');b=io.BytesIO();img.save(b,format='JPEG',exif=b'Exif\x00\x00private-marker')
        src='data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode()
        clean=medical_assist.sanitize_image(src)
        self.assertNotIn('private-marker',base64.b64decode(clean.split(',')[1]).decode('latin1'))
    def test_external_model_default_off(self):
        sys.path.insert(0,str(ROOT));import medical_assist
        prev=os.environ.pop('OPENAI_API_KEY',None)
        try:
            answer,warning=medical_assist.vision_analysis('문의',None)
            self.assertIsNone(answer);self.assertIn('키',warning)
        finally:
            if prev is not None:os.environ['OPENAI_API_KEY']=prev

class VisionAdapterContract(unittest.TestCase):
    def test_openai_responses_image_contract_without_external_call(self):
        import medical_assist
        from unittest.mock import patch
        from contextlib import contextmanager
        class FakeResponse:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self):return json.dumps({'output':[{'content':[{'type':'output_text','text':'피부 증상은 의료진 확인이 필요합니다.'}]}]},ensure_ascii=False).encode()
        captured=[]
        def fake_urlopen(req,timeout=0):
            payload=json.loads(req.data)
            captured.append(payload)
            return FakeResponse()
        prev=os.environ.get('OPENAI_API_KEY')
        try:
            os.environ['OPENAI_API_KEY']='mock-key-no-real-network'
            with patch('medical_assist.urllib.request.urlopen',side_effect=fake_urlopen):
                result,error=medical_assist.vision_analysis('증상이 궁금합니다','data:image/jpeg;base64,ABC=',[{'role':'user','text':'이틀 전부터 생김'}])
            self.assertIsNone(error);self.assertIn('의료진',result)
            self.assertEqual(captured[0]['store'],False)
            parts=captured[0]['input'][0]['content']
            self.assertEqual(parts[1]['type'],'input_image');self.assertIn('이틀 전부터 생김',parts[0]['text'])
        finally:
            if prev is None:os.environ.pop('OPENAI_API_KEY',None)
            else:os.environ['OPENAI_API_KEY']=prev

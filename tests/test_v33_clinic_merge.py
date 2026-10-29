"""Repository integration verification: multi-tenant access, schedules, notifications."""
import os,sys,sqlite3,tempfile,unittest,json,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import clinic_ops
from test_platform import PlatformE2E

class ClinicUnit(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.c=sqlite3.connect(str(Path(self.tmp.name)/'test.db'),isolation_level=None)
        self.c.row_factory=sqlite3.Row;self.c.execute('PRAGMA foreign_keys=ON')
        self.c.executescript('''CREATE TABLE providers(id INTEGER PRIMARY KEY,name TEXT);
         CREATE TABLE appointments(id INTEGER PRIMARY KEY,public_id TEXT,provider_id INTEGER REFERENCES providers(id),
           visitor_name TEXT,phone TEXT,visit_date TEXT,visit_time TEXT,status TEXT);
         CREATE TABLE notifications(id INTEGER PRIMARY KEY,appointment_id INTEGER REFERENCES appointments(id),channel TEXT,
           state TEXT DEFAULT 'pending_configuration', attempts INTEGER DEFAULT 0,created_at TEXT);
         INSERT INTO providers VALUES(1,'병원A'),(2,'병원B');
         INSERT INTO appointments VALUES(1,'req-A1',1,'ENC_V1:fake','ENC_V1:fake','2030-01-02','10:00','requested'),
           (2,'req-A2',1,'ENC_V1:fake','ENC_V1:fake','2030-01-02','10:00','requested'),
           (3,'req-B1',2,'ENC_V1:fake','ENC_V1:fake','2030-01-02','10:00','requested');''')
        clinic_ops.install(self.c)
    def tearDown(self):self.c.close();self.tmp.cleanup()
    def test_01_key_scoped_and_not_plaintext(self):
        key=clinic_ops.key_issue(self.c,1,'의원 예약', 'schedule_manage',b'secret')
        self.assertTrue(key['token'].startswith('mpclinic_'));self.assertNotIn(key['token'],self.c.execute('SELECT token_hash FROM clinic_access').fetchone()[0])
        self.assertEqual(clinic_ops.authenticate(self.c,'Bearer '+key['token'],b'secret')['provider_id'],1)
        self.assertIsNone(clinic_ops.authenticate(self.c,'Bearer '+key['token'],b'bad'))
        self.c.execute('UPDATE clinic_access SET revoked=1 WHERE id=?',(key['id'],))
        self.assertIsNone(clinic_ops.authenticate(self.c,'Bearer '+key['token'],b'secret'))
    def test_02_no_cross_tenant_info(self):
        s=clinic_ops.schedule(self.c,1,'2030-01-01','2030-01-31')
        self.assertEqual(len(s),2);self.assertNotIn('req-B1',repr(s));self.assertNotIn('visitor_name',repr(s))
        with self.assertRaises(LookupError):clinic_ops.transition(self.c,1,1,3,'confirmed')
    def test_03_conflict_atomic_and_notifications(self):
        a=clinic_ops.transition(self.c,1,1,1,'confirmed')
        self.assertTrue(a['notification_queued']);self.assertEqual(a['delivery'],'not_sent')
        self.assertEqual(self.c.execute('SELECT count(*) FROM notifications WHERE event_type="booking_confirmed"').fetchone()[0],2)
        with self.assertRaisesRegex(ValueError,'이미 확정'):
            clinic_ops.transition(self.c,1,1,2,'confirmed')
        self.assertEqual(self.c.execute('SELECT status FROM appointments WHERE id=2').fetchone()[0],'requested')
    def test_04_transition_and_no_double_notifications(self):
        clinic_ops.transition(self.c,1,1,1,'confirmed')
        again=clinic_ops.transition(self.c,1,1,1,'confirmed')
        self.assertTrue(again['unchanged'])
        self.assertEqual(self.c.execute('SELECT count(*) FROM notifications').fetchone()[0],2)
        clinic_ops.transition(self.c,1,1,1,'completed')
        with self.assertRaises(ValueError):clinic_ops.transition(self.c,1,1,1,'confirmed')
    def test_05_date_validation(self):
        for a,b in [('2030-05-01','2030-01-01'),('2030-01-01','2030-07-01'),('2030-99-01','2030-99-02')]:
            with self.assertRaises(ValueError):clinic_ops.schedule(self.c,1,a,b)
    def test_06_expired_key(self):
        d=clinic_ops.key_issue(self.c,1,'readonly','schedule_read',b'secret')
        self.c.execute("UPDATE clinic_access SET expires_at='2020-01-01T00:00:00+09:00' WHERE id=?",(d['id'],))
        self.assertIsNone(clinic_ops.authenticate(self.c,'Bearer '+d['token'],b'secret'))
    def test_07_notification_event_migration(self):
        clinic_ops.install(self.c)
        self.assertTrue(any(r['name']=='event_type' for r in self.c.execute('PRAGMA table_info(notifications)')))

class ClinicHTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):PlatformE2E.setUpClass.__func__(cls)
    @classmethod
    def tearDownClass(cls):PlatformE2E.tearDownClass.__func__(cls)
    @classmethod
    def fetch(cls,*args,**kwargs):return PlatformE2E.fetch.__func__(cls,*args,**kwargs)
    def login(self):return PlatformE2E.login(self)
    def call(self,path,token='',payload=None,header=True):
        headers={'Authorization':'Bearer '+token}
        if payload is not None:
            headers['Content-Type']='application/json'
            if header:headers['X-Medipick-Clinic']='1'
        request=urllib.request.Request(self.base+path,data=json.dumps(payload).encode() if payload is not None else None,headers=headers)
        try:
            with urllib.request.urlopen(request,timeout=6) as resp:return resp.status,json.loads(resp.read())
        except urllib.error.HTTPError as exc:return exc.code,json.loads(exc.read())
    def test_08_pages_and_access(self):
        for path in ['/clinic-ops','/clinic-access','/assets/clinic-ops.js','/assets/clinic-access.js']:
            status,b,_=self.fetch(path);self.assertEqual(status,200);self.assertGreater(len(b),100)
        code,_=self.call('/api/clinic/schedule');self.assertEqual(code,401)
        code,_,_=self.fetch('/api/admin/clinic-keys');self.assertEqual(code,401)
    def test_09_live_admin_keys_and_revoke(self):
        cookie=self.login()
        code,d,_=self.fetch('/api/admin/clinic-keys',{'provider_id':1,'label':'예약실','permission':'schedule_read'},cookie,True)
        self.assertEqual(code,201);key=d['token']
        code,profile=self.call('/api/clinic/profile',key);self.assertEqual(code,200);self.assertEqual(profile['permission'],'schedule_read')
        code,items=self.call('/api/clinic/schedule?from=2026-01-01&to=2026-03-31',key);self.assertEqual(code,200)
        code,err=self.call('/api/clinic/appointments/1/status',key,{'status':'confirmed'});self.assertEqual(code,403)
        code,_,_=self.fetch('/api/admin/clinic-keys/'+str(d['id'])+'/revoke',{},cookie,True);self.assertEqual(code,200)
        code,_=self.call('/api/clinic/profile',key);self.assertEqual(code,401)
    def test_10_mutation_csrf_and_provider_scope(self):
        cookie=self.login()
        code,d,_=self.fetch('/api/admin/clinic-keys',{'provider_id':1,'permission':'schedule_manage'},cookie,True)
        self.assertEqual(code,201);token=d['token']
        code,err=self.call('/api/clinic/appointments/999999/status',token,{'status':'confirmed'},header=False);self.assertEqual(code,403)
        code,err=self.call('/api/clinic/appointments/999999/status',token,{'status':'confirmed'});self.assertEqual(code,404)
        code,err=self.call('/api/clinic/schedule?from=2026-01-01&to=2027-01-01',token);self.assertEqual(code,400)

if __name__=='__main__':unittest.main()

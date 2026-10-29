"""Clinic schedule / notification integration, adapted from shinkangteam/helloapp.

Design patterns: studio-scoped RBAC, overlap prevention, durable notification queue.
Independent Python implementation, without copying Next.js runtime or tokens.
No real Kakao/SMS is sent; requires approved provider templates/contract.
"""
from __future__ import annotations
import hashlib, hmac, re, secrets
from datetime import datetime, timedelta, timezone, date

TZ=timezone(timedelta(hours=9))
def now(): return datetime.now(TZ).isoformat(timespec='seconds')

SCHEMA='''
CREATE TABLE IF NOT EXISTS clinic_access (
 id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL REFERENCES providers(id),
 label TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
 permission TEXT NOT NULL CHECK(permission IN ('schedule_read','schedule_manage')),
 expires_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS clinic_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL,
 actor_key_id INTEGER NOT NULL, action TEXT NOT NULL, appointment_id INTEGER,
 created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic ON appointments(provider_id,visit_date,visit_time,status);
CREATE INDEX IF NOT EXISTS idx_clinic_audit_provider ON clinic_audit(provider_id,created_at);
'''

def install(c):
    c.executescript(SCHEMA)
    cols={r['name'] for r in c.execute('PRAGMA table_info(notifications)')}
    if 'event_type' not in cols:
        c.execute("ALTER TABLE notifications ADD COLUMN event_type TEXT NOT NULL DEFAULT 'booking_requested'")
    c.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_once ON notifications(appointment_id,channel,event_type)')
    # DB-enforced constraint: at most one *confirmed* booking at a given clinic/date/time.
    # Existing duplicate confirmed records could prevent migration; flag such records for review.
    conflict=c.execute("SELECT provider_id,visit_date,visit_time,COUNT(*) n FROM appointments WHERE status='confirmed' GROUP BY provider_id,visit_date,visit_time HAVING COUNT(*)>1 LIMIT 1").fetchone()
    if conflict:
        raise RuntimeError('중복 확정 예약이 발견되어 DB 업그레이드가 중단되었습니다. 관리자가 먼저 충돌을 해결해야 합니다.')
    c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_unique_confirmed ON appointments(provider_id,visit_date,visit_time) WHERE status='confirmed'")

def key_issue(c,provider_id,label,permission,secret):
    if not c.execute('SELECT 1 FROM providers WHERE id=?',(provider_id,)).fetchone():raise ValueError('기관 ID가 유효하지 않습니다')
    if permission not in ('schedule_read','schedule_manage'):raise ValueError('권한이 유효하지 않습니다')
    label=str(label or '예약 담당자').strip()[:80]
    token='mpclinic_'+secrets.token_urlsafe(32)
    digest=hmac.new(secret,token.encode(),'sha256').hexdigest()
    expiry=(datetime.now(TZ)+timedelta(days=30)).isoformat(timespec='seconds')
    cur=c.execute('INSERT INTO clinic_access(provider_id,label,token_hash,permission,expires_at,created_at) VALUES(?,?,?,?,?,?)',
                  (provider_id,label,digest,permission,expiry,now()))
    return {'id':cur.lastrowid,'token':token,'expires_at':expiry,'permission':permission,
            'warning':'비밀 키는 한 번만 표시됩니다. 상용 환경에서는 SSO/MFA·HTTPS·비밀관리 서비스 필요'}

def authenticate(c,auth,secret):
    if not auth.startswith('Bearer mpclinic_') or len(auth)>180:return None
    digest=hmac.new(secret,auth[7:].encode(),'sha256').hexdigest()
    r=c.execute('SELECT * FROM clinic_access WHERE token_hash=? AND revoked=0',(digest,)).fetchone()
    if not r:return None
    try:
        if datetime.fromisoformat(r['expires_at'])<=datetime.now(TZ):return None
    except ValueError:return None
    return dict(r)

def schedule(c,provider_id,start,end):
    for raw in (start,end):
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',raw):raise ValueError('날짜 형식은 YYYY-MM-DD')
    lo=date.fromisoformat(start);hi=date.fromisoformat(end)
    if not lo<=hi or (hi-lo).days>90:raise ValueError('조회 범위는 최대 90일')
    # No PII in responses: public booking reference only. Status is safe for staff role.
    return [{'id':r['id'],'public_id':r['public_id'],'date':r['visit_date'],'time':r['visit_time'],
             'status':r['status'],'title':'예약 '+r['public_id'][-6:]}
            for r in c.execute('''SELECT id,public_id,visit_date,visit_time,status FROM appointments
               WHERE provider_id=? AND visit_date BETWEEN ? AND ? ORDER BY visit_date,visit_time,id LIMIT 500''',(provider_id,start,end))]

def dashboard(c,provider_id):
    return {'provider_id':provider_id,'status_counts':{r['status']:r['n'] for r in c.execute(
        'SELECT status,count(*) n FROM appointments WHERE provider_id=? GROUP BY status',(provider_id,))},
        'pending_notifications':c.execute('''SELECT count(*) FROM notifications n JOIN appointments a ON a.id=n.appointment_id
                 WHERE a.provider_id=? AND n.state IN ('pending_configuration','retry')''',(provider_id,)).fetchone()[0],
        'notice':'가상 예약 포함, 실제 병원 확정 여부는 별도 확인 필요. 진료 정보·환자 실명 미표시'}

def transition(c,provider_id,actor_key_id,appointment_id,new_status):
    if new_status not in ('confirmed','declined','cancelled','completed'):raise ValueError('허용되지 않은 예약 상태')
    # Caller begins BEGIN IMMEDIATE. Plus unique partial index defends concurrent confirmations.
    row=c.execute('SELECT id,status FROM appointments WHERE id=? AND provider_id=?',(appointment_id,provider_id)).fetchone()
    if not row:raise LookupError('해당 의료기관의 예약을 찾을 수 없습니다')
    old=row['status']
    if old==new_status:return {'ok':True,'status':new_status,'unchanged':True}
    allowed={'requested':{'confirmed','declined','cancelled'},'confirmed':{'completed','cancelled'},
             'declined':set(),'cancelled':set(),'completed':set()}
    if new_status not in allowed.get(old,set()):raise ValueError('예약 상태 전이 규칙에 맞지 않습니다')
    try:
        c.execute('UPDATE appointments SET status=? WHERE id=? AND provider_id=?',(new_status,appointment_id,provider_id))
    except Exception as exc:
        if 'UNIQUE' in str(exc):raise ValueError('같은 날짜·시간에 이미 확정된 예약이 있습니다') from exc
        raise
    c.execute('INSERT INTO clinic_audit(provider_id,actor_key_id,action,appointment_id,created_at) VALUES(?,?,?,?,?)',
              (provider_id,actor_key_id,'status_'+new_status,appointment_id,now()))
    # Informational booking messages only, and never sent by this method.
    event={'confirmed':'booking_confirmed','cancelled':'booking_cancelled','declined':'booking_declined'}.get(new_status)
    if event:
        for channel in ('kakao','sms'):
            c.execute('INSERT OR IGNORE INTO notifications(appointment_id,channel,event_type,created_at) VALUES(?,?,?,?)',
                     (appointment_id,channel,event,now()))
    return {'ok':True,'status':new_status,'notification_queued':bool(event),'delivery':'not_sent'}

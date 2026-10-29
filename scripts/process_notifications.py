#!/usr/bin/env python3
"""Provider-specific integration seam. Safe mode does NOT send without HTTPS webhook/token.
Use an approved Kakao Alimtalk+SMS message provider with legally approved templates.
Run from Windows Task Scheduler/cron only after provider contract and consent audit.
"""
import sys,os,json,argparse,urllib.request,urllib.parse
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import db,init_db,SECRET
from privacy import decrypt

def process(dry_run=False):
    url=os.getenv('MEDIPICK_NOTIFICATION_WEBHOOK','');token=os.getenv('MEDIPICK_NOTIFICATION_TOKEN','')
    if not dry_run and (not url.startswith('https://') or not token):
        print('미설정: HTTPS 발송사 웹훅 및 토큰 필요. 실제 메시지 미발송.');return {'sent':0,'unconfigured':True}
    out={'sent':0,'failed':0,'pending':0}
    with db() as c:
        rows=c.execute('''SELECT n.*,a.public_id,a.visitor_name,a.phone,a.visit_date,a.visit_time,a.status,p.name provider_name
              FROM notifications n JOIN appointments a ON a.id=n.appointment_id JOIN providers p ON p.id=a.provider_id
              WHERE n.state IN ('pending_configuration','retry') AND n.attempts<3 ORDER BY n.id LIMIT 100''').fetchall()
        for row in rows:
            if dry_run:out['pending']+=1;continue
            # Provider endpoint must implement idempotency and approved Alimtalk template mapping.
            # Only send with provider-approved template codes supplied explicitly at runtime.
            # Names are not pre-approved by the platform and must NEVER be invented.
            event=row['event_type']
            template_env={'booking_requested':'MEDIPICK_TEMPLATE_BOOKING_REQUESTED',
                'booking_confirmed':'MEDIPICK_TEMPLATE_BOOKING_CONFIRMED',
                'booking_cancelled':'MEDIPICK_TEMPLATE_BOOKING_CANCELLED',
                'booking_declined':'MEDIPICK_TEMPLATE_BOOKING_DECLINED'}.get(event)
            template=os.getenv(template_env,'').strip() if template_env else ''
            if not template:
                out['pending']+=1
                continue
            body={'idempotency_key':'medipick-'+str(row['id']),'channel':row['channel'], 'phone':decrypt(row['phone'],SECRET),
                  'template':template,
                  'variables':{'booking_id':row['public_id'],'provider':row['provider_name'],
                        'date':row['visit_date'],'time':row['visit_time'],
                        'status':{'booking_requested':'예약 요청 접수 (미확정)',
                                  'booking_confirmed':'병원 확정',
                                  'booking_cancelled':'예약 취소',
                                  'booking_declined':'예약 요청 거절'}.get(row['event_type'],'상태 확인 필요')}}
            req=urllib.request.Request(url,data=json.dumps(body,ensure_ascii=False).encode(),method='POST',headers={
                'Content-Type':'application/json','Authorization':'Bearer '+token,'Idempotency-Key':body['idempotency_key']})
            try:
                with urllib.request.urlopen(req,timeout=10) as r:
                    if not 200<=r.status<300:raise ValueError('웹훅 응답 '+str(r.status))
                c.execute('UPDATE notifications SET state=?,attempts=attempts+1,last_error=? WHERE id=?',('submitted_to_provider','',row['id']));out['sent']+=1
            except Exception as e:
                # Do not log personal phone/name; only a generic provider error.
                c.execute('UPDATE notifications SET state=?,attempts=attempts+1,last_error=? WHERE id=?',('retry',type(e).__name__,row['id']));out['failed']+=1
    return out
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--dry-run',action='store_true');a=p.parse_args();init_db();print(process(a.dry_run))

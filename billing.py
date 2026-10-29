"""MEDIPICK Doctor Finance: offline internal claim-preparation and remittance ledger.
NOT an NHIS/HIRA-certified claim sender, tariff adjudicator or patient EMR.
Store ONLY non-identifying encounter references. No resident ID, names, diagnoses, treatment notes.
"""
from __future__ import annotations
import re, hmac, hashlib, secrets, zipfile, io, csv, html
from datetime import datetime, date, timedelta, timezone
from xml.sax.saxutils import escape

TZ = timezone(timedelta(hours=9))
SCHEMA = '''
CREATE TABLE IF NOT EXISTS doctor_access(id INTEGER PRIMARY KEY,provider_id INTEGER NOT NULL REFERENCES providers(id),label TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS fee_catalog(id INTEGER PRIMARY KEY,provider_id INTEGER NOT NULL REFERENCES providers(id),code TEXT NOT NULL,name TEXT NOT NULL,amount_won INTEGER NOT NULL CHECK(amount_won>=0),effective_from TEXT NOT NULL,effective_to TEXT NOT NULL DEFAULT '',source_url TEXT NOT NULL DEFAULT '',source_label TEXT NOT NULL DEFAULT '',demo INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL, UNIQUE(provider_id,code,effective_from));
CREATE TABLE IF NOT EXISTS billing_claims(id INTEGER PRIMARY KEY,provider_id INTEGER NOT NULL REFERENCES providers(id),claim_ref TEXT NOT NULL,encounter_ref TEXT NOT NULL,visit_date TEXT NOT NULL,service_type TEXT NOT NULL DEFAULT 'outpatient',patient_copay_won INTEGER NOT NULL DEFAULT 0,requested_won INTEGER NOT NULL DEFAULT 0,gross_won INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'draft',external_receipt TEXT NOT NULL DEFAULT '',submitted_at TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(provider_id,claim_ref),UNIQUE(provider_id,encounter_ref));
CREATE TABLE IF NOT EXISTS billing_lines(id INTEGER PRIMARY KEY,claim_id INTEGER NOT NULL REFERENCES billing_claims(id),fee_id INTEGER NOT NULL REFERENCES fee_catalog(id),code TEXT NOT NULL,name TEXT NOT NULL,amount_won INTEGER NOT NULL,quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 100),total_won INTEGER NOT NULL,source_label TEXT NOT NULL,source_url TEXT NOT NULL,demo INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS claim_reviews(id INTEGER PRIMARY KEY,claim_id INTEGER NOT NULL UNIQUE REFERENCES billing_claims(id),reviewed_won INTEGER NOT NULL CHECK(reviewed_won>=0),adjustment_reason TEXT NOT NULL DEFAULT '',notice_ref TEXT NOT NULL,reviewed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bank_deposits(id INTEGER PRIMARY KEY,provider_id INTEGER NOT NULL REFERENCES providers(id),bank_txn_ref TEXT NOT NULL,received_on TEXT NOT NULL,amount_won INTEGER NOT NULL CHECK(amount_won>0),memo TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,UNIQUE(provider_id,bank_txn_ref));
CREATE TABLE IF NOT EXISTS deposit_allocations(id INTEGER PRIMARY KEY,provider_id INTEGER NOT NULL REFERENCES providers(id),claim_id INTEGER NOT NULL REFERENCES billing_claims(id),deposit_id INTEGER NOT NULL REFERENCES bank_deposits(id),amount_won INTEGER NOT NULL CHECK(amount_won>0),created_at TEXT NOT NULL,UNIQUE(claim_id,deposit_id));
CREATE TABLE IF NOT EXISTS billing_audit(id INTEGER PRIMARY KEY,provider_id INTEGER NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,record_type TEXT NOT NULL,record_id INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_bill_claims_provider ON billing_claims(provider_id,status);
CREATE INDEX IF NOT EXISTS idx_bill_deposits_provider ON bank_deposits(provider_id);
'''

def now():return datetime.now(TZ).isoformat(timespec='seconds')
def error(msg):raise ValueError(msg)
def positive_int(v,name,allow_zero=True,maxv=10**12):
    if isinstance(v,bool) or not re.fullmatch(r'\d{1,13}',str(v)):error(name+'은(는) 원 단위 정수여야 합니다')
    n=int(v)
    if n>maxv or (not allow_zero and n==0):error(name+'의 범위가 올바르지 않습니다')
    return n

def clean(v,name,maxlen=140,required=False,pattern=None):
    s=str(v if v is not None else '').strip()
    if len(s)>maxlen or (required and not s):error(name+' 길이 또는 필수값 오류')
    if pattern and s and not re.fullmatch(pattern,s):error(name+' 형식 오류')
    return s

def is_date(s):
    v=clean(s,'날짜',10,True)
    if date.fromisoformat(v).isoformat()!=v:error('날짜는 YYYY-MM-DD')
    return v

def audit(c,pid,actor,action,typ,rid):
    c.execute('INSERT INTO billing_audit(provider_id,actor,action,record_type,record_id,created_at) VALUES(?,?,?,?,?,?)',(pid,actor,action,typ,rid,now()))

def install(c):
    c.executescript(SCHEMA)
    # Demonstration catalog is explicitly FAKE; never considered validated for actual claims.
    for pid, in c.execute("SELECT id FROM providers WHERE external_key LIKE 'demo-%' LIMIT 2").fetchall():
        for code,name,amount in [('DEMO-EXAM','가상 외래진찰 (실제 수가 아님)',23000),('DEMO-PROC','가상 처치 (실제 수가 아님)',37000)]:
            c.execute('INSERT OR IGNORE INTO fee_catalog(provider_id,code,name,amount_won,effective_from,source_label,demo,created_at) VALUES(?,?,?,?,?,?,1,?)',(pid,code,name,amount,'2026-01-01','가상 수가표 / 법적 청구 불가',now()))

def issue_key(c,pid,label,secret):
    if not c.execute('SELECT 1 FROM providers WHERE id=?',(pid,)).fetchone():error('의료기관 ID 오류')
    token='mpdoc_'+secrets.token_urlsafe(36)
    digest=hmac.new(secret,token.encode(),'sha256').hexdigest()
    expiry=(datetime.now(TZ)+timedelta(days=90)).isoformat(timespec='seconds')
    cur=c.execute('INSERT INTO doctor_access(provider_id,label,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)',(pid,clean(label,'담당자',80) or '병원 재무담당자',digest,expiry,now()))
    audit(c,pid,'admin','issue_key','doctor_access',cur.lastrowid)
    return {'id':cur.lastrowid,'token':token,'expires_at':expiry,'warning':'접근키는 한 번만 표시됩니다. 실제 운영에는 조직별 MFA/SSO, 키 회전, IP 제한 추가가 필요합니다.'}

def authenticate(c,header,secret):
    if not header.startswith('Bearer mpdoc_') or len(header)>180:return None
    digest=hmac.new(secret,header[7:].encode(),'sha256').hexdigest()
    r=c.execute('SELECT * FROM doctor_access WHERE token_hash=? AND revoked=0',(digest,)).fetchone()
    if not r:return None
    try:
        if datetime.fromisoformat(r['expires_at'])<=datetime.now(TZ):return None
    except ValueError:return None
    return dict(r)

def fee_list(c,pid):return [dict(x) for x in c.execute('SELECT * FROM fee_catalog WHERE provider_id=? ORDER BY code,effective_from DESC',(pid,))]

def add_fee(c,pid,key_id,data):
    code=clean(data.get('code'),'수가 코드',40,True,r'[A-Z0-9._-]{2,40}')
    name=clean(data.get('name'),'수가명',140,True)
    amount=positive_int(data.get('amount_won'),'수가금액',False,100_000_000)
    start=is_date(data.get('effective_from'))
    end=is_date(data.get('effective_to')) if data.get('effective_to') else ''
    if end and end<start:error('수가 유효 종료일은 시작일 이후여야 합니다')
    url=clean(data.get('source_url'),'출처 URL',500)
    if url and not re.fullmatch(r'https://[A-Za-z0-9.-]+(?::443)?(?:/[A-Za-z0-9._~!$&\x27()*+,;=:@%/?#-]*)?',url):error('출처는 https URL이어야 합니다')
    src=clean(data.get('source_label'),'수가 고시/버전',160,True)
    # No individual can toggle source as officially verified; authenticity must be checked outside this program.
    cur=c.execute('INSERT INTO fee_catalog(provider_id,code,name,amount_won,effective_from,effective_to,source_url,source_label,demo,created_at) VALUES(?,?,?,?,?,?,?,?,0,?)',(pid,code,name,amount,start,end,url,src,now()))
    audit(c,pid,str(key_id),'add_fee','fee_catalog',cur.lastrowid)
    return {'id':cur.lastrowid,'officially_verified':False,'warning':'등록 수가는 내부 참고용이며 법정 산정·고시 검증 완료를 의미하지 않습니다.'}

def list_claims(c,pid):
    rows=[]
    for x in c.execute('''SELECT b.*,r.reviewed_won,r.notice_ref,COALESCE((SELECT SUM(amount_won) FROM deposit_allocations WHERE claim_id=b.id),0) paid_won FROM billing_claims b LEFT JOIN claim_reviews r ON r.claim_id=b.id WHERE b.provider_id=? ORDER BY b.id DESC LIMIT 300''',(pid,)):
        d=dict(x);d['unpaid_won']=max(0,(d['reviewed_won'] if d['reviewed_won'] is not None else d['requested_won'])-d['paid_won']);rows.append(d)
    return rows

def add_claim(c,pid,key_id,data):
    encounter=clean(data.get('encounter_ref'),'비식별 방문참조',60,True,r'[A-Za-z0-9._-]{3,60}')
    # IDs are only random synthetic references; prohibit common Korean RRN/phone formats & long numeric data.
    if re.fullmatch(r'\d{6,}',encounter) or re.search(r'\d{6}-?\d{7}',encounter):error('주민번호/전화번호 또는 개인식별번호를 입력하지 마세요')
    visit=is_date(data.get('visit_date'))
    if visit>date.today().isoformat():error('미래 진료일을 청구 초안으로 작성할 수 없습니다')
    typ=clean(data.get('service_type','outpatient'),'진료유형',30)
    if typ not in ('outpatient','inpatient'):error('진료유형 오류')
    copay=positive_int(data.get('patient_copay_won',0),'본인부담금')
    lines=data.get('lines')
    if not isinstance(lines,list) or not 1<=len(lines)<=30:error('수가 항목 1~30개가 필요합니다')
    line_data=[];gross=0
    for row in lines:
        if not isinstance(row,dict):error('항목 형식 오류')
        code=clean(row.get('code'),'수가코드',40,True,r'[A-Z0-9._-]{2,40}')
        qty=positive_int(row.get('quantity',1),'수량',False,100)
        fee=c.execute('SELECT * FROM fee_catalog WHERE provider_id=? AND code=? AND effective_from<=? AND (effective_to="" OR effective_to>=?) ORDER BY effective_from DESC LIMIT 1',(pid,code,visit,visit)).fetchone()
        if not fee:error('해당 진료일에 적용할 수가가 없습니다: '+code)
        total=fee['amount_won']*qty
        gross+=total
        line_data.append((fee['id'],fee['code'],fee['name'],fee['amount_won'],qty,total,fee['source_label'],fee['source_url'],fee['demo']))
    if gross>10**12:error('청구액 한도 초과')
    if copay>gross:error('본인부담금이 총액을 초과합니다')
    req=gross-copay
    ref='SIM-'+secrets.token_hex(6).upper()
    cur=c.execute('INSERT INTO billing_claims(provider_id,claim_ref,encounter_ref,visit_date,service_type,patient_copay_won,requested_won,gross_won,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',(pid,ref,encounter,visit,typ,copay,req,gross,now(),now()))
    for line in line_data:c.execute('INSERT INTO billing_lines(claim_id,fee_id,code,name,amount_won,quantity,total_won,source_label,source_url,demo) VALUES(?,?,?,?,?,?,?,?,?,?)',(cur.lastrowid,*line))
    audit(c,pid,str(key_id),'create_draft','billing_claims',cur.lastrowid)
    return {'id':cur.lastrowid,'claim_ref':ref,'status':'draft','gross_won':gross,'requested_won':req,'warning':'가상 참조 및 수동 본인부담금으로 계산한 내부 초안입니다. 공식 보험 청구서나 지급예측이 아닙니다.'}

def claim(c,pid,cid):
    r=c.execute('SELECT * FROM billing_claims WHERE provider_id=? AND id=?',(pid,cid)).fetchone()
    if not r:error('해당 기관의 청구 초안이 없습니다')
    return dict(r)

def preflight(c,pid,cid):
    b=claim(c,pid,cid)
    lines=[dict(x) for x in c.execute('SELECT * FROM billing_lines WHERE claim_id=?',(cid,))]
    blockers=[];warnings=[]
    if not lines:blockers.append('진료행위 항목이 없습니다')
    if any(x['demo'] for x in lines):blockers.append('가상 수가(DEMO)가 포함되어 내부 제출준비를 통과할 수 없습니다')
    if any(not x['source_url'] for x in lines):warnings.append('원 고시 출처 URL이 없는 수가가 있습니다. 외부 원문 대조가 필요합니다')
    if b['patient_copay_won']>b['gross_won']:blockers.append('본인부담금 초과')
    if sum(x['total_won'] for x in lines)!=b['gross_won']:blockers.append('수가 합계 불일치')
    warnings.extend(['본인부담금·산정특례·가산·횟수 제한·상병 적합성은 자동 검증하지 않습니다', '실제 전송 전 공인 EMR 및 심평원 진료비청구포털의 공식 사전점검이 필요합니다'])
    return {'claim_id':cid,'can_prepare':not blockers,'blockers':blockers,'warnings':warnings,'check_type':'internal_structural_only','hira_validated':False}

def prepare(c,pid,key_id,cid):
    b=claim(c,pid,cid)
    if b['status']!='draft':error('초안만 내부 사전점검 상태로 변경할 수 있습니다')
    test=preflight(c,pid,cid)
    if not test['can_prepare']:error('사전점검 실패: '+' / '.join(test['blockers']))
    c.execute('UPDATE billing_claims SET status=?,updated_at=? WHERE id=?',('prepared_internal',now(),cid))
    audit(c,pid,str(key_id),'prepare_internal','billing_claims',cid)
    return {'status':'prepared_internal',**test,'warning':'심평원 사전점검 통과나 제출 완료를 의미하지 않습니다'}

def record_submission(c,pid,key_id,cid,data):
    b=claim(c,pid,cid)
    if b['status']!='prepared_internal':error('내부점검을 마친 청구만 외부 접수 기록을 남길 수 있습니다')
    if data.get('confirm_external') is not True:error('공식 포털에서 별도 제출했다는 확인이 필요합니다')
    receipt=clean(data.get('portal_receipt'),'포털 접수번호',100,True,r'[\w./-]{4,100}')
    c.execute('UPDATE billing_claims SET status=?,external_receipt=?,submitted_at=?,updated_at=? WHERE id=?',('external_recorded',receipt,now(),now(),cid))
    audit(c,pid,str(key_id),'record_external_submitted_manually','billing_claims',cid)
    return {'status':'external_recorded','portal_receipt':receipt,'hira_transmitted_by_medipick':False}

def record_review(c,pid,key_id,cid,data):
    b=claim(c,pid,cid)
    if b['status'] not in ('external_recorded','reviewed'):error('외부 접수 기록이 있는 청구만 심사결과를 등록할 수 있습니다')
    amt=positive_int(data.get('reviewed_won'),'심사인정액')
    if amt>b['requested_won']:error('심사인정액이 청구요청액을 초과합니다. 별도 수기 조정 검토 필요')
    already=c.execute('SELECT COALESCE(SUM(amount_won),0) FROM deposit_allocations WHERE claim_id=?',(cid,)).fetchone()[0]
    if amt<already:error('이미 대사된 입금액보다 인정액이 적습니다')
    notice=clean(data.get('notice_ref'),'심사통보서 번호',120,True)
    reason=clean(data.get('adjustment_reason'),'조정사유',300)
    c.execute('INSERT INTO claim_reviews(claim_id,reviewed_won,adjustment_reason,notice_ref,reviewed_at) VALUES(?,?,?,?,?) ON CONFLICT(claim_id) DO UPDATE SET reviewed_won=excluded.reviewed_won,adjustment_reason=excluded.adjustment_reason,notice_ref=excluded.notice_ref,reviewed_at=excluded.reviewed_at',(cid,amt,reason,notice,now()))
    c.execute('UPDATE billing_claims SET status=?,updated_at=? WHERE id=?',('reviewed',now(),cid))
    audit(c,pid,str(key_id),'review_manually_recorded','billing_claims',cid)
    return {'status':'reviewed','reviewed_won':amt,'adjusted_won':b['requested_won']-amt,'note':'공식 심사통보서 원문을 검증하지 않은 수동 입력입니다.'}

def deposits(c,pid):
    return [dict(r) for r in c.execute('SELECT b.*,COALESCE((SELECT SUM(amount_won) FROM deposit_allocations WHERE deposit_id=b.id),0) allocated_won FROM bank_deposits b WHERE b.provider_id=? ORDER BY b.id DESC',(pid,))]

def add_deposit(c,pid,key_id,data):
    ref=clean(data.get('bank_txn_ref'),'은행 거래참조번호',100,True,r'[A-Za-z0-9._-]{3,100}')
    d=is_date(data.get('received_on'))
    if d>date.today().isoformat():error('미래 입금일 오류')
    amount=positive_int(data.get('amount_won'),'입금액',False)
    memo=clean(data.get('memo'),'메모',160)
    cur=c.execute('INSERT INTO bank_deposits(provider_id,bank_txn_ref,received_on,amount_won,memo,created_at) VALUES(?,?,?,?,?,?)',(pid,ref,d,amount,memo,now()))
    audit(c,pid,str(key_id),'record_bank_deposit','bank_deposits',cur.lastrowid)
    return {'id':cur.lastrowid,'note':'은행 자동조회 없이 담당자가 수동 입력한 통장 장부입니다.'}

def allocate(c,pid,key_id,data):
    cid=positive_int(data.get('claim_id'),'청구 ID',False)
    did=positive_int(data.get('deposit_id'),'입금 ID',False)
    amount=positive_int(data.get('amount_won'),'배분액',False)
    b=claim(c,pid,cid)
    d=c.execute('SELECT * FROM bank_deposits WHERE id=? AND provider_id=?',(did,pid)).fetchone()
    if not d:error('해당 기관의 통장 거래가 없습니다')
    if b['status'] not in ('reviewed','closed'):error('심사결과 기록 후 대사할 수 있습니다')
    r=c.execute('SELECT reviewed_won FROM claim_reviews WHERE claim_id=?',(cid,)).fetchone()
    if not r:error('심사결과 누락')
    claim_sum=c.execute('SELECT COALESCE(SUM(amount_won),0) FROM deposit_allocations WHERE claim_id=?',(cid,)).fetchone()[0]
    deposit_sum=c.execute('SELECT COALESCE(SUM(amount_won),0) FROM deposit_allocations WHERE deposit_id=?',(did,)).fetchone()[0]
    if claim_sum+amount>r['reviewed_won']:error('배분액이 심사 인정액을 초과합니다')
    if deposit_sum+amount>d['amount_won']:error('배분액이 통장 입금액을 초과합니다')
    cur=c.execute('INSERT INTO deposit_allocations(provider_id,claim_id,deposit_id,amount_won,created_at) VALUES(?,?,?,?,?)',(pid,cid,did,amount,now()))
    settled=claim_sum+amount==r['reviewed_won']
    if settled:c.execute('UPDATE billing_claims SET status=?,updated_at=? WHERE id=?',('closed',now(),cid))
    audit(c,pid,str(key_id),'allocate_deposit','deposit_allocations',cur.lastrowid)
    return {'ok':True,'claim_fully_reconciled':settled,'unpaid_won':r['reviewed_won']-claim_sum-amount,'deposit_unallocated_won':d['amount_won']-deposit_sum-amount}

def dashboard(c,pid):
    claims=list_claims(c,pid);dep=deposits(c,pid)
    ads=c.execute("SELECT count(*) FROM events WHERE provider_id=? AND kind='ad_click'",(pid,)).fetchone()[0]
    articles=c.execute('SELECT count(*) FROM content WHERE provider_id=? AND approved=1',(pid,)).fetchone()[0]
    return {'claims_count':len(claims),'drafts':sum(x['status']=='draft' for x in claims),'internal_prepared':sum(x['status']=='prepared_internal' for x in claims),
        'requested_won':sum(x['requested_won'] for x in claims),'reviewed_won':sum(x['reviewed_won'] or 0 for x in claims),'paid_allocated_won':sum(x['paid_won'] for x in claims),
        'outstanding_reviewed_won':sum(max(0,x['reviewed_won']-x['paid_won']) for x in claims if x['reviewed_won'] is not None),
        'bank_deposited_won':sum(x['amount_won'] for x in dep),'bank_unallocated_won':sum(x['amount_won']-x['allocated_won'] for x in dep),
        'content_count':articles,'ad_clicks':ads,'claims':claims[:100], 'deposits':dep[:100],
        'notice':'청구·심사·입금 금액은 사용자 입력 및 시연 자료입니다. 심평원 청구나 공단 지급을 자동 확인하지 않습니다.'}

def audit_list(c,pid):return [dict(x) for x in c.execute('SELECT * FROM billing_audit WHERE provider_id=? ORDER BY id DESC LIMIT 150',(pid,))]

def excel_safe(val):
    s=str(val if val is not None else '')
    if s.startswith(('=','+','-','@','\t','\r','\n')):s="'"+s
    return s.replace('\x00','')[:500]

def export_xlsx(c,pid):
    """Minimal valid Office Open XML writer; stdlib only so Windows users need no pip packages."""
    claims=list_claims(c,pid);dep=deposits(c,pid);summ=dashboard(c,pid)
    prov=c.execute('SELECT name FROM providers WHERE id=?',(pid,)).fetchone()['name']
    reviews=[dict(x) for x in c.execute('SELECT b.claim_ref,r.reviewed_won,r.adjustment_reason,r.notice_ref,r.reviewed_at FROM claim_reviews r JOIN billing_claims b ON b.id=r.claim_id WHERE b.provider_id=?',(pid,))]
    items=[('요약',[['MEDIPICK DOCTOR FINANCE · 내부 관리용 / 공식 청구서 아님'],['의료기관',prov],['내보낸 시각',now()],['청구 건수',summ['claims_count']],['청구 요청액(원)',summ['requested_won']],['심사 인정액(원)',summ['reviewed_won']],['입금 대사액(원)',summ['paid_allocated_won']],['심사 기준 미수금(원)',summ['outstanding_reviewed_won']],['통장 미배분액(원)',summ['bank_unallocated_won']],['주의','공식 청구·수가 검증·지급 자동수신 미구현']]),
    ('청구초안',[['청구참조','방문참조(비식별)','진료일','상태','총액(원)','본인부담 입력(원)','보험자 청구예상(원)','심사 인정 입력(원)','대사 입금(원)','미수액(원)','외부포털 접수참조']]+[[x[k] for k in ['claim_ref','encounter_ref','visit_date','status','gross_won','patient_copay_won','requested_won','reviewed_won','paid_won','unpaid_won','external_receipt']] for x in claims]),
    ('심사통보_수동기록',[['청구참조','심사 인정액(원)','조정 사유','통보서 참조','기록시각']]+[[x[k] for k in ['claim_ref','reviewed_won','adjustment_reason','notice_ref','reviewed_at']] for x in reviews]),
    ('통장장부',[['거래참조','입금일','입금(원)','대사배분액(원)','미배분액(원)','메모']]+[[x['bank_txn_ref'],x['received_on'],x['amount_won'],x['allocated_won'],x['amount_won']-x['allocated_won'],x['memo']] for x in dep]),
    ('감사기록',[['시각','행위','대상유형','대상ID','접근키ID']]+[[x[k] for k in ('created_at','action','record_type','record_id','actor')] for x in audit_list(c,pid)])]
    def xcell(v,r,ci):
        alphabet='';x=ci
        while x:x,rem=divmod(x-1,26);alphabet=chr(65+rem)+alphabet
        addr=f'{alphabet}{r}'
        if isinstance(v,int):return f'<c r="{addr}" s="2"><v>{v}</v></c>'
        return f'<c r="{addr}" s="{1 if r==1 else 0}" t="inlineStr"><is><t>{escape(excel_safe(v))}</t></is></c>'
    sheets=[]
    for name,rows in items:
        data=''.join(f'<row r="{ri}">'+''.join(xcell(v,ri,ci) for ci,v in enumerate(row,1))+'</row>' for ri,row in enumerate(rows,1))
        sheet=f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="12" width="23" customWidth="1"/></cols><sheetData>{data}</sheetData></worksheet>'
        sheets.append((name,sheet))
    ct=''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1,len(sheets)+1))
    cts=f'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>{ct}</Types>'
    wk='<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join(f'<sheet name="{escape(n)}" sheetId="{i}" r:id="rId{i}"/>' for i,(n,_) in enumerate(sheets,1))+'</sheets></workbook>'
    rel='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1,len(sheets)+1))+f'<Relationship Id="rId{len(sheets)+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
    styles='<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Malgun Gothic"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Malgun Gothic"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF006D69"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>'
    f=io.BytesIO()
    with zipfile.ZipFile(f,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml',cts);z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        z.writestr('xl/workbook.xml',wk);z.writestr('xl/_rels/workbook.xml.rels',rel);z.writestr('xl/styles.xml',styles)
        for i,(_,body) in enumerate(sheets,1):z.writestr(f'xl/worksheets/sheet{i}.xml',body)
    return f.getvalue()

#!/usr/bin/env python3
"""HIRA/Pharmacy public data ingestion. Uses approved public API key; no scraping.
Examples:
  python scripts/import_public.py --csv hospitals.csv --kind hospital
  DATA_GO_KR_SERVICE_KEY=... python scripts/import_public.py --api hospital --pages 3
  DATA_GO_KR_SERVICE_KEY=... python scripts/import_public.py --api pharmacy --pages 3
"""
import sys, csv, io, re, os, argparse, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import db, init_db, now
HOSPITAL_API='https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList'
PHARMACY_API='https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire'

def get(item,*names):
    for name in names:
        val=item.get(name)
        if val and str(val).strip():return str(val).strip()
    return ''

def specialty(kind,name,raw=''):
    if kind=='pharmacy':return '약국'
    for key in ('피부과','성형외과','정형외과','치과','산부인과','소아청소년과','이비인후과','정신건강의학과','안과','내과'):
        if key in (raw+' '+name):return key
    if '건강검진' in raw:return '건강검진'
    return '내과' if '내과' in name else '전체'

def district_from_addr(addr):
    parts=addr.split()
    return (parts[1] if len(parts)>1 else '')[:50]

def region_from_addr(addr):
    parts=addr.split()
    if not parts:return '전국'
    word=parts[0]
    mapping={'서울':'서울','경기':'경기','인천':'인천','부산':'부산','대구':'대구','대전':'대전','광주':'광주','울산':'울산','세종':'세종','강원':'강원','충청북':'충북','충청남':'충남','전북':'전북','전남':'전남','경북':'경북','경남':'경남','제주':'제주'}
    return next((v for k,v in mapping.items() if word.startswith(k)),word[:30])

def normalize(item,kind):
    name=get(item,'yadmNm','dutyName','기관명','요양기관명','병원명','약국명','상호명','사업장명')
    address=get(item,'addr','dutyAddr','주소','소재지주소','도로명주소','주소(도로명)')
    phone=get(item,'telno','dutyTel1','전화번호','전화번호1','대표전화')
    ident=get(item,'ykiho','hpid','기관기호','요양기호','암호화요양기호')
    if not name or not address:return None
    category=specialty(kind,name,get(item,'clCdNm','종별코드명','진료과목','specialty','진료과'))
    key=kind+':'+(ident if ident else name+'|'+address)
    return {'external_key':key[:255],'name':name[:120],'category':category,'kind':('약국' if kind=='pharmacy' else get(item,'clCdNm','종별코드명') or '의료기관'),
            'region':region_from_addr(address),'district':district_from_addr(address),'address':address[:200],'phone':phone[:40],
            'source': 'HIRA 병원정보서비스' if kind=='hospital' else '국립중앙의료원 전국 약국 정보', 'specialties':get(item,'진료과목')[:200],
            'description':'공공데이터 기반 기관 정보. 진료 가능 분야와 실제 운영시간은 해당 기관에 확인 바랍니다.',
            'verified':0, 'night':0, 'updated_at':now()}

def upsert(rows,kind):
    added=updated=skipped=0
    with db() as c:
        for item in rows:
            row=normalize(item,kind)
            if row is None:skipped+=1;continue
            existing=c.execute('SELECT id FROM providers WHERE external_key=?',(row['external_key'],)).fetchone()
            if existing:
                c.execute('UPDATE providers SET name=:name,category=:category,kind=:kind,region=:region,district=:district,address=:address,phone=:phone,source=:source,updated_at=:updated_at WHERE external_key=:external_key',row)
                updated+=1
            else:
                c.execute('''INSERT INTO providers(external_key,name,category,kind,region,district,address,phone,source,specialties,description,verified,night,updated_at)
                    VALUES(:external_key,:name,:category,:kind,:region,:district,:address,:phone,:source,:specialties,:description,:verified,:night,:updated_at)''',row)
                added+=1
    return {'added':added,'updated':updated,'skipped':skipped}

def csv_rows(path):
    data=Path(path).read_bytes()
    for enc in ['utf-8-sig','cp949','euc-kr']:
        try:text=data.decode(enc);break
        except UnicodeDecodeError:continue
    else:raise ValueError('CSV 인코딩 지원 안 됨')
    return list(csv.DictReader(io.StringIO(text)))

def xml_rows(payload):
    root=ET.fromstring(payload)
    code=root.findtext('.//resultCode')
    if code is not None and code not in ('00','0'):
        raise RuntimeError('공공데이터 API 오류 '+code+' '+(root.findtext('.//resultMsg') or ''))
    return [{child.tag:(child.text or '') for child in element} for element in root.findall('.//items/item')]

def api_rows(kind,pages=1,num=100):
    key=os.environ.get('DATA_GO_KR_SERVICE_KEY','')
    if not key:raise SystemExit('DATA_GO_KR_SERVICE_KEY가 필요합니다. data.go.kr API 활용신청/승인을 먼저 완료하세요.')
    url=HOSPITAL_API if kind=='hospital' else PHARMACY_API
    for page in range(1,pages+1):
        args={'serviceKey':key,'pageNo':str(page),'numOfRows':str(num)}
        req=urllib.request.Request(url+'?'+urllib.parse.urlencode(args),headers={'User-Agent':'MEDIPICK/1.0 medical directory integration'})
        with urllib.request.urlopen(req,timeout=20) as resp:payload=resp.read(2_000_000)
        items=xml_rows(payload)
        if not items:break
        print('공식 API %s / %s페이지: %s건'%(kind,page,len(items)))
        for item in items:yield item

def main():
    p=argparse.ArgumentParser(description='MEDIPICK 공개 병원/약국 데이터 수집')
    src=p.add_mutually_exclusive_group(required=True);src.add_argument('--csv',help='CSV 파일 경로');src.add_argument('--api',choices=['hospital','pharmacy'])
    p.add_argument('--kind',choices=['hospital','pharmacy'],default='hospital');p.add_argument('--pages',type=int,default=3);p.add_argument('--per-page',type=int,default=100)
    args=p.parse_args();init_db()
    if args.csv:result=upsert(csv_rows(args.csv),args.kind)
    else:result=upsert(api_rows(args.api,max(1,args.pages),min(max(1,args.per_page),1000)),args.api)
    print('완료: ',result,' — 의료진 자격/심야 운영 여부는 별도 검증이 필요합니다.')
if __name__=='__main__':main()

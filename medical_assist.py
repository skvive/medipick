"""MEDIPICK v3.1 multimodal information assistant, not diagnostic software.
Photographs never persisted; when enabled they are forwarded on explicit consent
only to configured multimodal provider. Sponsored choices are segregated.
"""
import os, io, re, json, base64, urllib.request, urllib.error
from PIL import Image, UnidentifiedImageError
import premium

MAX_IMAGE_BYTES = 1_500_000
MAX_PIXELS = 4_000_000
EMERGENCY = ('가슴 통증','가슴통증','흉통','의식 저하','의식저하','호흡곤란','숨이 안','숨을 못','마비','말이 어눌','한쪽 팔','한쪽 다리','대량 출혈','과다출혈','자살','죽고 싶','극심한 두통','경련','입술이 파랗','아나필락시스')
CATEGORIES = {
 '피부과':('피부','두드러기','발진','여드름','가려','점','습진','붉은 반점','탈모','발톱'),
 '안과':('눈','시야','시력','안구','각막'),
 '이비인후과':('목','귀','코','인후','비염','이명'),
 '정형외과':('관절','무릎','허리','손목','발목','골절','근육','어깨'),
 '내과':('배','복통','두통','어지러','기침','열','발열','혈압','당뇨','가슴'),
 '소아청소년과':('아기','아이','유아','영아','소아'),
 '치과':('치아','잇몸','이빨','치통'),
 '산부인과':('생리','임신','질염','산부인과'),
 '정신건강의학과':('불안','공황','우울','스트레스'),
 '성형외과':('성형','흉터 수술','재건'),
}

def sanitize_image(data_url):
    if not data_url:return None
    if not isinstance(data_url,str) or len(data_url)>MAX_IMAGE_BYTES*2:raise ValueError('사진 크기가 너무 큽니다 (최대 1.5MB)')
    match=re.fullmatch(r'data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)',data_url)
    if not match:raise ValueError('JPEG, PNG, WebP 사진만 업로드하세요')
    try:raw=base64.b64decode(match.group(2),validate=True)
    except (ValueError,base64.binascii.Error):raise ValueError('사진 데이터 오류')
    if len(raw)>MAX_IMAGE_BYTES:raise ValueError('이미지 크기가 제한을 초과합니다')
    try:
        with Image.open(io.BytesIO(raw)) as im:
            if im.format not in ('JPEG','PNG','WEBP') or im.width*im.height>MAX_PIXELS:raise ValueError('이미지 형식 또는 해상도 제한 초과')
            im.verify()
        with Image.open(io.BytesIO(raw)) as im:
            im=im.convert('RGB');im.thumbnail((1440,1440))
            buffer=io.BytesIO();im.save(buffer,format='JPEG',quality=82,optimize=True)
            clean=buffer.getvalue()
    except (UnidentifiedImageError, OSError, ValueError) as e:raise ValueError('정상적인 이미지 파일이 아닙니다: '+str(e)[:80])
    return 'data:image/jpeg;base64,'+base64.b64encode(clean).decode()

def intent(text, category=''):
    content=text.lower()
    if category in CATEGORIES:return category
    for specialty,terms in CATEGORIES.items():
        if any(t in content for t in terms):return specialty
    return '내과'

def vision_analysis(question,image,history=None):
    key=os.environ.get('OPENAI_API_KEY','')
    if not key:return None,'API 키 미설정: 사진을 분석하지 않았습니다.'
    previous=[]
    for item in (history or [])[-4:]:
        if isinstance(item,dict) and item.get('role')=='user' and isinstance(item.get('text'),str):
            previous.append(item['text'][:160])
    prompt=('이전 질문 요약(사용자 작성): '+ ' / '.join(previous) + '\n현재 질문: ' + question) if previous else question
    parts=[{'type':'input_text','text':prompt}]
    if image:parts.append({'type':'input_image','image_url':image,'detail':'low'})
    request={'model':os.environ.get('MEDIPICK_VISION_MODEL','gpt-5.4-mini'),'instructions':(
      '당신은 한국어 의료정보 안내자이며 의사가 아니다. 사진이나 증상만으로 특정 질병을 확진하거나 가능성 점수, 확실한 진단명, 약물 처방을 제시하지 마라. '
      '사진에서 관찰 가능한 비진단적 외형을 조심스럽게 묘사할 수 있지만 확정적 판단은 피한다. '
      '일반적인 가능 원인 2~3개와 반드시 의료진이 확인할 질문, 응급 징후, 적절한 진료과, 자가관리 주의사항을 간결히 제공. '
      '눈에 보이지 않는 정보, 병명 확정, 특정 병원/광고 추천, 의료광고 내용은 생성하지 않는다. '
      '응급 징후가 있으면 119/응급실을 최우선으로 안내. 사진에 개인정보나 얼굴이 포함될 수 있음을 인지하고 재출력하지 않는다.'),
      'input':[{'role':'user','content':parts}], 'max_output_tokens':450,'store':False}
    req=urllib.request.Request('https://api.openai.com/v1/responses',data=json.dumps(request,ensure_ascii=False).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(req,timeout=18) as resp:r=json.load(resp)
        texts=[block.get('text','') for item in r.get('output',[]) for block in item.get('content',[]) if block.get('type')=='output_text']
        result='\n'.join(texts).strip()[:2500]
        if not result:raise ValueError('모델에서 답변이 반환되지 않았습니다')
        return result,None
    except Exception:
        return None,'외부 AI 분석에 실패했습니다. 원본 사진은 메디픽에 저장되지 않았습니다.'

def respond(c,data,provider_query):
    question=data.get('question','')
    if not isinstance(question,str) or not 3<=len(question.strip())<=700:raise ValueError('질문은 3~700자 사이로 입력하세요')
    photo=bool(data.get('image'))
    if photo and data.get('sensitive_consent') is not True:raise ValueError('사진 분석은 민감정보 및 외부 분석 동의가 필요합니다')
    img=sanitize_image(data.get('image')) if photo else None
    text=question.strip()
    urgent=any(w in text.lower() for w in EMERGENCY)
    specialty=intent(text,data.get('category',''))
    region=str(data.get('region',''))[:40]
    model_text=None;issue=None
    if urgent:
        model_text='응급 징후가 의심될 수 있습니다. 지금 바로 119 또는 가까운 응급실에 연락하세요. 광고 병원 검색보다 즉각적인 평가가 우선입니다.'
        issue='응급 분기: 사진 및 외부 AI 분석을 수행하지 않았습니다.'
    elif img or (data.get('sensitive_consent') is True and os.environ.get('MEDIPICK_VISION_TEXT_ENABLED')=='1'):
        model_text,issue=vision_analysis(text,img,data.get('history',[]))
    if not model_text:
        model_text=(f'말씀하신 증상은 여러 원인에서 나타날 수 있으며, 사진 또는 질문만으로 병명을 확진할 수 없습니다. '
                   f'{specialty}에서 증상이 시작된 시점, 지속 시간, 악화 요인, 발열·통증 여부를 확인해 보세요. '
                   '증상이 빠르게 악화하거나 숨쉬기 어렵고 의식 변화·심한 출혈이 있으면 즉시 119에 연락하세요.')
    result={'message':model_text,'category':specialty,'emergency':urgent,'image_received':photo,
            'image_analyzed':bool(img and not issue),'model_mode':'multimodal' if img and not issue else 'safety_information',
            'model_notice':issue or 'AI가 제공한 일반 의료정보는 진단·처방·검사가 아닙니다.',
            'privacy':'이미지는 메디픽 서버 DB·로그에 저장하지 않습니다. 외부 AI 사용을 허용한 경우 전송될 수 있습니다.',
            'disclaimer':'증상 상담은 전문 의료진의 진료를 대체하지 않습니다. 스폰서 노출은 치료 적합성·효과 순위가 아닙니다.',
            'sponsored':[],'other_providers':[]}
    if urgent:return result
    rows=provider_query(c,specialty,region,'',False)
    pool=[]
    for p in rows:
        r=dict(p)
        if r['category']!=specialty:continue
        active_ads=c.execute('SELECT * FROM ads WHERE provider_id=? AND approved=1 AND active=1 ORDER BY priority DESC LIMIT 1',(r['id'],)).fetchone()
        subscribed=premium.is_subscribed(c,r['id'])
        r={'id':r['id'],'name':r['name'],'category':r['category'],'region':r['region'],'district':r['district'],
           'address':r['address'],'phone':r['phone'],'website':r['website'],'verified':bool(r['verified']),
           'ad_label':'광고·스폰서' if subscribed and active_ads else None,'paid':bool(subscribed and active_ads),
           'priority':active_ads['priority'] if active_ads else 0,
           'verification_notice':'공식 전문의 확인 여부는 병원 상세페이지의 검증 상태를 참조하세요.'}
        pool.append(r)
    sponsors=[p for p in pool if p['paid']]
    sponsors.sort(key=lambda x:(-x['priority'],x['name']))
    result['sponsored']=sponsors[:5]
    result['other_providers']=[p for p in pool if not p['paid']][:6]
    result['ranking_explanation']='광고 계약 유효, 콘텐츠 광고 승인, 진료과 일치 조건을 만족한 제휴 기관만 광고 선배치. 의료적 우수성 순위가 아닙니다.'
    return result

"""Controlled, source-grounded informational summaries for MEDIPICK.
No diagnosis, no automatic model-based hospital ranking, no sensitive patient data storage.
External LLM is opt-in PER REQUEST, requires OPENAI_API_KEY.
"""
import os,json,urllib.request,urllib.error
from server import match_intent,provider_query
from premium import sponsor_matches

def retrieve(c,query,category):
    selected=category if category and category!='전체' else match_intent(query)['category']
    items=provider_query(c,selected,'',query,False)[:6]
    ids=[x['id'] for x in items]
    content=[]
    if ids:
        marks=','.join('?' for _ in ids)
        content=[dict(r) for r in c.execute('SELECT id,provider_id,title,summary,url,evidence_url,author_label,kind,category FROM content WHERE approved=1 AND provider_id IN ('+marks+') ORDER BY editorial_priority DESC LIMIT 12',ids)]
    # Generic category knowledge is allowed, but only cite the exact approved source URLs.
    sources=[{'id':'C'+str(x['id']),'title':x['title'],'url':x['url'] or x['evidence_url'],'source_type':'editorial'} for x in content]
    return items,content,sources

def answer(c,query,category='',external_consent=False):
    query=query.strip()[:160]
    if len(query)<2:raise ValueError('검색 문장을 입력하세요')
    providers,content,sources=retrieve(c,query,category)
    category=category if category and category!='전체' else match_intent(query)['category'] or '전체'
    premium_cards=sponsor_matches(c,providers,category)
    base={'mode':'local','category':category,'sources':sources,'sponsored':premium_cards,'external_used':False,
          'sponsor_notice':'상단 스폰서는 광고 계약 및 관련성에 따른 노출이며 의료의 질·효능·의사 실력 순위가 아닙니다.',
          'disclaimer':'의료적인 진단·처방을 제공하지 않습니다. 응급 상황은 119에 연락하세요. 정보의 출처와 갱신일을 직접 확인하세요.'}
    if not providers and not content:
        return {**base,'text':'현재 승인된 편집자료 중 관련 근거자료를 찾지 못했습니다. 다른 진료과 또는 지역으로 다시 검색하거나 공식 의료기관 정보를 확인하세요.'}
    base['text']=f'[{category}] 관련 기관 {len(providers)}곳과 승인된 콘텐츠 {len(content)}건이 검색되었습니다. 진료과목·전문의 자격 검증 상태·원문 출처를 먼저 확인하고 방문 전 진료 가능 여부를 문의하세요.'
    if content:base['text']+=' 연결된 정보: '+ ' / '.join(x['title'][:50] for x in content[:3])+'.'
    # Explicit consent is required before any search query is shared with an external model.
    if not external_consent or not os.getenv('OPENAI_API_KEY'):return base
    # Suppress obvious personal identifiers prior to forwarding. Free-form sensitive health data
    # still requires an upstream privacy assessment before deploying for real users.
    import re
    if re.search(r'01[016789][\s-]?\d{3,4}[\s-]?\d{4}|\S+@\S+\.\S+',query):
        return {**base,'text':'개인 연락처 등 식별정보가 포함되어 외부 AI로 전송하지 않았습니다. 개인정보를 제거하고 다시 시도하세요. '+base['text']}
    bundle=[{'ref':'C'+str(x['id']),'title':x['title'],'summary':x['summary'][:500],
             'url':x['url'] or x['evidence_url']} for x in content[:8]]
    prompt='''너는 한국 의료정보 탐색 보조 도구다. 제공된 자료 이외의 기관·의사 정보나 치료효과를 만들어내지 마라.
의학적 진단·개별 치료 추천·수술 선택을 결정하지 않는다. 광고 노출·유료순위를 임상 품질의 증거로 삼지 않는다.
자료 출처가 불충분하면 불충분하다고 밝힌다. 모든 사실 문장은 제공된 근거자료 식별자 [C번호]를 붙여라.
자료가 데모이거나 임상 근거가 없으면 의료적 결론을 말하지 말고 검색 방법·확인사항 위주로 안내하라.
답변은 한국어로 300자 이내, 친절하고 중립적으로. 긴급증상에는 119 안내. 요청 원문과 승인 자료:
'''
    payload={'model':os.getenv('MEDIPICK_AI_MODEL','gpt-5.1'),'instructions':prompt,
        'input':json.dumps({'query':query,'approved_content':bundle},ensure_ascii=False),
        'max_output_tokens':430,'store':False}
    req=urllib.request.Request('https://api.openai.com/v1/responses',data=json.dumps(payload).encode('utf-8'),method='POST',headers={
        'Authorization':'Bearer '+os.environ['OPENAI_API_KEY'],'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=16) as res:data=json.loads(res.read(1_500_000))
        text=''.join(y.get('text','') for o in data.get('output',[]) for y in o.get('content',[]) if y.get('type')=='output_text')
        if not text:return {**base,'notice':'외부 AI가 텍스트 답변을 반환하지 않았습니다.'}
        return {**base,'mode':'grounded_llm','external_used':True,'text':text[:1100]}
    except (urllib.error.URLError,ValueError,OSError) as e:
        return {**base,'notice':'외부 AI API에 연결할 수 없어 로컬 검색 안내로 대체했습니다.','external_used':False}

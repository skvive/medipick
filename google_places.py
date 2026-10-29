"""Optional Google Places (New) verifier. Live use requires a server-restricted API key.
Never persist Google Place display/coordinates; only Google's stable place ID.
"""
import os,json,re,difflib,urllib.request,urllib.parse
from premium import haversine,now

def normalized(x):
    return re.sub(r'[^0-9A-Za-z가-힣]+','',str(x)).lower()

def verify_match(provider,latitude,longitude,place):
    title=place.get('displayName',{}).get('text','')
    loc=place.get('location') or {}
    if not title or not isinstance(loc.get('latitude'),(int,float)) or not isinstance(loc.get('longitude'),(int,float)):
        return {'matched':False,'reason':'Google Places 공식 기관명/좌표가 누락되었습니다'}
    distance=haversine(float(latitude),float(longitude),float(loc['latitude']),float(loc['longitude']))
    left,right=normalized(provider),normalized(title)
    similarity=difflib.SequenceMatcher(None,left,right).ratio()
    # Exact naming or closely matching name + physical proximity both required.
    accepted=(left==right or similarity>=0.76) and distance<=0.45
    return {'matched':bool(accepted),'distance_km':round(distance,3),'name_similarity':round(similarity,3),
     'reason':'일치' if accepted else '기관명 또는 독립 검증좌표가 Google Places와 충분히 일치하지 않습니다. 기관 담당자 확인 후 재등록하세요.',
     'google_name':title,'google_address':place.get('formattedAddress','')}

def fetch_place(place_id):
    key=os.getenv('GOOGLE_PLACES_SERVER_KEY','')
    if not key:raise ValueError('Google Places 서버 API 키가 설정되지 않았습니다')
    if not re.fullmatch('[A-Za-z0-9_-]{10,180}',place_id):raise ValueError('Google Place ID 형식 오류')
    url='https://places.googleapis.com/v1/places/'+urllib.parse.quote(place_id,safe='')
    req=urllib.request.Request(url,headers={'X-Goog-Api-Key':key,'X-Goog-FieldMask':'id,displayName,location,formattedAddress','Accept-Language':'ko'})
    with urllib.request.urlopen(req,timeout=9) as response:
        data=json.loads(response.read(150_000))
    if data.get('id')!=place_id:raise ValueError('Google Place ID를 확인할 수 없습니다')
    return data

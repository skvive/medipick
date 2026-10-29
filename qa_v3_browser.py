"""Reproducible offline Chromium UI QA because sandbox blocks HTTP browser navigation.
Injects actual HTML/CSS/JS and mocks network; server API independently tested via unittest.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import sys,os,tempfile,base64,json
ROOT=Path(__file__).resolve().parent
DOC=ROOT/'docs'/'v3_browser';DOC.mkdir(exist_ok=True,parents=True)
sys.path.insert(0,str(ROOT))
with tempfile.TemporaryDirectory() as tmp:
 os.environ['MEDIPICK_DB']=str(Path(tmp)/'visual.sqlite')
 import server,medical_assist
 server.init_db()
 with server.db() as c:
  response=medical_assist.respond(c,{'question':'피부에 발진이 생겼는데 진료과는 어디인가요?'},server.provider_query)
 mock="""window.fetch=async (url,options={})=>{let val={ok:true};if(url==='/api/consult/photo-chat')val=MOCK_RESPONSE;
 else if(url==='/api/health-data/connection')val={reason:'외부 건강정보 API 연동 미설정',connected:false};
 else if(url.startsWith('/api/doctor/'))return {ok:false,status:401,json:async()=>({error:'의사용 접근키 필요'})};
 else if(url.startsWith('/api/admin/'))return {ok:false,status:401,json:async()=>({error:'운영자 로그인이 필요'})};
 else if(url==='/api/engagement/checkin')val={ok:true,reward_points:0};
 return {ok:true,status:200,json:async()=>val}};""".replace('MOCK_RESPONSE',json.dumps(response,ensure_ascii=False))
 results=[];errors=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for mode,vp in [('desktop',{'width':1440,'height':930}),('mobile',{'width':390,'height':844})]:
   for name in ('consult','my-health','doctor-finance','marketing-console'):
    page=browser.new_page(viewport=vp)
    page.on('pageerror',lambda e:errors.append(str(e)))
    html=(ROOT/'web'/f'{name}.html').read_text(encoding='utf-8')
    css=(ROOT/'web/assets/v3.css').read_text(encoding='utf-8')
    # Only remove external CSS links & inject same CSS as inline.
    html=html.replace('<link rel="stylesheet" href="/assets/v3.css">','<style>'+css+'</style>')
    jsfile={'consult':'consult.js','my-health':'health.js','doctor-finance':'doctor-finance.js','marketing-console':'marketing.js'}[name]
    html=html.replace('<script src="/assets/'+jsfile+'"></script>','')
    for idx in (1,3,12):
     photo=ROOT/'web/assets/photos'/f'cat{idx:02}.webp'
     if photo.exists():html=html.replace(f'/assets/photos/cat{idx:02}.webp','data:image/webp;base64,'+base64.b64encode(photo.read_bytes()).decode())
    page.set_content(html,wait_until='domcontentloaded')
    page.add_script_tag(content=mock)
    page.add_script_tag(content=(ROOT/'web/assets'/jsfile).read_text(encoding='utf-8'))
    page.wait_for_timeout(150)
    if name=='consult' and mode=='desktop':
     page.locator('#question').fill('피부에 발진이 생겼는데 진료과는 어디인가요?')
     page.locator('#send').click()
     page.wait_for_selector('.provider-list',timeout=4000)
     results.append({'scenario':'chat send and sponsor cards','messages':page.locator('.msg').count(),'provider_sections':page.locator('.provider-list').count()})
    overflow=page.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')
    page.screenshot(path=str(DOC/f'{name}-{mode}.png'),full_page=False)
    results.append({'page':name,'mode':mode,'horizontal_overflow':overflow,'title':page.title()})
    page.close()
  browser.close()
 (DOC/'report.json').write_text(json.dumps({'test_type':'offline API mock browser UI + separate live server API unittest','results':results,'js_errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'snapshots':8,'errors':errors,'overflows':[r for r in results if r.get('horizontal_overflow')],'interactive':[r for r in results if 'scenario' in r]},ensure_ascii=False,indent=2))

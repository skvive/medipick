"""Offline Chromium visual smoke test. Browser cannot navigate to local/network URLs in this runner,
so we inject actual HTML/CSS/JS and deterministic API snapshots from the real server functions.
This verifies UI rendering and interactions, NOT a real network or Google Maps SDK."""
import sys,os,tempfile,json,base64
from pathlib import Path
from urllib.parse import parse_qs
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
tmp=tempfile.TemporaryDirectory();os.environ['MEDIPICK_DB']=str(Path(tmp.name)/'demo.sqlite')
import server,ai_service,premium
server.init_db()
with server.db() as con:
 config={'categories':server.CATEGORIES,'demo':True,'ga_id':'','google_maps_browser_key':''}
 home={'featured':server.search(con,{'category':['전체']})['items'][:6], 'categories':server.CATEGORIES}
 content=[dict(r) for r in con.execute("SELECT x.*,p.name provider_name,p.image_style,p.category provider_category,d.name doctor_name,d.verification doctor_verification FROM content x JOIN providers p ON x.provider_id=p.id LEFT JOIN doctors d ON x.doctor_id=d.id WHERE x.approved=1")]
 providers={str(i):server.public_provider(con,con.execute('SELECT * FROM providers WHERE id=?',(i,)).fetchone()) for i in range(1,10)}
 nearby=premium.nearby(con,37.4979,127.0276,10)
 ai=ai_service.answer(con,'피부과 여드름 정보','피부과',False)
 skin=server.search(con,{'category':['피부과'],'q':['피부과 여드름 정보'],'mode':['ai']})
 general=server.search(con,{'category':['전체']})
 doctors={'items':[dict(x) for x in con.execute("SELECT d.id,d.name,d.provider_id,p.name provider_name FROM doctors d JOIN providers p ON d.provider_id=p.id")]}
 pictures={str(i):'data:image/webp;base64,'+base64.b64encode((ROOT/'web/assets/photos'/('cat'+str(i).zfill(2)+'.webp')).read_bytes()).decode() for i in range(1,13)}
 mock={'config':config,'home':home,'content':{'items':content},'providers':providers,'nearby':nearby,'ai':ai,'skin':skin,'general':general,'doctors':doctors}
base=(ROOT/'web/index.html').read_text(encoding='utf-8')
base=base.replace('<link rel="stylesheet" href="/assets/style.css">','<style>'+(ROOT/'web/assets/style.css').read_text(encoding='utf-8')+'</style>')
base=base.replace('<script src="/assets/app.js" defer></script>','')
base=base.replace('src="/assets/photos/cat07.webp"','src="'+pictures['7']+'"')
mock_js='''(()=>{
const bag={};const storage={getItem:x=>bag[x]||null,setItem:(x,y)=>bag[x]=y,removeItem:x=>delete bag[x]};
Object.defineProperty(window,'sessionStorage',{configurable:true,value:storage});Object.defineProperty(window,'localStorage',{configurable:true,value:storage});
if(!window.crypto.randomUUID)window.crypto.randomUUID=()=>"mock-id";
window.__mockData=MOCK;window.__photoData=PHOTOS;
window.fetch=async function(path,options={}){
const u=new URL(path,'https://example.test/'),m=window.__mockData;let b={};
if(u.pathname==='/api/config')b=m.config;
else if(u.pathname==='/api/home')b=m.home;
else if(u.pathname==='/api/content')b=m.content;
else if(u.pathname==='/api/doctors')b=m.doctors;
else if(u.pathname==='/api/nearby')b=m.nearby;
else if(u.pathname==='/api/search')b=u.searchParams.get('category')==='피부과'?m.skin:m.general;
else if(u.pathname==='/api/ai/answer')b=m.ai;
else if(u.pathname.startsWith('/api/provider/'))b=m.providers[u.pathname.split('/').pop()];
else if(u.pathname==='/api/events')b={ok:true};
else b={ok:true};
return {ok:true,status:200,json:async()=>b};};
})();'''.replace('MOCK',json.dumps(mock,ensure_ascii=False)).replace('PHOTOS',json.dumps(pictures))
app=(ROOT/'web/assets/app.js').read_text(encoding='utf-8')
app=app.replace("const catPhoto=c=>'/assets/photos/cat'+String(picNum[c]||4).padStart(2,'0')+'.webp';","const catPhoto=c=>window.__photoData[String(picNum[c]||4)];")
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 report={'mode':'offline API snapshot DOM test, not live HTTP or Google SDK','errors':[]}
 for name,viewport in [('desktop',{'width':1440,'height':900}),('mobile',{'width':390,'height':844})]:
  page=browser.new_page(viewport=viewport)
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.set_content(base,wait_until='domcontentloaded',timeout=12000)
  page.add_script_tag(content=mock_js)
  page.add_script_tag(content=app)
  page.wait_for_timeout(400)
  report[name+'_cat_images']=page.locator('.cat-photo').count()
  report[name+'_cards']=page.locator('#featuredProviders .provider-card').count()
  report[name+'_horizontal_overflow']=page.evaluate('document.documentElement.scrollWidth - innerWidth')
  page.screenshot(path=str(ROOT/'docs'/('v2-home-'+name+'.png')),full_page=(name=='desktop'),timeout=15000)
  page.locator('#demoNear').click();page.wait_for_timeout(300)
  report[name+'_nearby_cards']=page.locator('#nearCards .near-card').count()
  report[name+'_nearby_all_paid']=all('구독' in a for a in page.locator('#nearCards .sponsor-dot').all_text_contents())
  if name=='desktop':
   page.locator('#nearbySection').screenshot(path=str(ROOT/'docs/v2-nearby-desktop.png'))
   page.locator('#tabAi').click();page.locator('#qInput').fill('피부과 여드름 정보');page.locator('#heroSearch button[type=submit]').click()
   page.wait_for_timeout(200)
   report['ai_sponsors']=page.locator('.ai-sponsor').count();report['ai_section']=page.locator('#aiInsight').is_visible()
   page.screenshot(path=str(ROOT/'docs/v2-ai-search.png'),full_page=False,timeout=15000)
  page.close()
 browser.close()
(ROOT/'docs/OFFLINE_UI_QA.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
tmp.cleanup()

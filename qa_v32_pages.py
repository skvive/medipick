"""Offline HTML/CSS render QA. Browser cannot navigate localhost in sandbox.
Real HTTP business logic is tested independently by unittest.
"""
import json,re,base64,sys,os
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
from PIL import Image,ImageOps,ImageDraw
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'docs'/'v32_ui_qa';OUT.mkdir(exist_ok=True,parents=True)
PAGES=['index','consult','my-health','doctor-finance','doctors','premium-admin','admin','advertiser','marketing-console','integrations']
styles={x:(ROOT/'web/assets'/x).read_text(encoding='utf-8') for x in ['style.css','v3.css','upgrade.css']}
allcss='\n'.join(v.replace('@import url(\'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap\');','') for v in styles.values())
findings=[]; console=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height,mode in [(1440,900,'pc'),(390,844,'mobile')]:
  for name in PAGES:
   html=(ROOT/'web'/f'{name}.html').read_text(encoding='utf-8')
   soup=BeautifulSoup(html,'html.parser')
   images=soup.find_all('img');missing_alt=[i.get('src') for i in images if not i.has_attr('alt') or not i['alt'].strip()]
   dead_local=[]
   for el in soup.find_all(['img','link','script']):
    source=el.get('src') or el.get('href') or ''
    if source.startswith('/') and not (ROOT/'web'/source.lstrip('/')).is_file():dead_local.append(source)
   # Local copies of image assets allow same rendering without HTTP or arbitrary external sites.
   for img in soup.find_all('img'):
    path=img.get('src','')
    if path.startswith('/') and (ROOT/'web'/path.lstrip('/')).is_file():
     b=(ROOT/'web'/path.lstrip('/')).read_bytes()
     ext=path.rsplit('.',1)[-1];mime={'webp':'image/webp','svg':'image/svg+xml','png':'image/png','jpg':'image/jpeg'}.get(ext,'image/png')
     img['src']='data:'+mime+';base64,'+base64.b64encode(b).decode()
   for l in soup.find_all('link',rel='stylesheet'):l.decompose()
   for js in soup.find_all('script'):js.decompose()
   style=soup.new_tag('style');style.string=allcss;soup.head.append(style)
   page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
   page.on('pageerror',lambda e:console.append(str(e)))
   page.set_content(str(soup),wait_until='domcontentloaded')
   page.wait_for_timeout(80)
   metrics=page.evaluate('''() => ({scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,
    title:document.title,h1:Array.from(document.querySelectorAll('h1')).map(e=>e.textContent.trim().slice(0,110)),
    imageLoaded:Array.from(document.images).filter(i=>i.complete&&i.naturalWidth>0).length,
    imageTotal:document.images.length})''')
   result={'page':name,'mode':mode,'broken_asset_references':dead_local,'images_without_alt':missing_alt,
           'horizontal_overflow':metrics['scrollWidth']>metrics['viewport']+2,**metrics}
   findings.append(result)
   page.screenshot(path=str(OUT/f'{name}-{mode}.png'),full_page=False)
   page.close()
 browser.close()
# Image language inspection: these category photos are photographic and intentionally carry no Korean captions.
photos=[]
for f in sorted((ROOT/'web/assets/photos').glob('cat*.webp')):
 with Image.open(f) as im:
  photos.append({'file':f.name,'pixel_dimensions':list(im.size),'format':im.format})
report={'test_scope':'real HTML/CSS image static rendering, scripts omitted; live API covered separately; external OAuth/payment untested',
 'pages':findings,'js_errors':console,'photos':photos,'all_passed':not console and all(not x['horizontal_overflow'] and not x['broken_asset_references'] and not x['images_without_alt'] for x in findings)}
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS',report['all_passed'],'screens',len(findings),'overflows',[(x['page'],x['mode']) for x in findings if x['horizontal_overflow']],
      'broken',[(x['page'],x['broken_asset_references']) for x in findings if x['broken_asset_references']],
      'missing alt',[(x['page'],x['images_without_alt']) for x in findings if x['images_without_alt']])

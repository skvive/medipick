#!/usr/bin/env python3
"""Offline Chromium layout check. API behavior is separately HTTP-tested by unittest.
Due to sandbox Chromium network policy, images are inlined and no external API is used.
"""
from pathlib import Path
import re,base64,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/v33_qa';OUT.mkdir(parents=True,exist_ok=True)
report=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for kind,width,height in [('desktop',1440,950),('mobile',390,844)]:
        for name in ['clinic-ops','clinic-access','doctor-finance']:
            html=(ROOT/'web'/(name+'.html')).read_text(encoding='utf-8')
            html=re.sub(r'<script\b[^>]*src=["\'][^"\']+["\'][^>]*>\s*</script>','',html,flags=re.I)
            html=re.sub(r'<link\b[^>]*rel=["\']stylesheet["\'][^>]*>','',html,flags=re.I)
            for asset in set(re.findall(r'src="(/assets/[^\"]+)"',html)):
                f=ROOT/'web'/asset.lstrip('/')
                if f.is_file() and f.suffix in ('.webp','.png','.svg'):
                    mime={'webp':'image/webp','png':'image/png','svg':'image/svg+xml'}[f.suffix[1:]]
                    html=html.replace(asset,'data:'+mime+';base64,'+base64.b64encode(f.read_bytes()).decode())
            css=(ROOT/'web/assets/v3.css').read_text(encoding='utf-8')
            html=html.replace('</head>','<style>'+css+'</style></head>',1)
            # No external scripts, layout only. Behavioral integration is tested via real HTTP.
            page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
            errors=[];page.on('pageerror',lambda ex:errors.append(str(ex)))
            page.set_content(html,wait_until='domcontentloaded',timeout=16000)
            page.screenshot(path=str(OUT/(name+'-'+kind+'.png')),full_page=True)
            overflow=page.evaluate('document.documentElement.scrollWidth > window.innerWidth + 4')
            report.append({'page':name,'viewport':kind,'horizontal_overflow':overflow,'js_errors':errors[:]})
            if overflow or errors:raise AssertionError(report[-1])
            page.close()
    browser.close()
(OUT/'report.json').write_text(json.dumps({'method':'offline Chromium static layout; actual HTTP API tests separate','checks':report,'result':'pass'},ensure_ascii=False,indent=2),encoding='utf-8')
print('UI screenshots:',len(report),'JS errors:',sum(len(x['js_errors']) for x in report))

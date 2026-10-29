"""Offline browser interaction contract; no external account authentication or payment."""
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parent
html=(ROOT/'web/integrations.html').read_text()
soup=BeautifulSoup(html,'html.parser')
for s in soup.find_all('script'):s.decompose()
for l in soup.find_all('link',rel='stylesheet'):l.decompose()
style=soup.new_tag('style');style.string='\n'.join((ROOT/'web/assets'/p).read_text() for p in ('style.css','upgrade.css'));soup.head.append(style)
# Image is optional for interaction testing; static 20-render QA includes all media.
mock='''window.fetch=async (url,opts={})=>{let v={};
if(url==='/api/admin/me')v={authenticated:true};
else if(url==='/api/admin/doctors')v={items:[{id:1,name:'가상 의료진',specialty:'피부과'}]};
else if(url==='/api/admin/providers')v={items:[{id:1,name:'데모 의원'}]};
else if(url==='/api/integrations/status')v={google_configured:false,toss_configured:false,google_accounts:[],orders:[]};
else if(url==='/api/admin/checkout/order'){
 if((opts.headers||{})['X-Medipick-Admin']!=='1')throw new Error('CSRF header missing');
 v={orderId:'MPB2B_TEST',amount:190000,enabled:false,clientKey:'',plan:'basic'};
}
return {ok:true,json:async()=>v,status:200}};'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1024,'height':960})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(str(soup),wait_until='domcontentloaded')
 page.add_script_tag(content=mock)
 page.add_script_tag(content=(ROOT/'web/assets/integrations.js').read_text())
 page.wait_for_timeout(130)
 page.select_option('#payProvider','1')
 page.locator('#prepareOrder').click()
 page.wait_for_timeout(100)
 result=page.locator('#orderResult').inner_text()
 assert '190,000원' in result,result
 assert '실제 결제를 사용할 수 없습니다' in result,result
 assert page.locator('#payNow').is_hidden()
 assert not errors,errors
 print(json.dumps({'offline_browser_interaction':'passed','safe_unconfigured_payment':True,'errors':errors,'order_text':result},ensure_ascii=False))
 b.close()

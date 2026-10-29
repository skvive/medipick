from pathlib import Path
import re,base64
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent;inv=root/'docs/investor'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for lang in ('KO','EN'):
  file=inv/f'MEDIPICK_Investor_Deck_{lang}.html'
  src=file.read_text(encoding='utf-8')
  def inline_photo(m):
   name=m.group(1);fp=root/'web/assets/photos'/name
   return 'src="data:image/webp;base64,'+base64.b64encode(fp.read_bytes()).decode('ascii')+'"'
  src=re.sub(r'src="\.\./\.\./web/assets/photos/(cat\d+\.webp)"',inline_photo,src)
  page=b.new_page(viewport={'width':1280,'height':720},device_scale_factor=1)
  page.set_content(src,wait_until='load')
  path=inv/f'MEDIPICK_Investor_Deck_{lang}.pdf'
  page.pdf(path=str(path),print_background=True,prefer_css_page_size=True,margin={'top':'0px','right':'0px','bottom':'0px','left':'0px'})
  page.screenshot(path=str(inv/f'deck-{lang.lower()}-cover.png'),full_page=False)
  print(lang,path.stat().st_size)
  page.close()
 b.close()

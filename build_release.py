"""Package release without credentials, DB, cache or generated secrets."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from datetime import datetime, timezone
import json,hashlib
ROOT=Path(__file__).resolve().parent
TARGET=ROOT.parent/'MEDIPICK_v3_1_Full_System_Verified.zip'
EXCLUDE={'.secret','.env','.DS_Store'}
files=[]
for p in ROOT.rglob('*'):
 if not p.is_file() or p.name in EXCLUDE:continue
 rel=p.relative_to(ROOT)
 if any(x in ('.git','__pycache__','node_modules','data') for x in rel.parts):
  if rel.parts[0]=='data' and p.name=='.gitkeep':pass
  else:continue
 if p.suffix in ('.pyc','.sqlite3','.sqlite','.db','.log'):continue
 files.append(p)
files.sort()
manifest={'release':'MEDIPICK v3.1','date':'2026-10-29','tests':'39 unique automated tests + 8 offline UI screens','demo_only':True,
          'files':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
(ROOT/'docs'/'RELEASE_V3_MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
files.append(ROOT/'docs'/'RELEASE_V3_MANIFEST.json')
with ZipFile(TARGET,'w',ZIP_DEFLATED,compresslevel=7) as z:
 for p in files:z.write(p,arcname='MEDIPICK_v3.1/'+str(p.relative_to(ROOT)))
with ZipFile(TARGET) as z:
 assert z.testzip() is None
 entries=z.namelist()
 assert not any(k.endswith(('.secret','.sqlite3','.pyc')) or '/__pycache__/' in k for k in entries)
 assert len(entries)==len(files)
print(json.dumps({'path':str(TARGET),'files':len(files),'bytes':TARGET.stat().st_size,'sha256':hashlib.sha256(TARGET.read_bytes()).hexdigest()},indent=2))

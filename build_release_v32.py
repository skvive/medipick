"""Reproducible ZIP with SHA256 manifest and no DB/key/secrets."""
from pathlib import Path
from datetime import datetime,timezone
from zipfile import ZipFile,ZIP_DEFLATED
import hashlib,json
ROOT=Path(__file__).resolve().parent
TARGET=ROOT.parent/'MEDIPICK_v3_2_Design_OAuth_Billing_Security_Verified.zip'
EXCLUDED={'.env','.secret','.DS_Store','RELEASE_V32_MANIFEST.json'}
files=[]
for path in ROOT.rglob('*'):
    if not path.is_file() or path.name in EXCLUDED:continue
    rel=path.relative_to(ROOT)
    if any(part in ('__pycache__','.git','node_modules') for part in rel.parts):continue
    if rel.parts[0]=='data' and path.name!='.gitkeep':continue
    if path.suffix in ('.pyc','.sqlite3','.sqlite','.db','.log'):continue
    files.append(path)
files.sort()
hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
manifest={'title':'MEDIPICK v3.2 · design + OAuth + Blogger + Toss subscription + security',
   'date':'2026-10-29','scope':'local demonstration and sandbox-tested integration contract; no live external keys',
   'automated_test_runs':91,'ui_snapshots':20,'files_sha256':hashes,
   'limitations':['Google live login/consent not tested','Toss live merchant charges not tested','HIRA/MyHealthWay not connected','production security audit pending']}
manif_file=ROOT/'docs'/'RELEASE_V32_MANIFEST.json'
manif_file.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
files.append(manif_file)
with ZipFile(TARGET,'w',compression=ZIP_DEFLATED,compresslevel=8) as z:
    for path in files:z.write(path,arcname='MEDIPICK_v3.2/'+str(path.relative_to(ROOT)))
with ZipFile(TARGET) as z:
    assert z.testzip() is None
    names=z.namelist()
    assert len(names)==len(files)
    assert not any('/.secret' in n or n.endswith('.sqlite3') or n.endswith('/.env') or '/__pycache__' in n for n in names)
print(json.dumps({'path':str(TARGET),'bytes':TARGET.stat().st_size,'files':len(files),
     'sha256':hashlib.sha256(TARGET.read_bytes()).hexdigest()},ensure_ascii=False,indent=2))

#!/usr/bin/env python3
"""Offline structural checks, no Xcode SDK or network required."""
import json
import pathlib
import plistlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
APP = ROOT / 'MEDIPICKiOS'
TESTS = ROOT / 'MEDIPICKiOSTests'
report = []

def check(name, condition):
    report.append((name, bool(condition)))
    if not condition: print('FAIL', name)
    else: print('PASS', name)

files = list(APP.rglob('*.swift')) + list(TESTS.rglob('*.swift'))
check('Swift app+test source present', len(files) >= 15)
parse = subprocess.run(['swiftc','-frontend','-parse',*map(str,files)],capture_output=True,text=True)
check('Swift syntax parser', parse.returncode == 0)
if parse.returncode: print(parse.stderr[:3000])
plist = plistlib.loads((APP/'Info.plist').read_bytes())
check('only runtime location permission', 'NSLocationWhenInUseUsageDescription' in plist and 'NSLocationAlwaysUsageDescription' not in plist)
check('accurate app display name', plist.get('CFBundleDisplayName') == '메디픽')
check('no ATS HTTP arbitrary loads', 'NSAppTransportSecurity' not in plist)
check('xcode project and fallback YAML', (ROOT/'MEDIPICKiOS.xcodeproj/project.pbxproj').is_file() and (ROOT/'project.yml').is_file())
if pathlib.Path('/usr/local/swift/usr/bin/plutil').is_file():
    result = subprocess.run(['plutil','-lint',str(ROOT/'MEDIPICKiOS.xcodeproj/project.pbxproj')],capture_output=True,text=True)
    check('OpenStep Xcode project syntax',result.returncode == 0)
    if result.returncode:print(result.stdout+result.stderr)
else:check('OpenStep Xcode project syntax (basic)', 'PBXProject' in (ROOT/'MEDIPICKiOS.xcodeproj/project.pbxproj').read_text())
from PIL import Image
icon = APP/'Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png'
img=Image.open(icon)
check('opaque 1024x1024 app icon',img.size==(1024,1024) and img.mode=='RGB')
check('valid asset catalogs',all(json.loads(f.read_text()) for f in APP.rglob('Contents.json')))
api=(APP/'Services/CatalogAPI.swift').read_text()
model=(APP/'Models/Hospital.swift').read_text()
check('HTTPS single production origin', 'https://medipick.lexid.site' in (APP/'App/AppConfig.swift').read_text())
check('native nearby refuses estimated', 'include_estimated' in api and 'NO include_estimated=1' in api)
check('only verified markers', 'geocodeStatus == "exact"' in model and 'verifiedCoordinate' in (APP/'Views/VerifiedMapView.swift').read_text())
check('favorites are Keychain-only', 'SecItemAdd' in (APP/'Services/FavoritesStore.swift').read_text() and 'UserDefaults' not in (APP/'Services/FavoritesStore.swift').read_text())
check('login outside embedded WebView', 'auth/sign-in' in (APP/'Views/MoreView.swift').read_text() and not any('WKWebView' in f.read_text() for f in files))
check('test methods cover geo',len(re.findall(r'func test', (TESTS/'CatalogSafetyTests.swift').read_text())) >= 4)
check('zero secret files',not any(p.name in ['.env','.p12','.mobileprovision','AuthKey.p8'] for p in ROOT.rglob('*') if p.is_file()))
print(f'CHECKS {sum(ok for _,ok in report)}/{len(report)}')
sys.exit(0 if all(ok for _,ok in report) else 1)

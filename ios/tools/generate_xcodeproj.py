#!/usr/bin/env python3
"""Deterministic, dependency-free Xcode .pbxproj generator for MEDIPICKiOS.
Canonical files in ios/MEDIPICKiOS and ios/MEDIPICKiOSTests.
No network, code-signing, or DB access.
"""
from __future__ import annotations
import hashlib
import pathlib
import json

BASE = pathlib.Path(__file__).resolve().parents[1]
APP = BASE / 'MEDIPICKiOS'
TESTS = BASE / 'MEDIPICKiOSTests'
SOURCE_GROUPS = ['App', 'Models', 'Services', 'Views']
SOURCES = [path for group in SOURCE_GROUPS for path in sorted((APP/group).glob('*.swift'))]
TEST_SOURCE = sorted(TESTS.glob('*.swift'))
ASSETS = APP / 'Assets.xcassets'
assert SOURCES and TEST_SOURCE and ASSETS.is_dir()

class Raw(str): pass

def oid(label: str) -> Raw:
    return Raw(hashlib.sha256(('MEDIPICK:' + label).encode('utf8')).hexdigest()[:24].upper())

def val(obj, depth=0):
    if isinstance(obj, Raw): return obj
    if isinstance(obj, str): return json.dumps(obj, ensure_ascii=False)
    if isinstance(obj, bool): return '1' if obj else '0'
    if isinstance(obj, (int,float)): return str(obj)
    if isinstance(obj, list):
        if not obj: return '()'
        return '(\n' + ''.join('\t'*(depth+1)+val(x,depth+1)+',\n' for x in obj) + '\t'*depth + ')'
    if isinstance(obj, dict):
        if not obj:return '{}'
        return '{\n' + ''.join('\t'*(depth+1) + str(k) + ' = ' + val(v,depth+1) + ';\n' for k,v in obj.items()) + '\t'*depth + '}'
    raise TypeError(type(obj))

objects={}
def add(name,content):
    k=oid(name)
    if k in objects: raise Exception('duplicate '+name)
    objects[k]=content
    return k

file_ids={}
build_files={}
for path in SOURCES+TEST_SOURCE:
    rel=path.relative_to(BASE)
    name=str(rel)
    file_ids[path]=add('file '+name,dict(isa=Raw('PBXFileReference'),lastKnownFileType='sourcecode.swift',path=path.name,sourceTree='<group>'))
    build_files[path]=add('build '+name,dict(isa=Raw('PBXBuildFile'),fileRef=file_ids[path]))
file_icon=add('file app asset catalog',dict(isa=Raw('PBXFileReference'),lastKnownFileType='folder.assetcatalog',path=ASSETS.name,sourceTree='<group>'))
asset_build=add('build app assets',dict(isa=Raw('PBXBuildFile'),fileRef=file_icon))
file_plist=add('file info plist',dict(isa=Raw('PBXFileReference'),lastKnownFileType='text.plist.xml',path='Info.plist',sourceTree='<group>'))
app_product=add('product app',dict(isa=Raw('PBXFileReference'),explicitFileType='wrapper.application',includeInIndex='0',path='MEDIPICKiOS.app',sourceTree=Raw('BUILT_PRODUCTS_DIR')))
test_product=add('product tests',dict(isa=Raw('PBXFileReference'),explicitFileType='wrapper.cfbundle',includeInIndex='0',path='MEDIPICKiOSTests.xctest',sourceTree=Raw('BUILT_PRODUCTS_DIR')))

group_ids={}
for group in SOURCE_GROUPS:
    group_ids[group]=add('group '+group,dict(isa=Raw('PBXGroup'),children=[file_ids[p] for p in SOURCES if p.parent.name==group],path=group,sourceTree='<group>'))
app_group=add('group app',dict(isa=Raw('PBXGroup'),children=[group_ids[g] for g in SOURCE_GROUPS]+[file_icon,file_plist],path='MEDIPICKiOS',sourceTree='<group>'))
test_group=add('group tests',dict(isa=Raw('PBXGroup'),children=[file_ids[p] for p in TEST_SOURCE],path='MEDIPICKiOSTests',sourceTree='<group>'))
products=add('group products',dict(isa=Raw('PBXGroup'),children=[app_product,test_product],name='Products',sourceTree='<group>'))
root=add('group root',dict(isa=Raw('PBXGroup'),children=[app_group,test_group,products],sourceTree='<group>'))

app_sources=add('phase app sources',dict(isa=Raw('PBXSourcesBuildPhase'),buildActionMask=2147483647,files=[build_files[p] for p in SOURCES],runOnlyForDeploymentPostprocessing=0))
app_resources=add('phase app resources',dict(isa=Raw('PBXResourcesBuildPhase'),buildActionMask=2147483647,files=[asset_build],runOnlyForDeploymentPostprocessing=0))
app_frameworks=add('phase app frameworks',dict(isa=Raw('PBXFrameworksBuildPhase'),buildActionMask=2147483647,files=[],runOnlyForDeploymentPostprocessing=0))
test_sources=add('phase test sources',dict(isa=Raw('PBXSourcesBuildPhase'),buildActionMask=2147483647,files=[build_files[p] for p in TEST_SOURCE],runOnlyForDeploymentPostprocessing=0))
test_frameworks=add('phase test frameworks',dict(isa=Raw('PBXFrameworksBuildPhase'),buildActionMask=2147483647,files=[],runOnlyForDeploymentPostprocessing=0))
icon_script='''set -euo pipefail
ASSET="$SRCROOT/MEDIPICKiOS/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
if [ ! -s "$ASSET" ]; then
  swift "$SRCROOT/tools/generate_ios_icon.swift" \\
    "$SRCROOT/../web/assets/pwa/icon-512.png" "$ASSET"
fi
'''
icon_phase=add('phase app icon',dict(isa=Raw('PBXShellScriptBuildPhase'),alwaysOutOfDate=1,buildActionMask=2147483647,files=[],inputPaths=[],name='Restore MEDIPICK app icon if missing',outputPaths=[],runOnlyForDeploymentPostprocessing=0,shellPath='/bin/sh',shellScript=icon_script,showEnvVarsInLog=0))

app_target=oid('target app')
test_target=oid('target tests')
proj_id=oid('project')
app_config_list=oid('config list app')
test_config_list=oid('config list test')
project_config_list=oid('config list project')
proxy=add('test product proxy',dict(isa=Raw('PBXContainerItemProxy'),containerPortal=proj_id,proxyType=1,remoteGlobalIDString=app_target,remoteInfo='MEDIPICKiOS'))
dependency=add('test app dependency',dict(isa=Raw('PBXTargetDependency'),target=app_target,targetProxy=proxy))

objects[app_target] = dict(isa=Raw('PBXNativeTarget'),buildConfigurationList=app_config_list,buildPhases=[icon_phase,app_sources,app_frameworks,app_resources],buildRules=[],dependencies=[],name='MEDIPICKiOS',productName='MEDIPICKiOS',productReference=app_product,productType='com.apple.product-type.application')
objects[test_target] = dict(isa=Raw('PBXNativeTarget'),buildConfigurationList=test_config_list,buildPhases=[test_sources,test_frameworks],buildRules=[],dependencies=[dependency],name='MEDIPICKiOSTests',productName='MEDIPICKiOSTests',productReference=test_product,productType='com.apple.product-type.bundle.unit-test')

project_attrs=dict(BuildIndependentTargetsInParallel='YES',LastUpgradeCheck='1600',TargetAttributes={str(app_target):dict(CreatedOnToolsVersion='16.0'),str(test_target):dict(CreatedOnToolsVersion='16.0',TestTargetID=app_target)})
objects[proj_id] = dict(isa=Raw('PBXProject'),attributes=project_attrs,buildConfigurationList=project_config_list,compatibilityVersion='Xcode 15.0',developmentRegion='ko',hasScannedForEncodings=0,knownRegions=['ko','en','Base'],mainGroup=root,productRefGroup=products,projectDirPath='',projectRoot='',targets=[app_target,test_target])

def conf(label, settings):
    return add('configuration '+label,dict(isa=Raw('XCBuildConfiguration'),buildSettings=settings,name='Debug' if label.endswith('debug') else 'Release'))
base_proj=dict(ENABLE_USER_SCRIPT_SANDBOXING='NO',IPHONEOS_DEPLOYMENT_TARGET='17.0',SDKROOT='iphoneos',SWIFT_VERSION='5.9',TARGETED_DEVICE_FAMILY='1,2',CLANG_ENABLE_MODULES='YES')
pd=conf('project debug',dict(base_proj,ONLY_ACTIVE_ARCH='YES',SWIFT_OPTIMIZATION_LEVEL='-Onone',DEBUG_INFORMATION_FORMAT='dwarf'))
pr=conf('project release',dict(base_proj,SWIFT_COMPILATION_MODE='wholemodule',DEBUG_INFORMATION_FORMAT='dwarf-with-dsym'))
app_common=dict(ASSETCATALOG_COMPILER_APPICON_NAME='AppIcon',CODE_SIGN_STYLE='Automatic',CURRENT_PROJECT_VERSION='1',GENERATE_INFOPLIST_FILE='NO',INFOPLIST_FILE='MEDIPICKiOS/Info.plist',MARKETING_VERSION='1.0.0',PRODUCT_BUNDLE_IDENTIFIER='site.lexid.medipick',PRODUCT_NAME='$(TARGET_NAME)',SWIFT_VERSION='5.9',IPHONEOS_DEPLOYMENT_TARGET='17.0',TARGETED_DEVICE_FAMILY='1,2',SUPPORTS_MACCATALYST='NO')
ad=conf('app debug',dict(app_common,SWIFT_OPTIMIZATION_LEVEL='-Onone',SWIFT_ACTIVE_COMPILATION_CONDITIONS='DEBUG',ENABLE_TESTABILITY='YES'))
ar=conf('app release',dict(app_common,SWIFT_OPTIMIZATION_LEVEL='-O'))
test_common=dict(CODE_SIGN_STYLE='Automatic',GENERATE_INFOPLIST_FILE='YES',PRODUCT_BUNDLE_IDENTIFIER='site.lexid.medipick.tests',PRODUCT_NAME='$(TARGET_NAME)',SWIFT_VERSION='5.9',IPHONEOS_DEPLOYMENT_TARGET='17.0',TARGETED_DEVICE_FAMILY='1,2',TEST_HOST='$(BUILT_PRODUCTS_DIR)/MEDIPICKiOS.app/MEDIPICKiOS',BUNDLE_LOADER='$(TEST_HOST)')
td=conf('test debug',dict(test_common,SWIFT_OPTIMIZATION_LEVEL='-Onone'))
tr=conf('test release',dict(test_common,SWIFT_OPTIMIZATION_LEVEL='-O'))
objects[project_config_list]=dict(isa=Raw('XCConfigurationList'),buildConfigurations=[pd,pr],defaultConfigurationIsVisible=0,defaultConfigurationName='Release')
objects[app_config_list]=dict(isa=Raw('XCConfigurationList'),buildConfigurations=[ad,ar],defaultConfigurationIsVisible=0,defaultConfigurationName='Release')
objects[test_config_list]=dict(isa=Raw('XCConfigurationList'),buildConfigurations=[td,tr],defaultConfigurationIsVisible=0,defaultConfigurationName='Release')

pbx={'archiveVersion':'1','classes':{},'objectVersion':'56','objects':{str(k):v for k,v in sorted(objects.items(),key=lambda item:str(item[0]))},'rootObject':proj_id}
folder=BASE/'MEDIPICKiOS.xcodeproj'
folder.mkdir(parents=True,exist_ok=True)
(folder/'project.pbxproj').write_text('// !$*UTF8*$!\n'+val(pbx)+'\n',encoding='utf8')

scheme=folder/'xcshareddata/xcschemes/MEDIPICKiOS.xcscheme'
scheme.parent.mkdir(parents=True,exist_ok=True)
scheme.write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
  <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES">
    <BuildActionEntries>
      <BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{app_target}" BuildableName="MEDIPICKiOS.app" BlueprintName="MEDIPICKiOS" ReferencedContainer="container:MEDIPICKiOS.xcodeproj"/></BuildActionEntry>
    </BuildActionEntries>
  </BuildAction>
  <TestAction buildConfiguration="Debug" shouldUseLaunchSchemeArgsEnv="YES"><Testables>
    <TestableReference skipped="NO"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{test_target}" BuildableName="MEDIPICKiOSTests.xctest" BlueprintName="MEDIPICKiOSTests" ReferencedContainer="container:MEDIPICKiOS.xcodeproj"/></TestableReference>
  </Testables></TestAction>
  <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.Posix" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{app_target}" BuildableName="MEDIPICKiOS.app" BlueprintName="MEDIPICKiOS" ReferencedContainer="container:MEDIPICKiOS.xcodeproj"/></BuildableProductRunnable></LaunchAction>
  <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{app_target}" BuildableName="MEDIPICKiOS.app" BlueprintName="MEDIPICKiOS" ReferencedContainer="container:MEDIPICKiOS.xcodeproj"/></BuildableProductRunnable></ProfileAction>
  <AnalyzeAction buildConfiguration="Debug"/>
  <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
''',encoding='utf8')
print('Xcode project generated',len(objects),'objects',len(SOURCES),'App Swift files')

#!/usr/bin/env python3
"""Install the compiled original engine and source provenance into the website."""
from pathlib import Path
import shutil, hashlib, json, zipfile, subprocess, sys
root=Path(__file__).resolve().parents[2];port=root/'rage-port';dest=root/'web/public/rage'
dest.mkdir(parents=True,exist_ok=True)
for name in ['clonk.js','clonk.wasm','clonk.data']:
 shutil.copy2(port/'dist'/name,dest/name)
shutil.copy2(port/'shell/index.html',dest/'index.html')
for script in (port/'shell').glob('*.js'):shutil.copy2(script,dest/script.name)
subprocess.run([sys.executable,str(port/'scripts/install-library.py')],check=True)
shutil.copytree(port/'shell/assets',dest/'assets',dirs_exist_ok=True)
shutil.copy2(root/'cr_source/engine/res/cr.ico',dest/'clonk.ico')
licenses=dest/'licenses';licenses.mkdir(exist_ok=True)
for p in (port/'data').glob('*license*.txt'):shutil.copy2(p,licenses/p.name)
for src,name in [('rage-port/deps/openssl-1.0.2u/LICENSE','OpenSSL.txt'),('cr_source/standard/lpng121/LICENSE','libpng.txt'),('cr_source/standard/freetype2/FTL.TXT','FreeType.txt'),('.toolchains/emsdk/upstream/emscripten/LICENSE','Emscripten.txt')]:shutil.copy2(root/src,licenses/name)
(licenses/'zlib.txt').write_text((root/'cr_source/standard/zlib/zlib.h').read_text().split('*/',1)[0]+'*/\n')
(licenses/'JPEG.txt').write_text('This software is based in part on the work of the Independent JPEG Group.\nBundled JPEG implementation: version 6b, copyright (C) 1991-1998 Thomas G. Lane.\n')
provenance=dest/'source';provenance.mkdir(exist_ok=True)
for src,name in [('rage-port/patches/original-to-browser.patch','original-to-browser.patch'),('rage-port/patches/manifest.json','patch-manifest.json'),('rage-port/data/content-manifest.json','content-manifest.json'),('docs/ORIGINAL_GAMEPLAY_AUDIT.md','ORIGINAL_GAMEPLAY_AUDIT.md'),('rage-port/config.h','config.h'),('rage-port/scripts/build.py','build.py')]:shutil.copy2(root/src,provenance/name)
for src,name in [('native-reference/replay-verification.json','native-replay-verification.json'),('web/outputs/original-browser/report.json','browser-acceptance.json'),('rage-port/outputs/goldmine-cycle-observed.json','goldmine-cycle-observed.json'),('rage-port/outputs/save-export-report.json','save-export-report.json')]:
 if (root/src).exists():shutil.copy2(root/src,provenance/name)
for browser in ['chromium','webkit']:
 report=root/f'web/outputs/startup-{browser}.json'
 if report.exists() and not json.loads(report.read_text()).get('failure'):
  shutil.copy2(report,provenance/report.name)
 report=root/f'web/outputs/keyboard-layout-{browser}.json'
 if report.exists() and not json.loads(report.read_text()).get('failure'):
  shutil.copy2(report,provenance/report.name)
 report=root/f'web/outputs/usability/{browser}-report.json'
 if report.exists() and not json.loads(report.read_text()).get('failure'):
  shutil.copy2(report,provenance/f'usability-{browser}.json')
for directory,name in [('view','browser-view-report.json'),('view-webkit','browser-view-webkit-report.json')]:
 camera_report=port/'outputs'/directory/'report.json'
 if camera_report.exists() and not json.loads(camera_report.read_text()).get('errors'):
  shutil.copy2(camera_report,provenance/name)
# Current expansion evidence: publish successful real-engine reports only.
for relative,name in [
 ('rage-port/outputs/rtc-room/report.json','rtc-goldmine.json'),
 ('rage-port/outputs/rtc-jungle-solo-update/report.json','rtc-jungle.json'),
 ('rage-port/outputs/solo-scenarios-chromium/report.json','solo-scenarios-chromium.json'),
 ('rage-port/outputs/solo-scenarios-webkit/report.json','solo-scenarios-webkit.json'),
 ('rage-port/outputs/rtc-team/report.json','rtc-knights.json'),
 ('rage-port/outputs/rtc-desert/report.json','rtc-desert.json'),
 ('rage-port/outputs/rtc-cross-browser/report.json','rtc-cross-browser.json'),
 ('rage-port/outputs/discovery-relay/report.json','discovery-relay.json'),
 ('rage-port/outputs/discovery-live/report.json','discovery-live.json'),
 ('rage-port/outputs/crispness-chromium/report.json','crispness-chromium.json'),
 ('rage-port/outputs/crispness-webkit/report.json','crispness-webkit.json'),
 ('rage-port/outputs/round-switch-chromium/report.json','round-switch-chromium.json'),
 ('rage-port/outputs/round-switch-webkit/report.json','round-switch-webkit.json'),
 ('rage-port/outputs/discovery-browser/report.json','discovery-browser.json'),
 ('rage-port/outputs/launcher-chromium/report.json','launcher-chromium.json'),
 ('rage-port/outputs/launcher-webkit/report.json','launcher-webkit.json'),
 ('rage-port/outputs/rtc-launcher/report.json','rtc-launcher.json'),
 ('rage-port/outputs/touch-menus/report.json','touch-menus.json'),
 ('rage-port/outputs/exit/report.json','native-exit-persistence.json'),
 ('rage-port/outputs/exit-webkit/report.json','native-exit-persistence-webkit.json')]:
 report=root/relative
 if report.exists() and json.loads(report.read_text()).get('passed'):
  shutil.copy2(report,provenance/name)
report=port/'outputs/scenario-library/report.json'
if report.exists():
 evidence=json.loads(report.read_text());results=evidence.get('results',[])
 if len(results)==80 and all(r.get('passed') for r in results):
  shutil.copy2(report,provenance/'scenario-library-acceptance.json')
  shutil.copy2(port/'outputs/scenario-library/screenshots.json',provenance/'scenario-screenshot-provenance.json')
  localization=port/'outputs/scenario-library/western-localization-audit.json'
  if localization.exists():shutil.copy2(localization,provenance/'western-localization-audit.json')
  for source_name,output_name in [('summary.json','scenario-summary.json'),('VALIDATION.md','SCENARIO_VALIDATION.md'),('engine-provenance.json','scenario-engine-provenance.json'),('image-checks.json','scenario-image-checks.json'),('contact-sheet.webp','scenario-contact-sheet.webp'),('gallery/report.json','scenario-gallery.json')]:
   evidence_file=port/'outputs/scenario-library'/source_name
   if evidence_file.exists():shutil.copy2(evidence_file,provenance/output_name)
for name in ['README.md','report.json','Clonk.log']:
 report=root/'native-reference/warning-audit'/name
 if report.exists():
  target=provenance/'original-warning-baseline';target.mkdir(exist_ok=True)
  shutil.copy2(report,target/name)
# Preserve the build adapters and test sources alongside the exact binary release.
# The original archive and official content remain separate licensed inputs.
inputs=[port/'README.md',port/'PLATFORM_PORT.md',port/'config.h',port/'shell/index.html',port/'shell/game.js',
        port/'shell/README.md',port/'data/README.md',
        root/'docs/ORIGINAL_GAMEPLAY_AUDIT.md',root/'original-content/README.md']
inputs.extend([root/'native-reference/README.md',root/'native-reference/replay-verification.json',
               root/'native-reference/browser-replay.mjs',root/'web/tests/original-browser.mjs',
               root/'web/tests/usability-browser.mjs',root/'web/tests/startup-storage.mjs',root/'web/tests/keyboard-layout.mjs',root/'web/tests/README.md'])
for directory in ['scripts','tests','deps','patches']:
 inputs.extend(p for p in (port/directory).iterdir()
               if p.is_file() and p.suffix in {'.py','.mjs','.cpp','.h','.md','.patch','.json'})
inputs.append(port/'data/content-manifest.json')
inputs.extend([port/'data/Browser.c4p',port/'data/browser.cfg',
               port/'data/verification/NativeGoldmine.c4s'])
inputs.extend((port/'data').glob('*license*.txt'))
inputs.extend((port/'shell').glob('*.js'))
inputs.extend([port/'BROWSER_LOCKSTEP.md',root/'docs/GITHUB_README.md'])
inputs.extend(root/'native-reference/warning-audit'/name for name in ['README.md','report.json','Clonk.log'])
inputs.extend(p for p in (port/'catalog').rglob('*') if p.is_file())
inputs=list(set(inputs))
inputs.extend(p for p in (port/'shell/assets').rglob('*') if p.is_file())
with zipfile.ZipFile(provenance/'browser-port-sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for p in sorted(inputs):archive.write(p,p.relative_to(root))
manifest={p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in dest.iterdir() if p.is_file() and p.name!='build-manifest.json'}
(dest/'build-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Installed original engine, content, licenses and port patch in web/public/rage.')

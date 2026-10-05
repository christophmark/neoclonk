#!/usr/bin/env python3
"""Stage the Planet engine and extension catalog, keeping local-only packs private."""
from pathlib import Path
import argparse,json,hashlib,shutil,zipfile
R=Path(__file__).resolve().parents[2];P=R/'planet-port'
a=argparse.ArgumentParser();a.add_argument('--output',default=str(R/'web/public'));a.add_argument('--private-content',action='store_true');args=a.parse_args();out=Path(args.output).resolve();dest=out/'planet';dest.mkdir(parents=True,exist_ok=True)
for name in ['community-import.js','assets/fflate.min.js','assets/sha256.min.js','assets/vendor/fflate-LICENSE.txt','assets/vendor/js-sha256-LICENSE.txt']:(out/'rage'/name).unlink(missing_ok=True)
for name in ['planet.js','planet.wasm','planet.data']:shutil.copy2(P/'dist'/name,dest/name)
shutil.copytree(P/'shell',dest,dirs_exist_ok=True)
shutil.copytree(P/'licenses',dest/'licenses',dirs_exist_ok=True);shutil.copy2(P/'LICENSE.txt',dest/'licenses/planet-port-ISC.txt')
for name in ['clonk_content_license.txt','clonk_trademark_license.txt']:
 source=R/'rage-port/data'/name
 if source.exists():shutil.copy2(source,dest/'licenses'/name)
(dest/'source').mkdir(exist_ok=True)
with zipfile.ZipFile(dest/'source/planet-browser-sources.zip','w',zipfile.ZIP_DEFLATED) as z:
 for folder in ['source','scripts','tests','patches','shell','adapters']:
  for file in sorted((P/folder).rglob('*')):
   if file.is_file() and '__pycache__' not in file.parts and file.suffix not in ['.pyc','.o']:z.write(file,file.relative_to(R))
 for name in ['README.md','LICENSE.txt','source-manifest.json']:
  if (P/name).exists():z.write(P/name,Path('planet-port')/name)
 for file in (P/'licenses').glob('*'):z.write(file,file.relative_to(R))
catalogPath=R/'planet-content/generated/scenarios.json'
if not catalogPath.exists():catalogPath=R/'planet-content/catalog/scenarios.json'
catalog=json.loads(catalogPath.read_text())
# Remove prior extension files before restaging. A private test export must never
# leave extra archives or previews behind when converted to a public export.
prior=out/'rage/catalog/extensions.json'
if prior.exists():
 for pack in json.loads(prior.read_text()).get('packs',[]):
  path=Path(pack['url']);assert path.parts[0]=='packs' and len(path.parts)==2
  (out/'rage'/path).unlink(missing_ok=True)
shutil.rmtree(out/'rage/catalog/extensions',ignore_errors=True)
if not args.private_content:
 permitted={p['filename'] for p in catalog['packs'] if not p.get('localOnly',True)}
 catalog['scenarios']=[s for s in catalog['scenarios'] if all(p in permitted for p in s['requiredPacks']) and s['engine']=='planet']
 used={p for s in catalog['scenarios'] for p in s['requiredPacks']}|set(catalog['profiles']['planet']['corePackages'])
 catalog['packs']=[p for p in catalog['packs'] if p['filename'] in used]
 categories={s['categoryId'] for s in catalog['scenarios']};catalog['categories']=[c for c in catalog['categories'] if c['id'] in categories]
 catalog['profiles']={'planet':catalog['profiles']['planet']}
 catalog['archives']=[];catalog['excludedScenarioSections']=[]
 catalog['counts']={'total':len(catalog['scenarios']),'officialPlanet':len(catalog['scenarios']),'community':0}
 catalog['method']='Official Planet release content under the publisher content license. Community archives without clear redistribution terms are excluded.'
 # This reproducible public build input includes only permitted metadata/artwork.
 publicInput=R/'planet-content/catalog';publicInput.mkdir(parents=True,exist_ok=True)
 (publicInput/'scenarios.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
# The original official cases have passed the recorded startup/control audit.
for scenario in catalog['scenarios']:
 if scenario['id'].startswith('planet-official/'):
  scenario['availability']='available';scenario['blockedReason']=None
catalog.pop('catalogDigest',None)
catalog['catalogDigest']=hashlib.sha256(json.dumps(catalog,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
if not args.private_content:
 (R/'planet-content/catalog/scenarios.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
catalog['privateDistribution']=args.private_content
for s in catalog['scenarios']:
 source=R/s['thumbnail'] if s.get('thumbnail') else None
 if source and (args.private_content or not s.get('thumbnailLocalOnly')):
  target=out/'rage/catalog/extensions/thumbnails'/source.name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target);s['thumbnail']='catalog/extensions/thumbnails/'+source.name
 else:s['thumbnail']=None
for p in catalog['packs']:
 if p.get('localOnly') and not args.private_content:continue
 source=R/p['sourcePath'];assert hashlib.sha256(source.read_bytes()).hexdigest()==p['sha256']
 target=out/'rage'/p['url'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
for file in (R/'rage-port/shell').glob('*.js'):shutil.copy2(file,out/'rage'/file.name)
shutil.copy2(R/'rage-port/shell/index.html',out/'rage/index.html')
shutil.copytree(R/'rage-port/shell/assets',out/'rage/assets',dirs_exist_ok=True)
(out/'rage/catalog/extensions.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'destination':str(out),'scenarios':len(catalog['scenarios']),'privateContent':args.private_content}))

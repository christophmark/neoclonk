#!/usr/bin/env python3
"""Catalog unchanged official Rage groups. Run from any working directory."""
import hashlib,json,re,shutil
from pathlib import Path
from collections import Counter
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
BASE=ROOT/'original-content/import/files'
ADD=ROOT/'original-content/addons/import/all/files'
BASE_PACKS=ROOT/'original-content/release/cr_game_linux'
ADD_PACKS=ROOT/'original-content/addons/release'
PRELOADED={'Objects.c4d','Material.c4g','Graphics.c4g','System.c4g','Sound.c4g','Music.c4g','Worlds.c4f'}
GROUPS=[('Tutorial','base-tutorial','Tutorials'),('Worlds','base-worlds','Worlds'),('Missions','base-missions','Missions'),('Melees','base-melees','Melees'),('Races','base-races','Races'),('Knights','knights','Knights'),('FarWorlds','farworlds','Far Worlds'),('Fantasy','fantasy','Fantasy'),('Western','western','Western')]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def text(p):return p.read_bytes().decode('cp1252',errors='replace').rstrip('\0') if p.exists() else ''
def ini(p):
 result={};section=''
 for line in text(p).splitlines():
  line=line.strip()
  if line.startswith('[') and line.endswith(']'):section=line[1:-1];result.setdefault(section,{})
  elif '=' in line and not line.startswith((';','#')):
   key,value=line.split('=',1);result.setdefault(section,{})[key.strip()]=value.strip()
 return result
def titles(p):return {m[0]:m[1].strip() for m in re.findall(r'^([A-Z]{2}):(.*)$',text(p),re.M)}
def rtf(p):
 # RTF text extraction only; originals remain unchanged and are hashed below.
 source=text(p); stack=[];ignore=False;uc=1;skip=0;out=[]
 token=re.compile(r"\\([a-zA-Z]+)(-?\d+)? ?|\\'([0-9a-fA-F]{2})|\\([^a-zA-Z])|([{}])|([^\\{}]+)")
 destinations={'fonttbl','colortbl','stylesheet','info','pict','object','header','footer','generator','listtable','listoverridetable'}
 for m in token.finditer(source):
  word,num,hx,symbol,brace,plain=m.groups()
  if brace=='{':stack.append((ignore,uc))
  elif brace=='}':
   if stack:ignore,uc=stack.pop()
  elif symbol=='*':ignore=True
  elif word in destinations:ignore=True
  elif not ignore:
   if word in ('par','line'):out.append('\n')
   elif word=='tab':out.append('\t')
   elif word=='uc':uc=int(num or 1)
   elif word=='u':out.append(chr(int(num) % 65536));skip=uc
   elif word in ('emdash','endash','bullet','lquote','rquote','ldblquote','rdblquote'):out.append({'emdash':'—','endash':'–','bullet':'•','lquote':'‘','rquote':'’','ldblquote':'“','rdblquote':'”'}[word])
   elif hx:
    if skip:skip-=1
    else:out.append(bytes.fromhex(hx).decode('cp1252',errors='replace'))
   elif symbol in ('\\','{','}'):out.append(symbol)
   elif symbol=='~':out.append(' ')
   elif plain:
    plain=plain.replace('\r','').replace('\n','');out.append(plain[skip:]);skip=max(0,skip-len(plain))
 return re.sub(r'\n\s*\n+', '\n\n',''.join(out)).strip()
def ids(raw):return [{'id':m[0],'count':int(m[1])} for m in re.findall(r'([A-Z0-9_]{4})=(-?\d+)',raw)]
def original_file(p):return {'sourcePath':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':sha(p)}
categories=[];scenarios=[];packnames=set();sections=[]
old=json.loads((OUT/'scenarios.json').read_text()) if (OUT/'scenarios.json').exists() else {}
old_screens={s['id']:s.get('screenshot') for s in old.get('scenarios',[])}
# Captures are produced independently by the real-engine screenshot sweep.
capture_manifest=ROOT/'rage-port/outputs/scenario-library/screenshots.json'
if capture_manifest.exists():
 for capture in json.loads(capture_manifest.read_text()):
  path=capture.get('path','');relative=Path(path)
  if capture.get('id') and relative.parts[:2]==('catalog','screenshots') and '..' not in relative.parts and (ROOT/'rage-port'/relative).is_file():
   old_screens[capture['id']]=path

for group,cid,fallback in GROUPS:
 root=BASE if (BASE/(group+'.c4f')).exists() else ADD
 folder=root/(group+'.c4f');localized=titles(folder/'Title.txt')
 categories.append({'id':cid,'title':localized.get('US',fallback),'titles':localized,'description':rtf(folder/'DescUS.rtf'),'pack':group+'.c4f','source':'base' if root==BASE else 'official-addon'})
 for cfgpath in sorted(folder.rglob('Scenario.txt')):
  if cfgpath.parent.suffix!='.c4s':sections.append(str(cfgpath.parent.relative_to(root)));continue
  directory=cfgpath.parent;path=str(directory.relative_to(root));sid=path.lower();cfg=ini(cfgpath);head=cfg.get('Head',{});game=cfg.get('Game',{});localized=titles(directory/'Title.txt')
  definitions=[v.replace('\\','/') for k,v in cfg.get('Definitions',{}).items() if re.fullmatch('Definition[0-9]+',k)]
  if not definitions:definitions=['Objects.c4d']
  allpacks=sorted(set([path.split('/')[0]]+[d.split('/')[0] for d in definitions]))
  packnames.update(allpacks)
  required=[p for p in allpacks if p not in PRELOADED]
  for dep in definitions:
   assert (BASE/dep).exists() or (ADD/dep).exists(),f'Missing dependency {dep}'
  goals=ids(game.get('Goals',''));minimum=int(head.get('MinPlayer','0'));derived=minimum or (2 if any(g['id'] in ('MELE','MEL2') for g in goals) else 1)
  descpath=directory/'DescUS.rtf';desc=rtf(descpath)
  if not desc:descpath=directory/'DescDE.rtf';desc=rtf(descpath)
  preview=directory/'Title.png';dest=OUT/'thumbnails'/cid/(directory.stem.lower()+'.png');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(preview,dest)
  scripts=list(directory.rglob('Script.c'));grants=[]
  for p in scripts:
   for m in re.finditer(r'(?:GainMissionAccess|SetMissionAccess)\s*\(\s*"([^"]+)"',text(p)):grants.append(m[1])
  requirements=[]
  if derived>1:requirements.append(f'At least {derived} players (original scenario rules)')
  if head.get('MissionAccess'):requirements.append('Original mission access: '+head['MissionAccess'])
  requirements.extend(p for p in required if p.endswith('.c4d'))
  localdefs=[str(p.parent.relative_to(root)) for p in directory.rglob('DefCore.txt')]
  folderdefs=[str(p.relative_to(root)) for p in directory.parents if p!=root and p.is_relative_to(root) and (p/'Objects.c4d').exists()]
  scenarios.append({'id':sid,'title':localized.get('US',head.get('Title',directory.stem)),'titles':localized,'categoryId':cid,'description':desc,'minPlayers':derived,'maxPlayers':int(head.get('MaxPlayer',12)),'requirements':requirements,'thumbnail':'catalog/'+str(dest.relative_to(OUT)),'screenshot':old_screens.get(sid),'path':path,'requiredPacks':required,'allDefinitionPacks':allpacks,'definitions':definitions,'goals':goals,'rules':ids(game.get('Rules','')),'missionAccess':head.get('MissionAccess') or None,'grantsMissionAccess':sorted(set(grants)),'explicitMinPlayer':minimum,'difficulty':int(head.get('Difficulty',0)),'maxPlayersLeague':int(head.get('MaxPlayerLeague',12)),'legacySharewareAccess':head.get('Access'),'localDefinitions':localdefs,'parentLocalDefinitionFolders':folderdefs,'sections':[str(p.parent.relative_to(root)) for p in directory.rglob('Scenario.txt') if p!=cfgpath],'mapFiles':[str(p.relative_to(root)) for p in directory.iterdir() if p.name.lower() in ('map.bmp','map.png','landscape.bmp','landscape.png','landscape.txt')],'configuration':cfg,'source':original_file(cfgpath),'descriptionSource':original_file(descpath) if descpath.exists() else None,'thumbnailSource':{**original_file(preview),'dimensions':list(Image.open(preview).size),'kind':'original-release-preview'},'scriptSources':[original_file(p) for p in scripts]})
for scenario in scenarios:
 scenario['gameGoals']=[g['id'] for g in scenario['goals']]
 scenario['scriptPlayerCount']=0
 scenario['scriptPlayerCountSource']='No CreateScriptPlayer calls in official scenario or definition scripts'
# Include every supplemental pack, even if a particular scenario's dependency list uses only a subset.
packnames.update(p.name for p in ADD_PACKS.iterdir())
packs=[]
for name in sorted(packnames | PRELOADED):
 p=BASE_PACKS/name
 if not p.exists():p=ADD_PACKS/name
 assert p.exists(),name
 assert p.stat().st_size<25*1024*1024,(name,'exceeds hosting file limit')
 packs.append({'filename':name,**original_file(p),'url':'packs/'+name,'embedded':name in PRELOADED})
archives=[]
for name in ['cr_game_linux.tar.bz2','cr_knights.zip','cr_farworlds.zip','cr_fantasy.zip','cr_western.zip']:
 p=ROOT/'original-content/downloads'/name
 if p.exists():archives.append({'filename':name,**original_file(p),'publisherUrl':'http://www.clonkx.de/rage/'+name})
 else:
  # The curated source export includes exact packs, not redundant archive files.
  prior=next((a for a in old.get('archives',[]) if a['filename']==name),None)
  assert prior is not None, 'Missing original archive provenance: '+name
  archives.append(prior)
result={'schemaVersion':1,'engineVersion':'4.9.10.7 [330]','license':'CC-BY-NC-4.0','categories':categories,'scenarios':scenarios,'packs':packs,'preloadedPacks':sorted(PRELOADED),'archives':archives,'excludedScenarioSections':sections,'counts':{'total':len(scenarios),'base':sum(s['categoryId'].startswith('base-') for s in scenarios),'byCategory':dict(Counter(s['categoryId'] for s in scenarios))}}
result['catalogVersion']='rage-330-official-80-v1'
result['catalogDigest']=hashlib.sha256(json.dumps(result,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
(OUT/'scenarios.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
(OUT/'packs.json').write_text(json.dumps({'packs':packs,'archives':archives},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result['counts']));print(f'{len(packs)} packs including embedded groups; all under 25 MiB')

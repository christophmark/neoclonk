#!/usr/bin/env python3
"""Inventory the unchanged official Clonk Rage release and Goldmine scenario."""
import hashlib, json, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent
FILES = ROOT / 'import/files'
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def ini(path):
    result, section = {}, None
    for raw in path.read_text(encoding='latin-1').splitlines():
        line = raw.strip()
        if not line or line.startswith((';','#')): continue
        if line.startswith('[') and line.endswith(']'):
            section = line[1:-1]
            result.setdefault(section, {})
        elif '=' in line and section:
            key,value = line.split('=',1)
            result[section][key] = value
    return result
def actions(path):
    result = []
    if not path.exists(): return result
    for block in re.split(r'\[Action\]', path.read_text(encoding='latin-1'))[1:]:
        action = {}
        for raw in block.splitlines():
            line=raw.strip()
            if '=' in line and not line.startswith((';','#')):
                key,value=line.split('=',1)
                action[key]=value
        result.append(action)
    return result
scenario = FILES / 'Worlds.c4f/Goldmine.c4s'
core_ids = {'CLNK','GLDM','OREM','GOAL','GOLD','HUT2','FLAG','FLNT','TFLN','SFLN','ELEV','WRKS','SAWM','CHEM','EGLN','EGRS','LORY','TRE1','TRE2','TRE3','TRE4'}
defs = {}
for core in sorted((FILES/'Objects.c4d').rglob('DefCore.txt')):
    data = ini(core)
    ident = data.get('DefCore',{}).get('id')
    if ident in core_ids:
        defs[ident]={'path':str(core.parent.relative_to(FILES)), 'definition':data, 'actions':actions(core.parent/'ActMap.txt')}
manifest = {
    'format':'neoclonk-original-goldmine-v1',
    'source':{'releasePage':'http://www.clonk.de/cr.php?lng=en','download':'http://www.clonkx.de/rage/cr_game_linux.tar.bz2','archiveSha256':sha(ROOT/'downloads/cr_game_linux.tar.bz2'),'engineVersion':'4.9.10.7 [330]','versionEvidence':'Embedded strings in official clonk64 binary; matches user-supplied engine source.'},
    'license':{'content':'CC-BY-NC-4.0','url':'https://creativecommons.org/licenses/by-nc/4.0/','originalPublisher':'RedWolf Design / Matthes Bender','preservation':'All extracted asset and script bytes are unchanged. Extraction and this manifest are the only additions.','files':['licenses/clonk_content_license.txt','licenses/clonk_trademark_license.txt']},
    'scenario':{'path':str(scenario.relative_to(FILES)),'configuration':ini(scenario/'Scenario.txt'),'fixedMap':False,'customScript':False,'generation':'Original C4MapCreator/C4Landscape and engine RNG using Scenario.txt; there is no canonical fixed Goldmine bitmap.','fulfillment':{'solidGoldPixelsLessThan':150,'looseGoldObjectsEqual':0,'source':'Objects.c4d/Goals.c4d/Goldmine.c4d/Script.c','sellingSource':'Objects.c4d/Goals.c4d/Oremine.c4d/Script.c'},'files':[{ 'path':str(p.relative_to(FILES)), 'bytes':p.stat().st_size, 'sha256':sha(p)} for p in sorted(scenario.iterdir()) if p.is_file()]},
    'requiredRuntimeGroups':['Objects.c4d','Material.c4g','Graphics.c4g','System.c4g','Sound.c4g','Music.c4g','Worlds.c4f'],
    'packs':[{ 'path':str(p.relative_to(ROOT)), 'bytes':p.stat().st_size, 'sha256':sha(p)} for p in sorted((ROOT/'release/cr_game_linux').iterdir()) if p.is_file()],
    'keyDefinitions':defs,
    'completeFileInventory':'import/manifest.json',
    'note':'The generic import manifest flattens repeated INI Action sections. Use original ActMap.txt or this manifest keyDefinitions actions list, which retains every section.'
}
(ROOT/'goldmine-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Wrote {len(defs)} key definitions and {len(manifest["packs"])} pack/file hashes.')

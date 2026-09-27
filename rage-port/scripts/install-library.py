#!/usr/bin/env python3
"""Stage the exact original supplemental packs and the scenario gallery catalog."""
from pathlib import Path
import json, shutil, hashlib
ROOT=Path(__file__).resolve().parents[2];PORT=ROOT/'rage-port'
catalog=json.loads((PORT/'catalog/scenarios.json').read_text())
for dest in [PORT/'dist',ROOT/'web/public/rage']:
 shutil.copytree(PORT/'catalog',dest/'catalog',dirs_exist_ok=True)
 (dest/'packs').mkdir(parents=True,exist_ok=True)
 for pack in catalog['packs']:
  if pack.get('embedded'):continue
  source=ROOT/pack['sourcePath'];target=dest/'packs'/pack['filename']
  if hashlib.sha256(source.read_bytes()).hexdigest()!=pack['sha256']:raise RuntimeError('Original pack changed: '+pack['filename'])
  if not target.exists() or target.stat().st_size!=source.stat().st_size or hashlib.sha256(target.read_bytes()).hexdigest()!=pack['sha256']:shutil.copy2(source,target)
 for script in (PORT/'shell').glob('*.js'):shutil.copy2(script,dest/script.name)
 shutil.copy2(PORT/'shell/index.html',dest/'index.html')
 shutil.copytree(PORT/'shell/assets',dest/'assets',dirs_exist_ok=True)
print('Staged',len(catalog['scenarios']),'original scenarios and separate unchanged content packs.')

#!/usr/bin/env python3
"""Reconstruct a missing source tree from the pinned checkout and saved patch."""
from pathlib import Path
import shutil,subprocess,json
P=Path(__file__).resolve().parents[1];S=P/'source';U=P/'upstream/clonk_planet'
m=json.loads((P/'source-manifest.json').read_text())
if not S.exists():
    if not U.exists():
        U.parent.mkdir(parents=True,exist_ok=True)
        subprocess.run(['git','clone',m['upstream'],str(U)],check=True)
    subprocess.run(['git','-C',str(U),'checkout','--detach',m['commit']],check=True)
    for name in ('engine','standard'):shutil.copytree(U/name,S/name)
    subprocess.run(['patch','-p1','--binary','-i',str(P/'patches/linux-to-browser.patch')],cwd=S,check=True)
subprocess.run(['python3',str(P/'scripts/provenance.py')],check=True)

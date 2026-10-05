#!/usr/bin/env python3
"""Verify vendor provenance, untouched release packs and actual RNG implementation."""
from pathlib import Path
import subprocess,hashlib,json
P=Path(__file__).resolve().parents[1];R=P.parent
subprocess.run(['python3',str(P/'scripts/provenance.py')],check=True)
release=R/'planet-content/original/planet-release'
records=[]
for file in sorted((P/'data').iterdir()):
    if not file.is_file() or file.suffix.lower() not in ('.c4d','.c4g','.c4f','.c4p'):continue
    source=release/file.name
    assert source.is_file(),f'Missing original release: {source}'
    assert file.read_bytes()==source.read_bytes(),f'Changed original data: {file}'
    records.append({'path':file.name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(P/'build').mkdir(exist_ok=True)
subprocess.run(['c++','-std=c++17',str(P/'tests/random.cpp'),'-o',str(P/'build/random-test')],check=True)
subprocess.run([str(P/'build/random-test')],check=True)
(P/'build/verified-data.json').write_text(json.dumps(records,indent=2)+'\n')
print(f'Verified {len(records)} untouched original data groups')

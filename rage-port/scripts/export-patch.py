#!/usr/bin/env python3
"""Capture every browser/Clang change relative to the untouched user archive."""
from pathlib import Path
import difflib, hashlib, json
root=Path(__file__).resolve().parents[2]
original=root/'cr_source'; port=root/'rage-port'; source=port/'source'
patch=[]; manifest=[]
for p in sorted(source.rglob('*')):
 if not p.is_file(): continue
 relative=p.relative_to(source); old=original/relative
 before=old.read_bytes() if old.exists() else b''; after=p.read_bytes()
 if before==after: continue
 if b'\0' in before or b'\0' in after: raise RuntimeError(f'Unexpected binary change: {relative}')
 patch.extend(difflib.diff_bytes(difflib.unified_diff,before.splitlines(True),after.splitlines(True),fromfile=('a/'+str(relative)).encode() if old.exists() else b'/dev/null',tofile=('b/'+str(relative)).encode()))
 manifest.append({'path':str(relative),'originalSha256':hashlib.sha256(before).hexdigest() if old.exists() else None,'portedSha256':hashlib.sha256(after).hexdigest()})
(port/'patches/original-to-browser.patch').write_bytes(b''.join(patch))
(port/'patches/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'{len(manifest)} files changed; pristine original archive remains untouched.')

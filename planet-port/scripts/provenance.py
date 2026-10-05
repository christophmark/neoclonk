#!/usr/bin/env python3
"""Record or verify every browser source byte against the pinned Linux adapter."""
from pathlib import Path
import argparse, hashlib, json, difflib
P = Path(__file__).resolve().parents[1]
COMMIT = 'b7004562bca547e1a8e1bbe3314cee32b03a29c8'
sha = lambda data: hashlib.sha256(data).hexdigest()
a=argparse.ArgumentParser();a.add_argument('--write',action='store_true');args=a.parse_args()
manifest=P/'source-manifest.json'
if not args.write:
    recorded=json.loads(manifest.read_text())
    bad=[r['path'] for r in recorded['files'] if not (P/'source'/r['path']).is_file() or sha((P/'source'/r['path']).read_bytes())!=r['browserSha256']]
    if bad: raise SystemExit('Source checksum mismatch: '+', '.join(bad))
    print(f"Verified {len(recorded['files'])} browser source files")
else:
    records=[];patch=bytearray()
    for file in sorted((P/'source').rglob('*')):
        if not file.is_file():continue
        rel=file.relative_to(P/'source');base=P/'upstream/clonk_planet'/rel
        before=base.read_bytes() if base.exists() else b'';after=file.read_bytes()
        records.append({'path':str(rel),'upstreamSha256':sha(before) if base.exists() else None,'browserSha256':sha(after),'modified':before!=after})
        if before!=after:
            patch.extend(b''.join(difflib.diff_bytes(difflib.unified_diff,before.splitlines(True),after.splitlines(True),fromfile=('a/'+str(rel)).encode() if base.exists() else b'/dev/null',tofile=('b/'+str(rel)).encode())))
    manifest.write_text(json.dumps({'upstream':'https://github.com/Teero888/clonk_planet','commit':COMMIT,'files':records},indent=2)+'\n')
    (P/'patches/linux-to-browser.patch').write_bytes(patch)
    print(f'Recorded {len(records)} files, {sum(r["modified"] for r in records)} changed, patch {len(patch)} bytes')

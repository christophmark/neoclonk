#!/usr/bin/env python3
"""Repeatable allowlisted export; never copies workspace Git history or credentials."""
from pathlib import Path
import argparse,hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser();ap.add_argument('--output',default=str(ROOT/'github-source'));args=ap.parse_args();OUT=Path(args.output).resolve()
assert OUT == ROOT/'github-source', 'Export is restricted to this workspace’s dedicated github-source directory'
OUT.mkdir(parents=True,exist_ok=True)
allowed=set()
blocked={'.git','.openai','.wrangler','.next','node_modules','__pycache__','build','dist','outputs','.DS_Store'}
def include(path, target=None):
 p=ROOT/path
 if not p.exists():return
 if p.is_dir():
  for child in sorted(p.rglob('*')):
   rel=child.relative_to(p)
   if child.is_file() and not child.is_symlink() and not any(part in blocked or part.startswith('.env') for part in rel.parts) and child.suffix not in {'.pyc','.o','.a','.log','.tsbuildinfo','.dll','.lib','.exe','.pdb'}:include(str(child.relative_to(ROOT)),str(Path(target or path)/rel))
 else:
  destination=OUT/(target or path);destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,destination);allowed.add(str(destination.relative_to(OUT)))
for p in ['cr_source','rage-port/source','rage-port/scripts','rage-port/tests','rage-port/patches','rage-port/shell','rage-port/catalog','rage-port/data','docs','tools','web/app','web/public','web/tests']:
 include(p)
for p in ['rage-port/README.md','rage-port/PLATFORM_PORT.md','rage-port/config.h','rage-port/patch-platform.py','rage-port/deps/README.md','rage-port/deps/build-openssl.py','rage-port/deps/test-openssl.py','rage-port/deps/crypto-smoke.c','web/package.json','web/package-lock.json','web/next.config.ts','web/next-env.d.ts','web/postcss.config.mjs','web/tsconfig.json','web/eslint.config.mjs','web/vite-env.d.ts','original-content/README.md','original-content/goldmine-manifest.json','original-content/build-manifest.py','original-content/licenses','original-content/provenance','native-reference/README.md','native-reference/replay-verification.json','native-reference/browser-replay-report.json','native-reference/browser-replay.mjs','native-reference/pack-player.mjs']:
 include(p)
include('docs/GITHUB_README.md','README.md')
def generated(name,content):
 p=OUT/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content);allowed.add(name)
generated('web/vite.config.ts','import vinext from "vinext";\nimport { defineConfig } from "vite";\nexport default defineConfig({ plugins: [vinext()] });\n')
generated('.gitignore','.toolchains/\nnode_modules/\n**/node_modules/\n**/.env*\n**/.wrangler/\n**/.next/\n**/__pycache__/\n**/*.pyc\n**/*.tsbuildinfo\nrage-port/build/\nrage-port/dist/\nrage-port/outputs/\nrage-port/deps/openssl-*/\nrage-port/deps/*.tar.gz\nweb/dist/\nweb/outputs/\ngithub-source/\n')
# Delete obsolete files only inside this dedicated generated mirror; never .git.
for p in OUT.rglob('*'):
 if p.is_file() and '.git' not in p.relative_to(OUT).parts and str(p.relative_to(OUT)) not in allowed:p.unlink()
manifest={name:{'bytes':(OUT/name).stat().st_size,'sha256':hashlib.sha256((OUT/name).read_bytes()).hexdigest()} for name in sorted(allowed)}
generated('EXPORT-MANIFEST.json',json.dumps({'files':manifest},indent=2)+'\n')
print(f'Exported {len(allowed)} files to {OUT}; no workspace Git history or hosting credentials included.')

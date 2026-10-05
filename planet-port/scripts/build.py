#!/usr/bin/env python3
from pathlib import Path
import argparse,subprocess,concurrent.futures,os
P=Path(__file__).resolve().parents[1];R=P.parent;S=P/'source';B=P/'build';SDK=R/'.toolchains/emsdk/upstream/emscripten'
B.mkdir(parents=True,exist_ok=True);(P/'dist').mkdir(parents=True,exist_ok=True)
a=argparse.ArgumentParser();a.add_argument('--only');a.add_argument('--compile-only',action='store_true');a.add_argument('--jobs',type=int,default=6);args=a.parse_args()
common=['-O1','-g1','-DC4ENGINE','-DLINUX','-sUSE_GLFW=3','-sUSE_FREETYPE=1','-sUSE_ZLIB=1','-Wno-everything']+[f'-I{S/x}' for x in ['engine/inc','standard/inc','standard/inc/external','standard/unibase']]
fingerprint=' '.join(common)+' gnu++17 fms-extensions fexceptions gnu99'
stamp=B/'flags.txt';force=not stamp.exists() or stamp.read_text()!=fingerprint
stamp.write_text(fingerprint)
sources=sorted([*S.glob('engine/src/*.cpp'),*S.glob('standard/src/*.cpp'),*S.glob('standard/unibase/*.c'),*S.glob('standard/unibase/*.cpp')])
newest=max(p.stat().st_mtime for p in S.rglob('*.h'))
def compile(src):
 rel=src.relative_to(S);o=B/'obj'/str(rel).replace('/','_');o=o.with_suffix('.o');o.parent.mkdir(parents=True,exist_ok=True)
 if not force and o.exists() and o.stat().st_mtime>max(src.stat().st_mtime,newest):return None
 cpp=src.suffix=='.cpp';cmd=[str(SDK/('em++' if cpp else 'emcc')),*common,*(['-std=gnu++17','-fms-extensions','-fexceptions'] if cpp else ['-std=gnu99']),'-c',str(src),'-o',str(o)]
 p=subprocess.run(cmd,capture_output=True,text=True);(B/(str(rel).replace('/','_')+'.log')).write_text(p.stdout+p.stderr)
 if p.returncode:return str(rel)+'\n'+p.stderr[:5500]
 print('OK '+str(rel),flush=True)
selected=[s for s in sources if not args.only or args.only in str(s.relative_to(S))]
with concurrent.futures.ThreadPoolExecutor(args.jobs) as pool:errors=[e for e in pool.map(compile,selected) if e]
for e in errors:print(e,flush=True)
if errors:raise SystemExit(f'{len(errors)} compile failures')
if args.compile_only or args.only:raise SystemExit(0)
objects=[str((B/'obj'/str(s.relative_to(S)).replace('/','_')).with_suffix('.o')) for s in sources]
cmd=[str(SDK/'em++'),*objects,*common,'-fexceptions','-sDISABLE_EXCEPTION_CATCHING=0','-sEMULATE_FUNCTION_POINTER_CASTS=1','-sALLOW_MEMORY_GROWTH=1','-sSTACK_SIZE=4194304','-sINITIAL_MEMORY=134217728','-sMIN_WEBGL_VERSION=2','-sMAX_WEBGL_VERSION=2','-sASSERTIONS=1','-sEXIT_RUNTIME=0','-sFORCE_FILESYSTEM=1','-sEXPORTED_RUNTIME_METHODS=FS,ccall,cwrap','--pre-js',str(P/'adapters/stdio.js'),'--preload-file',str(P/'data')+'@/data','-o',str(P/'dist/planet.js')]
p=subprocess.run(cmd,capture_output=True,text=True);(B/'link.log').write_text(p.stdout+p.stderr);print(p.stdout+p.stderr);raise SystemExit(p.returncode)

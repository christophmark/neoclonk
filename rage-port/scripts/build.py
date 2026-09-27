#!/usr/bin/env python3
"""Compile the original Makefile's engine and bundled libraries for the browser."""
from pathlib import Path
import re, subprocess, concurrent.futures, argparse, os, shutil
ROOT=Path(__file__).resolve().parents[2]; PORT=ROOT/'rage-port'; SRC=PORT/'source'; BUILD=PORT/'build'; SDK=ROOT/'.toolchains/emsdk/upstream/emscripten'
BUILD.mkdir(parents=True,exist_ok=True)
config=PORT/'config.h'
if config.exists() and (not (BUILD/'config.h').exists() or (BUILD/'config.h').read_bytes()!=config.read_bytes()):
    (BUILD/'config.h').write_bytes(config.read_bytes())
ap=argparse.ArgumentParser(); ap.add_argument('--jobs',type=int,default=4); ap.add_argument('--only'); ap.add_argument('--compile-only',action='store_true'); args=ap.parse_args()
active=[True]; values={}; flags={'SDL_MAIN_LOOP','INTERNAL_PNG','INTERNAL_JPEG','INTERNAL_FREETYPE'}
for raw in (SRC/'Makefile.am').read_text().replace('\\\n',' ').splitlines():
    line=raw.strip()
    if line.startswith('if '): active.append(active[-1] and line[3:] in flags); continue
    if line=='else': active[-1]=active[-2] and not active[-1]; continue
    if line=='endif': active.pop(); continue
    if not active[-1]: continue
    match=re.match(r'(\w+)\s*(\+?=)\s*(.*)',line)
    if match:
        key,op,value=match.groups(); values[key]=(values.get(key,[]) if op=='+=' else [])+value.split()
sources=[]
for key in ['clonk_SOURCES','libstandard_a_SOURCES','libpng_a_SOURCES','libjpeg_a_SOURCES','libzlib_a_SOURCES','libfreetype_a_SOURCES']:
    sources += [s for s in values[key] if s.endswith(('.c','.cpp')) and s!='standard/gl/glew.c']
for extra in ['standard/src/StdEmscriptenGL.cpp','engine/src/C4Browser.cpp','engine/src/C4BrowserAudio.cpp','engine/src/C4BrowserSave.cpp','engine/src/C4BrowserNetwork.cpp']:
    if (SRC/extra).exists(): sources.append(extra)
includes=[PORT/'deps/openssl-1.0.2u/include',BUILD,SRC/'standard',SRC/'standard/inc',SRC/'standard/zlib',SRC/'standard/lpng121',SRC/'standard/jpeglib',SRC/'standard/freetype2',SRC/'engine',SRC/'engine/inc',SRC/'engine/sec']
common=['-O1','-g1','-DHAVE_CONFIG_H','-DC4ENGINE','-DGLEW_STATIC','-sUSE_SDL=1','-Wno-everything']+[f'-I{p}' for p in includes]
# Build flags/header changes invalidate the complete compile cache.
fingerprint=' '.join(common)+(BUILD/'config.h').read_text()
stamp=BUILD/'flags.txt'; force=not stamp.exists() or stamp.read_text()!=fingerprint
stamp.write_text(fingerprint)
headers=max(p.stat().st_mtime for p in SRC.rglob('*.h'))
def compile_file(name):
    src=SRC/name; obj=BUILD/'obj'/(name+'.o'); obj.parent.mkdir(parents=True,exist_ok=True)
    depfile=Path(str(obj)+'.d')
    dependencies=[src]
    if depfile.exists():
        dependencies += [Path(p) for p in depfile.read_text().replace('\\\n',' ').split(':',1)[1].split() if Path(p).exists()]
    latest=max(p.stat().st_mtime for p in dependencies) if depfile.exists() else max(src.stat().st_mtime,headers)
    if not force and obj.exists() and obj.stat().st_mtime>latest: return None
    cpp=src.suffix=='.cpp'; command=[str(SDK/('em++' if cpp else 'emcc')),*common]
    if cpp: command+=['-std=gnu++17','-fms-extensions','-fexceptions']
    else: command+=['-std=gnu99','-Wno-implicit-function-declaration']
    if name.startswith('standard/freetype2/'): command+=['-DFT2_BUILD_LIBRARY']
    command+=['-MMD','-MF',str(obj)+'.d','-c',str(src),'-o',str(obj)]
    p=subprocess.run(command,capture_output=True,text=True)
    (BUILD/(name.replace('/','_')+'.log')).write_text(p.stdout+p.stderr)
    if p.returncode: return name+'\n'+p.stderr[:6500]
    print('OK '+name,flush=True)
    return None
selected=[s for s in sources if not args.only or args.only in s]
errors=[]
with concurrent.futures.ThreadPoolExecutor(args.jobs) as pool:
    for result in pool.map(compile_file,selected):
        if result: errors.append(result); print(result,flush=True)
if errors: print(f'{len(errors)} compilation units failed'); raise SystemExit(1)
if args.compile_only or args.only: raise SystemExit(0)
engine_objects=[str(BUILD/'obj'/(s+'.o')) for s in sources if s.startswith('engine/')]
standard_objects=[str(BUILD/'obj'/(s+'.o')) for s in sources if s.startswith('standard/')]
# Preserve the original archive linkage: FreeType ftbase includes several units
# also listed individually, which must be extracted on demand rather than forced.
archive=BUILD/'libstandard-bundled.a'
if archive.exists(): archive.unlink()
subprocess.run([str(SDK/'emar'),'rcs',str(archive),*standard_objects],check=True)
objects=engine_objects+[str(archive)]
subprocess.run(['python3',str(PORT/'scripts/patch-emscripten.py')],check=True)
link_output=BUILD/'link-output';link_output.mkdir(exist_ok=True)
command=[str(SDK/'em++'),*objects,str(PORT/'deps/openssl-1.0.2u/libcrypto.a'),'-O1','-g1','-fexceptions','-sDISABLE_EXCEPTION_CATCHING=0','-sUSE_SDL=1','-sLEGACY_GL_EMULATION=1','-sASYNCIFY=1','-sASYNCIFY_STACK_SIZE=262144','-sEMULATE_FUNCTION_POINTER_CASTS=1','-sGL_UNSAFE_OPTS=0','-sALLOW_MEMORY_GROWTH=1','-sSTACK_SIZE=4194304','-sINITIAL_MEMORY=134217728','-sASSERTIONS=1','-sEXIT_RUNTIME=1','-sFORCE_FILESYSTEM=1','-lidbfs.js','-sEXPORTED_RUNTIME_METHODS=FS,IDBFS,addRunDependency,removeRunDependency,ccall,cwrap','--preload-file',str(PORT/'data')+'@/data','-o',str(link_output/'clonk.js')]
(PORT/'dist').mkdir(exist_ok=True)
print('Linking original engine...',flush=True)
result=subprocess.run(command)
if result.returncode: raise SystemExit(result.returncode)
# Keep the currently served runtime intact while the compiler writes its outputs.
for filename in ['clonk.wasm','clonk.data','clonk.js']:
    shutil.copy2(link_output/filename,PORT/'dist'/(filename+'.new'))
    (PORT/'dist'/(filename+'.new')).replace(PORT/'dist'/filename)
shutil.copy2(PORT/'shell/index.html',PORT/'dist/index.html')
shutil.copy2(PORT/'shell/game.js',PORT/'dist/game.js')
shutil.copytree(PORT/'shell/assets',PORT/'dist/assets',dirs_exist_ok=True)

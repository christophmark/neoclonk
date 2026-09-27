#!/usr/bin/env python3
"""Compile verbatim original control/digging excerpts with explicit fixture boundaries.
This is a focused regression probe, not a playable replacement engine.
"""
from pathlib import Path
import hashlib,json,re,subprocess,shutil
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'cr_source'
BUILD=ROOT/'rage-port/tests/build'
BUILD.mkdir(parents=True,exist_ok=True)
manifest={}
def read(path):
    raw=(SOURCE/path).read_bytes(); manifest[path]=hashlib.sha256(raw).hexdigest(); return raw.decode('latin1')
def function(text,signature):
    start=text.index(signature); opening=text.index('{',start);depth=1;end=opening+1
    # Selected functions have no braces inside string literals.
    while depth:
        depth += (text[end]=='{')-(text[end]=='}');end+=1
    return text[start:end]
def branch(text,case,nextcase):
    start=text.index(case); end=text.index(nextcase,start+len(case));
    # Preserve original branch bytes, comments included, until following case.
    return text[start:end]
obj=read('engine/src/C4Object.cpp');player=read('engine/src/C4Player.cpp')
com=read('engine/src/C4ObjectCom.cpp');fixed=read('standard/inc/Fixed.h')
constants=read('engine/inc/C4Constants.h');objheader=read('engine/inc/C4Object.h');info=read('engine/inc/C4InfoCore.h')
classic=obj[obj.index('// Control by procedure'):obj.index('void C4Object::AutoStopUpdateComDir')]
execaction=obj[obj.index('void C4Object::ExecAction()'):]
walk=branch(classic,'case DFA_WALK:','case DFA_FLIGHT:')
dig=branch(classic,'case DFA_DIG:','case DFA_SWIM:')
digexec=branch(execaction,'case DFA_DIG:','case DFA_SWIM:')
(BUILD/'Fixed.h').write_bytes((SOURCE/'standard/inc/Fixed.h').read_bytes())
(BUILD/'StdCompiler.h').write_text('''#pragma once
// Serialization is outside this probe; no fixed-point operation uses this adapter.
struct StdCompiler { struct NotFoundException {}; void Character(char&) {} template<class T> void Value(T) {} };
''')
(BUILD/'StdAdaptors.h').write_text('''#pragma once
template<class T,class U> T& mkCastAdapt(U& value) { return *reinterpret_cast<T*>(&value); }
''')
consts=constants[constants.index('const int C4DoubleClick'):constants.index('//=================================== SendCommand')]
directions='\n'.join(line for line in objheader.splitlines() if line.startswith('#define COMD_') or line.startswith('#define DIR_'))
physical=function(info,'inline FIXED ValByPhysical')
header='''// Generated from unmodified supplied source; ISC notices retained in source-manifest.json.
#include <cstdint>
#include <cstddef>
#define ALWAYS_INLINE inline __attribute__((always_inline))
#include "Fixed.h"
using BYTE=uint8_t;using BOOL=int;
constexpr int TRUE=1,FALSE=0,DFA_WALK=0,DFA_DIG=5,CNAT_Bottom=8,CNAT_None=0,C4MaxPhysical=100000,C4CMD_Throw=7;
template<class T> bool Inside(T value,T low,T high) {return value>=low && value<=high;}
'''
fixture='''
struct C4Object;
void ObjectComMovement(C4Object*,int); bool ObjectComDig(C4Object*); void ObjectComUp(C4Object*);void ObjectComDownDouble(C4Object*);void ObjectComDigDouble(C4Object*);void ObjectComStop(C4Object*);void ObjectComStopDig(C4Object*);void PlayerObjectCommand(int,int);
struct MenuFixture { void ConvertCom(int&,int&,bool) {} };
struct Physical { int Dig=40000; };
struct C4Object {
 struct ActionState {int ComDir=0,Dir=1,Data=0,t_attach=0;} Action;
 struct ShapeFixture { bool attached=true; bool Attach(int&,int&,int){return attached;} } Shape;
 MenuFixture* Menu=nullptr;Physical physical;
 int procedure=DFA_WALK,Owner=0,x=0,y=0,Mobile=0,phaseAdvance=0,activations=0,upCalls=0,downCalls=0;
 FIXED xdir=itofix(0),ydir=itofix(0);
 void SetDir(int value){Action.Dir=value;}
 bool SetActionByName(const char* name){procedure=name[0]=='D'?DFA_DIG:DFA_WALK;return true;}
 void control(BYTE byCom){switch(procedure){
'''
fixture+=walk+dig+'}}\n void tick(){FIXED lLimit;int smpx,smpy,iPhaseAdvance=1; Physical* pPhysical=&physical;switch(procedure){'+digexec+'} phaseAdvance=iPhaseAdvance;}\n};\n'
fixture+=function(com,'BOOL ObjectActionDig(C4Object *cObj)')+'\n'
fixture+='''
// Boundary fixtures for commands outside the extracted branch. They do not model terrain or scripts.
void ObjectComMovement(C4Object* o,int direction){o->Action.ComDir=direction;}
bool ObjectComDig(C4Object* o){return ObjectActionDig(o);}
void ObjectComUp(C4Object* o){o->upCalls++;}
void ObjectComDownDouble(C4Object* o){o->downCalls++;}
void ObjectComDigDouble(C4Object* o){o->activations++;}
void ObjectComStop(C4Object* o){o->procedure=DFA_WALK;o->Action.ComDir=0;}
void ObjectComStopDig(C4Object* o){o->procedure=DFA_WALK;o->Action.ComDir=0;o->xdir=o->ydir=0;}
void PlayerObjectCommand(int,int){}
struct C4Player {
 C4Object* Cursor=nullptr;int LastCom=COM_None,LastComDelay=0,LastComDownDouble=0,PressedComs=0,ControlStyle=0;int events=0,lastEvent=0;
 void ResetCursorView(){}
 void DirectCom(BYTE cmd,int){events++;lastEvent=cmd;Cursor->control(cmd);}
 void InCom(BYTE,int);void ExecuteControl();
};
'''
fixture+=function(player,'void C4Player::InCom(BYTE byCom, int32_t iData)')+'\n'+function(player,'void C4Player::ExecuteControl()')
fixture+='''
static C4Object object;static C4Player player;
extern "C" {
void probe_reset(int facing,int dig){object=C4Object();player=C4Player();player.Cursor=&object;object.Action.Dir=facing;object.physical.Dig=dig;}
void probe_input(int com){player.InCom(static_cast<BYTE>(com),0);}
void probe_tick(){object.tick();player.ExecuteControl();}
void probe_attach(int value){object.Shape.attached=value;}
int probe_value(int field){switch(field){case 0:return object.procedure;case 1:return object.Action.ComDir;case 2:return object.Action.Dir;case 3:return object.xdir.val;case 4:return object.ydir.val;case 5:return player.LastComDelay;case 6:return object.Action.Data;case 7:return object.activations;case 8:return player.events;case 9:return player.lastEvent;case 10:return object.phaseAdvance;case 11:return player.LastCom;default:return -1;}}
}
'''
(BUILD/'gameplay-probe.cpp').write_text(header+directions+'\n'+consts+'\n'+physical+'\n'+fixture)
exports=['probe_reset','probe_input','probe_tick','probe_attach','probe_value']
flags=['-std=c++17','-O2','-fwrapv','-fno-rtti','-I'+str(BUILD)]
subprocess.run(['g++',*flags,'-shared','-fPIC',str(BUILD/'gameplay-probe.cpp'),'-o',str(BUILD/'gameplay-probe.so')],check=True)
compiler=ROOT/'engine-port/.toolchains/wasi-sdk-24.0-x86_64-linux/bin/clang++'
subprocess.run([str(compiler),*flags,'-nostdlib++','-mexec-model=reactor',str(BUILD/'gameplay-probe.cpp'),'-Wl,--strip-all',*['-Wl,--export='+name for name in exports],'-o',str(BUILD/'gameplay-probe.wasm')],check=True)
(BUILD/'source-manifest.json').write_text(json.dumps({'files':manifest,'scope':'Verbatim classic WALK/DIG control branches, DIG action branch, ObjectActionDig, Player InCom/ExecuteControl, original Fixed.h and ValByPhysical. Boundary fixtures exclude collision, VM, materials, menus and full engine.','license':str(SOURCE/'licenses/clonk_source_license.txt')},indent=2)+'\n')
print('Built unchanged original control/digging excerpts natively and as WebAssembly.')

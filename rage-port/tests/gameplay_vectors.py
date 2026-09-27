#!/usr/bin/env python3
"""Assertions and oracle vectors from the native original-code probe."""
import ctypes,json
from pathlib import Path
lib=ctypes.CDLL(str(Path(__file__).parent/'build/gameplay-probe.so'))
for name,nargs in [('probe_reset',2),('probe_input',1),('probe_tick',0),('probe_attach',1),('probe_value',1)]:
    fn=getattr(lib,name);fn.argtypes=[ctypes.c_int]*nargs;fn.restype=ctypes.c_int if name=='probe_value' else None
ops=[]
def call(name,*args):
    value=getattr(lib,name)(*args);ops.append([name,list(args),value]);return value
def tick(count=1):
    for _ in range(count):
        call('probe_tick')
        for field in range(12):call('probe_value',field)
def value(field):return call('probe_value',field)
def press(command):call('probe_input',command)
# Original COM_Dig=6; delayed DigSingle begins action only after >10 control executions.
for facing,expected_direction in [(0,6),(1,4)]:
    call('probe_reset',facing,40000);press(6);tick(10);assert value(0)==0
    tick();assert value(0)==5;assert value(1)==expected_direction
    tick();assert abs(value(3))==32768 and value(4)==32768
    # Even an explicitly injected release cannot stop classic Dig (native keyboard filters it upstream).
    press(22);tick(30);assert value(0)==5;assert value(1)==expected_direction
    press(4);assert value(0)==0 and value(1)==0
# Double press activates instead of starting the delayed single Dig action.
call('probe_reset',1,40000);press(6);tick(2);press(6);assert value(7)==1;assert value(0)==0
# Switching to a different command flushes pending DigSingle, then rotates its direction.
call('probe_reset',1,40000);press(6);press(1);assert value(0)==5 and value(1)==5
# Same direction repeated rapidly becomes a double event, it is not a second rotation.
press(1);assert value(1)==5
tick(12);press(1);assert value(1)==6
tick(12);press(1);assert value(1)==7
tick(12);press(1);assert value(1)==8
tick(12);press(1);assert value(1)==8
# Dig material request toggles, while delayed Dig double invokes activation.
tick(12);press(6);tick(11);assert value(6)==1
press(6);tick(11);assert value(6)==0
# Original Dig refuses to continue without bottom attachment (boundary reports unattached).
call('probe_attach',0);tick();assert value(0)==0
# Fixed-point speeds and direction rotation across physical capabilities.
for physical in [1,1000,12345,40000,50000,70000,100000]:
    for facing in [0,1]:
        call('probe_reset',facing,physical);press(6);tick(12)
        assert abs(value(3))==value(4) # exact original downward45-degree components
        for command in [2]*8+[1]*8:
            press(command);tick(12)
            direction=value(1);vx=value(3);vy=value(4)
            if direction in (2,8):assert vy==-abs(vx)//2 or vy==-(abs(vx)//2)
            if direction in (3,7):assert vy==0
            if direction in (4,6):assert vy==abs(vx)
print(json.dumps({'operations':ops,'assertions':'Classic delayed single and double Dig; persistent action after release; exact downward45-degree fixed components; left/right rotation and bounds; upward half slope; Dig material request toggle; attachment failure; 7 physical strengths × 2 facings.'}))

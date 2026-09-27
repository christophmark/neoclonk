#!/usr/bin/env python3
"""Validate browser metadata parsing against independent ffprobe on original audio."""
import concurrent.futures,ctypes,json,subprocess,struct
from pathlib import Path
from fractions import Fraction
ROOT=Path(__file__).resolve().parents[2]
BUILD=ROOT/'rage-port/tests/build';BUILD.mkdir(exist_ok=True)
subprocess.run(['g++','-std=c++17','-O2','-DC4_BROWSER_AUDIO_PARSER_ONLY','-shared','-fPIC',str(ROOT/'rage-port/source/engine/src/C4BrowserAudio.cpp'),'-o',str(BUILD/'browser-audio-parser.so')],check=True)
lib=ctypes.CDLL(str(BUILD/'browser-audio-parser.so'));parse=lib.C4BrowserSoundInfo
parse.argtypes=[ctypes.c_void_p,ctypes.c_size_t,*([ctypes.POINTER(ctypes.c_int)]*3)];parse.restype=ctypes.c_int

def decode(data):
    buf=ctypes.create_string_buffer(data);ms=ctypes.c_int();rate=ctypes.c_int();legacy=ctypes.c_int()
    result=parse(buf,len(data),ctypes.byref(ms),ctypes.byref(rate),ctypes.byref(legacy))
    return result,ms.value,rate.value,legacy.value

def check(path):
    result,ms,rate,legacy=decode(path.read_bytes());assert result, str(path)
    proc=subprocess.run(['ffprobe','-v','error','-select_streams','a:0','-show_entries','stream=sample_rate,duration_ts,time_base','-of','json',str(path)],check=True,capture_output=True,text=True)
    reference=json.loads(proc.stdout)['streams'][0]
    duration=int(reference['duration_ts'])*Fraction(reference['time_base'])
    assert rate==int(reference['sample_rate']),str(path)
    assert ms==int(duration*1000),(str(path),ms,int(duration*1000))
    converted_frames=int(duration*44100)
    expected_legacy=((converted_frames*4*1000)&0xffffffff)//88200
    assert legacy==expected_legacy,(str(path),legacy,expected_legacy)
    return path.suffix.lower(),ms

files=[p for p in (ROOT/'original-content/import/files').rglob('*') if p.suffix.lower() in ('.wav','.ogg')]
assert files,'Matching original content is required.'
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(check,files))
# Truncated chunks, bogus offsets, arbitrary data and missing Vorbis end page reject cleanly.
for data in [b'',b'no audio',b'RIFF'+struct.pack('<I',0xffffffff)+b'WAVE',b'OggS'+bytes(23),b'RIFF'+struct.pack('<I',12)+b'WAVEfmt '+struct.pack('<I',99)]:
    assert decode(data)[0]==0
for path in files[:8]:
    data=path.read_bytes()
    for end in [1,8,12,26,len(data)//2]:assert decode(data[:end])[0]==0,(str(path),end)
print(f'PASS: {len(results)} original audio files match independent ffprobe duration/rate; legacy converted-byte lifetime arithmetic matches; malformed/truncated files reject.')
print(json.dumps({'wav':sum(x[0]=='.wav' for x in results),'ogg':sum(x[0]=='.ogg' for x in results),'max_ms':max(x[1] for x in results)}))

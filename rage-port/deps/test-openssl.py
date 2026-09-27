#!/usr/bin/env python3
from pathlib import Path
import subprocess
base=Path(__file__).resolve().parent
sdk=base.parents[1]/'.toolchains/emsdk/upstream/emscripten'
source=base/'openssl-1.0.2u'
# The upstream fixture key is public test data, never a production key.
subprocess.run(['openssl','dgst','-sha1','-sign',str(source/'apps/server.pem'),'-out',str(base/'signature.bin')],input=b'abc',check=True)
command=[str(sdk/'emcc'),str(base/'crypto-smoke.c'),str(source/'libcrypto.a'),'-I'+str(source/'include'),'-O1','-sENVIRONMENT=node','--embed-file',str(source/'apps/server.pem')+'@/certificate.pem','--embed-file',str(base/'signature.bin')+'@/signature.bin','-o',str(base/'crypto-smoke.js')]
subprocess.run(command,check=True)
subprocess.run(['node',str(base/'crypto-smoke.js')],check=True)

#!/usr/bin/env python3
"""Build the genuine legacy OpenSSL API needed by the original Rage engine."""
from pathlib import Path
import hashlib, os, subprocess, urllib.request, tarfile
base=Path(__file__).resolve().parent
root=base.parents[1]
sdk=root/'.toolchains/emsdk/upstream/emscripten'
archive=base/'openssl-1.0.2u.tar.gz'
source=base/'openssl-1.0.2u'
url='https://github.com/openssl/openssl/archive/refs/tags/OpenSSL_1_0_2u.tar.gz'
expected='82fa58e3f273c53128c6fe7e3635ec8cda1319a10ce1ad50a987c3df0deeef05'
if not archive.exists(): urllib.request.urlretrieve(url,archive)
if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected: raise SystemExit('OpenSSL archive checksum mismatch')
if not source.exists():
    with tarfile.open(archive) as tar: tar.extractall(base,filter='data')
    (base/'openssl-OpenSSL_1_0_2u').rename(source)
config=['perl','Configure','linux-generic32','no-asm','no-shared','no-threads','no-dso','no-engine','no-hw','no-sock','no-comp','no-ssl2','no-ssl3']
with (base/'openssl-configure.log').open('w') as log:
    subprocess.run(config,cwd=source,stdout=log,stderr=subprocess.STDOUT,check=True)
with (base/'openssl-depend.log').open('w') as log:
    subprocess.run(['make','depend'],cwd=source,stdout=log,stderr=subprocess.STDOUT,check=True)
command=['make','-j4','build_crypto',f'CC={sdk}/emcc',f'AR={sdk}/emar r',f'RANLIB={sdk}/emranlib','CFLAG=-O1 -Wno-everything -DOPENSSL_NO_ASM']
with (base/'openssl-build.log').open('w') as log:
    subprocess.run(command,cwd=source,stdout=log,stderr=subprocess.STDOUT,check=True)
print(source/'libcrypto.a')
print(source/'include')

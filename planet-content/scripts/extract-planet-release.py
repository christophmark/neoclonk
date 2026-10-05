#!/usr/bin/env python3
"""Read the publisher's GkWare Planet installer without executing Windows code."""
from pathlib import Path
import hashlib,json,struct,zlib
ROOT=Path(__file__).resolve().parents[2]
archive=ROOT/'planet-content/incoming/cp465us_free.exe'
raw=archive.read_bytes()
# Checked outer self-extractor stream from this exact publisher release.
stream=zlib.decompressobj();payload=stream.decompress(raw[33488:],64*1024*1024)
assert stream.eof and not stream.unconsumed_tail
files={};pos=0
while pos<len(payload):
 name=payload[pos:pos+260].split(b'\0')[0].decode('cp1252');size=struct.unpack_from('<Q',payload,pos+260)[0]
 assert name and size<=len(payload)-pos-268
 data=payload[pos+268:pos+268+size]
 if name in files:assert files[name]==data
 files[name]=data;pos+=268+size
assert pos==len(payload)
packed=files['SETUP.DA_'];data=zlib.decompress(packed[8:]);assert data.startswith(b'This is a binary data file.')
# NORMAL section offset and length are recorded in the installer table.
start,length=struct.unpack_from('<II',data,154);assert start==450
pos=start;end=start+length;out=ROOT/'planet-content/original/planet-release';out.mkdir(parents=True,exist_ok=True);records=[]
while pos<len(data):
 name=data[pos:pos+260].split(b'\0')[0].decode('cp1252')
 size=struct.unpack_from('<Q',data,pos+288)[0];stored=struct.unpack_from('<I',data,pos+300)[0]
 assert size==stored and pos+320+stored<=len(data)
 body=data[pos+320:pos+320+stored];pos+=320+stored
 # Installer's directory marker is not a path to extract.
 if name=='..' and size==0:break
 path=Path(name.replace('\\','/'));assert not path.is_absolute() and '..' not in path.parts
 assert hashlib.md5(body).digest()==data[pos-stored-16:pos-stored]
 dest=out/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(body)
 records.append({'path':str(dest.relative_to(ROOT)),'bytes':size,'sha256':hashlib.sha256(body).hexdigest()})
assert sum(r['bytes'] for r in records)==length
report={'publisherUrl':'http://www.clonkx.de/planet/cp465us_free.exe','listingUrl':'http://www.clonk.de/classics.php?lng=en','sourceSha256':hashlib.sha256(raw).hexdigest(),'sourceBytes':len(raw),'method':'GkWare zlib self-extractor and NORMAL section; each file verified against installer MD5; no executable run','files':records}
(ROOT/'planet-content/provenance/planet-release.json').write_text(json.dumps(report,indent=2)+'\n')
print('Extracted and verified',len(records),'original release files')

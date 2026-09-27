// Write a fresh player group using the published C4Group layout; no key/tool checks.
import {readFile,rename,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {readGroup} from '../tools/import-content.mjs';
export function packPlayer(bytes){
 const header=Buffer.alloc(204),entry=Buffer.alloc(316);
 header.write('RedWolf Design GrpFolder');header.writeInt32LE(1,28);header.writeInt32LE(2,32);header.writeInt32LE(1,36);
 for(let i=0;i<header.length;i++)header[i]^=237;
 for(let i=0;i+2<header.length;i+=3)[header[i],header[i+2]]=[header[i+2],header[i]];
 entry.write('Player.txt');entry.writeInt32LE(bytes.length,268);
 const packed=gzipSync(Buffer.concat([header,entry,bytes]));packed[0]=0x1e;packed[1]=0x8c;
 const roundtrip=readGroup(packed);if(roundtrip.length!==1||!roundtrip[0].bytes.equals(bytes))throw Error('Player archive roundtrip failed');
 return packed;
}
if(process.argv.length===4){const bytes=await readFile(process.argv[2]);const packed=packPlayer(bytes);await writeFile(process.argv[3],packed);console.log(process.argv[3],packed.length,'bytes');}

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const vectors=spawnSync('python3',[fileURLToPath(new URL('./gameplay_vectors.py',import.meta.url))],{encoding:'utf8',maxBuffer:32*1024*1024});
assert.equal(vectors.status,0,vectors.stderr);
const oracle=JSON.parse(vectors.stdout);
const bytes=await readFile(new URL('./build/gameplay-probe.wasm',import.meta.url));
const module=await WebAssembly.compile(bytes);
const imports=WebAssembly.Module.imports(module);
assert.deepEqual(imports,[], 'This focused probe should not need browser/native host services.');
const instance=await WebAssembly.instantiate(module,{});
instance.exports._initialize?.();
for(let i=0;i<oracle.operations.length;i++){
  const [name,args,expected]=oracle.operations[i];
  const result=instance.exports[name](...args);
  assert.equal(result===undefined?null:result,expected,`Native/WASM divergence ${i}: ${name}(${args})`);
}
console.log(`PASS ${oracle.operations.length} native/WASM operations from verbatim original control/digging source.`);
console.log(oracle.assertions);
console.log('Scope: focused original-code unit regression; collision, scripts, material, scene initialization and full-engine parity remain separate gates.');

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readGroup, importContent } from './import-content.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));

function group(name, content = Buffer.from('data'), child = false) {
  const header = Buffer.alloc(204), entry = Buffer.alloc(316);
  header.write('RedWolf Design GrpFolder');
  header.writeInt32LE(1, 28); header.writeInt32LE(2, 32); header.writeInt32LE(1, 36);
  for (let i = 0; i < header.length; i++) header[i] ^= 237;
  for (let i = 0; i + 2 < header.length; i += 3) [header[i], header[i + 2]] = [header[i + 2], header[i]];
  entry.write(name); entry.writeInt32LE(child ? 1 : 0, 264); entry.writeInt32LE(content.length, 268);
  return Buffer.concat([header, entry, content]);
}

test('extracts actual original C4 gzip editor templates and reads metadata', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'neoclonk-content-test-'));
  try {
    const output = path.join(directory, 'definition');
    const manifest = await importContent(path.join(root, 'cr_source/editor/res/New.c4d'), output);
    assert.equal(manifest.definitions.length, 1);
    assert.deepEqual(manifest.files.find(entry => entry.path === 'Graphics.png').image, { width: 70, height: 64, format: 'png' });
    assert.equal(manifest.fileCount, 6);
    for (const entry of manifest.files) assert.equal((await readFile(path.join(output, 'files', entry.path))).length, entry.bytes);
    await assert.rejects(importContent(path.join(root, 'cr_source/editor/res/New.c4d'), output), /already exists/);
    for (const filename of ['New.c4s', 'NewFolder.c4d']) {
      const bytes = await readFile(path.join(root, 'cr_source/editor/res', filename));
      assert.ok(readGroup(bytes).length > 0);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('reads uncompressed child groups while preserving nested names', () => {
  const entries = readGroup(group('Child.c4d', group('DefCore.txt', Buffer.from('[DefCore]\nid=TEST')), true));
  assert.equal(entries[0].path, 'Child.c4d/DefCore.txt');
  assert.equal(entries[0].bytes.toString(), '[DefCore]\nid=TEST');
});

test('rejects traversal, truncation, malformed signatures, and excessive depth', () => {
  assert.throws(() => readGroup(group('../escape.txt')), /Unsafe/);
  assert.throws(() => readGroup(group('C:\\escape.txt')), /Unsafe/);
  assert.throws(() => readGroup(group('file.txt').subarray(0, 520)), /Truncated/);
  assert.throws(() => readGroup(Buffer.alloc(204)), /signature/);
  let nested = group('leaf.txt');
  for (let i = 0; i < 34; i++) nested = group('child.c4g', nested, true);
  assert.throws(() => readGroup(nested), /nesting/);
});

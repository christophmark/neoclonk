#!/usr/bin/env node
/** Offline Clonk Rage C4Group/content importer. Never executes imported scripts.
 * Format derived from cr_source/engine/{inc/C4Group.h,src/C4Group.cpp} and
 * cr_source/standard/zlib/gzio.c; original source license: engine-port/dist/LICENSE-CLONK.txt.
 */
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADER_SIZE = 204, ENTRY_SIZE = 316;
const MAX_BYTES = 512 * 1024 * 1024, MAX_FILES = 50000, MAX_DEPTH = 32;
const GROUP_EXTENSION = /\.(c4g|c4d|c4s|c4f)$/i;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };
function safeName(name) {
  if (!name || name === '.' || name === '..' || /[\x00-\x1f<>:"/\\|?*]/.test(name) || /[. ]$/.test(name)) fail(`Unsafe content entry name: ${JSON.stringify(name)}`);
  return name;
}
function zeroTerminated(bytes) { const end = bytes.indexOf(0); return bytes.subarray(0, end < 0 ? bytes.length : end).toString('latin1'); }
function unscramble(bytes) {
  const header = Buffer.from(bytes);
  for (let i = 0; i < header.length; i++) header[i] ^= 237;
  for (let i = 0; i + 2 < header.length; i += 3) [header[i], header[i + 2]] = [header[i + 2], header[i]];
  return header;
}

/** Parse both gzip/C4 gzip containers and uncompressed nested groups. */
export function readGroup(input, prefix = '', depth = 0, budget = { bytes: 0, files: 0 }) {
  if (depth > MAX_DEPTH) fail('Content group nesting exceeds 32 levels.');
  let bytes = input;
  if ((bytes[0] === 0x1e && bytes[1] === 0x8c) || (bytes[0] === 0x1f && bytes[1] === 0x8b)) {
    const gzip = Buffer.from(bytes); gzip[0] = 0x1f; gzip[1] = 0x8b;
    bytes = gunzipSync(gzip, { maxOutputLength: MAX_BYTES });
  }
  if (bytes.length < HEADER_SIZE) fail('Truncated C4Group header.');
  const header = unscramble(bytes.subarray(0, HEADER_SIZE));
  if (zeroTerminated(header.subarray(0, 28)) !== 'RedWolf Design GrpFolder') fail('Invalid C4Group signature.');
  if (header.readInt32LE(28) !== 1 || header.readInt32LE(32) < 0 || header.readInt32LE(32) > 2) fail('Unsupported C4Group version.');
  const count = header.readInt32LE(36);
  if (count < 0 || count > MAX_FILES || HEADER_SIZE + count * ENTRY_SIZE > bytes.length) fail('Invalid C4Group entry table.');
  const entries = [], seen = new Set();
  let offset = HEADER_SIZE + count * ENTRY_SIZE;
  for (let i = 0; i < count; i++) {
    const entry = bytes.subarray(HEADER_SIZE + i * ENTRY_SIZE, HEADER_SIZE + (i + 1) * ENTRY_SIZE);
    const name = safeName(zeroTerminated(entry.subarray(0, 260)));
    if (seen.has(name.toLowerCase())) fail(`Duplicate C4Group entry: ${name}`);
    seen.add(name.toLowerCase());
    const size = entry.readInt32LE(268), child = entry.readInt32LE(264) !== 0;
    if (size < 0 || offset + size > bytes.length) fail(`Truncated C4Group entry: ${name}`);
    const content = bytes.subarray(offset, offset + size); offset += size;
    const relative = prefix ? `${prefix}/${name}` : name;
    if (child) entries.push(...readGroup(content, relative, depth + 1, budget));
    else {
      budget.bytes += size; budget.files++;
      if (budget.bytes > MAX_BYTES || budget.files > MAX_FILES) fail('Content exceeds the importer size/file limit.');
      entries.push({ path: relative, bytes: content });
    }
  }
  if (offset !== bytes.length) fail('Unexpected trailing C4Group data.');
  return entries;
}

function parseIni(bytes) {
  const sections = {}; let section = 'default';
  for (const original of bytes.toString('latin1').split(/\r?\n/)) {
    const line = original.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const heading = /^\[([^\]]+)\]$/.exec(line);
    if (heading) { section = heading[1]; continue; }
    const equals = line.indexOf('=');
    if (equals > 0) (sections[section] ??= {})[line.slice(0, equals).trim()] = line.slice(equals + 1).trim();
  }
  return sections;
}
function imageSize(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: 'png' };
  if (bytes.length >= 26 && bytes.toString('ascii', 0, 2) === 'BM' && bytes.readUInt32LE(14) >= 40) return { width: bytes.readInt32LE(18), height: Math.abs(bytes.readInt32LE(22)), format: 'bmp' };
  return undefined;
}
async function collect(source, prefix = '', depth = 0, budget = { bytes: 0, files: 0 }) {
  if (depth > MAX_DEPTH) fail('Content directory nesting exceeds 32 levels.');
  const stat = await lstat(source);
  if (stat.isSymbolicLink()) fail(`Symbolic links are not imported: ${source}`);
  if (stat.isDirectory()) {
    const entries = [];
    for (const name of (await readdir(source)).sort()) {
      safeName(name);
      entries.push(...await collect(path.join(source, name), prefix ? `${prefix}/${name}` : name, depth + 1, budget));
    }
    return entries;
  }
  if (!stat.isFile() || stat.size > MAX_BYTES) fail(`Unsupported or oversized source: ${source}`);
  const bytes = await readFile(source);
  if (GROUP_EXTENSION.test(source)) return readGroup(bytes, prefix, depth, budget);
  budget.bytes += bytes.length; budget.files++;
  if (budget.bytes > MAX_BYTES || budget.files > MAX_FILES) fail('Content exceeds the importer size/file limit.');
  return [{ path: prefix || safeName(path.basename(source)), bytes }];
}

export async function importContent(sourcePath, destinationPath) {
  const source = path.resolve(sourcePath), destination = path.resolve(destinationPath);
  if (destination === source || destination.startsWith(source + path.sep)) fail('Choose an output outside the content source.');
  try { await lstat(destination); fail('Output already exists; choose a new output directory.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Parse/validate every group before writing anything.
  const entries = await collect(source);
  const seen = new Set();
  for (const entry of entries) {
    const key = entry.path.toLowerCase();
    if (seen.has(key)) fail(`Duplicate output entry: ${entry.path}`);
    seen.add(key);
  }
  const files = entries.map(entry => ({ path: entry.path, bytes: entry.bytes.length, sha256: digest(entry.bytes), image: imageSize(entry.bytes) }));
  const definitions = entries.filter(entry => /(^|\/)DefCore\.txt$/i.test(entry.path)).map(entry => {
    const directory = path.posix.dirname(entry.path), fields = parseIni(entry.bytes);
    const actions = entries.find(candidate => candidate.path.toLowerCase() === (directory === '.' ? 'ActMap.txt' : `${directory}/ActMap.txt`).toLowerCase());
    return { path: directory, id: fields.DefCore?.id ?? fields.DefCore?.Id ?? null, definition: fields, actions: actions ? parseIni(actions.bytes) : null };
  });
  const manifest = {
    format: 'neoclonk-content-inventory-v1', sourceName: path.basename(source),
    compatibility: 'Inventory/extraction only. Original scripts are retained but not executed by the development simulation.',
    fileCount: files.length, totalBytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
    definitions, attributionFiles: files.filter(entry => /(^|\/)(author|authors|license|licence|copying|copyright)(\.|$)/i.test(entry.path)).map(entry => entry.path), files,
  };
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.import-${process.pid}-${Date.now()}`;
  await mkdir(temporary);
  try {
    for (const entry of entries) {
      const target = path.join(temporary, 'files', ...entry.path.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, entry.bytes, { flag: 'wx' });
    }
    await writeFile(path.join(temporary, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await rename(temporary, destination);
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, destination] = process.argv.slice(2);
  if (!source || !destination) {
    console.error('Usage: node tools/import-content.mjs <original .c4g/.c4d/.c4s or directory> <new output directory>');
    process.exitCode = 1;
  } else {
    try {
      const manifest = await importContent(source, destination);
      console.log(`Imported ${manifest.fileCount} files (${manifest.totalBytes} bytes), ${manifest.definitions.length} definitions to ${path.resolve(destination)}.`);
      console.log('Manifest preserves hashes, dimensions, definition/action metadata, and attribution file paths.');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}

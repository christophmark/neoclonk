# Original content import

Extract and inventory original Clonk Rage groups or an unpacked content folder:

```sh
node tools/import-content.mjs /path/to/Objects.c4d /path/to/new-content-import
```

The destination must be a new directory. The importer writes original files under `files/` and a `manifest.json` with SHA-256 file hashes, PNG/BMP dimensions, definition IDs and fields, action metadata, and attribution/license file paths. It supports `.c4g`, `.c4d`, `.c4s`, `.c4f`, nested groups, ordinary gzip, and Rage's modified gzip signature. It preserves script and asset bytes without executing or modifying them.

The group layout comes from the supplied `C4Group.h`, `C4Group.cpp`, and modified `gzio.c`. Parsing retains the original sequential entry layout and applies explicit bounds/name checks. Existing outputs, symlinks, path traversal, duplicate names, truncated data, and excessive nesting are rejected. Imports are staged and renamed after completion; no partial output is published on failure. The default limits are 512 MiB expanded content, 50,000 files, and 32 group/directory levels. This initial tool is not a replacement for the engine's complete archive API, including update/patch behavior or all historical encodings.

The importer does not automatically publish content into `web/public` and does not make imported scenarios playable. The development simulation currently uses procedural geometry. Rendering original sprite sheets and executing original scripts require the corresponding renderer/engine integration. Preserve original content terms and attribution when subsequently packaging assets; engine source licensing does not cover game content.

Tests use the original editor's packaged templates as real format fixtures, plus nested/malformed synthetic groups:

```sh
node --test tools/import-content.test.mjs
```

# Browser runtime data: exact original Goldmine

The seven packed content groups in this directory are byte-for-byte copies from the official **Clonk Rage 4.9.10.7 [330]** base release. They total approximately 23.9 MB together with licenses, settings, and the native replay. `content-manifest.json` records every runtime file's SHA-256 and provenance. No legacy prototype assets are used.

| Pack | Purpose |
| --- | --- |
| Objects.c4d | All original object scripts, sprite sheets, action maps and definitions |
| Material.c4g | Original materials and terrain textures |
| Graphics.c4g | Original interface, portraits, skies and loading images |
| System.c4g | Original system scripts and **Endeavour.ttf** font |
| Sound.c4g | Original game sounds |
| Music.c4g | Original music |
| Worlds.c4f | Original **Goldmine.c4s** scenario, unchanged |

Content by **RedWolf Design / Matthes Bender**, licensed **CC BY-NC 4.0**: <https://creativecommons.org/licenses/by-nc/4.0/>. Original licenses are included. “Clonk” is a registered trademark of Matthes Bender. The engine ISC license is separate. The browser adaptation is not endorsed by the original authors.

## Start directly in Goldmine

Emscripten linker preload option, from the repository root:

```sh
--preload-file rage-port/data@/data
```

Use the canonical `rage-port/shell/index.html`. Its arguments are:

```js
[
  '/config:/data/home/browser.cfg',
  '/fullscreen',
  '/nosplash',
  '/data/home/players/Browser.c4p',
  'Worlds.c4f/Goldmine.c4s'
]
```

It sets `thisProgram='/data/clonk'`, mounts IDBFS at `/data/home`, and holds an Emscripten run dependency while `FS.syncfs(true)` restores local files. On the first visit only, it seeds `browser.cfg` and `Browser.c4p` into that mount. It creates `/data/home/.clonk/rage` and `/home/web_user/.clonk/rage`, then sets cwd to `/data` before main. Empty directories need explicit creation because preload packaging may omit them, and original `CreateDirectory` is not recursive.

The linker must include `-lidbfs.js` and export `FS,IDBFS,addRunDependency,removeRunDependency`. `DefinitionPath="/data/"` needs its trailing slash because the original engine concatenates the filename directly. `PlayerPath="home/players/"` is relative to the executable path. Original save/record/screenshot folders are explicitly under `home/`, because these routines use cwd instead of `UserPath`.

No original savegame routines are replaced: the original player menu creates `.c4s` savegames. The shell only synchronizes their bytes to this browser's local IndexedDB and offers saved round files for original-engine loading. Nothing is uploaded. F9 is the original **screenshot** key; saving is through the R player menu.

**`/fullscreen` selects the original playable game frontend; it is not a request for browser fullscreen.** Without it, an explicit scenario defaults to the original developer console. The browser platform adapter should keep the canvas in the page; no browser fullscreen request is needed.

`browser.cfg` uses 960×720, original fonts, shader option off (for the browser's original fixed-function rendering path), and no first-run UI. The fresh `Browser.c4p` uses the original keyboard set 1 and classic persistent controls (`AutoStopControl=0`). No preexisting trained crew is supplied, so the original scenario creates its normal initial Clonk.

Original sound and music are enabled in all four `[Sound]` settings. The browser audio adapter plays the supplied original audio packs; the start button provides the initial browser interaction. Previously persisted local settings remain the player’s settings and can be changed through the original engine options.

### Classic keyboard set 1 (English)

```
Q previous crew   W select/toggle   E next crew
A throw           S up/jump         D dig
Z left            X stop/down       C right
```

Press and release C, then press and release D: the original Clonk continues digging diagonally down-right until stopped or obstructed. Direction is persistent, unlike jump-and-run mode.

## Native replay fixture

For a direct native/browser replay comparison, replace the final scenario argument with:

```
verification/NativeGoldmine.c4s
```

This fixture was recorded and finalized by the unmodified official Linux binary using the original Goldmine scenario, RNG seed `1790505353`, and actual keyboard input. It includes the persistent 45-degree dig sequence. The native screenshots and log are in `native-reference/`. The replay is for testing; the default launch uses the original unmodified Goldmine scenario with a fresh random landscape.

The native recording embeds its exact fresh 143-byte packed player profile. No external player-path alias or trained replacement profile is used. Browser.c4p is also a packed group so future recordings can embed its initial profile correctly.

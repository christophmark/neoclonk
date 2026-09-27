# Original Clonk Rage content: Goldmine

This directory contains the **unchanged official Clonk Rage 4.9.10.7 [330] base release**, downloaded from the link on the publisher's Clonk Rage page. It is the matching version of the user-supplied `cr_source/`, not LegacyClonk or OpenClonk content.

## Provenance and licensing

- Release page: <http://www.clonk.de/cr.php?lng=en>
- Publisher-linked archive: <http://www.clonkx.de/rage/cr_game_linux.tar.bz2>
- Archive SHA-256: `b1415d5323590028c285aab20eb1e822f452013694e6aadc0a6c240becc73a4c`
- Version evidence: `clonk64` contains `4.9.10.7 [330]`.
- Original game content: **RedWolf Design / Matthes Bender**, [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Preserve the original content license and credits when serving these assets. This is a noncommercial browser adaptation; no endorsement is implied.
- “Clonk” is a registered trademark of Matthes Bender. The original trademark license is also preserved.
- Licenses are copied verbatim under `licenses/`; the release and developer pages are archived under `provenance/`. Game content licensing is separate from the engine's ISC source license.

No scripts, artwork, sound, or original release files were modified. Importing only unpacks groups; the manifests and documentation are new. The whole release remains under `release/cr_game_linux/`, and the complete archive remains under `downloads/`.

## Paths for the browser engine

| Purpose | Original packed path under `release/cr_game_linux/` | Unpacked path under `import/files/` |
| --- | --- | --- |
| Definitions, sprites, actions, scripts | `Objects.c4d` | `Objects.c4d/` |
| Materials, terrain textures | `Material.c4g` | `Material.c4g/` |
| Original interface/sky/loading graphics | `Graphics.c4g` | `Graphics.c4g/` |
| System scripts | `System.c4g` | `System.c4g/` |
| Original sounds | `Sound.c4g` | `Sound.c4g/` |
| Original music | `Music.c4g` | `Music.c4g/` |
| Exact Goldmine scenario | `Worlds.c4f` | `Worlds.c4f/Goldmine.c4s/` |
| Classic Clonk sprites and actions | `Objects.c4d` | `Objects.c4d/Crew.c4d/Clonk.c4d/` |

`import/manifest.json` records every extracted file's hash and image dimensions: 4,259 files, 54,980,006 bytes, 465 definitions. **Its generic INI metadata flattens repeated `[Action]` sections**: use the original `ActMap.txt` for authoritative actions. `goldmine-manifest.json` retains all actions for the key Goldmine definitions, exact scenario configuration, pack hashes, and objective details.

Regenerate that manifest:

```sh
python3 original-content/build-manifest.py
```

For a clean extraction to a *new* destination:

```sh
node tools/import-content.mjs original-content/release/cr_game_linux original-content/import-new
```

## What “Goldmine exactly” means

The official scenario is `Worlds.c4f/Goldmine.c4s`, English title **Goldmine**. It has `Scenario.txt`, descriptions, and title artwork. It has **no `Map.bmp`, `Landscape.bmp`, or custom `Script.c`**: the original engine generates a landscape from the scenario configuration and random seed. An exact port must preserve the original map generator, landscape enlargement/texturing, initialization order and random number consumption. Inventing a handcrafted map would change the scenario.

The scenario defines:

- Goal `GLDM`, defined in `Objects.c4d/Goals.c4d/Goldmine.c4d/` and including `OREM`.
- One classic `CLNK`, one wooden hut `HUT2`, one flag `FLAG`, and 50 starting wealth per player.
- Original homebase inventory and replenishment, construction knowledge, trees, in-earth resources, seasonal weather, water and ten landscape layers. The full values are in the manifest and original `Scenario.txt`.
- Construction does not need materials, and structures do not require power. These are original scenario/default rules; no windmill restoration or invented quest belongs here.

**The original objective is not a zero-pixel counter.** `GLDM::IsFulfilled()` requires the solid Gold material count to have been initialized, be **less than 150 pixels**, and `ObjectCount(GOLD)` to be **zero**. Loose gold still exists while carried or held in a container. Players collect and sell loose chunks to the homebase, then buy flints to blast solid seams. The original description explicitly explains this loop. `OREM` records player sales for the result ranking.

**Solid gold is blasted, not dug.** `Material.c4g/Gold.c4m` has no `DigFree`, has `BlastFree=1`, creates `GOLD` objects at `Blast2ObjectRatio=75`, and has density 50. Earth digging must follow the engine's material flags. A system which digs straight through every seam cannot reproduce this scenario.

**The Clonk is an original animated sprite with original collision vertices.** `CLNK` is 16×20, offset −8,−10, with seven collision vertices. Its `Dig` action has `Procedure=DIG`, `DigFree=11`, 16 phases, delay 15, and sprite facet `0,60,16,20`. Original engine action/control routines determine the persistent direction and motion; these values alone do not implement original digging.

## Baseline executable

The archive includes the original Linux `clonk64` and `c4group64`. The unmodified `clonk64` has now been run successfully under an isolated Xvfb display using private extracted historical runtime libraries; nothing was installed system-wide. It loaded the exact Goldmine scenario, 345 definitions, 23,988 C4Script lines, and 21 materials with zero script warnings/errors. Actual keyboard input produced the original persistent 45-degree digging tunnel. See `native-reference/README.md`, `packed-clean-reference.log`, and `screenshots/packed-clean-dig.png`.

A fresh, valid original-engine recording (`004-Goldmine.c4s`, seed `1790505353`) embeds its initial untrained player. The browser C++/WASM engine replayed it through frame 680 with the same player **Reference**, Clonk **Newton**, and matching terrain/tunnel layout; the original synchronization checks raised no errors. Browser inspection reports Newton at x=181,y=356, 13 gold objects, 152 objects total, and RNG count 3650. This checks that recorded native scenario/control behavior matches through that sequence; it is not a blanket claim covering every scenario or visual effect. See `native-reference/browser-replay-report.json` and the paired native/browser screenshots.

## Complete official scenario catalog

The four additional publisher-linked packs have also been acquired unchanged: Knights, Far Worlds, Fantasy and Western. Their original ZIPs are preserved in `downloads/`; their eight packed groups are in `addons/release/`; the independent complete extraction is in `addons/import/all/`. The combined release contains **80 launchable scenarios**: 53 base and 27 add-on scenarios. Two additional Western Gold Rush scenario sections are internal content, not separate launches.

See `../rage-port/catalog/README.md`, `scenarios.json` and `packs.json` for all scenarios, exact cross-pack dependencies, original player limits, mission-access prerequisites, titles/descriptions/objectives and original preview hashes. This catalog records availability and original rules; browser playability and screenshot verification are tracked separately.

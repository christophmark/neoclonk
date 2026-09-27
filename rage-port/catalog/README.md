# Official Clonk Rage scenario catalog

`scenarios.json` catalogs all **80 launchable original scenarios** for Rage 4.9.10.7 [330]: 53 base scenarios plus 27 scenarios in the four publisher-linked add-ons. Content is unchanged. The catalog, extracted descriptions and metadata are new; the engine continues reading the original packed groups.

| Category | Scenarios |
| --- | ---: |
| Tutorial | 10 |
| Worlds | 13 |
| Missions | 13 |
| Melees | 10 |
| Races | 7 |
| Knights | 8 |
| Far Worlds | 3 |
| Fantasy | 4 |
| Western | 12 |

Western Gold Rush contains two additional `Scenario.txt` files in `SectAshCity.c4g` and `SectCaves.c4g`. These are internal sections of one scenario, not independent gallery entries.

## API

- `scenarios`: stable lowercase original path `id`, exact original mixed-case `path`, localized `titles`, English `title` and original description, `categoryId`, `minPlayers`, `maxPlayers`, `requirements`, `requiredPacks` filenames, `thumbnail`, and separate `screenshot`.
- `requiredPacks` includes every top-level group needed beyond the seven embedded base groups. Definitions within scenario folders remain inside the corresponding original `.c4f` pack. Cross-pack dependencies are retained: for example Tritonpath requires Knights, Fantasy and FarWorlds in addition to Races.
- `packs`: filename, repository-relative sourcePath, bytes, SHA-256, URL `packs/<filename>` and `embedded`. The 12 supplemental groups total 63,494,349 bytes. The largest is Western.c4d at 11,721,765 bytes. Every individual group is below 25 MiB.
- `goals` retains original configured ID/count pairs; `gameGoals` is the corresponding ID list. A missing configured goal is **not** proof that there is no objective: many missions initialize goals or complete the round in their original scripts. `configuration` retains all original Scenario.txt settings, and `scriptSources` retains script paths/hashes for inspection.
- `scriptPlayerCount` is zero: no CreateScriptPlayer calls occur in the imported original scenario/definition scripts. This does not mean a melee works with one human player. Original minimum player counts still apply.
- `missionAccess` and `grantsMissionAccess` expose original campaign prerequisites and literal script grants. The separate `legacySharewareAccess` field is a historical shareware flag, not a campaign prerequisite; the released freeware engine bypasses shareware scenario checks.
- `catalogVersion` identifies this schema/content generation. `catalogDigest` hashes the complete deterministic catalog before the digest field itself is added.

Minimum players follow `C4Scenario::GetMinPlayer`: explicit nonzero MinPlayer, otherwise two for MELE/MEL2, otherwise one. Maximum defaults to the original 12. These are original engine limits; the browser adapter must report its multiplayer support honestly.

## Original previews and new screenshots

All 80 entries have their original unchanged Title.png. 79 are 200×150; Knights/CoFuT is 202×150. Inspected Goldmine, first Tutorial and Miners Creek previews depict original in-game scenes. They are release previews, **not captures of the browser port**. `thumbnailSource` records each original hash, size and dimensions. `screenshot` is a separate nullable field reserved for a genuine new browser gameplay capture; the generator preserves existing populated screenshot fields. Final gallery QA must populate and verify those captures separately.

## Reproduce

```sh
node tools/import-content.mjs original-content/release/cr_game_linux original-content/import
node tools/import-content.mjs original-content/addons/release original-content/addons/import/all
python3 rage-port/catalog/build-catalog.py
```

The Python generator requires Pillow. Imported trees must already exist (the importer requires a fresh destination). Every dependency path and hosting size limit is checked during generation. `packs.json` repeats pack/archive provenance for deployment tooling.

## Provenance and licenses

The archived publisher release page is `original-content/provenance/clonk-release-page.html`, originally <http://www.clonk.de/cr.php?lng=en>. It links the unchanged base release and these add-on downloads:

- <http://www.clonkx.de/rage/cr_knights.zip>
- <http://www.clonkx.de/rage/cr_farworlds.zip>
- <http://www.clonkx.de/rage/cr_fantasy.zip>
- <http://www.clonkx.de/rage/cr_western.zip>

Exact archive SHA-256 hashes and pack hashes are in `scenarios.json` / `packs.json`. ZIP originals remain in `original-content/downloads/`; their eight unmodified packed groups remain in `original-content/addons/release/`. The add-on importer extracted 6,807 files, 52,843,706 bytes and 793 definitions; see its independent per-file manifest.

Original content: RedWolf Design / Matthes Bender and the original contributing authors, **CC BY-NC 4.0**. This includes original scripts, artwork, audio and text. Preserve original credits and the verbatim content and trademark licenses in `original-content/licenses/`. Clonk is a registered trademark of Matthes Bender; this noncommercial browser adaptation is not endorsed by the original authors. Engine code is licensed separately under its original ISC license. Download availability does not grant commercial reuse rights.

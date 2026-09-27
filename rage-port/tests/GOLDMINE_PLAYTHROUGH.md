# Original Gold Mine browser playthrough

The automated pilot drives the compiled original engine. It never edits terrain, inventories, position, wealth, goals or C4Script. `goldmine-command-pilot.mjs` uses the original `C4ControlPlayerCommand` input path, like original mouse orders, with read-only inspection. `goldmine-playthrough.mjs` separately verifies buying through the classic nine-key menus.

Run one graphics browser at a time on the software-rendered test host:

```sh
node rage-port/tests/goldmine-playthrough.mjs
node rage-port/tests/goldmine-command-pilot.mjs
```

The mission pilot performs:

1. Start the genuine dynamically generated `Worlds.c4f/Goldmine.c4s` with original definitions and scripts.
2. Allow the original Tick10 base initialization to attach the starting flag. Buying earlier correctly fails because the hut is not yet a valid base.
3. Buy a Super-Flint for ten wealth, retrieve it from the hut and leave through the original entrance.
4. Read the original material map, plan a diggable route around rock, granite, water and the base, and execute original Dig orders along that route. Planning is external; movement, digging radius, directional behavior and collisions remain original.
5. Reach beneath an edge of a gold seam and throw upward into it. Gold is not diggable. Ordinary drops have no initial vertical velocity and can settle without triggering the impact explosive; ordinary throws against the tunnel ceiling above a seam can miss it. The pilot verifies actual gold material reduction and additional collectible GOLD objects.
6. Retrieve newly created gold, return to the original hut and verify original automatic sale removes the delivered object. The hut may immediately spend the five wealth sale proceeds on its original energy regeneration stock; a successful sale need not produce a net wealth increase.

Observed original cycle: solid gold7368→7018, GOLD objects17→21, collect newly created object155, return from(407,455) to hut(561,235), loose/contained GOLD21→20, heal15000→50000; wealth40→40 reflects +5 sale and -5 base energy purchase.

The full scenario victory condition remains original: fewer than150 gold material pixels **and no GOLD objects anywhere**. A single mining/sale cycle is not a claim that the complete scenario has been won. A full autonomous mission also needs repeated explosives procurement, safe routing around newly opened terrain, recovery and collection of every original buried gold piece. Original Clonk normally carries one item; home-base explosive production and healing retain their original cost/timing.

Reports in `rage-port/outputs/goldmine-command-trace.json` include complete original state snapshots, material counts, command stacks and console errors. The route helper only chooses normal dig destinations from the observed map. A failed original command is treated as a planning failure and is not bypassed.

## Final scope and retained evidence

The final capped randomized pilot encountered a layout for which the current downward-only planner could not find a route around undiggable material, water and buried explosives. It stopped with an explicit planning error; further randomized retries were not used to conceal this limitation. Other observed layouts also exposed the original AI's difficulty leaving a narrow vertical shaft. A classic key-based wall-climb recovery is available in the pilot but is not claimed universally verified.

Stable evidence files:

- `rage-port/outputs/goldmine-cycle-observed.json`: exact observed seam-blast, new GOLD pickup, return, sale and healing values summarized from the earlier captured terminal output. Explicitly labeled as an observed loop, not a clean automated PASS.
- `rage-port/outputs/goldmine-planner-limit.json` and `.png`: retained final planning failure on a different genuine randomly generated original landscape.
- `rage-port/outputs/goldmine-audio-final.json`: original music decoded with an active WebAudio source and running context.

No full Gold Mine victory or universally successful autonomous pilot is claimed. These planner limitations are separate from the already observed original engine mining/sale mechanics.

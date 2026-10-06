# Planet browser validation

Tests use unchanged original group files and the separately compiled Planet engine. They exercise startup, original control input and a short simulation interval, not full completion of each scenario objective.

- `official-scenarios.json`: official scenario startup/control sweep.
- `mobile-webkit.json` and `mobile-chromium.json`: portrait viewport, zoom, touch movement, IndexedDB save, shared menu listing, reload and save again.
- `native-network.json`: two independent engine instances, 180 ordered original control frames, inputs from both players, RNG and native synchronization equality while only one peer polls touch metadata, malformed/foreign control rejection.
- `room-shell.json`: shared browser lobby, real WebRTC data channel, separate Planet runtimes, synchronization, shared pause/resume.

Scripts are in `planet-port/tests/`. Exact legacy Windows executable parity, all possible actions/goals and long-running device stability are not established by these smoke tests. MIDI music is not available in this browser build.

Hazard inventory checks (`hazard-inventory-chromium.json`, `hazard-inventory-webkit.json`) use the original Research Facility with a test-only starting inventory of three items. The script-provided action descriptions expose V/F automatically, with the one-Clonk crew-selection row hidden. Touch V and physical V cycle the native saved-object contents; three activations wrap to the original ordering. Info preserves the selection. Original double-click timing is allowed to expire between repeated inventory commands. The distributed scenario archive is unchanged. Screenshots inspect portrait and landscape layout.

Shared touch transitions are checked in `rage-port/tests/adaptive-touch.mjs` with Chromium and WebKit: optional actions, crew changes, menu fallback, releasing disappearing held actions, stable bottom controls and no layout work on unchanged polls. `rage-port/tests/browser-touch-menus.mjs` checks the Rage native shop in portrait/landscape and recruitment of another Clonk.

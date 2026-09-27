# Original-engine browser acceptance

Run `npm run test:browser` from `web/` with the app on port 3000.

```sh
NEOCLONK_URL=http://127.0.0.1:3000/ npm run test:browser
BROWSER=webkit npm run test:browser
```

The isolated Chromium/WebKit test checks the original-artwork menu before
engine download, full viewport sizing, header-only desktop controls, world zoom
with unchanged simulation and HUD, an original saved round persisted across
reload and loaded from the start screen, the pause/resume menu, and portrait /
landscape touch layout with the Clonk outside the touch pad. Reports and
screenshots are in `web/outputs/usability/`.

Focused original-engine checks live in `rage-port/tests/browser-view.mjs` and
`browser-save-export.mjs`. The earlier `original-browser.mjs` is the historical
acceptance harness for the previous toolbar UI; its gameplay evidence remains
in `outputs/original-browser/`, but it is not the current UI regression command.

## Mobile startup regression

Run `node tests/startup-storage.mjs`, then
`BROWSER=webkit node tests/startup-storage.mjs` (requires Playwright WebKit).
This holds the content download until IndexedDB finishes, reproducing the
startup order seen on a slower phone connection. It checks startup, retained
files after reload, original Pause, and startup when IndexedDB is unavailable.
WebKit runs in an isolated Linux process with an iPhone viewport; it does not
replace testing on physical iOS hardware.

`node tests/keyboard-layout.mjs` checks real touch Left, both hardware Y/Z
aliases, and Menu under original QWERTZ and QWERTY configurations. Run with
`BROWSER=webkit` for the WebKit path.

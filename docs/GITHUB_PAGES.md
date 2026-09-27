# Static game hosting

The game can run directly on GitHub Pages; no Node or React server is required.
Lobby discovery and optional TURN fallback use the separate endpoint in
`rage-port/shell/discovery-config.js`.

After staging the current runtime with `python3 rage-port/scripts/install-web.py`:

```sh
python3 tools/build-pages.py
python3 -m http.server 8080 --directory _site
```

The export includes the scenario packs, original license notices, port source
archive and home-screen icons. Its manifest and wrapper use relative URLs so
both a domain root and `https://ACCOUNT.github.io/neoclonk/` work. Room links
forward through the wrapper; native `/rage/` invite links also carry app metadata.
Saved games belong to the browser origin, so saves on another host need exporting
and importing through the game.

`.github/workflows/pages.yml` deploys staged assets on `main` pushes or manual
runs once Pages is enabled with **GitHub Actions** as its source. No cloud keys
are needed. Actions are pinned to verified official commits. The workflow does
not rebuild the original C++ engine: commit freshly staged `web/public/rage/`
assets when the engine or shell changes. `_site/` is a generated local artifact.

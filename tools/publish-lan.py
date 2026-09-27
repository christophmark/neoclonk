#!/usr/bin/env python3
"""Publish a complete static snapshot; building the game cannot break the LAN server."""
from datetime import datetime, timezone
from pathlib import Path
import os
import shutil

root = Path(__file__).resolve().parents[1]
source = root / '_site'
if not (source / '.neoclonk-pages-export').is_file():
    raise SystemExit('Run tools/build-pages.py first.')
destination = Path.home() / '.local/share/neoclonk-lan'
releases = destination / 'releases'
releases.mkdir(parents=True, exist_ok=True)
release = releases / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
shutil.copytree(source, release)
pending = destination / ('current-' + release.name)
pending.symlink_to(release, target_is_directory=True)
os.replace(pending, destination / 'current')
print('Published static LAN snapshot:', release)

#!/usr/bin/env python3
"""Apply browser platform changes to a fresh source copy; never edits cr_source."""
from pathlib import Path
import subprocess
base = Path(__file__).resolve().parent
patch = base / 'patches/browser-platform.patch'
# Fail before mutation when the source has diverged or is already patched.
command = ['patch', '-p1', '--forward', '--input', str(patch)]
subprocess.run(command + ['--dry-run'], cwd=base / 'source', check=True)
subprocess.run(command, cwd=base / 'source', check=True)

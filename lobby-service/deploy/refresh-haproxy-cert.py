#!/usr/bin/env python3
"""Atomically refresh HAProxy's private combined PEM; never print its contents."""
import argparse
import os
from pathlib import Path
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', default='/etc/neoclonk')
args = parser.parse_args()
target = Path(args.directory) / 'haproxy-certs'
target.mkdir(mode=0o700, parents=True, exist_ok=True)
target.chmod(0o700)
cert = Path('/etc/letsencrypt/live/neoclonk')
pem = (cert / 'fullchain.pem').read_bytes() + (cert / 'privkey.pem').read_bytes()
with tempfile.NamedTemporaryFile(dir=target, delete=False) as output:
    temporary = Path(output.name)
    os.fchmod(output.fileno(), 0o600)
    output.write(pem)
    output.flush()
    os.fsync(output.fileno())
temporary.replace(target / 'turn.pem')

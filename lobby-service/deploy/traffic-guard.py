#!/usr/bin/env python3
"""Conservative local NIC accounting. It is NOT an AWS billing cap."""
import argparse
from datetime import datetime, timezone
import fcntl
import json
from pathlib import Path
import re
import subprocess
import tempfile


def update(previous, *, month, boot_id, rx, tx):
    if not isinstance(rx, int) or not isinstance(tx, int) or min(rx, tx) < 0:
        raise ValueError('Invalid NIC counters')
    if previous:
        for k in ('rx', 'tx', 'bytes'):
            if not isinstance(previous.get(k), int) or previous[k] < 0:
                raise ValueError('Invalid saved accounting state')
        same_boot = previous.get('boot_id') == boot_id
        # On reset/reboot include all counters observed since reboot. Do not
        # subtract across reboot, and never infer zero from missing history.
        delta = sum(current - previous[key] if same_boot and current >= previous[key] else current
                    for key, current in (('rx', rx), ('tx', tx)))
        total = previous['bytes'] if previous.get('month') == month else 0
        cutoff = bool(previous.get('cutoff', False))
    else:
        delta, total, cutoff = rx + tx, 0, False
    return {'month': month, 'boot_id': boot_id, 'rx': rx, 'tx': tx,
            'bytes': total + delta, 'cutoff': cutoff}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='/etc/neoclonk/traffic-guard.json')
    parser.add_argument('--state', default='/var/lib/neoclonk/traffic.json')
    parser.add_argument('--enforce', action='store_true', help='Stop ONLY coturn if the limit is reached or accounting fails')
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text())
    interface = config['interface']
    if not re.fullmatch(r'[A-Za-z0-9_.:-]+', interface):
        raise ValueError('Invalid interface name')
    limit = config['limit_bytes']
    if not isinstance(limit, int) or limit <= 0:
        raise ValueError('Invalid byte limit')
    compose = Path(config['compose']).resolve()
    if compose != Path('/etc/neoclonk/compose.yaml'):
        raise ValueError('Refusing an unexpected Compose project path')
    state = Path(args.state)
    state.parent.mkdir(parents=True, exist_ok=True)
    with open(str(state) + '.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            previous = json.loads(state.read_text()) if state.exists() else None
            nic = Path('/sys/class/net') / interface / 'statistics'
            current = update(previous, month=datetime.now(timezone.utc).strftime('%Y-%m'),
                             boot_id=Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
                             rx=int((nic / 'rx_bytes').read_text()), tx=int((nic / 'tx_bytes').read_text()))
            cutoff = current['cutoff'] or current['bytes'] >= limit
        except (OSError, ValueError, KeyError, TypeError) as error:
            if args.enforce:
                subprocess.run(['docker', 'compose', '-f', str(compose), 'stop', 'coturn'], check=True)
            print(json.dumps({'status': 'accounting-unavailable', 'relayStopped': args.enforce,
                              'error': type(error).__name__}))
            return 2
        if cutoff and args.enforce:
            subprocess.run(['docker', 'compose', '-f', str(compose), 'stop', 'coturn'], check=True)
            current['cutoff'] = True
        with tempfile.NamedTemporaryFile('w', dir=state.parent, delete=False) as output:
            json.dump(current, output, indent=2)
            temporary = Path(output.name)
        temporary.chmod(0o600)
        temporary.replace(state)
        print(json.dumps({'status': 'cutoff' if cutoff else 'within-limit', 'bytes': current['bytes'],
                          'limitBytes': limit, 'month': current['month'], 'relayStopped': cutoff and args.enforce,
                          'billingCap': False}))
        return 75 if cutoff else 0


if __name__ == '__main__':
    raise SystemExit(main())

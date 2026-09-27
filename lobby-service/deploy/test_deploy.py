"""Offline tests for secrets, proxy boundaries, and byte-accounting transitions."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


def module(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


renderer, guard = module('render'), module('traffic-guard')


class DeploymentTest(unittest.TestCase):
    def test_secrets_and_network_boundaries(self):
        settings = {'lobby_domain': 'lobby.example.org', 'turn_domain': 'turn.example.org',
                    'public_ipv4': '8.8.8.8', 'private_ipv4': '172.26.1.2',
                    'allowed_origins': ['https://game.example.org'], 'interface': 'ens5'}
        with tempfile.TemporaryDirectory() as d:
            target, source = Path(d) / 'private', Path(d) / 'source'
            renderer.render(settings, target, source)
            self.assertNotIn('8443', (target / 'nginx.conf').read_text())
            old_secret = (target / 'turn.secret').read_text()
            renderer.render(settings, target, source, tls=True)
            self.assertEqual(old_secret, (target / 'turn.secret').read_text())
            self.assertEqual((target / 'turnserver.conf').stat().st_mode & 0o777, 0o600)
            turn = (target / 'turnserver.conf').read_text()
            self.assertIn('external-ip=8.8.8.8/172.26.1.2', turn)
            self.assertNotIn('denied-peer-ip=8.8.8.8', turn)
            self.assertIn('169.254.0.0-169.254.255.255', turn)
            self.assertIn('bind 127.0.0.1', (target / 'redis.conf').read_text())
            nginx = (target / 'nginx.conf').read_text()
            self.assertIn('listen 127.0.0.1:8443 ssl proxy_protocol;', nginx)
            self.assertIn('proxy_set_header X-Forwarded-For $remote_addr;', nginx)
            self.assertNotIn('$proxy_add_x_forwarded_for', nginx)
            self.assertIn('127.0.0.1:5348 send-proxy-v2', (target / 'haproxy.cfg').read_text())
            proxy = (target / 'haproxy.cfg').read_text()
            self.assertIn('bind 0.0.0.0:3478', proxy)
            self.assertIn('bind 0.0.0.0:5349 ssl crt ', proxy)
            self.assertIn('bind 127.0.0.1:5347 accept-proxy ssl crt ', proxy)
            self.assertIn('server tls 127.0.0.1:5347 send-proxy-v2', proxy)
            self.assertIn('no-tls\n', turn)
            self.assertNotIn('pkey=', turn)
            with self.assertRaises(ValueError):
                renderer.render(settings, source / 'secrets', source)
            settings['lobby_domain'] = 'bad; config injection'
            with self.assertRaises(ValueError):
                renderer.render(settings, target, source)

    def test_counter_initialization_reboot_rollover_and_cutoff_latch(self):
        state = guard.update(None, month='2026-09', boot_id='a', rx=100, tx=200)
        self.assertEqual(state['bytes'], 300)
        state = guard.update(state, month='2026-09', boot_id='a', rx=150, tx=230)
        self.assertEqual(state['bytes'], 380)
        state = guard.update(state, month='2026-09', boot_id='b', rx=10, tx=20)
        self.assertEqual(state['bytes'], 410)
        state['cutoff'] = True
        state = guard.update(state, month='2026-10', boot_id='b', rx=20, tx=40)
        self.assertEqual(state['bytes'], 30)
        self.assertTrue(state['cutoff'])
        with self.assertRaises(ValueError):
            guard.update({'bytes': -1}, month='2026-10', boot_id='b', rx=20, tx=40)


if __name__ == '__main__':
    unittest.main()

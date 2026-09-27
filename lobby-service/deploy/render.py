#!/usr/bin/env python3
"""Render host-specific configuration OUTSIDE source; never prints secrets."""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

IMAGES = {
    'coturn': 'coturn/coturn:4.18.0-r0@sha256:bbefd3e1fdfdc0d58770fe01b581fd8b00d9f3a5580d00acb77cf719a6bc78e3',
    'nginx': 'nginx:1.30.5-alpine@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94',
    'haproxy': 'haproxy:3.2.24-alpine@sha256:1aca32ee932b96d2a75f1882909325839dd23c138ba9c6fd26e4d88179f30f13',
    'redis': 'redis:8.6.7-alpine@sha256:ac2da09bc822f325a9f68f533120b86fa39c1b8db46b3aa7c1bbea7fdfd4fcba',
    'certbot': 'certbot/certbot:v5.8.0@sha256:f70ad0adbb7e117f0fe42a63c553f28ea451edabc0148757b6efcd9735acaa20',
}


def domain(value):
    if len(value) > 253 or not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?', value) or '.' not in value or '..' in value:
        raise ValueError('Use lowercase DNS hostnames, without a scheme or path')
    return value


def render(settings, directory, source, tls=False):
    directory, source = Path(directory).resolve(), Path(source).resolve()
    if directory == source or source in directory.parents:
        raise ValueError('Configuration contains secrets and must be outside the source tree')
    for p in (directory, source):
        if not re.fullmatch(r'/[A-Za-z0-9_./-]+', str(p)):
            raise ValueError('Use absolute paths without spaces or shell punctuation')
    lobby, turn = domain(settings['lobby_domain']), domain(settings['turn_domain'])
    if lobby == turn:
        raise ValueError('Lobby and TURN require different DNS names for TCP 443 routing')
    public, private = ipaddress.IPv4Address(settings['public_ipv4']), ipaddress.IPv4Address(settings['private_ipv4'])
    if not public.is_global or not private.is_private or private.is_loopback:
        raise ValueError('Expected a global static IPv4 and the Lightsail private interface IPv4')
    if not re.fullmatch(r'[A-Za-z0-9_.:-]+', settings['interface']):
        raise ValueError('Invalid network interface')
    origins = settings['allowed_origins']
    if not isinstance(origins, list) or not origins or any(not re.fullmatch(r'https?://[A-Za-z0-9.:-]+', o) for o in origins):
        raise ValueError('Provide allowed_origins as exact HTTP(S) origins without paths')
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(directory, 0o700)
    secret_path = directory / 'turn.secret'
    if secret_path.exists():
        secret = secret_path.read_text().strip()
        if not re.fullmatch(r'[a-f0-9]{64}', secret):
            raise ValueError('Existing turn.secret is invalid; refusing to replace it')
    else:
        secret = secrets.token_hex(32)
    def write(name, content, mode=0o600):
        path = directory / name
        path.write_text(content)
        path.chmod(mode)
    write('turn.secret', secret + '\n')
    write('settings.json', json.dumps(settings, indent=2) + '\n')
    write('lobby.env', '\n'.join([
        'NODE_ENV=production', 'HOST=127.0.0.1', 'PORT=8787', 'REDIS_URL=redis://127.0.0.1:6379',
        'REDIS_NAMESPACE=neoclonk', 'TRUST_PROXY=true', 'LOBBY_ENABLED=true',
        'LOBBY_REQUEST_LIMIT=20000', 'LOBBY_BYTE_LIMIT=1073741824', 'LOBBY_IP_PER_MINUTE=180',
        'ALLOWED_ORIGINS=' + ','.join(origins), 'TURN_PROVIDER=coturn', 'TURN_SHARED_SECRET=' + secret,
        f'TURN_URLS=turn:{turn}:3478?transport=udp,turn:{turn}:3478?transport=tcp,turns:{turn}:5349?transport=tcp,turns:{turn}:443?transport=tcp',
        'TURN_TTL_SECONDS=14400', '',
    ]))
    write('redis.conf', '''bind 127.0.0.1
protected-mode yes
port 6379
appendonly yes
appendfsync everysec
dir /data
maxmemory 64mb
maxmemory-policy noeviction
save 900 1
''', 0o644)
    # Coturn 4.18 defaults to TLS >= 1.2, DTLS/CLI/legacy STUN disabled.
    # Its PROXY mode replaces ordinary TCP listeners and accepts plaintext only.
    # HAProxy terminates TURN TLS and supplies the public TCP listeners.
    # Coturn PROXY port must only be reachable locally; firewall in setup guide
    # rejects public 5348. HAProxy sends the binary v2 format coturn requires.
    write('turnserver.conf', f'''listening-port=3478
tls-listening-port=5349
tcp-proxy-port=5348
listening-ip={private}
listening-ip=127.0.0.1
relay-ip={private}
external-ip={public}/{private}
min-port=49160
max-port=49259
realm={turn}
server-name={turn}
fingerprint
use-auth-secret
static-auth-secret={secret}
no-tls
no-multicast-peers
no-tcp-relay
no-rfc5780
stale-nonce=600
user-quota=8
total-quota=64
max-bps=65536
bps-capacity=2097152
relay-threads=2
log-file=stdout
simple-log
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=224.0.0.0-255.255.255.255
denied-peer-ip=::
denied-peer-ip=::1
denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=ff00::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
''')
    # Avoid denying the public relay IP: two clients may need the SAME relay.
    # no-tcp-relay disables RFC6062 peer sockets, not client TURN-over-TCP/TLS.
    write('haproxy.cfg', f'''global
  log stdout format raw local0
  maxconn 256
defaults
  mode tcp
  log global
  timeout connect 5s
  timeout client 2h
  timeout server 2h
frontend tls_mux
  bind 0.0.0.0:443
  tcp-request inspect-delay 5s
  tcp-request content accept if {{ req.ssl_hello_type 1 }}
  use_backend lobby_tls if {{ req.ssl_sni -i {lobby} }}
  default_backend turn_tls_termination
frontend turn_plain
  bind 0.0.0.0:3478
  default_backend turn_proxy
frontend turn_tls
  bind 127.0.0.1:5347 accept-proxy ssl crt /usr/local/etc/haproxy/certs/turn.pem ssl-min-ver TLSv1.2
  bind 0.0.0.0:5349 ssl crt /usr/local/etc/haproxy/certs/turn.pem ssl-min-ver TLSv1.2
  default_backend turn_proxy
backend turn_tls_termination
  server tls 127.0.0.1:5347 send-proxy-v2
backend lobby_tls
  server lobby 127.0.0.1:8443 send-proxy-v2
backend turn_proxy
  server turn 127.0.0.1:5348 send-proxy-v2
''', 0o644)
    https = f'''
  server {{
    listen 127.0.0.1:8443 ssl proxy_protocol;
    server_name {lobby};
    set_real_ip_from 127.0.0.1;
    real_ip_header proxy_protocol;
    ssl_certificate /etc/letsencrypt/live/neoclonk/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/neoclonk/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:TLS:5m;
    location = /healthz {{ access_log off; return 200 'ok\\n'; }}
    location = /api/lobby {{
      limit_req zone=lobby burst=30 nodelay;
      proxy_pass http://127.0.0.1:8787;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $remote_addr;
      proxy_set_header X-Forwarded-Proto https;
      proxy_connect_timeout 3s;
      proxy_read_timeout 12s;
    }}
    location / {{ return 404; }}
  }}''' if tls else ''
    write('nginx.conf', f'''user nginx;
worker_processes 1;
events {{ worker_connections 512; }}
http {{
  access_log off;
  error_log /dev/stderr warn;
  client_max_body_size 52k;
  client_body_timeout 10s;
  client_header_timeout 10s;
  keepalive_timeout 15s;
  server_tokens off;
  limit_req_zone $binary_remote_addr zone=lobby:1m rate=3r/s;
  limit_req_status 429;
  server {{
    listen 80;
    server_name {lobby} {turn};
    location /.well-known/acme-challenge/ {{ root /var/www/acme; }}
    location / {{ return 404; }}
  }}{https}
}}
''', 0o644)
    write('compose.yaml', f'''name: neoclonk
x-common: &common
  network_mode: host
  restart: unless-stopped
  logging:
    driver: json-file
    options: {{max-size: "5m", max-file: "2"}}
services:
  redis:
    <<: *common
    image: {IMAGES['redis']}
    command: [redis-server, /etc/redis.conf]
    mem_limit: 128m
    volumes:
      - {directory}/redis.conf:/etc/redis.conf:ro
      - redis-data:/data
    healthcheck:
      test: [CMD, redis-cli, ping]
      interval: 5s
      timeout: 2s
      retries: 10
  lobby:
    <<: *common
    build:
      context: {source}
      dockerfile: deploy/Dockerfile
    env_file: {directory}/lobby.env
    mem_limit: 192m
    read_only: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    depends_on:
      redis: {{condition: service_healthy}}
  nginx:
    <<: *common
    image: {IMAGES['nginx']}
    mem_limit: 64m
    volumes:
      - {directory}/nginx.conf:/etc/nginx/nginx.conf:ro
      - /var/lib/neoclonk/acme:/var/www/acme:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
  haproxy:
    <<: *common
    image: {IMAGES['haproxy']}
    user: root
    mem_limit: 64m
    volumes:
      - {directory}/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro
      - {directory}/haproxy-certs:/usr/local/etc/haproxy/certs:ro
  coturn:
    <<: *common
    image: {IMAGES['coturn']}
    user: root
    command: [-c, /etc/coturn/turnserver.conf]
    mem_limit: 192m
    volumes:
      - {directory}/turnserver.conf:/etc/coturn/turnserver.conf:ro
  certbot:
    image: {IMAGES['certbot']}
    network_mode: host
    profiles: [maintenance]
    volumes:
      - /var/lib/neoclonk/acme:/var/www/acme
      - /etc/letsencrypt:/etc/letsencrypt
      - /var/lib/neoclonk/certbot:/var/lib/letsencrypt
volumes:
  redis-data:
''')
    write('traffic-guard.json', json.dumps({'interface': settings['interface'], 'limit_bytes': 200_000_000_000, 'compose': str(directory / 'compose.yaml')}, indent=2) + '\n')
    return directory


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--settings', required=True)
    p.add_argument('--directory', default='/etc/neoclonk')
    p.add_argument('--source', default=str(Path(__file__).resolve().parents[1]))
    p.add_argument('--tls', action='store_true', help='Enable HTTPS after obtaining a certificate')
    args = p.parse_args()
    result = render(json.loads(Path(args.settings).read_text()), args.directory, args.source, args.tls)
    if args.tls:
        subprocess.run([sys.executable, str(Path(__file__).with_name('refresh-haproxy-cert.py')), '--directory', str(result)], check=True)
    print(f'Rendered private configuration into {result}; secrets were not printed.')

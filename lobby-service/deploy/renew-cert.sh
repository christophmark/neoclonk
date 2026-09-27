#!/bin/sh
set -eu
compose=/etc/neoclonk/compose.yaml
certificate=/etc/letsencrypt/live/neoclonk/fullchain.pem
old=$(sha256sum "$certificate")
docker compose -f "$compose" run --rm certbot renew --webroot -w /var/www/acme --quiet
new=$(sha256sum "$certificate")
if [ "$old" != "$new" ]; then
  docker compose -f "$compose" exec -T nginx nginx -t
  docker compose -f "$compose" exec -T nginx nginx -s reload
  # TURN TLS terminates in HAProxy. A graceful master reload preserves sessions
  # and never starts/restarts coturn, so it cannot undo the traffic cutoff.
  python3 /opt/neoclonk/lobby-service/deploy/refresh-haproxy-cert.py
  docker compose -f "$compose" exec -T haproxy haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg
  docker compose -f "$compose" kill -s SIGUSR2 haproxy
fi

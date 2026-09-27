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
  # Restart only an already-running relay. Never undo the traffic cutoff.
  if [ -n "$(docker compose -f "$compose" ps --status running -q coturn)" ]; then
    docker compose -f "$compose" restart coturn
  fi
fi

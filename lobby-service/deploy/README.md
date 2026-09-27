# Single Lightsail host: discovery and TURN fallback

This bundle runs a small lobby API, Redis, and authenticated coturn on one Linux
VM. The game remains player hosted. Serve the static game separately, for example
on GitHub Pages. Game traffic uses this VM only when the browser requests the
TURN fallback. Nothing in this directory installs or deploys automatically.

## Prerequisites and cost controls

- Linux with Docker Engine, the `docker compose` plugin, Python 3, and systemd.
  Ubuntu 24.04/26.04 or Amazon Linux can work; check `/etc/os-release` first and
  install Docker using the instructions for that distribution. Do not run Ubuntu
  `apt` commands on Amazon Linux. `sh deploy/check-host.sh` checks prerequisites
  without changing the machine.
- At least 1 GB RAM; 2 GB gives more space for builds and TLS. Containers have
  memory limits, Redis is capped at 64 MB with `noeviction`, and logs rotate.
- Attach a **static public IPv4**. Find its private counterpart on the primary
  NIC with `ip -4 address`; do not use the Docker bridge IP.
- Two DNS names resolving to that static IPv4. Without an owned domain, use
  `lobby.203-0-113-42.sslip.io` and `turn.203-0-113-42.sslip.io` with the real IP.
  Confirm both with `getent ahostsv4 NAME`. sslip.io is a third-party shared DNS
  service; its availability and ACME rate limits are outside this deployment's
  control. Replace with owned DNS when practical. No wildcard certificate is
  needed. Publish no AAAA records unless IPv6 is separately configured.
- The exact game origin, e.g. `https://christophmark.github.io` (without `/neoclonk`).
  An email address is optional: replace `--email YOU@example.org` below with
  `--register-unsafely-without-email` when registering without one.
- Review the selected Lightsail bundle's transfer allowance and create an AWS
  Budget alert. This bundle does **not** create an AWS spending limit.

No Vercel resources are consumed by this deployment. The university lecture is
independent of this host.

## Network layout

| Public port | Service |
| --- | --- |
| TCP 22 | SSH; restrict to administrator addresses |
| TCP 80 | ACME HTTP challenge only |
| TCP 443 | HAProxy: lobby SNI → nginx HTTPS; other SNI → coturn TLS |
| UDP/TCP 3478 | STUN and authenticated TURN |
| TCP 5349 | Direct TURN TLS |
| UDP 49160–49259 | Allocated TURN relay sockets |

Allow these in the **Lightsail firewall and the host firewall**. Everything else
must be closed to the internet. In particular, **never expose TCP 5348, 6379,
8443, or 8787**. The coturn PROXY listener 5348 trusts the supplied client address
and is reserved for local HAProxy. Docker host networking deliberately avoids
Docker's port-publishing NAT and its firewall bypass behavior.

HAProxy sends PROXY **v2** to both upstreams. nginx trusts it only on its loopback
HTTPS listener and overwrites `X-Forwarded-For` before forwarding to Node. Coturn
also requires v2 on `tcp-proxy-port`; nginx stream's v1 output would not work.
HAProxy terminates TURN TLS on public TCP5349 and on loopback TCP5347
(the TCP443 mux forwards there with PROXY v2). It sends plaintext TURN plus
PROXY v2 to coturn5348. Public TCP3478 follows the same plaintext backend.
Coturn PROXY mode replaces ordinary TCP listeners and does not accept TLS.
UDP3478 still goes directly to coturn. Keep internal TCP5347 blocked too. The same certificate covers both
DNS names. TLS on 443 also supports TURN clients without SNI via the default
TURN route.

Coturn advertises `external-ip=PUBLIC/PRIVATE` and allocates sockets on the private
NIC, matching Lightsail's one-to-one NAT. Private, loopback, link-local, metadata,
and multicast peers are denied. The public relay IP is deliberately allowed so
two browsers can communicate through allocations on the **same** server.
`no-tcp-relay` disables TCP peer allocations, while TURN client TCP/TLS transport
remains supported.

## Install the source and render private configuration

Place this `lobby-service` directory at `/opt/neoclonk/lobby-service`. Only source
is needed; omit `node_modules`, `.git`, and any previous credentials. Run:

```sh
cd /opt/neoclonk/lobby-service
sh deploy/check-host.sh
python3 -m unittest discover -s deploy -p 'test_*.py'
sudo install -d -m 700 /etc/neoclonk
sudo install -d -m 755 /var/lib/neoclonk/acme
sudo install -d -m 700 /var/lib/neoclonk/certbot /etc/letsencrypt
sudoedit /etc/neoclonk/settings.json
```

Use actual values in `settings.json`:

```json
{
  "lobby_domain": "lobby.203-0-113-42.sslip.io",
  "turn_domain": "turn.203-0-113-42.sslip.io",
  "public_ipv4": "203.0.113.42",
  "private_ipv4": "172.26.1.2",
  "interface": "ens5",
  "allowed_origins": ["https://christophmark.github.io"]
}
```

The documentation IP is not globally routable; the renderer intentionally rejects
it. Use your actual static public IP. List each allowed origin explicitly. For
testing the LAN-served game, add its actual `http://192.168.…:3000` origin.

```sh
sudo python3 deploy/render.py --settings /etc/neoclonk/settings.json
sudo docker compose -f /etc/neoclonk/compose.yaml config --quiet
sudo docker compose -f /etc/neoclonk/compose.yaml build lobby
sudo docker compose -f /etc/neoclonk/compose.yaml up -d redis lobby nginx
```

Configuration, TURN secret, and service environment are mode 0600 outside the
repository. Rerendering preserves the existing shared secret. Do not commit or
paste `lobby.env`, `turn.secret`, `turnserver.conf`, TLS keys, or expanded
`docker compose config` output; `config --quiet` performs validation safely.
Node and Redis bind only to loopback. Redis AOF persists admission budgets and
room state across process/container restarts; do not run `down --volumes` during
an update because that would erase those counters.

## Obtain TLS and start the relay

Substitute your two DNS names and real email in this command. Port 80 must already
be reachable on **both** names. Agree to the CA's terms when appropriate:

```sh
sudo docker compose -f /etc/neoclonk/compose.yaml run --rm certbot certonly \
  --webroot -w /var/www/acme --cert-name neoclonk \
  -d lobby.ACTUAL-IP.sslip.io -d turn.ACTUAL-IP.sslip.io \
  --email YOU@example.org --agree-tos --non-interactive
sudo python3 deploy/render.py --settings /etc/neoclonk/settings.json --tls
sudo docker compose -f /etc/neoclonk/compose.yaml run --rm nginx nginx -t
sudo docker compose -f /etc/neoclonk/compose.yaml run --rm haproxy \
  haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg
sudo docker compose -f /etc/neoclonk/compose.yaml up -d redis lobby nginx haproxy coturn
sudo docker compose -f /etc/neoclonk/compose.yaml exec -T nginx nginx -s reload
```

The explicit reload matters: editing a bind-mounted nginx config does not always
recreate its container. Validate with `curl https://LOBBY-NAME/healthz` and a
POST to `https://LOBBY-NAME/api/lobby` from an allowed Origin. Set the game's
`serviceUrl` to `https://LOBBY-NAME` (the client appends `/api/lobby`). Do not put the TURN shared secret in the
game. The API issues short-lived HMAC credentials only after room authorization.

Test one normal two-device game and one deliberately relay-only connection.
Inspect `RTCPeerConnection.getStats()` and confirm the selected candidate pair
has a relay candidate for the latter; merely gathering a relay candidate is not
proof of traffic using TURN. Also verify the UDP3478, TCP5349, and TCP443 relay
paths separately before declaring the installation ready.

## Install certificate renewal and traffic cutoff

```sh
sudo install -m 644 deploy/neoclonk-*.service deploy/neoclonk-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now neoclonk-cert-renew.timer neoclonk-traffic-guard.timer
sudo python3 deploy/traffic-guard.py
sudo systemctl list-timers 'neoclonk-*'
```

The certificate job runs twice daily. It reloads nginx, refreshes the private HAProxy PEM, and gracefully reloads
HAProxy only when the certificate actually changes. It never starts or restarts
coturn, preserving the traffic cutoff latch and established relay sessions.

The traffic guard tracks the primary NIC's **received plus sent** bytes, including
SSH, image downloads, lobby traffic, and relay traffic. Every minute it persists
counters and checks a conservative **200 GB per UTC calendar month** threshold.
At the threshold it stops only coturn. Existing direct matches and the lobby can
continue; relayed matches disconnect. If accounting is corrupt or unavailable,
an enforcing check also stops coturn. No configuration of the lecture is touched.

This is a safety brake, **not a hard AWS billing cap**. AWS billing windows and
measurement differ; counters may lag by a minute, missed intervals before a
reboot cannot be recovered, this machine must remain running, and inbound traffic
can continue even with coturn stopped. Choose a substantially lower threshold
than the purchased bundle's allowance. Adjust `limit_bytes` in
`/etc/neoclonk/traffic-guard.json` if needed (rerendering resets this to 200 GB).
Configure AWS Budget alerts independently. No paid automatic overage is disabled
by this script.

Coturn is additionally limited to 64 allocations, 8 per issued username, 64 KiB/s
per allocation in each direction, and 2 MiB/s aggregate in each direction. These
limits suit game control packets; large transfers may stall. The lobby starts
with 20,000 admitted requests per rolling 30-day budget, per-IP limits, and a
1 GiB application byte budget. Rejected/invalid requests and transport overhead
can still consume host bandwidth. Credentials last four hours; sessions longer
than that need a fresh connection. Application limits fail closed when Redis is
unavailable or full.

After a cutoff, no timer automatically re-enables TURN, even at month rollover.
Review AWS usage and the NIC counters first. To resume in a new month, run a
guard check so monthly counters roll forward, clear only the `cutoff` boolean in
`/var/lib/neoclonk/traffic.json`, then run an enforcing check before starting
coturn. **Do not delete/reset the byte counter** to evade the monthly cutoff.
`docker compose up` can start coturn despite the latch, so updates must first run:

```sh
sudo python3 deploy/traffic-guard.py --enforce
# Continue only when the guard exits successfully with within-limit.
sudo docker compose -f /etc/neoclonk/compose.yaml up -d --build
```

## Maintenance and sources

Image manifests are pinned by digest, verified September 27, 2026. Coturn is
4.18.0, newer than the 4.9 fixes for peer deny-list bypasses. Periodically review
upstream releases, update pins, rerun tests, and deploy security updates. Never
change to an old distro coturn package without reviewing its patch level.

- [Coturn container documentation](https://github.com/coturn/coturn/tree/master/docker/coturn)
- [Coturn listener, NAT, proxy and resource options](https://github.com/coturn/coturn/blob/master/README.turnserver)
- [Docker Engine installation](https://docs.docker.com/engine/install/)
- [Lightsail static IP documentation](https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-create-static-ip.html)
- [Lightsail firewall documentation](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-firewall-and-port-mappings-in-amazon-lightsail.html)
- [sslip.io](https://sslip.io/)

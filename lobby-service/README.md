# Neoclonk room discovery

A standalone Node service for room discovery and WebRTC connection setup. The original game and lockstep synchronization run in player browsers. No gameplay is sent to this API.

## Run on one VM

Node 22 or newer is required. `npm ci`, copy `.env.example` to a private `.env`, fill the values, then run:

```sh
node --env-file=.env src/dev.js
```

Use `REDIS_URL=redis://127.0.0.1:6379`. SIGTERM/SIGINT drain active requests for up to eight seconds, close idle sockets and release Redis. Redis commands have four-second abort deadlines, a bounded queue, and no offline queue. The server listens on `127.0.0.1:8787` by default. Put an HTTPS reverse proxy in front of it; leave Node and Redis ports inaccessible from the Internet. Set `TRUST_PROXY=true` only if the proxy overwrites `X-Forwarded-For`. Configure exact game origins in `ALLOWED_ORIGINS` (comma separated, no wildcard).

Redis is mandatory; there is no production fallback to process memory. Enable Redis persistence if application budget counters must survive reboot. Losing room records closes discovery but does not interrupt connected matches. Use a dedicated Redis namespace/database. Never expose Redis credentials to the game.

An optional Vercel adapter remains at `api/lobby.js`. For that deployment use `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, and deploy this directory as a separate project.

## Connection flow

1. Host creates a public or private room; guests browse compatible rooms or enter its eight-character code.
2. Clients start with STUN and direct WebRTC. Complete SDP offers/answers are exchanged here. Ready/start/game messages use the existing reliable data channel.
3. After a direct attempt fails, an admitted member requests `signal: relay`. The service advances that peer to generation 1 and discards generation 0 SDP.
4. Each side requests `turn` and receives temporary credentials. The browser restarts ICE with fallback configuration. Listing, creating and joining never issue TURN credentials.
5. Host closes discovery when the match starts. Gameplay continues peer to peer. No late join or host migration is implemented.

Poll every five seconds while waiting, less often in hidden tabs, and stop guest polls once connected. Host polls refresh a room for three minutes. Pending guests expire after 90 seconds without polling. Connected guests expire after three minutes without host confirmation. Host polls include `connectedPeers: [{slot,rtcToken}]` from live data channels; this also confirms a completed SDP exchange if a connection notification was lost. Guests cannot pin a seat by claiming to be connected. Responses never expose authentication hashes or other members' credential leases. Player slots are reused within the original engine's 1–11 range, with fresh credentials.

## TURN

**Coturn on the same VM:** set `TURN_PROVIDER=coturn`, `TURN_SHARED_SECRET` to the server's `static-auth-secret`, and `TURN_URLS` to public UDP/TCP/TLS endpoints. Enable Coturn `use-auth-secret`. The backend signs timestamped usernames using the TURN REST HMAC scheme; the shared secret stays server side. Configure Coturn realm, address mapping, relay port range, TLS certificate, peer address exclusions, allocation quotas and bandwidth limits separately.

**Cloudflare alternative:** set `TURN_PROVIDER=cloudflare`, `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` (TURN key credentials). The server calls its credential-generation API only after fallback is requested. See [Cloudflare's documentation](https://developers.cloudflare.com/realtime/turn/generate-credentials/).

Temporary credentials default to four hours (`TURN_TTL_SECONDS`, allowed 600–43200, at most twelve hours). This is also the supported relay match duration without in-game credential renewal. Each peer connection gets one lease per side; retries reuse it. Provider failure releases the reservation for retry. Metered is not implemented: its documented two-minute propagation delay requires a prewarmed credential pool rather than creating credentials during fallback.

The API cannot enforce relay transfer usage. Configure those limits on Coturn/provider. Clients necessarily receive temporary usernames/passwords and could reuse them during their lifetime; keep relay allocation quotas enabled.

## Usage protection

Defaults:

- 20,000 admitted API calls per 30-day window, atomic across instances.
- 1 GiB serialized successful response bodies per 30-day window; one bounded response can cross the threshold.
- 180 admitted requests per IP per minute, allowing 12 devices behind one router to poll.
- 52 KB HTTP request body, 48 KB SDP, maximum 12 players.
- Exact-origin CORS, hashed member tokens, no response caching, four-second external-service timeout.
- `LOBBY_ENABLED=false` disables discovery. Manual invitations still work.

Counters start when first used, independently of billing periods, and fail closed if Redis is unavailable. Keep the namespace stable across deployments. They cover admitted requests and response bodies, **not all platform resource consumption**. Preflight/rejected requests, cold starts, Redis scripts/subcommands, headers, builds and static requests still consume resources. Therefore these limits are **not a hard 20% Vercel quota/spend cap**, nor protection for another project on the same Vercel account. The separate Lightsail VM isolates Neoclonk from that account. Monitor VM traffic allowance separately; bandwidth limits do not by themselves cap monthly transfer charges.

A public room list is not an account system. Anyone knowing a private code can request a seat. CORS and IP limits are not strong user authentication.

## API

POST `/api/lobby` with JSON. Member actions require `Authorization: Bearer <token>`. Responses use `Cache-Control: no-store`; errors are `{error,code}` with HTTP status and `Retry-After` for throttling/unavailability.

| Action | Input | Result |
| --- | --- | --- |
| create | name, scenario, version, catalog, maxPlayers, visibility | code, token, role, room |
| list | version, catalog | rooms (public, compatible, non-full) |
| join | code, name, version, catalog | code, token, slot, rtcToken, room |
| poll / heartbeat | code + token, connectedPeers (host only) | host: room, guests; guest: room + peer record |
| signal | code, slot (host only), kind, generation, description | ok, generation or generation, relayRequested |
| turn | code, slot (host only) | iceServers, expiresAt |
| connected | code, slot (host only) | ok |
| drop | code, slot, rtcToken + host token | ok; removes matching disconnected guest |
| start | code + host token | ok; removes room |
| leave | code + member token | ok; removes guest or host's room |

Signal kind is offer, answer or relay. Description is `{type,sdp}`, omitted for relay. Generation 0 is direct, generation 1 fallback. Exact retries are idempotent; stale generations/conflicting descriptions are rejected. Peer records are `{slot,name,rtcToken,offer,answer,generation,relayRequested,connected}`. Room summaries are `{code,name,scenario,version,catalog,maxPlayers,players,visibility,expiresAt,turnAvailable}`. Host drops require the matching rtcToken so a delayed request cannot remove a new guest reusing that slot. The separate rtcToken authenticates the original transport hello; never send a service bearer token through that transport.

## Verify

```sh
npm test
REDIS_TEST_URL=redis://127.0.0.1:6379 npm test
```

The second command also tests real Redis Lua scripts in a temporary namespace. Tests cover concurrent capacity, private visibility, token isolation, signal generations, provider recovery/cache, expiry, budgets/rates, CORS, body bounds, slot reuse and Coturn HMAC credentials. Browser integration and real TURN allocation remain separate deployment checks.

This directory contains original Neoclonk service code and no Clonk assets. Engine/content attribution in the game repository remains applicable to the separately served game.

### Public relay deployment verification

After the server is live and allows the exact localhost test origin:

```sh
LOBBY_URL=https://lobby.example.com node test/remote-relay.mjs
```

The opt-in script serves a minimal page at `http://127.0.0.1:3902` (port must be free), opens Chromium using the workspace's existing Playwright installation, and tests UDP 3478, TCP 3478, TLS 5349 and TLS 443 separately. Each test creates a private room, verifies that TURN credentials are denied before fallback, requests temporary credentials through the authenticated API, exchanges actual relay-only WebRTC offer/answer descriptions through it, sends ping/pong over a data channel and asserts that both selected candidates are relayed. Relay-only is forced only in this deployment test; production still tries direct first.

Use `TURN_TRANSPORTS=udp3478,tls443` to run a subset, or `TEST_ORIGIN=http://127.0.0.1:3903` for a different allowlisted free port. Reports go to the ignored `artifacts/remote-relay-report.json`, containing public TURN URLs, transport/timing and redacted candidate statistics. Provider secrets, room tokens, temporary TURN passwords, candidate addresses and SDP never enter reports or stdout. Rooms and browser/server processes are cleaned up even on failure. This test is excluded from `npm test` and requires an explicitly configured live deployment.

'use strict';
// Public configuration only. TURN credentials are short lived and fetched on fallback.
window.__neoclonkDiscoveryConfig = Object.freeze({
  serviceUrl: 'https://lobby.40-180-87-214.sslip.io',
  stunServers: [{urls:'stun:turn.40-180-87-214.sslip.io:3478'}]
});

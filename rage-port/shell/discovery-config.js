'use strict';
// Public configuration only. TURN credentials are short lived and fetched on fallback.
window.__neoclonkDiscoveryConfig = Object.freeze({
  serviceUrl: '',
  stunServers: [{urls:'stun:stun.cloudflare.com:3478'}]
});

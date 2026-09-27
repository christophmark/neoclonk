import {createHmac} from 'node:crypto';
export function turnProvider(env,fetcher=fetch) {
 const ttl=Math.max(600,Math.min(43200,Number(env.TURN_TTL_SECONDS)||14400));
 if(env.TURN_PROVIDER==='cloudflare'&&env.CLOUDFLARE_TURN_KEY_ID&&env.CLOUDFLARE_TURN_API_TOKEN)return async ({identity,now})=>{
  const r=await fetcher('https://rtc.live.cloudflare.com/v1/turn/keys/'+encodeURIComponent(env.CLOUDFLARE_TURN_KEY_ID)+'/credentials/generate-ice-servers',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_TURN_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({ttl,customIdentifier:identity}),signal:AbortSignal.timeout(4000)});
  if(!r.ok)throw Error('Relay provider unavailable');const data=await r.json();const input=Array.isArray(data.iceServers)?data.iceServers:[data.iceServers];const iceServers=input.filter(Boolean).map(s=>({...s,urls:(Array.isArray(s.urls)?s.urls:[s.urls]).filter(u=>/^turns?:/.test(u))})).filter(s=>s.urls.length);
  if(!iceServers.length||iceServers.some(s=>typeof s.username!=='string'||typeof s.credential!=='string'))throw Error('Invalid relay credentials');return {iceServers,expiresAt:now+ttl*1000};
 };
 if(env.TURN_PROVIDER==='coturn'&&env.TURN_SHARED_SECRET&&env.TURN_URLS){const urls=env.TURN_URLS.split(',').map(s=>s.trim());if(urls.some(u=>!/^turns?:[^\s]+$/.test(u)))throw Error('Invalid TURN URLs');return async ({identity,now})=>{const expiresAt=now+ttl*1000,username=Math.floor(expiresAt/1000)+':'+identity;return {iceServers:[{urls,username,credential:createHmac('sha1',env.TURN_SHARED_SECRET).update(username).digest('base64')}],expiresAt};};}
 return null;
}

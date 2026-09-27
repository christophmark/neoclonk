import {createService,LobbyError} from './service.js';
import {RedisStore,LocalRedisStore} from './store.js';
import {turnProvider} from './turn.js';
export async function fromEnvironment(env=process.env){
 let store;
 if(env.REDIS_URL){const {createClient}=await import('redis');const client=createClient({url:env.REDIS_URL,disableOfflineQueue:true,commandsQueueMaxLength:128,socket:{connectTimeout:3000,socketTimeout:5000,reconnectStrategy:false}});client.on('error',()=>{});store=new LocalRedisStore(client,env.REDIS_NAMESPACE);}
 else if(env.UPSTASH_REDIS_REST_URL&&env.UPSTASH_REDIS_REST_TOKEN)store=new RedisStore(env.UPSTASH_REDIS_REST_URL,env.UPSTASH_REDIS_REST_TOKEN,env.REDIS_NAMESPACE);
 else throw Error('Configure Redis before enabling discovery');
 const positive=(key,fallback)=>{const n=Number(env[key]||fallback);if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid '+key);return n;};
 const handler=createHandler({service:createService({store,turn:turnProvider(env),requestLimit:positive('LOBBY_REQUEST_LIMIT',20000),byteLimit:positive('LOBBY_BYTE_LIMIT',1073741824),ipLimit:positive('LOBBY_IP_PER_MINUTE',180),enabled:env.LOBBY_ENABLED!=='false'}),origins:(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean),trustProxy:!!env.VERCEL||env.TRUST_PROXY==='true'});
 handler.close=()=>store.close?.();return handler;
}
export function createHandler({service,origins=[],trustProxy=false}) {
 return async(req,res)=>{
  const origin=req.headers.origin;
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Origin');
  const send=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
  if(origin&&!origins.includes(origin))return send(403,{error:'This game origin is not allowed.',code:'origin_denied'});
  if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Max-Age','86400');res.statusCode=204;return res.end();}
  if(req.method!=='POST'){res.setHeader('Allow','POST, OPTIONS');return send(405,{error:'Use POST.',code:'method_not_allowed'});}
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(415,{error:'Use JSON requests.',code:'content_type'});
  if(Number(req.headers['content-length'])>52000)return send(413,{error:'Request too large.',code:'too_large'});
  try{
   let input=req.body;
   if(input===undefined){let n=0,parts=[];for await(const p of req){n+=Buffer.byteLength(p);if(n>52000)throw new LobbyError(413,'too_large','Request too large.');parts.push(p);}try{input=JSON.parse(Buffer.concat(parts.map(p=>Buffer.from(p))).toString('utf8'));}catch{throw new LobbyError(400,'invalid_json','Invalid JSON.');}}
   else {if(typeof input==='string'){if(Buffer.byteLength(input)>52000)throw new LobbyError(413,'too_large','Request too large.');try{input=JSON.parse(input);}catch{throw new LobbyError(400,'invalid_json','Invalid JSON.');}}if(Buffer.byteLength(JSON.stringify(input))>52000)throw new LobbyError(413,'too_large','Request too large.');}
   const auth=req.headers.authorization||'';if(auth.length>128)throw new LobbyError(401,'unauthorized','Invalid room token.');const token=auth.startsWith('Bearer ')?auth.slice(7):'';
   // Trust only a reverse proxy that overwrites X-Forwarded-For, never a public Node port.
   const ip=trustProxy?String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim():req.socket?.remoteAddress||'unknown';
   return send(200,await service(input,{token,ip}));
  }catch(error){const known=error instanceof LobbyError,status=known?error.status:503;if(status===429||status===503)res.setHeader('Retry-After',status===429?'60':'300');return send(status,{error:known?error.message:'The lobby is temporarily unavailable. Manual invitations still work.',code:known?error.code:'unavailable'});}
 };
}

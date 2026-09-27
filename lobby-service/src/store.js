// The shared store is mandatory in production. Process memory is not durable on Vercel.
export class RedisStore {
 constructor(url, token, namespace='neoclonk:lobby:v1', fetcher=fetch) { this.url=url;this.token=token;this.prefix=namespace;this.fetcher=fetcher; }
 key(s) { return this.prefix+':'+s; }
 async command(...command) {
  const r=await this.fetcher(this.url,{method:'POST',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(4000)});
  if(!r.ok)throw Error('Store unavailable');const value=await r.json();if(value.error)throw Error('Store unavailable');return value.result;
 }
 async budget(ip, limit, ipLimit, now, bytesLimit) {
  const script=`local n=tonumber(redis.call('GET',KEYS[1]) or '0'); local b=tonumber(redis.call('GET',KEYS[3]) or '0'); if n>=tonumber(ARGV[1]) or b>=tonumber(ARGV[4]) then return 0 end; local i=redis.call('INCR',KEYS[2]); if i==1 then redis.call('EXPIRE',KEYS[2],60) end; if i>tonumber(ARGV[2]) then return -1 end; n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],2592000) end; return 1`;
  return this.command('EVAL',script,3,this.key('budget'),this.key('ip:'+ip+':'+Math.floor(now/60000)),this.key('bytes'),limit,ipLimit,now,bytesLimit);
 }
 async bytes(n) { return this.command('EVAL',`local n=redis.call('INCRBY',KEYS[1],ARGV[1]); if n==tonumber(ARGV[1]) then redis.call('EXPIRE',KEYS[1],2592000) end; return n`,1,this.key('bytes'),n); }
 async get(code) { return this.command('GET',this.key('room:'+code)); }
 async cas(code, before, after, ttl, publicUntil=0) {
  // Maintain discovery index in the same transaction as the room mutation.
  const script=`local old=redis.call('GET',KEYS[1]); if (old or '')~=ARGV[1] then return 0 end; if ARGV[2]=='' then redis.call('DEL',KEYS[1]); redis.call('ZREM',KEYS[2],ARGV[4]); else redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); if tonumber(ARGV[5])>0 then redis.call('ZADD',KEYS[2],ARGV[5],ARGV[4]); else redis.call('ZREM',KEYS[2],ARGV[4]); end end; return 1`;
  return !!await this.command('EVAL',script,2,this.key('room:'+code),this.key('public'),before||'',after||'',ttl,code,publicUntil);
 }
 async list(now) {
  return this.command('EVAL',`redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1]); local codes=redis.call('ZRANGE',KEYS[1],0,49); local out={}; for _,code in ipairs(codes) do local r=redis.call('GET',ARGV[2]..code); if r then table.insert(out,r) end end; return out`,1,this.key('public'),now,this.key('room:'));
 }
}
// Injectable deterministic test store. Never selected by the production handler.
export class MemoryStore {
 constructor(clock=Date.now) { this.clock=clock;this.rooms=new Map();this.limit=new Map();this.used=0;this.budgetStart=null;this.responseBytes=0; }
 async budget(ip,limit,ipLimit,now,bytesLimit) {if(this.budgetStart===null||now-this.budgetStart>=2592000000){this.used=0;this.responseBytes=0;this.budgetStart=now;}if(this.used>=limit||this.responseBytes>=bytesLimit)return 0;const key=ip+':'+Math.floor(now/60000),count=(this.limit.get(key)||0)+1;this.limit.set(key,count);if(count>ipLimit)return -1;this.used++;return 1;}
 async bytes(n){this.responseBytes+=n;}
 async get(code){const v=this.rooms.get(code);if(!v||v.expiry<=this.clock()){this.rooms.delete(code);return null;}return v.value;}
 async cas(code,before,after,ttl,publicUntil=0){const existing=this.rooms.get(code),value=existing&&existing.expiry>this.clock()?existing.value:null;if(value!==(before||null))return false;if(after)this.rooms.set(code,{value:after,expiry:this.clock()+ttl*1000,publicUntil});else this.rooms.delete(code);return true;}
 async list(now){const out=[];for(const [code,v] of this.rooms)if(v.publicUntil>now){const r=await this.get(code);if(r)out.push(r);}return out.slice(0,50);}
}
// TCP Redis adapter for a single VM. Reuses exactly the same atomic scripts.
export class LocalRedisStore extends RedisStore {
 constructor(client,namespace='neoclonk:lobby:v1'){super('', '', namespace);this.client=client;this.connecting=null;}
 async command(...args){if(!this.client.isReady){if(!this.client.isOpen)this.connecting??=this.client.connect().finally(()=>{this.connecting=null;});if(this.connecting)await this.connecting;}return this.client.sendCommand(args.map(String),{abortSignal:AbortSignal.timeout(4000)});}
 close(){if(this.client.isOpen)this.client.destroy();}
}

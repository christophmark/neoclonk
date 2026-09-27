import {fromEnvironment} from '../src/http.js';
let handler;
export default async function lobby(req,res){try{handler??=await fromEnvironment();return await handler(req,res);}catch{res.statusCode=503;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'Online discovery is not configured yet. Manual invitations still work.',code:'unconfigured'}));}}

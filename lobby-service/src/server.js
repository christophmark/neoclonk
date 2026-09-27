import {createServer} from 'node:http';
export async function startServer({handler,host='127.0.0.1',port=8787,shutdownMs=8000}){
 const server=createServer((req,res)=>{
  let path;try{path=new URL(req.url,'http://local').pathname;}catch{res.writeHead(400);res.end();return;}
  if(path!=='/api/lobby'){res.writeHead(404);res.end('Not found');return;}
  Promise.resolve().then(()=>handler(req,res)).catch(()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});if(!res.writableEnded)res.end('{"error":"The lobby is unavailable.","code":"unavailable"}');});
 });
 server.requestTimeout=10000;server.headersTimeout=10000;server.timeout=15000;server.keepAliveTimeout=5000;server.maxRequestsPerSocket=100;server.maxHeadersCount=40;
 await new Promise((resolve,reject)=>{const failed=error=>{handler.close?.();reject(error);};server.once('error',failed);server.listen(port,host,()=>{server.off('error',failed);resolve();});});
 let closing;const close=()=>closing??=new Promise(resolve=>{const deadline=setTimeout(()=>{server.closeAllConnections();},shutdownMs);deadline.unref();server.close(async()=>{clearTimeout(deadline);await handler.close?.();resolve();});server.closeIdleConnections();});
 return {server,close};
}

import {fromEnvironment} from './http.js';
import {startServer} from './server.js';
try{
 const handler=await fromEnvironment(),runtime=await startServer({handler,host:process.env.HOST||'127.0.0.1',port:Number(process.env.PORT)||8787});
 let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;await runtime.close();process.exitCode=0;};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
 runtime.server.on('error',()=>{console.error('Lobby HTTP server failed.');stop().finally(()=>{process.exitCode=1;});});
 console.log('Neoclonk lobby listening');
}catch{console.error('Lobby startup failed. Check configuration and listening address.');process.exitCode=1;}

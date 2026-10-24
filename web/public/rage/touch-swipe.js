/* Touch gestures translate into the original synchronized control slots only.
   Aim coordinates come from each engine's actual viewport, including zoom. */
'use strict';
NeoclonkTouch.swipe=function({canvas,pad,input,read,enabled,focus=()=>{}}){
 const HOLD=130,DOUBLE=300,DEAD=18,STEER=280;
 let gesture=null,lastTap=null,timer=0;
 const pulse=code=>{input(code,true);input(code,false);};
 // Input timestamps preserve flick speed when a busy frame delays delivery.
 const eventTime=event=>{const now=performance.now();return event.timeStamp>0&&Math.abs(event.timeStamp-now)<10000?event.timeStamp:now;};
 const owner=info=>info?.cursor&&!info.menu?`${info.player}:${info.cursor}`:null;
 const available=()=>enabled()&&!document.hidden&&!pad.hidden&&pad.getBoundingClientRect().width>0;
 const playable=info=>owner(info)&&info.aimValid&&!info.paused;
 const vector=(g,info)=>{const r=canvas.getBoundingClientRect();return {x:g.x-r.left-info.aimX*r.width,y:g.y-r.top-info.aimY*r.height};};
 function stop(g,info){if(g?.started&&owner(info)===g.owner){if(!g.stopped)pulse('KeyX');g.stopped=true;return true;}return false;}
 function cancel(sendStop=true){
  const g=gesture;gesture=null;lastTap=null;clearTimeout(timer);timer=0;
  if(!g)return false;
  const stopped=sendStop&&stop(g,read());
  if(canvas.hasPointerCapture(g.id))canvas.releasePointerCapture(g.id);
  return stopped;
 }
 function steer(g,info,now){
  const v=vector(g,info);
  const distance=g.dig?Math.hypot(v.x,v.y):Math.abs(v.x);
  if(g.arrived){
   // Stay stopped despite camera motion or inertia. Only a deliberate finger
   // move away from the arrival point resumes the same held gesture.
   if(Math.hypot(g.x-g.arrived.x,g.y-g.arrived.y)<28||distance<28)return;
   g.arrived=null;g.direction=null;g.digRequested=false;g.sawDig=false;
   g.pending=null;g.lastSteer=-Infinity;g.lastSteerFrame=-Infinity;
   g.restartDig=g.dig;g.beginFrame=info.frame;
  }
  if(distance<=DEAD){
   stop(g,info);g.arrived={x:g.x,y:g.y};g.direction=0;return;
  }
  if(!g.dig){
   const direction=v.x<0?-1:1;
   if(direction!==g.direction){pulse(direction<0?'KeyZ':'KeyC');g.direction=direction;g.stopped=false;}
   return;
  }
  // Let a queued arrival Stop finish before restarting a digging gesture.
  if(g.restartDig&&info.digging)return;
  g.restartDig=false;
  if(!g.digRequested){
   // Dig can start on foot; a held request waits for landing after a jump.
   if(!info.digging&&info.procedure!==0)return;
   g.digRequested=true;g.beginFrame=info.frame;g.stopped=false;
   if(!info.digging){pulse(v.x<0?'KeyZ':'KeyC');pulse('KeyD');}
  }
  if(!info.digging){
   // A seam or failed dig ends the attempt. Never repeatedly dig through it.
   if(g.sawDig||info.frame-g.beginFrame>45){stop(g,info);g.blocked=true;}
   return;
  }
  g.sawDig=true;
  if(Math.hypot(v.x,v.y)<DEAD||now-g.lastSteer<STEER||info.frame-g.lastSteerFrame<=10)return;
  // The original dig procedure supports directions 2..8, excluding straight up.
  let target=(Math.round(Math.atan2(v.x,-v.y)/(Math.PI/4))+8)%8+1;
  if(target===1)target=v.x<0?8:2;
  if(target===info.commandDirection)return;
  // Wait for the original command queue to acknowledge each steering press.
  // Throttle repeated keys beyond the engines' double-click interval.
  if(g.pending&&info.commandDirection===g.pending.from&&now-g.pending.time<900)return;
  pulse(target>info.commandDirection?'KeyZ':'KeyC');
  g.pending={from:info.commandDirection,time:now};g.lastSteer=now;g.lastSteerFrame=info.frame;
 }
 function tick(){
  timer=0;const g=gesture;if(!g||g.flick)return;
  const info=read(),now=performance.now();
  if(!available()||!playable(info)||owner(info)!==g.owner){cancel();return;}
  // Keep recent stationary samples too, so a flick can begin after a long hold.
  g.samples.push({x:g.x,y:g.y,time:now});
  while(g.samples.length>2&&now-g.samples[0].time>160)g.samples.shift();
  if(!g.started&&now-g.down>=HOLD){
   g.started=true;g.beginFrame=info.frame;g.dig=g.second||info.digging;

  }
  if(g.started&&!g.blocked)steer(g,info,now);
  timer=setTimeout(tick,40);
 }
 function sample(g,event){
  const now=eventTime(event);g.x=event.clientX;g.y=event.clientY;
  g.travel=Math.max(g.travel,Math.hypot(g.x-g.startX,g.y-g.startY));
  while(g.samples.length&&g.samples.at(-1).time>now)g.samples.pop();
  g.samples.push({x:g.x,y:g.y,time:now});
  while(g.samples.length>2&&now-g.samples[0].time>160)g.samples.shift();
  const first=g.samples[0],dy=g.y-first.y,dx=g.x-first.x,dt=now-first.time;
  if(!g.flick&&dt>0&&dt<=180&&Math.abs(dy)>=42&&Math.abs(dy)>Math.abs(dx)*1.4&&Math.abs(dy)/dt>=.55){
   const info=read();if(!playable(info)||owner(info)!==g.owner){cancel();return;}
   // Stop before the action, never immediately after it: the original Stop
   // clears queued Jump/Throw commands before they can execute on the next tick.
   if(info.digging||info.commandDirection||(g.started&&!g.stopped))pulse('KeyX');
   pulse(dy<0?'KeyS':'KeyA');g.flick=true;g.started=true;g.stopped=true;lastTap=null;
   clearTimeout(timer);timer=0;
  }
 }
 const consume=event=>{event.preventDefault();event.stopImmediatePropagation();};
 canvas.addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch'||!available())return;
  const info=read();if(!playable(info))return;
  // Leave the original HUD/action icons and open native menus to the engine.
  const r=canvas.getBoundingClientRect();if(event.clientY<r.top+64||event.clientY>r.bottom-64)return;
  consume(event);if(gesture)return;focus();
  const now=eventTime(event),who=owner(info),second=lastTap&&lastTap.owner===who&&now-lastTap.time<=DOUBLE&&Math.hypot(event.clientX-lastTap.x,event.clientY-lastTap.y)<=44;
  lastTap=null;
  gesture={id:event.pointerId,owner:who,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,down:now,travel:0,second:!!second,started:false,dig:false,direction:0,lastSteer:-Infinity,lastSteerFrame:-Infinity,pending:null,samples:[{x:event.clientX,y:event.clientY,time:now}]};
  canvas.setPointerCapture(event.pointerId);timer=setTimeout(tick,HOLD);
 },true);
 canvas.addEventListener('pointermove',event=>{if(!gesture||event.pointerId!==gesture.id)return;consume(event);sample(gesture,event);},true);
 canvas.addEventListener('pointerup',event=>{
  const g=gesture;if(!g||event.pointerId!==g.id)return;consume(event);sample(g,event);if(gesture!==g)return;
  const tap=!g.started&&!g.flick&&g.travel<16&&eventTime(event)-g.down<HOLD;
  cancel();if(tap)lastTap={x:g.x,y:g.y,time:eventTime(event),owner:g.owner};
 },true);
 for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>{if(gesture?.id===event.pointerId){consume(event);cancel();}},true);
 // SDL/GLFW also listen for legacy touch events. Prevent synthetic mouse
 // commands from the same gesture while keeping ordinary mouse input intact.
 for(const name of ['touchstart','touchmove','touchend','touchcancel'])canvas.addEventListener(name,event=>{if(gesture||(available()&&playable(read())&&[...event.changedTouches].some(t=>{const r=canvas.getBoundingClientRect();return t.clientY>=r.top+64&&t.clientY<=r.bottom-64;})))consume(event);},{capture:true,passive:false});
 window.addEventListener('pointerdown',event=>{if(gesture&&event.target!==canvas&&!pad.contains(event.target)&&event.target.closest?.('button,input,a'))cancel();},true);
 window.addEventListener('resize',()=>cancel());
 window.addEventListener('blur',()=>cancel());window.addEventListener('pagehide',()=>cancel());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
 return {cancel};
};

/* Touch-only movement policy. All inputs use the original synchronized controls. */
'use strict';
NeoclonkTouch.movement = function({pad,canvas,input,read,enabled,focus=()=>{},changed=()=>{}}) {
 const storageKey='neoclonk.touch.movement-mode';
 let mode='tap';try{const saved=localStorage.getItem(storageKey);mode=['tap','hold','swipe'].includes(saved)?saved:localStorage.getItem('neoclonk.touch.hold-movement')==='1'?'hold':'tap';}catch{}
 let hold=mode!=='tap';
 const bar=document.createElement('div');bar.id='touch-movement-mode';bar.role='radiogroup';bar.setAttribute('aria-label','Movement mode');
 const options=['tap','hold','swipe'].map(value=>{
  const label=document.createElement('label'),radio=document.createElement('input'),text=document.createElement('span');
  radio.type='radio';radio.name='touch-movement-mode';radio.value=value;radio.checked=mode===value;
  text.textContent=value[0].toUpperCase()+value.slice(1);label.append(radio,text);bar.append(label);return radio;
 });
 const hint=document.createElement('p');hint.id='swipe-help';hint.textContent='Hold to move · ↑ jump · ↓ throw · Tap, then hold to dig.';hint.hidden=mode!=='swipe';bar.setAttribute('aria-describedby','swipe-help');pad.prepend(bar);bar.after(hint);
 const gestures=canvas?NeoclonkTouch.swipe({canvas,pad,input,read,enabled:()=>enabled()&&mode==='swipe',focus}):null;
 const pointers=new Map();let current=null;
 const horizontal=code=>code==='KeyZ'||code==='KeyY'||code==='KeyC';
 const snapshot=()=>enabled()?read():null;
 const context=(info=snapshot())=>info&&info.cursor&&!info.menu?`${info.player}:${info.cursor}`:null;
 const pulse=code=>{input(code,true);input(code,false);};
 const repaint=()=>{bar.dataset.mode=mode;for(const option of options)option.checked=option.value===mode;hint.hidden=mode!=='swipe';};repaint();
 // Digging directions steer the original digging angle, rather than starting
 // a held run. Stop/Down would end digging, so leave it to the explicit X key.
 function stop(owner,steering=false){const info=snapshot();if(owner&&context(info)===owner&&!steering&&!info.digging){pulse('KeyX');return true;}return false;}
 function end(id,allowStop=true){
  const item=pointers.get(id);if(!item)return false;pointers.delete(id);
  if(![...pointers.values()].some(p=>p.code===item.code)){input(item.code,false);item.button.classList.remove('active');}
  if(current!==id)return false;
  current=null;
  const info=snapshot();
  if(!hold||!allowStop||!item.owner||context(info)!==item.owner||item.steering||info.digging)return false;
  const remaining=[...pointers.entries()].reverse().find(([,p])=>horizontal(p.code)&&p.owner===item.owner);
  if(remaining){current=remaining[0];if(remaining[1].code!==item.code){input(remaining[1].code,false);input(remaining[1].code,true);}return false;}
  return stop(item.owner);
 }
 function releaseAll(allowStop=true){
  const gestureStopped=gestures?.cancel(allowStop)||false;
  const item=pointers.get(current);current=null;
  for(const [id]of pointers)end(id,false);
  return (hold&&allowStop?stop(item?.owner,item?.steering):false)||gestureStopped;
 }
 function release(code){for(const [id,p]of pointers)if(p.code===code)end(id,false);input(code,false);}
 function bind(button){
  button.addEventListener('pointerdown',event=>{
   event.preventDefault();if(!enabled())return;gestures?.cancel();focus();button.setPointerCapture(event.pointerId);
   const code=button.dataset.code,info=snapshot(),owner=context(info),previous=pointers.get(current)?.code,sameHeld=[...pointers.values()].some(p=>p.code===code);
   pointers.set(event.pointerId,{code,owner,button,steering:!!info?.digging});button.classList.add('active');
   // Switching direction must work even if another finger still holds the key.
   if(horizontal(code)){current=event.pointerId;if(sameHeld&&previous===code)return;if(sameHeld)input(code,false);}
   else if(code==='KeyX')current=null; // An explicit Stop must not be doubled on release.
   input(code,true);
  });
  const finish=event=>{event.preventDefault();end(event.pointerId);};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,finish);
  button.addEventListener('contextmenu',event=>event.preventDefault());
 }
 for(const option of options)option.addEventListener('change',()=>{
  if(!option.checked)return;
  const stopped=releaseAll();mode=option.value;hold=mode!=='tap';
  if(hold&&!stopped)stop(context());
  try{localStorage.setItem(storageKey,mode);}catch{}
  repaint();changed();
 });
 return {bind,release,releaseAll,get hold(){return hold;},get mode(){return mode;}};
};

/* Touch-only movement policy. All inputs use the original synchronized controls. */
'use strict';
NeoclonkTouch.movement = function({pad,input,read,enabled,focus=()=>{},changed=()=>{}}) {
 const storageKey='neoclonk.touch.hold-movement';
 let hold=false;try{hold=localStorage.getItem(storageKey)==='1';}catch{}
 const bar=document.createElement('label');bar.id='touch-movement-mode';
 bar.title='Left and right: tap to keep moving, or hold and release to stop. While digging, tap to steer; X stops digging.';
 const tap=document.createElement('span');tap.textContent='Tap';
 const toggle=document.createElement('input');toggle.type='checkbox';toggle.role='switch';toggle.checked=hold;toggle.setAttribute('aria-label','Hold to move');
 const track=document.createElement('span');track.className='movement-switch';track.setAttribute('aria-hidden','true');
 const held=document.createElement('span');held.textContent='Hold';
 bar.append(tap,toggle,track,held);pad.prepend(bar);
 const pointers=new Map();let current=null;
 const horizontal=code=>code==='KeyZ'||code==='KeyY'||code==='KeyC';
 const snapshot=()=>enabled()?read():null;
 const context=(info=snapshot())=>info&&info.cursor&&!info.menu?`${info.player}:${info.cursor}`:null;
 const pulse=code=>{input(code,true);input(code,false);};
 const repaint=()=>{bar.dataset.mode=hold?'hold':'tap';toggle.checked=hold;};repaint();
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
  const item=pointers.get(current);current=null;
  for(const [id]of pointers)end(id,false);
  return hold&&allowStop?stop(item?.owner,item?.steering):false;
 }
 function release(code){for(const [id,p]of pointers)if(p.code===code)end(id,false);input(code,false);}
 function bind(button){
  button.addEventListener('pointerdown',event=>{
   event.preventDefault();if(!enabled())return;focus();button.setPointerCapture(event.pointerId);
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
 toggle.addEventListener('change',()=>{
  const next=toggle.checked,stopped=releaseAll();hold=next;
  if(hold&&!stopped)stop(context());
  try{localStorage.setItem(storageKey,hold?'1':'0');}catch{}
  repaint();changed();
 });
 return {bind,release,releaseAll,get hold(){return hold;}};
};

/* Shared touch presentation for the original Rage and Planet control slots. */
'use strict';
window.NeoclonkTouch = {
 create({pad, read, enabled, bind, release, changed}) {
  const crew = ['KeyQ','KeyW','KeyE'].map(code=>pad.querySelector(`[data-code="${code}"]`));
  const row = document.createElement('div');
  row.id = 'special-controls'; row.hidden = true; pad.prepend(row);
  const extras = [10,11].map((control,index)=>{
   const button=document.createElement('button'), glyph=document.createElement('b'), label=document.createElement('span');
   button.type='button'; button.dataset.code=index?'KeyF':'KeyV'; button.hidden=true;
   glyph.textContent=index?'F':'V'; button.append(glyph,label); row.append(button); bind(button);
   return {control,button,label};
  });
  let signature='', owner='';
  const hide=(button,hidden)=>{
   if(hidden&&!button.hidden){release(button.dataset.code);button.classList.remove('active');}
   button.hidden=hidden;
  };
  function refresh() {
   if(document.hidden||!enabled())return;
   const info=read(); if(!info)return;
   const next=JSON.stringify(info); if(next===signature)return;
   signature=next;
   const nextOwner=`${info.player}:${info.cursor}`;
   // A held action must not carry over when the selected crew member changes.
   if(owner&&owner!==nextOwner)for(const {button} of extras){release(button.dataset.code);button.classList.remove('active');}
   owner=nextOwner;
   for(const button of crew)hide(button,info.crewCount===1&&!!info.cursor&&!info.menu);
   for(const {control,button,label} of extras){
    const action=info.extras.find(item=>item.control===control);
    hide(button,!action);
    if(!action)continue;
    const variants=action.variants||[], primary=variants.find(v=>v.label)||variants[0];
    const text=primary?.label?.trim()||`Special ${control-9}`;
    label.textContent=variants.every(v=>v.gesture==='double')?'Double tap: '+text:text;
    button.setAttribute('aria-label',text);
    button.title=variants.map(v=>`${v.gesture==='double'?'Double tap':v.gesture==='single'?'Single tap':'Tap'}: ${v.label||text}`).join('\n');
   }
   row.hidden=extras.every(({button})=>button.hidden);
   changed();
  }
  // Four small metadata reads per second, only with the touch pad in use. No
  // world snapshots, script execution, or per-frame DOM/viewport rebuilding.
  let timer=setInterval(refresh,250);
  window.addEventListener('pagehide',()=>clearInterval(timer));
  window.addEventListener('pageshow',event=>{if(event.persisted){timer=setInterval(refresh,250);refresh();}});
  return {refresh};
 }
};

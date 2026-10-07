'use strict';
(() => {
 const $=id=>document.getElementById(id),root=$('scenario-galleries');
 if(!root)return;
 let catalog=null,selected=null,chosenGame=null;
 const tiles=new Map(),tracks=[];
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 const idKey=id=>String(id||'').toLowerCase();
 const text=value=>typeof value==='string'?value:'';
 const gameState=()=>window.__rageBrowser?.getState?.()||{};
 function players(scenario){
  const min=Number(scenario.minPlayers)||1,max=Number(scenario.maxPlayers)||min;
  return min===max?`${min} player${min===1?'':'s'}`:`${min}–${max} players`;
 }
 function requirements(scenario){
  const values=Array.isArray(scenario.requirements)?scenario.requirements:[scenario.requirements];
  return values.filter(Boolean).map(value=>typeof value==='string'?value:text(value.title)||text(value.name)).filter(value=>value&&!/^At least \d+ players/.test(value)).map(value=>{
   const access=value.match(/^Original mission access: (.+)$/);if(access)return 'Mission unlocked';
   return value.replace(/\.c4d$/i,'').replace('FarWorlds','Far Worlds');
  }).join(' · ')||(scenario.engine==='planet'?'Clonk Planet':'Clonk Rage');
 }
 function setRovingFocus(track,button){for(const tile of track.querySelectorAll('.scenario-tile'))tile.tabIndex=tile===button?0:-1;}
 function reveal(button){button.scrollIntoView({behavior:reducedMotion.matches?'auto':'smooth',block:'nearest',inline:'nearest'});}
 function chooseGame(engine,{remember=true,clear=true}={}){
  if(![null,'rage','planet'].includes(engine))return;
  chosenGame=engine;
  $('game-picker').hidden=!!engine;$('game-library').hidden=!engine;
  $('menu-layout').dataset.screen=engine?'scenarios':'games';
  $('chosen-game-title').textContent=engine==='planet'?'Clonk Planet':'Clonk Rage';
  if(clear){selected=null;$('scenario-panel').hidden=true;for(const button of tiles.values()){button.setAttribute('aria-pressed','false');button.querySelector('.tile-selected').hidden=true;}}
  for(const element of document.querySelectorAll('[data-library-game]'))element.hidden=element.dataset.libraryGame!==engine;
  if(catalog)$('catalog-summary').textContent=`${catalog.scenarios.filter(s=>(s.engine||'rage')===engine).length} original scenarios`;
  if(remember){const url=new URL(location.href);for(const key of ['scenario','play','solo','host','join','room','lobby'])url.searchParams.delete(key);if(engine)url.searchParams.set('game',engine);else url.searchParams.delete('game');history.pushState({},'',url);$('cover').scrollTop=0;}
  requestAnimationFrame(()=>tracks.forEach(updateArrows));
 }
 for(const button of document.querySelectorAll('[data-game]'))button.onclick=()=>chooseGame(button.dataset.game);
 $('choose-game').onclick=()=>chooseGame(null);
 window.addEventListener('popstate',()=>{const q=new URLSearchParams(location.search);chooseGame(['rage','planet'].includes(q.get('game'))?q.get('game'):null,{remember:false});if(q.get('scenario'))select(q.get('scenario'));});
 function select(id,{focus=false,notify=true}={}){
  if(!catalog||['loading','initializing'].includes(gameState().phase))return false;
  const scenario=catalog.scenarios.find(item=>idKey(item.id)===idKey(id));if(!scenario)return false;
  chooseGame(scenario.engine||'rage',{remember:false,clear:false});
  selected=scenario;
  $('scenario-panel').hidden=false;
  for(const [key,button] of tiles){const active=key===idKey(id);button.setAttribute('aria-pressed',String(active));button.querySelector('.tile-selected').hidden=!active;}
  const button=tiles.get(idKey(id));if(button){setRovingFocus(button.closest('.scenario-track'),button);if(focus){button.focus({preventScroll:true});reveal(button);}}
  const paragraphs=text(scenario.description).replace(/\0/g,'').split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);const headingKey=value=>String(value||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');const knownTitles=[scenario.title,...Object.values(scenario.titles||{}),scenario.configuration?.Head?.Title];if(paragraphs[0]&&knownTitles.some(title=>headingKey(title)===headingKey(paragraphs[0])))paragraphs.shift();
  const description=paragraphs.join('\n\n')||'Choose your Clonk and enter this original scenario.';
  const first=paragraphs[0]||description;$('title').textContent=scenario.title;$('intro').textContent=first.length>245?first.slice(0,240).replace(/\s+\S*$/,'')+'…':first;
  $('scenario-full-description').textContent=description;$('scenario-story').open=false;
  $('scenario-players').textContent=players(scenario);$('scenario-requirements').textContent=scenario.blockedReason||requirements(scenario);
  updateActions();
  try{localStorage.setItem('neoclonk.selectedScenario',scenario.id);}catch{/* Selection remains usable without storage. */}
  if(notify)window.dispatchEvent(new CustomEvent('scenario-select',{detail:{id:scenario.id,scenario}}));
  return true;
 }
 function updateActions(){
  if(!selected)return;
  const state=gameState(),solo=(Number(selected.minPlayers)||1)<=1,same=state.ready&&state.scenarioId===selected.id;
  const blocked=window.__scenarioLibrary.isBlocked(selected)||selected.engine==='openclonk',needsImport=window.NeoclonkCommunity&&!window.NeoclonkCommunity.available(selected);
  const primary=same?'Resume game':solo?'Play':'Host';
  $('start').hidden=false;$('start').disabled=blocked||needsImport||['loading','initializing'].includes(state.phase);$('start').textContent=primary;$('start').setAttribute('aria-label',`${primary}: ${selected.title}`);
  $('new-game').hidden=!state.ready;$('new-game').textContent=same?'Restart scenario':'Resume current game';$('new-game').setAttribute('aria-label',same?`Restart ${selected.title}`:'Resume current game');
  $('play-solo').hidden=blocked||solo||(same&&!state.multiplayer);$('play-solo').disabled=needsImport||['loading','initializing'].includes(state.phase);$('play-solo').setAttribute('aria-label',`Play ${selected.title} solo`);$('solo-note').hidden=solo;
  $('host-room').disabled=needsImport||['loading','initializing'].includes(state.phase);$('host-room').hidden=blocked||(!solo&&!same)||(Number(selected.maxPlayers)||1)<2;$('host-room').setAttribute('aria-label',`Host ${selected.title} with friends`);if(needsImport)$('scenario-requirements').textContent='Import your community collection below to play on this device.';
 }
 function updateArrows(record){const {track,previous,next}=record;previous.disabled=track.scrollLeft<=2;next.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;}
 function makeTile(scenario,index){
  const item=document.createElement('li'),button=document.createElement('button');button.type='button';button.className='scenario-tile';button.dataset.scenarioId=scenario.id;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',`${scenario.title}, ${players(scenario)}`);button.tabIndex=index===0?0:-1;
  const picture=document.createElement('span');picture.className='tile-picture';
  const unavailable=document.createElement('span');unavailable.className='tile-no-preview';unavailable.textContent=scenario.title;unavailable.setAttribute('aria-hidden','true');picture.append(unavailable);
  const preview=scenario.screenshot||scenario.thumbnail;
  if(preview){const img=document.createElement('img');img.src=preview;img.alt='';img.loading='lazy';img.decoding='async';img.width=320;img.height=200;img.dataset.preview=scenario.screenshot?'gameplay':'artwork';img.addEventListener('load',()=>{unavailable.hidden=true;});img.addEventListener('error',()=>{img.hidden=true;unavailable.hidden=false;});picture.append(img);}
  const caption=document.createElement('span');caption.className='tile-caption';
  const title=document.createElement('span');title.className='tile-title';title.textContent=scenario.title;
  const count=document.createElement('span');count.className='tile-players';count.textContent=players(scenario);caption.append(title,count);
  const badge=document.createElement('span');badge.className='tile-selected';badge.textContent='Selected';badge.hidden=true;badge.setAttribute('aria-hidden','true');
  button.append(picture,caption,badge);button.addEventListener('click',()=>select(scenario.id));button.addEventListener('focus',()=>setRovingFocus(button.closest('.scenario-track'),button));item.append(button);tiles.set(idKey(scenario.id),button);return item;
 }
 function makeCategory(category,scenarios){
  const section=document.createElement('section');section.className='scenario-category';section.dataset.libraryGame=category.engine||'rage';section.id=`category-${category.id}`;
  const heading=document.createElement('div');heading.className='category-heading';
  const title=document.createElement('h3');title.id=`heading-${category.id}`;title.textContent=category.title;section.setAttribute('aria-labelledby',title.id);
  const count=document.createElement('span');count.className='category-count';count.textContent=String(scenarios.length);count.setAttribute('aria-label',`${scenarios.length} scenarios`);
  const controls=document.createElement('div');controls.className='gallery-controls';
  const previous=document.createElement('button'),next=document.createElement('button');
  for(const [button,label,glyph] of [[previous,'Previous','‹'],[next,'Next','›']]){button.type='button';button.className='gallery-arrow';button.textContent=glyph;button.setAttribute('aria-label',`${label} ${category.title} scenarios`);button.setAttribute('aria-controls',`track-${category.id}`);}
  controls.append(previous,next);heading.append(title,count,controls);
  const track=document.createElement('ul');track.id=`track-${category.id}`;track.className='scenario-track';track.setAttribute('aria-label',`${category.title} scenarios`);scenarios.forEach((scenario,index)=>track.append(makeTile(scenario,index)));
  const record={track,previous,next};tracks.push(record);
  const scroll=direction=>track.scrollBy({left:direction*Math.max(100,track.clientWidth*.82),behavior:reducedMotion.matches?'auto':'smooth'});
  previous.addEventListener('click',()=>scroll(-1));next.addEventListener('click',()=>scroll(1));track.addEventListener('scroll',()=>updateArrows(record),{passive:true});
  track.addEventListener('keydown',event=>{
   const current=event.target.closest('.scenario-tile');if(!current)return;
   const buttons=[...track.querySelectorAll('.scenario-tile')],index=buttons.indexOf(current);let destination;
   if(event.key==='ArrowRight')destination=Math.min(buttons.length-1,index+1);
   else if(event.key==='ArrowLeft')destination=Math.max(0,index-1);
   else if(event.key==='Home')destination=0;else if(event.key==='End')destination=buttons.length-1;else return;
   event.preventDefault();event.stopPropagation();setRovingFocus(track,buttons[destination]);buttons[destination].focus({preventScroll:true});reveal(buttons[destination]);
  });
  new ResizeObserver(()=>updateArrows(record)).observe(track);
  section.append(heading,track);root.append(section);
  const link=document.createElement('a');link.href=`#${section.id}`;link.dataset.libraryGame=category.engine||'rage';link.textContent=category.title;link.addEventListener('click',event=>{event.preventDefault();section.scrollIntoView({behavior:reducedMotion.matches?'auto':'smooth',block:'start'});});$('category-nav').append(link);
  requestAnimationFrame(()=>updateArrows(record));
 }
 async function load(){
  try{
   let data;if(window.__scenarioLibrary?.ready)data=await window.__scenarioLibrary.ready;else{const response=await fetch('catalog/scenarios.json',{cache:'no-cache'});if(!response.ok)throw Error(`Scenario catalog ${response.status}`);data=await response.json();}
   if(!Array.isArray(data?.categories)||!Array.isArray(data?.scenarios))throw Error('Invalid scenario catalog');
   catalog={...data,scenarios:data.scenarios.filter(s=>typeof s.id==='string'&&typeof s.title==='string')};root.replaceChildren();$('category-nav').replaceChildren();
   for(const category of catalog.categories){const scenarios=catalog.scenarios.filter(s=>s.categoryId===category.id);if(scenarios.length)makeCategory(category,scenarios);}
   for(const engine of ['rage','planet']){
    const scenarios=catalog.scenarios.filter(s=>(s.engine||'rage')===engine);
    $(engine+'-game-count').textContent=`${scenarios.length} scenarios`;
    const preview=scenarios.find(s=>/goldmine/i.test(s.id))||scenarios.find(s=>s.screenshot||s.thumbnail);
    const art=$(engine+'-game-art');
    if(engine==='rage'){
     art.src='assets/Rage-GoldRush-card.png';
     art.alt='Gold Rush: a frontier headquarters among desert mesas';
     art.width=800;art.height=450;
    }else if(preview)art.src=preview.screenshot||preview.thumbnail;
   }
   const engine=new URLSearchParams(location.search).get('game');chooseGame(['rage','planet'].includes(engine)?engine:null,{remember:false});
   const requested=new URLSearchParams(location.search).get('scenario');
   if(requested)select(requested);root.setAttribute('aria-busy','false');window.dispatchEvent(new CustomEvent('scenario-catalog-ready',{detail:{catalog}}));return catalog;
  }catch(error){root.replaceChildren();const message=document.createElement('p');message.className='catalog-loading';message.textContent='The scenario library could not load. Reload to try again.';root.append(message);root.setAttribute('aria-busy','false');$('catalog-summary').textContent='';console.error('[gallery]',error);return null;}
 }
 window.addEventListener('community-imported',updateActions);
 window.__scenarioGallery={getSelected:()=>selected,getGame:()=>chosenGame,chooseGame,select,updateActions,getCatalog:()=>catalog,ready:null};window.__scenarioGallery.ready=load();
})();

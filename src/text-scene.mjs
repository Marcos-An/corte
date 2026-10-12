import {captionStyle,captionRuns,captionLayout} from './captions.mjs';
import {snapPoint} from './editor-experience.mjs';
import {textAppearance,animationAt} from './text-style.mjs';

// These are the visible text layers, not a second editor placed over a canvas caption.
export function createTextScene(stage,canvas,{pause,save,select,error,move=()=>{},drop=()=>{},styleWords=()=>{},pickFont=()=>{}}){
 const surface=stage.querySelector('.composition-scene')||document.createElement('div');surface.classList.add('composition-scene','text-scene');if(!surface.isConnected)stage.append(surface);
 const guide={x:document.createElement('div'),y:document.createElement('div')};
 for(const [axis,line] of Object.entries(guide)){line.className='snap-guide snap-'+axis;line.hidden=true;surface.append(line);}
 // Handle and badge live outside the scaled surface so they keep a constant on-screen size.
 // The frame keeps a little air around the letters so corner handles never sit on the text.
 const frame=document.createElement('div'),badge=document.createElement('div'),pad=6;
 frame.className='scene-frame';frame.hidden=true;badge.className='scene-badge';badge.hidden=true;
 for(const corner of ['tl','tr','bl','br']){const h=document.createElement('div');h.className='scene-resize';h.dataset.corner=corner;h.title='Arraste para redimensionar';h.addEventListener('pointerdown',e=>startResize(h,e));frame.append(h);}
 stage.append(frame,badge);
 // Word bar: shows over the text while words are selected inside it, and styles only those words.
 const bar=document.createElement('div');bar.className='word-bar';bar.hidden=true;bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Estilo da palavra selecionada');
 // One compact pill, like the Edits text toolbar: colour, weight, slant, size, font, reset.
 bar.innerHTML='<label class="word-color" title="Cor"><input type="color" aria-label="Cor da palavra"></label><span class="word-sep"></span><button data-act="bold" aria-label="Negrito na palavra" title="Negrito"><b>B</b></button><button data-act="italic" aria-label="Itálico na palavra" title="Itálico"><i>I</i></button><span class="word-sep"></span><button data-act="smaller" aria-label="Diminuir palavra" title="Diminuir">A<sup>−</sup></button><button data-act="bigger" aria-label="Aumentar palavra" title="Aumentar">A<sup>+</sup></button><span class="word-sep"></span><button data-act="font" class="word-font" aria-label="Fonte da palavra" title="Fonte"><span></span></button><span class="word-sep"></span><button data-act="clear" aria-label="Limpar estilo da palavra" title="Voltar ao estilo do texto"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4"/></svg></button><span class="word-label"></span>';
 stage.append(bar);
 let wordSel=null,pendingWords=null;
 function selectedWords(node){
  const sel=getSelection();if(!sel.rangeCount)return null;const r=sel.getRangeAt(0);
  if(r.collapsed||!node.contains(r.startContainer)||!node.contains(r.endContainer))return null;
  const offset=(c,o)=>{const pre=document.createRange();pre.selectNodeContents(node);pre.setEnd(c,o);return pre.toString().length;};
  const a=offset(r.startContainer,r.startOffset),b=offset(r.endContainer,r.endOffset),found=[],re=/\S+/g;let m,i=0;
  while((m=re.exec(node.textContent))){if(m.index<b&&m.index+m[0].length>a)found.push({index:i,text:m[0]});i++;}
  return found.length?{node,indices:found.map(w=>w.index),words:found.map(w=>w.text)}:null;
 }
 function placeBar(){
  bar.hidden=!wordSel||!wordSel.node.isConnected;if(bar.hidden)return;
  const {node,indices,words}=wordSel,style=captionStyle(node.entry.style),own=(node.entry.wordStyles||[]).find(w=>w.index===indices[0])||{};
  bar.querySelector('.word-label').textContent=words.length===1?'“'+words[0]+'”':words.length+' palavras';
  bar.querySelector('input').value=own.color||style.color;const font=bar.querySelector('.word-font span');font.textContent=own.font||style.font;font.style.fontFamily=`"${own.font||style.font}"`;
  bar.querySelector('[data-act=bold]').setAttribute('aria-pressed',String(own.bold??!!style.bold));bar.querySelector('[data-act=italic]').setAttribute('aria-pressed',String(own.italic??!!style.italic));
  bar.querySelector('[data-act=clear]').disabled=!(node.entry.wordStyles||[]).some(w=>indices.includes(w.index));bar.querySelector('.word-label').hidden=words.length===1;
  const r=node.getBoundingClientRect(),st=stage.getBoundingClientRect();
  const above=r.top-st.top-pad-bar.offsetHeight-8,half=bar.offsetWidth/2;
  Object.assign(bar.style,{left:Math.max(half+8,Math.min(st.width-half-8,r.left+r.width/2-st.left))+'px',top:(above>=4?above:r.bottom-st.top+pad+8)+'px'});
 }
 function applyWords(patch){
  if(!wordSel||disabled)return;const {node,indices}=wordSel;
  pendingWords={key:node.entry.key,indices};
  styleWords(node.entry,node.editing?node.innerText.trim():node.entry.text,indices,patch);
 }
 document.addEventListener('selectionchange',()=>{
  const focused=document.activeElement;
  if(focused?.classList?.contains('scene-text')&&focused.entry?.id&&focused.editing)wordSel=selectedWords(focused)||null;
  else if(!bar.contains(focused))wordSel=null;
  placeBar();
 });
 bar.addEventListener('mousedown',e=>{if(!e.target.closest('input'))e.preventDefault();});
 bar.addEventListener('click',e=>{
  const act=e.target.closest('[data-act]')?.dataset.act;if(!act||!wordSel)return;
  const own=(wordSel.node.entry.wordStyles||[]).find(w=>w.index===wordSel.indices[0])||{},style=captionStyle(wordSel.node.entry.style);
  if(act==='font'){const {node,indices}=wordSel,text=node.editing?node.innerText.trim():node.entry.text,entry=node.entry;pickFont({current:own.font||style.font,apply:font=>{if(!disabled)styleWords(entry,text,indices,{font});}});}
  else if(act==='clear')applyWords(null);
  else if(act==='bold'||act==='italic')applyWords({[act]:!(own[act]??!!style[act])});
  else applyWords(cur=>({scale:Math.max(50,Math.min(200,(cur.scale||100)+(act==='bigger'?15:-15)))}));
 });
 bar.querySelector('input').addEventListener('input',e=>{if(wordSel)for(const i of wordSel.indices){const w=wordSel.node.querySelector(`[data-word="${i}"]`);if(w)w.style.color=e.target.value;}});
 bar.querySelector('input').addEventListener('change',e=>applyWords({color:e.target.value}));
  // The frame belongs to a click on the video, not to panel selection: playback and clicks elsewhere hide it.
 let active=null;
 function deselect(){active=null;placeHandle();}
 document.addEventListener('pointerdown',e=>{if(active&&!e.target.closest?.('.scene-text,.scene-frame,.library,dialog'))deselect();},true);
 const center=style=>({x:style.positionX??50,y:style.positionY??(style.position==='top'?14:style.position==='center'?50:86)});
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const round=v=>Math.round(v*10)/10;
 // Half sizes come from the rendered box, in percent of the canvas.
 function bounds(node){const at=node.entry.keyframePose||center(captionStyle(node.entry.style));return {...at,hw:node.offsetWidth/2/canvas.width*100,hh:node.offsetHeight/2/canvas.height*100};}
 function showGuides({x=null,y=null}={}){
  guide.x.hidden=x===null;guide.x.style.left=x+'%';
  guide.y.hidden=y===null;guide.y.style.top=y+'%';
 }
 function showBadge(node,text){
  badge.hidden=!text;if(!text)return;badge.textContent=text;
  const r=node.getBoundingClientRect(),s=stage.getBoundingClientRect();
  Object.assign(badge.style,{left:r.left+r.width/2-s.left+'px',top:Math.max(4,r.top-s.top-pad-30)+'px'});
 }
 function placeHandle(){
  const node=[...nodes.values()].find(n=>n.classList.contains('dragging'))||nodes.get(active);
  frame.hidden=!node||disabled;if(frame.hidden)return;
  const r=node.getBoundingClientRect(),s=stage.getBoundingClientRect();
  Object.assign(frame.style,{left:r.left-s.left-pad+'px',top:r.top-s.top-pad+'px',width:r.width+pad*2+'px',height:r.height+pad*2+'px'});frame.node=node;
 }
 function gesture(e,node,step,finish){
  e.preventDefault();e.stopPropagation();pause();
  if(document.activeElement!==node)document.activeElement?.blur?.();
  const target=e.currentTarget;target.setPointerCapture(e.pointerId);
  let moved=false,last=null;
  const onMove=ev=>{
   if(!moved&&Math.hypot(ev.clientX-e.clientX,ev.clientY-e.clientY)<3)return;
   moved=true;node.classList.add('dragging');last=step(ev);move(node.entry,last.patch);showBadge(node,last.label);placeHandle();
  };
  const onEnd=ev=>{
   target.removeEventListener('pointermove',onMove);target.removeEventListener('pointerup',onEnd);target.removeEventListener('pointercancel',onEnd);
   node.classList.remove('dragging');showGuides();showBadge(node,'');
   if(ev.type==='pointercancel'){if(moved)move(node.entry,null);return;}
   if(moved)drop(node.entry,last.patch,last.history);else finish?.(ev);
  };
  target.addEventListener('pointermove',onMove);target.addEventListener('pointerup',onEnd);target.addEventListener('pointercancel',onEnd);
 }
 // Text layers move with a press-and-drag; a press without movement still opens text editing.
 // Shift locks the dominant axis, Alt moves freely without snapping.
 function startDrag(node,e){
  if(disabled||e.button!==0)return;
  active=node.entry.key;placeHandle();
  if(node.editing)return;
  select(node.entry);
  const box=surface.getBoundingClientRect(),self=bounds(node),others=[...nodes.values()].filter(n=>n!==node).map(bounds);
  const targets={x:[5,50,95,...others.flatMap(o=>[o.x,o.x-o.hw,o.x+o.hw])],y:[15,50,85,...others.flatMap(o=>[o.y,o.y-o.hh,o.y+o.hh])]};
  const offsets={x:[0,-self.hw,self.hw],y:[0,-self.hh,self.hh]};
  gesture(e,node,ev=>{
   let dx=ev.clientX-e.clientX,dy=ev.clientY-e.clientY;
   if(ev.shiftKey){if(Math.abs(dx)>Math.abs(dy))dy=0;else dx=0;}
   const x=self.x+dx/box.width*100,y=self.y+dy/box.height*100;
   const at=ev.altKey?{x:round(x),y:round(y),guides:{}}:snapPoint(x,y,targets,6/box.width*100,6/box.height*100,offsets);
   const px=clamp(at.x,5,95),py=clamp(at.y,15,85);
   showGuides({x:px===at.x?at.guides.x:null,y:py===at.y?at.guides.y:null});
   return {patch:{positionX:px,positionY:py},label:'X '+Math.round(px)+'% · Y '+Math.round(py)+'%',history:'Mover'};
  },ev=>{
   node.focus();
   const range=document.caretRangeFromPoint?.(ev.clientX,ev.clientY);
   if(range&&node.contains(range.startContainer)){const sel=getSelection();sel.removeAllRanges();sel.addRange(range);}
  });
 }
 // Every corner scales around the text center, so the text stays where it was placed.
 function startResize(h,e){
  const node=frame.node;if(!node||disabled||e.button!==0)return;
  const r=node.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,from=Math.hypot(e.clientX-cx,e.clientY-cy)||1,size=captionStyle(node.entry.style).size;
  gesture(e,node,ev=>{
   const next=round(clamp(size*Math.hypot(ev.clientX-cx,ev.clientY-cy)/from,3,12));
   return {patch:{size:next},label:'Tamanho '+next.toFixed(1),history:'Redimensionar'};
  });
 }
 const nodes=new Map(),measure=document.createElement('canvas').getContext('2d');let current=[],time=0,disabled=false;
 function align(){
  const r=canvas.getBoundingClientRect(),s=stage.getBoundingClientRect();
  Object.assign(surface.style,{left:r.left-s.left+'px',top:r.top-s.top+'px',width:canvas.width+'px',height:canvas.height+'px',transform:'scale('+r.width/canvas.width+')'});
  surface.style.setProperty('--scene-scale',String(r.width/canvas.width||1));
 }
 new ResizeObserver(align).observe(canvas);
 document.fonts.addEventListener('loadingdone',()=>update(current,time,disabled));
 function paint(node,entry){
  const style=captionStyle(entry.style),size=canvas.width*style.size/100;
  measure.font=(style.italic?'italic ':'')+(style.bold?'700 ':'')+size+'px "'+style.font+'"';
  const look=textAppearance(style,size),upper=t=>style.uppercase?t.toUpperCase():t;
  const runs=captionRuns(entry,time,style),layout=captionLayout(runs,t=>measure.measureText(upper(t)).width,canvas.width*(style.width??85)/100,!!entry.id);
  const at=entry.keyframePose||center(style);node.classList.add('movable');node.classList.toggle('selected',!!entry.selected);
  Object.assign(node.style,{left:at.x+'%',top:at.y+'%',width:'max-content',maxWidth:(style.width??85)+'%',fontFamily:'"'+style.font+'"',fontSize:size*layout.scale+'px',color:style.color,...textAppearance(style,size*layout.scale).node});
  // Same linear entrance/exit as the export; idle texts get the plain centring transform.
  const anim=entry.id&&!node.classList.contains('dragging')?animationAt(style,entry.start,entry.end,time):{opacity:1,x:0,y:0,scale:1};
  node.style.opacity=anim.opacity*(entry.keyframePose?.opacity??100)/100;node.style.transform=`translate(-50%,-50%) translate(${anim.x*canvas.width/100}px,${anim.y*canvas.height/100}px) scale(${anim.scale})`;
  // While typing, show the stored text as it is (no CSS capitals), so what is saved is what is seen.
  if(node.editing)node.style.textTransform='none';
  const restoring=pendingWords?.key===entry.key;
  if(node===document.activeElement&&!restoring)return;
  const signature=JSON.stringify([entry.text,runs,style,entry.wordStyles]);
  if(node.dataset.render===signature&&!restoring)return;
  node.dataset.render=signature;node.replaceChildren();
  if(entry.id){
   // Text layers: one box around the whole text, one span per word so a single word can carry its own look.
   const wrap=document.createElement('span'),own=new Map((entry.wordStyles||[]).map(w=>[w.index,w])),total=entry.text.split(/\s+/).filter(Boolean).length;let index=0;
   if(look.box)Object.assign(wrap.style,textAppearance(style,size*layout.scale).box);
   for(const part of entry.text.split(/(\s+)/)){
    if(!part)continue;if(/^\s+$/.test(part)){wrap.append(part);continue;}
    const i=index++,word=document.createElement('span'),o=own.get(i);word.textContent=part;word.dataset.word=i;
    if(style.accentLast&&i===total-1){word.dataset.keyword='true';word.style.color=style.accent||'#ffd84a';}
    if(o){word.dataset.own='true';if(o.color)word.style.color=o.color;if(o.bold!==undefined)word.style.fontWeight=o.bold?'700':'400';if(o.italic!==undefined)word.style.fontStyle=o.italic?'italic':'normal';if(o.scale)word.style.fontSize=o.scale/100+'em';if(o.font)word.style.fontFamily=`"${o.font}"`;}
    wrap.append(word);
   }
   node.append(wrap);
  }else for(const [i,run] of runs.entries()){
   if(i)node.append(document.createTextNode(' '));
   const span=document.createElement('span');span.textContent=run.text;if(look.box)Object.assign(span.style,textAppearance(style,size*layout.scale).box);
   if(run.active){span.dataset.activeWord='true';span.style.color=style.preset==='karaoke'?'#101113':style.accent||'#eac39b';span.style.webkitTextStroke='0';if(style.preset==='karaoke')span.style.background=style.accent||'#eac39b';}
   node.append(span);
  }
  if(restoring){
   const {indices}=pendingWords;pendingWords=null;
   const first=node.querySelector(`[data-word="${indices[0]}"]`),last=node.querySelector(`[data-word="${indices.at(-1)}"]`);
   if(first&&last&&node===document.activeElement){const r=document.createRange();r.setStartBefore(first);r.setEndAfter(last);const sel=getSelection();sel.removeAllRanges();sel.addRange(r);}
  }
 }
 function finish(node,cancel=false){
  const entry=node.entry;if(!node.editing)return;node.editing=false;
  const text=entry.id?node.innerText.trim():node.innerText.trim().replace(/\s+/g,' ');
  node.dataset.render='';
  if(!cancel&&text!==entry.text){
   try{if(!text)throw Error('O texto não pode ficar vazio.');save(entry,text);}
   catch(e){error(e.message);}
  }
  update(current,time,disabled);
 }
 function update(entries,at,busy=false){
  current=entries;time=at;disabled=busy;align();
  for(const [key,node] of nodes)if(!entries.some(e=>e.key===key)){
   nodes.delete(key);node.editing=false;node.remove();
  }
  for(const entry of entries){
   let node=nodes.get(entry.key);
   if(!node){
    node=document.createElement('div');node.className='scene-text';node.setAttribute('role','textbox');node.setAttribute('aria-label',entry.id?'Editar texto no vídeo':'Editar legenda no vídeo');node.spellcheck=false;
    node.addEventListener('focus',()=>{pause();node.editing=true;select(node.entry);placeHandle();});
    node.addEventListener('blur',()=>{finish(node);placeHandle();setTimeout(()=>{if(!bar.contains(document.activeElement)&&document.activeElement!==node){wordSel=null;placeBar();}});});
    node.addEventListener('pointerdown',e=>startDrag(node,e));
    node.addEventListener('mousedown',e=>{if(!node.editing)e.preventDefault();});
    node.addEventListener('input',()=>{paint(node,{...node.entry,text:node.innerText,tokens:undefined});placeHandle();});
    node.addEventListener('keydown',e=>{
     e.stopPropagation();
     if(e.key==='Escape'){e.preventDefault();active=null;node.editing=false;node.dataset.render='';node.blur();update(current,time,disabled);}
     else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();node.blur();}
    });
    surface.append(node);nodes.set(entry.key,node);
   }
   node.entry=entry;node.style.zIndex=entry.z||1;node.contentEditable=busy?'false':'plaintext-only';paint(node,entry);
  }
  placeHandle();placeBar();
 }
 return {update,deselect,bounds:key=>nodes.has(key)?bounds(nodes.get(key)):null};
}

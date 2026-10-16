import {applyKeyframes,keyframeAt} from './keyframes.mjs';
import {clipSpeed,clipDuration,sourceTime,montageTime} from './clip-time.mjs';
import {DEFAULT_ADJUSTMENTS} from './color-adjustments.mjs';
import {audioLevel} from './audio-envelope.mjs';
import {SHAPES,shapeSvg} from './shapes.mjs';
import {createTransitionPreview,paintClip} from './transition-preview.mjs';
import {createImageScene} from './image-scene.mjs';
import {createTextScene} from './text-scene.mjs';
import {FONTS,FONT_CATEGORIES} from './fonts.mjs';
import {TEXT_PRESETS,ENTER_ANIMATIONS,EXIT_ANIMATIONS,presetOf,fullLook,textAppearance} from './text-style.mjs';
import {editCaption,addCaptionAt,alignCaptions} from './caption-editing.mjs';
import {aiProgress,assignLanes,timelineEdgeSpeed,timelinePointerTime,playbackStart,editorPanel,validateScopedPlan,dragCrop,nextClipTime,previewSize} from './editor-experience.mjs';
import {removeTimelineRange,initialRange,moveRange} from './range-selection.mjs';
import {captionEntries,captionStyle} from './captions.mjs';
import {transitionRoom,setMotion,createProject,addAsset,addClip,addMusic,editMusic,addTextLayer,editTextLayer,remapWordStyles,addImageLayer,editImageLayer,addVideoLayer,editVideoLayer,addShapeLayer,editShapeLayer,editProject,History,layerOrder,moveLayer,setKeyframe,transitionLimit,setTransition,transitionAt,duration,clipAt,applyPlan} from './project.mjs';
const $=id=>document.getElementById(id),bridge=window.editor;
let aiRunning=false,aiProgressState=null;
let captionPreviewStyle=null,previewCrop=null,adjustmentPreview=null;
let updateState={phase:'idle'},mediaHydrationState=null,lastHydrationErrors=0;
let activePanel=null,recorder=null,recordStream=null,recordDiscard=false,recordAt=0,recordTimer=null;
let cutMode=false,rangeMode=false,rangeSelection=null,rangePlaybackEnd=null,removalPreview=null;
let history=new History(createProject()),selected=null,position=0,zoom=4,playing=false,busy=false,openingProject=false,connected=false,dirty=false,pending=null,dragId=null;
const media=new Map(),video=$('source-video'),canvas=$('preview-canvas'),ctx=canvas.getContext('2d');
let activeSource=null,activeClip=null,audioContext=null,gain=null,toastTimer;
const project=()=>history.current;const musicPlayers=new Map();let selectedMusic=null;
const timelineDuration=()=>Math.max(duration(project()),...(project().music||[]).map(c=>c.start+c.out-c.in));
const icon=name=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('icon');const use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href',`#i-${name}`);svg.append(use);return svg;};
const decimal=(n,digits=1,min=digits)=>Number(n).toLocaleString('pt-BR',{minimumFractionDigits:min,maximumFractionDigits:digits});
const format=(time,frames=false)=>{const v=Math.max(0,time);const m=Math.floor(v/60),s=Math.floor(v%60);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${frames?':'+String(Math.floor(v%1*30)).padStart(2,'0'):''}`;};
function toast(message,error=false){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,error?12000:4500);}
function guard(fn){return async(...args)=>{try{await fn(...args);}catch(e){toast(e.message,true);}};}
function markDirty(value=true){dirty=value;renderUpdate();$('save-state').textContent=value?'Não salvo':'Salvo no computador';bridge?.setDirty(value).catch(()=>{});}
function stop(){if(recorder?.state==='recording')recorder.stop();removalPreview=null;rangePlaybackEnd=null;playing=false;video.pause();transitionPreview.pause();for(const m of musicPlayers.values())m.el.pause();document.querySelectorAll('.image-layer video').forEach(v=>v.pause());$('play').replaceChildren(icon('play'));$('play').setAttribute('aria-label','Reproduzir');}
function commit(next,metadata){adjustmentPreview=null;captionPreviewStyle=null;captionPlacePreview=null;textPreview=null;closeClipMenu();if(busy)throw new Error('Aguarde a operação atual.');stop();rangeSelection=null;history.commit(next,metadata||describeChange(project(),next));pending=null;$('proposal').hidden=true;markDirty();position=Math.min(position,timelineDuration());if(!project().clips.some(c=>c.id===selected))selected=project().clips[0]?.id||null;render();}
function describeChange(before,after){
 const changed=[...new Set([...before.clips,...after.clips].filter(c=>JSON.stringify(before.clips.find(x=>x.id===c.id))!==JSON.stringify(after.clips.find(x=>x.id===c.id))).map(c=>c.id))];
 return {label:after.assets.length>before.assets.length?'Importar mídia':after.clips.length>before.clips.length?'Adicionar trechos':after.clips.length<before.clips.length?'Remover trechos':before.aspect!==after.aspect?'Formato':before.name!==after.name?'Nome do projeto':'Editar projeto',affected:changed,details:changed.slice(0,100).map(id=>{const c=after.clips.find(x=>x.id===id)||before.clips.find(x=>x.id===id),a=after.assets.find(x=>x.id===c.assetId)||before.assets.find(x=>x.id===c.assetId);return `${a?.name||'Trecho'} · ${c.in.toFixed(2)}–${c.out.toFixed(2)}s · volume ${Math.round(c.volume*100)}%`;})};
}
function describeOperation(p,op){
 const c=p.clips.find(c=>c.id===op.clipId),name=p.assets.find(a=>a.id===c?.assetId)?.name||'Projeto';
 const seconds=v=>`${Number(v).toFixed(2)}s`;
 if(op.type==='update'&&Object.keys(op).some(k=>['speed','background','backgroundColor','adjustments','fadeIn','fadeOut'].includes(k))){
  const labels={speed:'Velocidade',background:'Fundo',backgroundColor:'Cor do fundo',adjustments:'Ajustes de imagem',fadeIn:'Fade de entrada',fadeOut:'Fade de saída',volume:'Volume',crop:'Enquadramento'};
  return Object.keys(labels).filter(k=>k in op).map(k=>`${labels[k]} · ${name} · ${JSON.stringify(op[k])}`).join(' / ').slice(0,4000);
 }
 if(op.type==='set_transition_at')return `Transição · junção ${op.index+1} · ${op.effect} · ${seconds(op.duration)}`;
 if(op.type==='set_transition')return `Transição · ${op.leftId} → ${op.rightId} · ${op.effect} · ${seconds(op.duration)}`;
 if(op.type==='edit_audio')return `Áudio · ${op.audioId} · ${JSON.stringify(op.patch)}`;
 if(op.type.startsWith('add_'))return `${({add_text:'Texto',add_image:'Imagem',add_video:'Vídeo sobreposto',add_shape:'Forma'})[op.type]} · ${op.layer.id} · ${seconds(op.layer.start)}–${seconds(op.layer.end)}`;
 if(['edit_component','remove_component','move_component','set_motion'].includes(op.type))return `${({edit_component:'Editar componente',remove_component:'Remover componente',move_component:'Ordem do componente',set_motion:'Animação'})[op.type]} · ${op.layerId}`;
 if(['set_keyframe','remove_keyframe'].includes(op.type))return `${op.type==='set_keyframe'?'Keyframe':'Remover keyframe'} · ${op.layerId} · ${seconds(op.time)}`;
 if(op.type==='set_aspect')return `Formato · ${op.aspect}`;
 if(op.type==='update'&&'volume'in op)return `${op.volume===0?'Silenciar':'Volume'} · ${name} · ${Math.round(op.volume*100)}%`;
 if(op.type==='update'&&op.crop)return `Reenquadramento · ${name} · x ${Math.round(op.crop.x*100)}%, y ${Math.round(op.crop.y*100)}%, largura ${Math.round(op.crop.w*100)}%, altura ${Math.round(op.crop.h*100)}%`;
 if(op.type==='trim')return `Aparar · ${name} · ${seconds(op.in)}–${seconds(op.out)}`;
 if(op.type==='split')return `Dividir · ${name} · ${seconds(op.time)}`;
 if(op.type==='move')return `Mover · ${name} · posição ${op.index+1}`;
 if(op.type==='adjust_ranges')return `${({speed:'Velocidade',crop:'Zoom/enquadramento',adjustments:'Ajustes de imagem',volume:'Volume'})[Object.keys(op.patch)[0]]} em trechos · ${name} · ${op.ranges.map(([start,end])=>`${seconds(start)}–${seconds(end)}`).join(', ')} · ${JSON.stringify(Object.values(op.patch)[0])}`.slice(0,4000);
 if(op.ranges)return `${op.type==='keep_ranges'?'Manter':'Remover'} intervalos · ${name} · ${op.ranges.map(([start,end])=>`${seconds(start)}–${seconds(end)}`).join(', ')}`.slice(0,4000);
 return `Remover · ${name}`;
}
const editLabels={trim:'Aparar trecho',split:'Dividir trecho',delete:'Remover trecho',move:'Mover trecho',update:'Volume / reenquadramento',set_aspect:'Formato'};
function edit(op){const q=editProject(project(),op);commit(q,{...describeChange(project(),q),label:op.type==='update'?(('volume'in op)?'Volume':('fadeIn'in op||'fadeOut'in op)?'Fade de áudio':'adjustments'in op?'Ajustes de imagem':'speed'in op?'Velocidade':'Reenquadramento'):(editLabels[op.type]||'Editar projeto')});}
function renderHistory(){
 const list=$('history-list');list.replaceChildren();
 history.entries.forEach((entry,index)=>{const row=document.createElement('div');row.className='history-entry';row.classList.toggle('current',index===history.cursor);const button=document.createElement('button');button.textContent=entry.label;button.setAttribute('aria-label',`Restaurar ${index}: ${entry.label}`);button.setAttribute('aria-current',index===history.cursor?'step':'false');button.disabled=busy;button.addEventListener('click',guard(()=>{if(busy)return;stop();closeClipMenu();history.restore(index);position=Math.min(position,timelineDuration());selected=project().clips[0]?.id||null;pending=null;$('proposal').hidden=true;markDirty();render();}));const time=document.createElement('small');time.textContent=new Date(entry.at).toLocaleTimeString('pt-BR')+` · estado ${index} · origem ${entry.parent??'inicial'}`;row.append(button,time);if(entry.details.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=`${entry.details.length} detalhe(s)`;details.append(summary);for(const text of entry.details){const item=document.createElement('p');item.textContent=text;details.append(item);}row.append(details);}list.append(row);});
}
$('history-toggle').addEventListener('click',()=>{$('history-panel').hidden=false;renderHistory();});$('history-close').addEventListener('click',()=>$('history-panel').hidden=true);

function setBusy(value,label='Preparando…',cancellable=true){busy=value;bridge?.setBusy?.(value).catch(()=>{});$('cancel').hidden=value&&!cancellable;$('ai-engine').disabled=value;$('prompt').disabled=value;renderTextScene();$('busy-message').hidden=!value||aiRunning;$('ai-progress').hidden=!value||!aiRunning;$('ai-panel').setAttribute('aria-busy',String(value&&aiRunning));$('busy-label').textContent=label;updateButtons();document.querySelectorAll('#clip-properties input, #clip-properties button').forEach(e=>e.disabled=value);$('aspect').disabled=value;$('project-name').disabled=value;}
function updateButtons(){
 renderUpdate();
 $('relink-missing').disabled=busy;
 document.querySelectorAll('#components-panel input,#components-panel select,#components-panel button').forEach(e=>e.disabled=busy);$('add-text').disabled=busy||!project().clips.length;
 for(const id of ['clip-split','clip-crop','clip-volume','clip-delete'])$(id).disabled=busy||!selected;
 $('mark-remove').disabled=$('range-mode').disabled=busy||!project().clips.length;
 $('cut-mode').disabled=busy;
 for(const id of ['range-play','range-delete','range-clear'])$(id).disabled=busy||!rangeSelection||rangeSelection.end-rangeSelection.start<.02;
 document.querySelectorAll('#captions-panel input,#captions-panel select,#captions-panel button:not(#caption-cancel),#settings-dialog button').forEach(e=>e.disabled=busy);$('align-captions').disabled=busy||!captionEntries(project()).some(w=>w.place);$('settings').disabled=busy;$('history-toggle').disabled=busy;$('undo').disabled=busy||!history.canUndo;$('redo').disabled=busy||!history.canRedo;
 for(const id of ['split','delete','move-left','move-right'])$(id).disabled=busy||!selected;
 for(const id of ['nav-media','preview-add','open-project','save-project','save-as-project','save-portable-project'])$(id).disabled=busy;
 $('export').disabled=busy||!project().clips.length;
 const hasSelected=project().clips.some(c=>c.id===selected);$('ai-scope').disabled=busy;$('ai-scope').querySelector('[value=selected]').disabled=!hasSelected;
 if(pending?.scope&&pending.scope!==selected){pending=null;$('proposal').hidden=true;}
 $('analyze').disabled=busy||!project().clips.length||!$('prompt').value.trim()||($('ai-scope').value==='selected'&&!hasSelected);
 $('range-delete').disabled=busy||rangeMode!=='remove'||!rangeSelection;
 $('play').disabled=openingProject||timelineDuration()<=0||!!media.get(clipAt(project(),Math.min(position,Math.max(0,duration(project())-.001)))?.clip.assetId)?.pending;$('connect').disabled=busy||connected;
 for(const type of Object.keys(SHAPES))$('add-shape-'+type).disabled=busy||!project().clips.length;renderComponents();
}
function assetData(a){return {id:a.id,name:a.name,duration:a.duration,width:a.width,height:a.height,hasAudio:a.hasAudio,...(a.kind?{kind:a.kind}:{})};}
let clipMenu=null;
function closeClipMenu(){clipMenu?.remove();clipMenu=null;}
function showClipMenu(e,clipId,audio){
 e.preventDefault();closeClipMenu();if(busy)return;selected=clipId;renderInspector();updateButtons();
 const menu=document.createElement('div');clipMenu=menu;menu.className='clip-context-menu';menu.setAttribute('role','menu');
 const asset=project().assets.find(a=>a.id===project().clips.find(c=>c.id===clipId)?.assetId);
 if(asset&&media.get(asset.id)?.missing){const locate=document.createElement('button');locate.setAttribute('role','menuitem');locate.textContent='Localizar mídia ausente';locate.onclick=guard(async()=>{closeClipMenu();await relinkAssets([asset]);});menu.append(locate);}
 const button=document.createElement('button');button.setAttribute('role','menuitem');button.textContent=audio?'Silenciar áudio do trecho':'Remover trecho';
 button.addEventListener('click',guard(()=>{closeClipMenu();edit(audio?{type:'update',clipId,volume:0}:{type:'delete',clipId});}));menu.append(button);document.body.append(menu);
 const box=menu.getBoundingClientRect();menu.style.left=`${Math.max(0,Math.min(e.clientX,innerWidth-box.width))}px`;menu.style.top=`${Math.max(0,Math.min(e.clientY,innerHeight-box.height))}px`;button.focus();
}
document.addEventListener('pointerdown',e=>{if(clipMenu&&!clipMenu.contains(e.target))closeClipMenu();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeClipMenu();});
function emptyTrackAction(track,label,action){const b=document.createElement('button');b.id='empty-'+track;b.className='empty-track-action';b.append(icon('plus'),document.createTextNode(label));b.onclick=action;$(track+'-track').append(b);return b;}
function renderTimeline(){
 const p=project(),total=duration(p),visualEnd=Math.max(total,...(p.music||[]).map(c=>c.start+c.out-c.in)),width=Math.max(($('timeline-scroll').clientWidth-document.querySelector('.track-sidebar').offsetWidth),visualEnd*zoom+100,500);
 $('timeline-content').style.width=`${width}px`;$('ruler').replaceChildren();
 const interval=zoom>=40?1:zoom>=15?5:zoom>=8?10:20;
 const step=interval===1?.2:interval/5;
 for(let n=0;n<=width/zoom/step;n++){const t=n*step,major=n%5===0,tick=document.createElement('span');tick.className=major?'tick':'tick minor-tick';tick.dataset.time=String(t);tick.style.left=`${t*zoom}px`;if(major)tick.textContent=format(t);$('ruler').append(tick);}
 $('video-track').replaceChildren();$('audio-track').replaceChildren();let start=0;
 for(const c of p.clips){
  const a=p.assets.find(a=>a.id===c.assetId),m=media.get(c.assetId),clip=document.createElement('button'),clipStart=start;
  clip.className=`timeline-clip${selected===c.id?' selected':''}`;clip.dataset.clipId=c.id;clip.style.left=`${start*zoom}px`;clip.style.width=`${clipDuration(c)*zoom}px`;clip.draggable=!busy&&!cutMode&&!rangeMode;clip.setAttribute('aria-label',`Trecho de ${a.name}, ${format(clipDuration(c))}`);
  const film=document.createElement('span');film.className='clip-filmstrip';if(m?.thumbnail)film.style.backgroundImage=`url("${m.thumbnail}")`;
  const label=document.createElement('span');label.className='clip-name';label.textContent=a.name;
  const length=document.createElement('span');length.className='clip-length';length.textContent=format(clipDuration(c));
  clip.append(film,label,length);

  clip.addEventListener('pointermove',e=>{clip.querySelector('.cut-preview')?.remove();if(!cutMode||busy||e.target.closest('.trim-handle'))return;const offset=(e.clientX-clip.getBoundingClientRect().left)/zoom;if(offset<.02||clipDuration(c)-offset<.02)return;const line=document.createElement('span');line.className='cut-preview';line.style.left=`${offset*zoom}px`;line.textContent=format(clipStart+offset,true);clip.append(line);});
  clip.addEventListener('pointerleave',()=>clip.querySelector('.cut-preview')?.remove());
  clip.addEventListener('contextmenu',e=>showClipMenu(e,c.id,false));
  clip.addEventListener('click',guard(e=>{if(busy||rangeMode||e.target.closest('.trim-handle'))return;if(cutMode){const time=sourceTime(c,(e.clientX-clip.getBoundingClientRect().left)/zoom);if(time-c.in<.02||c.out-time<.02)return;selected=c.id;edit({type:'split',clipId:c.id,time});return;}selectedMusic=null;selected=c.id;seek(clipStart+Math.min(.001,clipDuration(c)/2));renderTimeline();renderInspector();}));
  clip.addEventListener('dragstart',e=>{if(busy||cutMode||rangeMode){e.preventDefault();return;}dragId=c.id;e.dataTransfer.setData('text/plain',c.id);});
  clip.addEventListener('dragover',e=>{if(dragId && !busy)e.preventDefault();});
  clip.addEventListener('drop',guard(e=>{e.preventDefault();if(dragId && !busy){edit({type:'move',clipId:dragId,index:p.clips.findIndex(x=>x.id===c.id)});dragId=null;}}));
  clip.addEventListener('dragend',()=>dragId=null);$('video-track').append(clip);
  if(a.hasAudio){const block=document.createElement('div');block.className='audio-block';block.dataset.clipId=c.id;block.addEventListener('contextmenu',e=>showClipMenu(e,c.id,true));block.style.left=`${start*zoom}px`;block.style.width=`${clipDuration(c)*zoom}px`;const text=document.createElement('span');text.textContent=`♫ Áudio original · ${Math.round(c.volume*100)}%`;block.append(text);$('audio-track').append(block);}
  start+=clipDuration(c);
 }
 $('narration-track').replaceChildren();const hasNarration=p.music?.some(c=>c.role==='narration');$('narration-track').hidden=false;document.querySelector('.narration-track-label').hidden=false;document.querySelector('.timeline').classList.toggle('has-narration',!!hasNarration);$('music-track').replaceChildren();for(const c of p.music||[]){
 const block=document.createElement('button');block.className=`music-block${selectedMusic===c.id?' selected':''}`;block.setAttribute('aria-pressed',String(selectedMusic===c.id));block.dataset.start=c.start;block.style.left=`${c.start*zoom}px`;block.style.width=`${clipDuration(c)*zoom}px`;const label=document.createElement('span');label.textContent=`♫ ${p.assets.find(a=>a.id===c.assetId)?.name||'Música'}`;block.append(label);
 const selectMusic=()=>{selectedMusic=c.id;showInspector('audio');for(const item of [...$('music-track').children,...$('narration-track').children]){const active=item===block;item.classList.toggle('selected',active);item.setAttribute('aria-pressed',String(active));}renderInspector();};
 block.onclick=e=>{if(busy||e.target.closest('.trim-handle'))return;selectMusic()};block.ondblclick=e=>{if(e.target.closest('.trim-handle'))return;selectMusic();$('music-in').focus();};
 for(const side of ['left','right']){const handle=document.createElement('span');handle.className=`trim-handle ${side}`;handle.textContent='⋮';handle.title=side==='left'?'Ajustar início da música':'Ajustar final da música';handle.addEventListener('pointerdown',e=>beginMusicTrim(e,c,side,block));block.append(handle);}
 block.oncontextmenu=e=>{e.preventDefault();closeClipMenu();if(busy)return;selectMusic();const menu=document.createElement('div');clipMenu=menu;menu.className='clip-context-menu';menu.setAttribute('role','menu');for(const [text,action] of [['Editar música',()=>{$('music-in').focus()}],['Remover música',()=>commit(editMusic(project(),c.id,null),{label:'Remover música'})]]){const b=document.createElement('button');b.textContent=text;b.setAttribute('role','menuitem');b.onclick=guard(()=>{closeClipMenu();action()});menu.append(b)}document.body.append(menu);const box=menu.getBoundingClientRect();menu.style.left=`${Math.max(0,Math.min(e.clientX,innerWidth-box.width))}px`;menu.style.top=`${Math.max(0,Math.min(e.clientY,innerHeight-box.height))}px`;};
 block.onpointerdown=e=>{if(e.button!==0||busy||e.target.closest('.trim-handle'))return;stop();const x=e.clientX,initial=c.start;block.setPointerCapture(e.pointerId);let start=initial;block.onpointermove=ev=>{start=Math.max(0,initial+(ev.clientX-x)/zoom);block.style.left=`${start*zoom}px`};block.onpointercancel=()=>{block.onpointermove=null;block.onpointerup=null;renderTimeline()};block.onpointerup=guard(()=>{block.onpointermove=null;block.onpointerup=null;if(Math.abs(start-initial)>.01)commit(editMusic(project(),c.id,{start}),{label:'Mover música'});});};$(c.role==='narration'?'narration-track':'music-track').append(block);}

 let cut=0;
 for(let i=0;i<p.clips.length-1;i++){
  const left=p.clips[i],right=p.clips[i+1];cut+=clipDuration(left);const t=p.transitions?.find(t=>t.leftId===left.id&&t.rightId===right.id),button=document.createElement('button');
  button.className='transition-junction'+(t?' active':'')+(Math.min(clipDuration(left),clipDuration(right))*zoom<44?' compact':'');button.style.left=cut*zoom+'px';button.textContent=t?'◇':'+';button.title=t?({dissolve:'Dissolver',fade:'Escurecer',slide:'Deslizar'}[t.type]+' · '+decimal(t.duration,1,0)+' s'):'Adicionar transição';button.setAttribute('aria-label','Transição entre '+p.assets.find(a=>a.id===left.assetId).name+' e '+p.assets.find(a=>a.id===right.assetId).name);
  button.onpointerdown=e=>e.stopPropagation();const boundary=cut;button.onclick=()=>{if(!busy)openTransition(left.id,right.id,boundary);};$('video-track').append(button);
 }
 $('image-track').replaceChildren();$('image-track').hidden=!visualLayers(p).length;document.querySelector('.image-track-label').hidden=$('image-track').hidden;
 const imageLanes=assignLanes(visualLayers(p));
 for(const t of visualLayers(p)){
 const block=document.createElement('button'),{lane,lanes:count}=imageLanes.get(t.id);block.style.setProperty('--lane',lane);block.style.setProperty('--lanes',count);block.className='caption-block image-block'+(t.type?' shape-block':'')+(t.in!==undefined?' video-layer-block':'');block.textContent=p.assets.find(a=>a.id===t.assetId)?.name||SHAPES[t.type]||'Imagem';
 const name=block.textContent,label=document.createElement('span');label.className='caption-block-text';label.textContent=name;block.replaceChildren(label);block.dataset.imageId=t.id;block.classList.toggle('selected',t.id===selectedImage);block.setAttribute('aria-pressed',String(t.id===selectedImage));block.title='Arraste para mover · puxe as bordas para ajustar o intervalo';
 for(const side of ['start','end']){const h=document.createElement('span');h.className='image-trim '+side;h.dataset.edge=side;h.setAttribute('aria-hidden','true');block.append(h);}
 const place=(start,end)=>{block.style.left=start*zoom+'px';block.style.width=(end-start)*zoom+'px';};place(t.start,t.end);let dragged=false;
 block.onpointerdown=e=>{
  if(busy||e.button!==0)return;e.preventDefault();e.stopPropagation();stop();block.setPointerCapture(e.pointerId);dragged=false;
  const mode=e.target.dataset.edge||'move',x=e.clientX,total=Math.max(duration(project()),t.end),length=t.end-t.start,asset=p.assets.find(a=>a.id===t.assetId),isVideo=t.in!==undefined;
  let start=t.start,end=t.end,sourceIn=t.in;const round=n=>Math.round(n*100)/100,lock=v=>{if(!e.altKey)for(const target of [0,position,total])if(Math.abs(v-target)*zoom<8)return target;return v;},clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const move=ev=>{
   if(!dragged&&Math.abs(ev.clientX-x)<3)return;dragged=true;const dx=(ev.clientX-x)/zoom;
   if(mode==='move'){start=round(clamp(lock(t.start+dx),0,Math.max(0,total-length)));end=round(start+length);}
   else if(mode==='start'){start=round(clamp(lock(t.start+dx),Math.max(0,isVideo?t.start-t.in:0),t.end-.02));if(isVideo)sourceIn=round(t.in+start-t.start);}
   else end=round(clamp(lock(t.end+dx),t.start+.02,Math.min(total,isVideo?t.start+asset.duration-t.in:total)));
   place(start,end);label.textContent=start.toFixed(2)+' → '+end.toFixed(2)+' s';
  };
  const finish=guard(ev=>{
   block.removeEventListener('pointermove',move);block.removeEventListener('pointerup',finish);block.removeEventListener('pointercancel',finish);
   if(!dragged||ev.type==='pointercancel'||start===t.start&&end===t.end){place(t.start,t.end);label.textContent=name;return;}
   selectedImage=t.id;selectedText=null;commit(editVisual(project(),t.id,{start,end,...(isVideo?{in:sourceIn}:{})}),{label:mode==='move'?'Mover sobreposição na timeline':'Ajustar intervalo da sobreposição'});showModule('components');seek(mode==='end'?Math.max(start,end-.01):start);
  });block.addEventListener('pointermove',move);block.addEventListener('pointerup',finish);block.addEventListener('pointercancel',finish);
 };
 block.onclick=()=>{if(busy||dragged)return;block.focus({preventScroll:true});selectedImage=t.id;selectedText=null;seek(t.start);showModule('components');renderComponents();renderTextScene();};$('image-track').append(block);
 block.oncontextmenu=guard(async e=>{e.preventDefault();if(busy)return;const a=p.assets.find(a=>a.id===t.assetId);if(a&&media.get(a.id)?.missing){await relinkAssets([a]);}});
 }
 $('text-track').replaceChildren();$('text-track').hidden=!(p.textLayers||[]).length;document.querySelector('.text-track-label').hidden=$('text-track').hidden;
 const lanes=assignLanes(p.textLayers||[]);
 for(const t of p.textLayers||[]){
  const b=document.createElement('button'),label=document.createElement('span'),{lane,lanes:count}=lanes.get(t.id),name=t.text.replace(/\s+/g,' ');
  b.className='caption-block text-block';b.dataset.textId=t.id;b.classList.toggle('selected',t.id===selectedText);b.classList.toggle('stacked',count>1);
  b.setAttribute('aria-label','Texto: '+t.text);b.title='Arraste para mover · puxe as bordas para mudar início e fim';
  b.style.setProperty('--lane',lane);b.style.setProperty('--lanes',count);
  label.className='caption-block-text';label.textContent=name;
  const edges=['start','end'].map(edge=>{const h=document.createElement('span');h.className='text-trim '+edge;h.dataset.edge=edge;h.setAttribute('aria-hidden','true');return h;});
  b.append(edges[0],label,edges[1]);
  const place=(start,end)=>{b.style.left=start*zoom+'px';b.style.width=(end-start)*zoom+'px';};place(t.start,t.end);
  // The body moves the block keeping its duration; each edge changes only its own side.
  // Every gesture locks onto 0, the playhead and the end of the video.
  let dragged=false;
  b.onpointerdown=e=>{
   if(busy||e.button!==0)return;
   e.preventDefault();b.setPointerCapture(e.pointerId);dragged=false;
   const mode=e.target.dataset.edge||'move',x=e.clientX,total=duration(project()),length=t.end-t.start,min=.1;let start=t.start,end=t.end;
   const lock=v=>{for(const target of [0,position,total])if(Math.abs(v-target)*zoom<8)return target;return v;},round=v=>Math.round(v*100)/100;
   const move=ev=>{
    const dx=(ev.clientX-x)/zoom;if(!dragged&&Math.abs(ev.clientX-x)<3)return;dragged=true;b.classList.add('dragging');
    if(mode==='move'){start=round(lock(Math.max(0,Math.min(total-length,t.start+dx))));end=round(start+length);label.textContent=transportTime(start);}
    else if(mode==='start'){start=round(lock(Math.max(0,Math.min(t.end-min,t.start+dx))));label.textContent=transportTime(start)+' · '+(end-start).toFixed(1)+'s';}
    else{end=round(lock(Math.max(t.start+min,Math.min(total,t.end+dx))));label.textContent=transportTime(end)+' · '+(end-start).toFixed(1)+'s';}
    place(start,end);
   };
   const finish=guard(ev=>{
    b.removeEventListener('pointermove',move);b.removeEventListener('pointerup',finish);b.removeEventListener('pointercancel',finish);b.classList.remove('dragging');
    if(!dragged||ev.type==='pointercancel'||start===t.start&&end===t.end){place(t.start,t.end);label.textContent=name;return;}
    selectedText=t.id;commit(editTextLayer(project(),t.id,{start,end}),{label:mode==='move'?'Mover texto no tempo':'Ajustar duração do texto'});seek(mode==='end'?Math.max(start,end-.05):start);
   });
   b.addEventListener('pointermove',move);b.addEventListener('pointerup',finish);b.addEventListener('pointercancel',finish);
  };
  b.onclick=()=>{if(busy||dragged)return;selectedImage=null;selectedText=t.id;seek(t.start);showModule('components');renderComponents();};$('text-track').append(b);
 }
 $('caption-track').replaceChildren();
 const entries=captionEntries(p);
 if(entries.length){const block=document.createElement('button');block.className='caption-block';block.textContent='Legendas';block.title='Legendas · clique para revisar a fala atual';block.setAttribute('aria-label','Selecionar faixa de legendas');const start=entries.reduce((n,w)=>Math.min(n,w.start),Infinity),end=entries.reduce((n,w)=>Math.max(n,w.end),0);block.style.left=start*zoom+'px';block.style.width=(end-start)*zoom+'px';block.onclick=()=>{if(busy)return;const current=entries.find(w=>position>=w.start&&position<w.end);const w=current||entries.find(w=>w.start>=position)||entries[0];if(!current)selectCaption(w);else selectedCaptionKey=captionKey(w);showCaptionModule(true);syncCaptionSelection();};$('caption-track').append(block);}
 if(!$('audio-track').children.length){const note=document.createElement('span');note.className='track-note';note.textContent=p.clips.length?'Sem áudio original':'Áudio dos seus vídeos';$('audio-track').append(note);}
 const addVideo=emptyTrackAction('video','Adicionar vídeos à montagem',()=>importVideos());addVideo.style.left=(total*zoom+8)+'px';
 if(!$('narration-track').children.length)emptyTrackAction('narration','Adicionar narração',()=>showModule('narration'));
 if(!$('caption-track').children.length)emptyTrackAction('caption','Adicionar legendas',()=>showModule('captions'));
 if(!$('music-track').children.length)emptyTrackAction('music','Adicionar música',()=>showModule('audio'));
 syncCaptionSelection();$('timeline-empty').hidden=true;$('timeline-summary').textContent=`${p.clips.length} trecho${p.clips.length===1?'':'s'} · ${format(total)}`;updatePlayhead();renderRange();updateButtons();
}
let transitionSelection=null;
function transitionForm(){
 const pair=transitionSelection;if(!pair)return;const p=project(),i=p.clips.findIndex(c=>c.id===pair.leftId),limit=transitionLimit(p,pair.leftId,pair.rightId),none=$('transition-type').value==='none';
 // Without spare frames the clips are trimmed on apply (transitionRoom), so the cap is only the clips' own length.
 const cap=Math.floor(Math.min(3,clipDuration(p.clips[i]),clipDuration(p.clips[i+1]))*10)/10,requested=Math.min(cap,Number($('transition-duration').value)||.5);
 $('transition-duration').disabled=none||cap<.1;$('transition-duration').max=Math.max(.1,cap);
 $('transition-apply').disabled=!none&&cap<.1;$('transition-preview').disabled=none||cap<.1;
 for(const b of document.querySelectorAll('[data-transition]'))b.setAttribute('aria-pressed',String(b.dataset.transition===$('transition-type').value));
 $('transition-hint').textContent=none?'Corte seco, sem transição.':cap<.1?'Trechos curtos demais para uma transição.':limit>=requested?'A duração do vídeo não muda.':'Sem margem de mídia além do corte: ao aplicar, encurtamos até '+decimal(requested/2,2,1)+' s de cada lado. Dá para desfazer.';
}
function openTransition(leftId,rightId,cut){
 stop();transitionSelection={leftId,rightId,cut};const t=project().transitions?.find(t=>t.leftId===leftId&&t.rightId===rightId);$('transition-type').value=t?.type||'none';$('transition-duration').value=t?.duration||.5;transitionForm();$('transition-dialog').showModal();
}
$('transition-type').onchange=transitionForm;$('transition-duration').oninput=transitionForm;for(const b of document.querySelectorAll('[data-transition]'))b.onclick=()=>{$('transition-type').value=b.dataset.transition;transitionForm();};$('transition-close').onclick=()=>$('transition-dialog').close();
async function applyTransition(preview){
 if(busy||!transitionSelection)return;const {leftId,rightId,cut}=transitionSelection,requested=Number($('transition-duration').value),type=$('transition-type').value,next=setTransition(type==='none'?project():transitionRoom(project(),leftId,rightId,requested),leftId,rightId,type,requested),t=next.transitions.find(t=>t.leftId===leftId&&t.rightId===rightId);
 commit(next,{label:t?'Ajustar transição':'Remover transição'});$('transition-dialog').close();seek(preview&&t?Math.max(0,cut-t.duration/2-.3):cut);
 if(t&&t.duration<requested)toast('Duração limitada a '+decimal(t.duration,1,0)+' s pelas margens disponíveis.');if(preview&&t)await togglePlay();
}
$('transition-apply').onclick=guard(()=>applyTransition(false));$('transition-preview').onclick=guard(()=>applyTransition(true));
let selectedCaptionKey=null;
const captionKey=w=>w.clipId+':'+w.wordIndex;
function syncCaptionSelection(){
 for(const selector of ['#caption-track .caption-block','.caption-row'])document.querySelectorAll(selector).forEach(el=>{const active=el.classList.contains('caption-block')?!!selectedCaptionKey&&captionEntries(project()).some(w=>captionKey(w)===selectedCaptionKey):el.dataset.captionKey===selectedCaptionKey;el.classList.toggle('selected',active);if(el.classList.contains('caption-block'))el.setAttribute('aria-pressed',String(active));});
}
function selectCaption(w){selectedCaptionKey=captionKey(w);stop();seek(w.start);syncCaptionSelection();$('caption-timing-status').textContent='Início '+decimal(w.start,2)+' s · Fim '+decimal(w.end,2)+' s';}
function focusCaptionTime(w){selectCaption(w);setCaptionView('review');$('caption-words').querySelector('.selected input')?.focus();}
const rangeOverlay=document.createElement('div');rangeOverlay.addEventListener('pointerdown',e=>{if(e.target===rangeOverlay)beginRange(e,'body');});rangeOverlay.className='range-overlay';rangeOverlay.hidden=true;$('video-track').parentElement.append(rangeOverlay);
rangeOverlay.addEventListener('contextmenu',e=>{
 e.preventDefault();e.stopPropagation();if(busy||!rangeSelection)return;closeClipMenu();
 const menu=document.createElement('div');clipMenu=menu;menu.className='clip-context-menu';menu.setAttribute('role','menu');
 for(const [label,action] of [['Confirmar remoção',()=>$('range-delete').click()],['Cancelar remoção',cancelRange]]){const button=document.createElement('button');button.setAttribute('role','menuitem');button.textContent=label;button.addEventListener('click',()=>{closeClipMenu();action();});menu.append(button);}
 document.body.append(menu);const box=menu.getBoundingClientRect();menu.style.left=`${Math.max(0,Math.min(e.clientX,innerWidth-box.width))}px`;menu.style.top=`${Math.max(0,Math.min(e.clientY,innerHeight-box.height))}px`;menu.firstChild.focus();
});
function renderRange(){
 const marking=rangeMode==='remove'&&!!rangeSelection&&rangeSelection.end-rangeSelection.start>=.02;
 $('mark-remove').hidden=marking;$('range-delete').hidden=$('range-clear').hidden=!marking;
 rangeOverlay.classList.toggle('removal',rangeMode==='remove');document.querySelector('.range-toolbar').classList.toggle('removal',rangeMode==='remove');$('range-play').textContent=rangeMode==='remove'?'▷ Prévia sem o trecho':'▷ Reproduzir seleção';$('range-play').setAttribute('aria-label',rangeMode==='remove'?'Prévia sem o trecho':'Reproduzir seleção');
 rangeOverlay.hidden=!rangeSelection||rangeSelection.end-rangeSelection.start<.02;
 rangeOverlay.replaceChildren();$('range-info').textContent=rangeSelection?`${rangeSelection.start.toFixed(2)} → ${rangeSelection.end.toFixed(2)} s · ${(rangeSelection.end-rangeSelection.start).toFixed(2)} s selecionados`:'Arraste para selecionar um intervalo';
 if(!rangeSelection)return;
 rangeOverlay.style.left=`${rangeSelection.start*zoom}px`;rangeOverlay.style.width=`${(rangeSelection.end-rangeSelection.start)*zoom}px`;rangeOverlay.style.top=`${$('video-track').offsetTop}px`;rangeOverlay.style.height=`${$('audio-track').offsetTop+$('audio-track').offsetHeight-$('video-track').offsetTop}px`;
 for(const side of ['left','right']){const handle=document.createElement('span');handle.className=`range-handle ${side}`;handle.textContent='⋮';handle.title=side==='left'?'Ajustar início da seleção':'Ajustar final da seleção';handle.addEventListener('pointerdown',e=>beginRange(e,side));rangeOverlay.append(handle);}
}
function beginRange(e,edge){
 if(busy||!rangeMode||e.button!==0)return;e.preventDefault();e.stopPropagation();stop();const track=$('video-track'),rect=track.getBoundingClientRect(),time=x=>Math.max(0,Math.min(duration(project()),(x-rect.left)/zoom)),anchor=time(e.clientX),before=rangeSelection&&{...rangeSelection};
 if(edge==='body'&&!before)return;
 if(!edge){rangeSelection={start:anchor,end:anchor};renderRange();}const originX=e.clientX;const target=e.currentTarget;target.setPointerCapture(e.pointerId);
 const move=e=>{const t=time(e.clientX);if(edge==='body')rangeSelection=moveRange(before,(e.clientX-originX)/zoom,duration(project()));else if(edge==='left')rangeSelection.start=Math.max(0,Math.min(before.start+(e.clientX-originX)/zoom,rangeSelection.end-.02));else if(edge==='right')rangeSelection.end=Math.min(duration(project()),Math.max(before.end+(e.clientX-originX)/zoom,rangeSelection.start+.02));else rangeSelection={start:Math.min(t,anchor),end:Math.max(t,anchor)};
 // Keep captured handles attached throughout the drag.
 rangeOverlay.hidden=rangeSelection.end-rangeSelection.start<.02;rangeOverlay.style.left=`${rangeSelection.start*zoom}px`;rangeOverlay.style.width=`${(rangeSelection.end-rangeSelection.start)*zoom}px`;$('range-info').textContent=`${rangeSelection.start.toFixed(2)} → ${rangeSelection.end.toFixed(2)} s`;};
 const finish=()=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',up);target.removeEventListener('pointercancel',cancel);renderRange();updateButtons();};const up=()=>finish(),cancel=()=>{rangeSelection=before;finish();};target.addEventListener('pointermove',move);target.addEventListener('pointerup',up);target.addEventListener('pointercancel',cancel);move(e);
}
for(const id of ['video-track','audio-track'])$(id).addEventListener('pointerdown',e=>beginRange(e),true);
function activateRange(mode){if(busy)return;stop();rangeMode=rangeMode===mode?false:mode;cutMode=false;$('video-track').classList.remove('cut-mode');if(rangeMode&&!rangeSelection)rangeSelection=initialRange(position,duration(project()));if(!rangeMode)rangeSelection=null;$('range-mode').setAttribute('aria-pressed',String(rangeMode==='select'));$('mark-remove').setAttribute('aria-pressed',String(rangeMode==='remove'));renderTimeline();}
$('range-mode').addEventListener('click',()=>activateRange('select'));
$('mark-remove').addEventListener('click',()=>activateRange('remove'));
function cancelRange(){stop();closeClipMenu();rangeMode=false;rangeSelection=null;$('mark-remove').setAttribute('aria-pressed','false');$('range-mode').setAttribute('aria-pressed','false');renderTimeline();}
$('range-clear').addEventListener('click',cancelRange);
$('range-delete').addEventListener('click',guard(()=>{if(busy||!rangeSelection||rangeMode!=='remove')return;const {start,end}=rangeSelection;commit(removeTimelineRange(project(),start,end),{label:'Remover intervalo',details:[`Timeline: ${start.toFixed(2)}–${end.toFixed(2)} s · vídeo e áudio vinculados`]});cancelRange();seek(start);}));
$('range-play').addEventListener('click',guard(async()=>{if(busy||!rangeSelection)return;const {start,end}=rangeSelection;stop();if(rangeMode==='remove'){if(end-start>=duration(project())-.02){toast('A seleção remove todo o vídeo. Não há prévia para reproduzir.');return;}seek(start===0?end:Math.max(0,start-2));await togglePlay();removalPreview={start,end};}else{seek(start);await togglePlay();rangePlaybackEnd=end;}}));
let dragAssetId=null,insertionPreview=null;
function insertionIndex(clientX){
 const time=Math.max(0,(clientX-$('video-track').getBoundingClientRect().left)/zoom);let start=0;
 for(let i=0;i<project().clips.length;i++){const length=clipDuration(project().clips[i]);if(time<start+length/2)return i;start+=length;}
 return project().clips.length;
}
function clearInsertionPreview(){if(!insertionPreview)return;insertionPreview.remove();insertionPreview=null;renderTimeline();}
function showInsertionPreview(assetId,index){
 const asset=project().assets.find(a=>a.id===assetId);if(!asset||media.get(assetId)?.missing)return;
 if(!insertionPreview){insertionPreview=document.createElement('div');insertionPreview.className='insertion-preview';insertionPreview.setAttribute('role','status');insertionPreview.setAttribute('aria-label','Prévia de inserção');$('video-track').append(insertionPreview);}
 insertionPreview.dataset.index=String(index);insertionPreview.textContent=`${asset.name} · ${format(asset.duration)}`;
 const start=project().clips.slice(0,index).reduce((sum,c)=>sum+clipDuration(c),0);insertionPreview.style.left=`${start*zoom}px`;insertionPreview.style.width=`${asset.duration*zoom}px`;
 let time=0;project().clips.forEach((c,i)=>{const left=(time+(i>=index?asset.duration:0))*zoom;$('video-track').querySelectorAll('.timeline-clip')[i].style.left=`${left}px`;const audio=Array.from($('audio-track').children).find(block=>block.dataset.clipId===c.id);if(audio)audio.style.left=`${left}px`;time+=clipDuration(c);});
 $('timeline-content').style.width=`${Math.max($('timeline-scroll').clientWidth-100,(duration(project())+asset.duration)*zoom+100,500)}px`;
 syncCaptionSelection();$('timeline-empty').hidden=true;
}
$('timeline-content').addEventListener('dragover',e=>{if(!busy&&dragAssetId&&e.dataTransfer.types.includes('application/x-corte-asset')){e.preventDefault();e.dataTransfer.dropEffect='copy';showInsertionPreview(dragAssetId,insertionIndex(e.clientX));}});
$('timeline-content').addEventListener('dragleave',e=>{if(!e.currentTarget.contains(e.relatedTarget))clearInsertionPreview();});
$('timeline-content').addEventListener('drop',guard(e=>{
 const assetId=e.dataTransfer.getData('application/x-corte-asset');if(!assetId||busy||media.get(assetId)?.missing){clearInsertionPreview();return;}e.preventDefault();e.stopPropagation();
 const index=insertionIndex(e.clientX);clearInsertionPreview();dragAssetId=null;
 let next=addClip(project(),assetId);selected=next.clips.at(-1).id;next=editProject(next,{type:'move',clipId:selected,index});position=next.clips.slice(0,index).reduce((sum,c)=>sum+clipDuration(c),0);commit(next);
}),true);
function beginTrim(e,c,side){
 e.preventDefault();e.stopPropagation();if(busy)return;stop();selected=c.id;const x=e.clientX,asset=project().assets.find(a=>a.id===c.assetId);let value=side==='left'?c.in:c.out;const el=e.currentTarget,index=project().clips.findIndex(item=>item.id===c.id),block=el.closest('.timeline-clip');block.draggable=false;el.setPointerCapture(e.pointerId);
 const move=event=>{const delta=(event.clientX-x)/zoom*clipSpeed(c);value=side==='left'?Math.max(0,Math.min(c.out-.02,c.in+delta)):Math.min(asset.duration,Math.max(c.in+.02,c.out+delta));$('trim-in').value=(side==='left'?value:c.in).toFixed(2);$('trim-out').value=(side==='right'?value:c.out).toFixed(2);
 const width=(side==='left'?c.out-value:value-c.in)/clipSpeed(c)*zoom,shift=width-clipDuration(c)*zoom;block.querySelector('.clip-length').textContent=format(width/zoom);
 for(const track of [$('video-track'),$('audio-track')])Array.from(track.children).forEach((item,i)=>{if(i===index){item.style.width=`${width}px`;const start=project().clips.slice(0,index).reduce((sum,item)=>sum+clipDuration(item),0)*zoom;item.style.left=`${start+(side==='left'?(value-c.in)/clipSpeed(c)*zoom:0)}px`;}else if(i>index)item.style.left=`${project().clips.slice(0,i).reduce((sum,item)=>sum+clipDuration(item),0)*zoom+(side==='right'?shift:0)}px`;});
 };
 const cleanup=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',cancel);};
 const up=guard(()=>{cleanup();edit({type:'trim',clipId:c.id,in:side==='left'?value:c.in,out:side==='right'?value:c.out});});
 const cancel=()=>{cleanup();renderTimeline();renderInspector();};el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',cancel);
}
function beginMusicTrim(e,c,side,block){
 e.preventDefault();e.stopPropagation();if(busy)return;stop();selectedMusic=c.id;renderInspector();const x=e.clientX,handle=e.currentTarget,asset=project().assets.find(a=>a.id===c.assetId);let patch={};handle.setPointerCapture(e.pointerId);
 const move=ev=>{const delta=(ev.clientX-x)/zoom;if(side==='left'){const shift=Math.max(-c.start,Math.max(-c.in,Math.min(c.out-c.in-.02,delta)));patch={in:c.in+shift,start:c.start+shift};}else patch={out:Math.max(c.in+.02,Math.min(asset.duration,c.out+delta))};block.style.left=`${(patch.start??c.start)*zoom}px`;block.style.width=`${((patch.out??c.out)-(patch.in??c.in))*zoom}px`;};
 const cleanup=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',cancel)};
 const up=guard(()=>{cleanup();if(Object.keys(patch).length)commit(editMusic(project(),c.id,patch),{label:'Ajustar trecho da música'});else renderTimeline()});const cancel=()=>{cleanup();renderTimeline()};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',cancel);
}
const musicEditor=document.createElement('section');musicEditor.id='music-editor';musicEditor.hidden=true;const musicTitle=document.createElement('h3');musicTitle.className='layer-name';const musicTimes=document.createElement('div');musicTimes.className='music-times';musicEditor.append(musicTitle,musicTimes);for(const [key,label] of [['offset','Posição (s)'],['in','Início no áudio (s)'],['out','Fim no áudio (s)'],['volume','Volume'],['fadeIn','Fade de entrada (s)'],['fadeOut','Fade de saída (s)']]){const row=document.createElement('label');const input=document.createElement('input');input.id='music-'+key;input.min=0;if(['volume','fadeIn','fadeOut'].includes(key)){const fade=key!=='volume';row.className='slider-field music-volume';const head=document.createElement('span'),out=document.createElement('output');out.htmlFor=input.id;out.dataset.unit=fade?' s':'%';if(fade)out.dataset.digits='1';head.append(fade?label.replace(' (s)',''):label,out);input.type='range';input.max=fade?10:200;input.step=fade?.1:1;row.append(head,input);musicEditor.insertBefore(row,musicTimes);}else{row.textContent=label;input.type='number';input.step=.1;row.append(input);musicTimes.append(row);}input.onchange=guard(()=>{const value=Number(input.value);try{commit(editMusic(project(),selectedMusic,{[key==='offset'?'start':key]:key==='volume'?value/100:value}),{label:'Editar música'});}finally{renderInspector()}});}const removeMusic=document.createElement('button');removeMusic.className='reset danger';removeMusic.textContent='Remover música';removeMusic.onclick=guard(()=>commit(editMusic(project(),selectedMusic,null),{label:'Remover música'}));musicEditor.append(removeMusic);document.querySelector('.inspector').append(musicEditor);
function renderInspector(){const song=project().music?.find(c=>c.id===selectedMusic);musicEditor.hidden=!song;document.querySelector('.inspector').classList.toggle('music-mode',!!song);if(song){musicTitle.textContent=project().assets.find(a=>a.id===song.assetId)?.name||'Música';$('music-offset').value=song.start;$('music-in').value=song.in;$('music-out').value=song.out;$('music-volume').value=Math.round(song.volume*100);sliderReadout($('music-volume'));for(const k of ['fadeIn','fadeOut']){$('music-'+k).value=song[k]||0;$('music-'+k).disabled=busy;sliderReadout($('music-'+k));}} 
 const c=project().clips.find(c=>c.id===selected);$('inspector-empty').hidden=!!c;$('clip-properties').hidden=!c||!!song;if(!c)return;
 $('clip-background').value=c.background||'black';$('clip-background').disabled=busy;$('background-color-field').hidden=c.background!=='color';$('clip-background-color').value=c.backgroundColor||'#000000';$('clip-background-color').disabled=busy;
 $('clip-speed').value=clipSpeed(c);$('clip-speed').disabled=busy;for(const b of document.querySelectorAll('[data-speed]')){b.setAttribute('aria-pressed',String(Number(b.dataset.speed)===clipSpeed(c)));b.disabled=busy;}for(const b of document.querySelectorAll('[data-background]')){b.setAttribute('aria-pressed',String(b.dataset.background===(c.background||'black')));b.disabled=busy;}
 const adjustments=c.adjustments||DEFAULT_ADJUSTMENTS;for(const k of Object.keys(DEFAULT_ADJUSTMENTS)){$('adjust-'+k).value=Math.round(adjustments[k]*100);$('adjust-'+k+'-value').textContent=Math.round(adjustments[k]*100)+'%';}
 $('crop-zoom').value=Math.round(100/c.crop.w);
 const a=project().assets.find(a=>a.id===c.assetId);$('clip-label').textContent=a.name;
 $('trim-in').value=Number(c.in.toFixed(3));$('trim-out').value=Number(c.out.toFixed(3));$('trim-in').max=c.out-.02;$('trim-out').max=a.kind==='image'?21600:a.duration;
 for(const k of ['x','y','w','h'])$(`crop-${k}`).value=Number((c.crop[k]*100).toFixed(2));
 $('volume').value=Math.round(c.volume*100);$('volume-value').textContent=`${Math.round(c.volume*100)}%`;
 for(const k of ['fadeIn','fadeOut']){$('audio-'+k).value=c[k]||0;$('audio-'+k).disabled=!a.hasAudio||busy;sliderReadout($('audio-'+k));}
 $('audio-hint').textContent=a.hasAudio?'O áudio acompanha os cortes do vídeo.':'Este arquivo não tem áudio.';$('volume').disabled=!a.hasAudio||busy;$('mute').disabled=!a.hasAudio||busy;
}
for(const k of Object.keys(DEFAULT_ADJUSTMENTS)){
 const input=$('adjust-'+k);
 input.oninput=()=>{if(busy||!selected)return;const c=project().clips.find(c=>c.id===selected);adjustmentPreview={id:selected,adjustments:{...(c.adjustments||DEFAULT_ADJUSTMENTS),[k]:Number(input.value)/100}};$('adjust-'+k+'-value').textContent=input.value+'%';draw();};
 input.onchange=guard(()=>{if(busy||!selected)return;edit({type:'update',clipId:selected,adjustments:adjustmentPreview?.id===selected?adjustmentPreview.adjustments:{...(project().clips.find(c=>c.id===selected).adjustments||DEFAULT_ADJUSTMENTS),[k]:Number(input.value)/100}});});
 input.onblur=()=>{if(adjustmentPreview){adjustmentPreview=null;renderInspector();draw();}};
}
$('reset-adjustments').onclick=guard(()=>{if(!busy&&selected)edit({type:'update',clipId:selected,adjustments:DEFAULT_ADJUSTMENTS});});
$('clip-speed').onchange=guard(()=>{if(busy||!selected)return;try{edit({type:'update',clipId:selected,speed:Number($('clip-speed').value)});}finally{renderInspector();}});
$('clip-background').onchange=guard(()=>{if(!busy&&selected)edit({type:'update',clipId:selected,background:$('clip-background').value,...($('clip-background').value==='color'?{backgroundColor:$('clip-background-color').value}:{})});});
for(const b of document.querySelectorAll('[data-speed]'))b.onclick=()=>{$('clip-speed').value=b.dataset.speed;$('clip-speed').dispatchEvent(new Event('change'));};
for(const b of document.querySelectorAll('[data-background]'))b.onclick=()=>{$('clip-background').value=b.dataset.background;$('clip-background').dispatchEvent(new Event('change'));};
$('clip-background-color').onchange=guard(()=>{if(!busy&&selected)edit({type:'update',clipId:selected,backgroundColor:$('clip-background-color').value});});
$('crop-zoom').onchange=guard(()=>{const c=project().clips.find(c=>c.id===selected);if(!c||busy)return;const size=100/Number($('crop-zoom').value);edit({type:'update',clipId:selected,crop:{x:Math.max(0,Math.min(1-size,c.crop.x+c.crop.w/2-size/2)),y:Math.max(0,Math.min(1-size,c.crop.y+c.crop.h/2-size/2)),w:size,h:size}});});
canvas.addEventListener('pointerdown',e=>{
 if(busy||document.querySelector('.inspector').hidden||$('video-properties').hidden||e.button!==0)return;
 const c=project().clips.find(c=>c.id===selected),at=clipAt(project(),position);if(!c||at?.clip.id!==c.id)return;
 e.preventDefault();stop();const box=canvas.getBoundingClientRect(),scale=Math.min(box.width/canvas.width,box.height/canvas.height),x=e.clientX,y=e.clientY;let crop=c.crop;canvas.setPointerCapture(e.pointerId);
 const move=ev=>{crop=dragCrop(c.crop,ev.clientX-x,ev.clientY-y,canvas.width*scale,canvas.height*scale);previewCrop={clipId:c.id,crop};for(const k of ['x','y','w','h'])$('crop-'+k).value=(crop[k]*100).toFixed(1);draw();};
 const cleanup=()=>{canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);};
 const up=guard(()=>{cleanup();previewCrop=null;if(crop!==c.crop)edit({type:'update',clipId:c.id,crop});});
 const cancel=()=>{cleanup();previewCrop=null;renderInspector();draw();};canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);
});
function visualLayers(p){return [...(p.imageLayers||[]),...(p.videoLayers||[]),...(p.shapeLayers||[])];}
function componentTime(t){
 if(position<t.start-1e-7||position>t.end+1e-7)throw Error('Posicione o cursor dentro do componente para editar a animação.');
 return Math.max(0,Math.min(t.end-t.start,Math.round((position-t.start)*1000)/1000));
}
function editVisual(p,id,patch){
 const t=visualLayers(p).find(t=>t.id===id),edit=t?.type?editShapeLayer:t?.in!==undefined?editVideoLayer:editImageLayer;
 if(patch===null||!t?.keyframes?.length)return edit(p,id,patch);
 const rest={...patch},pose={};for(const [field,key] of [['x','x'],['y','y'],['width','size'],['opacity','opacity']])if(field in rest){pose[key]=rest[field];delete rest[field];}
 if(t.type&&'width' in patch)delete rest.height;
 let q=edit(p,id,rest);if(Object.keys(pose).length)q=setKeyframe(q,id,componentTime(t),pose);return q;
}
function editTextPose(p,id,patch){
 const t=p.textLayers.find(t=>t.id===id);if(!patch.style)return editTextLayer(p,id,patch);
 if(!t.keyframes?.length)return editTextLayer(p,id,{...patch,style:{...t.style,...patch.style}});
 const style={...t.style},pose={},current=keyframeAt(t,position-t.start);
 for(const [k,v] of Object.entries(patch.style)){const field={positionX:'x',positionY:'y',size:'size'}[k];if(field){if(v!==current[field])pose[field]=v;}else style[k]=v;}
 let q=editTextLayer(p,id,{...patch,style});if(Object.keys(pose).length)q=setKeyframe(q,id,componentTime(t),pose);return q;
}
let selectedImage=null,imagePreview=null,keyframePreview=null;
function selectedComponent(){return [...visualLayers(project()),...(project().textLayers||[])].find(t=>t.id===(selectedImage||selectedText));}
function componentProject(){
 let p=project();if(imagePreview)p=editVisual(p,imagePreview.id,imagePreview.patch);if(textPreview)p=editTextPose(p,textPreview.id,{style:textPreview.patch});
 if(keyframePreview){const t=[...visualLayers(p),...(p.textLayers||[])].find(t=>t.id===keyframePreview.id);p=setKeyframe(p,t.id,componentTime(t),{opacity:keyframePreview.opacity});}return p;
}
function textLook(t){const sampled=applyKeyframes(t,position);return {...sampled.style,...(sampled.keyframePose?{positionX:sampled.keyframePose.x,positionY:sampled.keyframePose.y}:{})};}
function componentVisible(t){return position>=t.start&&(position<t.end||(!playing&&t.keyframes?.length&&position===t.end&&activePanel==='components'&&[selectedImage,selectedText].includes(t.id)));}
function renderKeyframes(){
 const t=selectedComponent();$('keyframe-properties').hidden=!t;if(!t)return;
 // One Animação section for every component: text uses its style presets, the others the motion presets.
 $('motion-row').hidden=!!t.style;$('text-motion-row').hidden=!t.style;if(!t.style){const name=(list,id)=>list.find(a=>a.id===(id||'none')).name;$('motion-enter-name').textContent=name(ENTER_ANIMATIONS,t.motion?.enter);$('motion-exit-name').textContent=name(EXIT_ANIMATIONS,t.motion?.exit);for(const k of ['enter','exit'])$('motion-'+k+'-trigger').disabled=busy;}
 if(t.keyframes?.length)$('custom-keyframes').open=true;
 const points=t.keyframes||[],local=position-t.start,inside=local>=0&&local<=t.end-t.start,at=points.findIndex(p=>Math.abs(p.time-local)<.00051),list=$('keyframe-points'),signature=JSON.stringify([t.id,points]);
 if(list.dataset.points!==signature){list.replaceChildren(...points.map(p=>{const b=document.createElement('button');b.dataset.keyframeTime=String(p.time);b.textContent=decimal(p.time,2,0)+' s';b.onclick=guard(()=>{stop();seek(t.start+p.time);});return b;}));if(!points.length)list.textContent='Nenhum ponto';list.dataset.points=signature;}
 for(const b of list.querySelectorAll('button')){b.setAttribute('aria-pressed',String(at>=0&&b.dataset.keyframeTime===String(points[at].time)));b.disabled=busy;}
 $('keyframe-time').textContent=decimal(local,2)+' s';$('keyframe-add').textContent=at<0?'Adicionar ponto':'Atualizar ponto';$('keyframe-add').disabled=busy||playing||!inside;$('keyframe-remove').disabled=busy||playing||at<0;
 $('keyframe-prev').disabled=busy||!points.some(p=>p.time<local-.00051);$('keyframe-next').disabled=busy||!points.some(p=>p.time>local+.00051);
 const p=componentProject(),current=[...visualLayers(p),...(p.textLayers||[])].find(x=>x.id===t.id),opacity=keyframeAt(current,local).opacity;$('keyframe-opacity').value=opacity;$('keyframe-opacity').disabled=busy||playing||!inside||!points.length;$('keyframe-opacity-value').textContent=Math.round(opacity)+'%';
}
$('keyframe-add').onclick=guard(()=>{const t=selectedComponent();if(!busy&&!playing&&t)commit(setKeyframe(project(),t.id,componentTime(t),{}),{label:'Adicionar / atualizar keyframe'});});
$('keyframe-remove').onclick=guard(()=>{const t=selectedComponent();if(!busy&&!playing&&t)commit(setKeyframe(project(),t.id,componentTime(t),null),{label:'Remover keyframe'});});
for(const direction of ['prev','next'])$('keyframe-'+direction).onclick=guard(()=>{const t=selectedComponent();if(!t)return;const local=position-t.start,point=direction==='prev'?t.keyframes?.findLast(p=>p.time<local-.00051):t.keyframes?.find(p=>p.time>local+.00051);if(point){stop();seek(t.start+point.time);}});
$('keyframe-opacity').oninput=guard(()=>{const t=selectedComponent();if(!busy&&!playing&&t?.keyframes?.length){keyframePreview={id:t.id,opacity:Number($('keyframe-opacity').value)};renderTextScene();renderKeyframes();}});
$('keyframe-opacity').onchange=guard(()=>{const t=selectedComponent(),value=Number($('keyframe-opacity').value);try{if(!busy&&!playing&&t?.keyframes?.length)commit(setKeyframe(project(),t.id,componentTime(t),{opacity:value}),{label:'Opacidade do keyframe'});}finally{keyframePreview=null;renderComponents();renderTextScene();}});
const imageScene=createImageScene($('preview-stage'),canvas,{
 pause:stop,select:id=>{selectedImage=id;selectedText=null;showModule('components');renderComponents();renderTextScene();},
 preview:(id,patch)=>{imagePreview=patch?{id,patch}:null;renderImageScene();},
 commit:(id,patch)=>commit(editVisual(project(),id,patch),{label:'Mover / redimensionar imagem'}),
 error:message=>toast(message,true)
});
function renderImageScene(){
 const p=componentProject();imageScene.update(visualLayers(p).filter(componentVisible).map(t=>applyKeyframes(!playing&&t.id===selectedImage&&!t.keyframes?.length?{...t,motion:undefined}:t,position)).map(t=>{
 const a=p.assets.find(a=>a.id===t.assetId);if(t.type){const layer=t;return {...layer,name:SHAPES[t.type],kind:'shape',url:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(shapeSvg(layer,canvas.width,canvas.height)),assetWidth:canvas.width*layer.width/100,assetHeight:canvas.height*layer.height/100,z:layerOrder(p).indexOf(t.id)+1,selected:t.id===selectedImage};}return {...t,name:a.name,kind:t.in!==undefined?'video':'image',sourceTime:(t.in||0)+position-t.start,playing,url:media.get(a.id)?.url,assetWidth:a.width,assetHeight:a.height,z:layerOrder(p).indexOf(t.id)+1,selected:t.id===selectedImage};
 }),busy);
}
// Sliders with a data-unit output show their value next to the label, in pt-BR.
function sliderReadout(input){const out=document.querySelector(`output[for="${input.id}"][data-unit]`);if(out)out.textContent=decimal(input.value,Number(out.dataset.digits||0))+out.dataset.unit;}
document.addEventListener('input',e=>{if(e.target.matches?.('input[type=range]'))sliderReadout(e.target);});
function renderImageProperties(){
 for(const b of document.querySelectorAll('#image-track .image-block')){b.classList.toggle('selected',b.dataset.imageId===selectedImage);b.setAttribute('aria-pressed',String(b.dataset.imageId===selectedImage));}
 const source=visualLayers(componentProject()).find(t=>t.id===selectedImage),layer=source&&(source.keyframes?.length?applyKeyframes(source,position):source);$('image-properties').hidden=!layer;
 if(!layer)return;$('shape-properties').hidden=!layer.type;if(layer.type){const open=['line','arrow'].includes(layer.type);for(const k of ['height','strokeWidth']){$('shape-'+k).value=layer[k];$('shape-'+k).disabled=busy||!!layer.keyframes?.length;}for(const k of ['fill','stroke']){$('shape-'+k+'-enabled').checked=!!layer[k];$('shape-'+k+'-enabled').disabled=busy||(k==='fill'&&open);$('shape-'+k).value=layer[k]||'#ffffff';$('shape-'+k).disabled=busy||!layer[k]||(k==='fill'&&open);}}$('video-source-field').hidden=layer.in===undefined;$('image-in').value=layer.in||0;$('remove-image').textContent=layer.type?'Remover forma':layer.in===undefined?'Remover imagem':'Remover vídeo';$('image-name').textContent=project().assets.find(a=>a.id===layer.assetId)?.name||SHAPES[layer.type]||'Imagem';
 for(const k of ['start','end','x','y','width','rotation','opacity'])$('image-'+k).value=layer[k];for(const input of $('image-properties').querySelectorAll('input[type=range]'))sliderReadout(input);
 for(const k of ['x','y','width','opacity'])$('image-'+k).disabled=busy||!!layer.keyframes?.length&&(position<layer.start||position>layer.end);
}
for(const k of ['in','start','end','x','y','width','rotation','opacity'])$('image-'+k).onchange=guard(()=>{
 if(busy||!selectedImage)return;const patch={[k]:Number($('image-'+k).value)};try{commit(editVisual(project(),selectedImage,patch),{label:'Ajustar imagem'});}finally{imagePreview=null;renderImageProperties();renderTextScene();}
});
for(const k of ['x','y','width','rotation','opacity'])$('image-'+k).oninput=guard(()=>{if(!busy&&selectedImage){imagePreview={id:selectedImage,patch:{[k]:Number($('image-'+k).value)}};renderImageScene();}});
$('remove-image').onclick=guard(()=>{if(!busy&&selectedImage)commit(editVisual(project(),selectedImage,null),{label:'Remover imagem'});});
$('add-image').onclick=()=>importVideos('image');$('add-video-layer').onclick=()=>importVideos('video-layer');
for(const type of Object.keys(SHAPES))$('add-shape-'+type).onclick=guard(()=>{
 if(busy||!project().clips.length)return;
 const start=Math.min(position,Math.max(0,duration(project())-.02)),width=35,height=type==='circle'?Math.max(5,Math.min(100,width*canvas.width/canvas.height)):20,id=crypto.randomUUID();
 const t={id,type,start,end:Math.min(duration(project()),start+3),x:50,y:50,width,height,rotation:0,opacity:100,fill:'#ffffff',stroke:['line','arrow'].includes(type)?'#ffffff':null,strokeWidth:1};
 selectedImage=id;selectedText=null;commit(moveLayer(addShapeLayer(project(),t),id,'front'),{label:'Adicionar '+SHAPES[type]});showModule('components');
});
for(const k of ['height','strokeWidth','fill','stroke'])$('shape-'+k).onchange=guard(()=>{
 if(busy||!selectedImage)return;commit(editShapeLayer(project(),selectedImage,{[k]:['height','strokeWidth'].includes(k)?Number($('shape-'+k).value):$('shape-'+k).value}),{label:'Ajustar forma'});
});
for(const k of ['fill','stroke'])$('shape-'+k+'-enabled').onchange=guard(()=>{
 if(busy||!selectedImage)return;commit(editShapeLayer(project(),selectedImage,{[k]:$('shape-'+k+'-enabled').checked?$('shape-'+k).value:null}),{label:'Ajustar forma'});
});
let selectedText=null,textPreview=null;
const textScene=createTextScene($('preview-stage'),canvas,{
 pause:stop,
 select:entry=>{if(busy)return;if(!entry.id){if(activePanel==='captions'&&selectedCaptionKey!==captionKey(entry)&&!document.activeElement?.isContentEditable)selectCaption(entry);return;}selectedImage=null;renderImageProperties();selectedText=entry.id;if(activePanel!=='components')showModule('components');renderComponents();renderTextScene();},
 save:(entry,text)=>entry.id?commit(editTextLayer(project(),entry.id,{text}),{label:'Editar texto'}):changeCaption(entry,{text}),
 error:message=>toast(message,true),
 pickFont:word=>openFontPicker('word',word),
 move:(entry,patch)=>entry.id?(patch?previewText(patch):(textPreview=null,renderComponents(),renderTextScene())):patch&&'size' in patch||!patch&&captionPreviewStyle?previewCaptionStyle(patch):previewCaptionPlace(entry,patch),
 // Word bar: patch is fields to set, a function of the word's current look, or null to clear it.
 styleWords:guard((entry,text,indices,patch)=>{
  const layer=project().textLayers?.find(t=>t.id===entry.id);if(busy||!layer)return;
  if(!text)throw Error('O texto não pode ficar vazio.');
  const looks=new Map((text===layer.text?layer.wordStyles||[]:remapWordStyles(layer.text,text,layer.wordStyles)).map(w=>[w.index,w]));
  for(const index of indices){
   if(patch===null){looks.delete(index);continue;}
   const current=looks.get(index)||{index},next={...current,...(typeof patch==='function'?patch(current):patch)};
   for(const k of Object.keys(next))if(next[k]===undefined||k==='scale'&&next[k]===100)delete next[k];
   if(Object.keys(next).length>1)looks.set(index,next);else looks.delete(index);
  }
  selectedText=layer.id;commit(editTextLayer(project(),layer.id,{text,wordStyles:[...looks.values()].sort((a,b)=>a.index-b.index)}),{label:'Estilo da palavra'});
 }),
 drop:guard((entry,patch,verb)=>{
  if(entry.id)return commitText({style:patch},verb+' texto');
  // Size stays shared by every caption; position belongs to the caption that was dragged.
  if('size' in patch)return commit({...project(),captionStyle:{...captionStyle(project().captionStyle),...patch}},{label:verb+' legendas'});
  captionPlacePreview=null;commit(editCaption(project(),entry,{place:patch}),{label:'Mover legenda',affected:[entry.clipId]});
 })
});
// Captions share one style, so moving or resizing any caption on the video restyles all of them.
let captionPlacePreview=null;
function previewCaptionPlace(entry,place){captionPlacePreview=place?{key:captionKey(entry),place}:null;renderTextScene();}
function previewCaptionStyle(patch){
 captionPreviewStyle=patch?{...(captionPreviewStyle||captionStyle(project().captionStyle)),...patch}:null;
 const style=captionPreviewStyle||captionStyle(project().captionStyle);
 if(style.positionY!==undefined)$('caption-positionY').value=style.positionY;$('caption-size').value=style.size;
 renderCaptionSamples();renderTextScene();
}
function renderTextScene(){
 renderImageScene();
 const p=componentProject(),entries=captionEntries(p).filter(w=>position>=w.start&&position<w.end).map(w=>({...w,key:'caption-'+w.clipId+'-'+w.wordIndex,style:{...captionStyle(captionPreviewStyle||p.captionStyle),...w.place,...(captionPlacePreview?.key===captionKey(w)?captionPlacePreview.place:{})},z:layerOrder(p).indexOf('@captions')+1,selected:activePanel==='captions'}));
 entries.push(...(p.textLayers||[]).filter(componentVisible).map(t=>applyKeyframes(t,position)).map(t=>({...t,style:t.style,key:'text-'+t.id,z:layerOrder(p).indexOf(t.id)+1,selected:activePanel==='components'&&t.id===selectedText})));
 textScene.update(entries,position,busy);
}
function renderTextOutputs(style){
 $('text-size-value').textContent=decimal(style.size);
 for(const k of ['positionX','positionY'])$(`text-${k}-value`).textContent=Math.round(style[k]??50)+'%';
}
let textTab='styles';
const STYLE_RANGES=['strokeWidth','shadow','spacing','boxOpacity','glow'],STYLE_COLORS=['strokeColor','shadowColor','boxColor','glowColor','accent'],STYLE_SWITCHES=['hollow','accentLast'];
// Presets render the user's own text with the real preview styling, so the gallery shows the result.
// The Estilos tab only shows what is chosen; picking happens in the picker dialog.
function sampleWord(span,style,size=15){
 const a=textAppearance(style,size);Object.assign(span.style,{fontFamily:`"${style.font}"`,fontSize:size+'px',color:style.color,...a.node,...(a.box||{})});
 const words=span.textContent.split(' ');
 if(style.accentLast&&words.length){const key=document.createElement('span');key.textContent=words.pop();key.style.color=style.accent||'#ffd84a';span.replaceChildren(words.length?words.join(' ')+' ':'',key);}
}
function renderTextStyle(style){
 const look=fullLook(style),committed=fullLook(selectedLayer()?.style||style),preset=TEXT_PRESETS.find(p=>p.id===presetOf(committed));
 $('text-style-name').textContent=preset?preset.name:'Personalizado';$('text-style-sample').textContent=(selectedLayer()?.text||'Aa').replace(/\s+/g,' ').slice(0,10);sampleWord($('text-style-sample'),look);
 $('text-enter-name').textContent=ENTER_ANIMATIONS.find(a=>a.id===(look.enter||'none')).name;$('text-exit-name').textContent=EXIT_ANIMATIONS.find(a=>a.id===(look.exit||'none')).name;
 for(const b of document.querySelectorAll('[data-text-tab]'))b.setAttribute('aria-selected',String(b.dataset.textTab===textTab));
 for(const pane of document.querySelectorAll('[data-text-pane]'))pane.hidden=pane.dataset.textPane!==textTab;
 for(const k of STYLE_RANGES){$('text-'+k).value=look[k];$(`text-${k}-value`).textContent=look[k]+(k==='boxOpacity'?'%':'');}
 for(const k of STYLE_COLORS)$('text-'+k).value=look[k];
 for(const k of STYLE_SWITCHES)$('text-'+k).checked=look[k];
 for(const k of ['bold','italic','uppercase'])$('text-'+k).setAttribute('aria-pressed',String(look[k]));
 const boxed=look.preset==='boxed';$('text-box').checked=boxed;$('text-box-options').hidden=!boxed;$('text-stroke-block').hidden=boxed;$('text-glow-block').hidden=boxed;$('text-accent-options').hidden=!look.accentLast;
}
// One picker for looks and animations: hovering a look previews it on the video, closing without a choice reverts.
const picker={kind:null,chosen:false};
function renderPicker(){
 const layer=selectedLayer();if(!layer)return;
 const look=fullLook(layer.style),sample=layer.text.replace(/\s+/g,' ').slice(0,14),grid=$('picker-options');
 const kind=picker.kind,items=kind==='style'?TEXT_PRESETS:kind==='enter'?ENTER_ANIMATIONS:EXIT_ANIMATIONS,current=kind==='style'?presetOf(look):look[kind]||'none';
 $('picker-title').textContent={style:'Escolha um estilo',enter:'Animação de entrada',exit:'Animação de saída'}[kind];
 $('picker-hint').textContent=kind==='style'?'Passe o mouse para ver no vídeo. Cores e detalhes você ajusta depois em Editar.':'Cada animação dura 0,4 s e aparece igual no vídeo exportado.';
 grid.className='picker-grid '+(kind==='style'?'is-style':'is-motion');
 grid.replaceChildren(...items.map(item=>{
  const b=document.createElement('button'),stage=document.createElement('span'),word=document.createElement('span'),name=document.createElement('strong');
  b.className='text-preset';b.dataset.preset=item.id;b.setAttribute('aria-pressed',String(current===item.id));b.setAttribute('aria-label',(kind==='style'?'Estilo ':kind==='enter'?'Entrada ':'Saída ')+item.name);
  stage.className='preset-stage';word.textContent=sample;name.textContent=item.name;
  if(kind==='style'){sampleWord(word,{...look,...item.style,font:item.font||look.font},17);const hint=document.createElement('small');hint.textContent=item.hint;stage.append(word);b.append(stage,name,hint);b.onpointerenter=b.onfocus=()=>previewText(item.style);}
  else{sampleWord(word,look,17);word.className=item.id==='none'?'':`motion-demo ${kind}-${item.id}`;stage.append(word);b.append(stage,name);}
  b.onclick=guard(()=>{
   picker.chosen=true;$('picker-dialog').close();
   if(kind==='style')return commitText({style:item.style},'Estilo do texto: '+item.name);
   commitText({style:{[kind]:item.id}},(kind==='enter'?'Entrada: ':'Saída: ')+item.name);
   // Land on the moment the animation plays so the choice is visible right away.
   if(item.id!=='none')seek(kind==='enter'?layer.start:Math.max(layer.start,layer.end-.5));
  });
  return b;
 }));
}
function openPicker(kind){
 if(busy||!selectedLayer())return;
 Object.assign(picker,{kind,chosen:false});renderPicker();
 const room=innerWidth-canvas.getBoundingClientRect().right-32;$('picker-dialog').style.width=room>=420?Math.min(760,room)+'px':'';
 $('picker-dialog').showModal();$('picker-options').querySelector('[aria-pressed=true]')?.focus();
}
// Style edits always write the full look, and keep preset in step with box and stroke.
function stylePatch(patch){
 const layer=componentProject().textLayers?.find(t=>t.id===selectedText),next={...fullLook(textLook(layer)),...patch};
 if(!('preset' in patch)&&next.preset!=='boxed')next.preset=next.strokeWidth>0?'outline':'clean';
 return next;
}
function renderComponents(){
 const order=layerOrder(project()),id=selectedImage||selectedText,at=order.indexOf(id);$('layer-order-controls').hidden=at<0;$('layer-back').disabled=busy||at<=0;$('layer-front').disabled=busy||at<0||at===order.length-1;
 renderImageProperties();renderKeyframes();
 const layers=componentProject().textLayers||[];
 for(const b of document.querySelectorAll('#text-track .text-block'))b.classList.toggle('selected',b.dataset.textId===selectedText);
 const layer=layers.find(t=>t.id===selectedText);$('text-properties').hidden=!layer;
 $('add-text').disabled=busy||!project().clips.length;for(const type of Object.keys(SHAPES))$('add-shape-'+type).disabled=busy||!project().clips.length;
 if(!layer)return;
 const style=textLook(layer);
 for(const k of ['start','end'])$('text-'+k).value=layer[k];
 for(const k of ['positionX','positionY']){$('text-'+k).min=layer.keyframes?.length?0:k==='positionX'?5:15;$('text-'+k).max=layer.keyframes?.length?100:k==='positionX'?95:85;}
 for(const k of ['size','color','positionX','positionY'])$('text-'+k).value=style[k]??50;
 for(const k of ['size','positionX','positionY'])$('text-'+k).disabled=busy||!!layer.keyframes?.length&&(position<layer.start||position>layer.end);
 renderTextStyle(style);
 $('text-font-trigger').textContent=style.font;$('text-font-trigger').style.fontFamily=`"${style.font}"`;
 renderTextOutputs(style);
}
for(const direction of ['front','back'])$('layer-'+direction).onclick=guard(()=>{const id=selectedImage||selectedText;if(!busy&&id)commit(moveLayer(project(),id,direction),{label:direction==='front'?'Trazer para frente':'Enviar para trás'});});
const selectedLayer=()=>project().textLayers?.find(t=>t.id===selectedText);
// Live preview while a control or the text itself is being dragged; history only records the release.
function previewText(patch){
 const layer=selectedLayer();if(busy||!layer)return;
 textPreview={id:layer.id,patch:{...(textPreview?.id===layer.id?textPreview.patch:{}),...patch}};textPreview.style=textLook(editTextPose(project(),layer.id,{style:textPreview.patch}).textLayers.find(t=>t.id===layer.id));
 renderComponents();renderTextScene();
}
function commitText(patch,label='Ajustar texto'){
 const layer=selectedLayer();if(busy||!layer)return;
 try{commit(editTextPose(project(),layer.id,patch),{label});}
 finally{textPreview=null;renderComponents();renderTextScene();}
}
$('nav-components').onclick=()=>showModule(editorPanel(activePanel,'components'));
$('add-text').onclick=guard(()=>{
 const total=duration(project());if(busy||!total)return;
 const start=Math.min(position,Math.max(0,total-.02)),id=crypto.randomUUID();selectedText=id;selectedImage=null;
 commit(addTextLayer(project(),{id,text:'Seu texto',start,end:Math.min(total,start+3),style:{font:'Arial',size:8,position:'center',positionX:50,positionY:50,...TEXT_PRESETS.find(p=>p.id==='outline').style}}),{label:'Adicionar texto'});
 seek(start);
});
const textValue=k=>['start','end','size','positionX','positionY'].includes(k)?Number($('text-'+k).value):$('text-'+k).value;
for(const k of ['size','color','positionX','positionY'])$('text-'+k).addEventListener('input',()=>previewText({[k]:textValue(k)}));
for(const k of ['start','end','size','color','positionX','positionY'])$('text-'+k).onchange=guard(()=>commitText(['start','end'].includes(k)?{[k]:textValue(k)}:{style:{[k]:textValue(k)}}));
// Quick positions keep the whole box inside the safe margins, not just its center.
for(const b of document.querySelectorAll('[data-text-place]'))b.onclick=guard(()=>{
 const layer=selectedLayer();if(!layer)return;
 const [h,v]=b.dataset.textPlace.split(' '),box=textScene.bounds('text-'+layer.id)||{hw:0,hh:0},clamp=(x,min,max)=>Math.round(Math.max(min,Math.min(max,x))*10)/10;
 commitText({style:{positionX:clamp({left:5+box.hw,center:50,right:95-box.hw}[h],5,95),positionY:clamp({top:8+box.hh,middle:50,bottom:92-box.hh}[v],15,85)}},'Posicionar texto');
});
function duplicateText(){
 const layer=selectedLayer();if(busy||!layer)return;
 const id=crypto.randomUUID(),style={...layer.style,positionY:Math.min(85,(layer.style.positionY??50)+8)};
 selectedText=id;commit(addTextLayer(project(),{...layer,id,style,...(layer.keyframes?{keyframes:layer.keyframes.map(p=>({...p,y:Math.min(100,p.y+8)}))}:{})}),{label:'Duplicar texto'});
}
$('duplicate-text').onclick=guard(duplicateText);
for(const b of document.querySelectorAll('[data-text-tab]'))b.onclick=()=>{textTab=b.dataset.textTab;renderComponents();};
$('picker-options').onpointerleave=()=>{if(textPreview){textPreview=null;renderComponents();renderTextScene();}};
$('picker-close').onclick=()=>$('picker-dialog').close();
$('picker-dialog').addEventListener('close',()=>{if(!picker.chosen&&textPreview){textPreview=null;renderComponents();renderTextScene();}$({style:'text-style-trigger',enter:'text-enter-trigger',exit:'text-exit-trigger','motion-enter':'motion-enter-trigger','motion-exit':'motion-exit-trigger'}[picker.kind]||'text-style-trigger').focus();});
// Image, video and shape animations use the same picker and preset list as text: pick one and it is done.
function openMotionPicker(kind){
 const t=visualLayers(project()).find(t=>t.id===selectedImage);if(busy||!t)return;
 Object.assign(picker,{kind:'motion-'+kind,chosen:false});
 const items=kind==='enter'?ENTER_ANIMATIONS:EXIT_ANIMATIONS,current=t.motion?.[kind]||'none',grid=$('picker-options');
 $('picker-title').textContent=kind==='enter'?'Animação de entrada':'Animação de saída';
 $('picker-hint').textContent='Cada animação dura 0,4 s, parte da posição atual do componente e aparece igual no vídeo exportado.';
 grid.className='picker-grid is-motion';
 grid.replaceChildren(...items.map(item=>{
  const b=document.createElement('button'),stage=document.createElement('span'),shape=document.createElement('span'),name=document.createElement('strong');
  b.className='text-preset';b.dataset.preset=item.id;b.setAttribute('aria-pressed',String(current===item.id));b.setAttribute('aria-label',(kind==='enter'?'Entrada ':'Saída ')+item.name);
  stage.className='preset-stage';shape.className='motion-chip'+(item.id==='none'?'':` motion-demo ${kind}-${item.id}`);name.textContent=item.name;stage.append(shape);b.append(stage,name);
  b.onclick=guard(()=>{picker.chosen=true;$('picker-dialog').close();commit(setMotion(project(),t.id,{[kind]:item.id}),{label:(kind==='enter'?'Entrada: ':'Saída: ')+item.name});});
  return b;
 }));
 const room=innerWidth-canvas.getBoundingClientRect().right-32;$('picker-dialog').style.width=room>=420?Math.min(760,room)+'px':'';
 $('picker-dialog').showModal();grid.querySelector('[aria-pressed=true]')?.focus();
}
$('motion-enter-trigger').onclick=()=>openMotionPicker('enter');$('motion-exit-trigger').onclick=()=>openMotionPicker('exit');
$('text-style-trigger').onclick=()=>openPicker('style');$('text-enter-trigger').onclick=()=>openPicker('enter');$('text-exit-trigger').onclick=()=>openPicker('exit');
for(const k of STYLE_SWITCHES)$('text-'+k).onchange=guard(()=>{if(selectedLayer())commitText({style:stylePatch({[k]:$('text-'+k).checked})});});
for(const k of [...STYLE_RANGES,...STYLE_COLORS]){
 const value=()=>STYLE_RANGES.includes(k)?Number($('text-'+k).value):$('text-'+k).value;
 $('text-'+k).addEventListener('input',()=>{if(selectedLayer())previewText(stylePatch({[k]:value()}));});
 $('text-'+k).onchange=guard(()=>{if(selectedLayer())commitText({style:stylePatch({[k]:value()})});});
}
for(const k of ['bold','italic','uppercase'])$('text-'+k).onclick=guard(()=>{const layer=selectedLayer();if(layer)commitText({style:stylePatch({[k]:!fullLook(layer.style)[k]})});});
$('text-box').onchange=guard(()=>{const layer=selectedLayer();if(!layer)return;const look=fullLook(layer.style);commitText({style:stylePatch({preset:$('text-box').checked?'boxed':look.strokeWidth>0?'outline':'clean'})},$('text-box').checked?'Caixa no texto':'Remover caixa do texto');});
let nudging=false;
// Arrow keys preview the move; releasing the key records a single history step.
function textShortcut(e){
 const layer=activePanel==='components'&&!busy&&selectedLayer();if(!layer)return false;
 const command=e.ctrlKey||e.metaKey,step=e.shiftKey?5:.5,arrows={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
 if(arrows[e.key]&&!command){
  const style=textPreview?.id===layer.id?textPreview.style:textLook(layer),[dx,dy]=arrows[e.key],clamp=(v,min,max)=>Math.round(Math.max(min,Math.min(max,v))*10)/10;
  e.preventDefault();nudging=true;previewText({positionX:clamp((style.positionX??50)+dx,5,95),positionY:clamp((style.positionY??50)+dy,15,85)});return true;
 }
 if(['Delete','Backspace'].includes(e.key)){e.preventDefault();$('remove-text').click();return true;}
 if(command&&e.key.toLowerCase()==='d'){e.preventDefault();duplicateText();return true;}
 if(e.key==='Escape'){e.preventDefault();selectedText=null;textPreview=null;textScene.deselect();renderComponents();renderTextScene();return true;}
 return false;
}
document.addEventListener('keyup',guard(e=>{if(nudging&&e.key.startsWith('Arrow')){nudging=false;if(textPreview)commitText({style:textPreview.style},'Mover texto');}}));
$('remove-text').onclick=guard(()=>{if(busy||!selectedLayer())return;const id=selectedText;selectedText=null;commit(editTextLayer(project(),id,null),{label:'Remover texto'});});
function transportTime(t){return String(Math.floor(t/60)).padStart(2,'0')+':'+(t%60).toFixed(1).padStart(4,'0');}
function updatePlayhead(){
 $('playhead').setAttribute('aria-valuenow',position.toFixed(2));$('playhead').setAttribute('aria-valuemax',timelineDuration());$('playhead').setAttribute('aria-valuetext',format(position,true));
 $('playhead').style.left=`${position*zoom}px`;
 if(document.activeElement!==$('playhead-time'))$('playhead-time').value=String(Number(position.toFixed(2)));
 $('playhead-time').max=timelineDuration();$('current-time').textContent=transportTime(position);$('total-time').textContent='/ '+transportTime(timelineDuration());$('go-start').disabled=busy||!timelineDuration();$('go-next').disabled=busy||!timelineDuration();
 renderKeyframes();if(!playing&&!imagePreview&&!textPreview&&selectedComponent()?.keyframes?.length)renderComponents();
}

const stills=new Map();
function stillImage(asset){
 const url=media.get(asset.id)?.url;if(!url)return null;
 let img=stills.get(url);if(!img){img=new Image();img.crossOrigin='anonymous';img.onload=draw;img.onerror=()=>toast('Não foi possível carregar a imagem. Relocalize pela timeline.',true);img.src=url;stills.set(url,img);}
 return img.complete&&img.naturalWidth?img:null;
}
const transitionPreview=createTransitionPreview(canvas,{media:id=>media.get(id),image:stillImage,playing:()=>playing,onFrame:()=>draw(),error:message=>{stop();toast(message,true);},loading:value=>$('transition-preview-status').hidden=!value});
function draw(){
 renderTextScene();
 const p=project();if(adjustmentPreview){const c=p.clips.find(c=>c.id===adjustmentPreview.id);if(c)c.adjustments=adjustmentPreview.adjustments;}if(transitionPreview.draw(p,position)!==null)return;const found=clipAt(p,Math.min(position,Math.max(0,duration(p)-.001)));
 if(!found){ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);return;}
 const asset=p.assets.find(a=>a.id===found.clip.assetId),source=asset.kind==='image'?stillImage(asset):video;
 if(!source||asset.kind!=='image'&&(video.seeking||video.readyState<2||!video.videoWidth))return;
 const crop=previewCrop?.clipId===found.clip.id?previewCrop.crop:found.clip.crop;try{paintClip(ctx,source,found.clip,crop);}catch{/* Await decoding. */}
}

function syncOriginalAudio(){const found=clipAt(project(),position);const level=found?audioLevel(found.clip,position-found.start,clipDuration(found.clip)):0;if(gain){video.volume=1;gain.gain.value=level;}else video.volume=Math.min(1,level);}
function syncMusic(){const tracks=project().music||[];for(const [id,m] of musicPlayers)if(!tracks.some(c=>c.id===id)){m.el.pause();m.el.remove();m.gain?.disconnect();musicPlayers.delete(id);}for(const c of tracks){const url=media.get(c.assetId)?.url;if(!url)continue;let m=musicPlayers.get(c.id);if(!m){const el=new Audio();el.crossOrigin='anonymous';el.src=url;m={el};musicPlayers.set(c.id,m);el.preload='auto';el.addEventListener('loadedmetadata',()=>syncMusic());el.addEventListener('error',()=>{stop();toast('Não foi possível tocar a música. Relocalize o arquivo.',true)});}if(audioContext&&!m.gain){m.gain=audioContext.createGain();audioContext.createMediaElementSource(m.el).connect(m.gain);m.gain.connect(audioContext.destination);}const level=audioLevel(c,position-c.start,c.out-c.in);if(m.gain){m.el.volume=1;m.gain.gain.value=level;}else m.el.volume=Math.min(1,level);const active=position>=c.start&&position<c.start+c.out-c.in&&position<timelineDuration();if(!active||!playing){m.el.pause();continue;}const target=c.in+position-c.start;if(m.el.readyState>=1&&Math.abs(m.el.currentTime-target)>.2)m.el.currentTime=target;if(m.el.paused)m.el.play().catch(()=>{});}}
window.addEventListener('message',e=>{if(e.source!==$('music-frame').contentWindow||e.data?.type!=='corte-music-add')return;const {asset,in:sourceIn,out,ticket}=e.data;try{const q=addMusic(project(),assetData(asset),{in:sourceIn,out,start:position});if(busy)throw new Error('Aguarde a operação atual.');media.set(asset.id,asset);selectedMusic=q.music.at(-1).id;commit(q,{label:'Adicionar música',details:[`${asset.name} · ${sourceIn.toFixed(2)}–${out.toFixed(2)}s`]});$('music-track').querySelector('.selected')?.scrollIntoView({block:'nearest',inline:'nearest'});e.source.postMessage({type:'corte-music-added',ticket,ok:true},'*');}catch(error){e.source.postMessage({type:'corte-music-added',ticket,ok:false,error:error.message},'*');toast(error.message,true);}});
function seek(time){
 position=Math.max(0,Math.min(timelineDuration(),Number(time)||0));updatePlayhead();syncMusic();
 const p=project(),found=p.clips.length&&(position<duration(p)||timelineDuration()<=duration(p))?clipAt(p,Math.min(position,Math.max(0,duration(p)-.001))):null;
 $('preview-empty').hidden=!!found;
 if(!found){activeSource=null;activeClip=null;video.pause();video.removeAttribute('src');video.load();draw();return;}
 const m=media.get(found.clip.assetId);if(m?.pending){activeSource=null;activeClip=null;video.pause();video.removeAttribute('src');video.load();ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);return;}if(!m?.url){stop();activeSource=null;activeClip=null;video.removeAttribute('src');video.load();ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);$('preview-empty').hidden=false;toast('Mídia ausente. Clique com o botão direito no trecho para localizar a mídia.',true);return;}
 if(p.assets.find(a=>a.id===found.clip.assetId)?.kind==='image'){
  video.pause();if(activeSource!==m.url){video.removeAttribute('src');video.load();}activeSource=m.url;activeClip=found.clip.id;draw();return;
 }
 activeClip=found.clip.id;syncOriginalAudio();
 const setTime=()=>{const latest=clipAt(project(),Math.min(position,Math.max(0,duration(project())-.001)));if(!latest || media.get(latest.clip.assetId)?.url!==m.url)return;video.playbackRate=clipSpeed(latest.clip);video.preservesPitch=true;video.currentTime=Math.max(0,Math.min(latest.sourceTime,video.duration-.001));if(playing)video.play().catch(e=>{stop();toast(`Não foi possível reproduzir: ${e.message}`,true);});};
 if(activeSource!==m.url){activeSource=m.url;video.src=m.url;video.addEventListener('loadedmetadata',setTime,{once:true});video.load();}else if(video.readyState>=1){setTime();}
 draw();
}
async function togglePlay(){
 if(playing){stop();return;}if(timelineDuration()<=0)return;
 if(!audioContext){try{audioContext=new AudioContext();gain=audioContext.createGain();audioContext.createMediaElementSource(video).connect(gain);gain.connect(audioContext.destination);}catch{audioContext=null;gain=null;}}
 await audioContext?.resume();playing=true;textScene.deselect();$('play').replaceChildren(icon('pause'));$('play').setAttribute('aria-label','Pausar');
 const removal=rangeMode==='remove'?rangeSelection:null;seek(playbackStart(position,timelineDuration(),removal));removalPreview=removal;if(position>=timelineDuration())stop();
}
let lastFrame=performance.now();
function animate(now=performance.now()){
 const elapsed=Math.max(0,(now-lastFrame)/1000);lastFrame=now;
 const current=clipAt(project(),Math.min(position,Math.max(0,duration(project())-.001))),isStill=current&&project().assets.find(a=>a.id===current.clip.assetId)?.kind==='image';
 if(playing&&isStill){
 position=Math.min(timelineDuration(),position+elapsed);const next=clipAt(project(),position);if(position>=timelineDuration())stop();else if(next?.clip.id!==current.clip.id)seek(position);updatePlayhead();syncMusic();draw();
 }else if(playing&&(!project().clips.length||position>=duration(project()))){position=Math.min(timelineDuration(),position+elapsed);if(position>=timelineDuration())stop();updatePlayhead();syncMusic();}
 else if(playing && video.readyState>=2){
  const index=project().clips.findIndex(c=>c.id===activeClip),c=project().clips[index];
  if(c){let start=project().clips.slice(0,index).reduce((n,c)=>n+clipDuration(c),0);position=start+Math.max(0,Math.min(montageTime(c,video.currentTime),clipDuration(c)));
   if(removalPreview&&position>=removalPreview.start&&position<removalPreview.end){const target=removalPreview.end;if(target>=duration(project())){position=duration(project());stop();}else seek(target);}
   else if(rangePlaybackEnd!==null&&position>=rangePlaybackEnd){const end=rangePlaybackEnd;stop();seek(end);}
   else if(video.currentTime>=c.out-.025*clipSpeed(c) || video.ended){if(index+1<project().clips.length)seek(start+clipDuration(c)+.000001);else{position=duration(project());if(position>=timelineDuration())stop();else seek(position);}}
   updatePlayhead();syncMusic();draw();
  }
 }
 syncOriginalAudio();requestAnimationFrame(animate);
}
let previewLoadStarted=0;video.addEventListener('loadstart',()=>previewLoadStarted=performance.now());
video.addEventListener('seeked',draw);video.addEventListener('loadeddata',()=>{draw();if(previewLoadStarted)bridge?.previewTiming?.(performance.now()-previewLoadStarted).catch(()=>{});previewLoadStarted=0;});
video.addEventListener('error',()=>{stop();toast('O preview não conseguiu decodificar este vídeo. Tente um MP4 H.264; a mídia original não foi alterada.',true);});
function renderMediaNotice(){
 const state=mediaHydrationState;$('media-validation').hidden=!state?.pending;if(state?.pending)$('media-validation-label').textContent=`Validando mídias: ${state.assets.length-state.pending} de ${state.assets.length}. A montagem já está aberta.`;
 const missing=project().assets.filter(a=>media.get(a.id)?.missing);$('missing-media').hidden=!missing.length;$('missing-media-message').textContent=`${missing.length} mídia(s) ausente(s). Seu projeto e as edições continuam aqui.`;$('relink-missing').disabled=busy;
}
function render(){
 renderMediaNotice();
 $('project-name').value=project().name;$('aspect').value=project().aspect;
 const [w,h]=project().aspect.split(':').map(Number);canvas.height=720;canvas.width=Math.round(720*w/h/2)*2;layoutGuides();$('preview-resolution').textContent=`${canvas.width} × ${canvas.height}`;
 renderTimeline();renderInspector();renderHistory();renderCaptions();renderComponents();seek(position);updateButtons();
}
function showModule(module){
 if(busy&&!recorder){toast('Aguarde ou cancele a operação atual.');return;}
 if(recorder){toast('Conclua ou descarte a gravação antes de trocar de ferramenta.');return;}
 activePanel=module;document.querySelector('.library').hidden=!module;document.querySelector('.inspector').hidden=true;$('context-title').textContent=({components:'Componentes',narration:'Narração',audio:'Música',captions:'Legendas',ai:'Editar com IA'})[module]||'';document.querySelector('.workspace').classList.toggle('has-context',!!module);
 $('components-panel').hidden=module!=='components';renderTextScene();
 $('narration-panel').hidden=module!=='narration';$('music-panel').hidden=module!=='audio';if(module!=='audio')$('music-frame').contentWindow?.postMessage({type:'corte-music-pause'},'*');$('captions-panel').hidden=module!=='captions';$('ai-panel').hidden=module!=='ai';
 for(const name of ['narration','audio','captions','components','ai']){const button=$(`nav-${name}`);button.classList.toggle('active',module===name);button.setAttribute('aria-pressed',String(module===name));}
 renderCaptions();
}
function showCaptionModule(show){showModule(show?'captions':null);if(show)setCaptionView('review');}
function renderCaptions(){
 renderCaptionSamples();
 $('caption-source-field').hidden=!project().music?.some(c=>c.role==='narration');$('caption-source').value=project().captionSource||'original';
 const list=$('caption-words');list.replaceChildren();const p=project(),style=captionStyle(p.captionStyle);
 const placed=captionEntries(p).filter(w=>w.place).length;$('align-captions').disabled=busy||!placed;$('align-captions').textContent=placed?`Alinhar todas (${placed})`:'Alinhar todas';
 for(const key of ['font','size','color','position','preset','accent','width','positionY'])$(`caption-${key}`).value=style[key]??({accent:'#eac39b',width:84,positionY:style.position==='top'?15:style.position==='center'?50:80})[key];
 for(const [index,w] of captionEntries(p).entries()){
  const row=document.createElement('div');row.className='caption-row';row.dataset.captionKey=captionKey(w);
  const select=document.createElement('button');select.className='caption-jump';select.textContent=`${index+1} · ${transportTime(w.start)} – ${transportTime(w.end)}`;select.addEventListener('click',()=>selectCaption(w));row.append(select);
  const text=document.createElement('textarea');text.value=w.text;text.setAttribute('aria-label',`Texto da legenda ${index+1}`);text.disabled=busy;text.addEventListener('focus',()=>{if(selectedCaptionKey!==captionKey(w))selectCaption(w);});
  const timing=document.createElement('button');timing.className='caption-timing';timing.textContent='Ajustar tempo';timing.setAttribute('aria-label',`Ajustar tempo da legenda ${index+1}`);timing.disabled=busy;timing.onclick=()=>focusCaptionTime(w);
  text.addEventListener('change',guard(()=>changeCaption(w,{text:text.value.trim()})));row.append(text);
  const times=document.createElement('div');times.className='caption-times';for(const [key,title] of [['start','Início'],['end','Fim']]){const label=document.createElement('label');label.textContent=title+' (s)';const input=document.createElement('input');input.type='number';input.step='.01';input.min='0';input.value=String(Number(w[key].toFixed(3)));input.disabled=busy;input.setAttribute('aria-label',`${title} da legenda ${index+1}`);input.addEventListener('change',guard(()=>changeCaption(w,{[key]:Number(input.value)})));label.append(input);times.append(label);}row.append(times);
  const remove=document.createElement('button');remove.className='caption-remove';remove.textContent='Excluir legenda';remove.setAttribute('aria-label',`Excluir legenda ${index+1}`);remove.onclick=guard(()=>commit(editCaption(project(),w,null),{label:'Excluir legenda'}));const actions=document.createElement('div');actions.className='caption-row-actions';actions.append(timing,remove);
  const place=document.createElement('div');place.className='caption-place';place.setAttribute('role','group');place.setAttribute('aria-label',`Posição da legenda ${index+1}`);
  const shared=captionStyle(p.captionStyle),at=w.place?.positionY;
  for(const [label,y] of [['Topo',15],['Meio',50],['Base',80]]){const b=document.createElement('button');b.textContent=label;b.disabled=busy;b.setAttribute('aria-pressed',String(at===y));b.setAttribute('aria-label',`${label} · legenda ${index+1}`);b.onclick=guard(()=>commit(editCaption(project(),w,{place:{positionX:w.place?.positionX??shared.positionX??50,positionY:y}}),{label:'Posicionar legenda',affected:[w.clipId]}));place.append(b);}
  if(w.place){const tag=document.createElement('small');tag.textContent='Posição própria';place.append(tag);}
  row.append(place,actions);list.append(row);

 }
 syncCaptionSelection();
 const missingTiming=['karaoke','highlight'].includes(style.preset)&&captionEntries(p).some(w=>!w.tokens?.length);$('caption-timing-status').textContent=missingTiming?'Karaokê: gere os tempos por palavra.':'';
 if(!list.children.length && $('caption-feedback').hidden){const empty=document.createElement('p');empty.textContent='Gere legendas ou adicione uma no cursor.';list.append(empty);}
}
function setCaptionView(view){for(const name of ['generate','review','style'])$('caption-'+name+'-view').hidden=name!==view;document.querySelectorAll('[data-caption-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.captionView===view)));}
document.querySelectorAll('[data-caption-view]').forEach(b=>b.onclick=()=>setCaptionView(b.dataset.captionView));
function renderCaptionSamples(){
 const style=captionPreviewStyle||captionStyle(project().captionStyle);$('caption-font-trigger').textContent=style.font;$('caption-font-trigger').style.fontFamily=`"${style.font}"`;
 document.querySelectorAll('[data-caption-preset]').forEach(b=>{b.setAttribute('aria-pressed',String(style.preset===b.dataset.captionPreset));const sample=b.querySelector('span');sample.style.fontFamily=`"${style.font}"`;sample.style.fontSize=(style.size*2.6)+'px';sample.style.color=style.color;sample.style.setProperty('--caption-accent',style.accent||'#eac39b');});
}
document.querySelectorAll('[data-caption-preset]').forEach(b=>b.onclick=guard(()=>{if(busy)return;commit({...project(),captionStyle:{...captionStyle(project().captionStyle),preset:b.dataset.captionPreset}},{label:'Estilo das legendas'});}));
// Bundled faces load on first use, the same way an @font-face rule would.
for(const f of FONTS)if(f.file&&f.family!=='Anton')document.fonts.add(new FontFace(f.family,`url(corte-media://fonts/${f.file})`));
$('caption-font').replaceChildren(...FONTS.map(f=>new Option(f.family)));
// One picker serves captions and text layers; hovering previews on the video, closing without a choice reverts.
const fontPicker={target:'caption',category:null,chosen:false};
const pickerCurrent=()=>fontPicker.target==='word'?fontPicker.word.current:fontPicker.target==='text'?selectedLayer()?.style.font:captionStyle(project().captionStyle).font;
function pickerPreview(font){
 if(fontPicker.target==='word')return;
 if(fontPicker.target==='text'){if(font)previewText({font});else{textPreview=null;renderComponents();renderTextScene();}return;}
 captionPreviewStyle=font?{...captionStyle(project().captionStyle),font}:null;renderCaptionSamples();renderTextScene();
}
function renderFontOptions(){
 const query=$('caption-font-search').value.trim().toLowerCase(),current=pickerCurrent(),sample=fontPicker.target!=='caption'?selectedLayer()?.text.replace(/\s+/g,' ')||'Seu texto':'Sua história';
 $('font-categories').replaceChildren(...['Todas',...FONT_CATEGORIES].map(c=>{const b=document.createElement('button');b.textContent=c;b.setAttribute('aria-pressed',String((fontPicker.category||'Todas')===c));b.onclick=()=>{fontPicker.category=c==='Todas'?null:c;renderFontOptions();};return b;}));
 const list=$('caption-font-options');list.replaceChildren();
 for(const f of FONTS){
  if(fontPicker.category&&f.category!==fontPicker.category||query&&!(f.family+' '+f.category).toLowerCase().includes(query))continue;
  const b=document.createElement('button'),preview=document.createElement('span'),name=document.createElement('small');
  preview.className='font-sample';preview.textContent=sample;preview.style.fontFamily=`"${f.family}"`;
  name.textContent=f.family+' — '+f.category;b.append(preview,name);b.title=f.family;b.setAttribute('aria-pressed',String(f.family===current));
  b.onpointerenter=b.onfocus=()=>pickerPreview(f.family);
  b.onclick=guard(()=>{fontPicker.chosen=true;$('caption-font-dialog').close();if(fontPicker.target==='word')fontPicker.word.apply(f.family);else if(fontPicker.target==='text')commitText({style:{font:f.family}},'Fonte do texto');else commit({...project(),captionStyle:{...captionStyle(project().captionStyle),font:f.family}},{label:'Fonte das legendas'});});
  list.append(b);
 }
 if(!list.children.length)list.textContent='Nenhuma fonte encontrada.';
}
// target: 'caption', 'text' (whole text layer) or 'word' (words selected inside a text, from the word bar).
function openFontPicker(target,word=null){
 if(busy||target!=='caption'&&!selectedLayer())return;
 Object.assign(fontPicker,{target,word,category:null,chosen:false});$('caption-font-search').value='';renderFontOptions();
 // Sit beside the preview when there is room, so hovering a font shows it on the video.
 const room=innerWidth-canvas.getBoundingClientRect().right-32;$('caption-font-dialog').style.width=room>=420?Math.min(760,room)+'px':'';
 $('caption-font-dialog').showModal();$('caption-font-search').focus();$('caption-font-options').querySelector('[aria-pressed=true]')?.scrollIntoView({block:'center'});
}
$('caption-font-trigger').onclick=()=>openFontPicker('caption');$('text-font-trigger').onclick=()=>openFontPicker('text');
$('caption-font-search').oninput=renderFontOptions;$('caption-font-close').onclick=()=>$('caption-font-dialog').close();
$('caption-font-options').onpointerleave=()=>pickerPreview(null);
$('caption-font-dialog').addEventListener('close',()=>{if(!fontPicker.chosen)pickerPreview(null);if(fontPicker.target!=='word')$(fontPicker.target==='text'?'text-font-trigger':'caption-font-trigger').focus();
 // The dialog hands focus back to the text being edited; leave edit mode so the new word font renders and undo shows.
 else setTimeout(()=>{if(document.activeElement?.classList?.contains('scene-text'))document.activeElement.blur();});});
function changeCaption(w,patch){if(busy)return;commit(editCaption(project(),w,patch),{label:'Editar legenda',affected:[w.clipId]});}
$('align-captions').onclick=guard(()=>{if(!busy)commit(alignCaptions(project()),{label:'Alinhar todas as legendas'});});
$('add-caption').onclick=guard(()=>{if(busy)return;commit(addCaptionAt(project(),position),{label:'Adicionar legenda'});const i=captionEntries(project()).findIndex(w=>position>=w.start&&position<w.end);const field=$('caption-words').children[i]?.querySelector('textarea');field?.focus();field?.select();});

for(const key of ['font','size','color','position','preset','accent','width','positionY'])$(`caption-${key}`).addEventListener('change',guard(()=>{if(busy)return;const p=project();p.captionStyle={...captionStyle(p.captionStyle),[key]:['size','width','positionY'].includes(key)?Number($(`caption-${key}`).value):$(`caption-${key}`).value};captionPreviewStyle=null;if(key==='position')delete p.captionStyle.positionY;commit(p,{label:'Estilo de legendas',details:[`${key}: ${p.captionStyle[key]}`]});}));

function recordingUI(active){$('recording-controls').hidden=!active;$('record-narration').hidden=active;$('import-narration').disabled=active;}
async function beginRecording(){
 if(busy||recorder)return;if(position>=duration(project())-.1)throw Error('Posicione o cursor antes do fim do vídeo.');
 stop();recordAt=position;recordDiscard=false;setBusy(true,'Preparando microfone…');
 try{
  await bridge.recordingArm();recordStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});await bridge.recordingDisarm();
  const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw Error('Gravação não disponível neste computador. Importe um áudio.');
  const chunks=[];let size=0;recorder=new MediaRecorder(recordStream,{mimeType:mime});recordingUI(true);
  recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);size+=e.data.size;if(size>60*1024*1024){recordDiscard=true;recorder.stop();toast('Gravação excedeu o limite de 60 MB.',true);}}};
  recorder.onerror=()=>{recordDiscard=true;recorder.stop();toast('A gravação falhou. Tente importar um áudio.',true);};
  recorder.onstop=async()=>{const type=recorder.mimeType;clearInterval(recordTimer);recordStream.getTracks().forEach(t=>t.stop());recorder=null;recordStream=null;stop();recordingUI(false);
   try{if(!recordDiscard){$('busy-label').textContent='Salvando narração…';const asset=await bridge.recordingSave(new Uint8Array(await new Blob(chunks,{type}).arrayBuffer()),type);asset.name='Narração gravada';media.set(asset.id,asset);setBusy(false);const q=addMusic(project(),assetData(asset),{in:0,out:Math.min(asset.duration,duration(project())-recordAt),start:recordAt,role:'narration'});q.captionSource='narration';commit(q,{label:'Gravar narração'});}}
   catch(e){toast(e.message,true);}finally{setBusy(false);}
  };
  recorder.start(250);$('busy-label').textContent='Gravando narração…';await togglePlay();
  recordTimer=setInterval(()=>{$('recording-status').textContent='Gravando · '+format(Math.max(0,position-recordAt));if((!playing||position>=duration(project())-.02)&&recorder?.state==='recording')recorder.stop();},200);
 }catch(e){recordStream?.getTracks().forEach(t=>t.stop());recorder=null;recordStream=null;recordingUI(false);setBusy(false);await bridge.recordingDisarm().catch(()=>{});throw Error('Não foi possível gravar: '+e.message);}
}
$('record-narration').onclick=guard(beginRecording);
$('recording-stop').onclick=()=>{if(recorder?.state==='recording')recorder.stop();};
$('recording-cancel').onclick=()=>{recordDiscard=true;if(recorder?.state==='recording')recorder.stop();};
window.addEventListener('beforeunload',()=>{recordStream?.getTracks().forEach(t=>t.stop());});
$('nav-narration').onclick=()=>showModule(editorPanel(activePanel,'narration'));
$('caption-source').onchange=guard(()=>commit({...project(),captionSource:$('caption-source').value},{label:'Fonte das legendas'}));
$('mute-original').onclick=guard(()=>{const p=project();p.clips.forEach(c=>c.volume=0);commit(p,{label:'Silenciar áudio original'});});
$('import-narration').onclick=guard(async()=>{
 if(busy)return;stop();setBusy(true,'Importando narração…');let result;
 try{result=await bridge.importMedia(['image','video-layer'].includes(kind)?kind:undefined);}finally{setBusy(false);}
 let p=project(),added=0;
 for(const a of result.assets){if(a.kind!=='audio'){result.errors.push('Para narração, escolha um arquivo de áudio.');continue;}media.set(a.id,a);p=addMusic(p,assetData(a),{in:0,out:a.duration,start:position,role:'narration'});added++;}
 if(added){p.captionSource='narration';commit(p,{label:'Adicionar narração'});}
 if(result.errors.length)toast(result.errors.join('\n'),true);
});

for(const key of ['size','color','accent','width','positionY'])$('caption-'+key).addEventListener('input',()=>{captionPreviewStyle={...captionStyle(project().captionStyle),[key]:['color','accent'].includes(key)?$('caption-'+key).value:Number($('caption-'+key).value)};renderCaptionSamples();draw();});
$('nav-captions').addEventListener('click',()=>showModule(editorPanel(activePanel,'captions')));
function captionFeedback(phase,text){
 const loading=phase==='loading',box=$('caption-feedback');
 box.hidden=!text;box.dataset.phase=phase;$('caption-status').textContent=text;
 box.querySelector('.loader').hidden=!loading;$('caption-cancel').hidden=!loading;
 $('captions-panel').setAttribute('aria-busy',String(loading));
}
$('caption-cancel').addEventListener('click',()=>$('cancel').click());
$('generate-captions').addEventListener('click',guard(async()=>{
 if(busy)return;const p=project();if(captionEntries(p).length&&!confirm('Substituir as legendas e correções da voz escolhida? Você poderá desfazer.'))return;stop();cancelRequested=false;setBusy(true,'Gerando legendas…');captionFeedback('loading','Preparando áudio…');renderCaptions();
 try{
  const estimate=await bridge.captionEstimate(p);
  if(estimate.assets && !(await bridge.apiStatus()).configured){captionFeedback('error','Cadastre sua chave para gerar legendas.');setBusy(false);await showSettings('api');return;}
  if(cancelRequested)return;
  const transcripts=await bridge.transcribe(p);if(cancelRequested)return;p.transcripts=transcripts;for(const c of p.captionSource==='narration'?(p.music||[]).filter(c=>c.role==='narration'):p.clips)delete c.captionWords;setBusy(false);
  const count=captionEntries(p).length;setCaptionView('review');
  commit(p,{label:'Gerar legendas GPT',details:[count ? `${count} legendas na timeline` : 'Nenhuma fala encontrada']});
  captionFeedback(count?'success':'empty',count ? `${count} legenda${count===1?'':'s'} gerada${count===1?'':'s'}.` : 'Nenhuma fala encontrada no vídeo.');
 }catch(e){if(!cancelRequested)captionFeedback('error',e.message||'Não foi possível gerar legendas. Tente novamente.');}
 finally{if(cancelRequested)captionFeedback('empty','Geração cancelada.');setBusy(false);renderCaptions();}
}));
function applyMenuPosition(value){
 const position=value==='bottom'?'bottom':'left';
 document.body.dataset.menuPosition=position;$('menu-position').value=position;
}
try{applyMenuPosition(localStorage.getItem('corte.menuPosition'));}catch{applyMenuPosition('left');}
$('menu-position').addEventListener('change',()=>{
 applyMenuPosition($('menu-position').value);
 try{localStorage.setItem('corte.menuPosition',$('menu-position').value);}catch{toast('Posição aplicada. Não foi possível salvar a preferência neste computador.',true);}
 renderTimeline();layoutGuides();
});
function renderUpdate(){
 const {phase,version,installedVersion,percent=0}=updateState;
 $('installed-version').textContent=installedVersion?`Versão instalada: ${installedVersion}`:'Versão instalada: verificando…';
 const labels={waiting:'Atualização aguardando a operação atual terminar.',idle:'Atualizações automáticas ativadas.',preparing:'Preparando a IA local para futuras atualizações…',checking:'Verificando atualizações…',current:'Corte atualizado.',downloading:`Baixando atualização ${version||''} · ${percent}%`,ready:`Atualização ${version||''} baixada. Será instalada automaticamente ao fechar o Corte.${dirty?' Salve seu projeto antes de fechar.':''}`,error:'Não foi possível atualizar. Confira sua conexão e o espaço livre e tente novamente.',unavailable:'Atualização automática disponível no aplicativo instalado para Windows. Mac: atualização manual por enquanto.'};
 $('update-status').textContent=labels[phase]||labels.idle;
 $('check-update').disabled=['unavailable','preparing','checking','downloading','ready'].includes(phase);
 $('update-notice').hidden=!['preparing','downloading','ready','error'].includes(phase);
 $('update-notice-label').textContent=labels[phase]||labels.idle;
 $('install-update').hidden=phase!=='ready';$('install-update').disabled=dirty||busy||!!recorder;
}
bridge?.onUpdate?.(state=>{updateState=state;renderUpdate();});
bridge?.updateStatus?.().then(state=>{updateState=state;renderUpdate();}).catch(()=>{});
$('check-update').onclick=guard(()=>bridge.checkUpdate());
$('install-update').onclick=guard(async()=>{
 document.activeElement?.blur();stop();await bridge.setDirty(dirty);
 if(dirty||busy||recorder)throw Error('Salve o projeto e conclua a operação atual antes de atualizar.');
 await bridge.installUpdate();
});
async function showSettings(section){$('api-key').value='';$('settings-dialog').showModal();if(section==='api')$('api-key').focus();const r=await bridge.apiStatus();$('api-status').textContent=r.configured?'Chave cadastrada e protegida.':'Nenhuma chave cadastrada.';await refreshConnection();}
$('settings').addEventListener('click',guard(showSettings));$('caption-settings').addEventListener('click',guard(showSettings));
$('settings-close').addEventListener('click',()=>$('settings-dialog').close());$('settings-dialog').addEventListener('close',()=>$('api-key').value='');
$('api-save').addEventListener('click',guard(async()=>{const value=$('api-key').value;$('api-key').value='';await bridge.apiSave(value);$('api-status').textContent='Chave cadastrada e protegida.';}));
$('api-clipboard').addEventListener('click',guard(async()=>{await bridge.apiClipboard();$('api-status').textContent='Chave cadastrada e protegida.';}));
$('api-remove').addEventListener('click',guard(async()=>{await bridge.apiRemove();$('api-status').textContent='Chave removida.';}));
const importVideos=guard(async(kind)=>{
 if(busy||recorder)return;
 if(!bridge)throw new Error('Abra o aplicativo desktop para importar seus vídeos.');stop();setBusy(true,'Importando vídeos…');
 let result;try{result=await bridge.importMedia(['image','video-layer'].includes(kind)?kind:undefined);}finally{setBusy(false);}
 if(result.assets.length){
 let p=project(),at=position;
 for(const a of result.assets){
  media.set(a.id,a);
  if((kind==='video-layer'||a.kind==='image'&&kind==='image')&&p.clips.length){
   p=addAsset(p,assetData(a));const start=Math.min(at,Math.max(0,duration(p)-.02)),id=crypto.randomUUID();selectedImage=id;selectedText=null;
   p=(kind==='video-layer'?addVideoLayer:addImageLayer)(p,{id,assetId:a.id,start,end:Math.min(duration(p),start+(kind==='video-layer'?a.duration:5)),...(kind==='video-layer'?{in:0}:{}),x:50,y:50,width:40,rotation:0,opacity:100});
  }else p=a.kind==='audio'?addMusic(p,assetData(a),{in:0,out:a.duration,start:at}):addClip(addAsset(p,assetData(a)),a.id);
 }
 selected=p.clips.at(-1)?.id||selected;position=['image','video-layer'].includes(kind)?at:duration(project());commit(p);
 if(['image','video-layer'].includes(kind)){showModule('components');renderImageProperties();renderImageScene();}
 toast(result.assets.length===1?'1 mídia adicionada à timeline.':`${result.assets.length} mídias adicionadas à timeline.`);
 }

 if(result.errors.length)toast(result.errors.join('\n'),true);
});
function projectFileLabel(file){$('save-state').title=file||'Projeto ainda não salvo';document.title=file?`${file.split(/[\\/]/).at(-1)} — Corte`:'Corte';}
async function saveCurrentProject(mode='save'){
 if(busy)return;document.activeElement?.blur?.();$('save-options').open=false;stop();setBusy(true,mode==='portable'?'Copiando projeto e mídias. Aguarde antes de fechar…':'Salvando projeto…',false);
 try{const result=await bridge.saveProject(project(),history.serialize(),mode);if(result){if(result.portable)toast(`Cópia portátil salva: ${result.name}. Leve a pasta inteira.`);else{projectFileLabel(result.file);markDirty(false);toast(`Projeto salvo: ${result.name}. As mídias originais não foram alteradas.`);}}}finally{setBusy(false);}
}
$('save-project').addEventListener('click',guard(()=>saveCurrentProject()));
$('save-as-project').addEventListener('click',guard(()=>saveCurrentProject('as')));
$('save-portable-project').addEventListener('click',guard(()=>saveCurrentProject('portable')));
bridge?.onSaveProject?.(guard(mode=>saveCurrentProject(mode)));
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();e.stopPropagation();if(!busy)(e.shiftKey?$('save-as-project'):$('save-project')).click();}},true);
function applyMediaState(state){
 if(!state||state.id!==mediaHydrationState?.id)return;
 const active=clipAt(project(),Math.min(position,Math.max(0,duration(project())-.001)))?.clip.assetId,oldUrl=media.get(active)?.url;
 for(const asset of state.assets)if(media.get(asset.id)?.pending)media.set(asset.id,asset);
 mediaHydrationState=state;renderMediaNotice();renderTimeline();renderComponents();updateButtons();if(oldUrl!==media.get(active)?.url)seek(position);
 if(state.errors.length>lastHydrationErrors){lastHydrationErrors=state.errors.length;toast(state.errors.at(-1),true);}
}
bridge?.onMediaState?.(applyMediaState);
$('cancel-media-validation').onclick=guard(async()=>{if(mediaHydrationState)await bridge.cancelMediaValidation(mediaHydrationState.id);});
async function refreshDiagnosticStatus(){
 const status=await bridge?.diagnosticStatus?.();if(!status)return;
 $('diagnostic-status').textContent=status.available?'Registro local ativo. Os arquivos têm tamanho limitado.':'Não foi possível gravar o diagnóstico local. Verifique espaço e permissão de escrita.';
 $('diagnostic-notice').hidden=!status.previousInterruption;
}
async function exportDiagnostic(button){button.disabled=true;try{if(await bridge.exportDiagnostics())toast('Diagnóstico exportado. Você pode anexar o arquivo ao suporte.');}finally{button.disabled=false;}}
$('export-diagnostics').onclick=guard(()=>exportDiagnostic($('export-diagnostics')));
$('export-crash-diagnostics').onclick=guard(()=>exportDiagnostic($('export-crash-diagnostics')));
$('dismiss-diagnostic-notice').onclick=()=>{$('diagnostic-notice').hidden=true;};
function reportRendererError(error){bridge?.reportDiagnosticError?.({name:typeof error?.name==='string'?error.name:undefined,code:typeof error?.code==='string'?error.code:undefined}).catch(()=>{});}
window.addEventListener('error',event=>reportRendererError(event.error));
window.addEventListener('unhandledrejection',event=>reportRendererError(event.reason));
$('copy-performance-diagnostics').onclick=guard(async()=>{await bridge.copyPerformanceDiagnostics();toast('Diagnóstico local copiado. Sem nomes ou caminhos das mídias.');});
async function openSavedProject(token){
 if(busy){if(token)toast('Conclua a operação atual e abra o projeto pelo menu Arquivo.',true);return;}document.activeElement?.blur?.();if(dirty && !confirm('Abrir outro projeto e descartar alterações não salvas?'))return;stop();openingProject=true;setBusy(true,'Abrindo projeto…');
 try{const r=await bridge.openProject(token);
 if(r){$('ai-scope').value='all';mediaHydrationState=r.hydrationId?{id:r.hydrationId,assets:r.assets,pending:r.assets.filter(a=>a.pending).length,errors:[]}:null;lastHydrationErrors=0;projectFileLabel(r.file);selectedCaptionKey=null;history=r.history?History.from(r.history):new History(r.project);media.clear();for(const a of r.assets)media.set(a.id,a);selected=r.project.clips[0]?.id||null;position=0;pending=null;$('proposal').hidden=true;markDirty(false);render();if(r.errors?.length)toast(r.errors.join('\n'),true);else if(r.assets.some(a=>a.missing))toast('Algumas mídias estão ausentes. Clique com o botão direito no trecho para localizar a mídia.',true);if(r.hydrationId)applyMediaState(await bridge.mediaState(r.hydrationId));}
 }finally{openingProject=false;setBusy(false);}
}
async function relinkAssets(assets){if(busy)return;stop();setBusy(true,'Localizando mídias…',false);try{for(const asset of assets){const result=await bridge.relink(asset);if(!result)break;media.set(asset.id,result);markDirty();render();}}finally{setBusy(false);}}
$('relink-missing').onclick=guard(()=>relinkAssets(project().assets.filter(a=>media.get(a.id)?.missing)));
$('open-project').addEventListener('click',guard(()=>openSavedProject()));
bridge?.onOpenProject?.(guard(token=>openSavedProject(token)));
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'&&!document.querySelector('dialog[open]')){e.preventDefault();e.stopPropagation();if(!busy)$('open-project').click();}},true);
$('project-name').addEventListener('change',guard(()=>commit({...project(),name:$('project-name').value.trim()||'Meu projeto'})));
$('aspect').addEventListener('change',guard(()=>edit({type:'set_aspect',aspect:$('aspect').value})));
$('go-start').onclick=()=>{if(!busy){stop();seek(0)}};$('go-next').onclick=()=>{if(!busy){stop();seek(nextClipTime(project(),position))}};
function layoutGuides(){const stage=$('preview-stage'),size=previewSize(stage.clientWidth,stage.clientHeight,canvas.width,canvas.height);canvas.style.width=size.width+'px';canvas.style.height=size.height+'px';const r=canvas.getBoundingClientRect(),parent=$('preview-stage').getBoundingClientRect(),guide=$('safe-guide-overlay');Object.assign(guide.style,{left:(r.left-parent.left+r.width*.09)+'px',top:(r.top-parent.top+r.height*.08)+'px',width:r.width*.82+'px',height:r.height*.74+'px'});}
$('safe-guides').onclick=()=>{const visible=$('safe-guide-overlay').hidden;$('safe-guide-overlay').hidden=!visible;$('safe-guides').setAttribute('aria-pressed',String(visible));layoutGuides();};new ResizeObserver(layoutGuides).observe($('preview-stage'));$('preview-add').onclick=()=>importVideos();
$('play').addEventListener('click',guard(togglePlay));function setPreviewFocus(active){document.body.classList.toggle('preview-focus',active);$('fullscreen').setAttribute('aria-pressed',String(active));$('fullscreen').setAttribute('aria-label',active?'Voltar à edição':'Ampliar prévia');layoutGuides();}
$('fullscreen').addEventListener('click',()=>setPreviewFocus(!document.body.classList.contains('preview-focus')));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('preview-focus')){e.preventDefault();setPreviewFocus(false);}});
$('undo').addEventListener('click',()=>{if(busy)return;stop();history.undo();rangeSelection=null;pending=null;$('proposal').hidden=true;markDirty();selected=project().clips[0]?.id||null;position=Math.min(position,timelineDuration());render();});
$('redo').addEventListener('click',()=>{if(busy)return;stop();history.redo();rangeSelection=null;pending=null;$('proposal').hidden=true;markDirty();selected=project().clips[0]?.id||null;render();});
function setCutMode(value){if(value){rangeMode=false;rangeSelection=null;$('range-mode').setAttribute('aria-pressed','false');}cutMode=value;$('cut-mode').setAttribute('aria-pressed',String(value));$('video-track').classList.toggle('cut-mode',value);renderTimeline();}
$('cut-mode').addEventListener('click',()=>{if(!busy){stop();setCutMode(!cutMode);}});
$('split').addEventListener('click',guard(()=>{const found=clipAt(project(),position);if(!found)throw new Error('Posicione o cursor dentro de um trecho.');selected=found.clip.id;edit({type:'split',clipId:found.clip.id,time:found.sourceTime});}));
$('delete').addEventListener('click',guard(()=>edit({type:'delete',clipId:selected})));
for(const [button,delta] of [['move-left',-1],['move-right',1]])$(button).addEventListener('click',guard(()=>{const index=project().clips.findIndex(c=>c.id===selected);if(index+delta>=0 && index+delta<project().clips.length)edit({type:'move',clipId:selected,index:index+delta});}));
for(const name of ['trim-in','trim-out'])$(name).addEventListener('change',guard(()=>{try{edit({type:'trim',clipId:selected,in:Number($('trim-in').value),out:Number($('trim-out').value)});}finally{renderInspector();}}));
for(const k of ['x','y','w','h'])$(`crop-${k}`).addEventListener('change',guard(()=>{try{const crop=Object.fromEntries(['x','y','w','h'].map(k=>[k,Number($(`crop-${k}`).value)/100]));edit({type:'update',clipId:selected,crop});}finally{renderInspector();}}));
$('reset-crop').addEventListener('click',guard(()=>edit({type:'update',clipId:selected,crop:{x:0,y:0,w:1,h:1}})));
$('volume').addEventListener('input',()=>{$('volume-value').textContent=`${$('volume').value}%`;});
$('volume').addEventListener('change',guard(()=>edit({type:'update',clipId:selected,volume:Number($('volume').value)/100})));
for(const k of ['fadeIn','fadeOut'])$('audio-'+k).onchange=guard(()=>{if(busy||!selected)return;try{edit({type:'update',clipId:selected,[k]:Number($('audio-'+k).value)});}finally{renderInspector();}});
$('mute').addEventListener('click',guard(()=>edit({type:'update',clipId:selected,volume:0})));
$('zoom').addEventListener('input',()=>{zoom=Number($('zoom').value);renderTimeline();});
$('timeline-scroll').addEventListener('wheel',e=>{
 if(!e.ctrlKey)return;e.preventDefault();
 const scroll=$('timeline-scroll'),offset=e.clientX-scroll.getBoundingClientRect().left-94;
 const time=Math.max(0,(offset+scroll.scrollLeft)/zoom);
 zoom=Math.round(Math.max(4,Math.min(Number($('zoom').max),zoom*Math.exp(-e.deltaY*(e.deltaMode===1?.03:.003)))));
 $('zoom').value=String(zoom);renderTimeline();scroll.scrollLeft=Math.max(0,time*zoom-offset);
},{passive:false});
$('playhead-time').addEventListener('change',()=>{stop();seek($('playhead-time').value);});
for(const id of ['ruler','playhead'])$(id).addEventListener('pointerdown',e=>{
 if(busy||e.button!==0)return;e.preventDefault();stop();
 const target=e.currentTarget,scroll=$('timeline-scroll'),before=position,beforeScroll=scroll.scrollLeft;
 let x=e.clientX,frame=0,last=performance.now();
 const read=()=>seek(timelinePointerTime(x,$('ruler').getBoundingClientRect().left,zoom,timelineDuration()));
 const move=ev=>{x=ev.clientX;read();};
 const cleanup=()=>{cancelAnimationFrame(frame);target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',cleanup);target.removeEventListener('pointercancel',cancel);target.removeEventListener('lostpointercapture',cleanup);};
 const cancel=()=>{cleanup();scroll.scrollLeft=beforeScroll;seek(before);};
 const tick=now=>{
  if(busy){cleanup();return;}
  const rect=scroll.getBoundingClientRect(),left=rect.left+document.querySelector('.track-sidebar').offsetWidth;
  const previous=scroll.scrollLeft;scroll.scrollLeft+=timelineEdgeSpeed(x,left,rect.left+scroll.clientWidth)*Math.min(50,now-last)/1000;last=now;
  if(scroll.scrollLeft!==previous)read();
  frame=requestAnimationFrame(tick);
 };
 target.setPointerCapture(e.pointerId);read();
 target.addEventListener('pointermove',move);target.addEventListener('pointerup',cleanup);target.addEventListener('pointercancel',cancel);target.addEventListener('lostpointercapture',cleanup);
 frame=requestAnimationFrame(tick);
});
$('playhead').addEventListener('keydown',e=>{if(busy||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();stop();seek(e.key==='Home'?0:e.key==='End'?timelineDuration():position+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?1:.1));});
$('context-close').onclick=()=>showModule(null);
$('inspector-close').onclick=()=>showModule(null);
function showInspector(mode){showModule(null);document.querySelector('.inspector').hidden=false;document.querySelector('.workspace').classList.add('has-context');tab(mode);renderInspector();}
$('clip-split').onclick=()=>$('split').click();$('clip-delete').onclick=()=>$('delete').click();
$('clip-crop').onclick=()=>{selectedMusic=null;showInspector('video');};$('clip-volume').onclick=()=>{selectedMusic=null;showInspector('audio');};

function tab(name){$('tab-video').classList.toggle('active',name==='video');$('tab-audio').classList.toggle('active',name==='audio');$('video-properties').hidden=name==='audio';}
$('tab-video').addEventListener('click',()=>tab('video'));$('tab-audio').addEventListener('click',()=>tab('audio'));
$('nav-media').addEventListener('click',()=>importVideos());$('nav-audio').addEventListener('click',()=>showModule(editorPanel(activePanel,'audio')));$('nav-ai').addEventListener('click',()=>{showModule(editorPanel(activePanel,'ai'));if(activePanel)$('prompt').focus();});
$('export').addEventListener('click',()=>{if(busy || !project().clips.length)return;stop();$('export-details').textContent=`${project().clips.length} trecho${project().clips.length===1?'':'s'} · ${format(duration(project()))} · Formato ${project().aspect}`;$('export-dialog').showModal();});
$('export-close').addEventListener('click',()=>$('export-dialog').close());
$('export-confirm').addEventListener('click',guard(async()=>{$('export-dialog').close();setBusy(true,'Exportando vídeo…');try{const result=await bridge.exportProject(project(),Number($('export-height').value));if(result)toast(`Vídeo exportado: ${result.path.split(/[\\/]/).pop()}`);}finally{setBusy(false);}}));
let connectionRequest=0;
async function refreshConnection(){if(!bridge)return;const request=++connectionRequest,r=await bridge.status();if(request!==connectionRequest)return;connected=r.connected;$('connect').classList.toggle('connected',connected);$('connection-label').textContent=connected?'ChatGPT conectado':'Não conectado';$('connect').disabled=busy||connected;}
$('connect').addEventListener('click',guard(async()=>{if(connected){toast('Conectado com ChatGPT. Configure limites e créditos na sua conta; esta versão não possui desconexão integrada.');return;}if(!bridge)throw new Error('O login está disponível no app desktop.');$('connect').disabled=true;$('connection-label').textContent='Conclua no navegador…';try{await bridge.login();await refreshConnection();toast(connected?'ChatGPT conectado. Pronto para analisar.':'Login não concluído.',!connected);}finally{$('connect').disabled=busy||connected;if(!connected)$('connection-label').textContent='Não conectado';}}));
$('prompt').addEventListener('input',()=>{pending=null;$('proposal').hidden=true;updateButtons();});
$('ai-engine').addEventListener('change',()=>{pending=null;$('proposal').hidden=true;});
$('ai-scope').addEventListener('change',()=>{pending=null;$('proposal').hidden=true;$('ai-feedback').hidden=true;updateButtons();});
let cancelRequested=false;
$('analyze').addEventListener('click',guard(async()=>{
 if(busy)return;$('ai-feedback').hidden=true;const engine=$('ai-engine').value;if(!connected){$('ai-feedback').textContent='Abra Configurações → ChatGPT para conectar sua conta.';$('ai-feedback').hidden=false;return;}
 stop();const snapshot=project(),prompt=$('prompt').value;cancelRequested=false;aiRunning=true;$('ai-cancel').disabled=false;aiProgressState=aiProgress(null);$('ai-progress-label').textContent=aiProgressState.label;setBusy(true);pending=null;$('proposal').hidden=true;
 try{
  const scope=$('ai-scope').value==='selected'?selected:null;if($('ai-scope').value==='selected'&&!snapshot.clips.some(c=>c.id===scope))throw Error('Selecione um trecho válido.');const result=await bridge.analyze(snapshot,prompt,.5,scope,engine,engine==='hybrid');validateScopedPlan(snapshot,result.plan,scope);if(cancelRequested)throw Error('Edição cancelada.');
  if(JSON.stringify(snapshot)!==JSON.stringify(project()))throw new Error('O projeto mudou durante a análise. Resultado descartado.');
  if(engine==='hybrid'){
   if(result.mode!=='hybrid'||result.reviewRequired!==true)throw Error('Resposta do fluxo híbrido inválida.');
   const box=$('proposal');box.replaceChildren();box.hidden=false;
   const add=text=>{const p=document.createElement('p');p.textContent=text;box.append(p);};
   add('Proposta híbrida — revise antes de aplicar.');add(result.plan.summary);
   for(const op of result.plan.operations)add(describeOperation(snapshot,op));
   for(const text of result.pendingRequests||[])add('Pendente — não será executado: '+text);
   for(const warning of result.analysisWarnings||[])add('Revisão da fala: '+warning);
   add(`Evidências compartilhadas: ${result.shared?.transcriptWords||0} palavras transcritas e ${result.shared?.frames||0} frames, incluindo a revisão de bordas. As imagens são amostras; confira os cortes na timeline.`);
   pending={snapshot:JSON.stringify(snapshot),plan:result.plan,scope,notes:[...(result.pendingRequests||[]),...(result.analysisWarnings||[])]};
   const discard=document.createElement('button');discard.id='discard-hybrid-plan';discard.textContent='Descartar proposta';discard.onclick=()=>{pending=null;box.hidden=true;};box.append(discard);
   if(result.plan.operations.length){const apply=document.createElement('button');apply.id='apply-hybrid-plan';apply.className='primary';apply.textContent='Aplicar somente estas alterações';apply.onclick=guard(()=>{
    if(busy||!pending)return;const draft=pending;if(draft.snapshot!==JSON.stringify(project()))throw Error('O projeto mudou. Prepare uma nova proposta.');validateScopedPlan(project(),draft.plan,draft.scope);const before=project(),next=applyPlan(before,draft.plan);commit(next,{...describeChange(before,next),label:`IA híbrida: ${draft.plan.summary}`.slice(0,4000),details:[...draft.plan.operations.map(op=>describeOperation(before,op)),...draft.notes.map(n=>'Pendente: '+n)]});toast('Alterações revisadas aplicadas. Pendências não foram executadas.');
   });box.append(apply);}return;
  }
  const {plan}=result,issues=[...(plan.questions||[]),...(plan.unsupported||[])];
  if(issues.length||!plan.operations?.length){const box=$('proposal');box.replaceChildren();box.hidden=false;for(const text of [plan.summary,...issues]){const p=document.createElement('p');p.textContent=text;box.append(p);}if(!issues.length)toast('Nenhuma alteração necessária.');return;}
  const q=applyPlan(snapshot,plan);setBusy(false);commit(q,{...describeChange(snapshot,q),label:`IA: ${plan.summary}`.slice(0,4000),details:plan.operations.map(op=>describeOperation(snapshot,op))});toast('Edição aplicada. Veja os detalhes no histórico ou desfaça.');
 }catch(e){$('ai-feedback').textContent=cancelRequested?'Edição cancelada. Nenhuma alteração aplicada.':e.message;$('ai-feedback').hidden=false;}finally{setBusy(false);aiRunning=false;}
}));
const cancelOperation=guard(()=>{cancelRequested=true;if(aiRunning){$('ai-progress-label').textContent='Cancelando a edição…';$('ai-cancel').disabled=true;}return bridge.cancel();});
$('cancel').addEventListener('click',cancelOperation);$('ai-cancel').addEventListener('click',cancelOperation);
bridge?.onProgress(p=>{if(aiRunning){if(!cancelRequested){aiProgressState=aiProgress(aiProgressState,p);$('ai-progress-label').textContent=aiProgressState.label;}return;}if(p.stage==='media-warning'){toast(p.message,true);}else if(p.stage==='media'){if(busy)$('busy-label').textContent=p.message;}else if(p.stage==='hybrid')$('busy-label').textContent=p.message;else if(p.stage==='captions')$('busy-label').textContent=`Transcrevendo localmente · ${Math.round(p.completed)}/${Math.round(p.total)}…`;else if(p.stage==='transition')$('busy-label').textContent=`Renderizando transição ${p.completed}/${p.total}…`;else if(p.stage==='transcribe'){$('busy-label').textContent=`GPT transcrevendo áudio · ${p.completed+1}/${p.total}…`;if($('captions-panel').getAttribute('aria-busy')==='true')captionFeedback('loading',`Transcrevendo áudio · ${p.completed+1}/${p.total}…`);}else if(p.stage==='intent')$('busy-label').textContent='Interpretando seu pedido (somente texto)…';else if(p.stage==='quality')$('busy-label').textContent=`Detector local · ${p.seconds.toFixed(0)} s analisados…`;else if(p.stage==='local')$('busy-label').textContent=`Análise no PC · ${p.asset} · ${p.completed}/${p.total} imagens…`;else if(p.stage==='frames')$('busy-label').textContent=`Preparando frames ${p.completed}/${p.total}…`;else if(p.stage==='analysis')$('busy-label').textContent='IA analisando as cenas…';else if(p.stage==='render')$('busy-label').textContent=`Renderizando trecho ${p.completed}/${p.total}…`;});
document.addEventListener('keydown',e=>{
 if(e.target.isContentEditable||e.target.closest('input,textarea,select')||document.querySelector('dialog[open]'))return;
 if(!busy&&e.key==='Enter'&&rangeSelection&&rangeMode==='remove'){e.preventDefault();$('range-delete').click();return;}
 if(!busy&&e.key==='Escape'&&rangeMode){e.preventDefault();cancelRange();return;}
 if(!busy&&rangeSelection&&['Delete','Backspace'].includes(e.key)){e.preventDefault();if(rangeMode!=='remove')activateRange('remove');else $('range-delete').click();return;}
 if(e.key==='Escape'&&cutMode){setCutMode(false);return;}
 if(activePanel==='components'&&!busy&&visualLayers(project()).some(t=>t.id===selectedImage)&&['Delete','Backspace'].includes(e.key)){
 e.preventDefault();$('remove-image').click();return;
 }
 if(textShortcut(e))return;
 const command=e.ctrlKey||e.metaKey;
 if(command && e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();return;}
 if(command && e.key.toLowerCase()==='y'){e.preventDefault();$('redo').click();return;}
 if(e.code==='Space'){e.preventDefault();$('play').click();}else if(!busy && e.key.toLowerCase()==='b')$('split').click();else if(!busy && ['Delete','Backspace'].includes(e.key))$('delete').click();
});
// Resizing must not detach the element holding an active timeline gesture.
let timelineGesture=false,timelineResizePending=false;
document.addEventListener('pointerdown',e=>{if(e.target.closest('.timeline'))timelineGesture=true;},true);
for(const type of ['pointerup','pointercancel'])document.addEventListener(type,()=>{timelineGesture=false;if(timelineResizePending){timelineResizePending=false;requestAnimationFrame(renderTimeline);}},true);
window.addEventListener('resize',()=>{if(timelineGesture)timelineResizePending=true;else renderTimeline();});
const timelineResizer=$('timeline-resizer'),timelineElement=document.querySelector('.timeline');
function timelineHeightLimits(){return {min:160,max:Math.max(160,Math.min(parseFloat(getComputedStyle(timelineElement).getPropertyValue('--timeline-default-height')),timelineElement.getBoundingClientRect().height+document.querySelector('.workspace').getBoundingClientRect().height-220))};}
function setTimelineHeight(value){
 const {min,max}=timelineHeightLimits(),height=Math.max(min,Math.min(max,value));
 timelineElement.classList.add('resized');timelineElement.style.setProperty('--timeline-height',height+'px');
 timelineResizer.setAttribute('aria-valuemin',String(min));timelineResizer.setAttribute('aria-valuemax',String(Math.round(max)));timelineResizer.setAttribute('aria-valuenow',String(Math.round(height)));
}
let timelineResizeDrag=null;
timelineResizer.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();timelineResizeDrag={y:e.clientY,height:timelineElement.getBoundingClientRect().height};timelineResizer.setPointerCapture(e.pointerId);document.body.classList.add('resizing-timeline');});
timelineResizer.addEventListener('pointermove',e=>{if(timelineResizeDrag)setTimelineHeight(timelineResizeDrag.height+timelineResizeDrag.y-e.clientY);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])timelineResizer.addEventListener(event,()=>{timelineResizeDrag=null;document.body.classList.remove('resizing-timeline');});
timelineResizer.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const {min,max}=timelineHeightLimits();setTimelineHeight(e.key==='Home'?min:e.key==='End'?max:timelineElement.getBoundingClientRect().height+(e.key==='ArrowUp'?20:-20));});
window.addEventListener('resize',()=>{if(timelineElement.classList.contains('resized')&&!document.body.classList.contains('preview-focus'))setTimelineHeight(timelineElement.getBoundingClientRect().height);});
render();refreshConnection().catch(()=>{});refreshDiagnosticStatus().catch(()=>{});requestAnimationFrame(animate);
bridge?.ready?.().catch(e=>toast(e.message,true));

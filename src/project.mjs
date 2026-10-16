import {KEYFRAME_FIELDS,keyframeAt,retimeKeyframes,validateKeyframes,validateMotion} from './keyframes.mjs';
import {clipSpeed,clipDuration,sourceTime} from './clip-time.mjs';
import {FONT_FAMILIES} from './fonts.mjs';
import {validateTranscript,captionStyle} from './captions.mjs';
const clone = value => structuredClone(value);
const id = () => globalThis.crypto.randomUUID();
const fail = message => { throw new Error(message); };
const finite = value => typeof value === 'number' && Number.isFinite(value);
function validateAudioFades(c){for(const k of ['fadeIn','fadeOut'])if(c[k]!==undefined&&(!finite(c[k])||c[k]<0||c[k]>10))fail('Fade de áudio inválido. Use de 0 a 10 segundos.');}
export const ASPECTS = ['9:16', '16:9', '1:1', '4:5'];
export function createProject(name='Meu projeto') { return {version:1,name,aspect:'9:16',assets:[],clips:[],captionStyle:{font:'Anton',size:6.5,color:'#ffffff',accent:'#eac39b',position:'bottom',preset:'outline'}}; }
export function validateProject(p) {
  if (!p || p.version!==1 || typeof p.name!=='string' || p.name.length>200 || !ASPECTS.includes(p.aspect) || !Array.isArray(p.assets) || !Array.isArray(p.clips) || p.assets.length>100 || p.clips.length>500) fail('Projeto inválido ou versão não suportada.');
  if(p.brief!==undefined&&(!p.brief||typeof p.brief!=='object'||Object.keys(p.brief).some(k=>k!=='facts')||typeof p.brief.facts!=='string'||!p.brief.facts.trim()||p.brief.facts.length>4000))fail('Informações do local inválidas. Use até 4.000 caracteres.');
  const ids=new Set();
  for(const a of p.assets) {
    if(!a || typeof a.id!=='string' || !a.id || ids.has(a.id) || typeof a.name!=='string' || !finite(a.duration) || a.duration<=0 || a.duration>21600 || !Number.isInteger(a.width) || a.width<(a.kind==='audio'?0:2) || a.width>16384 || !Number.isInteger(a.height) || a.height<(a.kind==='audio'?0:2) || a.height>16384 || (a.kind!==undefined&&!['audio','video','image'].includes(a.kind)) || (a.kind==='audio'&&(a.width!==0||a.height!==0||!a.hasAudio)) || typeof a.hasAudio!=='boolean') fail('Mídia inválida.');
    ids.add(a.id);
  }
  if(p.captionSource!==undefined&&!['original','narration'].includes(p.captionSource))fail('Fonte de legenda inválida.');
  if(p.music!==undefined){if(!Array.isArray(p.music)||p.music.length>100)fail('Trilhas de música inválidas.');const musicIds=new Set();for(const c of p.music){const a=p.assets.find(a=>a.id===c?.assetId);if((c.role!==undefined&&!['music','narration'].includes(c.role))||!a||a.kind!=='audio'||typeof c.id!=='string'||!c.id||musicIds.has(c.id)||![c.in,c.out,c.start,c.volume].every(finite)||c.in<0||c.out-c.in<.02||c.out>a.duration+.000001||c.start<0||c.start>21600||c.volume<0||c.volume>2)fail('Trecho de música inválido.');if(c.captionWords!==undefined)validateTranscript({assetId:c.assetId,words:c.captionWords},a.duration);if(c.speed!==undefined)fail('Velocidade somente em trechos principais.');validateAudioFades(c);musicIds.add(c.id);}}
  if(p.transcripts!==undefined){
    if(!Array.isArray(p.transcripts)||p.transcripts.length>100)fail('Transcrições inválidas.');
    const seen=new Set();for(const t of p.transcripts){const a=p.assets.find(a=>a.id===t?.assetId);if(!a||seen.has(t.assetId))fail('Mídia de legenda inválida.');validateTranscript(t,a.duration);seen.add(t.assetId);}
  }
  if(p.captionStyle!==undefined)captionStyle(p.captionStyle);
  if(p.textLayers!==undefined){
    if(!Array.isArray(p.textLayers)||p.textLayers.length>100)fail('Componentes de texto inválidos.');
    const seen=new Set();
    for(const t of p.textLayers){
      if(!t||typeof t.id!=='string'||!t.id||seen.has(t.id)||typeof t.text!=='string'||!t.text.trim()||t.text.length>500||/[\u0000-\u0008\u000b-\u001f]/.test(t.text)||![t.start,t.end].every(finite)||t.start<0||t.end-t.start<.02||t.end>21600||!t.style)fail('Texto ou duração inválidos.');
      captionStyle(t.style);validateWordStyles(t);seen.add(t.id);
    }
  }
  if(p.imageLayers!==undefined){
    if(!Array.isArray(p.imageLayers)||p.imageLayers.length>100)fail('Componentes de imagem inválidos.');
    const seen=new Set();
    for(const t of p.imageLayers){
      const a=p.assets.find(a=>a.id===t?.assetId);
      if(!a||a.kind!=='image'||typeof t.id!=='string'||!t.id||seen.has(t.id)||![t.start,t.end,t.x,t.y,t.width,t.rotation,t.opacity].every(finite)||t.start<0||t.end-t.start<.02||t.end>21600||t.x<0||t.x>100||t.y<0||t.y>100||t.width<5||t.width>100||t.rotation< -180||t.rotation>180||t.opacity<0||t.opacity>100)fail('Imagem, tempo ou posição inválidos.');
      seen.add(t.id);
    }
  }
  if(p.videoLayers!==undefined){
    if(!Array.isArray(p.videoLayers)||p.videoLayers.length>100)fail('Componentes de vídeo inválidos.');
    const seen=new Set();
    for(const t of p.videoLayers){
      const a=p.assets.find(a=>a.id===t?.assetId);
      if(!a||(a.kind!==undefined&&a.kind!=='video')||typeof t.id!=='string'||!t.id||seen.has(t.id)||![t.start,t.end,t.x,t.y,t.width,t.rotation,t.opacity,t.in].every(finite)||t.in<0||t.in+t.end-t.start>a.duration+.000001||t.start<0||t.end-t.start<.02||t.end>21600||t.x<0||t.x>100||t.y<0||t.y>100||t.width<5||t.width>100||t.rotation< -180||t.rotation>180||t.opacity<0||t.opacity>100)fail('Vídeo, tempo ou posição inválidos.');
      seen.add(t.id);
    }
  }
  if(p.shapeLayers!==undefined){
    if(!Array.isArray(p.shapeLayers)||p.shapeLayers.length>100)fail('Componentes de forma inválidos.');
    const seen=new Set(),color=v=>v===null||(typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v));
    for(const t of p.shapeLayers){
      if(!t||typeof t.id!=='string'||!t.id||seen.has(t.id)||!['rectangle','circle','line','arrow'].includes(t.type)||![t.start,t.end,t.x,t.y,t.width,t.height,t.rotation,t.opacity,t.strokeWidth].every(finite)||t.start<0||t.end-t.start<.02||t.end>21600||t.x<0||t.x>100||t.y<0||t.y>100||t.width<5||t.width>100||t.height<5||t.height>100||t.rotation< -180||t.rotation>180||t.opacity<0||t.opacity>100||t.strokeWidth<0||t.strokeWidth>5||!color(t.fill)||!color(t.stroke))fail('Forma, cor, tempo ou posição inválidos.');
      seen.add(t.id);
    }
  }
  for(const t of [...(p.imageLayers||[]),...(p.videoLayers||[]),...(p.shapeLayers||[]),...(p.textLayers||[])])validateKeyframes(t);
  for(const t of [...(p.imageLayers||[]),...(p.videoLayers||[]),...(p.shapeLayers||[])])validateMotion(t);
  const components=[...(p.shapeLayers||[]),...(p.imageLayers||[]),...(p.videoLayers||[]),...(p.textLayers||[])].map(t=>t.id);
  if(components.includes('@captions')||new Set(components).size!==components.length)fail('Identidade de componente duplicada.');
  if(p.layerOrder!==undefined&&(!Array.isArray(p.layerOrder)||p.layerOrder.length!==components.length+1||new Set(p.layerOrder).size!==p.layerOrder.length||p.layerOrder.some(id=>id!=='@captions'&&!components.includes(id))))fail('Ordem de camadas inválida.');
  const clips=new Set();
  for(const c of p.clips) {
    const a=p.assets.find(a=>a.id===c.assetId), r=c.crop;
    if(!a || a.kind==='audio' || typeof c.id!=='string' || !c.id || clips.has(c.id) || !finite(c.in) || !finite(c.out) || c.in<0 || c.out-c.in<.02 || (a.kind==='image'?c.out>21600:c.out>a.duration+.000001) || !finite(c.volume) || c.volume<0 || c.volume>2 || !r || !['x','y','w','h'].every(k=>finite(r[k])) || r.x<0 || r.y<0 || r.w<.05 || r.h<.05 || r.x+r.w>1.000001 || r.y+r.h>1.000001) fail('Trecho, áudio ou enquadramento inválido.');
    if(c.background!==undefined&&!['black','blur','color'].includes(c.background))fail('Fundo inválido.');
    if((c.background==='color'||c.backgroundColor!==undefined)&&!(typeof c.backgroundColor==='string'&&/^#[0-9a-f]{6}$/i.test(c.backgroundColor)))fail('Cor de fundo inválida.');
    if(c.captionWords!==undefined)validateTranscript({assetId:c.assetId,words:c.captionWords},a.duration);
    if(c.speed!==undefined&&(!finite(c.speed)||c.speed<.25||c.speed>4||clipDuration(c)<.02-1e-9))fail('Velocidade inválida. Use 0,25× a 4× e mantenha ao menos 0,02 s de trecho.');
    if(c.zoom!==undefined){const z=c.zoom;if(!z||typeof z!=='object'||Object.keys(z).some(k=>!['from','to'].includes(k))||![z.from,z.to].every(finite)||z.from<1||z.from>2||z.to<1||z.to>2)fail('Zoom suave inválido. Use fatores de 1 a 2.');}
    if(c.adjustments!==undefined){const a=c.adjustments;if(!a||typeof a!=='object'||Object.keys(a).some(k=>!['brightness','contrast','saturation','temperature','sharpness'].includes(k))||![a.brightness,a.contrast,a.saturation].every(finite)||a.brightness< -1||a.brightness>1||a.contrast<0||a.contrast>2||a.saturation<0||a.saturation>2||a.temperature!==undefined&&(!finite(a.temperature)||a.temperature< -1||a.temperature>1)||a.sharpness!==undefined&&(!finite(a.sharpness)||a.sharpness<0||a.sharpness>1))fail('Ajustes de imagem inválidos.');}
    validateAudioFades(c);clips.add(c.id);
  }
  validateTransitions(p);
  return p;
}
export function addAsset(p,a) { const q=clone(p);q.assets.push(clone(a));return validateProject(q); }
export function addClip(p,assetId,clipId=id()) {
  const a=p.assets.find(a=>a.id===assetId); if(!a||a.kind==='audio') fail('Mídia de vídeo não encontrada.');
  const q=clone(p);q.clips.push({id:clipId,assetId,in:0,out:a.duration,volume:1,crop:{x:0,y:0,w:1,h:1}});return validateProject(q);
}
export function duration(p) { return p.clips.reduce((sum,c)=>sum+clipDuration(c),0); }
export function clipAt(p,time) {
  let start=0;
  for(const clip of p.clips) { const end=start+clipDuration(clip);if(time>=start && time<end-.0000001) return {clip,start,sourceTime:sourceTime(clip,time-start)};start=end; }
  return null;
}
export function editProject(p,op) {
  const q=clone(p);
  if(op.type==='set_aspect') { q.aspect=op.aspect;return validateProject(q); }
  // Facts only the user knows (menu, address, dates): kept with the project so the AI can check and fill them.
  if(op.type==='set_brief') { const facts=typeof op.facts==='string'?op.facts.trim():op.facts;if(facts)q.brief={facts};else delete q.brief;return validateProject(q); }
  const index=q.clips.findIndex(c=>c.id===op.clipId);if(index<0) fail('Trecho não encontrado.');
  const c=q.clips[index];
  switch(op.type) {
    case 'split': {
      if(!finite(op.time) || op.time-c.in<.02 || c.out-op.time<.02) fail('Posicione o cursor dentro do trecho para dividir.');
      const right={...clone(c),id:op.newId||id(),in:op.time};if(c.fadeOut!==undefined)c.fadeOut=0;if(right.fadeIn!==undefined)right.fadeIn=0;c.out=op.time;q.clips.splice(index+1,0,right);for(const t of q.transitions||[])if(t.leftId===c.id)t.leftId=right.id;break;
    }
    case 'trim': c.in=op.in;c.out=op.out;break;
    case 'delete': q.clips.splice(index,1);break;
    case 'move': if(!Number.isInteger(op.index) || op.index<0 || op.index>=q.clips.length) fail('Posição inválida.');q.clips.splice(index,1);q.clips.splice(op.index,0,c);break;
    case 'update': for(const key of ['volume','crop','background','backgroundColor','fadeIn','fadeOut','adjustments','speed','zoom']) if(key in op){if(key==='zoom'&&(op.zoom===null||op.zoom.from===1&&op.zoom.to===1))delete c.zoom;else c[key]=clone(op[key]);}break;
    default: fail('Operação ainda não suportada.');
  }
  return validateProject(reconcileTransitions(q));
}
function validateHistoryEntry(e,i){validateProject(e?.state);if(typeof e.label!=='string'||e.label.length>4000||!Array.isArray(e.details)||e.details.length>100||!e.details.every(s=>typeof s==='string'&&s.length<=4000)||!Array.isArray(e.affected)||e.affected.length>500||!e.affected.every(s=>typeof s==='string'&&s.length<=200)||typeof e.at!=='string'||e.at.length>40||!Number.isFinite(Date.parse(e.at))||(i===0?e.parent!==null:!Number.isInteger(e.parent)||e.parent<0||e.parent>=i))fail('Entrada do histórico inválida.');}
export class History {
  constructor(p) {this.entries=[{state:clone(validateProject(p)),label:'Estado inicial',details:[],affected:[],at:new Date().toISOString(),parent:null}];this.cursor=0;}
  get current(){return clone(this.entries[this.cursor].state);}
  get canUndo(){return this.entries[this.cursor].parent!==null;}
  get next(){return this.entries.findLastIndex(e=>e.parent===this.cursor);}
  get canRedo(){return this.next>=0;}
  commit(p,{label='Editar projeto',details=[],affected=[]}={}) {
    validateProject(p);if(JSON.stringify(p)===JSON.stringify(this.current))return this.current;
    if(this.entries.length>=2000)fail('Histórico atingiu 2.000 estados. Salve uma cópia antes de continuar.');
    const entry={state:clone(p),label,details:clone(details),affected:clone(affected),at:new Date().toISOString(),parent:this.cursor};
    validateHistoryEntry(entry,this.entries.length);
    this.entries.push(entry);this.cursor=this.entries.length-1;return this.current;
  }
  restore(index){if(!Number.isInteger(index)||index<0||index>=this.entries.length)fail('Estado do histórico inválido.');this.cursor=index;return this.current;}
  undo(){if(this.canUndo)this.cursor=this.entries[this.cursor].parent;return this.current;}
  redo(){if(this.canRedo)this.cursor=this.next;return this.current;}
  serialize(){return clone({version:1,entries:this.entries,cursor:this.cursor});}
  static from(data){
    if(!data||data.version!==1||!Array.isArray(data.entries)||!data.entries.length||data.entries.length>2000||!Number.isInteger(data.cursor)||data.cursor<0||data.cursor>=data.entries.length)fail('Histórico inválido.');
    data.entries.forEach(validateHistoryEntry);
    const h=new History(data.entries[0].state);h.entries=clone(data.entries);h.cursor=data.cursor;return h;
  }
}
const keys={split:['clipId','time'],trim:['clipId','in','out'],delete:['clipId'],move:['clipId','index'],update:['clipId','volume','crop','speed','background','backgroundColor','adjustments','fadeIn','fadeOut','zoom'],set_aspect:['aspect'],remove_ranges:['clipId','ranges'],keep_ranges:['clipId','ranges'],adjust_ranges:['clipId','ranges','patch'],set_transition:['leftId','rightId','effect','duration'],set_transition_at:['index','effect','duration'],edit_audio:['audioId','patch'],add_text:['layer'],add_image:['layer'],add_video:['layer'],add_shape:['layer'],edit_component:['layerId','patch'],remove_component:['layerId'],move_component:['layerId','direction'],set_keyframe:['layerId','time','pose'],remove_keyframe:['layerId','time'],set_motion:['layerId','enter','exit']};
const visualPlanFields=['start','end','x','y','width','rotation','opacity'];
const textPlanFields=['text','start','end','style'];
const stylePlanFields=['font','size','color','position','preset','positionX','positionY','width','accent','strokeColor','strokeWidth','shadow','shadowColor','spacing','boxColor','boxOpacity','bold','italic','uppercase','hollow','accentLast','glowColor','glow','enter','exit'];
function planFields(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(value).length||Object.keys(value).some(k=>!allowed.includes(k)))fail('Campos da operação da IA inválidos.');}
function componentEditor(p,layerId){
 for(const [key,edit,fields] of [['textLayers',editTextLayer,textPlanFields],['imageLayers',editImageLayer,visualPlanFields],['videoLayers',editVideoLayer,[...visualPlanFields,'in']],['shapeLayers',editShapeLayer,[...visualPlanFields,'type','height','fill','stroke','strokeWidth']]]){
  const layer=p[key]?.find(t=>t.id===layerId);if(layer)return {edit,fields,layer};
 }fail('Componente da IA não encontrado.');
}
function applyPlanOperation(p,op){
 if(op.type==='set_transition_at'){
  if(!Number.isInteger(op.index)||op.index<0||op.index>=p.clips.length-1)fail('Posição de transição inválida.');
  return applyPlanOperation(p,{type:'set_transition',leftId:p.clips[op.index].id,rightId:p.clips[op.index+1].id,effect:op.effect,duration:op.duration});
 }
 if(op.type==='set_transition'){
  if(!finite(op.duration))fail('Duração de transição inválida.');
  if(op.effect!=='none'&&op.duration>transitionLimit(p,op.leftId,op.rightId)+1e-9)fail('Duração acima da margem disponível para a transição.');
  return setTransition(p,op.leftId,op.rightId,op.effect,op.duration);
 }
 if(op.type==='set_motion')return setMotion(p,op.layerId,{enter:op.enter,exit:op.exit});
 if(op.type==='edit_audio'){planFields(op.patch,['in','out','start','volume','fadeIn','fadeOut']);return editMusic(p,op.audioId,op.patch);}
 if(op.type.startsWith('add_')){
  const definitions={add_text:[addTextLayer,textPlanFields],add_image:[addImageLayer,[...visualPlanFields,'assetId']],add_video:[addVideoLayer,[...visualPlanFields,'assetId','in']],add_shape:[addShapeLayer,[...visualPlanFields,'type','height','fill','stroke','strokeWidth']]};
  const [add,fields]=definitions[op.type];planFields(op.layer,['id',...fields]);if(typeof op.layer.id!=='string'||!op.layer.id)fail('Identidade de componente inválida.');
  if(op.layer.style)planFields(op.layer.style,stylePlanFields);return add(p,op.layer);
 }
 if(op.type==='edit_component'||op.type==='remove_component'){
  const {edit,fields,layer}=componentEditor(p,op.layerId);if(op.type==='remove_component')return edit(p,op.layerId,null);
  planFields(op.patch,fields);const patch=clone(op.patch);if(patch.style){planFields(patch.style,stylePlanFields);patch.style={...layer.style,...patch.style};}return edit(p,op.layerId,patch);
 }
 if(op.type==='move_component'){componentEditor(p,op.layerId);return moveLayer(p,op.layerId,op.direction);}
 if(op.type==='set_keyframe'){planFields(op.pose,KEYFRAME_FIELDS);return setKeyframe(p,op.layerId,op.time,op.pose);}
 if(op.type==='remove_keyframe')return setKeyframe(p,op.layerId,op.time,null);
 return editProject(p,op);
}
export function parsePlan(text) { const p=JSON.parse(text);if(!p || typeof p!=='object' || Array.isArray(p)) fail('Resposta da IA inválida.');return p; }
export function validatePlan(p,plan) {
  validateProject(p);
  if(!plan || Object.keys(plan).some(k=>!['summary','operations','questions','unsupported'].includes(k)) || typeof plan.summary!=='string' || plan.summary.length>4000 || !Array.isArray(plan.operations) || plan.operations.length>100 || !Array.isArray(plan.questions) || !Array.isArray(plan.unsupported) || ![...plan.questions,...plan.unsupported].every(s=>typeof s==='string' && s.length<=2000)) fail('Plano da IA inválido.');
  if(plan.questions.length || plan.unsupported.length) fail('O pedido precisa de esclarecimento ou contém recursos ainda não suportados.');
  for(const op of plan.operations) {
    const allowed=keys[op?.type];if(!allowed || (op.type==='update'? !('clipId' in op):allowed.some(k=>!(k in op))) || Object.keys(op).some(k=>k!=='type' && !allowed.includes(k))) fail('Operação da IA inválida.');
    if(op.type==='update'&&op.crop)planFields(op.crop,['x','y','w','h']);
    if(op.type==='update' && !keys.update.slice(1).some(k=>k in op)) fail('Ajuste vazio.');
    if(op.type==='adjust_ranges'){planFields(op.patch,['speed','crop','adjustments','volume','zoom']);if(op.patch.crop)planFields(op.patch.crop,['x','y','w','h']);}
    if(['remove_ranges','keep_ranges','adjust_ranges'].includes(op.type)) {
      const c=p.clips.find(c=>c.id===op.clipId),a=p.assets.find(a=>a.id===c?.assetId);
      if(!a || !Array.isArray(op.ranges) || op.ranges.length>100 || op.ranges.some(r=>!Array.isArray(r) || r.length!==2 || !r.every(finite) || r[0]<0 || r[1]<=r[0] || r[1]>a.duration+.000001)) fail('Intervalos da IA inválidos.');
    }
  }
  return plan;
}
// Range operations split a clip into pieces with new ids the plan cannot know. Each piece keeps its original clip as
// lineage, so later range operations and updates naming that clip reach every piece.
export function applyPlan(p,plan) {
  validatePlan(p,plan);let q=clone(p);
  const root=new Map(q.clips.map(c=>[c.id,c.id])),family=clipId=>q.clips.filter(c=>root.get(c.id)===clipId);
  for(const op of plan.operations) {
    if(op.type==='update'&&root.get(op.clipId)===op.clipId&&family(op.clipId).length>1){for(const piece of family(op.clipId))q=applyPlanOperation(q,{...op,clipId:piece.id});continue;}
    if(!['keep_ranges','remove_ranges','adjust_ranges'].includes(op.type)) { const before=new Set(q.clips.map(c=>c.id));q=applyPlanOperation(q,op);for(const c of q.clips)if(!before.has(c.id))root.set(c.id,root.get(op.clipId)??c.id);continue; }
    const members=root.get(op.clipId)===op.clipId?family(op.clipId):q.clips.filter(c=>c.id===op.clipId);if(!members.length) fail('Trecho não encontrado no plano.');
    for(const c of members){
      const index=q.clips.findIndex(x=>x.id===c.id),merged=[];
      for(const r of [...op.ranges].sort((a,b)=>a[0]-b[0])) {
        const start=Math.max(c.in,r[0]),end=Math.min(c.out,r[1]);if(end<=start)continue;
        if(merged.length && start<=merged.at(-1)[1]) merged.at(-1)[1]=Math.max(merged.at(-1)[1],end);else merged.push([start,end]);
      }
      let segments=merged.map(([a,b])=>({in:a,out:b,patched:true}));
      if(op.type!=='keep_ranges'){segments=[];let cursor=c.in;for(const [start,end] of merged){if(start>cursor)segments.push({in:cursor,out:start});if(op.type==='adjust_ranges')segments.push({in:start,out:end,patched:true});cursor=end;}if(cursor<c.out)segments.push({in:cursor,out:c.out});}
      const pieces=segments.filter(s=>s.out-s.in>=.02).map((s,i)=>({...clone(c),id:i===0?c.id:id(),in:s.in,out:s.out}));
      for(const [i,piece] of pieces.entries()){root.set(piece.id,root.get(c.id));if(i>0&&piece.fadeIn!==undefined)piece.fadeIn=0;if(i<pieces.length-1&&piece.fadeOut!==undefined)piece.fadeOut=0;}
      q.clips.splice(index,1,...pieces);reconcileTransitions(q);validateProject(q);
      if(op.type==='adjust_ranges')for(const [i,s] of segments.filter(s=>s.out-s.in>=.02).entries())if(s.patched)q=applyPlanOperation(q,{type:'update',clipId:pieces[i].id,...op.patch});
    }
  }
  return validateProject(q);
}

export function addMusic(p,asset,clip){const q=clone(p);if(!q.assets.some(a=>a.id===asset.id))q.assets.push(clone(asset));q.music=[...(q.music||[]),{id:clip.id||id(),assetId:asset.id,in:clip.in,out:clip.out,start:clip.start??0,volume:clip.volume??1,...(clip.role?{role:clip.role}:{}),...(clip.fadeIn!==undefined?{fadeIn:clip.fadeIn}:{}),...(clip.fadeOut!==undefined?{fadeOut:clip.fadeOut}:{})}];return validateProject(q);}
export function editMusic(p,clipId,patch){const q=clone(p),c=q.music?.find(c=>c.id===clipId);if(!c)fail('Trecho de música não encontrado.');if(patch===null)q.music=q.music.filter(c=>c.id!==clipId);else for(const k of ['in','out','start','volume','fadeIn','fadeOut'])if(k in patch)c[k]=patch[k];return validateProject(q);}

export function addTextLayer(p,layer){const q=clone(p);q.textLayers=[...(q.textLayers||[]),{...clone(layer),id:layer.id||id()}];return validateProject(syncLayerOrder(q));}
const words=text=>text.split(/\s+/).filter(Boolean);
// One entry per word index; every field is optional and overrides the layer style for that word.
function validateWordStyles(t){
 if(t.wordStyles===undefined)return;
 const count=words(t.text).length,seen=new Set();
 if(!Array.isArray(t.wordStyles)||t.wordStyles.length>500)fail('Estilos de palavra inválidos.');
 for(const w of t.wordStyles){
  if(!w||!Number.isInteger(w.index)||w.index<0||w.index>=count||seen.has(w.index)||Object.keys(w).some(k=>!['index','color','bold','italic','scale','font'].includes(k))
   ||w.color!==undefined&&!/^#[a-fA-F0-9]{6}$/.test(w.color)||[w.bold,w.italic].some(v=>v!==undefined&&typeof v!=='boolean')
   ||w.scale!==undefined&&!(Number.isFinite(w.scale)&&w.scale>=50&&w.scale<=200)||w.font!==undefined&&!FONT_FAMILIES.includes(w.font))fail('Estilo de palavra inválido.');
  seen.add(w.index);
 }
}
// Looks follow their word through an edit: words kept in order (longest common subsequence) keep their look.
export function remapWordStyles(before,after,styles){
 if(!styles?.length)return [];
 const a=words(before),b=words(after),table=a.map(()=>new Array(b.length+1).fill(0));table.push(new Array(b.length+1).fill(0));
 for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)table[i][j]=a[i]===b[j]?table[i+1][j+1]+1:Math.max(table[i+1][j],table[i][j+1]);
 const moved=new Map();for(let i=0,j=0;i<a.length&&j<b.length;){if(a[i]===b[j]){moved.set(i,j);i++;j++;}else if(table[i+1][j]>=table[i][j+1])i++;else j++;}
 return styles.filter(w=>moved.has(w.index)).map(w=>({...w,index:moved.get(w.index)})).sort((x,y)=>x.index-y.index);
}
export function editTextLayer(p,layerId,patch){
 const q=clone(p),layer=q.textLayers?.find(t=>t.id===layerId);if(!layer)fail('Texto não encontrado.');
 const original=clone(layer);
 if(patch===null)q.textLayers=q.textLayers.filter(t=>t.id!==layerId);
 else{
  if('text' in patch&&!('wordStyles' in patch)&&layer.wordStyles){const next=remapWordStyles(layer.text,patch.text,layer.wordStyles);if(next.length)layer.wordStyles=next;else delete layer.wordStyles;}
  for(const k of ['text','start','end','style','wordStyles'])if(k in patch)layer[k]=clone(patch[k]);
  if(layer.wordStyles&&!layer.wordStyles.length)delete layer.wordStyles;
  retimeKeyframes(layer,original);
 }
 return validateProject(syncLayerOrder(q));
}

export function addImageLayer(p,layer){const q=clone(p);q.imageLayers=[...(q.imageLayers||[]),{...clone(layer),id:layer.id||id()}];return validateProject(syncLayerOrder(q));}
export function editImageLayer(p,layerId,patch){
 const q=clone(p),layer=q.imageLayers?.find(t=>t.id===layerId);if(!layer)fail('Imagem não encontrada.');
 const original=clone(layer);
 if(patch===null)q.imageLayers=q.imageLayers.filter(t=>t.id!==layerId);
 else for(const k of ['start','end','x','y','width','rotation','opacity'])if(k in patch)layer[k]=clone(patch[k]);
 if(patch!==null)retimeKeyframes(layer,original);
 return validateProject(syncLayerOrder(q));
}

export function addVideoLayer(p,layer){const q=clone(p);q.videoLayers=[...(q.videoLayers||[]),{...clone(layer),id:layer.id||id()}];return validateProject(syncLayerOrder(q));}
export function editVideoLayer(p,layerId,patch){
 const q=clone(p),layer=q.videoLayers?.find(t=>t.id===layerId);if(!layer)fail('Vídeo não encontrado.');
 const original=clone(layer);
 if(patch===null)q.videoLayers=q.videoLayers.filter(t=>t.id!==layerId);
 else for(const k of ['in','start','end','x','y','width','rotation','opacity'])if(k in patch)layer[k]=clone(patch[k]);
 if(patch!==null)retimeKeyframes(layer,original);
 return validateProject(syncLayerOrder(q));
}

export function addShapeLayer(p,layer){const q=clone(p);q.shapeLayers=[...(q.shapeLayers||[]),{...clone(layer),id:layer.id||id()}];return validateProject(syncLayerOrder(q));}
export function editShapeLayer(p,layerId,patch){
 const q=clone(p),layer=q.shapeLayers?.find(t=>t.id===layerId);if(!layer)fail('Forma não encontrada.');
 const original=clone(layer);
 if(patch===null)q.shapeLayers=q.shapeLayers.filter(t=>t.id!==layerId);
 else for(const k of ['type','start','end','x','y','width','height','rotation','opacity','fill','stroke','strokeWidth'])if(k in patch)layer[k]=clone(patch[k]);
 if(patch!==null)retimeKeyframes(layer,original);
 return validateProject(syncLayerOrder(q));
}

export function setKeyframe(p,layerId,time,patch){
 const q=clone(p),t=[...(q.imageLayers||[]),...(q.videoLayers||[]),...(q.shapeLayers||[]),...(q.textLayers||[])].find(t=>t.id===layerId);
 if(!t)fail('Componente do keyframe não encontrado.');
 if(!finite(time)||time<0||time>t.end-t.start+1e-9||patch!==null&&(!patch||typeof patch!=='object'||Object.keys(patch).some(k=>!KEYFRAME_FIELDS.includes(k))))fail('Tempo ou ajuste de keyframe inválido.');
 time=Math.round(time*1000)/1000;if(time>t.end-t.start)time=t.end-t.start;
 const point=patch===null?null:{...keyframeAt(t,time),...patch,time};t.keyframes=(t.keyframes||[]).filter(p=>Math.abs(p.time-time)>1e-7);if(point)t.keyframes.push(point);t.keyframes.sort((a,b)=>a.time-b.time);if(!t.keyframes.length)delete t.keyframes;
 return validateProject(q);
}

// Entrance/exit preset of an image, video or shape layer; 'none' on both sides removes it.
export function setMotion(p,layerId,patch){
 const q=clone(p),t=[...(q.imageLayers||[]),...(q.videoLayers||[]),...(q.shapeLayers||[])].find(t=>t.id===layerId);
 if(!t)fail('Componente não encontrado.');
 const next={...(t.motion||{}),...patch};for(const k of Object.keys(next))if(next[k]==='none')delete next[k];
 if(Object.keys(next).length)t.motion=next;else delete t.motion;
 return validateProject(q);
}

// Bottom to top. Old projects keep the same image/video/caption/text composition.
const defaultLayerOrder=p=>[...(p.imageLayers||[]).map(t=>t.id),...(p.videoLayers||[]).map(t=>t.id),'@captions',...(p.textLayers||[]).map(t=>t.id),...(p.shapeLayers||[]).map(t=>t.id)];
export function layerOrder(p){return [...(p.layerOrder||defaultLayerOrder(p))];}
function syncLayerOrder(p){if(p.layerOrder){const ids=defaultLayerOrder(p);p.layerOrder=[...p.layerOrder.filter(id=>ids.includes(id)),...ids.filter(id=>!p.layerOrder.includes(id))];}return p;}
export function moveLayer(p,layerId,direction){
 const q=clone(p),order=layerOrder(q),at=order.indexOf(layerId);
 if(at<0||!['front','back'].includes(direction))fail('Camada ou direção inválida.');
 order.splice(at,1);direction==='front'?order.push(layerId):order.unshift(layerId);q.layerOrder=order;return validateProject(q);
}

export const TRANSITION_TYPES=['dissolve','fade','slide'];
export function transitionLimit(p,leftId,rightId){
 const i=p.clips.findIndex(c=>c.id===leftId),left=p.clips[i],right=p.clips[i+1];
 if(!left||right?.id!==rightId)return 0;
 const a=p.assets.find(a=>a.id===left.assetId),b=p.assets.find(a=>a.id===right.assetId);
 const max=Math.min(3,clipDuration(left),clipDuration(right),2*(a.kind==='image'?Infinity:(a.duration-left.out)/clipSpeed(left)),2*(b.kind==='image'?Infinity:right.in/clipSpeed(right)));
 return Math.max(0,Math.floor((max+1e-8)*10)/10);
}
function validateTransitions(p){
 if(p.transitions===undefined)return;
 if(!Array.isArray(p.transitions)||p.transitions.length>499)fail('Transições inválidas.');
 const seen=new Set();for(const t of p.transitions){
  if(!t||typeof t.leftId!=='string'||typeof t.rightId!=='string'||seen.has(t.leftId)||!TRANSITION_TYPES.includes(t.type)||!finite(t.duration)||t.duration<.1||t.duration>transitionLimit(p,t.leftId,t.rightId)+1e-8)fail('Transição, duração ou margem de mídia inválida.');
  seen.add(t.leftId);
 }
}
function reconcileTransitions(p){
 if(p.transitions)p.transitions=p.transitions.flatMap(t=>{const limit=transitionLimit(p,t.leftId,t.rightId);return limit<.1?[]:[{...t,duration:Math.min(t.duration,limit)}];});return p;
}
// Transitions overlap the clips, as in CapCut/Edits: when the media has no spare frames past
// the cut, trim half the duration from each side so the window fits and no frame is frozen.
export function transitionRoom(p,leftId,rightId,seconds){
 const i=p.clips.findIndex(c=>c.id===leftId),left=p.clips[i],right=p.clips[i+1];
 if(!left||right?.id!==rightId)fail('Selecione a junção de dois trechos vizinhos.');
 const a=p.assets.find(a=>a.id===left.assetId),b=p.assets.find(a=>a.id===right.assetId),half=seconds/2;
 let q=p;
 const leftNeed=a.kind==='image'?0:half*clipSpeed(left)-(a.duration-left.out);
 if(leftNeed>1e-6)q=editProject(q,{type:'trim',clipId:left.id,in:left.in,out:Math.max(left.in+.02,left.out-leftNeed)});
 const rightNeed=b.kind==='image'?0:half*clipSpeed(right)-right.in;
 if(rightNeed>1e-6)q=editProject(q,{type:'trim',clipId:right.id,in:Math.min(right.out-.02,right.in+rightNeed),out:right.out});
 return q;
}
export function setTransition(p,leftId,rightId,type,seconds){
 const q=clone(p),i=q.clips.findIndex(c=>c.id===leftId);if(i<0||q.clips[i+1]?.id!==rightId)fail('Selecione a junção de dois trechos vizinhos.');
 q.transitions=(q.transitions||[]).filter(t=>t.leftId!==leftId);
 if(type!=='none'){
  if(!TRANSITION_TYPES.includes(type)||!finite(seconds)||seconds<.1||seconds>3)fail('Tipo ou duração de transição inválidos.');
  const limit=transitionLimit(q,leftId,rightId);if(limit<.1)fail('Sem margem para a transição. Apare o fim do primeiro vídeo e o início do próximo; nenhum quadro será congelado.');
  q.transitions.push({leftId,rightId,type,duration:Math.min(seconds,limit)});
 }return validateProject(q);
}
export function transitionAt(p,time){
 let cut=0;for(let i=0;i<p.clips.length-1;i++){
  const left=p.clips[i],right=p.clips[i+1];cut+=clipDuration(left);const t=p.transitions?.find(t=>t.leftId===left.id&&t.rightId===right.id);if(!t)continue;
  const start=cut-t.duration/2,end=cut+t.duration/2;
  if(time>=start&&time<end)return {...t,left,right,cut,start,end,progress:(time-start)/t.duration,leftTime:left.out+(time-cut)*clipSpeed(left),rightTime:right.in+(time-cut)*clipSpeed(right)};
 }return null;
}

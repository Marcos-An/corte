import {clipDuration} from './clip-time.mjs';
// Coordinates are measured from the current ruler rectangle, including scroll.
export function timelinePointerTime(clientX,left,zoom,total){
 return Math.max(0,Math.min(total,(clientX-left)/zoom));
}
export function playbackStart(position,total,removal){
 const start=position>=total-.02?0:position;
 return removal&&start>=removal.start&&start<removal.end?removal.end:start;
}
export function editorPanel(current,requested){return current===requested?null:requested;}

export function scopeProject(project,clipId){
 if(!clipId)return structuredClone(project);
 const c=project.clips.find(c=>c.id===clipId);if(!c)throw Error('Selecione um trecho válido.');
 const scoped={...structuredClone(project),clips:[structuredClone(c)],assets:structuredClone(project.assets.filter(a=>a.id===c.assetId))};
 for(const field of ['transitions','music','textLayers','imageLayers','videoLayers','shapeLayers'])scoped[field]=[];
 delete scoped.exportSelection;delete scoped.layerOrder;delete scoped.transcripts;delete scoped.clips[0].captionWords;return scoped;
}
export function validateScopedPlan(project,plan,clipId){
 if(!clipId)return plan;scopeProject(project,clipId);
 if(!Array.isArray(plan?.operations)||plan.operations.some(op=>op.clipId!==clipId||['move','move_range','insert_clip','add_audio','set_aspect'].includes(op.type)))throw Error('A IA tentou editar fora do trecho escolhido. Nenhuma alteração foi aplicada.');
 return plan;
}
export function dragCrop(crop,dx,dy,width,height){
 const clamp=(v,max)=>Math.max(0,Math.min(max,v));
 return {...crop,x:clamp(crop.x-dx/width*crop.w,1-crop.w),y:clamp(crop.y-dy/height*crop.h,1-crop.h)};
}

export function nextClipTime(project,position){let end=0;for(const c of project.clips){end+=clipDuration(c);if(end>position+.001)return end;}return end;}

export function previewSize(width,height,videoWidth,videoHeight){const scale=Math.max(0,Math.min(width/videoWidth,height/videoHeight));return {width:Math.round(videoWidth*scale),height:Math.round(videoHeight*scale)};}

// Positions are percentages of the canvas. Each anchor of the moving box (center, then edges, as
// offsets from its center) may lock onto any line; the nearest one within the threshold wins.
export function snapAxis(value,offsets,lines,threshold){
 let best=null;
 for(const o of offsets)for(const line of lines){const d=Math.abs(line-o-value);if(d<=threshold&&(!best||d<best.d))best={d,value:line-o,guide:line};}
 return best?{value:best.value,guide:best.guide}:{value,guide:null};
}
export function snapPoint(x,y,targets,thresholdX,thresholdY,offsets={x:[0],y:[0]}){
 const sx=snapAxis(x,offsets.x,targets.x,thresholdX),sy=snapAxis(y,offsets.y,targets.y,thresholdY);
 return {x:Math.round(sx.value*10)/10,y:Math.round(sy.value*10)/10,guides:{x:sx.guide,y:sy.guide}};
}

// Overlapping items share one fixed-height row: each gets the first lane free at its start,
// and lanes are counted per overlapping group, so a lone item always keeps the full height.
export function assignLanes(items){
 const sorted=[...items].sort((a,b)=>a.start-b.start||a.end-b.end),result=new Map();
 let group=[],groupEnd=-Infinity;
 const close=()=>{const lanes=Math.max(1,...group.map(g=>result.get(g.id).lane+1));for(const g of group)result.get(g.id).lanes=lanes;group=[];};
 for(const item of sorted){
  if(item.start>=groupEnd&&group.length)close();
  const ends=[];for(const g of group){const r=result.get(g.id);ends[r.lane]=Math.max(ends[r.lane]??-Infinity,g.end);}
  let lane=0;while(ends[lane]!==undefined&&ends[lane]>item.start)lane++;
  result.set(item.id,{lane,lanes:1});group.push(item);groupEnd=Math.max(groupEnd,item.end);
 }
 if(group.length)close();
 return result;
}

export function timelineEdgeSpeed(x,left,right){
 const band=48,max=720;
 if(right-left<=band*2)return 0;
 if(x<left+band)return -max*Math.min(1,Math.max(0,(left+band-x)/band));
 if(x>right-band)return max*Math.min(1,Math.max(0,(x-right+band)/band));
 return 0;
}

// Stages, not percentages: workers report different units and restart per source.
export function aiProgress(previous,event={}){
 const steps=['Preparando sua edição…','Ouvindo o vídeo…','Analisando as cenas…','Preparando a edição…','Conferindo a proposta…'];
 const candidate=event.phase==='refinement'?4:({captions:1,transcribe:1,local:2,'vision-start':2,quality:2,frames:2,analysis:3,intent:0})[event.stage]??0;
 const step=Math.max(previous?.step??0,candidate),label=event.stage==='intent'&&step===0?'Interpretando seu pedido…':steps[step];if(candidate<step||!['analysis','intent'].includes(event.stage)||!Number.isFinite(event.elapsedMs)||event.elapsedMs<0)return {step,label:candidate<step?previous.label:label};const seconds=Math.floor(event.elapsedMs/1000);return {step,label:label.replace('…','')+' · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')};
}
// Long projects get a reusable overview; dense boundary evidence is requested only where the plan needs it.
export function analysisSamplingStep(project,clipId=null){
 const used=new Set(project.clips.filter(c=>!clipId||c.id===clipId).map(c=>c.assetId));
 const seconds=project.assets.filter(a=>used.has(a.id)).reduce((n,a)=>n+a.duration,0);
 return seconds<=45?.5:2;
}
// A long request runs as three reviewed proposals; each sees the montage with the previous ones applied.
export const EDIT_STAGES=[
 {name:'Cortes e ordem',kinds:['cut','order','speed','framing'],does:'cortes de fala e de cenas, pausas, ordem, velocidade e formato'},
 {name:'Imagens e sobreposições',kinds:['image','composition','framing','motion'],does:'sobreposições de imagem e vídeo, b-roll sobre a fala, zoom e enquadramento'},
 {name:'Textos e acabamento',kinds:['text','captions','color','transition','audio','motion','exports'],does:'textos e legendas, correção de cor e nitidez, transições, áudio e seleção de recortes para exportar'}];

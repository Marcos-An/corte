import {sliceClip} from './clip-slicing.mjs';
export function assertVisualAssemblyProject(p){
 if(!p.clips.length||p.clips.length>60)throw Error('A montagem visual aceita de 1 a 60 trechos de vídeo.');
 if(['music','textLayers','imageLayers','videoLayers','shapeLayers'].some(k=>p[k]?.length))throw Error('Esta montagem já tem camadas ou música. Use Híbrido para ajustar a edição existente; a montagem visual inicial não remove suas camadas.');
 if(p.clips.some(c=>c.freeze||p.assets.find(a=>a.id===c.assetId)?.kind==='image'))throw Error('Use vídeos em movimento para a montagem visual inicial.');
}
export function validateAssembly(p,shots){
 assertVisualAssemblyProject(p);if(!Array.isArray(shots)||!shots.length||shots.length>36)throw Error('Seleção visual inválida.');
 for(const [i,s]of shots.entries()){
  const c=p.clips.find(c=>c.id===s?.clipId);if(!c||Object.keys(s).some(k=>!['clipId','in','out','speed','transitionAfter','replayOf'].includes(k))||![s.in,s.out,s.speed].every(Number.isFinite)||s.in<c.in-1e-7||s.out>c.out+1e-7||s.out<=s.in||s.speed<.25||s.speed>4||!['cut','dissolve'].includes(s.transitionAfter)||(s.out-s.in)/s.speed-((i&&shots[i-1].transitionAfter==='dissolve'?.1:0)+(i<shots.length-1&&s.transitionAfter==='dissolve'?.1:0))<1.5-1e-7)throw Error('Um plano visual ultrapassa o trecho disponível ou é curto demais.');
  const previous=s.replayOf===null?null:shots[s.replayOf],exact=Number.isInteger(s.replayOf)&&s.replayOf>=0&&s.replayOf<i&&previous.clipId===s.clipId&&Math.abs(previous.in-s.in)<1e-7&&Math.abs(previous.out-s.out)<1e-7&&previous.speed===s.speed;
  if(s.replayOf!==null&&!exact)throw Error('Repetição visual sem referência válida.');
  if(shots.slice(0,i).some(t=>p.clips.find(c=>c.id===t.clipId).assetId===c.assetId&&Math.min(t.out,s.out)>Math.max(t.in,s.in)+1e-7)&&!exact)throw Error('A seleção repete imagens sem um replay explícito.');
 }return shots;
}
export function assembleVisual(p,shots){
 validateAssembly(p,shots);const q=structuredClone(p);q.clips=shots.map((s,i)=>{const source=p.clips.find(c=>c.id===s.clipId),head=i&&shots[i-1].transitionAfter==='dissolve'?.1*s.speed:0,tail=i<shots.length-1&&s.transitionAfter==='dissolve'?.1*s.speed:0,c=sliceClip(source,s.in+head,s.out-tail,'visual-'+i,{preserveFades:true});if(c.fadeWindow)c.fadeWindow.scale*=s.speed/(source.speed??1);c.speed=s.speed;return c;});
 q.transitions=shots.slice(0,-1).flatMap((s,i)=>s.transitionAfter==='dissolve'?[{leftId:q.clips[i].id,rightId:q.clips[i+1].id,type:'dissolve',duration:.2}]:[]);return q;
}

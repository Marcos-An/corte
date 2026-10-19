// Components anchored to what is said or shown, not to montage seconds the provider cannot know after its own cuts.
// An anchor names words of a clip's transcript or a stretch of its source; it is placed where that material plays.
import {planningLineage} from '../src/project.mjs';
import {clipDuration} from '../src/clip-time.mjs';
const ANCHORED=['place_blur','place_overlay','place_still','place_text','select_export_ranges'],RESHAPING=['insert_clip','move_range','trim','split','delete','move','remove_ranges','keep_ranges','adjust_ranges','adjust_timeline','freeze_frame'];
const fail=message=>{throw Error(message);};
function sourceSpan(project,anchor,transcripts){
 const clip=project.clips.find(c=>c.id===anchor?.clipId);if(!clip)fail(`Trecho ${anchor?.clipId} não encontrado para ancorar o componente.`);
 if('from' in anchor||'to' in anchor){
  const words=transcripts.find(t=>t.assetId===clip.assetId)?.words||[];
  if(!Number.isInteger(anchor.from)||!Number.isInteger(anchor.to)||anchor.from<0||anchor.to<anchor.from||anchor.to>=words.length)fail('Âncora inválida: palavras fora da transcrição deste trecho.');
  return {clip,start:words[anchor.from].start,end:words[anchor.to].end};
 }
 if(!Number.isFinite(anchor.sourceStart)||!Number.isFinite(anchor.sourceEnd)||anchor.sourceEnd<=anchor.sourceStart)fail('Âncora inválida: informe palavras {from,to} ou sourceStart < sourceEnd.');
 return {clip,start:anchor.sourceStart,end:anchor.sourceEnd};
}
// Only pieces descending from the anchored clip count, even when another clip shares the source.
function timelineSpan(run,span){
 const state=run.project,pieces=[];let t=0;
 for(const c of state.clips){if(!c.freeze&&run.origin(c.id)===span.clip.id&&c.in<span.end&&c.out>span.start)pieces.push({c,t});t+=clipDuration(c);}
 if(!pieces.length)fail('O trecho ancorado foi removido pelos cortes do plano.');
 for(let i=1;i<pieces.length;i++)if(Math.abs(pieces[i-1].t+clipDuration(pieces[i-1].c)-pieces[i].t)>1e-6||pieces[i].c.in<pieces[i-1].c.out-1e-6)fail('A fala ancorada foi separada ou reordenada. Use uma âncora por trecho contínuo.');
 const at=({c,t},s)=>t+(s-c.in)/(c.speed??1),first=pieces[0],last=pieces.at(-1);
 return {start:at(first,Math.max(span.start,first.c.in)),end:at(last,Math.min(span.end,last.c.out))};
}
export function resolveAnchoredOperations(project,result,transcripts=[]){
 const ops=result?.plan?.operations;if(!Array.isArray(ops))return result;
 const first=ops.findIndex(o=>ANCHORED.includes(o?.type));if(first<0)return result;
 if(ops.slice(first).some(o=>RESHAPING.includes(o?.type)||o?.type==='set_transition_at'&&o.makeRoom||o?.type==='update'&&'speed' in o))fail('Componentes ancorados e recortes devem vir depois de todos os cortes, movimentos e mudanças de velocidade.');
 const run=planningLineage(project,{...result.plan,operations:ops.slice(0,first)});
 const operations=ops.map(op=>{
  if(!ANCHORED.includes(op?.type))return op;
  if(op.type==='select_export_ranges'){
   if(Object.keys(op).some(k=>!['type','ranges'].includes(k))||!Array.isArray(op.ranges)||!op.ranges.length||op.ranges.length>20)fail('Seleção de recortes inválida.');
   return {type:'set_export_ranges',ranges:Array.from(op.ranges,r=>{
    if(!r||typeof r.reason!=='string'||!r.reason.trim()||r.reason.length>500||Object.keys(r).some(k=>!['id','name','from','to','reason','exportOptions'].includes(k)))fail('Candidato de recorte inválido.');
    const start=timelineSpan(run,sourceSpan(project,r.from,transcripts)).start,end=timelineSpan(run,sourceSpan(project,r.to,transcripts)).end;
    if(end-start<.1)fail('O fim do recorte precisa vir depois do início na montagem.');
    return {id:r.id,name:r.name,start,end,reason:r.reason,...(r.exportOptions!==undefined?{exportOptions:r.exportOptions}:{})};
   })};
  }
  const {start,end}=timelineSpan(run,sourceSpan(project,op.anchor,transcripts)),{id,x,y,width,rotation,opacity}=op.layer||{};
  if(op.type==='place_text')return {type:'add_text',layer:{id:op.layer?.id,text:op.layer?.text,start,end,style:op.layer?.style}};
  if(op.type==='place_blur')return {type:'add_blur',layer:{...op.layer,start,end}};
  const asset=project.assets.find(a=>a.id===op.layer?.assetId);if(!asset||asset.kind==='audio')fail('Mídia do componente não encontrada.');
  if(asset.kind==='image')return {type:'add_image',layer:{id,assetId:asset.id,start,end,x,y,width,rotation,opacity}};
  if(!Number.isFinite(op.layer.in)||op.layer.in<0||op.layer.in>=asset.duration||(op.type!=='place_still'&&op.layer.in+end-start>asset.duration+.000001))fail(`O trecho da fonte de ${id} não cabe na mídia: in + duração passa de ${asset.duration} s.`);
  return {type:'add_video',layer:{id,assetId:asset.id,in:op.layer.in,start,end,x,y,width,rotation,opacity,...(op.type==='place_still'?{freeze:true}:{})}};
 });
 return {...result,plan:{...result.plan,operations}};
}

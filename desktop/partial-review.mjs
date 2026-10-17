import {resolveSpeechOperations} from './speech-edit.mjs';import {resolveAnchoredOperations} from './timeline-anchors.mjs';import {validatePlan,applyPlan} from '../src/project.mjs';
const reshapes=op=>['trim','delete','move','move_range','insert_clip','keep_ranges','remove_ranges','remove_words','tighten_pauses','freeze_frame','adjust_ranges'].includes(op.type)||op.type==='update'&&'speed' in op;
const absolute=op=>['add_text','add_image','add_video','add_shape','set_keyframe','remove_keyframe','set_transition_at'].includes(op.type)||op.type==='edit_component'&&['start','end','in'].some(k=>k in op.patch)||op.type==='edit_audio'&&'start' in op.patch||op.type==='add_audio'&&op.track.start!==0||['move','move_range','insert_clip'].includes(op.type)&&op.index!==0;
// Only a proposal that already passed provider and executable-plan validation reaches this recovery path.
// Re-run source anchors after pruning cuts; never retain absolute timings calculated from a discarded montage.
export function recoverIndependentReview({project,result,transcripts,gaps,isSafe}){
 if(!result.sourceReview)return null;
 const raw=structuredClone(result.sourceReview),kept=[],changed=new Map();let changedTimeline=false;
 const normalize=operations=>{let r={plan:{...raw.plan,operations}};r=resolveSpeechOperations(project,r,transcripts,gaps);r=resolveAnchoredOperations(project,r,transcripts);validatePlan(project,r.plan);applyPlan(project,r.plan);return r.plan;};
 const acceptable=op=>{try{return isSafe(normalize([...kept.map(k=>k.op),op]));}catch{return false;}};
 for(const [i,original]of raw.plan.operations.entries()){
  let op=original,partial=false;
  if(['remove_ranges','remove_words'].includes(op.type)){
   const ranges=[];for(const range of op.ranges)if(acceptable({...op,ranges:[...ranges,range]}))ranges.push(range);
   partial=ranges.length!==op.ranges.length;op={...op,ranges};if(!ranges.length)op=null;
  }else if(!acceptable(op))op=null;
  if(!op||partial){changed.set(i,'Parte da alteração atinge fala sem tempos confiáveis ou depende de um trecho descartado.');if(reshapes(original))changedTimeline=true;}
  if(op)kept.push({i,op});
 }
 let accepted=changedTimeline?kept.filter(k=>{if(absolute(k.op)){changed.set(k.i,'Os tempos ou posições dependiam de cortes descartados; prepare novamente essa parte.');return false;}return true;}):kept;
 // Removing a timed component may also remove a later operation's target. Validate each remaining prefix again.
 const final=[];for(const k of accepted){try{const plan=normalize([...final.map(f=>f.op),k.op]);if(!isSafe(plan))throw Error();final.push(k);}catch{changed.set(k.i,'A alteração depende de uma operação descartada.');}}
 if(!final.length)return null;
 const indexes=new Map(final.map((k,i)=>[k.i,i]));
 const coverage=raw.coverage.map(item=>{
  const original=item.operationIndexes,operationIndexes=original.filter(i=>indexes.has(i)).map(i=>indexes.get(i));
  if(!original.some(i=>changed.has(i)||!indexes.has(i)))return {...item,operationIndexes};
  const reason=(item.reason.slice(0,700)+' '+[...new Set(original.map(i=>changed.get(i)).filter(Boolean))].join(' ')).slice(0,1000);
  return {...item,operationIndexes,status:operationIndexes.length?'partial':'pending',reason};
 });
 return {...raw,plan:{...raw.plan,operations:final.map(k=>k.op),summary:('Proposta parcial segura. '+raw.plan.summary).slice(0,4000)},coverage};
}

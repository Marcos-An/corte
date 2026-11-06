import {transcribeLocally} from './transcribe.mjs';import {speechHints} from './speech-edit.mjs';
import {validateProject,simulatePlan,validatePlan,planningLineage,duration} from '../src/project.mjs';
import {refinementTimes} from './local.mjs';
import {recoverIndependentReview} from './partial-review.mjs';
const withPendingWarning=(items=[],warning)=>[...new Set(items.filter(s=>s!==warning))].slice(0,39).concat(warning);
// A visual query from the overview is answered by local search before the final round, even without cut borders to inspect.
export async function refineVisualPlan({project,prompt,frames,request,signal,search=null,allowPreliminary=false,speechGaps=[]}){
 const check=()=>{if(signal?.aborted)throw new Error('Análise cancelada.');};check();
 const first=await request(frames,{phase:'overview'});check();
 if(first.plan.questions?.length||first.plan.unsupported?.length)return {...first,rounds:1};
 validatePlan(project,first.plan);simulatePlan(project,first.plan);
 const matched=search&&first.visualQueries?.length?balancedSearchEvidence(await search(first.visualQueries),30):[];check();
 const borders=refinementTimes(project,first.plan,frames,60);
 const contextFrames=[...new Set(frames.map(f=>f.assetId))].slice(0,12).map(id=>{const candidates=frames.filter(f=>f.assetId===id),middle=(Math.min(...candidates.map(f=>f.time))+Math.max(...candidates.map(f=>f.time)))/2;return candidates.sort((a,b)=>Math.abs(a.time-middle)-Math.abs(b.time-middle))[0];});
 const batches=[];
 // Finish each explicitly requested sequence. Sharing 48 slots across requests
 // and search hits reduced eight-second inspections to one-second fragments.
 const batchSize=Math.max(1,Math.floor((60-contextFrames.length)/17));
 const inspected=new Set(),searched=new Set((first.visualQueries||[]).map(q=>q.query.trim().toLowerCase()));
 const observed=new Map(),reviews=[];
 function remember(samples){for(const f of samples){const times=observed.get(f.assetId)||new Set();times.add(f.time);observed.set(f.assetId,times);}}
 remember(first.reviewFrames||frames);
 const alreadySeen=r=>{const samples=inspectionEvidence(project,[r],[],17);return samples.length>0&&samples.every(f=>[...(observed.get(f.assetId)||[])].some(t=>Math.abs(t-f.time)<=.125));};
 const maxBatches=12,maxFinishingBatches=4;let limited=false,finishingPasses=0;
 function enqueueInspections(requests=[]){
  const fresh=requests.filter(r=>{const key=JSON.stringify([r.clipId,r.start,r.end]);if(inspected.has(key)||alreadySeen(r))return false;inspected.add(key);return true;});
  for(let i=0;i<fresh.length;i+=batchSize){if(batches.length>=maxBatches){limited=true;break;}batches.push(inspectionEvidence(project,fresh.slice(i,i+batchSize),[],60-contextFrames.length));}
 }
 enqueueInspections(first.inspectionRequests);
 if(!batches.length){const candidates=inspectionEvidence(project,[],balancedSearchEvidence(matched,6),48);if(candidates.length||borders.length)batches.push(candidates.length?candidates:borders);}
 if(!batches.length&&first.durationTarget&&duration(simulatePlan(project,first.plan))>first.durationTarget+.01)batches.push(frames);
 const wantsTransitions=result=>result.coverage?.some(c=>c.kind==='transition'&&c.status!=='not_needed');
 if(!batches.length&&wantsTransitions(first))batches.push([]);
 if(!batches.length)return {...first,rounds:1};
 let current=first,totalFrames=0,rounds=1;
 const usage={};const addUsage=r=>{for(const [k,v]of Object.entries(r.usage||{}))if(typeof v==='number')usage[k]=(usage[k]||0)+v;};addUsage(first);
 let retries=first.validationRetries||0,durationRepair=false;
 const finished=new Set();let finishingCandidates=[];
 for(const [i,batch]of batches.entries()){
  const dense=[],seen=new Set();
  for(const f of [...contextFrames,...batch,...balancedSearchEvidence(matched,6),...borders,...frames]){
   const key=JSON.stringify([f.assetId,f.time]);if(dense.length<60&&!seen.has(key)){seen.add(key);dense.push(f);}
  }
  try{
   const scene=simulatePlan(project,current.plan);
   const refined=await request(dense,{phase:'refinement',inspectionContinues:i<batches.length-1,inspectionBatch:i+1,inspectionBatches:batches.length,remainingInspectionRounds:Math.max(0,maxBatches-i-1),inspectionHistory:[...observed].map(([assetId,times])=>({assetId,times:[...times].sort((a,b)=>a-b)})),previousReviews:reviews.slice(-4),preliminary:current.plan,preliminaryPending:current.pendingRequests||[],preliminaryTransitionDecisions:current.transitionDecisions||[],durationRepair,finishing:finishingCandidates.length>0,shortShots:scene.clips.filter(c=>(c.out-c.in)/(c.speed||1)<.4).map(c=>({assetId:c.assetId,start:c.in,end:c.out})),transitionCandidates:finishingCandidates,durationTarget:first.durationTarget??null,previousDuration:duration(scene)});check();
   if(!refined.plan.questions?.length&&!refined.plan.unsupported?.length){validatePlan(project,refined.plan);simulatePlan(project,refined.plan);}
   current=refined;rounds++;totalFrames+=dense.length;addUsage(refined);retries+=refined.validationRetries||0;
   remember(refined.reviewFrames||dense);reviews.push(refined.plan.summary);
   finishingCandidates=[];
   enqueueInspections(current.inspectionRequests);
   const queries=(current.visualQueries||[]).filter(q=>!searched.has(q.query.trim().toLowerCase()));
   if(search&&queries.length){
    if(batches.length<maxBatches){queries.forEach(q=>searched.add(q.query.trim().toLowerCase()));const hits=balancedSearchEvidence(await search(queries),30);check();matched.push(...hits);const evidence=inspectionEvidence(project,[],balancedSearchEvidence(hits,6),48);if(evidence.length)batches.push(evidence);}else limited=true;
   }
   if(i===batches.length-1&&wantsTransitions(first)){
    const evidence=finishingEvidence(project,current.plan,speechGaps,(current.transitionDecisions||[]).filter(d=>d.status==='pending').map(d=>d.index));
    const pending=evidence.junctions.filter(j=>!current.transitionDecisions?.some(d=>d.index===j.index&&d.status==='cut')&&!finished.has(JSON.stringify([j.index,j.left,j.right])));
    if(pending.length&&finishingPasses<maxFinishingBatches){finishingPasses++;finishingCandidates=pending.slice(0,Math.max(1,Math.floor((60-contextFrames.length)/6)));finishingCandidates.forEach(j=>finished.add(JSON.stringify([j.index,j.left,j.right])));batches.push(finishingCandidates.flatMap(j=>j.frames));}else if(pending.length)limited=true;
   }
   if(i===batches.length-1&&!durationRepair&&first.durationTarget&&duration(simulatePlan(project,current.plan))>first.durationTarget+.01){if(batches.length<maxBatches){durationRepair=true;batches.push(dense);}else limited=true;}
  }catch(error){
   check();if(!allowPreliminary||!['AI_TIMEOUT','AI_PROVIDER','AI_RATE_LIMIT','AI_REVIEW_INVALID'].includes(error.code))throw error;
   const warning='A conferência adicional de cenas e bordas não foi concluída. Esta é a proposta preliminar validada; revise os cortes antes de aplicar.';
   const pendingRequests=[...new Set(current.pendingRequests||[])];if(pendingRequests.length<40)pendingRequests.push(warning);
   return auditTransitions(project,{...current,pendingRequests,analysisWarnings:[warning],verification:'preliminary',rounds,refinementFailed:true,refinementFailure:{code:error.code,message:error.message.slice(0,1000)},usage},wantsTransitions(first));
  }
 }
 const measured=duration(simulatePlan(project,current.plan));
 if(limited){const warning='O limite de rodadas de inspeção foi atingido; ainda há verificações de cenas ou junções pendentes.';current={...current,pendingRequests:withPendingWarning(current.pendingRequests,warning),analysisWarnings:[...(current.analysisWarnings||[]),warning]};}
 current=auditTransitions(project,current,wantsTransitions(first));
 if(first.durationTarget&&measured>first.durationTarget+.01){
  const warning=`A montagem proposta tem ${measured.toFixed(2)} s e ainda excede a meta de ${first.durationTarget} s.`;
  current={...current,analysisWarnings:[...(current.analysisWarnings||[]),warning]};
 }
 return {...current,...(first.durationTarget?{durationTarget:first.durationTarget,durationCheck:{target:first.durationTarget,actual:measured,met:measured<=first.durationTarget+.01}}:{}),rounds,usage,validationRetries:retries,refinementFrames:totalFrames,...(matched.length?{searchMatches:matched.length}:{})};

}
export function finishingEvidence(project,plan,gaps=[],pendingIndexes=[]){
 const scene=simulatePlan(project,plan),junctions=[],frames=[];
 for(let i=0;i<scene.clips.length-1;i++){
  const left=scene.clips[i],right=scene.clips[i+1],existing=scene.transitions?.find(t=>t.leftId===left.id&&t.rightId===right.id),duration=existing?.duration||.4;
  if(existing&&!pendingIndexes.includes(i))continue;
  if([left,right].some(c=>(c.out-c.in)/(c.speed||1)<1))continue;
  const edges=[{clip:left,time:left.out,from:left.out-.2*(left.speed||1),to:left.out},{clip:right,time:right.in,from:right.in,to:right.in+.2*(right.speed||1)}];
  const uncertainSpeech=edges.some(e=>gaps.some(g=>g.assetId===e.clip.assetId&&g.start<e.to&&g.end>e.from));
  if(uncertainSpeech&&!existing)continue;
  const samples=[];
  for(const e of edges)for(const offset of [-.5,0,.5]){const time=Number((e.time+offset).toFixed(3));if(project.clips.some(c=>c.assetId===e.clip.assetId&&time>=c.in&&time<c.out))samples.push({assetId:e.clip.assetId,time});}
  junctions.push({index:i,duration,left:{assetId:left.assetId,out:left.out},right:{assetId:right.assetId,in:right.in},...(uncertainSpeech?{uncertainSpeech:true}:{}),frames:samples});frames.push(...samples);
 }
 return {junctions,frames};
}
export function auditTransitions(project,result,requested=result.coverage?.some(c=>c.kind==='transition'&&c.status!=='not_needed')){
 if(!requested)return result;
 const scene=simulatePlan(project,result.plan),total=Math.max(0,scene.clips.length-1),applied=scene.transitions?.length||0;
 const cleanCuts=(result.transitionDecisions||[]).filter(d=>d.status==='cut'&&!scene.transitions?.some(t=>t.leftId===scene.clips[d.index]?.id)).length;
 const pending=scene.clips.slice(0,-1).filter((c,index)=>{
  const decision=result.transitionDecisions?.find(d=>d.index===index);
  return decision?.status==='pending'||!scene.transitions?.some(t=>t.leftId===c.id)&&decision?.status!=='cut';
 }).length,transitionCheck={total,applied,cleanCuts,pending};
 if(!pending)return {...result,transitionCheck};
 const warning=`Acabamento parcial: ${applied} de ${total} junções têm transição; ${cleanCuts} têm corte direto justificado e ${pending} ainda precisam de decisão.`;
 const coverage=result.coverage?.map(c=>c.kind==='transition'?{...c,status:c.operationIndexes?.length?'partial':'pending',reason:warning}:c);
 return {...result,transitionCheck,coverage,pendingRequests:withPendingWarning(result.pendingRequests,warning)};
}
export function inspectionEvidence(project,requests,matches=[],max=48){
 const windows=requests.map(r=>({assetId:project.clips.find(c=>c.id===r.clipId)?.assetId,start:r.start,end:r.end}));
 for(const f of matches)windows.push({assetId:f.assetId,start:f.time-2,end:f.time+2,center:f});
 const sequences=windows.map(w=>{
  const sequence=[];
  if(!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.end<=w.start||w.end-w.start>8)return sequence;
  for(let t=w.start;t<=w.end+.000001;t+=.5){
   const time=Number(t.toFixed(3));
   if(project.clips.some(c=>c.assetId===w.assetId&&time>=c.in&&time<c.out))sequence.push({assetId:w.assetId,time,...(w.center?.time===time?w.center:{})});
  }
  const center=w.center?.time??(w.start+w.end)/2;
  return sequence.sort((a,b)=>Math.abs(a.time-center)-Math.abs(b.time-center)||a.time-b.time);
 });
 const result=[],seen=new Set();
 for(let i=0;result.length<max;i++){
  let available=false;for(const sequence of sequences){const f=sequence[i];if(!f)continue;available=true;const key=JSON.stringify([f.assetId,f.time]);if(result.length<max&&!seen.has(key)){seen.add(key);result.push(f);}}
  if(!available)break;
 }
 return result;
}
export function balancedSearchEvidence(matches,max=30){
 const groups=new Map();for(const f of matches){const key=f.match||'';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);}
 const result=[];for(let round=0;result.length<max;round++){let added=false;for(const group of groups.values()){if(group[round]&&result.length<max){result.push(group[round]);added=true;}}if(!added)break;}return result;
}
export function includedEvidence(project,frames){
 return frames.filter(f=>Number.isFinite(f.time)&&project.clips.some(c=>c.assetId===f.assetId&&f.time>=c.in&&f.time<c.out));
}
export function reuseEvidence(project,requested,available,tolerance=.125){
 const allowed=includedEvidence(project,available);
 return includedEvidence(project,requested).map(f=>{
  if(f.path)return f;
  const nearest=allowed.filter(a=>a.path&&a.assetId===f.assetId).sort((a,b)=>Math.abs(a.time-f.time)-Math.abs(b.time-f.time))[0];
  return nearest&&Math.abs(nearest.time-f.time)<=tolerance?{...f,time:nearest.time,path:nearest.path}:f;
 });
}
// Compare source coverage per original clip instance, including split/range-generated pieces.
// Applied as cumulative prefixes so an operation naming a clip reaches every piece of it, as applyPlan does. Pieces
// are compared by origin (ids are random per run), so another clip of the same source cannot hide an unsafe cut.
function preservesUncertainSpeech(project,plan,gaps,visualSelections=[]){
 if(!gaps.length)return true;
 for(let i=0;i<plan.operations.length;i++){
  const op=plan.operations[i];
  if(op.type==='keep_ranges'&&visualSelections.some(v=>v.clipId===op.clipId&&JSON.stringify(v.ranges)===JSON.stringify(op.ranges)))continue;
  const before=planningLineage(project,{...plan,operations:plan.operations.slice(0,i)}),after=planningLineage(project,{...plan,operations:plan.operations.slice(0,i+1)});
  const origin=before.origin(op.clipId);if(origin===undefined&&!(op.type==='set_transition_at'&&op.makeRoom))continue;
  const families=origin===undefined?before.project.clips:before.project.clips.filter(c=>before.origin(c.id)===origin);
  for(const familyClip of families){
  const family=[familyClip],pieces=after.project.clips.filter(c=>after.origin(c.id)===before.origin(familyClip.id)).sort((a,b)=>a.in-b.in);
  for(const clip of family)for(const gap of gaps.filter(g=>g.assetId===clip.assetId)){
   const start=Math.max(clip.in,gap.start),end=Math.min(clip.out,gap.end);if(end<=start)continue;let cursor=start;
   for(const piece of pieces){if(piece.out<=cursor)continue;if(piece.in>cursor+.000001)break;cursor=Math.max(cursor,piece.out);}
   if(cursor<end-.000001)return false;
  }
  }
 }return true;
}
export async function requestHybridEdit({project,prompt,shareEvidence,signal,onProgress=()=>{},transcribe=transcribeLocally,connected=async options=>(await import('./ai.mjs')).loginStatus(options.home).then(r=>r.connected),planRequest=async options=>(await import('./ai.mjs')).requestPlan(options),...options}){
 validateProject(project);if(typeof prompt!=='string'||!prompt.trim()||prompt.length>6000)throw Error('Escreva um pedido de até 6.000 caracteres.');
 const check=()=>{if(signal?.aborted)throw Error('Análise cancelada.');};check();
 if(shareEvidence!==true)throw Error('Autorize o envio da transcrição e de frames selecionados ao ChatGPT.');
 if(!await connected(options))throw Error('Conecte sua conta ChatGPT nas Configurações.');check();
 if(!project.clips.length)throw Error('Adicione um vídeo à timeline.');
 for(const c of project.clips)if(!options.registry?.get(c.assetId)?.path)throw Error('Mídia ausente. Relocalize antes da análise.');
 const withAudio=project.clips.some(c=>project.assets.find(a=>a.id===c.assetId)?.hasAudio);
 onProgress({stage:'hybrid',message:'Transcrevendo falas localmente antes de preparar a proposta…'});
 const raw=withAudio?await transcribe({project,signal,onProgress,...options,purpose:'edit'}):[];check();
 if(!Array.isArray(raw))throw Error('Transcrição local inválida.');
 const transcripts=[],speechGaps=[];
 for(const t of raw){
  const asset=project.assets.find(a=>a.id===t.assetId);if(!asset||!project.clips.some(c=>c.assetId===t.assetId))continue;
  if(!Array.isArray(t.words)||t.words.some(w=>typeof w.text!=='string'||w.text.length>500||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<0||w.end<=w.start||w.end>asset.duration+.001))throw Error('Transcrição local com tempos inválidos. Nenhuma evidência enviada.');
  if(t.gaps!==undefined&&(!Array.isArray(t.gaps)||t.gaps.length>10000))throw Error('Lacunas de reconhecimento inválidas.');
  for(const gap of t.gaps||[]){
   if(!Number.isFinite(gap.start)||!Number.isFinite(gap.end)||gap.start<0||gap.end<=gap.start||gap.end>asset.duration+.000001||gap.reason!=='unreliable-word-times')throw Error('Lacuna de reconhecimento com tempo inválido.');
   for(const clip of project.clips.filter(c=>c.assetId===asset.id)){const start=Math.max(clip.in,gap.start),end=Math.min(clip.out,gap.end);if(end>start)speechGaps.push({assetId:asset.id,start,end,reason:gap.reason});}
  }
  if(t.context!==undefined&&(!Array.isArray(t.context)||t.context.length>10000||t.context.some(c=>typeof c.text!=='string'||c.text.length>12000||!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start||c.end>asset.duration+.000001)))throw Error('Contexto de fala inválido.');
  if(t.pauses!==undefined&&(!Array.isArray(t.pauses)||t.pauses.length>20000||t.pauses.some(p=>!Number.isFinite(p.start)||!Number.isFinite(p.end)||p.start<0||p.end<=p.start||p.end>asset.duration+.000001)))throw Error('Pausas de fala inválidas.');
  const included=w=>project.clips.some(c=>c.assetId===t.assetId&&w.start>=c.in&&w.end<=c.out);
  const words=t.words.filter(included).map(({start,end,text,correctionId},i)=>({i,start,end,text,...(correctionId?{confirmed:true}:{})})),hints=speechHints(words);
  const pauses=[...new Map((t.pauses||[]).flatMap(p=>project.clips.filter(c=>c.assetId===t.assetId).map(c=>({start:Math.max(p.start,c.in),end:Math.min(p.end,c.out)}))).filter(p=>p.end-p.start>=.2).map(p=>[p.start+':'+p.end,p])).values()].sort((a,b)=>a.start-b.start);
  transcripts.push({assetId:t.assetId,words,...(t.pauses?{pauses}:{}),...(hints.length?{hints}:{}),...(t.context?{context:t.context.filter(included).map(({start,end,text})=>({start,end,text}))}:{})});
 }
 onProgress({stage:'hybrid',message:'Selecionando frames localmente e preparando plano com o ChatGPT…'});
 let result=await planRequest({...options,project,prompt,signal,onProgress,transcripts,speechGaps,review:true});check();
 validatePlan(project,result.plan);simulatePlan(project,result.plan);
 if(!Array.isArray(result.pendingRequests)||result.pendingRequests.length>40||result.pendingRequests.some(s=>typeof s!=='string'||s.length>2000))throw Error('Pendências da proposta inválidas.');
 let recovered=false;
 if(!preservesUncertainSpeech(project,result.plan,speechGaps,result.visualSelectionsVerified)){
  const candidate=recoverIndependentReview({project,result,transcripts,gaps:speechGaps,isSafe:plan=>preservesUncertainSpeech(project,plan,speechGaps,result.visualSelectionsVerified)});
  if(candidate){try{const {parseReviewPayload}=await import('./ai.mjs');const validated=parseReviewPayload(project,JSON.stringify(candidate),{transcripts,speechGaps,stage:options.stage,frames:result.reviewFrames});result={...result,...validated};recovered=true;}catch{}}
 }
 const safe=preservesUncertainSpeech(project,result.plan,speechGaps,result.visualSelectionsVerified),searchWarning=result.visualSearch==='unavailable'?['A busca visual por conteúdo não está instalada nesta versão; as cenas foram escolhidas pelas amostras gerais.']:[],analysisWarnings=speechGaps.length?[`A transcrição interna encontrou ${speechGaps.length} trecho(s) sem tempos confiáveis. A transcrição interna não cria legendas automaticamente. Cortes nesses trechos precisam de revisão.${safe?'':' A proposta contém remoções nesses trechos e não será aplicada, inclusive operações dependentes; prepare outra proposta preservando-os.'}`]:[];
 if(raw.some(t=>t.correctionWarnings?.length))analysisWarnings.push('Há correções manuais não aplicadas porque a mídia mudou ou não foi conferida. Revise as falas antes de depender dessas correções.');
 if(result.visualSelectionsVerified?.length&&speechGaps.length)analysisWarnings.push('A seleção editorial visual pode omitir cenas com tempos de fala incertos. Revise o áudio dos cortes; isso não equivale a confirmar palavras ou limpar hesitações.');
 if(recovered)analysisWarnings.push('Cortes incertos e operações dependentes foram retirados. As alterações independentes foram preservadas e as âncoras recalculadas; revise a proposta parcial.');
 const plan=safe?result.plan:{...result.plan,operations:[],summary:'Proposta preservada para revisão: não foi possível garantir os cortes nos trechos sem tempos de fala confiáveis.'};
 const coverage=safe?result.coverage:result.coverage?.map(item=>['planned','partial'].includes(item.status)?{...item,status:'pending',operationIndexes:[],reason:'Plano não aplicável: os cortes atingem fala sem tempos confiáveis; operações dependentes também foram preservadas.'}:item);
 const pendingRequests=safe?result.pendingRequests:[...new Set([...result.pendingRequests,...(coverage||[]).filter(c=>c.status==='pending').map(c=>`${c.request}: ${c.reason}`)])];
 if(result.durationCheck){
  const {target,actual:previousActual}=result.durationCheck,actual=duration(simulatePlan(project,plan));
  result.durationCheck={target,actual,met:actual<=target+.01};
  if(actual>target+.01&&Math.abs(actual-previousActual)>.01)analysisWarnings.push(`A montagem após a validação tem ${actual.toFixed(2)} s; a meta de ${target} s continua pendente.`);
 }
 return auditTransitions(project,{...result,...(coverage?{coverage}:{}),...(!safe?{transitionDecisions:[]}:{}),pendingRequests,plan,analysisWarnings:[...(result.analysisWarnings||[]),...analysisWarnings,...searchWarning],reviewRequired:true,mode:'hybrid',...(plan.operations.some(op=>op.type==='generate_captions')?{localCaptionEvidence:raw.map(({assetId,recognizer,words,gaps,language})=>({assetId,recognizer,words,gaps,language}))}:{}),shared:{transcriptWords:transcripts.reduce((n,t)=>n+t.words.length,0),frames:result.frames}});
}
export function selectOverview(project,candidates,max=60){
 if(!Number.isInteger(max)||max<1)throw Error('Orçamento de imagens inválido.');
 const regions=[];
 for(const c of [...project.clips].sort((a,b)=>a.assetId.localeCompare(b.assetId)||a.in-b.in)){
  const last=regions.at(-1);if(last?.assetId===c.assetId&&c.in<=last.end)last.end=Math.max(last.end,c.out);else regions.push({assetId:c.assetId,start:c.in,end:c.out});
 }
 if(regions.length>max)throw Error('Há mais regiões independentes do que o orçamento de imagens permite cobrir. Selecione um trecho menor; nenhuma região foi omitida silenciosamente.');
 const available=includedEvidence(project,candidates),result=[],seen=new Set();
 const add=f=>{const key=JSON.stringify([f.assetId,f.time]);if(result.length<max&&!seen.has(key)){seen.add(key);result.push(f);}};
 for(const r of regions){const middle=(r.start+r.end)/2,near=available.filter(f=>f.assetId===r.assetId&&f.time>=r.start&&f.time<r.end).sort((a,b)=>Math.abs(a.time-middle)-Math.abs(b.time-middle))[0];add(near||{assetId:r.assetId,time:middle});}
 for(let i=0;i<Math.min(max,available.length);i++)add(available[Math.round(i*(available.length-1)/Math.max(1,Math.min(max,available.length)-1))]);
 return result.sort((a,b)=>a.assetId.localeCompare(b.assetId)||a.time-b.time);
}

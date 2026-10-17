import {transcribeLocally} from './transcribe.mjs';import {speechHints} from './speech-edit.mjs';
import {validateProject,applyPlan,validatePlan,planLineage} from '../src/project.mjs';
import {refinementTimes} from './local.mjs';
import {recoverIndependentReview} from './partial-review.mjs';
// A visual query from the overview is answered by local search before the final round, even without cut borders to inspect.
export async function refineVisualPlan({project,prompt,frames,request,signal,search=null,allowPreliminary=false}){
 const check=()=>{if(signal?.aborted)throw new Error('Análise cancelada.');};check();
 const first=await request(frames,{phase:'overview'});check();
 if(first.plan.questions?.length||first.plan.unsupported?.length)return {...first,rounds:1};
 validatePlan(project,first.plan);applyPlan(project,first.plan);
 const matched=search&&first.visualQueries?.length?balancedSearchEvidence(await search(first.visualQueries),30):[];check();
 const dense=[...matched,...refinementTimes(project,first.plan,frames,60-matched.length)];
 if(!dense.length)return {...first,rounds:1};
 let refined;
 try{refined=await request(dense,{phase:'refinement',preliminary:first.plan,preliminaryPending:first.pendingRequests||[]});check();}
 catch(error){
  check();if(!allowPreliminary||!['AI_TIMEOUT','AI_PROVIDER','AI_RATE_LIMIT','AI_REVIEW_INVALID'].includes(error.code))throw error;
  const warning='A conferência adicional de cenas e bordas não foi concluída. Esta é a proposta preliminar validada; revise os cortes antes de aplicar.';
  const pendingRequests=[...new Set(first.pendingRequests||[])];if(pendingRequests.length<40)pendingRequests.push(warning);
  return {...first,pendingRequests,analysisWarnings:[warning],verification:'preliminary',rounds:1,refinementFailed:true};
 }
 if(!refined.plan.questions?.length&&!refined.plan.unsupported?.length){validatePlan(project,refined.plan);applyPlan(project,refined.plan);}
 const usage={};for(const result of [first,refined])for(const [k,v]of Object.entries(result.usage||{}))if(typeof v==='number')usage[k]=(usage[k]||0)+v;
 return {...refined,rounds:2,usage,validationRetries:(first.validationRetries||0)+(refined.validationRetries||0),refinementFrames:dense.length,...(matched.length?{searchMatches:matched.length}:{})};
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
function preservesUncertainSpeech(project,plan,gaps){
 if(!gaps.length)return true;
 for(let i=0;i<plan.operations.length;i++){
  const op=plan.operations[i],before=planLineage(project,{...plan,operations:plan.operations.slice(0,i)}),after=planLineage(project,{...plan,operations:plan.operations.slice(0,i+1)});
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
  const words=t.words.filter(included).map(({start,end,text},i)=>({i,start,end,text})),hints=speechHints(words);
  const pauses=[...new Map((t.pauses||[]).flatMap(p=>project.clips.filter(c=>c.assetId===t.assetId).map(c=>({start:Math.max(p.start,c.in),end:Math.min(p.end,c.out)}))).filter(p=>p.end-p.start>=.2).map(p=>[p.start+':'+p.end,p])).values()].sort((a,b)=>a.start-b.start);
  transcripts.push({assetId:t.assetId,words,...(t.pauses?{pauses}:{}),...(hints.length?{hints}:{}),...(t.context?{context:t.context.filter(included).map(({start,end,text})=>({start,end,text}))}:{})});
 }
 onProgress({stage:'hybrid',message:'Selecionando frames localmente e preparando plano com o ChatGPT…'});
 let result=await planRequest({...options,project,prompt,signal,onProgress,transcripts,speechGaps,review:true});check();
 validatePlan(project,result.plan);applyPlan(project,result.plan);
 if(!Array.isArray(result.pendingRequests)||result.pendingRequests.length>40||result.pendingRequests.some(s=>typeof s!=='string'||s.length>2000))throw Error('Pendências da proposta inválidas.');
 let recovered=false;
 if(!preservesUncertainSpeech(project,result.plan,speechGaps)){
  const candidate=recoverIndependentReview({project,result,transcripts,gaps:speechGaps,isSafe:plan=>preservesUncertainSpeech(project,plan,speechGaps)});
  if(candidate){try{const {parseReviewPayload}=await import('./ai.mjs');const validated=parseReviewPayload(project,JSON.stringify(candidate),{transcripts,speechGaps,stage:options.stage});result={...result,...validated};recovered=true;}catch{}}
 }
 const safe=preservesUncertainSpeech(project,result.plan,speechGaps),searchWarning=result.visualSearch==='unavailable'?['A busca visual por conteúdo não está instalada nesta versão; as cenas foram escolhidas pelas amostras gerais.']:[],analysisWarnings=speechGaps.length?[`A transcrição interna encontrou ${speechGaps.length} trecho(s) sem tempos confiáveis. Não foram criadas legendas. Cortes nesses trechos precisam de revisão.${safe?'':' A proposta contém remoções nesses trechos e não será aplicada, inclusive operações dependentes; prepare outra proposta preservando-os.'}`]:[];
 if(recovered)analysisWarnings.push('Cortes incertos e operações dependentes foram retirados. As alterações independentes foram preservadas e as âncoras recalculadas; revise a proposta parcial.');
 const plan=safe?result.plan:{...result.plan,operations:[],summary:'Proposta preservada para revisão: não foi possível garantir os cortes nos trechos sem tempos de fala confiáveis.'};
 const coverage=safe?result.coverage:result.coverage?.map(item=>['planned','partial'].includes(item.status)?{...item,status:'pending',operationIndexes:[],reason:'Plano não aplicável: os cortes atingem fala sem tempos confiáveis; operações dependentes também foram preservadas.'}:item);
 const pendingRequests=safe?result.pendingRequests:[...new Set([...result.pendingRequests,...(coverage||[]).filter(c=>c.status==='pending').map(c=>`${c.request}: ${c.reason}`)])];
 return {...result,...(coverage?{coverage}:{}),pendingRequests,plan,analysisWarnings:[...(result.analysisWarnings||[]),...analysisWarnings,...searchWarning],reviewRequired:true,mode:'hybrid',shared:{transcriptWords:transcripts.reduce((n,t)=>n+t.words.length,0),frames:result.frames}};
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

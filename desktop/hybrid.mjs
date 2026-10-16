import {transcribeLocally} from './transcribe.mjs';
import {validateProject,applyPlan,validatePlan} from '../src/project.mjs';
import {refinementTimes} from './local.mjs';
export async function refineVisualPlan({project,prompt,frames,request,signal}){
 const check=()=>{if(signal?.aborted)throw new Error('Análise cancelada.');};check();
 const first=await request(frames,{phase:'overview'});check();
 if(first.plan.questions?.length||first.plan.unsupported?.length)return {...first,rounds:1};
 validatePlan(project,first.plan);applyPlan(project,first.plan);
 const dense=refinementTimes(project,first.plan,frames,60);
 if(!dense.length)return {...first,rounds:1};
 const refined=await request(dense,{phase:'refinement',preliminary:first.plan,preliminaryPending:first.pendingRequests||[]});check();
 if(!refined.plan.questions?.length&&!refined.plan.unsupported?.length){validatePlan(project,refined.plan);applyPlan(project,refined.plan);}
 const usage={};for(const result of [first,refined])for(const [k,v]of Object.entries(result.usage||{}))if(typeof v==='number')usage[k]=(usage[k]||0)+v;
 return {...refined,rounds:2,usage,refinementFrames:dense.length};
}
export function includedEvidence(project,frames){
 return frames.filter(f=>Number.isFinite(f.time)&&project.clips.some(c=>c.assetId===f.assetId&&f.time>=c.in&&f.time<c.out));
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
 const raw=withAudio?await transcribe({project,signal,onProgress,...options}):[];check();
 if(!Array.isArray(raw))throw Error('Transcrição local inválida.');
 const transcripts=[];
 for(const t of raw){
  const asset=project.assets.find(a=>a.id===t.assetId);if(!asset||!project.clips.some(c=>c.assetId===t.assetId))continue;
  if(!Array.isArray(t.words)||t.words.some(w=>typeof w.text!=='string'||w.text.length>500||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<0||w.end<=w.start||w.end>asset.duration+.001))throw Error('Transcrição local com tempos inválidos. Nenhuma evidência enviada.');
  transcripts.push({assetId:t.assetId,words:t.words.filter(w=>project.clips.some(c=>c.assetId===t.assetId&&w.start>=c.in&&w.end<=c.out)).map(({start,end,text})=>({start,end,text}))});
 }
 onProgress({stage:'hybrid',message:'Selecionando frames localmente e preparando plano com o ChatGPT…'});
 const result=await planRequest({...options,project,prompt,signal,onProgress,transcripts,review:true});check();
 validatePlan(project,result.plan);applyPlan(project,result.plan);
 if(!Array.isArray(result.pendingRequests)||result.pendingRequests.length>40||result.pendingRequests.some(s=>typeof s!=='string'||s.length>2000))throw Error('Pendências da proposta inválidas.');
 return {...result,reviewRequired:true,mode:'hybrid',shared:{transcriptWords:transcripts.reduce((n,t)=>n+t.words.length,0),frames:result.frames}};
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

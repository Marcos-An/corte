import {speechLanguage} from '../src/speech-language.mjs';
import {applyPlan,simulatePlan,validatePlan} from '../src/project.mjs';
import {captionTracks,assertCaptionProviderPlan} from '../src/caption-plan.mjs';
import {captionEntries} from '../src/captions.mjs';
import {generateLocalCaptions} from './local-captions.mjs';
import {groupCaptionTokens} from '../src/caption-timing.mjs';
function reusableSpeech(project,source,evidence){
 if(source!=='original'||!Array.isArray(evidence))return null;
 const used=new Set(captionTracks(project,source).map(c=>c.assetId)),assets=project.assets.filter(a=>a.hasAudio&&used.has(a.id));
 try{return assets.map(a=>{const t=evidence.find(t=>t.assetId===a.id);if(!t||speechLanguage({speechLanguage:t.language})!==speechLanguage(project)||typeof t.recognizer!=='string'||!Array.isArray(t.gaps)||t.gaps.length)throw Error();return {assetId:a.id,provider:'local',language:speechLanguage(project),model:t.recognizer,words:groupCaptionTokens(t.words,a.duration)};});}catch{return null;}
}
// Recognition happens locally before review. Only measured transcripts enter an executable plan.
export async function prepareCaptionProposal(options,result,{generate=generateLocalCaptions}={}){
 const {project,signal,onProgress=()=>{}}=options;
 const {localCaptionEvidence,...publicResult}=result;result=publicResult;
 assertCaptionProviderPlan(result.plan);
 if(!result.plan.operations?.some(op=>op.type==='generate_captions'))return result;
 validatePlan(project,result.plan);simulatePlan(project,result.plan);
 const operations=[],indexes=new Map(),failed=new Map(),notes=[];let generated=false;
 for(const [index,op] of result.plan.operations.entries()){
  signal?.throwIfAborted();
  if(op.type!=='generate_captions'){indexes.set(index,operations.length);operations.push(op);continue;}
  try{
   const context=simulatePlan(project,{...result.plan,operations:[...operations,op]});
   onProgress({stage:'hybrid',message:'Preparando legendas neste computador para revisão…'});
   const reused=reusableSpeech(context,op.source,localCaptionEvidence),all=reused??await generate({...options,project:context}),used=new Set(captionTracks(context,op.source).map(c=>c.assetId));signal?.throwIfAborted();
   const prepared={...op,transcripts:all.filter(t=>used.has(t.assetId)&&context.assets.some(a=>a.id===t.assetId&&a.hasAudio))};
   applyPlan(project,{...result.plan,operations:[...operations,prepared]});
   indexes.set(index,operations.length);operations.push(prepared);generated=true;
  }catch(error){
   if(signal?.aborted)throw error;
   // Do not expose recognizer paths/raw errors or discard independent edits when recognition fails.
   const message='Não foi possível preparar as legendas locais. As outras alterações continuam disponíveis; tente gerar as legendas novamente.';
   failed.set(index,message);notes.push(message);
  }
 }
 signal?.throwIfAborted();
 const plan={...result.plan,operations,...(failed.size?{summary:('Proposta parcial. '+result.plan.summary).slice(0,4000)}:{})},next=applyPlan(project,plan);
 const coverage=result.coverage?result.coverage.map(item=>{const original=item.operationIndexes,operationIndexes=original.filter(i=>indexes.has(i)).map(i=>indexes.get(i));return original.some(i=>failed.has(i))?{...item,operationIndexes,status:operationIndexes.length?'partial':'pending',reason:notes[0]}:{...item,operationIndexes};}):failed.size?[{request:'Gerar legendas locais',kind:'captions',status:'pending',operationIndexes:[],reason:notes[0]}]:undefined;
 const entries=generated?captionEntries(next):[];
 return {...result,plan,...(coverage?{coverage}:{}),mode:'hybrid',reviewRequired:true,
  pendingRequests:[...new Set([...(result.pendingRequests||[]),...(coverage||[]).filter(c=>['partial','pending'].includes(c.status)).map(c=>`${c.request}: ${c.reason}`)])],
  localCaptions:{prepared:generated,source:result.plan.operations.find(op=>op.type==='generate_captions').source,count:entries.length,preview:entries.slice(0,20).map(({start,end,text})=>({start,end,text}))},
  analysisRoute:result.analysisRoute==='metadata'?'metadata+local-captions':result.analysisRoute};
}

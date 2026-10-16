import {Worker} from 'node:worker_threads';
import {validateProject} from '../src/project.mjs';
import {modelPath,accurateSpeechModel} from './local.mjs';import {runIsolated} from './visual-process.mjs';import {verify} from './models-store.mjs';
// The accurate model (~1.1 GB) is hashed once per session; a corrupted copy is skipped in favour of the bundled model.
const checked=new Map();
export async function readyAccurateSpeechModel(){
 const found=await accurateSpeechModel();if(!found)return null;
 if(!checked.has(found.path))checked.set(found.path,verify(found.path,found.manifest).then(()=>true,()=>false));
 return await checked.get(found.path)?found:null;
}
export async function transcribeLocally({project,registry,signal,onProgress=()=>{},purpose='captions'}){
 if(!['captions','edit'].includes(purpose))throw Error('Finalidade da transcrição inválida.');if(signal?.aborted)throw new Error('Transcrição cancelada.');validateProject(project);
 const used=new Set(project.clips.map(c=>c.assetId));const assets=project.assets.filter(a=>used.has(a.id)&&a.hasAudio);
 if(!assets.length)throw new Error('Não há áudio na timeline para legendar.');
 for(const a of assets)if(!registry.get(a.id)?.path)throw new Error('Mídia ausente.');
 const accurate=await readyAccurateSpeechModel();
 if(accurate)return (await runIsolated({entry:new URL('./speech-child.mjs',import.meta.url),worker:'speech',backend:process.platform==='win32'?'dml':'cpu',signal,onProgress,
  startError:'Não foi possível iniciar a transcrição local.',crashError:'A transcrição local foi interrompida. O editor continua aberto; tente novamente.',
  data:{models:accurate.path,manifest:null,speechModel:accurate.manifest.model,purpose,assets:assets.map(a=>({...a,file:registry.get(a.id).path}))}})).transcripts;
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./transcribe-worker.mjs',import.meta.url),{workerData:{models:modelPath(),purpose,assets:assets.map(a=>({...a,file:registry.get(a.id).path}))}});let settled=false,outcome='error';
  const finish=(error,result)=>{if(settled)return;outcome=signal?.aborted?'canceled':error?'error':'ok';settled=true;signal?.removeEventListener('abort',cancel);worker.terminate();error?reject(error):resolve(result);};
  onProgress({stage:'worker-diagnostic',event:'worker-start',worker:'speech',processType:'speech',backend:'cpu'});
  const cancel=()=>worker.postMessage({cancel:true});signal?.addEventListener('abort',cancel,{once:true});
  worker.on('message',m=>{if(m.progress)onProgress(m.progress);else if(m.error){onProgress({stage:'worker-diagnostic',event:'worker-error',worker:'speech',processType:'speech'});finish(new Error(m.error));}else if(m.result)finish(null,m.result);});
  worker.on('error',error=>{onProgress({stage:'worker-diagnostic',event:'worker-error',worker:'speech',processType:'speech',errorCode:error.code,errorName:error.name});finish(new Error('Não foi possível iniciar a transcrição local.'));});worker.on('exit',code=>{onProgress({stage:'worker-diagnostic',event:'worker-exit',worker:'speech',processType:'speech',exitCode:code,outcome});if(!settled)finish(new Error('Transcrição interrompida.'));});
 });
}

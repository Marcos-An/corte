import {Worker} from 'node:worker_threads';
import {validateProject} from '../src/project.mjs';
import {modelPath} from './local.mjs';
export async function transcribeLocally({project,registry,signal,onProgress=()=>{}}){
 if(signal?.aborted)throw new Error('Transcrição cancelada.');validateProject(project);
 const used=new Set(project.clips.map(c=>c.assetId));const assets=project.assets.filter(a=>used.has(a.id)&&a.hasAudio);
 if(!assets.length)throw new Error('Não há áudio na timeline para legendar.');
 for(const a of assets)if(!registry.get(a.id)?.path)throw new Error('Mídia ausente.');
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./transcribe-worker.mjs',import.meta.url),{workerData:{models:modelPath(),assets:assets.map(a=>({...a,file:registry.get(a.id).path}))}});let settled=false;
  const finish=(error,result)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);worker.terminate();error?reject(error):resolve(result);};
  const cancel=()=>worker.postMessage({cancel:true});signal?.addEventListener('abort',cancel,{once:true});
  worker.on('message',m=>{if(m.progress)onProgress(m.progress);else if(m.error)finish(new Error(m.error));else if(m.result)finish(null,m.result);});
  worker.on('error',()=>finish(new Error('Não foi possível iniciar a transcrição local.')));worker.on('exit',()=>{if(!settled)finish(new Error('Transcrição interrompida.'));});
 });
}

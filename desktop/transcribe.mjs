import {validateProject} from '../src/project.mjs';
import {modelPath,accurateSpeechModel} from './local.mjs';import {runIsolated} from './visual-process.mjs';import {verify} from './models-store.mjs';
import {cachedEvidence} from './analysis-cache.mjs';
import {readFile,mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';
// The accurate model (~1.1 GB) is hashed once per session; a corrupted copy is skipped in favour of the bundled model.
const checked=new Map();
export async function readyAccurateSpeechModel(){
 const found=await accurateSpeechModel();if(!found)return null;
 if(!checked.has(found.path))checked.set(found.path,verify(found.path,found.manifest).then(()=>true,()=>false));
 return await checked.get(found.path)?found:null;
}
export async function transcribeLocally({project,registry,cache,signal,onProgress=()=>{},purpose='captions'}){
 if(!['captions','edit'].includes(purpose))throw Error('Finalidade da transcrição inválida.');if(signal?.aborted)throw new Error('Transcrição cancelada.');validateProject(project);
 const tracks=purpose==='captions'&&project.captionSource==='narration'?(project.music||[]).filter(c=>c.role==='narration'):project.clips;
 const used=new Set(tracks.map(c=>c.assetId));const assets=project.assets.filter(a=>used.has(a.id)&&a.hasAudio);
 if(!assets.length)throw new Error('Não há áudio na timeline para legendar.');
 for(const a of assets)if(!registry.get(a.id)?.path)throw new Error('Mídia ausente.');
 const accurate=await readyAccurateSpeechModel();
 const sources=assets.map(a=>({...a,file:registry.get(a.id).path}));
 const configuration={version:purpose==='captions'?2:1,purpose,model:accurate?.manifest||(cache?await readFile(path.join(modelPath(),'manifest.json'),'utf8'):null)};
 return cachedEvidence({root:cache&&path.join(cache,'local-evidence'),kind:'speech',assets:sources,configuration,signal,
  onHit:()=>onProgress({stage:'captions',completed:assets.length,total:assets.length,cached:true}),compute:async()=>{
 const temporaryDirectory=await mkdtemp(path.join(tmpdir(),'corte-speech-job-'));try{return (await runIsolated({entry:new URL('./speech-child.mjs',import.meta.url),worker:'speech',backend:accurate&&process.platform==='win32'?'dml':'cpu',signal,onProgress,
  startError:'Não foi possível iniciar a transcrição local.',crashError:'A transcrição local foi interrompida. O editor continua aberto; tente novamente.',
  data:{models:accurate?.path||modelPath(),manifest:null,...(accurate?{speechModel:accurate.manifest.model}:{}),purpose,assets:sources,temporaryDirectory}})).transcripts;}finally{await rm(temporaryDirectory,{recursive:true,force:true});}
 }});
}

import {workerData,parentPort} from 'node:worker_threads';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';
import {env,pipeline} from '@huggingface/transformers';import {run,binaries} from './media.mjs';import {normalizeRecognition} from '../src/captions.mjs';import {normalizeEditRecognition,speechWindows,mergeSpeechWindow} from './edit-transcript.mjs';
const {models,assets,purpose='captions'}=workerData;let pipe,temp,response;const abort=new AbortController();parentPort.on('message',m=>{if(m.cancel)abort.abort();});
try{
 env.allowRemoteModels=false;env.localModelPath=models;env.useFSCache=false;env.useBrowserCache=false;
 parentPort.postMessage({progress:{stage:'captions',completed:0,total:assets.length}});
 pipe=await pipeline('automatic-speech-recognition','onnx-community/whisper-small_timestamped',{dtype:'q8',device:'cpu',local_files_only:true});
 temp=await mkdtemp(path.join(tmpdir(),'corte-captions-'));const transcripts=[];
 for(const asset of assets){abort.signal.throwIfAborted();const merged={words:[],gaps:[],context:[]};
  for(const window of speechWindows(asset.duration)){abort.signal.throwIfAborted();const {offset,length}=window,file=path.join(temp,'audio.pcm');
   await run(binaries().ffmpeg,['-y','-ss',String(offset),'-i',asset.file,'-t',String(length),'-vn','-ar','16000','-ac','1','-f','f32le',file],{signal:abort.signal});
   const b=await readFile(file),samples=new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));let power=0;for(const s of samples)power+=s*s;
   if(samples.length&&Math.sqrt(power/samples.length)>.001){const result=await pipe(samples,{language:'portuguese',task:'transcribe',return_timestamps:'word'});mergeSpeechWindow(merged,purpose==='edit'?normalizeEditRecognition(result,length):{words:normalizeRecognition(result,length),gaps:[]},window);}
   parentPort.postMessage({progress:{stage:'captions',completed:Math.min(window.to,asset.duration),total:asset.duration,asset:asset.name}});
  }
  transcripts.push({assetId:asset.id,words:merged.words,...(purpose==='edit'?{gaps:merged.gaps,...(merged.context.length?{context:merged.context}:{})}:{})});
 }
 response={result:transcripts};
}catch(error){response={error:abort.signal.aborted?'Transcrição cancelada.':error.message};}finally{await pipe?.dispose();if(temp)await rm(temp,{recursive:true,force:true});}
parentPort.postMessage(abort.signal.aborted?{error:'Transcrição cancelada.'}:response);

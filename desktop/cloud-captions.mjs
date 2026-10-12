import path from 'node:path';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {validateTranscript} from '../src/captions.mjs';
import {validateProject} from '../src/project.mjs';
import {binaries,run,probe} from './media.mjs';
export const captionModel='gpt-4o-transcribe-diarize';
export function normalizeCloudTranscript(result,duration){
 if(!Array.isArray(result?.segments))throw new Error('A API não retornou legendas com tempos válidos.');
 const words=result.segments.filter(s=>typeof s.text==='string'&&s.text.trim()).map(s=>({start:s.start,end:s.end,text:s.text.trim()}));
 validateTranscript({assetId:'cloud',words},duration);return words;
}
export async function transcribeAudio({key,audio,duration,audioDuration=duration,signal,fetcher=fetch,wordTiming=false}){
 if(!key)throw new Error('Cadastre uma chave OpenAI nas configurações.');
 const form=new FormData();form.set('file',new Blob([audio],{type:'audio/mpeg'}),'audio.mp3');form.set('model',captionModel);form.set('response_format','diarized_json');form.set('chunking_strategy','auto');if(wordTiming){form.set('model','whisper-1');form.set('response_format','verbose_json');form.delete('chunking_strategy');form.set('timestamp_granularities[]','word');}
 let response;try{response=await fetcher('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(240000)])});}catch{throw new Error(signal?.aborted?'Transcrição cancelada.':'Falha de conexão ou tempo excedido. Tente novamente.');}
 if(!response.ok)throw new Error(response.status===401?'Chave OpenAI inválida. Atualize nas configurações.':response.status===429?'Limite ou créditos da API atingidos. Confira o faturamento OpenAI.':'A API não concluiu a transcrição. Nenhuma legenda foi alterada.');
 let result;try{result=await response.json();}catch{throw new Error('Resposta inválida da API.');}return wordTiming?normalizeWordTranscript(result,duration,audioDuration):normalizeCloudTranscript(result,duration);
}
export function captionEstimate(p){validateProject(p);const used=new Set((p.captionSource==='narration'?(p.music||[]).filter(c=>c.role==='narration'):p.clips).map(c=>c.assetId));const existing=new Set((p.transcripts||[]).filter(t=>t.provider==='openai'&&t.model===modelFor(p)).map(t=>t.assetId));const assets=p.assets.filter(a=>used.has(a.id)&&a.hasAudio&&!existing.has(a.id));const seconds=assets.reduce((n,a)=>n+a.duration,0);return {seconds,assets:assets.length,estimatedUSD:seconds/60*.006};}
export async function transcribeCloud({project,registry,key,cache,signal,onProgress=()=>{},fetcher=fetch}){
 validateProject(project);if(signal?.aborted)throw new Error('Transcrição cancelada.');
 const used=new Set((project.captionSource==='narration'?(project.music||[]).filter(c=>c.role==='narration'):project.clips).map(c=>c.assetId)),existing=project.transcripts||[],assets=project.assets.filter(a=>used.has(a.id)&&a.hasAudio&&!existing.some(t=>t.assetId===a.id&&t.provider==='openai'&&t.model===modelFor(project)));
 if(!project.assets.some(a=>used.has(a.id)&&a.hasAudio))throw new Error('Não há áudio na timeline para legendar.');
 if(!assets.length)return structuredClone(existing);if(!key)throw new Error('Cadastre uma chave OpenAI nas configurações.');
 for(const a of assets){if(!registry.get(a.id)?.path)throw new Error('Mídia ausente.');if(a.duration>1800)throw new Error('Nesta versão, gere legendas de arquivos de até 30 minutos.');}
 const temp=await mkdtemp(path.join(cache,'captions-api-'));const transcripts=structuredClone(existing.filter(t=>!assets.some(a=>a.id===t.assetId)));
 try{for(const [i,a] of assets.entries()){
  onProgress({stage:'transcribe',completed:i,total:assets.length});const file=path.join(temp,'audio.mp3');
  await run(binaries().ffmpeg,['-hide_banner','-loglevel','error','-y','-i',registry.get(a.id).path,'-vn','-ac','1','-ar','16000','-b:a','48k',file],{signal});
  const audio=await readFile(file);if(audio.length>25*1024*1024)throw new Error('Áudio excede o limite de envio.');
  const {duration:audioDuration}=await probe(file);
  const words=await transcribeAudio({key,audio,duration:a.duration,audioDuration,signal,fetcher,wordTiming:modelFor(project)==='whisper-1'});if(signal?.aborted)throw new Error('Transcrição cancelada.');transcripts.push({assetId:a.id,words,provider:'openai',model:modelFor(project)});
 }return transcripts;}finally{await rm(temp,{recursive:true,force:true});}
}

const modelFor=()=> 'whisper-1';
export function normalizeWordTranscript(result,duration,audioDuration=duration){
 if(!Array.isArray(result?.words)||result.words.length>100000)throw Error('A transcrição não trouxe tempos por palavra válidos.');
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(audioDuration)||audioDuration<=0)throw Error('Duração do áudio inválida.');
 // MP3 padding is measured, not guessed; allow only 20 ms more for timestamp rounding.
 const limit=Math.max(duration,audioDuration)+.02,tokens=[];let previous=0;
 for(const [i,w] of result.words.entries()){
  const invalid=reason=>{throw Error(`A API retornou a palavra ${i+1} com ${reason}. Nenhuma legenda foi alterada.`);};
  if(typeof w?.word!=='string')invalid('texto ausente ou de tipo incorreto');
  const text=w.word.trim();if(!text)continue;
  if(text.length>500||/[\u0000-\u0008\u000b-\u001f]/.test(text))invalid('texto fora dos limites permitidos');
  if(!Number.isFinite(w.start)||!Number.isFinite(w.end))invalid('tempo ausente ou não numérico');
  if(w.start<0||w.end<w.start)invalid('intervalo invertido ou negativo');
  if(w.start<previous)invalid('início fora de ordem');
  if(w.end>limit+.000001)invalid(`fim ${w.end.toFixed(3)} s além do limite do áudio (${limit.toFixed(3)} s)`);
  previous=w.start;tokens.push({text,start:Math.min(w.start,duration),end:Math.min(w.end,duration)});
 }
 validateTranscript({assetId:'words',words:tokens},duration,true);
 const phrases=[];let group=[];
 const flush=()=>{
  if(!group.some(w=>w.end>w.start))return;
  const text=group.map(w=>w.text).join(' ');
  if(text.length>500||group.length>500)throw Error('A API retornou um trecho longo sem tempos suficientes para separar as palavras.');
  phrases.push({text,start:group[0].start,end:group.reduce((end,w)=>Math.max(end,w.end),0),tokens:group});group=[];
 };
 for(const [i,w] of tokens.entries()){
  if(group.length&&w.end>w.start&&(group.length>=6||group.map(t=>t.text).join(' ').length+w.text.length>38||w.start-group.at(-1).end>.65))flush();
  group.push(w);const next=tokens[i+1];if(/[.!?]$/.test(w.text)&&(!next||next.end>next.start))flush();
 }
 flush();if(group.length)throw Error('A API retornou palavras sem duração utilizável. Nenhuma legenda foi alterada.');
 validateTranscript({assetId:'words',words:phrases},duration);return phrases;
}

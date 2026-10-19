import {speechLanguage} from '../src/speech-language.mjs';
import {validateProject} from '../src/project.mjs';
import {validateTranscript} from '../src/captions.mjs';
import {transcribeLocally} from './transcribe.mjs';
import {captionTracks} from '../src/caption-plan.mjs';
export async function generateLocalCaptions(options,{transcribe=transcribeLocally}={}){
 const {project,signal}=options;validateProject(project);signal?.throwIfAborted();
 const tracks=captionTracks(project,project.captionSource||'original');
 const used=new Set(tracks.map(c=>c.assetId)),assets=project.assets.filter(a=>used.has(a.id)&&a.hasAudio);
 if(!assets.length)throw Error('Não há áudio na voz escolhida para legendar.');
 const generated=await transcribe({...options,purpose:'captions'});signal?.throwIfAborted();
 if(!Array.isArray(generated)||generated.length!==assets.length||new Set(generated.map(t=>t?.assetId)).size!==assets.length)throw Error('A transcrição local retornou um conjunto incompleto de legendas.');
 for(const t of generated){const a=assets.find(a=>a.id===t?.assetId);if(!a)throw Error('A transcrição retornou uma mídia fora da voz escolhida.');if(speechLanguage({speechLanguage:t.language})!==speechLanguage(project))throw Error('O reconhecimento retornou outro idioma. Gere as legendas novamente.');validateTranscript(t,a.duration);}
 return [...structuredClone((project.transcripts||[]).filter(t=>!assets.some(a=>a.id===t.assetId))),...structuredClone(generated)];
}

import {clipSpeed,montageTime,sourceTime} from './clip-time.mjs';
import {splitCaptionWords} from './captions.mjs';
import {validateProject,clipAt} from './project.mjs';
function wordsFor(p,c){return splitCaptionWords(c.captionWords??p.transcripts?.find(t=>t.assetId===c.assetId)?.words??[]);}
export function editCaption(p,entry,patch){
 const q=structuredClone(p),c=[...q.clips,...q.music||[]].find(c=>c.id===entry.clipId);
 if(!c)throw Error('Trecho da legenda não encontrado.');
 c.captionWords=structuredClone(wordsFor(q,c));const w=c.captionWords[entry.wordIndex];
 if(!w)throw Error('Legenda não encontrada.');
 if(patch===null)c.captionWords.splice(entry.wordIndex,1);
 else{
  const offset=entry.start-montageTime(c,Math.max(w.start,c.in));
  const next={...w,...patch};if(patch.place===null)delete next.place;
  if('start' in patch)next.start=sourceTime(c,patch.start-offset);
  if('end' in patch)next.end=sourceTime(c,patch.end-offset);
  if(('start'in patch||'end'in patch)&&((next.end-next.start)/clipSpeed(c)<.1-1e-9||next.start<c.in||next.end>c.out||c.captionWords.some((v,i)=>i!==entry.wordIndex&&next.start<v.end&&next.end>v.start)))throw Error('Mantenha a legenda dentro do trecho, sem sobrepor outra.');
  if(next.tokens){if('text' in patch&&patch.text.trim().split(/\s+/).length===next.tokens.length)next.tokens=next.tokens.map((t,i)=>({...t,text:patch.text.trim().split(/\s+/)[i]}));
   if(('text' in patch&&patch.text.trim().split(/\s+/).length!==next.tokens.length)||Math.abs((next.end-next.start)-(w.end-w.start))>.00001)delete next.tokens;else{const delta=next.start-w.start;next.tokens=next.tokens.map(t=>({...t,start:t.start+delta,end:t.end+delta}));}}
  c.captionWords[entry.wordIndex]=next;c.captionWords.sort((a,b)=>a.start-b.start);
 }
 return validateProject(q);
}
export function addCaptionAt(p,time){
 const q=structuredClone(p);
 const found=p.captionSource==='narration'?(()=>{const c=q.music?.find(c=>c.role==='narration'&&time>=c.start&&time<c.start+c.out-c.in);return c?{clip:c,sourceTime:c.in+time-c.start}:null;})():clipAt(q,time);
 if(!found)throw Error('Posicione o cursor sobre um trecho com a voz escolhida.');
 const c=found.clip,start=found.sourceTime;c.captionWords=structuredClone(wordsFor(q,c));
 if(c.captionWords.some(w=>start>=w.start&&start<w.end))throw Error('Posicione o cursor num espaço sem legenda ou ajuste uma borda.');
 const end=Math.min(c.out,start+2*clipSpeed(c),...c.captionWords.filter(w=>w.start>start).map(w=>w.start));
 if((end-start)/clipSpeed(c)<.1)throw Error('Não há espaço para outra legenda aqui.');
 c.captionWords.push({start,end,text:'Nova legenda'});c.captionWords.sort((a,b)=>a.start-b.start);
 return validateProject(q);
}
export function alignCaptions(p){
 const q=structuredClone(p);
 for(const c of [...q.clips,...q.music||[]])for(const w of c.captionWords||[])delete w.place;
 return validateProject(q);
}

import {clipDuration,montageTime} from './clip-time.mjs';import {validateTranscript} from './captions.mjs';
// Review uses measured units as supplied. A multi-word recognizer chunk stays one unit.
export function speechReviewEntries(project,transcripts){
 if(!Array.isArray(transcripts))throw Error('Falas inválidas.');const byAsset=new Map();
 for(const t of transcripts){const a=project.assets.find(a=>a.id===t.assetId);if(!a)continue;validateTranscript(t,a.duration);if(byAsset.has(a.id))throw Error('Falas duplicadas.');
  for(const key of ['gaps','context']){if(t[key]!==undefined&&(!Array.isArray(t[key])||t[key].length>10000))throw Error('Intervalos de fala inválidos.');for(const span of t[key]||[])if(!span||![span.start,span.end].every(Number.isFinite)||span.start<0||span.end<=span.start||span.end>a.duration+1e-6||key==='context'&&(typeof span.text!=='string'||span.text.length>12000))throw Error('Intervalos de fala inválidos.');}byAsset.set(a.id,t);
 }
 const result=[];let offset=0;for(const clip of project.clips){const t=byAsset.get(clip.assetId),start=offset;offset+=clipDuration(clip);if(!t||clip.freeze||!project.assets.find(a=>a.id===clip.assetId)?.hasAudio)continue;const at=s=>start+montageTime(clip,s),gaps=(t.gaps||[]).filter(g=>g.end>clip.in&&g.start<clip.out),intersects=(a,b)=>a.start<b.end&&a.end>b.start;let group=[];
  const flush=()=>{if(!group.length)return;result.push({clipId:clip.id,assetId:clip.assetId,start:group[0].start,end:Math.max(...group.map(w=>w.end)),words:group,text:group.map(w=>w.text).join(' '),uncertain:false});group=[];};
  for(const [index,w]of t.words.entries()){if(w.end<=clip.in||w.start>=clip.out||gaps.some(g=>intersects(w,g))){flush();continue;}if(w.start<clip.in||w.end>clip.out){flush();result.push({clipId:clip.id,assetId:clip.assetId,start:at(Math.max(clip.in,w.start)),end:at(Math.min(clip.out,w.end)),text:w.text,words:[],uncertain:true});continue;}
   const last=group.at(-1);if(group.length&&(group.length>=8||w.start-last.sourceEnd>.8||gaps.some(g=>g.start<w.start&&g.end>last.sourceEnd)))flush();group.push({id:clip.id+':'+index,start:at(w.start),end:at(w.end),sourceStart:w.start,sourceEnd:w.end,text:w.text});if(/[.!?]$/.test(w.text))flush();
  }flush();for(const gap of gaps){const text=(t.context||[]).filter(c=>intersects(c,gap)).map(c=>c.text).join(' ');result.push({clipId:clip.id,assetId:clip.assetId,start:at(Math.max(clip.in,gap.start)),end:at(Math.min(clip.out,gap.end)),text:text||'Fala sem tempos confiáveis',words:[],uncertain:true});}
 }
 return result.sort((a,b)=>a.start-b.start||a.end-b.end);
}
export function speechReviewRange(entries,first,last=first){
 const units=entries.flatMap(e=>e.words),a=units.find(w=>w.id===first),b=units.find(w=>w.id===last);if(!a||!b)throw Error('A montagem mudou. Selecione as palavras novamente.');const start=Math.min(a.start,b.start),end=Math.max(a.end,b.end);if(end-start<.02)throw Error('Selecione mais de uma palavra para ampliar o intervalo.');return {start,end,uncertain:entries.some(e=>e.uncertain&&e.start<end&&e.end>start)};
}

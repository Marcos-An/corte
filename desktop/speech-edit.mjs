// Speech-anchored editing. The provider names words and pauses; this module turns them into source-time ranges.
// Whisper word ends drift into the following silence, so cut points come from measured pauses, not from word ends.
// A silence longer than SCENE between two words is a shot without speech (b-roll), not a pause to tighten.
const BREATH=.12,REACH=.3,SCENE=3;

// Pauses are frames quieter than the clip's own noise floor plus a margin; a fixed dB threshold fails in a restaurant.
export function detectPauses(samples,rate,{minDuration=.35,frame=.02}={}){
 const size=Math.max(1,Math.round(rate*frame)),db=[];
 for(let i=0;i+size<=samples.length;i+=size){let sum=0;for(let j=i;j<i+size;j++)sum+=samples[j]*samples[j];db.push(10*Math.log10(sum/size+1e-12));}
 if(db.length<2)return [];
 const sorted=[...db].sort((a,b)=>a-b),floor=sorted[Math.floor(sorted.length*.1)],peak=sorted[Math.floor(sorted.length*.98)];
 if(peak-floor<10)return [];
 const threshold=floor+Math.max(6,(peak-floor)*.25),pauses=[];let start=-1;
 for(let i=0;i<=db.length;i++){
  const quiet=i<db.length&&db[i]<threshold;
  if(quiet&&start<0)start=i;
  if(!quiet&&start>=0){if((i-start)*frame>=minDuration)pauses.push({start:start*frame,end:i*frame});start=-1;}
 }
 return pauses;
}

const fold=t=>t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');
const FILLER=/^(é{2,}|e{2,}h*|eh+|ah+n*|hã+|ãh+|hum+|hm+|uhm*|um{2,})$/u;
// Hints, not decisions: hesitations and immediate repetitions the provider may remove with remove_words.
export function speechHints(words){
 const hints=[];
 for(let i=0;i<words.length;){
  const spoken=words[i].text.toLowerCase().replace(/[^\p{L}]/gu,'');
  if(FILLER.test(spoken)){hints.push({type:'filler',from:i,to:i,text:words[i].text});i++;continue;}
  let n=3;while(n>0&&!(i+2*n<=words.length&&Array.from({length:n},(_,k)=>fold(words[i+k].text)===fold(words[i+n+k].text)&&fold(words[i+k].text)).every(Boolean)))n--;
  if(n){hints.push({type:'repeat',from:i,to:i+n-1,text:words.slice(i,i+n).map(w=>w.text).join(' ')});i+=n;}else i++;
 }
 return hints;
}

const fail=message=>{throw Error(message);};
function wordRanges(op,clip,t){
 const words=t.words,pauses=(t.pauses||[]).filter(p=>p.end-p.start<=SCENE);
 if(!Array.isArray(op.ranges)||!op.ranges.length||op.ranges.length>100)fail('Palavras inválidas na proposta: informe intervalos [de,até] de índices.');
 const inClip=w=>w&&w.start>=clip.in-.000001&&w.end<=clip.out+.000001;
 return op.ranges.map(r=>{
  if(!Array.isArray(r)||r.length!==2||!r.every(Number.isInteger)||r[0]<0||r[1]<r[0]||r[1]>=words.length)fail('Palavras inválidas na proposta: índices fora da transcrição.');
  const first=words[r[0]],last=words[r[1]];if(!inClip(first)||!inClip(last))fail(`Palavras ${r[0]}–${r[1]} fora do trecho ${clip.id}.`);
  const prev=inClip(words[r[0]-1])?words[r[0]-1]:null,next=inClip(words[r[1]+1])?words[r[1]+1]:null;
  // Silence is removed only between two words; next to a clip edge it may be b-roll, so take at most REACH.
  const before=prev&&pauses.filter(p=>p.start>=prev.start&&p.end<=first.start+.05).at(-1);
  const after=next&&pauses.find(p=>p.start>=last.start&&p.start<next.start);
  const start=before?Math.min((before.start+Math.min(before.end,first.start))/2,before.start+BREATH):Math.max(((prev?prev.end:clip.in)+first.start)/2,first.start-REACH);
  const end=after?Math.max((after.start+Math.min(after.end,next.start))/2,Math.min(after.end,next.start)-BREATH):Math.min((last.end+(next?next.start:clip.out))/2,last.end+REACH);
  return [Math.max(clip.in,start),Math.min(clip.out,end)];
 });
}
function pauseRanges(op,clip,t,gaps){
 if(!Number.isFinite(op.minPause)||op.minPause<.2||op.minPause>5||!Number.isFinite(op.keep)||op.keep<0||op.keep>op.minPause)fail('Ajuste de pausas inválido: use minPause entre 0,2 e 5 s e keep menor que minPause.');
 const words=t.words.filter(w=>w.start>=clip.in&&w.end<=clip.out);
 return (t.pauses||[]).map(p=>({start:Math.max(p.start,clip.in),end:Math.min(p.end,clip.out)})).filter(p=>
  p.end-p.start>op.minPause&&p.end-p.start<=SCENE&&words.some(w=>w.start<p.start)&&words.some(w=>w.start>=p.end-.05)&&!words.some(w=>w.start>p.start+.05&&w.start<p.end-.05)&&
  !gaps.some(g=>g.assetId===clip.assetId&&g.start<p.end&&g.end>p.start)).map(p=>[p.start+op.keep/2,p.end-op.keep/2]);
}
function merge(ranges){
 const out=[];for(const r of [...ranges].sort((a,b)=>a[0]-b[0])){if(out.length&&r[0]<=out.at(-1)[1])out.at(-1)[1]=Math.max(out.at(-1)[1],r[1]);else out.push([...r]);}return out;
}
// Speech operations and plain range removals on the same clip become one remove_ranges at the first of them;
// coverage indexes follow, and an item left without operations is reported as not needed.
export function resolveSpeechOperations(project,result,transcripts=[],gaps=[]){
 const ops=result?.plan?.operations;if(!Array.isArray(ops)||!ops.some(o=>['remove_words','tighten_pauses'].includes(o?.type)))return result;
 const speechClips=new Set(ops.filter(o=>['remove_words','tighten_pauses'].includes(o?.type)).map(o=>o.clipId)),groups=new Map(),target=[];
 ops.forEach((op,i)=>{
  if(!speechClips.has(op?.clipId)||!['remove_words','tighten_pauses','remove_ranges','keep_ranges'].includes(op.type)){target[i]=i;return;}
  if(op.type==='keep_ranges')fail(`keep_ranges e cortes de fala no mesmo trecho ${op.clipId}: use só remove_words/tighten_pauses/remove_ranges.`);
  const clip=project.clips.find(c=>c.id===op.clipId);if(!clip)fail(`Trecho ${op.clipId} não encontrado.`);
  let ranges=op.ranges;
  if(op.type!=='remove_ranges'){const t=transcripts.find(t=>t.assetId===clip.assetId);if(!t)fail('Não há transcrição local para cortar falas neste trecho.');ranges=op.type==='remove_words'?wordRanges(op,clip,t):pauseRanges(op,clip,t,gaps);}
  if(!groups.has(op.clipId))groups.set(op.clipId,{first:i,ranges:[]});const g=groups.get(op.clipId);g.ranges.push(...ranges);target[i]=g.first;
 });
 const kept=ops.map((op,i)=>{if(target[i]!==i)return null;const g=groups.get(op.clipId);if(!g||g.first!==i)return op;const ranges=merge(g.ranges);return ranges.length?{type:'remove_ranges',clipId:op.clipId,ranges}:null;});
 const index=[];let n=0;kept.forEach((op,i)=>{if(op)index[i]=n++;});
 // Invalid or duplicated indexes are kept visible (as -1 or repeats) so coverage validation still rejects them.
 const coverage=Array.isArray(result.coverage)?result.coverage.map(item=>{
  if(!item||!Array.isArray(item.operationIndexes))return item;
  const original=item.operationIndexes,valid=i=>Number.isInteger(i)&&i>=0&&i<ops.length;
  const mapped=original.map(i=>valid(i)?index[target[i]]??null:-1),live=mapped.filter(i=>i!==null);
  const operationIndexes=new Set(original).size===original.length?[...new Set(live)]:live;
  if(operationIndexes.length||!original.length)return {...item,operationIndexes};
  // Every operation of the item was a pause tightening that found nothing to tighten.
  const reason=`${item.reason} Nenhuma pausa longa entre falas foi detectada.`.slice(0,1000);
  return {...item,status:item.status==='partial'?'pending':'not_needed',operationIndexes:[],reason};
 }):result.coverage;
 return {...result,plan:{...result.plan,operations:kept.filter(Boolean)},coverage};
}

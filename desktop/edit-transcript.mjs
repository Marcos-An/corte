// Internal speech evidence is not a caption track. Never invent word durations or drop individual negations.
const reason='unreliable-word-times',unsafe=/[\u0000-\u0008\u000b-\u001f]/;
export function normalizeEditRecognition(result,duration){
 if(!Number.isFinite(duration)||duration<=0||!result||typeof result!=='object')throw Error('Resposta de reconhecimento de fala inválida.');
 const uncertain=()=>{
  const text=(typeof result.text==='string'&&result.text.trim()?result.text:(Array.isArray(result.chunks)?result.chunks.map(c=>typeof c?.text==='string'?c.text:'').join(' '):'')).trim();
  const context=text&&text.length<=12000&&!unsafe.test(text)?[{start:0,end:duration,text}]:[];
  return {words:[],gaps:[{start:0,end:duration,reason}],...(context.length?{context}:{})};
 };
 if(!Array.isArray(result.chunks))return uncertain();
 if(result.chunks.length>100000)throw Error('Reconhecimento de fala excedeu o limite de palavras.');
 // Each chunk is reliable or not; an unreliable run becomes a gap between its reliable neighbours.
 const items=[];let previous=0;
 for(const chunk of result.chunks){
  if(typeof chunk?.text!=='string')return uncertain();const text=chunk.text.trim();if(!text)continue;
  if(text.length>500||unsafe.test(text))return uncertain();
  const [start,end]=Array.isArray(chunk.timestamp)&&chunk.timestamp.length===2?chunk.timestamp:[NaN,NaN];
  const ok=Number.isFinite(start)&&Number.isFinite(end)&&start>=previous&&end>start&&end<=duration+.000001;
  items.push({text,start,end,ok});if(ok)previous=start;
 }
 const bad=items.filter(i=>!i.ok).length;
 if(!items.length&&typeof result.text==='string'&&result.text.trim())return uncertain();
 if(bad*2>items.length)return uncertain();
 const words=[],gaps=[],context=[];
 for(let i=0;i<items.length;i++){
  if(items[i].ok){const {text,start,end}=items[i];words.push({text,start,end});continue;}
  let j=i;while(j+1<items.length&&!items[j+1].ok)j++;
  const run=items.slice(i,j+1),prev=items[i-1],next=items[j+1],lower=prev?prev.end:0,upper=next?next.start:duration;
  const claims=run.flatMap(r=>[r.start,r.end]).filter(Number.isFinite).map(t=>Math.min(Math.max(t,0),duration));
  let start=Math.min(lower,...claims),end=Math.max(upper,...claims);
  if(!next&&Number.isFinite(run[0].start)&&run[0].start>=lower&&run[0].start<duration)start=run[0].start;
  if(end-start<.000001){start=prev?prev.start:0;end=next?next.end:duration;}
  const text=run.map(r=>r.text).join(' ');gaps.push({start,end,reason});if(text.length<=12000)context.push({start,end,text});i=j;
 }
 return {words,gaps,...(context.length?{context}:{})};
}
// Fixed windows cut speech at their edges; overlapping windows give every word a window where it is not at the edge.
export function speechWindows(duration,size=30,overlap=5){
 const windows=[];
 for(let offset=0;;offset+=size-overlap){
  const last=offset+size>=duration;
  windows.push({offset,length:Math.min(size,duration-offset),from:offset?offset+overlap/2:0,to:last?duration:offset+size-overlap/2});
  if(last)return windows;
 }
}
// Two decodes of the overlap time the same word differently, so a fixed midpoint can keep it twice or drop it.
// Continue after the last kept word instead, and skip a re-timed copy of a word already kept.
export function mergeSpeechWindow(target,recognized,window){
 const shift=x=>({...x,start:x.start+window.offset,end:x.end+window.offset}),clip=x=>({...x,start:Math.max(x.start,window.from),end:Math.min(x.end,window.to)});
 const norm=t=>t.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g,'');
 for(const w of recognized.words.map(shift)){
  const last=target.words.at(-1);if(w.start>=window.to||last&&w.start<=last.start+.05)continue;
  if(target.words.some(k=>Math.abs(k.start-w.start)<.6&&norm(k.text)===norm(w.text)))continue;
  target.words.push(w);
 }
 for(const key of ['gaps','context'])target[key].push(...(recognized[key]||[]).map(shift).map(clip).filter(x=>x.end>x.start));
 // A pause crossing the ownership boundary arrives in two pieces; join them back.
 for(const p of (recognized.pauses||[]).map(shift).map(clip).filter(x=>x.end>x.start)){const last=(target.pauses??=[]).at(-1);if(last&&p.start<=last.end+.01)last.end=Math.max(last.end,p.end);else target.pauses.push({start:p.start,end:p.end});}
 return target;
}

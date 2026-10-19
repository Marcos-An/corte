// Text offsets are UTF-16, matching textarea selectionStart/End. Never invent word times.
export function transcriptSelection(entry,from=0,to=0){
 if(!entry||typeof entry.text!=='string'||![entry.start,entry.end,from,to].every(Number.isFinite)||entry.start<0||entry.end-entry.start<.02||from<0||to<from||to>entry.text.length)throw Error('Seleção de fala inválida.');
 const spans=[...entry.text.matchAll(/\S+/gu)].map(m=>({text:m[0],from:m.index,to:m.index+m[0].length}));
 if(from===to||from===0&&to===entry.text.length)return {start:entry.start,end:entry.end};
 const indexes=spans.flatMap((w,i)=>w.from<to&&w.to>from?[i]:[]);if(!indexes.length)throw Error('Selecione ao menos uma palavra.');
 const tokens=entry.tokens;if(!Array.isArray(tokens)||tokens.length!==spans.length||tokens.some((t,i)=>t.text!==spans[i].text||![t.start,t.end].every(Number.isFinite)||t.start<entry.start-1e-6||t.end>entry.end+1e-6||t.end<=t.start||i>0&&t.start<tokens[i-1].start))throw Error('Sem tempos por palavra. Selecione a fala inteira ou gere legendas locais com tempos.');
 const start=tokens[indexes[0]].start,end=Math.max(...indexes.map(i=>tokens[i].end));if(end-start<.02)throw Error('Intervalo de fala muito curto.');return {start,end};
}

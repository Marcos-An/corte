import {validateProject} from './project.mjs';
import {clipDuration,sourceTime} from './clip-time.mjs';
import {projectCaptions,toSrt} from './captions.mjs';

const MAX_BYTES=2*1024*1024;
function timestamp(value){
 const match=/^(?:(\d{2,}):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(value);
 if(!match||Number(match[2])>59||Number(match[3])>59)throw Error('Tempo de legenda inválido. Use horas:minutos:segundos e milissegundos.');
 return Number(match[1]||0)*3600+Number(match[2])*60+Number(match[3])+Number(match[4])/1000;
}
export function parseSubtitles(input){
 if(typeof input!=='string'||new TextEncoder().encode(input).length>MAX_BYTES)throw Error('O arquivo de legendas deve ter até 2 MB.');
 const source=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
 const blocks=source.split(/\n[\t ]*\n/).map(block=>block.trim()).filter(Boolean),vtt=/^WEBVTT(?:[\t ].*)?(?:\n|$)/.test(source);let previousEnd=0;
 if(vtt)blocks.shift();
 const cues=[];
 for(const block of blocks){
  const lines=block.split('\n');
  if(vtt&&/^(NOTE(?:\s|$)|STYLE$|REGION$)/.test(lines[0]))continue;
  const index=lines.findIndex(line=>line.includes('-->'));
  if(index<0||index>1)throw Error('Bloco de legenda sem tempo válido.');
  const timing=/^(\S+)\s+-->\s+(\S+)(?:[\t ]+.*)?$/.exec(lines[index]);
  if(!timing)throw Error('Intervalo de legenda inválido.');
  const start=timestamp(timing[1]),end=timestamp(timing[2]);
  // Files carry cue timing, never inferred word timestamps or executable markup.
  const text=lines.slice(index+1).join(' ').replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,e=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[e]).trim();
  if(start<previousEnd-1e-6||end<=start||end>21600||!text||text.length>500||/[\u0000-\u0008\u000b-\u001f]/.test(text))throw Error('As legendas devem ter texto, tempos crescentes e não se sobrepor (até 6 horas).');
  cues.push({start,end,text});previousEnd=end;
  if(cues.length>10000)throw Error('Use no máximo 10 mil legendas por arquivo.');
 }
 if(!cues.length)throw Error('Nenhuma legenda encontrada no arquivo.');
 return cues;
}

export function importSubtitles(project,input){
 const cues=parseSubtitles(input),q=structuredClone(project),narration=q.captionSource==='narration';
 let offset=0;
 const tracks=(narration?(q.music||[]).filter(c=>c.role==='narration'):q.clips).map(c=>{
  const start=narration?c.start:offset,end=start+clipDuration(c);offset=end;return {c,start,end};
 }).sort((a,b)=>a.start-b.start);
 for(const {c} of tracks)c.captionWords=[];
 for(const cue of cues){
  let covered=cue.start;
  for(const {c,start,end} of tracks){
   const from=Math.max(cue.start,start),to=Math.min(cue.end,end);if(to<=from+1e-9)continue;
   if(from>covered+1e-6)throw Error('Uma legenda cai fora dos trechos da voz escolhida. Ajuste os tempos ou a fonte das legendas.');
   if(from<covered-1e-6)throw Error('Há narrações sobrepostas. Separe-as antes de importar legendas.');
   if(c.freeze)throw Error('A importação sobre quadros congelados ainda não é suportada. Use uma narração nesse intervalo.');
   c.captionWords.push({text:cue.text,start:sourceTime(c,from-start),end:Math.min(c.out,sourceTime(c,to-start))});covered=to;
  }
  if(covered<cue.end-1e-6)throw Error('Uma legenda ultrapassa os trechos da voz escolhida. Ajuste os tempos ou a fonte das legendas.');
 }
 return validateProject(q);
}

export function exportSubtitles(project,format='srt'){
 validateProject(project);
 if(!['srt','vtt'].includes(format))throw Error('Formato de legenda inválido.');
 const cues=projectCaptions(project).sort((a,b)=>a.start-b.start);
 if(!cues.length)throw Error('Não há legendas para exportar.');
 const srt=toSrt(cues.map(c=>({...c,text:c.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')})));
 return format==='srt'?srt:'WEBVTT\n\n'+srt.replace(/^(\d{2,}:\d{2}:\d{2}),(\d{3}) --> (\d{2,}:\d{2}:\d{2}),(\d{3})$/gm,'$1.$2 --> $3.$4');
}

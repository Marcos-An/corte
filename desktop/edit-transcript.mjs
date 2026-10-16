// Internal speech evidence is not a caption track. Never invent word durations or drop individual negations.
export function normalizeEditRecognition(result,duration){
 if(!Number.isFinite(duration)||duration<=0||!result||typeof result!=='object')throw Error('Resposta de reconhecimento de fala inválida.');
 const uncertain=()=>({words:[],gaps:[{start:0,end:duration,reason:'unreliable-word-times'}]});
 if(!Array.isArray(result.chunks))return uncertain();
 if(result.chunks.length>100000)throw Error('Reconhecimento de fala excedeu o limite de palavras.');
 const words=[];let previous=0;
 for(const chunk of result.chunks){
  if(typeof chunk?.text!=='string')return uncertain();const text=chunk.text.trim();if(!text)continue;
  if(!Array.isArray(chunk.timestamp)||chunk.timestamp.length!==2)return uncertain();const [start,end]=chunk.timestamp;
  if(text.length>500||/[\u0000-\u0008\u000b-\u001f]/.test(text)||!Number.isFinite(start)||!Number.isFinite(end)||start<previous||end<=start||end>duration+.000001)return uncertain();
  words.push({text,start,end});previous=start;
 }
 if(!words.length&&typeof result.text==='string'&&result.text.trim())return uncertain();
 return {words,gaps:[]};
}

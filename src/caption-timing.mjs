import {validateTranscript} from './captions.mjs';
// Keep measured token times. A recognizer chunk with several words cannot support word-level highlighting.
export function groupCaptionTokens(tokens,duration){
 validateTranscript({assetId:'local',words:tokens},duration);
 const phrases=[];let group=[];
 const flush=()=>{if(!group.length)return;const text=group.map(w=>w.text).join(' '),timed=group.every(w=>w.text.trim().split(/\s+/).length===1);phrases.push({start:group[0].start,end:Math.max(...group.map(w=>w.end)),text,...(timed?{tokens:group.map(w=>({...w}))}:{})});group=[];};
 for(const w of tokens){
  if(group.length&&(group.length>=6||group.map(t=>t.text).join(' ').length+w.text.length+1>38||w.start-group.at(-1).end>.65))flush();
  group.push(w);if(/[.!?]$/.test(w.text))flush();
 }flush();validateTranscript({assetId:'local',words:phrases},duration);return phrases;
}

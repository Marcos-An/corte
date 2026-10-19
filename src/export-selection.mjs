import {clipDuration} from './clip-time.mjs';
// Keep the selection in montage seconds, with the timing it was reviewed against.
// Visual/audio adjustments do not invalidate it; cuts, order and speed do.
export const exportTimingKey=p=>JSON.stringify(p.clips.map(c=>[c.id,c.assetId,c.in,c.out,c.speed??1,c.freeze??null]));
export const exportSelectionStale=p=>!!p.exportSelection&&p.exportSelection.basis!==exportTimingKey(p);
export function validateExportSelection(p){
 const s=p.exportSelection;if(s===undefined)return;
 if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).length!==2||Object.keys(s).some(k=>!['basis','ranges'].includes(k))||typeof s.basis!=='string'||s.basis.length>1000000)throw Error('Seleção de exportação inválida.');
 validateSavedRanges(p,s.ranges,!exportSelectionStale(p));
}
export function validateSavedRanges(p,ranges,current=true){
 if(!Array.isArray(ranges)||ranges.length>20)throw Error('Guarde até 20 trechos.');
 const ids=new Set(),total=p.clips.reduce((n,c)=>n+clipDuration(c),0);
 return Array.from(ranges,r=>{
  if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['id','name','start','end','reason'].includes(k))||!['id','name','start','end'].every(k=>k in r)||typeof r.id!=='string'||!/^[-A-Za-z0-9_]{1,64}$/.test(r.id)||ids.has(r.id)||typeof r.name!=='string'||!r.name.trim()||r.name.length>100||/[\u0000-\u001f\u007f]/.test(r.name)||![r.start,r.end].every(Number.isFinite)||r.start<0||r.end-r.start<.1-1e-8||r.end>43200000||current&&r.end>total+1e-8||r.reason!==undefined&&(typeof r.reason!=='string'||r.reason.length>500||/[\u0000-\u001f\u007f]/.test(r.reason)))throw Error('Revise os nomes e os intervalos dos trechos.');
  ids.add(r.id);return {id:r.id,name:r.name.trim(),start:r.start,end:current?Math.min(total,r.end):r.end,...(r.reason?{reason:r.reason}:{})};
 });
}
export function saveExportSelection(p,ranges){
 const clean=validateSavedRanges(p,ranges),q=structuredClone(p);
 if(clean.length)q.exportSelection={basis:exportTimingKey(p),ranges:clean};else delete q.exportSelection;
 return q;
}

import {validateProject,duration} from './project.mjs';
import {clipDuration,clipSpeed,sourceTime,zoomAt} from './clip-time.mjs';
import {sliceClip} from './clip-slicing.mjs';
export function validateExportRange(project,range){
 if(range===undefined||range===null)return null;
 if(!range||typeof range!=='object'||Array.isArray(range)||Object.keys(range).length!==2||Object.keys(range).some(k=>!['start','end'].includes(k))||![range.start,range.end].every(Number.isFinite)||range.start<0||range.end>duration(project)+1e-8||range.end-range.start<.1-1e-8)throw Error('Escolha início e fim dentro do vídeo, com pelo menos 0,1 s.');
 return {start:range.start,end:Math.min(range.end,duration(project))};
}
export function prepareExportWindow(scene,requested){
 validateProject(scene);const total=duration(scene),range=validateExportRange(scene,requested);
 if(!range||range.start===0&&range.end===total)return {project:scene,scene,range:null,offset:0,end:total};
 let offset=0;const rows=scene.clips.map(c=>{const row={c,start:offset,end:offset+clipDuration(c)};offset=row.end;return row;}),transitions=[];
 let start=range.start,end=range.end;
 for(let i=0;i<rows.length-1;i++){
  const left=rows[i],right=rows[i+1],t=scene.transitions?.find(t=>t.leftId===left.c.id&&t.rightId===right.c.id);if(!t)continue;
  if(left.end+t.duration/2>range.start&&left.end-t.duration/2<range.end){transitions.push(t);start=Math.min(start,left.end-t.duration);end=Math.max(end,left.end+t.duration);}
 }
 start=Math.max(0,Math.floor((start+1e-9)*30)/30);end=Math.min(total,Math.ceil((end-1e-9)*30)/30);
 // Extend small boundary fragments rather than drop source frames or create invalid editor clips.
 for(let attempts=0;attempts<scene.clips.length*8+8;attempts++){
  const used=rows.filter(r=>r.end>start+1e-9&&r.start<end-1e-9),first=used[0],last=used.at(-1);
  const short=r=>{const a=Math.max(start,r.start),b=Math.min(end,r.end);if(a<=r.start+1e-9&&b>=r.end-1e-9)return false;return b-a<(r.c.freeze ? .100001 : Math.max(.020001,.020001/clipSpeed(r.c)));};
  const head=first&&short(first),tail=last&&short(last);if(!head&&!tail)break;
  if(head)start=Math.max(0,start-1/30);if(tail)end=Math.min(total,end+1/30);
 }
 const project={...scene};project.clips=rows.flatMap(r=>{
  const from=Math.max(start,r.start),to=Math.min(end,r.end);if(to-from<=1e-9)return [];
  if(from<=r.start+1e-9&&to>=r.end-1e-9)return [structuredClone(r.c)];
  if(!r.c.freeze)return [sliceClip(r.c,sourceTime(r.c,from-r.start),sourceTime(r.c,to-r.start),r.c.id,{preserveFades:true})];
  const c={...structuredClone(r.c),freeze:to-from};if(c.zoom)c.zoom={from:zoomAt(r.c,from-r.start),to:zoomAt(r.c,to-r.start)};
  if(c.fadeWindow)c.fadeWindow.offset+=(from-r.start)*c.fadeWindow.scale;return [c];
 });
 if(project.transitions)project.transitions=structuredClone(transitions);
 const music=(scene.music||[]).flatMap(c=>{const from=Math.max(start,c.start),to=Math.min(end,c.start+clipDuration(c));return to-from<1/48000?[]:[{...sliceClip(c,c.in+from-c.start,c.in+to-c.start,c.id,{preserveFades:true}),start:from-start}];});
 return {project:validateProject(project),scene,range,offset:start,end,music};
}

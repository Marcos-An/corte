export const KEYFRAME_FIELDS=['x','y','size','opacity'];
export function baseTransform(t){return t.style?{x:t.style.positionX??50,y:t.style.positionY??(t.style.position==='top'?14:t.style.position==='center'?50:86),size:t.style.size,opacity:100}:{x:t.x,y:t.y,size:t.width,opacity:t.opacity};}
// Entrance/exit presets for image, video and shape layers (text keeps its own style.enter/exit).
// Only the choice is stored; the points are derived from the current pose, so moving or resizing
// the component moves the animation with it. Manual keyframes take precedence over a preset.
export const MOTION_IDS=['none','fade','rise','drop','left','right','pop','zoom'];
const MOTION_SECONDS=.4;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
function motionPose(base,id,t){
 const max=t.type?Math.min(100,100*t.width/t.height):100,size=v=>clamp(v,5,max),from={...base,opacity:0};
 if(id==='rise')from.y=clamp(base.y+8,0,100);else if(id==='drop')from.y=clamp(base.y-8,0,100);
 else if(id==='left')from.x=clamp(base.x-15,0,100);else if(id==='right')from.x=clamp(base.x+15,0,100);
 else if(id==='pop')from.size=size(base.size*.6);else if(id==='zoom')from.size=size(base.size*1.3);
 return from;
}
export function motionPoints(t){
 const enter=t.motion?.enter,exit=t.motion?.exit,length=t.end-t.start;
 if(t.style||!length||(!enter||enter==='none')&&(!exit||exit==='none'))return [];
 const base=baseTransform(t),span=Math.min(MOTION_SECONDS,length/2),points=[];
 if(enter&&enter!=='none')points.push({time:0,...motionPose(base,enter,t)},{time:span,...base});else points.push({time:0,...base});
 if(exit&&exit!=='none')points.push({time:length-span,...base},{time:length,...motionPose(base,exit,t)});else points.push({time:length,...base});
 return points.filter((p,i)=>i===0||p.time>points[i-1].time+1e-9);
}
export function pointsOf(t){return t.keyframes?.length?t.keyframes:motionPoints(t);}
export function animated(t){return pointsOf(t).length>0;}
export function validateMotion(t){
 if(t.motion===undefined)return;
 const m=t.motion;if(!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).some(k=>!['enter','exit'].includes(k)||!MOTION_IDS.includes(m[k])))throw Error('Animação inválida.');
}
export function keyframeAt(t,time){
 const points=pointsOf(t);if(!points.length)return baseTransform(t);
 const left=points.findLast(p=>p.time<=time)||points[0],right=points.find(p=>p.time>time)||points.at(-1),ratio=right.time===left.time?0:Math.max(0,Math.min(1,(time-left.time)/(right.time-left.time)));
 return Object.fromEntries(KEYFRAME_FIELDS.map(k=>[k,left[k]+(right[k]-left[k])*ratio]));
}
export function applyKeyframes(t,time){
 if(!animated(t))return t;
 const pose=keyframeAt(t,time-t.start);
 if(t.style)return {...t,style:{...t.style,size:pose.size},keyframePose:pose};
 const scale=pose.size/t.width;
 return {...t,x:pose.x,y:pose.y,width:pose.size,opacity:pose.opacity,...(t.type?{height:t.height*scale,strokeWidth:t.strokeWidth*scale}:{})};
}
// FFmpeg uses the same held endpoints and linear ramps, without deeply nested conditionals.
export function keyframeExpression(t,field,clock='t'){
 const points=pointsOf(t);if(!points.length)return String(baseTransform(t)[field]);
 return String(points[0][field])+points.slice(1).map((p,i)=>{
  const left=points[i],delta=p[field]-left[field];
  return delta?`+(${delta})*clip((${clock}-${t.start}-${left.time})/${p.time-left.time},0,1)`:'';
 }).join('');
}
export function* keyframeSamples(t,extraRanges=[]){
 const points=pointsOf(t),ranges=[...extraRanges,...points.slice(1).flatMap((p,i)=>KEYFRAME_FIELDS.some(k=>p[k]!==points[i][k])?[[t.start+points[i].time,t.start+p.time]]:[])];
 const boundaries=[...new Set([t.start,t.end,...ranges.flat().filter(time=>time>t.start&&time<t.end)])].sort((a,b)=>a-b);
 for(let i=0;i<boundaries.length-1;i++){
  const start=boundaries[i],end=boundaries[i+1],middle=(start+end)/2;
  if(!ranges.some(([a,b])=>middle>=a&&middle<b)){yield {start,end,time:middle};continue;}
  let cursor=start;
  for(let frame=Math.ceil(start*30-1e-7);frame/30<end-1e-9;frame++){
   const next=Math.min(end,(frame+1)/30);yield {start:cursor,end:next,time:frame/30};cursor=next;
  }
 }
}
export function retimeKeyframes(t,original){
 if(!original.keyframes?.length||Math.abs((t.end-t.start)-(original.end-original.start))<1e-9)return;
 const offset=t.start-original.start,length=t.end-t.start;
 const points=original.keyframes.map(p=>({...p,time:p.time-offset})).filter(p=>p.time>=0&&p.time<=length);
 if(offset>original.keyframes[0].time)points.unshift({time:0,...keyframeAt(original,offset)});
 if(offset+length<original.keyframes.at(-1).time)points.push({time:length,...keyframeAt(original,offset+length)});
 t.keyframes=points;
}
export function validateKeyframes(t){
 if(t.keyframes===undefined)return;
 const fail=()=>{throw Error('Keyframe inválido: confira tempo, posição, tamanho e opacidade.');};
 if(!Array.isArray(t.keyframes)||t.keyframes.length>200)fail();let previous=-1;
 const min=t.style?3:5,max=t.style?12:t.type?Math.min(100,100*t.width/t.height):100;
 for(const p of t.keyframes){if(!p||Object.keys(p).some(k=>!['time',...KEYFRAME_FIELDS].includes(k))||![p.time,...KEYFRAME_FIELDS.map(k=>p[k])].every(Number.isFinite)||p.time<=previous||p.time<0||p.time>t.end-t.start+1e-9||p.x<0||p.x>100||p.y<0||p.y>100||p.size<min||p.size>max||p.opacity<0||p.opacity>100)fail();previous=p.time;}
}

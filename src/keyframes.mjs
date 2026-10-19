export const KEYFRAME_FIELDS=['x','y','size','opacity'];
export const KEYFRAME_PATCH_FIELDS=[...KEYFRAME_FIELDS,'easing'];
export const EASINGS=[{id:'linear',label:'Linear'},{id:'ease-in',label:'Acelerar'},{id:'ease-out',label:'Desacelerar'},{id:'ease-in-out',label:'Suave'}];
// The point controls the curve to its successor. A cropped segment retains its original curve window.
function curveCoefficients(point){
 const a=point.curveWindow?.from??0,b=point.curveWindow?.to??1,d=b-a;
 if(point.easing==='ease-in')return [2*a/(a+b),d/(a+b),0];
 if(point.easing==='ease-out'){const remaining=(1-a)+(1-b);return [2*(1-a)/remaining,-d/remaining,0];}
 if(point.easing==='ease-in-out'){const first=6*a*(1-a),second=3*d*(1-2*a),third=-2*d*d,total=first+second+third;return [first/total,second/total,third/total];}
 return [1,0,0];
}
export function easedProgress(point,ratio){
 const u=Math.max(0,Math.min(1,ratio));if(u===0||u===1)return u;
 const [a,b,c]=curveCoefficients(point);return Math.max(0,Math.min(1,u*(a+u*(b+u*c))));
}
function curveSlice(point,from,to){
 if(!point.easing||point.easing==='linear')return {};
 const a=point.curveWindow?.from??0,b=point.curveWindow?.to??1,start=a+(b-a)*from,end=a+(b-a)*to;
 return {easing:point.easing,...(start===0&&end===1?{}:{curveWindow:{from:start,to:end}})};
}
export function updateKeyframePoints(t,time,patch){
 const points=structuredClone(t.keyframes||[]),index=points.findIndex(p=>Math.abs(p.time-time)<1e-7);
 if(patch===null){
  if(index<0)return points;
  const left=points[index-1],removed=points[index];
  if(left&&points[index+1]&&left.easing&&left.easing===removed.easing&&Math.abs((left.curveWindow?.to??1)-(removed.curveWindow?.from??0))<1e-9){
   const from=left.curveWindow?.from??0,to=removed.curveWindow?.to??1;left.curveWindow={from,to};if(from===0&&to===1)delete left.curveWindow;
  }
  points.splice(index,1);return points;
 }
 let metadata=index>=0?points[index]:{};
 if(index<0){
  const left=points.findLast(p=>p.time<time),right=points.find(p=>p.time>time);
  if(left&&right){const ratio=(time-left.time)/(right.time-left.time);metadata=curveSlice(left,ratio,1);const before=curveSlice(left,0,ratio);delete left.easing;delete left.curveWindow;Object.assign(left,before);}
 }
 const point={...metadata,...keyframeAt(t,time),...patch,time};
 if('easing'in patch){delete point.curveWindow;if(patch.easing==='linear')delete point.easing;}
 if(index>=0)points.splice(index,1);points.push(point);points.sort((a,b)=>a.time-b.time);return points;
}
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
 const left=points.findLast(p=>p.time<=time)||points[0],right=points.find(p=>p.time>time)||points.at(-1),ratio=right.time===left.time?0:easedProgress(left,(time-left.time)/(right.time-left.time));
 return Object.fromEntries(KEYFRAME_FIELDS.map(k=>[k,left[k]+(right[k]-left[k])*ratio]));
}
export function applyKeyframes(t,time){
 if(!animated(t))return t;
 const pose=keyframeAt(t,time-t.start);
 if(t.style)return {...t,style:{...t.style,size:pose.size},keyframePose:pose};
 const scale=pose.size/t.width;
 return {...t,x:pose.x,y:pose.y,width:pose.size,opacity:pose.opacity,...(t.type?{height:t.height*scale,strokeWidth:t.strokeWidth*scale}:{})};
}
// FFmpeg evaluates the same normalized polynomial, with held endpoints and no nested conditionals.
export function keyframeExpression(t,field,clock='t'){
 const points=pointsOf(t);if(!points.length)return String(baseTransform(t)[field]);
 return String(points[0][field])+points.slice(1).map((p,i)=>{
  const left=points[i],delta=p[field]-left[field];
  const progress=`clip((${clock}-${t.start}-${left.time})/${p.time-left.time},0,1)`,[a,b,c]=curveCoefficients(left),curve=!left.easing||left.easing==='linear'?progress:`clip((${progress})*(${a}+(${progress})*(${b}+(${progress})*${c})),0,1)`;
  return delta?`+(${delta})*${curve}`:'';
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
// ASS has centisecond timestamps. Put each boundary between its two 30fps frames, slightly
// before the target frame, so millisecond truncation cannot delay a pose or paint it twice.
export function assFrameInterval(start,end){
 const first=Math.ceil(start*30-1e-7),next=Math.ceil(end*30-1e-7);if(next<=first)return null;
 const boundary=frame=>Math.max(0,(Math.ceil(frame*100/30-1e-7)-1)/100);
 return {start:boundary(first),end:boundary(next)};
}
export function retimeKeyframes(t,original){
 if(!original.keyframes?.length||Math.abs((t.end-t.start)-(original.end-original.start))<1e-9)return;
 const offset=t.start-original.start,length=t.end-t.start,sourceEnd=t.end-original.start;
 // Retain exact source coordinates during slicing; subtract/add roundoff must not select another curve.
 const entries=original.keyframes.filter(p=>p.time>=offset&&p.time<=sourceEnd).map(p=>({source:p.time,point:{...p,time:p.time===sourceEnd?length:p.time-offset}}));
 if(offset>original.keyframes[0].time&&!entries.some(e=>e.source===offset))entries.unshift({source:offset,point:{time:0,...keyframeAt(original,offset)}});
 if(sourceEnd<original.keyframes.at(-1).time&&!entries.some(e=>e.source===sourceEnd))entries.push({source:sourceEnd,point:{time:length,...keyframeAt(original,sourceEnd)}});
 for(let i=0;i<entries.length-1;i++){
  const from=entries[i].source,to=entries[i+1].source,point=entries[i].point,left=original.keyframes.findLast(p=>p.time<=from),right=original.keyframes.find(p=>p.time>from);
  delete point.easing;delete point.curveWindow;
  if(left&&right&&to<=right.time)Object.assign(point,curveSlice(left,clamp((from-left.time)/(right.time-left.time),0,1),clamp((to-left.time)/(right.time-left.time),0,1)));
 }
 t.keyframes=entries.map(e=>e.point);
}
export function validateKeyframes(t){
 if(t.keyframes===undefined)return;
 const fail=()=>{throw Error('Keyframe inválido: confira tempo, posição, tamanho e opacidade.');};
 if(!Array.isArray(t.keyframes)||t.keyframes.length>200)fail();let previous=-1;
 const min=t.style?3:5,max=t.style?12:t.type?Math.min(100,100*t.width/t.height):100;
 for(const p of t.keyframes){if(!p||Object.keys(p).some(k=>!['time','easing','curveWindow',...KEYFRAME_FIELDS].includes(k))||![p.time,...KEYFRAME_FIELDS.map(k=>p[k])].every(Number.isFinite)||p.time<=previous||p.time<0||p.time>t.end-t.start+1e-9||p.x<0||p.x>100||p.y<0||p.y>100||p.size<min||p.size>max||p.opacity<0||p.opacity>100||p.easing!==undefined&&!EASINGS.some(e=>e.id===p.easing))fail();
  const w=p.curveWindow;if(w!==undefined&&(!w||typeof w!=='object'||Array.isArray(w)||Object.keys(w).length!==2||Object.keys(w).some(k=>!['from','to'].includes(k))||!Number.isFinite(w.from)||!Number.isFinite(w.to)||w.from<0||w.to>1||w.to<=w.from||!p.easing||p.easing==='linear'))fail();previous=p.time;}
}

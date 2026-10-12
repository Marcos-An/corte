import {applyKeyframes,keyframeSamples,animated} from './keyframes.mjs';
// Geometry is shared by the preview SVG and the native ASS vector renderer.
export const SHAPES={rectangle:'Retângulo',circle:'Círculo',line:'Linha',arrow:'Seta'};
const n=v=>Math.round(v*1000)/1000;
function geometry(t,canvasWidth,canvasHeight,inset){
 const w=canvasWidth*t.width/100,h=canvasHeight*t.height/100,open=['line','arrow'].includes(t.type),s=Math.min(canvasWidth*t.strokeWidth/100,open?h:Math.min(w,h)/2),d=inset??(!open&&t.stroke?s/2:0);
 let points;
 if(t.type==='rectangle')points=[['m',d,d],['l',w-d,d,w-d,h-d,d,h-d,d,d]];
 if(t.type==='circle'){
  const rx=(w-2*d)/2,ry=(h-2*d)/2,x=w/2,y=h/2,k=.55228475;
  points=[['m',x+rx,y],['b',x+rx,y+k*ry,x+k*rx,y+ry,x,y+ry,x-k*rx,y+ry,x-rx,y+k*ry,x-rx,y,x-rx,y-k*ry,x-k*rx,y-ry,x,y-ry,x+k*rx,y-ry,x+rx,y-k*ry,x+rx,y]];
 }
 if(t.type==='line')points=[['m',0,h/2-s/2],['l',w,h/2-s/2,w,h/2+s/2,0,h/2+s/2,0,h/2-s/2]];
 if(t.type==='arrow'){const shaft=Math.min(s,h),head=Math.min(w*.35,h);points=[['m',0,h/2-shaft/2],['l',w-head,h/2-shaft/2,w-head,0,w,h/2,w-head,h,w-head,h/2+shaft/2,0,h/2+shaft/2,0,h/2-shaft/2]];}
 return {w,h,s,points,fill:open?t.stroke:t.fill,stroke:open?null:t.stroke};
}
function paintedPaths(t,width,height){
 const g=geometry(t,width,height),paths=[];
 if(g.fill)paths.push({points:g.stroke?geometry(t,width,height,g.s).points:g.points,color:g.fill});
 if(g.stroke&&g.s){
  const outer=geometry(t,width,height,0).points,inner=geometry(t,width,height,g.s).points;
  // Reverse the inner contour so both renderers cut a hole.
  const hole=t.type==='rectangle'?[['m',g.s,g.s],['l',g.s,g.h-g.s,g.w-g.s,g.h-g.s,g.w-g.s,g.s,g.s,g.s]]:inner.map(([cmd,...coords])=>[cmd,...coords.map((v,i)=>i%2===0?g.w-v:v)]);
  paths.push({points:[...outer,...hole],color:g.stroke});
 }
 return {w:g.w,h:g.h,paths};
}
export function shapeSvg(t,width,height){
 const g=paintedPaths(t,width,height),paths=g.paths.map(p=>'<path d="'+p.points.map(([cmd,...coords])=>(cmd==='b'?'C':cmd.toUpperCase())+' '+coords.map(n).join(' ')).join(' ')+'" fill="'+p.color+'"/>').join('');
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+g.w+'" height="'+g.h+'" viewBox="0 0 '+g.w+' '+g.h+'">'+paths+'</svg>';
}
const color=hex=>'&H'+(hex||'#000000').slice(5,7)+(hex||'#000000').slice(3,5)+(hex||'#000000').slice(1,3)+'&';
const alpha=(visible,opacity)=>'&H'+Math.round(visible?255*(1-opacity/100):255).toString(16).padStart(2,'0')+'&';
const time=v=>{const c=Math.round(v*100);return Math.floor(c/360000)+':'+String(Math.floor(c/6000)%60).padStart(2,'0')+':'+String(Math.floor(c/100)%60).padStart(2,'0')+'.'+String(c%100).padStart(2,'0');};
export function shapeAss(t,width,height){
 if(animated(t)){
  const header=shapeAss({...t,keyframes:undefined,motion:undefined},width,height).split('Dialogue:')[0],events=[];
  for(const sample of keyframeSamples(t)){
   const pose=applyKeyframes(t,sample.time),ass=shapeAss({...pose,keyframes:undefined,motion:undefined,start:sample.start,end:sample.end},width,height);
   events.push(...(ass.match(/^Dialogue: .*$/gm)||[]));
  }
  return header+events.join('\n')+'\n';
 }
 const g=paintedPaths(t,width,height),x=width*t.x/100,y=height*t.y/100;
 const drawing=points=>points.map(([cmd,...coords])=>cmd+' '+coords.map(n).join(' ')).join(' ');
 const tags='\\an7\\pos('+n(x-g.w/2)+','+n(y-g.h/2)+')\\org('+n(x)+','+n(y)+')\\frz('+(-t.rotation)+')\\p1\\bord0\\shad0';
 const event=(points,fill)=>'Dialogue: 0,'+time(t.start)+','+time(t.end)+',Default,,0,0,0,,{'+tags+'\\1c'+color(fill)+'\\1a'+alpha(fill,t.opacity)+'}'+drawing(points)+'\n';
 const events=g.paths.map(p=>event(p.points,p.color)).join('');
 return '[Script Info]\nScriptType: v4.00+\nPlayResX: '+width+'\nPlayResY: '+height+'\nScaledBorderAndShadow: yes\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&HFF000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'+events;
}

import {speechLanguage} from './speech-language.mjs';
import {clipDuration,montageTime,sourceTime} from './clip-time.mjs';
import {FONT_FAMILIES} from './fonts.mjs';
import {ANIMATION_IDS,animationSpan,motionOf,animationAt} from './text-style.mjs';
import {applyKeyframes,keyframeSamples,assFrameInterval} from './keyframes.mjs';
// Transcripts stay in source time: timeline edits never rewrite recognition results.
export function validateTranscript(t,duration,allowInstant=false){
 if(t?.language!==undefined)speechLanguage({speechLanguage:t.language});
 if(!t||typeof t.assetId!=='string'||!Array.isArray(t.words)||t.words.length>100000)throw new Error('Transcrição inválida.');
 let previous=0;
 for(const w of t.words){if(!w||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<previous||w.end<w.start||(!allowInstant&&w.end===w.start)||w.end>duration+.000001||typeof w.text!=='string'||!w.text.trim()||w.text.length>500||/[\u0000-\u0008\u000b-\u001f]/.test(w.text))throw new Error('Palavra ou tempo de legenda inválido.');if(w.place!==undefined&&(!w.place||!Number.isFinite(w.place.positionX)||w.place.positionX<5||w.place.positionX>95||!Number.isFinite(w.place.positionY)||w.place.positionY<15||w.place.positionY>85||Object.keys(w.place).length!==2))throw new Error('Posição de legenda inválida.');if(w.tokens!==undefined){if(!Array.isArray(w.tokens)||w.tokens.length>500||w.tokens.some(t=>t.tokens!==undefined))throw Error('Tempos por palavra inválidos.');validateTranscript({assetId:t.assetId,words:w.tokens},duration,true);}previous=w.start;}
 return t;
}
// Old phrase-only transcripts retain approximate timing; new transcripts use provider tokens.
export function splitCaptionWords(words){
 return words.flatMap(w=>{
  const parts=w.text.trim().split(/\s+/),groups=[],timed=w.tokens?.length===parts.length;let group=[];
  for(const [i,text] of parts.entries()){
   // Equal timestamps must stay on the same page: splitting there would hide words.
   const canSplit=group.length&&(!timed||(w.tokens[i].start>(group[0].index===0?w.start:w.tokens[group[0].index].start)&&w.tokens[i].start<w.end));
   if(canSplit&&group.map(p=>p.text).join(' ').length+text.length+1>32){groups.push(group);group=[];}group.push({text,index:i});
  }if(group.length)groups.push(group);
  if(groups.length===1)return [w];
  return groups.map(g=>{const first=g[0].index,last=g.at(-1).index+1;return {text:g.map(p=>p.text).join(' '),start:timed?(first===0?w.start:w.tokens[first].start):w.start+(w.end-w.start)*first/parts.length,end:timed?(last===parts.length?w.end:w.tokens[last].start):w.start+(w.end-w.start)*last/parts.length,...(timed?{tokens:w.tokens.slice(first,last)}:{}),...(w.place?{place:w.place}:{})};});
 });
}
export function captionEntries(p){
 let offset=0;const result=[],narration=p.captionSource==='narration',montageEnd=p.clips.length?p.clips.reduce((sum,c)=>sum+clipDuration(c),0):Infinity;
 for(const c of (p.captionSource==='narration'?(p.music||[]).filter(c=>c.role==='narration'):p.clips)){if(c.freeze){offset+=clipDuration(c);continue;}if(p.captionSource==='narration')offset=c.start;const upper=narration?Math.min(c.out,sourceTime(c,Math.max(0,montageEnd-c.start))):c.out,t=p.transcripts?.find(t=>t.assetId===c.assetId);
  for(const [wordIndex,w] of splitCaptionWords(c.captionWords??t?.words??[]).entries()){
   const parts=w.text.trim().split(/\s+/),tokens=w.tokens?.length===parts.length?w.tokens.map((t,i)=>({...t,text:parts[i]})).filter(t=>t.end>c.in&&t.start<upper||t.start===t.end&&t.start>=c.in&&t.start<=upper):undefined,cropped=tokens&&tokens.length!==w.tokens.length,start=Math.max(w.start,c.in,cropped?tokens[0]?.start??w.start:w.start),end=Math.min(w.end,upper,cropped&&tokens.length?Math.max(...tokens.map(t=>t.end)):w.end);
   if(end>start&&(!tokens||tokens.length))result.push({start:offset+montageTime(c,start),end:offset+montageTime(c,end),text:tokens?tokens.map(t=>t.text).join(' '):w.text,assetId:c.assetId,clipId:c.id,wordIndex,...(w.place?{place:w.place}:{}),...(tokens?{tokens:tokens.map(t=>({...t,start:offset+montageTime(c,Math.max(c.in,t.start)),end:offset+montageTime(c,Math.min(upper,t.end))}))}:{})});
  }offset+=clipDuration(c);
 }return result;
}
// A caption with its own position exports with its own style; the rest follow the shared style.
export function projectCaptions(p){return captionEntries(p).map(({start,end,text,tokens,place})=>({start,end,text,...(tokens?{tokens}:{}),...(place?{style:{...captionStyle(p.captionStyle),...place}}:{})}));}
const stamp=time=>{const ms=Math.round(time*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
export function toSrt(captions){return captions.map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text.replace(/\r?\n/g,' ')}\n`).join('\n');}
export function normalizeRecognition(result,duration){
 if(!Array.isArray(result?.chunks))throw new Error('A transcrição não trouxe tempos por palavra.');
 const words=result.chunks.filter(c=>typeof c.text==='string'&&c.text.trim()).map(c=>({start:c.timestamp?.[0],end:c.timestamp?.[1],text:c.text.trim()}));
 validateTranscript({assetId:'recognition',words},duration);return words;
}
export function toAss(captions,width,height,options){
 if(captions.some(c=>c.keyframes?.length))return toAss(captions.flatMap(c=>{
  if(!c.keyframes?.length)return [c];
  const t={...c,style:captionStyle(c.style||options)},span=animationSpan(t.start,t.end),ranges=[];
  if(motionOf('enter',t.style.enter))ranges.push([t.start,t.start+span]);if(motionOf('exit',t.style.exit))ranges.push([t.end-span,t.end]);
  return [...keyframeSamples(t,ranges)].flatMap(sample=>{
   const interval=assFrameInterval(sample.start,sample.end);if(!interval)return [];
   const pose=applyKeyframes(t,sample.time),anim=animationAt(t.style,t.start,t.end,sample.time);
   return {...pose,keyframes:undefined,...interval,style:{...pose.style,enter:undefined,exit:undefined},renderPose:{x:pose.keyframePose.x+anim.x,y:pose.keyframePose.y+anim.y,opacity:pose.keyframePose.opacity*anim.opacity,scale:anim.scale}};
  });
 }),width,height,options);
 if(captions.some(c=>c.style)){
  const base=toAss([],width,height,options),styles=[],events=[];
  captions.forEach((c,i)=>{
   const ass=toAss([{...c,style:undefined}],width,height,c.style||options);
   styles.push(ass.match(/^Style: Default,.*$/m)[0].replace('Style: Default,','Style: Layer'+i+','));
   events.push(...(ass.match(/^Dialogue: .*$/gm)||[]).map(line=>line.replace('Dialogue: 0,','Dialogue: '+i+',').replace(',Default,,',',Layer'+i+',,')));
  });
  return base.replace('[Events]',styles.join('\n')+'\n[Events]')+events.join('\n');
 }
 const style=captionStyle(options),color=style.color.slice(1),assColor=`&H00${color.slice(4,6)}${color.slice(2,4)}${color.slice(0,2)}`.toUpperCase();
 const hexAss=(hex,opacity=100)=>{const c=hex.slice(1);return `&H${Math.round(255*(1-opacity/100)).toString(16).padStart(2,'0')}${c.slice(4,6)}${c.slice(2,4)}${c.slice(0,2)}`.toUpperCase();};
 // BorderStyle 3 paints the box with OutlineColour and pads it by Outline, matching the preview padding.
 const fontSize=Math.round(width*style.size/100),boxed=['boxed','karaoke'].includes(style.preset);
 const outlineColour=boxed?(style.preset==='boxed'&&style.boxColor?hexAss(style.boxColor,style.boxOpacity??100):'&H00131110'):style.strokeColor&&style.strokeWidth!==undefined?hexAss(style.strokeColor):'&H00131110';
 const outline=boxed?(style.preset==='boxed'&&style.boxColor?Math.round(fontSize*.25):3):style.strokeWidth!==undefined?Math.round(fontSize*style.strokeWidth/100):(style.preset==='clean'?1:3);
 const back=style.shadow?hexAss(style.shadowColor||'#000000'):'&H80000000',shadow=style.shadow?Math.round(fontSize*style.shadow/100):0;
 // Glow is a blurred outline in the glow colour; hollow letters keep the outline and drop the fill.
 const glow=!boxed&&style.glow?Math.round(fontSize*style.glow/100):0,primary=style.hollow?'&HFF'+assColor.slice(4):assColor;
 const time=v=>{const c=Math.round(v*100);return `${Math.floor(c/360000)}:${String(Math.floor(c/6000)%60).padStart(2,'0')}:${String(Math.floor(c/100)%60).padStart(2,'0')}.${String(c%100).padStart(2,'0')}`;};
 const safe=s=>s.replace(/\\/g,'／').replace(/{/g,'（').replace(/}/g,'）').replace(/\r?\n/g,' ');
 return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${style.font},${Math.round(width*style.size/100)},${primary},&H00FFFFFF,${glow?hexAss(style.glowColor||'#00e5ff'):outlineColour},${back},${style.bold?-1:0},${style.italic?-1:0},0,0,100,100,${style.spacing?Math.round(fontSize*style.spacing/100):0},0,${boxed?3:1},${glow?Math.max(outline,Math.round(glow*.6)):outline},${shadow},${style.position==='top'?8:style.position==='center'?5:2},40,40,${Math.round(height*.14)},1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`+captions.flatMap(c=>{
 if(style.uppercase)c={...c,text:c.text.toUpperCase(),...(c.tokens?{tokens:c.tokens.map(t=>({...t,text:t.text.toUpperCase()}))}:{})};
 const dynamic=['highlight','karaoke'].includes(style.preset)&&c.tokens?.length;
 const span=animationSpan(c.start,c.end),enter=motionOf('enter',style.enter),exit=motionOf('exit',style.exit);
 const boundaries=dynamic?[...new Set([c.start,c.end,...c.tokens.flatMap(t=>[t.start,t.end]).filter(t=>t>c.start&&t<c.end)])].sort((a,b)=>a-b):[...new Set([c.start,...(enter?[c.start+span]:[]),...(exit?[c.end-span]:[]),c.end])].sort((a,b)=>a-b);
 const colorCode=color=>('&H'+color.slice(5,7)+color.slice(3,5)+color.slice(1,3)+'&').toUpperCase();
 const margin=Math.round(width*(100-(style.width??85))/200);
 return boundaries.slice(0,-1).map((start,i)=>{
  const end=boundaries[i+1],runs=captionRuns(c,(start+end)/2,style);
  const layout=captionLayout(runs,t=>t.length*width*style.size/100*.85,width*(style.width??85)/100,!!c.id);
  const renderRuns=layout.lines.flatMap((line,i)=>line.map((r,j)=>({...r,lineBreak:i>0&&j===0})));
  const text=dynamic?renderRuns.map(r=>{const boxed=style.preset==='karaoke';const ink=boxed&&r.active?'#101113':r.active?(style.accent||'#eac39b'):style.color;const box=boxed?'\\bord'+(r.active?'4':'0')+'\\3c'+colorCode(style.accent||'#eac39b')+'\\3a&H'+(r.active?'00':'FF')+'&':'';return (r.lineBreak?'\\N':' ')+'{\\c'+colorCode(ink)+box+'}'+safe(r.text);}).join('').trim():wordText(layout.lines,Math.max(1,Math.round(width*style.size/100*layout.scale)));
  // A word with its own look (or the Palavra-chave accent) switches on before it and back right after.
  function wordText(lines,size){
   const own=new Map((c.wordStyles||[]).map(w=>[w.index,w])),total=lines.reduce((n,l)=>n+l.length,0);let index=0;
   return lines.map(line=>line.map(r=>{
    const i=index++,o={...(style.accentLast&&i===total-1?{color:style.accent||'#ffd84a'}:{}),...own.get(i)};
    const tags=(on)=>(o.color?'\\c'+colorCode(on?o.color:style.color):'')+(o.bold!==undefined?'\\b'+((on?o.bold:style.bold)?1:0):'')+(o.italic!==undefined?'\\i'+((on?o.italic:style.italic)?1:0):'')+(o.scale?'\\fs'+(on?Math.round(size*o.scale/100):size):'')+(o.font?'\\fn'+(on?o.font:style.font):'');
    return tags(true)?'{'+tags(true)+'}'+safe(r.text)+'{'+tags(false)+'}':safe(r.text);
   }).join(' ')).join('\\N');
  }
  const center=style.positionY!==undefined?style.positionY/100:style.position==='top'?.14:style.position==='center'?.5:.86;
  const px=Math.round(width*(style.positionX??50)/100),py=Math.round(height*center),ms=Math.round((end-start)*1000);
  // Animated segments sit at the very start or end of the text; each carries its own fade, move and scale.
  const motion=!dynamic&&(enter&&i===0&&end<=c.start+span+1e-6?{...enter,kind:'enter'}:exit&&i===boundaries.length-2&&start>=c.end-span-1e-6?{...exit,kind:'exit'}:null);
  let position='{\\an5\\pos('+px+','+py+')}';
  if(motion){
   const ox=Math.round(px+width*(motion.x||0)/100),oy=Math.round(py+height*(motion.y||0)/100),moved=motion.x||motion.y,scale=motion.scale&&Math.round(motion.scale*100);
   position='{\\an5'+(moved?(motion.kind==='enter'?`\\move(${ox},${oy},${px},${py},0,${ms})`:`\\move(${px},${py},${ox},${oy},0,${ms})`):`\\pos(${px},${py})`)+(motion.kind==='enter'?`\\fad(${ms},0)`:`\\fad(0,${ms})`)+(scale?(motion.kind==='enter'?`\\fscx${scale}\\fscy${scale}\\t(0,${ms},\\fscx100\\fscy100)`:`\\t(0,${ms},\\fscx${scale}\\fscy${scale})`):'')+'}';
  }
  if(c.renderPose){
   const pose=c.renderPose,alpha=color=>'&H'+Math.round(255-(255-parseInt(color.slice(2,4),16))*pose.opacity/100).toString(16).padStart(2,'0').toUpperCase()+'&';
   position='{\\an5\\pos('+Math.round(width*pose.x/100)+','+Math.round(height*pose.y/100)+')\\fscx'+Math.round(pose.scale*100)+'\\fscy'+Math.round(pose.scale*100)+'\\1a'+alpha(primary)+'\\2a'+alpha('&H00FFFFFF')+'\\3a'+alpha(glow?hexAss(style.glowColor||'#00e5ff'):outlineColour)+'\\4a'+alpha(back)+'}';
  }
  return `Dialogue: 0,${time(start)},${time(end)},Default,,${margin},${margin},0,,${position}{\\q2\\fs${Math.max(1,Math.round(width*style.size/100*layout.scale))}${glow?'\\blur'+Math.max(1,Math.round(glow*.8)):''}}${text}`;
 });
 }).join('\n');
}

export function captionStyle(value){
 const s=value||{font:'Anton',size:6.5,color:'#78ead4',position:'bottom',preset:'outline'};
 if(!FONT_FAMILIES.includes(s.font)||!Number.isFinite(s.size)||s.size<3||s.size>12||!/^#[a-fA-F0-9]{6}$/.test(s.color)||!['top','center','bottom'].includes(s.position)||!['clean','outline','boxed','highlight','karaoke'].includes(s.preset))throw new Error('Estilo de legenda inválido.');if((s.positionX!==undefined&&(!Number.isFinite(s.positionX)||s.positionX<5||s.positionX>95))||(s.accent!==undefined&&!/^#[a-fA-F0-9]{6}$/.test(s.accent))||(s.width!==undefined&&(!Number.isFinite(s.width)||s.width<40||s.width>95))||(s.positionY!==undefined&&(!Number.isFinite(s.positionY)||s.positionY<15||s.positionY>85)))throw Error('Estilo de legenda inválido.');
 const hex=v=>v===undefined||/^#[a-fA-F0-9]{6}$/.test(v),range=(v,min,max)=>v===undefined||Number.isFinite(v)&&v>=min&&v<=max,flag=v=>v===undefined||typeof v==='boolean';
 if(!hex(s.strokeColor)||!hex(s.shadowColor)||!hex(s.boxColor)||!range(s.strokeWidth,0,25)||!range(s.shadow,0,25)||!range(s.spacing,-5,50)||!range(s.boxOpacity,0,100)||![s.bold,s.italic,s.uppercase,s.hollow,s.accentLast].every(flag)||!hex(s.glowColor)||!range(s.glow,0,20)||[s.enter,s.exit].some(a=>a!==undefined&&!ANIMATION_IDS.includes(a)))throw Error('Estilo de texto inválido.');
 return s;
}

export function captionRuns(c,time,style){
 if(!c.tokens?.length)return [{text:c.text,active:false}];
 return c.tokens.map(t=>({text:t.text,active:['karaoke','highlight'].includes(style.preset)&&time>=t.start&&time<t.end}));
}
// Fit all words, never clip or hide overflowing lines. Pagination handles ordinary speech.
export function captionLayout(runs,measure,maxWidth,preserveBreaks=false){
 if(preserveBreaks){
  const paragraphs=runs.map(r=>r.text).join(' ').split(/\r?\n/);
  const layouts=paragraphs.map(text=>captionLayout([{text,active:false}],measure,maxWidth));
  const scale=Math.min(...layouts.map(l=>l.scale));
  return {scale,lines:paragraphs.flatMap(text=>captionLayout([{text,active:false}],t=>measure(t)*scale,maxWidth).lines)};
 }
 const words=runs.flatMap(r=>r.text.split(/\s+/).filter(Boolean).map(text=>({text,active:r.active,width:measure(text)})));
 const space=measure(' ');let scale=1,lines;
 do{lines=[[]];let used=0;for(const r of words){if(used&&used+space*scale+r.width*scale>maxWidth){lines.push([]);used=0;}lines.at(-1).push(r);used+=r.width*scale+space*scale;}if(lines.length<=2&&words.every(r=>r.width*scale<=maxWidth))break;scale*=.95;}while(scale>.001);
 return {lines,scale};
}
export function drawCaption(ctx,c,time,width,height,options){
 const style=captionStyle(options),baseSize=width*style.size/100,maxWidth=width*(style.width??85)/100;
 ctx.font=baseSize+'px "'+style.font+'"';
 const layout=captionLayout(captionRuns(c,time,style),t=>ctx.measureText(t).width,maxWidth),size=baseSize*layout.scale;
 ctx.font=size+'px "'+style.font+'"';ctx.textAlign='left';ctx.textBaseline='middle';ctx.lineWidth=style.preset==='clean'?2:6;ctx.strokeStyle='#101113';
 const space=ctx.measureText(' ').width;
 const center=height*(style.positionY!==undefined?style.positionY/100:style.position==='top'?.14:style.position==='center'?.5:.86);
 const bounds={x:width,y:center-layout.lines.length*size*.6,width:0,height:layout.lines.length*size*1.2};
 for(const [i,line] of layout.lines.entries()){
  const lineWidth=line.reduce((n,r)=>n+ctx.measureText(r.text).width,0)+Math.max(0,line.length-1)*space,y=center+(i-(layout.lines.length-1)/2)*size*1.2;let x=(width-lineWidth)/2;
  bounds.x=Math.min(bounds.x,x-8);bounds.width=Math.max(bounds.width,lineWidth+16);
  if(style.preset==='boxed'){ctx.fillStyle='#101113cc';ctx.fillRect(x-8,y-size*.6,lineWidth+16,size*1.2);}
  for(const r of line){const rw=ctx.measureText(r.text).width,boxed=style.preset==='karaoke'&&r.active;if(boxed){ctx.fillStyle=style.accent||'#eac39b';ctx.fillRect(x-4,y-size*.6,rw+8,size*1.2);}ctx.fillStyle=boxed?'#101113':r.active?(style.accent||'#eac39b'):style.color;if(!boxed)ctx.strokeText(r.text,x,y);ctx.fillText(r.text,x,y);x+=rw+space;}
 }
 return bounds;
}

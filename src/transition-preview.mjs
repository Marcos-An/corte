import {clipSpeed,clipDuration,zoomAt,zoomedCrop} from './clip-time.mjs';
import {hasAdjustments,adjustPixels} from './color-adjustments.mjs';
import {transitionAt} from './project.mjs';
const adjustedFrames=new WeakMap();
// Same clip framing for the base preview and both live transition sources.
export function paintClip(ctx,source,clip,crop=clip.crop){
 const {width,height}=ctx.canvas,iw=source.videoWidth||source.naturalWidth||source.width,ih=source.videoHeight||source.naturalHeight||source.height,sw=iw*crop.w,sh=ih*crop.h,scale=Math.min(width/sw,height/sh),dw=sw*scale,dh=sh*scale;
 let drawable=source,sx=iw*crop.x,sy=ih*crop.y,sampleWidth=sw,sampleHeight=sh;
 if(hasAdjustments(clip.adjustments)){
  let frame=adjustedFrames.get(ctx);if(!frame){frame=ctx.canvas.ownerDocument.createElement('canvas');adjustedFrames.set(ctx,frame);}
  const resolution=Math.min(1,Math.max(width/sw,height/sh)),w=Math.max(2,Math.round(sw*resolution)),h=Math.max(2,Math.round(sh*resolution));if(frame.width!==w||frame.height!==h){frame.width=w;frame.height=h;}
  const pixels=frame.getContext('2d',{willReadFrequently:true});pixels.clearRect(0,0,w,h);pixels.drawImage(source,iw*crop.x,ih*crop.y,sw,sh,0,0,w,h);const data=pixels.getImageData(0,0,w,h);adjustPixels(data.data,clip.adjustments,w);pixels.putImageData(data,0,0);
  drawable=frame;sx=0;sy=0;sampleWidth=w;sampleHeight=h;
 }
 ctx.fillStyle=clip.background==='color'?clip.backgroundColor:'#000';ctx.fillRect(0,0,width,height);
 if(clip.background==='blur'){const fill=Math.max(width/sw,height/sh),bw=sw*fill,bh=sh*fill;ctx.save();ctx.filter='blur('+width*.015+'px)';ctx.drawImage(drawable,sx,sy,sampleWidth,sampleHeight,(width-bw)/2,(height-bh)/2,bw,bh);ctx.restore();}
 ctx.drawImage(drawable,sx,sy,sampleWidth,sampleHeight,(width-dw)/2,(height-dh)/2,dw,dh);
}
export function createTransitionPreview(canvas,{media,image,playing,onFrame,error,loading}){
 const videos=[0,1].map(()=>{const v=document.createElement('video');v.hidden=true;v.className='transition-source';v.crossOrigin='anonymous';v.preload='auto';v.muted=true;v.playsInline=true;document.body.append(v);for(const event of ['loadedmetadata','loadeddata','seeked'])v.addEventListener(event,onFrame);v.addEventListener('error',()=>error('Não foi possível decodificar a mídia da transição. Relocalize o arquivo.',v.getAttribute('src')));return v;});
 const frames=videos.map(()=>document.createElement('canvas')),missing=new Set();
 function pause(){videos.forEach(v=>v.pause());}
 function source(p,clip,time,i,play,report=true){
  const a=p.assets.find(a=>a.id===clip.assetId),url=media(clip.assetId)?.url;
  if(!url){if(report&&!missing.has(a.id)){missing.add(a.id);error('Mídia da transição ausente. Relocalize o arquivo pela timeline.');}return null;}missing.delete(a.id);
  if(a.kind==='image')return image(a);const v=videos[i];v.playbackRate=clipSpeed(clip);if(v.getAttribute('src')!==url){v.src=url;v.load();}
  if(!play)v.pause();
  if(v.readyState>=1&&!v.seeking&&Math.abs(v.currentTime-time)>(play ? .12 : .012)){v.currentTime=time;return null;}
  if(play&&v.readyState>=2&&v.paused)v.play().catch(e=>error('Não foi possível reproduzir a transição: '+e.message));
  return v.readyState>=2&&!v.seeking&&Math.abs(v.currentTime-time)<(play ? .16 : .04)?v:null;
 }
 function draw(p,time){
  const at=transitionAt(p,time),play=playing();
  if(!at){
   pause();loading(false);
   // Prepare the upcoming handles before entering the window; no frozen endpoint is used.
   let cut=0;for(let i=0;i<p.clips.length-1;i++){cut+=clipDuration(p.clips[i]);const next=transitionAt(p,cut);if(next&&next.start>=time&&next.start-time<1){source(p,next.left,next.leftTime-next.duration/2*clipSpeed(next.left),0,false,false);source(p,next.right,next.rightTime-next.duration/2*clipSpeed(next.right),1,false,false);break;}}
   return null;
  }
  const a=source(p,at.left,at.leftTime,0,play),b=source(p,at.right,at.rightTime,1,play);if(!a||!b){loading(!missing.has(at.left.assetId)&&!missing.has(at.right.assetId));return false;}loading(false);
  for(const [i,s,c] of [[0,a,at.left],[1,b,at.right]]){if(frames[i].width!==canvas.width||frames[i].height!==canvas.height){frames[i].width=canvas.width;frames[i].height=canvas.height;}paintClip(frames[i].getContext('2d'),s,c,zoomedCrop(c.crop,zoomAt(c,((i?at.rightTime:at.leftTime)-c.in)/clipSpeed(c))));}
  const ctx=canvas.getContext('2d'),progress=at.progress;ctx.save();ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(at.type==='dissolve'){ctx.drawImage(frames[0],0,0);ctx.globalAlpha=progress;ctx.drawImage(frames[1],0,0);}
  else if(at.type==='fade'){ctx.globalAlpha=progress<.5?1-progress*2:progress*2-1;ctx.drawImage(frames[progress<.5?0:1],0,0);}
  else{ctx.drawImage(frames[0],-progress*canvas.width,0);ctx.drawImage(frames[1],(1-progress)*canvas.width,0);}
  ctx.restore();return true;
 }
 return {draw,pause};
}

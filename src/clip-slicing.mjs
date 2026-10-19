import {clipDuration,clipSpeed,zoomAt} from './clip-time.mjs';
// Preserve the source's visual/audio curves when an adjustment creates editor pieces.
export function sliceClip(clip,start,end,id=clip.id,{preserveFades=false}={}){
 const piece={...structuredClone(clip),id,in:start,out:end};
 if(clip.zoom)piece.zoom={from:zoomAt(clip,(start-clip.in)/clipSpeed(clip)),to:zoomAt(clip,(end-clip.in)/clipSpeed(clip))};
 if(clip.fadeWindow||preserveFades&&(clip.fadeIn||clip.fadeOut)){
  const window=clip.fadeWindow||{offset:0,duration:clipDuration(clip),scale:1};
  piece.fadeWindow={...window,offset:window.offset+(start-clip.in)/clipSpeed(clip)*window.scale};
 }
 return piece;
}

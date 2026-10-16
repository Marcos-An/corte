// Source intervals are immutable media coordinates; all editor durations use montage seconds.
export const clipSpeed=c=>c.speed??1;
export const clipDuration=c=>(c.out-c.in)/clipSpeed(c);
export const sourceTime=(c,localTime)=>c.in+localTime*clipSpeed(c);
export const montageTime=(c,source)=>(source-c.in)/clipSpeed(c);
// Smooth zoom: a factor from `zoom.from` to `zoom.to` over the clip, centred on its framing. Preview and export share it.
export const zoomAt=(c,localTime)=>c.zoom?c.zoom.from+(c.zoom.to-c.zoom.from)*Math.min(1,Math.max(0,localTime/clipDuration(c))):1;
export const zoomedCrop=(crop,z)=>z===1?crop:{x:crop.x+crop.w*(1-1/z)/2,y:crop.y+crop.h*(1-1/z)/2,w:crop.w/z,h:crop.h/z};

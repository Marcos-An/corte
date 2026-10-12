// Seconds in montage time. Both preview and FFmpeg use linear, multiplicative ramps.
export function audioFades(c,length){return {fadeIn:Math.min(c.fadeIn||0,length),fadeOut:Math.min(c.fadeOut||0,length)};}
export function audioLevel(c,time,length){
 const {fadeIn,fadeOut}=audioFades(c,length);
 if(time<0||time>length)return 0;
 return c.volume*(fadeIn?Math.min(1,time/fadeIn):1)*(fadeOut?Math.min(1,(length-time)/fadeOut):1);
}
export function audioFadeFilter(c,length){
 const {fadeIn,fadeOut}=audioFades(c,length);
 return (fadeIn?',afade=t=in:st=0:d='+fadeIn:'')+(fadeOut?',afade=t=out:st='+(length-fadeOut)+':d='+fadeOut:'');
}

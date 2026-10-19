// Seconds in montage time. Both preview and FFmpeg use linear, multiplicative ramps.
export function audioFades(c,length){const limit=c.fadeWindow?.duration??length;return {fadeIn:Math.min(c.fadeIn||0,limit),fadeOut:Math.min(c.fadeOut||0,limit)};}
export function audioLevel(c,time,length){
 const {fadeIn,fadeOut}=audioFades(c,length);
 if(time<0||time>length)return 0;
 const at=c.fadeWindow?c.fadeWindow.offset+time*c.fadeWindow.scale:time,total=c.fadeWindow?.duration??length;return c.volume*(fadeIn?Math.max(0,Math.min(1,at/fadeIn)):1)*(fadeOut?Math.max(0,Math.min(1,(total-at)/fadeOut)):1);
}
export function audioFadeFilter(c,length){
 const {fadeIn,fadeOut}=audioFades(c,length);
 if(c.fadeWindow&&(fadeIn||fadeOut)){const w=c.fadeWindow,t=`(t*${w.scale}+${w.offset})`,parts=[];if(fadeIn)parts.push(`clip(${t}/${fadeIn},0,1)`);if(fadeOut)parts.push(`clip((${w.duration}-${t})/${fadeOut},0,1)`);return `,aeval='val(ch)*${parts.join('*')}':c=same`;}
 return (fadeIn?',afade=t=in:st=0:d='+fadeIn:'')+(fadeOut?',afade=t=out:st='+(length-fadeOut)+':d='+fadeOut:'');
}

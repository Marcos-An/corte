// RGB-space operations in a fixed order, shared by canvas preview and FFmpeg.
export const DEFAULT_ADJUSTMENTS={brightness:0,contrast:1,saturation:1};
export function hasAdjustments(a){return !!a&&(a.brightness!==0||a.contrast!==1||a.saturation!==1);}
export function adjustPixels(data,a){
 if(!hasAdjustments(a))return data;
 const lut=new Float64Array(256);for(let v=0;v<256;v++)lut[v]=Math.max(0,Math.min(255,(v-127.5)*a.contrast+127.5+a.brightness*255));
 for(let i=0;i<data.length;i+=4){const r=lut[data[i]],g=lut[data[i+1]],b=lut[data[i+2]],l=.2126*r+.7152*g+.0722*b;data[i]=l+(r-l)*a.saturation;data[i+1]=l+(g-l)*a.saturation;data[i+2]=l+(b-l)*a.saturation;}
 return data;
}
export function adjustmentFilter(a,preserveAlpha=false){
 if(!hasAdjustments(a))return '';
 const expression="clip((val-127.5)*"+a.contrast+"+127.5+"+a.brightness*255+",0,255)",s=a.saturation,z=1-s;
 return "format="+(preserveAlpha?'rgba':'rgb24')+",lutrgb=r='"+expression+"':g='"+expression+"':b='"+expression+"',colorchannelmixer=rr="+(s+z*.2126)+":rg="+(z*.7152)+":rb="+(z*.0722)+":gr="+(z*.2126)+":gg="+(s+z*.7152)+":gb="+(z*.0722)+":br="+(z*.2126)+":bg="+(z*.7152)+":bb="+(s+z*.0722)+",";
}

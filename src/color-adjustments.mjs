// RGB-space operations in a fixed order, shared by canvas preview and FFmpeg.
// Temperature scales red up and blue down (or the reverse); sharpness is an unsharp mask. Both are optional so
// projects saved with only brightness/contrast/saturation keep rendering unchanged.
export const DEFAULT_ADJUSTMENTS={brightness:0,contrast:1,saturation:1,temperature:0,sharpness:0};
const full=a=>({...DEFAULT_ADJUSTMENTS,...a}),gains=t=>[1+.12*t,1-.12*t];
export function hasAdjustments(a){if(!a)return false;const f=full(a);return f.brightness!==0||f.contrast!==1||f.saturation!==1||f.temperature!==0||f.sharpness>0;}
export function adjustPixels(data,a,width=0){
 if(!hasAdjustments(a))return data;const f=full(a),[red,blue]=gains(f.temperature);
 const lut=new Float64Array(256);for(let v=0;v<256;v++)lut[v]=Math.max(0,Math.min(255,(v-127.5)*f.contrast+127.5+f.brightness*255));
 for(let i=0;i<data.length;i+=4){const r=lut[data[i]],g=lut[data[i+1]],b=lut[data[i+2]],l=.2126*r+.7152*g+.0722*b;data[i]=(l+(r-l)*f.saturation)*red;data[i+1]=l+(g-l)*f.saturation;data[i+2]=(l+(b-l)*f.saturation)*blue;}
 if(f.sharpness>0&&width>0){
  // Preview approximation of the export's unsharp mask: a 4-neighbour Laplacian boost.
  const src=Uint8ClampedArray.from(data),height=data.length/4/width,at=(x,y,c)=>src[(Math.min(height-1,Math.max(0,y))*width+Math.min(width-1,Math.max(0,x)))*4+c];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){const v=at(x,y,c);data[(y*width+x)*4+c]=v+f.sharpness*.5*(4*v-at(x-1,y,c)-at(x+1,y,c)-at(x,y-1,c)-at(x,y+1,c));}
 }
 return data;
}
export function adjustmentFilter(a,preserveAlpha=false){
 if(!hasAdjustments(a))return '';
 const f=full(a),[red,blue]=gains(f.temperature),format=preserveAlpha?'rgba':'rgb24';
 const expression="clip((val-127.5)*"+f.contrast+"+127.5+"+f.brightness*255+",0,255)",s=f.saturation,z=1-s;
 const mixer="colorchannelmixer=rr="+(s+z*.2126)*red+":rg="+(z*.7152)*red+":rb="+(z*.0722)*red+":gr="+(z*.2126)+":gg="+(s+z*.7152)+":gb="+(z*.0722)+":br="+(z*.2126)*blue+":bg="+(z*.7152)*blue+":bb="+(s+z*.0722)*blue+",";
 return "format="+format+",lutrgb=r='"+expression+"':g='"+expression+"':b='"+expression+"',"+mixer+(f.sharpness>0?"unsharp=5:5:"+Number((1.5*f.sharpness).toFixed(3))+":5:5:0,format="+format+",":'');
}

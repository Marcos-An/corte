import {shapeAss} from '../src/shapes.mjs';import {animated,assFrameInterval} from '../src/keyframes.mjs';import {blurRadius} from '../src/blur.mjs';
export function blurMaskAss(t,width,height,window=null){
 const shape={...t,type:t.blurShape==='ellipse'?'circle':'rectangle',fill:'#ffffff',stroke:null,strokeWidth:0};
 if(animated(t))return shapeAss(shape,width,height,window);
 const interval=assFrameInterval(Math.max(t.start,window?.start??t.start),Math.min(t.end,window?.end??t.end));
 return interval?shapeAss({...shape,...interval},width,height):shapeAss(shape,width,height).split('Dialogue:')[0];
}
export function blurFilterGraph(t,previous,next,width,maskPath,fonts,escape){
 const enabled=`gte(t,${t.start})*lt(t,${t.end})`,prefix=next+'_blur';
 // RGB mask channels carry the same alpha. A converted gray YUV mask would leave chroma half blurred outside the region.
 return [`[${previous}]format=gbrp,split=3[${prefix}_sharp][${prefix}_input][${prefix}_black]`,
 `[${prefix}_input]gblur=sigma=${blurRadius(t,width)}:steps=3:enable='${enabled}'[${prefix}_soft]`,
 `[${prefix}_black]lutrgb=r=0:g=0:b=0,ass='${escape(maskPath)}':fontsdir='${escape(fonts)}'[${prefix}_mask]`,
 `[${prefix}_sharp][${prefix}_soft][${prefix}_mask]maskedmerge=planes=15[${next}]`];
}

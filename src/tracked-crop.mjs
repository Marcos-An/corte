// Stored in source seconds so trims, reordering and speed changes keep the target.
export function cropAt(clip,local=0){
 const points=clip.cropTrack;if(!points?.length)return clip.crop;const time=clip.in+(clip.freeze?0:local*(clip.speed??1)),left=points.findLast(p=>p.time<=time)||points[0],right=points.find(p=>p.time>time)||points.at(-1),f=right.time===left.time?0:Math.max(0,Math.min(1,(time-left.time)/(right.time-left.time)));
 return {...clip.crop,x:left.x+(right.x-left.x)*f,y:left.y+(right.y-left.y)*f};
}
export function validateCropTrack(clip,asset){
 if(clip.cropTrack===undefined)return;let previous=-1;
 if(!Array.isArray(clip.cropTrack)||!clip.cropTrack.length||clip.cropTrack.length>200||asset.kind==='image')throw Error('Acompanhamento de enquadramento inválido.');
 for(const p of clip.cropTrack){if(!p||Object.keys(p).length!==3||!['time','x','y'].every(k=>Number.isFinite(p[k]))||p.time<=previous||p.time<0||p.time>asset.duration+.000001||p.x<0||p.y<0||p.x+clip.crop.w>1.000001||p.y+clip.crop.h>1.000001)throw Error('Trajetória fora da imagem ou da mídia.');previous=p.time;}
}
export function cropExpression(clip,field){
 const points=clip.cropTrack;if(!points?.length)return String(clip.crop[field]);const clock=clip.freeze?String(clip.in):`(${clip.in}+t*${clip.speed??1})`;
 return String(points[0][field])+points.slice(1).map((p,i)=>{const left=points[i],delta=p[field]-left[field];return Math.abs(delta)<1e-12?'':`+(${delta})*clip((${clock}-${left.time})/${p.time-left.time},0,1)`;}).join('');
}

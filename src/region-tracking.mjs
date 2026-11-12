import {validateProject,clipAt,applyPlan,editShapeLayer} from './project.mjs';
import {clipDuration,zoomAt,zoomedCrop,sourceTime} from './clip-time.mjs';
import {cropAt} from './tracked-crop.mjs';
import {applyKeyframes} from './keyframes.mjs';
export const TRACK_MAX_SECONDS=30;
// Geometry is normalized to the decoded (rotation-corrected) source and canvas.
export function framing(project,clip,local){
 const a=project.assets.find(a=>a.id===clip.assetId),crop=zoomedCrop(cropAt(clip,local),zoomAt(clip,local)),[w,h]=project.aspect.split(':').map(Number),ratio=w/h,scale=Math.min(ratio/(a.width*crop.w),1/(a.height*crop.h)),dw=a.width*crop.w*scale,dh=a.height*crop.h*scale;
 return {crop,dx:(ratio-dw)/2/ratio,dy:(1-dh)/2,dw:dw/ratio,dh};
}
export function trackingRequest(project,layerId){
 validateProject(project);const layer=project.shapeLayers?.find(t=>t.id===layerId&&t.type==='blur');if(!layer)throw Error('Selecione uma área de desfoque.');
 if(layer.end-layer.start>TRACK_MAX_SECONDS)throw Error('Acompanhe até 30 s por vez. Divida trechos longos para revisar o alvo.');
 const found=clipAt(project,layer.start),clip=found?.clip;if(!clip||layer.end>found.start+clipDuration(clip)+1e-7)throw Error('A área deve ficar dentro de um único trecho. Divida o acompanhamento nos cortes.');
 const a=project.assets.find(a=>a.id===clip.assetId);if(a.kind==='image'||clip.freeze)throw Error('Um quadro parado não precisa de acompanhamento.');
 if(layer.rotation||layer.motion)throw Error('Remova a rotação e as animações de entrada/saída antes de acompanhar.');
 if(project.videoLayers?.some(t=>t.start<layer.end&&t.end>layer.start))throw Error('Acompanhe a imagem principal em um intervalo sem vídeos sobrepostos.');
 if(project.transitions?.some(t=>{const index=project.clips.findIndex(c=>c.id===t.leftId),cut=project.clips.slice(0,index+1).reduce((s,c)=>s+clipDuration(c),0);return layer.start<cut+t.duration/2&&layer.end>cut-t.duration/2;}))throw Error('Selecione um intervalo fora das transições.');
 const pose=applyKeyframes(layer,layer.start),f=framing(project,clip,layer.start-found.start),region={x:f.crop.x+(pose.x/100-f.dx)/f.dw*f.crop.w,y:f.crop.y+(pose.y/100-f.dy)/f.dh*f.crop.h,w:pose.width/100/f.dw*f.crop.w,h:pose.height/100/f.dh*f.crop.h};
 if(region.x-region.w/2<0||region.y-region.h/2<0||region.x+region.w/2>1||region.y+region.h/2>1)throw Error('A região precisa ficar inteiramente dentro da imagem, sem as bordas do fundo.');
 return {layer,clip,clipStart:found.start,asset:a,region};
}
// Douglas–Peucker in pose space keeps sub-pixel interpolation error at preview
// resolution, without overflowing the editor's existing 200-keyframe limit.
export function simplifyTrack(points,tolerance=.12){
 const kept=new Set([0,points.length-1]),visit=(a,b)=>{let error=tolerance,index=-1;for(let i=a+1;i<b;i++){const t=(points[i].time-points[a].time)/(points[b].time-points[a].time);const e=Math.max(...['x','y','size'].map(k=>Math.abs(points[i][k]-(points[a][k]+(points[b][k]-points[a][k])*t))));if(e>error){error=e;index=i;}}if(index>=0){kept.add(index);visit(a,index);visit(index,b);}};if(points.length>2)visit(0,points.length-1);return [...kept].sort((a,b)=>a-b).map(i=>points[i]);
}
export function trackedBlur(project,layerId,result){
 const {layer,clip,clipStart}=trackingRequest(project,layerId);if(result.status!=='complete')throw Error('O acompanhamento parou. Ajuste o intervalo antes de aplicar.');
 const keyframes=result.points.map(p=>{const f=framing(project,clip,layer.start-clipStart+p.time);return {time:p.time,x:(f.dx+(p.x-f.crop.x)/f.crop.w*f.dw)*100,y:(f.dy+(p.y-f.crop.y)/f.crop.h*f.dh)*100,size:p.w/f.crop.w*f.dw*100,opacity:layer.opacity,easing:'linear'};});
 const simplified=simplifyTrack(keyframes);if(simplified.length>200)throw Error('Movimento muito complexo. Divida o intervalo para manter a precisão.');
 const q=structuredClone(project),target=q.shapeLayers.find(t=>t.id===layerId);target.keyframes=simplified;return validateProject(q);
}
export function trackedReframe(project,layerId,result){
 const {layer,clip,clipStart,asset,region}=trackingRequest(project,layerId);if(result.status!=='complete')throw Error('O acompanhamento precisa estar completo.');if(clip.zoom)throw Error('Remova o zoom animado antes de reenquadrar.');
 const [aw,ah]=project.aspect.split(':').map(Number),ratio=aw/ah,sourceRatio=asset.width/asset.height;
 let w=Math.max(.05,region.w*2,region.h*2*ratio/sourceRatio),h=w*sourceRatio/ratio;if(w>1){h/=w;w=1;}if(h>1){w/=h;h=1;}if(w<.05||h<.05)throw Error('Formato estreito demais para acompanhar este alvo.');
 const points=simplifyTrack(result.points.map(p=>({time:sourceTime(clip,layer.start-clipStart+p.time),x:Math.max(0,Math.min(1-w,p.x-w/2))*100,y:Math.max(0,Math.min(1-h,p.y-h/2))*100,size:0}))).map(p=>({time:p.time,x:p.x/100,y:p.y/100}));if(points.length>200)throw Error('Divida o intervalo para preservar a trajetória.');
 const crop={x:points[0].x,y:points[0].y,w,h},q=applyPlan(project,{summary:'Acompanhar enquadramento',questions:[],unsupported:[],operations:[{type:'adjust_timeline',clipId:clip.id,start:layer.start-clipStart,end:layer.end-clipStart,patch:{crop}}]});
 const target=clipAt(q,(layer.start+layer.end)/2).clip;target.cropTrack=points;
 return validateProject(editShapeLayer(q,layerId,null));
}

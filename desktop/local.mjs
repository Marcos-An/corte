import path from 'node:path';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {existsSync} from 'node:fs';
export function frameDirectory(root,assetId){return path.join(root,createHash('sha256').update(assetId).digest('hex'));}
export const MODEL_ID='Xenova/clip-vit-base-patch32';
export function modelPath(){const packed=process.resourcesPath&&path.join(process.resourcesPath,'models');return packed&&existsSync(packed)?packed:path.resolve(import.meta.dirname,'../vendor/models');}
export function cosineDistance(a,b){let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?Math.max(0,1-dot/Math.sqrt(aa*bb)):0;}
export function pixelMetrics(image){
 const {data,width:w,height:h,channels:c}=image;let sum=0,square=0,n=0,light=0,count=0;
 const gray=(x,y)=>{const i=(y*w+x)*c;return c<3?data[i]:(data[i]+data[i+1]+data[i+2])/3;};
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const v=gray(x,y),lap=gray(x-1,y)+gray(x+1,y)+gray(x,y-1)+gray(x,y+1)-4*v;sum+=lap;square+=lap*lap;n++;light+=v;count++;}
 return {sharpness:n?square/n-(sum/n)**2:0,brightness:count?light/count:0};
}
export function selectEvidence(samples,max=60){
 if(!Number.isInteger(max)||max<2)throw new Error('Orçamento de imagens inválido.');if(samples.length<=max)return samples.map(s=>s.time);
 const times=new Set(),add=i=>{if(i>=0&&i<samples.length&&times.size<max)times.add(samples[i].time);};
 const coverage=Math.max(2,Math.ceil(max/3));for(let i=0;i<coverage;i++)add(Math.round(i*(samples.length-1)/(coverage-1)));
 const sharp=[...samples].map(s=>s.sharpness??s.blur??0).sort((a,b)=>a-b),median=sharp[Math.floor(sharp.length/2)]||1;
 const candidates=samples.map((s,i)=>({i,score:(s.change||0)+Math.min(1,Math.max(0,1-(s.sharpness??s.blur??median)/median))*.25})).sort((a,b)=>b.score-a.score),centers=[];
 for(const {i}of candidates){if(centers.some(j=>Math.abs(samples[j].time-samples[i].time)<1))continue;centers.push(i);for(const offset of [0,-1,1,-2,2])add(i+offset);if(times.size>=max)break;}
 return [...times].sort((a,b)=>a-b);
}
export function refinementTimes(project,plan,overview=[],max=60){
 const borders=[];for(const op of plan.operations||[]){const c=project.clips.find(c=>c.id===op.clipId);if(!c)continue;const ranges=['keep_ranges','remove_ranges'].includes(op.type)?op.ranges:op.type==='trim'?[[op.in,op.out]]:op.type==='split'?[[op.time,op.time]]:[];for(const range of ranges)for(const edge of range)if(Number.isFinite(edge))borders.push({assetId:c.assetId,time:edge});}
 if(!borders.length)return [];
 const result=[],seen=new Set();const add=f=>{const asset=project.assets.find(a=>a.id===f.assetId);if(!asset||f.time<0||f.time>=asset.duration||result.length>=max)return;const time=Number(f.time.toFixed(3)),key=f.assetId+':'+time;if(!seen.has(key)){seen.add(key);result.push({assetId:f.assetId,time});}};
 // Retain context from every asset, even while inspecting proposed boundaries.
 for(const f of overview.filter((_,i)=>i%Math.max(1,Math.floor(overview.length/12))===0))add(f);
 for(const offset of [0,-.25,.25,-.5,.5,-1,1])for(const f of borders)add({assetId:f.assetId,time:f.time+offset});
 return result.sort((a,b)=>a.assetId.localeCompare(b.assetId)||a.time-b.time);
}
export function scanLocally({project,registry,directory,step=2,signal,onProgress=()=>{}}){
 if(signal?.aborted)return Promise.reject(new Error('Análise cancelada.'));
 const assets=[...new Set(project.clips.map(c=>c.assetId))].map(id=>({id,...project.assets.find(a=>a.id===id),file:registry.get(id)?.path}));
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./local-worker.mjs',import.meta.url),{workerData:{assets,directory,models:modelPath(),step}});let settled=false;
  const cancel=()=>worker.postMessage({cancel:true});signal?.addEventListener('abort',cancel,{once:true});
  const finish=(error,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);worker.terminate();error?reject(error):resolve(value);};
  worker.on('message',m=>{if(m.progress)onProgress(m.progress);else if(m.error)finish(new Error(m.error));else if(m.result)finish(signal?.aborted?new Error('Análise cancelada.'):null,m.result);});
  worker.on('error',()=>finish(new Error('A análise local não iniciou. Reinstale o aplicativo completo.')));worker.on('exit',code=>{if(!settled)finish(new Error(`Análise local interrompida (${code}).`));});
 });
}

// Experimental quality-only hysteresis, NOT a semantic visibility classifier.
export function refineBorders(rows,median,duration){
 const ranges=[];let start=null;
 for(let i=0;i<rows.length;i++){
  if(start===null&&rows[i].sharpness<median*.2){let j=i;while(j>0&&rows[j-1].sharpness<median*.8)j--;start=j===0?0:(rows[j-1].time+rows[j].time)/2;}
  if(start!==null&&rows[i].sharpness>=median*.8&&rows.slice(i,i+3).length===3&&rows.slice(i,i+3).every(r=>r.sharpness>=median*.8)){
   ranges.push([start,rows[i+2].time]);start=null;
  }
 }
 if(start!==null)ranges.push([start,duration]);return ranges;
}
import {spawn} from 'node:child_process';
import {binaries} from './media.mjs';
import {validateProject,validatePlan,applyPlan} from '../src/project.mjs';
export async function scanQuality(file,{signal,onProgress=()=>{}}={}){
 if(signal?.aborted)throw new Error('Análise cancelada.');
 const width=96,height=170,size=width*height,rows=[];let pending=Buffer.alloc(0);
 await new Promise((resolve,reject)=>{
  const child=spawn(binaries().ffmpeg,['-v','error','-i',file,'-an','-vf',`fps=10:start_time=0,scale=${width}:${height}`,'-pix_fmt','gray','-f','rawvideo','pipe:1'],{signal,windowsHide:true});
  const timer=setTimeout(()=>child.kill(),1800000);let settled=false;
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve();};
  child.stderr.resume();child.on('error',error=>{if(error.name==='AbortError')return;finish(new Error(signal?.aborted?'Análise cancelada.':'Não foi possível iniciar a análise local.'));});
  child.stdout.on('data',chunk=>{pending=Buffer.concat([pending,chunk]);while(pending.length>=size){const image=pending.subarray(0,size);let sum=0,squares=0,n=0;
   for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const i=y*width+x,lap=image[i-1]+image[i+1]+image[i-width]+image[i+width]-4*image[i];sum+=lap;squares+=lap*lap;n++;}
   rows.push({time:rows.length/10,sharpness:squares/n-(sum/n)**2});pending=pending.subarray(size);
   if(rows.length%100===0)onProgress({stage:'quality',seconds:rows.length/10});
  }});
  child.on('close',code=>finish(signal?.aborted?new Error('Análise cancelada.'):code===0?null:new Error('A análise local falhou ou excedeu o tempo limite.')));
 });
 if(!rows.length||pending.length)throw new Error('Análise local sem frames válidos.');return {rows};
}
export async function requestQualityPlan({project,registry,signal,onProgress,scan=scanQuality}){
 validateProject(project);if(signal?.aborted)throw new Error('Análise cancelada.');
 if(!project.clips.length)throw new Error('Adicione um vídeo à timeline.');
 const operations=[];let frames=0;const start=performance.now();
 for(const id of new Set(project.clips.map(c=>c.assetId))){
  const file=registry.get(id)?.path;if(!file)throw new Error('Mídia ausente.');
  const asset=project.assets.find(a=>a.id===id),{rows}=await scan(file,{signal,onProgress});
  if(signal?.aborted)throw new Error('Análise cancelada.');
  const sorted=rows.map(r=>r.sharpness).sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
  if(!Number.isFinite(median)||median<=0||asset.duration-rows.at(-1)?.time>.21)throw new Error('Análise inconclusiva ou sem cobertura completa. Nenhum corte foi aplicado.');
  frames+=rows.length;const ranges=refineBorders(rows,median,asset.duration);
  for(const clip of project.clips.filter(c=>c.assetId===id)){
   const selected=ranges.map(([s,e])=>[Math.max(s,clip.in),Math.min(e,clip.out)]).filter(([s,e])=>e>s);
   if(selected.reduce((n,[s,e])=>n+e-s,0)>=clip.out-clip.in-.02)throw new Error('A análise removeria todo o trecho. Nenhum corte foi aplicado.');
   if(selected.length)operations.push({type:'remove_ranges',clipId:clip.id,ranges:selected});
  }
 }
 const plan={summary:'Detector local de baixa nitidez com recuperação estável.',operations,questions:[],unsupported:[]};validatePlan(project,plan);applyPlan(project,plan);
 return {plan,frames,elapsedMs:Math.round(performance.now()-start)};
}

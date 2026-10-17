import path from 'node:path';
import {createHash} from 'node:crypto';
import {runVisualProcess} from './visual-process.mjs';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {PREVIEW_SCALE,PREVIEW_PNG} from './media.mjs';
import {cachedEvidence} from './analysis-cache.mjs';
import {visualBackend} from './inference-profile.mjs';
export function frameDirectory(root,assetId){return path.join(root,createHash('sha256').update(assetId).digest('hex').slice(0,32));}
export const MODEL_ID='Xenova/clip-vit-base-patch32';
export function modelPath(){const saved=process.env.CORTE_MODEL_PATH;if(saved&&existsSync(saved))return saved;const packed=process.resourcesPath&&path.join(process.resourcesPath,'models');return packed&&existsSync(packed)?packed:path.resolve(import.meta.dirname,'../vendor/models');}
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
 // Coverage is spread over time, not over list positions: candidate lists cluster around changes.
 const first=samples[0].time,last=samples.at(-1).time,coverage=Math.max(2,Math.ceil(max/3)),step=(last-first)/(samples.length-1)||1;
 for(let k=0;k<coverage;k++){const target=first+k*(last-first)/(coverage-1);let best=0;for(let i=1;i<samples.length;i++)if(Math.abs(samples[i].time-target)<=Math.abs(samples[best].time-target))best=i;add(best);}
 const sharp=[...samples].map(s=>s.sharpness??s.blur??0).sort((a,b)=>a-b),median=sharp[Math.floor(sharp.length/2)]||1;
 const candidates=samples.map((s,i)=>({i,score:(s.change||0)+Math.min(1,Math.max(0,1-(s.sharpness??s.blur??median)/median))*.25})).sort((a,b)=>b.score-a.score),centers=[];
 for(const {i}of candidates){if(centers.some(j=>Math.abs(samples[j].time-samples[i].time)<1))continue;centers.push(i);for(const offset of [0,-1,1,-2,2])if(Math.abs((samples[i+offset]?.time??Infinity)-samples[i].time)<=Math.abs(offset)*step*1.5)add(i+offset);if(times.size>=max)break;}
 return [...times].sort((a,b)=>a-b);
}
// Cheap RGB screening precedes semantic inference; neither is proof of an event.
export function pixelChange(a,b){
 if(!a||a.data.length!==b.data.length)return 0;
 let delta=0;for(let i=0;i<a.data.length;i++)delta+=Math.abs(a.data[i]-b.data[i]);
 return a.data.length?delta/(255*a.data.length):0;
}
export function visualCandidates(samples,assetCount){
 const times=new Set(selectEvidence(samples,Math.max(12,Math.floor(96/assetCount))));
 return samples.filter(s=>times.has(s.time));
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
export async function scanLocally({project,registry,directory,cache,step=2,signal,onProgress=()=>{},index=false}){
 if(signal?.aborted)return Promise.reject(new Error('Análise cancelada.'));
 const assets=[...new Set(project.clips.map(c=>c.assetId))].map(id=>({id,...project.assets.find(a=>a.id===id),file:registry.get(id)?.path}));
 const models=modelPath(),manifest=cache?await readFile(path.join(models,'manifest.json'),'utf8'):null;
 return cachedEvidence({root:cache&&path.join(cache,'local-evidence'),kind:'vision',assets,configuration:{version:1,manifest,step,index},signal,
  onHit:()=>onProgress({stage:'local',completed:assets.length,total:assets.length,cached:true}),
  compute:folder=>runVisualProcess({data:{assets,directory:folder||directory,models,step,index},backend:visualBackend(),signal,onProgress})});
}

// Screening thumbnails and the preview pool share one decode; the second full decode was the dominant cost on 4K HEVC.
export function samplingArgs(file,fps,folder,{kind,duration}={}){
 if(!Number.isFinite(fps)||fps<=0)throw Error('Amostragem visual inválida.');
 if(kind==='image'&&(!Number.isFinite(duration)||duration<=0||duration>21600))throw Error('Duração da imagem inválida.');
 return ['-hide_banner','-loglevel','error','-y','-progress','pipe:1','-nostats',...(kind==='image'?['-loop','1','-t',String(duration)]:['-hwaccel','auto']),'-i',file,'-filter_complex',`[0:v]fps=${fps}:start_time=0,split=2[a][b];[a]scale=96:-2,format=rgb24[s];[b]${PREVIEW_SCALE},format=rgb24[p]`,
  '-map','[s]',...PREVIEW_PNG,path.join(folder,'%06d.png'),'-map','[p]',...PREVIEW_PNG,path.join(folder,'pool-%06d.png')];
}
// Distance to the previous candidate grows with the time between them; the frame one step earlier measures the change itself.
export async function semanticChanges(samples,candidates,embed){
 const index=new Map(samples.map((s,i)=>[s.time,i])),vectors=new Map(),vector=async i=>{if(!vectors.has(i))vectors.set(i,await embed(i));return vectors.get(i);};
 for(const c of candidates){const i=index.get(c.time);c.change=i>0?cosineDistance(await vector(i-1),await vector(i)):0;}
 return candidates;
}
// Text-to-image search over the per-second index: best frames per query, at least `spacing` seconds apart within an asset.
export function searchFrames(index,queries,{k=3,spacing=2}={}){
 const found=[];
 for(const {query,vector} of queries){
  const ranked=index.map(f=>({...f,score:f.vector.reduce((s,x,i)=>s+x*vector[i],0)})).sort((a,b)=>b.score-a.score),picked=[];
  for(const f of ranked){if(picked.length>=k)break;if(picked.some(p=>p.assetId===f.assetId&&Math.abs(p.time-f.time)<spacing))continue;picked.push(f);}
  found.push(...picked.map(({assetId,time,path,score})=>({assetId,time,path,score:Number(score.toFixed(4)),match:query})));
 }
 return found;
}
// Frames far below the asset's median sharpness, as [start,end) source ranges.
// `reference` is the project-wide median: a clip blurry from start to end has nothing sharper inside it to compare with.
export function blurryRanges(samples,ratio=.3,reference=null){
 if(!samples.length||reference===null&&samples.length<3)return [];
 const sorted=samples.map(s=>s.sharpness).sort((a,b)=>a-b),limit=(reference??sorted[Math.floor(sorted.length/2)])*ratio,step=samples.length>1?samples[1].time-samples[0].time:1,ranges=[];
 for(const s of samples){if(s.sharpness>=limit)continue;const last=ranges.at(-1);if(last&&Math.abs(last[1]-s.time)<1e-6)last[1]=s.time+step;else ranges.push([s.time,s.time+step]);}
 return ranges;
}
// The search encoder ships in its own manifest: code-only Windows updates may lack it, and search then turns off.
async function optionalModel(manifestFile,override){
 const manifest=JSON.parse(await readFile(path.resolve(import.meta.dirname,'../vendor/models',manifestFile),'utf8'));
 const folders=[override,modelPath(),process.resourcesPath&&path.join(process.resourcesPath,'models'),path.resolve(import.meta.dirname,'../vendor/models')].filter(Boolean);
 const folder=folders.find(dir=>manifest.files.every(f=>existsSync(path.join(dir,f.path))));
 return folder?{path:folder,manifest}:null;
}
export function searchModels(){return optionalModel('search-manifest.json',process.env.CORTE_SEARCH_MODEL_PATH);}
// Whisper large-v3-turbo: far better Portuguese than the bundled whisper-small, downloaded on demand from Settings.
export function accurateSpeechModel(){return optionalModel('speech-accurate-manifest.json',process.env.CORTE_SPEECH_MODEL_PATH);}
export async function embedQueries({texts,signal}){
 const found=await searchModels();if(!found)return null;
 return runVisualProcess({data:{texts,models:found.path,manifest:found.manifest},backend:'cpu',signal,onProgress:()=>{}});
}

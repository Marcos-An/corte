// Times the local analysis on the target workload: 12 clips adding up to ~7 minutes. Synthetic media only.
// Usage: node scripts/bench-analysis.mjs [--res=4k|1080] [--codec=hevc|h264] [--clips=12] [--seconds=35]
// Prints one JSON line with per-stage times, backend and fallback; paste that back, never the media.
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir,cpus,totalmem} from 'node:os';import path from 'node:path';
import {run,binaries,probe} from '../desktop/media.mjs';import {runVisualProcess} from '../desktop/visual-process.mjs';import {modelPath} from '../desktop/local.mjs';import {transcribeLocally} from '../desktop/transcribe.mjs';
import {createProject,addAsset,addClip} from '../src/project.mjs';
const arg=(k,d)=>process.argv.find(a=>a.startsWith(`--${k}=`))?.split('=')[1]??d;
const res=arg('res','4k'),codec=arg('codec','hevc'),clips=Number(arg('clips','12')),seconds=Number(arg('seconds','35'));
const size=res==='4k'?'2160x3840':'1080x1920',encoder=codec==='hevc'?['-c:v','libx265','-preset','ultrafast','-tag:v','hvc1']:['-c:v','libx264','-preset','ultrafast'];
const backend=process.platform==='darwin'?'coreml':process.platform==='win32'?'dml':'cpu',dir=await mkdtemp(path.join(tmpdir(),'corte-bench-')),time=async f=>{const t=performance.now();const r=await f();return [r,Math.round(performance.now()-t)];};
try{
 // One vertical phone-like clip with real speech, reused for every asset: decode cost is per asset, generation cost is paid once.
 const clip=path.join(dir,'clip.mp4'),speech=path.resolve(import.meta.dirname,'../tests/fixtures/speech-pt.m4a');
 const [,generateMs]=await time(()=>run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i',`testsrc2=s=${size}:r=30`,'-stream_loop','-1','-i',speech,'-t',String(seconds),'-map','0:v','-map','1:a',...encoder,'-pix_fmt','yuv420p','-c:a','aac','-shortest',clip],{timeout:3600000}));
 const info=await probe(clip);let project=createProject('bench');const registry=new Map();
 for(let i=0;i<clips;i++){project=addClip(addAsset(project,{id:'a'+i,name:'clip '+i,...info}),'a'+i,'c'+i);registry.set('a'+i,{path:clip});}
 const assets=project.assets.map(a=>({...a,file:clip}));
 const [visual,visualMs]=await time(()=>runVisualProcess({backend,data:{assets,directory:path.join(dir,'scan'),models:modelPath(),step:.5}}));
 const [,speechMs]=await time(()=>transcribeLocally({project,registry,purpose:'edit'}));
 const r=visual.report;
 console.log(JSON.stringify({platform:process.platform,cpu:cpus()[0]?.model,cores:cpus().length,ramGB:Math.round(totalmem()/1e9),workload:{clips,seconds,total:clips*seconds,res,codec},
  generateMs,visualMs,speechMs,vision:{requested:backend,backend:r.backend,fallback:r.fallback,framesScanned:r.assets.reduce((n,a)=>n+a.localFrames,0),inferences:r.assets.reduce((n,a)=>n+a.inferredFrames,0),rssMB:r.rssMB}}));
}finally{await rm(dir,{recursive:true,force:true});}

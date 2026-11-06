// Opt-in real project test: sends selected frames and transcript through the existing Corte ChatGPT connection.
// node tests/project-edit.live.mjs --project=<file.corte> --prompt=<file.txt> --max-duration=150
import fs from 'node:fs/promises';import path from 'node:path';
import {readProjectFile,saveProjectFile} from '../desktop/storage.mjs';
import {requestEditingPlan} from '../desktop/edit-router.mjs';
import {duration,simulatePlan} from '../src/project.mjs';
import {renderProject,probe} from '../desktop/media.mjs';
const arg=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
if(!arg('project')||!arg('prompt'))throw Error('Informe --project e --prompt. Este teste envia evidências à conexão ChatGPT do Corte.');
const root=path.resolve(arg('user-data')||path.join(process.env.APPDATA,'Corte'));
for(const name of await fs.readdir(path.join(root,'models'))){const folder=path.join(root,'models',name);let m;try{m=JSON.parse(await fs.readFile(path.join(folder,'manifest.json'),'utf8'));}catch{continue;}
if(m.model==='Xenova/clip-vit-base-patch32'&&m.files.some(f=>f.path.endsWith('/vision_model_quantized.onnx')))process.env.CORTE_MODEL_PATH=folder;
if(m.model==='Xenova/clip-vit-base-patch32'&&m.files.some(f=>f.path.endsWith('/text_model_quantized.onnx')))process.env.CORTE_SEARCH_MODEL_PATH=folder;
if(m.model==='onnx-community/whisper-large-v3-turbo_timestamped')process.env.CORTE_SPEECH_MODEL_PATH=folder;
}
const original=await fs.readFile(path.resolve(arg('project')));
const data=await readProjectFile(path.resolve(arg('project')));const registry=new Map(data.sources.map(s=>[s.assetId,{path:s.path}]));
for(const s of data.sources)await fs.access(s.path);
const prompt=await fs.readFile(arg('prompt'),'utf8');
const out=path.resolve('validation/project-real-'+new Date().toISOString().replaceAll(':','-'));await fs.mkdir(out,{recursive:true});console.log('OUTPUT',out);
await fs.writeFile(path.join(out,'input.json'),JSON.stringify({prompt,duration:duration(data.project),assets:data.project.assets},null,2));
let last=0;const onProgress=e=>{if(Date.now()-last>4000||e.cached){console.log(JSON.stringify(e));last=Date.now();}};
try{const result=await requestEditingPlan({home:path.join(root,'chatgpt'),cache:path.join(root,'cache'),project:data.project,prompt,registry,step:2,shareEvidence:true,onProgress});
await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));const edited=simulatePlan(data.project,result.plan);await saveProjectFile(path.join(out,'resultado.corte'),edited,registry);
const requiredAssets=(arg('require-assets')||'').split(',').filter(Boolean);
const checks={requiredAssetsRetained:requiredAssets.every(name=>edited.clips.some(c=>edited.assets.find(a=>a.id===c.assetId)?.name===name)),...(arg('min-shot')?{noFlashFragments:edited.clips.every(c=>(c.out-c.in)/(c.speed||1)>=Number(arg('min-shot')))}:{}),hasEdits:result.plan.operations.length>0,withinDuration:!arg('max-duration')||duration(edited)<=Number(arg('max-duration'))+.01,originalUnchanged:original.equals(await fs.readFile(path.resolve(arg('project')))),...(process.argv.includes('--expect-speed')?{hasSpeed:edited.clips.some(c=>(c.speed||1)>1)}:{}),...(process.argv.includes('--expect-transitions')?{hasTransitions:edited.transitions?.length>0,transitionCoverageComplete:result.transitionCheck?.pending===0}:{})};
await fs.writeFile(path.join(out,'checks.json'),JSON.stringify(checks,null,2));if(Object.values(checks).some(v=>!v))process.exitCode=1;
if(process.argv.includes('--render')&&checks.hasEdits&&checks.withinDuration){const file=path.join(out,'preview.mp4');await renderProject(edited,registry,file,{height:720,onProgress});const media=await probe(file);await fs.writeFile(path.join(out,'render.json'),JSON.stringify(media,null,2));checks.exportWithinDuration=!arg('max-duration')||media.duration<=Number(arg('max-duration'))+.05;checks.exportMatchesTimeline=Math.abs(media.duration-duration(edited))<.1;await fs.writeFile(path.join(out,'checks.json'),JSON.stringify(checks,null,2));if(!checks.exportWithinDuration||!checks.exportMatchesTimeline)process.exitCode=1;}
console.log('RESULT',JSON.stringify({checks,operations:result.plan.operations.length,before:duration(data.project),after:duration(edited),coverage:result.coverage,pending:result.pendingRequests}));
}catch(e){await fs.writeFile(path.join(out,'error.json'),JSON.stringify({error:e.message,stack:e.stack},null,2));console.error(e);process.exitCode=1;}

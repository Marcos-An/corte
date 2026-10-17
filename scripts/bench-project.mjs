// Offline benchmark on explicitly selected local media. No provider calls or authentication reads.
import path from 'node:path';import {mkdir} from 'node:fs/promises';import {tmpdir,cpus,totalmem} from 'node:os';
import {readProjectFile} from '../desktop/storage.mjs';import {scanLocally} from '../desktop/local.mjs';import {transcribeLocally} from '../desktop/transcribe.mjs';
const arg=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
if(!arg('project'))throw Error('Informe --project=<arquivo.corte>. A análise é somente local.');
const data=await readProjectFile(path.resolve(arg('project'))),registry=new Map(data.sources.filter(s=>s.path).map(s=>[s.assetId,{path:s.path}]));
const cache=path.resolve(arg('cache')||path.join(tmpdir(),'corte-project-bench'));await mkdir(cache,{recursive:true});
const step=Number(arg('step')||2);if(![.5,2,5].includes(step))throw Error('Amostragem inválida.');
const report={platform:process.platform,cpu:cpus()[0]?.model,ramGB:Math.round(totalmem()/1073741824),assets:data.project.assets.length,clips:data.project.clips.length,step};
for(let round=0;round<2;round++){
 const start=performance.now();let hits=0;
 const visual=await scanLocally({project:data.project,registry,cache,directory:path.join(cache,'temporary'),step,index:true,onProgress:e=>{if(e.cached)hits++;}});
 report[round?'visionWarm':'visionCold']={elapsedMs:Math.round(performance.now()-start),cacheHits:hits,backend:visual.report.backend,fallback:visual.report.fallback,frames:visual.report.assets.reduce((n,a)=>n+a.localFrames,0),inferences:visual.report.assets.reduce((n,a)=>n+a.inferredFrames,0)};
 console.log(JSON.stringify({stage:round?'visionWarm':'visionCold',...report[round?'visionWarm':'visionCold']}));
}
if(process.argv.includes('--speech'))for(let round=0;round<2;round++){
 const start=performance.now();let hits=0;const transcripts=await transcribeLocally({project:data.project,registry,cache,purpose:'edit',onProgress:e=>{if(e.cached)hits++;}});
 report[round?'speechWarm':'speechCold']={elapsedMs:Math.round(performance.now()-start),cacheHits:hits,words:transcripts.reduce((n,t)=>n+t.words.length,0)};
 console.log(JSON.stringify({stage:round?'speechWarm':'speechCold',...report[round?'speechWarm':'speechCold']}));
}
console.log(JSON.stringify(report));

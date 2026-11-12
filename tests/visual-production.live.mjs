// Explicit opt-in: uses the already connected ChatGPT account and installed local observer.
// node tests/visual-production.live.mjs --project=... --user-data=... --out=... --prompt-file=...
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {readProjectFile,saveProjectFile} from '../desktop/storage.mjs';import {requestVisualEdit} from '../desktop/visual-edit.mjs';import {stopVisualRuntime} from '../desktop/visual-runtime.mjs';import {applyPlan,duration,History} from '../src/project.mjs';
const arg=k=>process.argv.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3);
for(const k of ['project','user-data','out','prompt-file'])if(!arg(k))throw Error('Missing --'+k);
const userData=path.resolve(arg('user-data')),out=path.resolve(arg('out')),file=path.resolve(arg('project'));await fs.mkdir(out,{recursive:true});const before=await fs.readFile(file),data=await readProjectFile(file),registry=new Map(data.sources.map(s=>[s.assetId,{path:s.path,asset:data.project.assets.find(a=>a.id===s.assetId)}])),start=performance.now(),signal=AbortSignal.timeout(1800000);
try{
 const result=await requestVisualEdit({home:path.join(userData,'chatgpt'),userData,cache:path.join(userData,'cache'),project:data.project,prompt:await fs.readFile(arg('prompt-file'),'utf8'),registry,shareEvidence:true,signal,onProgress:p=>console.log(JSON.stringify({elapsedMs:Math.round(performance.now()-start),...p}))});
 const project=applyPlan(data.project,result.plan),history=new History(data.project);history.commit(project,{label:'Montagem visual automática'});history.undo();if(JSON.stringify(history.current)!==JSON.stringify(data.project))throw Error('Undo mismatch');history.redo();
 await saveProjectFile(path.join(out,'montagem.corte'),project,registry,history.serialize());
 const report={elapsedMs:Math.round(performance.now()-start),sourceSeconds:duration(data.project),outputSeconds:duration(project),result,originalSha256:createHash('sha256').update(before).digest('hex'),originalUnchanged:before.equals(await fs.readFile(file)),undo:true};await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await stopVisualRuntime();}

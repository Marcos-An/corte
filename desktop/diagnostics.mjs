import path from 'node:path';
import {mkdir,stat,appendFile,writeFile,readFile} from 'node:fs/promises';
// Local-only, bounded, allowlisted telemetry. Never record file paths, media names or raw errors.
export function createDiagnostics(file,{limitBytes=512000}={}){
 let writes=Promise.resolve();
 return {
  record(event){
   if(!/^[a-z-]{1,40}$/.test(event.stage)||!Number.isFinite(event.elapsedMs)||event.elapsedMs<0)return;
   const value={at:new Date().toISOString(),stage:event.stage,elapsedMs:Math.round(event.elapsedMs),outcome:['ok','error','canceled'].includes(event.outcome)?event.outcome:'ok'};
   if(/^[a-f0-9-]{36}$/.test(event.operationId||''))value.operationId=event.operationId;
   const line=JSON.stringify(value)+'\n';
   writes=writes.then(async()=>{await mkdir(path.dirname(file),{recursive:true});const size=(await stat(file).catch(()=>null))?.size||0;if(size+Buffer.byteLength(line)>limitBytes)await writeFile(file,line);else await appendFile(file,line);}).catch(()=>{});
  },
  flush:()=>writes,
  async read(){await writes;return readFile(file,'utf8').catch(()=>'');}
 };
}

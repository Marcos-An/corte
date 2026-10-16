import {mkdirSync,readFileSync,writeFileSync,appendFileSync,renameSync,rmSync,statSync,openSync,fsyncSync,closeSync} from 'node:fs';
import path from 'node:path';import os from 'node:os';import {randomUUID} from 'node:crypto';
const stages=new Set(['startup','idle','models','hybrid','captions','transcribe','local','frames','analysis','intent','quality','render','renderer','main','worker']);
const events=new Set(['session-start','session-end','previous-interruption','ai-start','ai-progress','ai-heartbeat','ai-error','ai-end','process-gone','uncaught-exception','worker-start','worker-exit','worker-error','renderer-error']);
const reasons=new Set(['clean-exit','abnormal-exit','killed','crashed','oom','launch-failed','integrity-failure','memory-eviction']);
const codes=new Set(['ENOENT','EACCES','EPERM','ENOSPC','EIO','ENOMEM','ETIMEDOUT','ECONNRESET','ECONNREFUSED','ENOTFOUND','ABORT_ERR','ERR_WORKER_OUT_OF_MEMORY']);
const kinds=new Set(['memory','canceled','timeout','network','file','model','unknown']);
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const version=value=>typeof value==='string'&&/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(value)?value:'unknown';
const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e12;
const date=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value);
function clean(input){
 if(!input||!events.has(input.event)||!stages.has(input.stage)||!date(input.at))return null;
 const out={at:input.at,event:input.event,stage:input.stage};
 for(const key of ['sessionId','operationId'])if(uuid(input[key]))out[key]=input[key];
 for(const key of ['version','electron','node'])if(input[key])out[key]=version(input[key]);
 if(['win32','darwin','linux'].includes(input.platform))out.platform=input.platform;
 if(['x64','arm64','ia32'].includes(input.arch))out.arch=input.arch;
 if(typeof input.osRelease==='string'&&/^[\d.]{1,40}$/.test(input.osRelease))out.osRelease=input.osRelease;
 for(const key of ['elapsedMs','uptimeMs','completed','total'])if(number(input[key]))out[key]=Math.round(input[key]);
 if(Number.isInteger(input.exitCode)&&Math.abs(input.exitCode)<=2**32)out.exitCode=input.exitCode;
 if(['ok','error','canceled'].includes(input.outcome))out.outcome=input.outcome;
 if(['overview','refinement'].includes(input.phase))out.phase=input.phase;
 if(reasons.has(input.reason))out.reason=input.reason;
 if(codes.has(input.errorCode))out.errorCode=input.errorCode;
 if(kinds.has(input.errorKind))out.errorKind=input.errorKind;
 if(['Error','TypeError','RangeError','SyntaxError','AbortError'].includes(input.errorName))out.errorName=input.errorName;
 if(['CPU','GPU','Utility','Browser','renderer','speech','vision'].includes(input.processType))out.processType=input.processType;
 if(['cpu','dml','coreml'].includes(input.backend))out.backend=input.backend;
 if(input.memory&&typeof input.memory==='object'){out.memory={};for(const key of ['rssMB','heapUsedMB','externalMB','freeSystemMB','totalSystemMB'])if(number(input.memory[key]))out.memory[key]=Math.round(input.memory[key]);}
 return out;
}
export function diagnosticError(error){
 const message=typeof error?.message==='string'?error.message:'';
 const errorKind=/out.of.memory|allocation failed|ENOMEM/i.test(message)?'memory':/cancel|abort/i.test(message)?'canceled':/timeout|demorou/i.test(message)?'timeout':/network|fetch|conexão/i.test(message)?'network':/ENOENT|mídia ausente/i.test(message)?'file':/modelo|model/i.test(message)?'model':'unknown';
 return {errorKind,...(codes.has(error?.code)?{errorCode:error.code}:{}),...(['Error','TypeError','RangeError','SyntaxError','AbortError'].includes(error?.name)?{errorName:error.name}:{})};
}
// Synchronous, bounded writes at stage boundaries survive a native process crash.
// No raw messages, stack traces, paths, prompts or dumps enter this log.
export function createSessionDiagnostics({directory,version:appVersion,platform=process.platform,limitBytes=512000}){
 const file=path.join(directory,'events.jsonl'),previousFile=path.join(directory,'events.previous.jsonl'),marker=path.join(directory,'session.json');
 const sessionId=randomUUID(),started=performance.now();let operationId=null,stage='startup',phase=null,counts={},closed=false,available=true,operationStarted=started;
 const read=file=>{try{if(statSync(file).size>limitBytes+4096)return '';return readFileSync(file,'utf8');}catch{return '';}};
 let previous=null;try{const saved=JSON.parse(read(marker));if(saved.clean===false&&uuid(saved.sessionId)&&stages.has(saved.stage)&&date(saved.at)){previous={at:saved.at,version:version(saved.version),stage:saved.stage,sessionId:saved.sessionId};if(uuid(saved.operationId))previous.operationId=saved.operationId;}}catch{}
 const memory=()=>{const m=process.memoryUsage(),mb=n=>Math.round(n/1048576);return {rssMB:mb(m.rss),heapUsedMB:mb(m.heapUsed),externalMB:mb(m.external),freeSystemMB:mb(os.freemem()),totalSystemMB:mb(os.totalmem())};};
 function durable(file,text,append=false){append?appendFileSync(file,text,{mode:0o600}):writeFileSync(file,text,{mode:0o600});const fd=openSync(file,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}}
 function record(event){
  if(closed)return;const now=performance.now(),timing={uptimeMs:now-started};if(operationId&&(event.operationId??operationId)===operationId)timing.elapsedMs=now-operationStarted;const value=clean({at:new Date().toISOString(),sessionId,operationId,version:appVersion,stage,...timing,...event});if(!value)return;
  try{mkdirSync(directory,{recursive:true});const line=JSON.stringify(value)+'\n';if(Buffer.byteLength(line)>limitBytes)return;let size=0;try{size=statSync(file).size;}catch{}
   if(size+Buffer.byteLength(line)>limitBytes){rmSync(previousFile,{force:true});renameSync(file,previousFile);}durable(file,line,true);
  }catch{available=false;}
 }
 function checkpoint(cleanExit=false){try{mkdirSync(directory,{recursive:true});durable(marker+'.tmp',JSON.stringify({at:new Date().toISOString(),sessionId,version:version(appVersion),stage,operationId,clean:cleanExit}));renameSync(marker+'.tmp',marker);}catch{available=false;}}
 const system=clean({at:new Date().toISOString(),event:'session-start',stage:'startup',version:appVersion,platform,arch:process.arch,osRelease:os.release(),electron:process.versions.electron,node:process.versions.node});
 record({...system,memory:memory()});checkpoint();if(previous)record({event:'previous-interruption'});
 return {
  record,
  status:()=>({available,previousInterruption:previous,stage}),
  begin(){operationId=randomUUID();operationStarted=performance.now();stage='models';phase=null;counts={};record({event:'ai-start',memory:memory()});checkpoint();return operationId;},
  progress(p,requestId=operationId){
   if(!uuid(requestId))return;
   if(p.stage==='worker-diagnostic'){
    const workerStage=p.worker==='speech'?'captions':'local';
    if(p.event==='worker-start'&&requestId===operationId){stage=workerStage;phase=null;counts={};checkpoint();}
    record({...p,operationId:requestId,event:p.event,stage:workerStage,memory:memory()});return;
   }
   if(requestId!==operationId||!stages.has(p.stage))return;
   counts={completed:p.completed,total:p.total};const nextPhase=['overview','refinement'].includes(p.phase)?p.phase:null;if(stage===p.stage&&phase===nextPhase)return;stage=p.stage;phase=nextPhase;record({event:'ai-progress',phase,...counts,memory:memory()});checkpoint();},
  heartbeat(){if(operationId)record({event:'ai-heartbeat',phase,...counts,memory:memory()});},
  failure(error){record({event:'ai-error',...diagnosticError(error),memory:memory()});},
  end(outcome='ok'){record({event:'ai-end',outcome,memory:memory()});operationId=null;stage='idle';phase=null;counts={};checkpoint();},
  close(){if(closed)return;record({event:'session-end'});checkpoint(true);closed=true;},
  export(){const data=[];for(const f of [previousFile,file])for(const line of read(f).split('\n')){try{const entry=clean(JSON.parse(line));if(entry)data.push(entry);}catch{}}
   return JSON.stringify({format:'corte-diagnostics-v1',generatedAt:new Date().toISOString(),available,system,previousInterruption:previous,events:data},null,2);
  }
 };
}

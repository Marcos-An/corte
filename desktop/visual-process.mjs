import {fork} from 'node:child_process';import {fileURLToPath} from 'node:url';
const failedAccelerators=new Set();
export function runVisualProcess(options){return runIsolated({entry:new URL('./visual-child.mjs',import.meta.url),...options});}
// A native ONNX/driver crash ends only the child; an accelerated attempt that dies is retried once on CPU.
export async function runIsolated({data,backend,signal,onProgress=()=>{},entry,cancelGraceMs=1500,worker='vision',startError='Não foi possível iniciar o processo de análise visual.',crashError='A análise visual foi interrompida. O editor continua aberto; tente novamente ou exporte o diagnóstico.'}){
 const canceled=()=>new Error('Análise cancelada.');if(signal?.aborted)throw canceled();
 for(let attempt=0;attempt<2;attempt++){
  const device=attempt||failedAccelerators.has(`${entry}:${worker}:${backend}`)?'cpu':backend;onProgress({stage:'vision-start'});
  const result=await new Promise((resolve,reject)=>{
   let child,reply=null,settled=false,cancelTimer,actualBackend=device;
   const diagnostic=(event,extra={})=>onProgress({stage:'worker-diagnostic',event,worker,processType:worker,backend:actualBackend,...extra});
   const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(cancelTimer);signal?.removeEventListener('abort',cancel);error?reject(error):resolve(value);};
   const cancel=()=>{if(child.connected)child.send({cancel:true},()=>{});cancelTimer??=setTimeout(()=>child.kill('SIGKILL'),cancelGraceMs);};
   try{child=fork(entry instanceof URL?fileURLToPath(entry):entry,[],{execPath:process.execPath,execArgv:[],windowsHide:true,serialization:'advanced',stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});}catch{finish(new Error(startError));return;}
   child.on('error',()=>{diagnostic('worker-error');finish(signal?.aborted?canceled():new Error(startError));});
   child.on('message',m=>{if(m?.progress){if(['cpu','dml','coreml'].includes(m.progress.backend))actualBackend=m.progress.backend;onProgress(m.progress);}else if(m?.result||typeof m?.error==='string')reply=m;});
   child.on('exit',(code,exitSignal)=>{
    const outcome=signal?.aborted?'canceled':code===0&&reply?.result?'ok':'error';diagnostic('worker-exit',{exitCode:code,outcome,reason:exitSignal?'crashed':code===0?'clean-exit':'abnormal-exit'});
    if(signal?.aborted){finish(canceled());return;}
    if(reply?.error){diagnostic('worker-error');finish(new Error(reply.error));return;}
    if(code===0&&reply?.result){finish(null,{result:reply.result});return;}
    if(actualBackend!=='cpu')failedAccelerators.add(`${entry}:${worker}:${actualBackend}`);
    finish(null,{crashed:true,retry:actualBackend!=='cpu'});
   });
   signal?.addEventListener('abort',cancel,{once:true});
   child.on('spawn',()=>{diagnostic('worker-start',{pid:child.pid});child.send({data:{...data,backend:device}},error=>{if(error&&!settled)child.kill('SIGKILL');});if(signal?.aborted)cancel();});
  });
  if(signal?.aborted)throw canceled();
  if(result.result){if(attempt&&result.result.report)result.result.report.fallback=true;return result.result;}
  if(!result.retry||attempt)throw new Error(crashError);
 }
}

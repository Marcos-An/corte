import path from 'node:path';import os from 'node:os';import net from 'node:net';import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';import {createReadStream,createWriteStream} from 'node:fs';import {Readable} from 'node:stream';import {pipeline} from 'node:stream/promises';
import {mkdir,readFile,writeFile,stat,rename,rm,readdir,copyFile} from 'node:fs/promises';import {run} from './media.mjs';
const revision='f982a07559d4a2f6c8744d840bf6fccab30eea96',base='https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/'+revision+'/';
export const VISUAL_MODELS=[{name:'Qwen3VL-8B-Instruct-Q4_K_M.gguf',size:5027784800,sha256:'67d1659bfe71b89d50b45a4ad1a9e5b997e5bb16ce5da66a6a6167abd569e9e2'},{name:'mmproj-Qwen3VL-8B-Instruct-F16.gguf',size:1159029824,sha256:'ca524100ebf825c9a870db1c580d03879e0da0ab2541697e2458e64891cf9d38'}];
const release='https://github.com/ggml-org/llama.cpp/releases/download/b12110/';
export const VISUAL_RUNTIMES={cuda:[{name:'llama-b12110-bin-win-cuda-12.4-x64.zip',sha256:'1ce755bc3a061889234048f88e33328e17971eaad73c4666cfeb26026b317fee',size:287014657},{name:'cudart-llama-bin-win-cuda-12.4-x64.zip',sha256:'8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6',size:391443627}],cpu:[{name:'llama-b12110-bin-win-cpu-x64.zip',sha256:'98901e327c252875accaf2d1bf364e10e868843b0b63468baad1aa945cdc5da2',size:24708445}],metal:[{name:'llama-b12110-bin-macos-arm64.tar.gz',sha256:'4f5b8de12e0b9516658ca6a5764c6ffb3d7c659c3dd538556b1413c7b4050662',size:16650691}]};
export const visualModelRoot=userData=>path.join(userData,'visual-engine','qwen3vl8b-b12110');
const supported=()=>process.platform==='win32'&&process.arch==='x64'||process.platform==='darwin'&&process.arch==='arm64';
const hash=async(file,signal)=>{const h=createHash('sha256');for await(const bytes of createReadStream(file,{signal}))h.update(bytes);return h.digest('hex');};
async function findExecutable(root){for(const e of await readdir(root,{withFileTypes:true})){const file=path.join(root,e.name);if(e.isFile()&&e.name===(process.platform==='win32'?'llama-server.exe':'llama-server'))return file;if(e.isDirectory()){const result=await findExecutable(file);if(result)return result;}}return null;}
async function installed(userData){const root=visualModelRoot(userData);try{const record=JSON.parse(await readFile(path.join(root,'ready.json'),'utf8'));if(record.version!==1||!VISUAL_RUNTIMES[record.backend])return null;for(const m of VISUAL_MODELS)if((await stat(path.join(root,m.name))).size!==m.size)return null;const executable=await findExecutable(path.join(root,'runtime'));return executable?{root,executable,backend:record.backend}:null;}catch{return null;}}
export async function visualRuntimeStatus(userData){const ready=await installed(userData);return {installed:!!ready,supported:supported(),backend:ready?.backend??null,downloadGB:process.platform==='win32'?6.9:6.2,recommendedMemoryGB:16,running:!!active?.child&&active.userData===userData};}
async function backend(){if(process.platform==='darwin')return 'metal';try{await run('nvidia-smi',['-L'],{timeout:5000});return 'cuda';}catch{return 'cpu';}}
async function download(url,file,entry,{signal,onProgress}){
 const response=await fetch(url,{signal:AbortSignal.any([signal??new AbortController().signal,AbortSignal.timeout(1800000)])});if(!response.ok||!response.body)throw Error('Não foi possível baixar '+entry.name+' ('+response.status+').');
 let bytes=0,last=0;const digest=createHash('sha256');const input=Readable.fromWeb(response.body);input.on('data',chunk=>{bytes+=chunk.length;digest.update(chunk);if(bytes>entry.size)input.destroy(Error('Download maior que o esperado.'));if(performance.now()-last>500){last=performance.now();onProgress({stage:'visual-install',message:'Baixando '+entry.name+' · '+Math.floor(bytes/entry.size*100)+'%'});}});
 await pipeline(input,createWriteStream(file,{flags:'wx'}),{signal});if(bytes!==entry.size||digest.digest('hex')!==entry.sha256)throw Error('Download incompleto ou assinatura SHA256 inválida: '+entry.name);
}
export async function installVisualRuntime(userData,{signal,onProgress=()=>{}}={}){
 if(!supported())throw Error('Montagem visual local disponível para Windows x64 e Mac Apple Silicon.');if(await installed(userData))return visualRuntimeStatus(userData);
 const target=visualModelRoot(userData),stage=target+'.tmp-'+randomUUID(),kind=await backend();await mkdir(stage,{recursive:true});
 try{
  for(const m of VISUAL_MODELS)await download(base+m.name+'?download=true',path.join(stage,m.name),m,{signal,onProgress});
  const runtime=path.join(stage,'runtime');await mkdir(runtime);
  for(const archive of VISUAL_RUNTIMES[kind]){const file=path.join(stage,archive.name);await download(release+archive.name,file,archive,{signal,onProgress});
   const listing=await run('tar',['-tf',file],{signal});if(listing.stdout.split(/\r?\n/).some(n=>n&&(/^[\\/]|^[A-Za-z]:|(^|[\\/])\.\.([\\/]|$)/.test(n))))throw Error('Pacote de execução inválido.');await run('tar',['-xf',file,'-C',runtime],{signal,timeout:120000});await rm(file);
  }
  if(!await findExecutable(runtime))throw Error('O pacote não contém o analisador local.');await writeFile(path.join(stage,'ready.json'),JSON.stringify({version:1,backend:kind,models:VISUAL_MODELS,runtime:'llama.cpp b12110'}));signal?.throwIfAborted();await mkdir(path.dirname(target),{recursive:true});
  if(await stat(target).catch(()=>null))await rename(target,target+'.incomplete-'+randomUUID());await rename(stage,target);return visualRuntimeStatus(userData);
 }finally{await rm(stage,{recursive:true,force:true});}
}
// Used by the developer's migration/test command, never silently searches users' disks.
export async function adoptVisualRuntime(userData,{modelDirectory,runtimeArchives,backend:kind='cuda',signal}){
 const target=visualModelRoot(userData);if(await installed(userData))return;const stage=target+'.tmp-'+randomUUID();await mkdir(stage,{recursive:true});
 try{for(const m of VISUAL_MODELS){const source=path.join(modelDirectory,m.name);if(await hash(source,signal)!==m.sha256)throw Error('Modelo local não confere.');await copyFile(source,path.join(stage,m.name));}
  const runtime=path.join(stage,'runtime');await mkdir(runtime);for(const a of VISUAL_RUNTIMES[kind]){const file=path.join(runtimeArchives,a.name);if(await hash(file,signal)!==a.sha256)throw Error('Runtime local não confere.');await run('tar',['-xf',file,'-C',runtime],{signal,timeout:120000});}if(!await findExecutable(runtime))throw Error('Runtime ausente.');await writeFile(path.join(stage,'ready.json'),JSON.stringify({version:1,backend:kind}));if(await stat(target).catch(()=>null))throw Error('Destino já existe.');await rename(stage,target);
 }finally{await rm(stage,{recursive:true,force:true});}
}
let active=null,idleTimer=null;
export async function stopVisualRuntime(){clearTimeout(idleTimer);const current=active;active=null;if(current?.child&&current.child.exitCode===null){current.child.kill();await Promise.race([new Promise(resolve=>current.child.once('exit',resolve)),new Promise(resolve=>setTimeout(()=>{current.child.kill('SIGKILL');resolve();},2000))]);}}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function startVisualRuntime(userData,{signal,onProgress=()=>{}}={}){
 clearTimeout(idleTimer);signal?.throwIfAborted();if(active?.userData===userData&&active.child.exitCode===null&&!active.child.killed&&active.child.signalCode===null)return active;
 await stopVisualRuntime();const ready=await installed(userData);if(!ready)throw Error('Instale a análise visual local no painel Editar com IA.');
 const port=await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});}),key=randomUUID(),endpoint='http://127.0.0.1:'+port;
 const child=spawn(ready.executable,['-m',path.join(ready.root,VISUAL_MODELS[0].name),'--mmproj',path.join(ready.root,VISUAL_MODELS[1].name),'--alias','local-video-pilot','--host','127.0.0.1','--port',String(port),'--api-key',key,'-ngl',ready.backend==='cpu'?'0':'99','-c','12288','-np','1','-fa','on','--image-max-tokens','256','--image-min-tokens','64','--threads',String(Math.max(1,Math.min(6,os.availableParallelism()))),'--offline','--no-context-shift'],{cwd:path.dirname(ready.executable),stdio:'ignore',windowsHide:true});
 const state={child,key,endpoint,userData,backend:ready.backend};active=state;let launchError=false;child.once('error',()=>{launchError=true;});const canceled=()=>{child.kill();};signal?.addEventListener('abort',canceled,{once:true});
 try{for(let n=0;n<480;n++){signal?.throwIfAborted();if(launchError||child.exitCode!==null||child.killed||child.signalCode!==null)throw Error('O analisador local não iniciou. Confira memória disponível e o driver da GPU.');if(n%16===0)onProgress({stage:'visual-edit',message:'Carregando análise visual local…'});try{const r=await fetch(endpoint+'/health',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(1000)});if(r.ok)return state;}catch{}await delay(250);}throw Error('O modelo local demorou demais para iniciar.');}catch(e){await stopVisualRuntime();throw e;}finally{signal?.removeEventListener('abort',canceled);}
}
export function releaseVisualRuntime(){clearTimeout(idleTimer);idleTimer=setTimeout(()=>void stopVisualRuntime(),60000);idleTimer.unref();}

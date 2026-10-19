import path from 'node:path';import {constants} from 'node:fs';import {realpath,stat,mkdtemp,link,copyFile,rm} from 'node:fs/promises';
import {validateProject} from '../src/project.mjs';import {validateExportJobs,safeExportStem} from '../src/export-batch.mjs';import {renderProject,dimensions} from './media.mjs';
// Hard links publish a finished file atomically. Removable/network drives can use exclusive copying instead.
export async function publishExportFile(source,directory,name,{linker=link,copier=copyFile}={}){
 const stem=safeExportStem(name);for(let i=0;i<1000;i++){
  const target=path.join(directory,stem+(i?` (${i+1})`:'')+'.mp4');
  try{try{await linker(source,target);}catch(error){if(!['EPERM','ENOTSUP','EOPNOTSUPP','EXDEV'].includes(error.code))throw error;await copier(source,target,constants.COPYFILE_EXCL);}return target;}catch(error){if(error.code!=='EEXIST')throw error;}
 }throw Error('Não foi possível encontrar um nome livre para o vídeo.');
}
export async function runExportBatch({project,registry,directory,jobs,height=720,signal,runId=crypto.randomUUID(),onProgress=()=>{},onError=()=>{}},{render=renderProject,publish=publishExportFile}={}){
 validateProject(project);jobs=validateExportJobs(project,jobs);dimensions(project.aspect,height);if(!path.isAbsolute(directory))throw Error('Escolha uma pasta de exportação válida.');
 const result={runId,completed:[],pending:jobs.map(j=>j.id),failed:null,canceled:false,error:null};let work,current;
 const emit=event=>{try{onProgress({stage:'export-batch',runId,total:jobs.length,completed:result.completed.length,...event});}catch{}};
 try{
  if(signal?.aborted){result.canceled=true;return result;}
  directory=await realpath(directory);if(!(await stat(directory)).isDirectory())throw Error('Pasta inválida.');work=await mkdtemp(path.join(directory,'.corte-batch-'));
  for(const [index,job]of jobs.entries()){
   signal?.throwIfAborted();current=job;emit({phase:'rendering',id:job.id,index});const staged=path.join(work,`${index}.mp4`);
   await render(project,registry,staged,{height,range:{start:job.start,end:job.end},signal,onProgress:progress=>emit({phase:'rendering',id:job.id,index,renderStage:progress.stage,partCompleted:progress.completed,partTotal:progress.total})});
   signal?.throwIfAborted();const output=await publish(staged,directory,job.name);result.completed.push({id:job.id,path:output});result.pending=result.pending.filter(id=>id!==job.id);current=null;emit({phase:'completed',id:job.id,index});
   await rm(staged,{force:true});
  }
 }catch(error){
  if(signal?.aborted)result.canceled=result.pending.length>0;
  else{result.error=error.code==='ENOSPC'?'Espaço insuficiente na pasta de exportação.':'Não foi possível concluir a fila. Verifique as mídias, o espaço e a permissão da pasta.';if(current)result.failed={id:current.id,message:result.error};try{onError(error);}catch{}}
 }finally{
  if(work&&path.dirname(path.resolve(work))===path.resolve(directory)&&path.basename(work).startsWith('.corte-batch-'))try{await rm(work,{recursive:true,force:true});}catch(error){try{onError(error);}catch{}result.warning='Alguns arquivos temporários não puderam ser removidos.';}
 }
 result.canceled=result.canceled&&result.pending.length>0;emit({phase:result.error?'failed':result.canceled?'canceled':'finished'});return result;
}

// Local evidence only. Keys include source identity and model/configuration; never credentials or prompts.
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,rm,stat} from 'node:fs/promises';
import path from 'node:path';
export async function evidenceIdentity(assets,configuration){
 const sources=await Promise.all(assets.map(async a=>{const s=await stat(a.file);return {id:a.id,file:path.resolve(a.file),size:s.size,mtime:s.mtimeMs,ctime:s.ctimeMs,duration:a.duration};}));
 sources.sort((a,b)=>a.id.localeCompare(b.id)||a.file.localeCompare(b.file));
 return createHash('sha256').update(JSON.stringify({sources,configuration})).digest('hex');
}
export async function cachedEvidence({root,kind,assets,configuration,signal,onHit=()=>{},compute}){
 if(!root)return compute(null);
 signal?.throwIfAborted();
 const key=await evidenceIdentity(assets,configuration),folder=path.join(root,kind,key.slice(0,32)),file=path.join(folder,'result.json');
 // Callers with different cancellation signals do not share live work. Only completed evidence is reused.
 const read=async()=>{try{const s=await stat(file);if(s.size>64e6)return null;const saved=JSON.parse(await readFile(file,'utf8'));if(saved.key!==key)return null;for(const frame of saved.value.frames||[])await stat(frame.path);for(const frame of saved.value.index||[])await stat(frame.path);return saved.value;}catch{return null;}};
 const hit=await read();signal?.throwIfAborted();if(hit){onHit();return hit;}
 // Unique work folders avoid one canceled request damaging another one's frames.
 const work=path.join(folder,randomUUID().slice(0,12));await mkdir(work,{recursive:true});let complete=false;
 try{
  const value=await compute(work);signal?.throwIfAborted();
  for(const frame of [...(value.frames||[]),...(value.index||[])])await stat(frame.path);
  if(await evidenceIdentity(assets,configuration)!==key)throw Error('A mídia mudou durante a análise. Tente novamente.');
  const temp=file+'.'+randomUUID()+'.tmp';
  try{await writeFile(temp,JSON.stringify({key,value}),{mode:0o600});signal?.throwIfAborted();await rename(temp,file);complete=true;}finally{await rm(temp,{force:true});}
  return value;
 }finally{if(!complete)await rm(work,{recursive:true,force:true});}
}

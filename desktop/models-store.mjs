import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,copyFile,writeFile,lstat,rename,rm} from 'node:fs/promises';
function validate(manifest){
 if(!Array.isArray(manifest?.files)||!manifest.files.length)throw Error('Manifesto de modelos inválido.');
 const paths=new Set();for(const f of manifest.files){if(!/^[A-Za-z0-9_-][A-Za-z0-9_.-]*(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/.test(f.path)||!/^([a-f0-9]{64})$/.test(f.sha256)||paths.has(f.path))throw Error('Manifesto de modelos inválido.');paths.add(f.path);}
}
export function modelStorePath(userData,manifest){validate(manifest);return path.join(userData,'models',createHash('sha256').update(JSON.stringify(manifest)).digest('hex'));}
async function verify(folder,manifest){
 if(!(await lstat(folder)).isDirectory())throw Error('Pasta de modelos inválida.');
 for(const f of manifest.files){const file=path.join(folder,f.path);if(!(await lstat(file)).isFile())throw Error('Modelo inválido.');const h=createHash('sha256');for await(const bytes of createReadStream(file))h.update(bytes);if(h.digest('hex')!==f.sha256)throw Error('Modelo local corrompido.');}
}
export async function preserveModels({bundled,userData,manifest}){
 const target=modelStorePath(userData,manifest);await mkdir(path.dirname(target),{recursive:true});
 try{await verify(target,manifest);return target;}catch{/* Incomplete cache is never accepted. */}
 const stage=target+'.tmp-'+randomUUID();await mkdir(stage);
 try{
  for(const f of manifest.files){const out=path.join(stage,f.path);await mkdir(path.dirname(out),{recursive:true});await copyFile(path.join(bundled,f.path),out);}
  await writeFile(path.join(stage,'manifest.json'),JSON.stringify(manifest));await verify(stage,manifest);
  try{await rename(target,target+'.damaged-'+randomUUID());}catch(e){if(e.code!=='ENOENT')throw e;}
  await rename(stage,target);return target;
 }finally{await rm(stage,{recursive:true,force:true});}
}

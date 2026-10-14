import path from 'node:path';
import {constants} from 'node:fs';
import {readFile,writeFile,rename,rm,mkdir,copyFile,realpath,stat} from 'node:fs/promises';
import {validateProject,History} from '../src/project.mjs';
const mediaExtension=/\.(mp4|mov|mkv|webm|m4v|avi|m4a|mp3|wav|ogg|flac|aac|png|jpg|jpeg|webp)$/i;
const relativeMedia=/^media\/[A-Za-z0-9_-]+\.(mp4|mov|mkv|webm|m4v|avi|m4a|mp3|wav|ogg|flac|aac|png|jpg|jpeg|webp)$/i;
export function allowedMedia(file){return typeof file==='string'&&path.isAbsolute(file)&&!file.includes('\0')&&mediaExtension.test(file);}
function savedMedia(file){return typeof file==='string'&&!file.includes('\0')&&(path.posix.isAbsolute(file)||path.win32.isAbsolute(file))&&mediaExtension.test(file);}
function validSource(s){return !!s&&typeof s.assetId==='string'&&(s.relative===true?typeof s.path==='string'&&relativeMedia.test(s.path):s.path===null||savedMedia(s.path));}
function assetsOf(project,history){
 validateProject(project);
 if(history&&JSON.stringify(History.from(history).current)!==JSON.stringify(project))throw Error('Histórico não corresponde ao projeto.');
 return [...new Map((history?history.entries.flatMap(e=>e.state.assets):project.assets).map(a=>[a.id,a])).values()];
}
export async function saveProjectFile(file,project,registry,history){
 const assets=assetsOf(project,history);
 if(path.extname(file).toLowerCase()!=='.corte')throw Error('Use a extensão .corte para o projeto.');
 if([...registry.values()].some(a=>a.path&&path.resolve(a.path)===path.resolve(file)))throw Error('Não é permitido substituir uma mídia original.');
 const sources=assets.map(a=>{const source=registry.get(a.id)?.path||null,relative=source&&allowedMedia(source)?path.relative(path.dirname(file),source).split(path.sep).join('/'):null;return relative&&relativeMedia.test(relative)?{assetId:a.id,path:relative,relative:true}:{assetId:a.id,path:source};});
 if(sources.some(s=>!validSource(s)))throw Error('Referências de mídia inválidas.');
 const content=JSON.stringify({format:'corte-project',project,sources,...(history?{history}:{})},null,2);
 if(Buffer.byteLength(content)>32e6||sources.length>2000)throw Error('Projeto excede o limite de tamanho.');
 const temp=`${file}.${crypto.randomUUID()}.tmp`;
 try{await writeFile(temp,content,'utf8');await rename(temp,file);}finally{await rm(temp,{force:true});}
}
export async function readProjectFile(file){
 if(path.extname(file).toLowerCase()!=='.corte')throw Error('Selecione um projeto .corte.');
 const raw=await readFile(file);if(raw.length>32e6)throw Error('Projeto muito grande.');const data=JSON.parse(raw.toString('utf8'));
 if(data.format!=='corte-project'||!Array.isArray(data.sources)||data.sources.length>2000||data.sources.some(s=>!validSource(s)))throw Error('Referências de mídia inválidas.');
 assetsOf(data.project,data.history);
 return {...data,sources:data.sources.map(s=>s.relative===true?{...s,path:path.resolve(path.dirname(file),...s.path.split('/'))}:s)};
}
export async function savePortableProject(folder,project,registry,history){
 const assets=assetsOf(project,history);if(assets.length>2000)throw Error('Mídias demais para o projeto.');
 await mkdir(folder); // Exclusive creation: never overwrite a previous portable project.
 try{
  await mkdir(path.join(folder,'media'));const copied=new Map(),sources=new Map();
  for(const asset of assets){
   const source=registry.get(asset.id)?.path;if(!allowedMedia(source))throw Error('Relocalize as mídias ausentes antes de criar uma cópia portátil.');
   const original=await realpath(source);if(!(await stat(original)).isFile())throw Error('Mídia inválida.');
   let target=copied.get(original);
   if(!target){target=path.join(folder,'media',String(copied.size+1).padStart(4,'0')+path.extname(source).toLowerCase());await copyFile(original,target,constants.COPYFILE_EXCL);copied.set(original,target);}
   sources.set(asset.id,{path:target});
  }
  const file=path.join(folder,'project.corte');await saveProjectFile(file,project,sources,history);return file;
 }catch(e){await rm(folder,{recursive:true,force:true});throw e;}
}

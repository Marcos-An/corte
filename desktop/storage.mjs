import path from 'node:path';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { validateProject, History } from '../src/project.mjs';
export function allowedMedia(file){return typeof file==='string' && path.isAbsolute(file) && !file.includes('\0') && /\.(mp4|mov|mkv|webm|m4v|avi|m4a|mp3|wav|ogg|flac|aac|png|jpg|jpeg|webp)$/i.test(file);}
export async function saveProjectFile(file,project,registry,history) {
  validateProject(project);
  if(!file.endsWith('.corte'))throw new Error('Use a extensão .corte para o projeto.');
  if([...registry.values()].some(a=>path.resolve(a.path)===path.resolve(file)))throw new Error('Não é permitido substituir uma mídia original.');
  if(history&&JSON.stringify(History.from(history).current)!==JSON.stringify(project))throw new Error('Histórico não corresponde ao projeto.');
  const allAssets=[...new Map((history?history.entries.flatMap(e=>e.state.assets):project.assets).map(a=>[a.id,a])).values()];
  const sources=allAssets.map(a=>({assetId:a.id,path:registry.get(a.id)?.path||null}));
  const temp=`${file}.${crypto.randomUUID()}.tmp`;
  const content=JSON.stringify({format:'corte-project',project,sources,...(history?{history}:{})},null,2);if(Buffer.byteLength(content)>32e6)throw new Error('Projeto excede 32 MB.');
  try {await writeFile(temp,content,'utf8');await rename(temp,file);}finally{await rm(temp,{force:true});}
}
export async function readProjectFile(file) {
  if(!file.endsWith('.corte'))throw new Error('Selecione um projeto .corte.');
  const raw=await readFile(file,'utf8');if(raw.length>32e6)throw new Error('Projeto muito grande.');const data=JSON.parse(raw);
  if(data.format!=='corte-project' || !Array.isArray(data.sources) || data.sources.length>2000 || data.sources.some(s=>!s || typeof s.assetId!=='string' || (s.path!==null && !allowedMedia(s.path))))throw new Error('Referências de mídia inválidas.');
  validateProject(data.project);if(data.history&&JSON.stringify(History.from(data.history).current)!==JSON.stringify(data.project))throw new Error('Histórico não corresponde ao projeto.');return data;
}

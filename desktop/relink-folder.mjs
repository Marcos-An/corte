import path from 'node:path';import {readdir,realpath} from 'node:fs/promises';
import {allowedMedia} from './storage.mjs';
const nameKey=name=>name.normalize('NFC').toLocaleLowerCase('en-US');
// Scan only the chosen tree. Ambiguous names, links and incomplete scans never authorize a replacement.
export async function relinkFromFolder({directory,assets,sources=new Map(),register,signal,onProgress=()=>{},maxEntries=20000,maxDepth=8}){
 const basenameFor=a=>{const stored=sources.get(a.id);return stored?path.win32.basename(path.posix.basename(stored)):a.name;};const requests=new Map();for(const a of assets){const key=nameKey(basenameFor(a));if(!requests.has(key))requests.set(key,new Set());requests.get(key).add(sources.get(a.id)?nameKey(sources.get(a.id).replaceAll('\\','/')):a.id);}
 const result={assets:[],pending:[],canceled:false,truncated:false,scanned:0},files=new Map();let root;
 const progress=()=>{try{onProgress({stage:'relink-folder',scanned:result.scanned,completed:result.assets.length,total:assets.length});}catch{}};
 try{root=await realpath(directory);const queue=[{directory:root,depth:0}];while(queue.length){signal?.throwIfAborted();const current=queue.shift();let entries;try{entries=await readdir(current.directory,{withFileTypes:true});}catch{result.truncated=true;continue;}
  for(const entry of entries){signal?.throwIfAborted();if(++result.scanned>maxEntries){result.truncated=true;queue.length=0;break;}if(entry.isSymbolicLink())continue;const file=path.join(current.directory,entry.name);if(entry.isDirectory()){if(current.depth<maxDepth)queue.push({directory:file,depth:current.depth+1});else result.truncated=true;}else if(entry.isFile()&&allowedMedia(file)){const key=nameKey(entry.name);if(!files.has(key))files.set(key,[]);files.get(key).push(file);}}
  progress();
 }
 if(result.truncated){result.pending=assets.map(a=>({id:a.id,reason:'incomplete-scan'}));return result;}
 for(const asset of assets){signal?.throwIfAborted();const basename=basenameFor(asset),candidates=files.get(nameKey(basename))||[];if(requests.get(nameKey(basename)).size>1){result.pending.push({id:asset.id,reason:'ambiguous'});continue;}
  if(candidates.length!==1){result.pending.push({id:asset.id,reason:candidates.length?'ambiguous':'not-found'});continue;}
  try{const file=await realpath(candidates[0]),relative=path.relative(root,file);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Outside selected directory');const restored=await register(file,asset.id,asset,{signal});signal?.throwIfAborted();result.assets.push(restored);}catch(error){if(signal?.aborted)throw error;result.pending.push({id:asset.id,reason:'incompatible'});}progress();
 }
 }catch(error){if(!signal?.aborted)throw error;result.canceled=true;const done=new Set([...result.assets,...result.pending].map(a=>a.id));result.pending.push(...assets.filter(a=>!done.has(a.id)).map(a=>({id:a.id,reason:'canceled'})));}return result;
}

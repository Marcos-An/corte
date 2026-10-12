import {mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {binaries,run} from './media.mjs';
export function validateRecording(bytes,mime){
 if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>64*1024*1024)throw Error('Gravação vazia ou maior que 64 MB.');
 if(!['audio/webm','audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].includes(mime))throw Error('Formato de gravação não suportado.');
 return {extension:mime.startsWith('audio/webm')?'webm':mime.startsWith('audio/ogg')?'ogg':'m4a'};
}
export function microphoneAllowed(permission,details,armed){
 return armed&&permission==='media'&&details?.isMainFrame===true&&Array.isArray(details.mediaTypes)&&details.mediaTypes.length===1&&details.mediaTypes[0]==='audio';
}
export async function saveRecording(bytes,mime,directory){
 const {extension}=validateRecording(bytes,mime);await mkdir(directory,{recursive:true});
 const id=crypto.randomUUID(),input=path.join(directory,id+'.'+extension),output=path.join(directory,id+'.m4a');
 // Normalize MediaRecorder's streaming container so duration is finite after reopening.
 const temp=extension==='m4a'?path.join(directory,id+'-input.m4a'):input;
 try{await writeFile(temp,bytes,{flag:'wx'});await run(binaries().ffmpeg,['-hide_banner','-loglevel','error','-y','-i',temp,'-vn','-t','1800','-c:a','aac','-movflags','+faststart',output],{timeout:120000});return output;}
 catch(e){await rm(output,{force:true});throw e;}finally{await rm(temp,{force:true});}
}

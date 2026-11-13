import {rename,copyFile} from 'node:fs/promises';
// Target is the exporter's private partial file, never the user's final output.
// The system temp directory and export destination may be on different volumes.
// renderProject removes both staging locations if copying fails or is canceled.
export async function replaceRenderStage(source,partial,{signal,move=rename,copy=copyFile}={}){
 signal?.throwIfAborted();
 try{await move(source,partial);}catch(error){if(error.code!=='EXDEV')throw error;await copy(source,partial);}
 signal?.throwIfAborted();
}

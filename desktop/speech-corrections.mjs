import {createHash} from 'node:crypto';import {createReadStream} from 'node:fs';import {realpath,stat} from 'node:fs/promises';import {speechLanguage} from '../src/speech-language.mjs';import {applySpeechCorrections} from '../src/speech-corrections.mjs';
const signature=(file,s)=>JSON.stringify([file,s.size.toString(),s.mtimeNs.toString(),s.ctimeNs.toString()]);
export async function speechSourceHash(file,{signal,onProgress=()=>{}}={}){
 // Files can be overwritten within one filesystem timestamp tick. A cached stat
 // signature cannot prove that a saved correction still describes these bytes.
 signal?.throwIfAborted();const real=await realpath(file),before=await stat(real,{bigint:true});if(!before.isFile())throw Error('Mídia indisponível.');const key=signature(real,before),hash=createHash('sha256');let bytes=0,last=0;
 for await(const chunk of createReadStream(real,{signal})){hash.update(chunk);bytes+=chunk.length;if(performance.now()-last>500){last=performance.now();try{onProgress({stage:'speech-fingerprint',completed:bytes,total:Number(before.size)});}catch{}}}signal?.throwIfAborted();if(key!==signature(real,await stat(real,{bigint:true})))throw Error('A mídia mudou durante a conferência. Tente novamente.');return hash.digest('hex');
}
export async function verifiedSpeechHashes(project,transcripts,registry,options={}){
 const used=new Set(transcripts.map(t=>t.assetId)),hashes=new Map();for(const c of project.speechCorrections||[]){if(c.language!==speechLanguage(project)||!used.has(c.assetId)||hashes.has(c.assetId))continue;const file=registry.get(c.assetId)?.path;if(!file)continue;hashes.set(c.assetId,await speechSourceHash(file,options));}return hashes;
}
export async function correctedSpeech(project,transcripts,registry,options={}){const hashes=await verifiedSpeechHashes(project,transcripts,registry,options);return applySpeechCorrections(project,transcripts,hashes);}

import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {packagedTool} from '../desktop/runtime.mjs';
test('Windows distribution resolves bundled tools; local development keeps installed binaries',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-tools-'));await mkdir(path.join(dir,'tools'));await writeFile(path.join(dir,'tools','codex.exe'),'MZ');
 try{assert.equal(packagedTool('codex','fallback',{platform:'win32',resources:dir}),path.join(dir,'tools','codex.exe'));assert.equal(packagedTool('codex','fallback',{platform:'darwin',resources:dir}),'fallback');assert.equal(packagedTool('ffmpeg','fallback',{platform:'win32',resources:dir}),'fallback');assert.throws(()=>packagedTool('../../secret','fallback'));}finally{await rm(dir,{recursive:true,force:true});}
});
test('Apple Silicon package resolves native ffprobe without requiring Rosetta',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-mac-tools-'));await mkdir(path.join(dir,'tools'));await writeFile(path.join(dir,'tools','ffprobe'),'native');
 try{assert.equal(packagedTool('ffprobe','x64 fallback',{platform:'darwin',resources:dir}),path.join(dir,'tools','ffprobe'));}finally{await rm(dir,{recursive:true,force:true});}
});

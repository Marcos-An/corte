import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {preserveModels,modelStorePath} from '../desktop/models-store.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
test('AI persists outside installation and survives removal of bundled models, without copying again',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-models-'));try{
 const bundled=path.join(dir,'resources/models'),userData=path.join(dir,'user');await mkdir(bundled,{recursive:true});await writeFile(path.join(bundled,'model.onnx'),'weights');const manifest={files:[{path:'model.onnx',sha256:hash('weights')}]};
 const saved=await preserveModels({bundled,userData,manifest});assert.equal(saved,modelStorePath(userData,manifest));assert.equal(await readFile(path.join(saved,'model.onnx'),'utf8'),'weights');await rm(bundled,{recursive:true});assert.equal(await preserveModels({bundled,userData,manifest}),saved);
 await writeFile(path.join(saved,'model.onnx'),'corrupt');await assert.rejects(preserveModels({bundled,userData,manifest}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('incomplete or changed models cannot make updater replace working installation; no unsafe paths',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-models-'));try{
 const bundled=path.join(dir,'bundle'),userData=path.join(dir,'user');await mkdir(bundled);await writeFile(path.join(bundled,'model.onnx'),'bad');const manifest={files:[{path:'model.onnx',sha256:hash('good')}]};
 await assert.rejects(preserveModels({bundled,userData,manifest}));assert.deepEqual(await readdir(path.join(userData,'models')),[]);
 for(const p of ['../private','/absolute','x\\secret','.env'])await assert.rejects(preserveModels({bundled,userData,manifest:{files:[{path:p,sha256:hash('good')}]}}));
 }finally{await rm(dir,{recursive:true,force:true});}
});

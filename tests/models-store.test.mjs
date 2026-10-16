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
test('an optional model downloads into the user folder only when every file matches its checksum',async()=>{
 const {installOptionalModel,modelDownloadUrl,optionalModelPath}=await import('../desktop/models-store.mjs');
 const userData=await mkdtemp(path.join(tmpdir(),'corte-optional-'));
 try{
  const files={'org/model/config.json':'{"a":1}','org/model/onnx/encoder.onnx':'weights'},manifest={model:'org/model',revision:'abc',files:Object.entries(files).map(([p,c])=>({path:p,sha256:hash(c)}))};
  const served=[],fetch=async url=>{served.push(url);const file=Object.keys(files).find(f=>url.endsWith(f.split('/').slice(2).join('/')));return {ok:!!file,status:file?200:404,arrayBuffer:async()=>new TextEncoder().encode(files[file]).buffer};};
  assert.equal(await optionalModelPath(userData,manifest),null,'nothing is claimed before installation');
  const progress=[],target=await installOptionalModel({manifest,userData,fetch,onProgress:p=>progress.push(p)});
  assert.equal(await readFile(path.join(target,'org/model/onnx/encoder.onnx'),'utf8'),'weights');assert.equal(await optionalModelPath(userData,manifest),target);
  assert.deepEqual(served,['https://huggingface.co/org/model/resolve/abc/config.json','https://huggingface.co/org/model/resolve/abc/onnx/encoder.onnx']);assert.equal(progress.at(-1).completed,2);
  assert.equal(await installOptionalModel({manifest,userData,fetch:async()=>{throw Error('no network needed');}}),target,'an installed model is not downloaded again');
  const tampered={...manifest,revision:'def',files:[{path:'org/model/config.json',sha256:hash('other')}]};
  await assert.rejects(installOptionalModel({manifest:tampered,userData,fetch}),/corrompid|checksum/i);assert.equal(await optionalModelPath(userData,tampered),null,'a failed download leaves nothing usable');
  assert.equal(modelDownloadUrl(manifest,'org/model/onnx/encoder.onnx'),'https://huggingface.co/org/model/resolve/abc/onnx/encoder.onnx');
 }finally{await rm(userData,{recursive:true,force:true});}
});

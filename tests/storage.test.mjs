import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveProjectFile, readProjectFile, allowedMedia } from '../desktop/storage.mjs';
import { createProject, addAsset, addClip } from '../src/project.mjs';
test('save/open roundtrip preserves edits and source references separately',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-test-'));
 try {const a={id:'a',name:'a.mp4',duration:8,width:640,height:360,hasAudio:false};let p=addClip(addAsset(createProject(),a),'a','c');
 const registry=new Map([['a',{path:path.join(dir,'source.mp4')}]]),out=path.join(dir,'project.corte');
 await saveProjectFile(out,p,registry);const result=await readProjectFile(out);
 assert.deepEqual(result.project,p);assert.equal(result.sources[0].assetId,'a');
 assert.equal(JSON.parse(await readFile(out,'utf8')).project.clips[0].out,8);
 await assert.rejects(()=>saveProjectFile(path.join(dir,'source.mp4'),p,registry),/original|corte/i);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('file extension allowlist rejects secrets/URLs and non-project files',async()=>{
 assert.equal(allowedMedia('/a/test.mp4'),true);assert.equal(allowedMedia('/a/.env'),false);assert.equal(allowedMedia('https://a/x.mp4'),false);
 await assert.rejects(()=>readProjectFile('/tmp/a.env'));
});
test('project persists history including media referenced only by older states',async()=>{
 const {History,editProject}=await import('../src/project.mjs');const dir=await mkdtemp(path.join(tmpdir(),'corte-history-'));
 try{const a={id:'a',name:'a.mp4',duration:8,width:640,height:360,hasAudio:false},p=addClip(addAsset(createProject(),a),'a','c'),h=new History(p);
 h.commit(createProject(),{label:'Novo projeto'});const out=path.join(dir,'history.corte');await saveProjectFile(out,h.current,new Map([['a',{path:path.join(dir,'old.mp4')}]]),h.serialize());
 const result=await readProjectFile(out);assert.equal(result.history.entries.length,2);assert.equal(result.sources[0].assetId,'a');assert.deepEqual(History.from(result.history).restore(0),p);
 }finally{await rm(dir,{recursive:true,force:true});}
});

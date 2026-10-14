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
test('portable project copies referenced history media and survives moving its folder',async()=>{
 const {savePortableProject}=await import('../desktop/storage.mjs');const {History}=await import('../src/project.mjs');const {writeFile,rename}=await import('node:fs/promises');
 const dir=await mkdtemp(path.join(tmpdir(),'corte-portable-'));
 try{const source=path.join(dir,'original.mp4');await writeFile(source,'fixture-media');const asset={id:'a',name:'original.mp4',duration:8,width:640,height:360,hasAudio:false},h=new History(addClip(addAsset(createProject(),asset),'a','c'));h.commit(createProject(),{label:'Remover tudo'});
 const folder=path.join(dir,'portable'),file=await savePortableProject(folder,h.current,new Map([['a',{path:source}]]),h.serialize());const raw=JSON.parse(await readFile(file));assert.equal(raw.sources[0].relative,true);assert.match(raw.sources[0].path,/^media\//);assert.equal(await readFile(source,'utf8'),'fixture-media');
 const moved=path.join(dir,'moved');await rename(folder,moved);const reopened=await readProjectFile(path.join(moved,path.basename(file)));assert.deepEqual(reopened.history,h.serialize());assert.equal(await readFile(reopened.sources[0].path,'utf8'),'fixture-media');
 await assert.rejects(savePortableProject(moved,h.current,new Map([['a',{path:source}]]),h.serialize()));assert.equal(await readFile(reopened.sources[0].path,'utf8'),'fixture-media');
 const fail=path.join(dir,'failed');await assert.rejects(savePortableProject(fail,h.current,new Map(),h.serialize()));await assert.rejects(readFile(path.join(fail,'project.corte')));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('relative sources cannot escape the portable folder; Windows references remain readable on Mac',async()=>{
 const {writeFile}=await import('node:fs/promises');const dir=await mkdtemp(path.join(tmpdir(),'corte-relative-'));
 try{const a={id:'a',name:'source.mp4',duration:8,width:640,height:360,hasAudio:false},p=addClip(addAsset(createProject(),a),'a','c'),file=path.join(dir,'project.corte');
 const data={format:'corte-project',project:p,sources:[{assetId:'a',path:'media/0001.mp4',relative:true}]};await writeFile(file,JSON.stringify(data));assert.equal((await readProjectFile(file)).sources[0].path,path.join(dir,'media/0001.mp4'));
 for(const bad of ['../private.mp4','media/../../private.mp4','/private.mp4','media/evil.env','media\\..\\private.mp4']){data.sources[0].path=bad;await writeFile(file,JSON.stringify(data));await assert.rejects(readProjectFile(file));}
 data.sources=[{assetId:'a',path:'C:\\Videos\\source.mp4'}];await writeFile(file,JSON.stringify(data));assert.equal((await readProjectFile(file)).sources[0].path,data.sources[0].path);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('failed save preserves previous file, including history and project data',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-atomic-'));try{const file=path.join(dir,'project.corte'),p=createProject('Keep');await saveProjectFile(file,p,new Map());const before=await readFile(file);await assert.rejects(saveProjectFile(file,{...p,version:999},new Map()));assert.deepEqual(await readFile(file),before);}finally{await rm(dir,{recursive:true,force:true});}
});
test('write failure does not erase the last saved project',async t=>{
 if(process.platform==='win32'){t.skip('Directory permissions differ on Windows; portable failure gates remain cross-platform');return;}
 const {chmod}=await import('node:fs/promises');const dir=await mkdtemp(path.join(tmpdir(),'corte-write-failure-'));
 try{const file=path.join(dir,'saved.corte'),p=createProject('Previous');await saveProjectFile(file,p,new Map());const before=await readFile(file);await chmod(dir,0o500);await assert.rejects(saveProjectFile(file,createProject('Changed'),new Map()));assert.deepEqual(await readFile(file),before);}finally{await chmod(dir,0o700);await rm(dir,{recursive:true,force:true});}
});
test('invalid source references cannot replace a previously saved file',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-source-validation-'));try{const a={id:'a',name:'source.mp4',duration:8,width:640,height:360,hasAudio:false},p=addClip(addAsset(createProject(),a),'a','c'),file=path.join(dir,'saved.corte');await saveProjectFile(file,p,new Map([['a',{path:path.join(dir,'source.mp4')}]]));const before=await readFile(file);await assert.rejects(saveProjectFile(file,p,new Map([['a',{path:path.join(dir,'private.env')}]])));assert.deepEqual(await readFile(file),before);}finally{await rm(dir,{recursive:true,force:true});}
});

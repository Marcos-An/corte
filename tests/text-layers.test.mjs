import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/project.mjs';
import {toAss} from '../src/captions.mjs';
const style={font:'Arial',size:8,color:'#ff0000',position:'center',positionX:30,positionY:30,preset:'clean'};
test('text layers reject malformed content, timing and style without affecting legacy projects',()=>{
 const p=model.createProject();assert.equal(model.validateProject(p),p);
 const layer={id:'t',text:'Título',start:0,end:2,style};
 for(const patch of [{text:''},{start:-1},{end:0},{style:{...style,positionX:NaN}}])assert.throws(()=>model.validateProject({...p,textLayers:[{...layer,...patch}]}));
 assert.throws(()=>model.validateProject({...p,textLayers:[layer,layer]}));
});
test('independent text supports editing, deletion, undo and project history persistence',()=>{
 const p=model.addTextLayer(model.createProject(),{id:'t',text:'Título',start:0,end:2,style});
 const h=new model.History(p);h.commit(model.editTextLayer(p,'t',{text:'Novo texto',end:3}));
 assert.equal(h.current.textLayers[0].text,'Novo texto');assert.equal(h.current.transcripts,undefined);
 const restored=model.History.from(h.serialize());assert.equal(restored.current.textLayers[0].end,3);restored.undo();assert.equal(restored.current.textLayers[0].text,'Título');
 assert.deepEqual(model.editTextLayer(p,'t',null).textLayers,[]);
});
test('ASS preserves each text layer style, position and timing alongside captions',()=>{
 const ass=toAss([{start:0,end:1,text:'Legenda'},{start:1,end:2,text:'Título',style}],720,720);
 assert.match(ass,/\\pos\(216,216\)/);assert.match(ass,/Arial/);assert.match(ass,/&H000000FF/);assert.match(ass,/0:00:01.00,0:00:02.00/);
});
test('text layer project saves and reopens from disk with editable history',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {saveProjectFile,readProjectFile}=await import('../desktop/storage.mjs');
 const dir=await mkdtemp(join(tmpdir(),'corte-text-save-'));
 try{
  const p=model.addTextLayer(model.createProject(),{id:'t',text:'Título',start:0,end:2,style}),h=new model.History(p);
  h.commit(model.editTextLayer(p,'t',{text:'Salvo'}));const file=join(dir,'test.corte');
  await saveProjectFile(file,h.current,new Map(),h.serialize());const result=await readProjectFile(file);
  assert.deepEqual(result.project,h.current);assert.equal(model.History.from(result.history).undo().textLayers[0].text,'Título');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('independent text retains explicit line breaks in export',()=>{
 const ass=toAss([{id:'t',start:0,end:1,text:'Um\nOi',style}],720,720);
 assert.match(ass,/Um\\NOi/);
});
test('every bundled font ships in vendor/fonts and is accepted by validation and export',async()=>{
 const {FONTS}=await import('../src/fonts.mjs'),{existsSync}=await import('node:fs'),{join}=await import('node:path');
 assert.ok(FONTS.length>=50);
 for(const f of FONTS){
  if(f.file)assert.ok(existsSync(join(import.meta.dirname,'../vendor/fonts',f.file)),f.file);
  const p=model.addTextLayer(model.createProject(),{id:'t',text:'Título',start:0,end:2,style:{...style,font:f.family}});
  assert.match(toAss([{...p.textLayers[0]}],720,720),new RegExp('Style: Layer0,'+f.family+','));
 }
});

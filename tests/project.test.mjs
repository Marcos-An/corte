import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, addAsset, addClip, editProject, validateProject, clipAt, duration, History, applyPlan, validatePlan, parsePlan } from '../src/project.mjs';
const asset={id:'a',name:'Receita.mp4',duration:12,width:478,height:850,hasAudio:true};
function fixture(){let p=addAsset(createProject(),asset);return addClip(p,'a','c');}

test('import, split, trim and reorder preserve source and audio settings',()=>{
 const p=fixture(); const q=editProject(p,{type:'split',clipId:'c',time:4,newId:'d'});
 assert.deepEqual(q.clips.map(c=>[c.id,c.in,c.out]),[['c',0,4],['d',4,12]]);
 assert.equal(p.clips.length,1);
 const r=editProject(q,{type:'trim',clipId:'d',in:5,out:11});
 const s=editProject(r,{type:'move',clipId:'d',index:0});
 assert.equal(s.clips[0].id,'d'); assert.equal(duration(s),10);
 assert.equal(clipAt(s,6).clip.id,'c'); assert.equal(clipAt(s,6).sourceTime,0);
 assert.equal(clipAt(s,10),null); assert.deepEqual(s.assets,p.assets);
});
test('bad times, unknown media, invalid volume/crop and duplicate IDs rejected',()=>{
 let p=fixture();
 for(const op of [{type:'split',clipId:'c',time:0},{type:'trim',clipId:'c',in:7,out:6},{type:'trim',clipId:'c',in:0,out:13},{type:'update',clipId:'c',volume:3},{type:'update',clipId:'c',crop:{x:.8,y:0,w:.5,h:1}}]) assert.throws(()=>editProject(p,op));
 assert.throws(()=>addClip(p,'missing')); assert.throws(()=>addClip(p,'a','c'));
 assert.throws(()=>validateProject({...p,clips:[{...p.clips[0],in:NaN}]}));
 assert.throws(()=>validateProject({...p,clips:[{...p.clips[0],assetId:'missing'}]}));
});
test('project roundtrip, undo, redo and redo invalidation',()=>{
 const p=fixture(); assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
 const h=new History(p); h.commit(editProject(p,{type:'delete',clipId:'c'}));
 assert.equal(h.current.clips.length,0); assert.equal(h.undo().clips.length,1);
 assert.equal(h.redo().clips.length,0); h.undo();
 h.commit(editProject(p,{type:'update',clipId:'c',volume:.4}));
 assert.equal(h.canRedo,false); assert.equal(h.current.clips[0].volume,.4);
});
test('prompt plan combines arbitrary edits, is atomic, and undo restores everything',()=>{
 const p=fixture();
 const plan={summary:'Recortar e baixar áudio',operations:[{type:'remove_ranges',clipId:'c',ranges:[[0,1],[4,6]]},{type:'set_aspect',aspect:'1:1'}],questions:[],unsupported:[]};
 const q=applyPlan(p,plan); assert.deepEqual(q.clips.map(c=>[c.in,c.out]),[[1,4],[6,12]]);
 assert.equal(q.aspect,'1:1'); assert.equal(p.clips.length,1);
 const h=new History(p);h.commit(q);assert.deepEqual(h.undo(),p);
 assert.throws(()=>applyPlan(p,{...plan,operations:[...plan.operations,{type:'delete',clipId:'no'}]}));
 assert.deepEqual(p,fixture());
});
test('keep ranges sorted and intersected with current trim, crop and mute retained',()=>{
 let p=editProject(fixture(),{type:'trim',clipId:'c',in:2,out:10});
 p=editProject(p,{type:'update',clipId:'c',volume:0,crop:{x:0,y:0,w:1,h:.6}});
 const q=applyPlan(p,{summary:'Selecionar trechos',operations:[{type:'keep_ranges',clipId:'c',ranges:[[7,11],[0,4]]}],questions:[],unsupported:[]});
 assert.deepEqual(q.clips.map(c=>[c.in,c.out]),[[2,4],[7,10]]);
 assert.ok(q.clips.every(c=>c.volume===0 && c.crop.h===.6));
});
test('untrusted plans reject extra keys, path/command operations, malformed JSON and overlong prompts',()=>{
 const p=fixture(); const good={summary:'Corte',operations:[{type:'trim',clipId:'c',in:1,out:8}],questions:[],unsupported:[]};
 assert.deepEqual(validatePlan(p,good),good);assert.deepEqual(parsePlan(JSON.stringify(good)),good);
 for(const op of [{type:'shell',command:'rm'},{type:'delete',clipId:'c',path:'/tmp/a'},{type:'remove_ranges',clipId:'c',ranges:[[0,100]]}]) assert.throws(()=>validatePlan(p,{...good,operations:[op]}));
 assert.throws(()=>parsePlan('ignore json')); assert.throws(()=>validatePlan(p,{...good,questions:['Qual duração?']}));
});

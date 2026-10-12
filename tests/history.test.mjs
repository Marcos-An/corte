import test from 'node:test';
import assert from 'node:assert/strict';
import {History,createProject,addAsset,addClip,editProject,applyPlan} from '../src/project.mjs';
const asset={id:'a',name:'video.mp4',duration:12,width:480,height:850,hasAudio:true};
const p=addClip(addAsset(createProject(),asset),'a','c');
test('history lists metadata, restores any snapshot and retains abandoned edits',()=>{
 const h=new History(p);h.commit(editProject(p,{type:'trim',clipId:'c',in:1,out:9}),{label:'Aparar',details:['1–9s'],affected:['c']});
 h.commit(editProject(h.current,{type:'update',clipId:'c',volume:.5}),{label:'Volume'});
 assert.equal(h.entries[1].label,'Aparar');assert.equal(h.entries[1].affected[0],'c');assert.ok(h.entries[1].at);
 h.restore(0);assert.deepEqual(h.current,p);h.commit(editProject(p,{type:'set_aspect',aspect:'1:1'}),{label:'Formato'});
 assert.equal(h.entries.length,4);assert.equal(h.canRedo,false);assert.deepEqual(h.undo(),p);assert.equal(h.redo().aspect,'1:1');
 h.restore(2);assert.equal(h.current.clips[0].volume,.5);
 const loaded=History.from(h.serialize());assert.equal(loaded.cursor,2);assert.deepEqual(loaded.entries,h.entries);assert.throws(()=>loaded.restore(999));
});
test('AI group records details as one atomic snapshot, invalid plans leave no changes',()=>{
 const h=new History(p),plan={summary:'Ajustes',operations:[{type:'trim',clipId:'c',in:2,out:10},{type:'update',clipId:'c',volume:.2}],questions:[],unsupported:[]};
 h.commit(applyPlan(h.current,plan),{label:'IA: Ajustes',details:['Aparar','Volume'],affected:['c']});assert.equal(h.entries.length,2);assert.equal(h.entries[1].details.length,2);assert.deepEqual(h.undo(),p);
 const count=h.entries.length;assert.throws(()=>h.commit(applyPlan(h.current,{...plan,operations:[...plan.operations,{type:'delete',clipId:'missing'}]})));assert.equal(h.entries.length,count);assert.deepEqual(h.current,p);
 assert.throws(()=>History.from({...h.serialize(),cursor:999}));assert.throws(()=>History.from({...h.serialize(),entries:[{...h.entries[0],state:{}}]}));
});

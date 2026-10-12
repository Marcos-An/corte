import test from 'node:test';import assert from 'node:assert/strict';import * as m from '../src/project.mjs';import {captionEntries} from '../src/captions.mjs';
const asset={id:'a',name:'a',duration:10,width:160,height:160,hasAudio:true};
function base(){let p=m.addClip(m.addAsset(m.createProject(),asset),'a','l');p=m.editProject(p,{type:'trim',clipId:'l',in:1,out:3});p=m.addClip(p,'a','r');return m.editProject(p,{type:'trim',clipId:'r',in:4,out:6});}
test('centered transitions use handles without changing montage length or captions',()=>{
 const p=base();p.clips[0].captionWords=[{start:2,end:2.5,text:'fala'}];const q=m.setTransition(p,'l','r','dissolve',1);
 assert.equal(m.duration(q),4);assert.deepEqual(captionEntries(q),captionEntries(p));assert.equal(m.transitionLimit(q,'l','r'),2);
 const at=m.transitionAt(q,2);assert.equal(at.progress,.5);assert.equal(at.leftTime,3);assert.equal(at.rightTime,4);assert.equal(at.start,1.5);assert.equal(at.end,2.5);
 assert.equal(m.transitionAt(q,1),null);assert.equal(m.transitionAt(q,2.5),null);const h=new m.History(p);h.commit(q);assert.deepEqual(h.undo(),p);assert.deepEqual(h.redo(),q);
 assert.deepEqual(m.setTransition(q,'l','r','none',1).transitions,[]);
});
test('duration limits require real source handles, adjacency and valid effects',()=>{
 const p=base();p.clips[0].out=9.8;assert.equal(m.transitionLimit(p,'l','r'),.4);const q=m.setTransition(p,'l','r','slide',2);assert.equal(q.transitions[0].duration,.4);
 for(const t of [{...q.transitions[0],duration:NaN},{...q.transitions[0],duration:.5},{...q.transitions[0],type:'evil'},{...q.transitions[0],rightId:'l'}])assert.throws(()=>m.validateProject({...q,transitions:[t]}));
 assert.throws(()=>m.validateProject({...q,transitions:[q.transitions[0],q.transitions[0]]}));assert.throws(()=>m.setTransition(p,'r','l','dissolve',1));
 p.clips[0].out=10;assert.equal(m.transitionLimit(p,'l','r'),0);assert.throws(()=>m.setTransition(p,'l','r','dissolve',1),/margem/i);
 assert.throws(()=>m.setTransition(base(),'l','r','fade',-1));
});
test('editing clips removes orphaned transitions and clamps remaining handles',()=>{
 const p=m.setTransition(base(),'l','r','fade',1);
 for(const op of [{type:'delete',clipId:'r'},{type:'move',clipId:'r',index:0}])assert.deepEqual(m.editProject(p,op).transitions,[]);
 const trimmed=m.editProject(p,{type:'trim',clipId:'l',in:1,out:9.8});assert.equal(trimmed.transitions[0].duration,.4);
 const split=m.editProject(p,{type:'split',clipId:'l',time:2,newId:'split'});assert.equal(split.transitions[0].leftId,'split','outgoing transition follows the actual cut boundary');
 assert.equal(m.editProject(p,{type:'trim',clipId:'r',in:0,out:6}).transitions.length,0);
 const removed=m.applyPlan(p,{summary:'cut',operations:[{type:'remove_ranges',clipId:'r',ranges:[[4,6]]}],questions:[],unsupported:[]});assert.deepEqual(removed.transitions,[]);
});
test('photographs need no extra source handles and adjacent windows cannot overlap',()=>{
 let p=base();p.assets[0].kind='image';p.clips[0].out=10;p.clips[1].in=0;p.clips[1].out=.5;
 assert.equal(m.transitionLimit(p,'l','r'),.5);const q=m.setTransition(p,'l','r','fade',.5);assert.doesNotThrow(()=>m.validateProject(q));
});
test('transitionRoom trims each side of a cut with no spare frames so the transition fits',()=>{
 let p=m.addClip(m.addAsset(m.createProject(),asset),'a','l');p=m.addClip(p,'a','r');
 assert.equal(m.transitionLimit(p,'l','r'),0);
 const q=m.transitionRoom(p,'l','r',1);
 assert.equal(q.clips[0].out,9.5);assert.equal(q.clips[1].in,.5);assert.equal(m.duration(q),19);
 assert.equal(m.transitionLimit(q,'l','r'),1);
 assert.equal(m.setTransition(q,'l','r','dissolve',1).transitions[0].duration,1);
 // Existing handles are reused; nothing is trimmed when the media already has room.
 const b=base();assert.equal(m.transitionRoom(b,'l','r',1),b);
 assert.throws(()=>m.transitionRoom(p,'r','l',1));
});

import test from 'node:test';import assert from 'node:assert/strict';
import * as model from '../src/project.mjs';import {allowedMedia} from '../desktop/storage.mjs';import {buildSegmentArgs} from '../desktop/media.mjs';
const photo={id:'p',name:'logo.png',kind:'image',duration:5,width:200,height:100,hasAudio:false};
const video={id:'v',name:'a.mp4',duration:4,width:320,height:240,hasAudio:false};
const base=()=>model.addClip(model.addAsset(model.createProject(),video),'v','c');
const image={id:'i',assetId:'p',start:0,end:3,x:50,y:50,width:40,rotation:0,opacity:100};
test('images are accepted media and immediately usable as timed primary clips',()=>{
 assert.equal(allowedMedia('/tmp/logo.png'),true);assert.equal(allowedMedia('/tmp/a.jpg'),true);assert.equal(allowedMedia('/tmp/a.webp'),true);assert.equal(allowedMedia('/tmp/a.svg'),false);
 const p=model.addClip(model.addAsset(model.createProject(),photo),'p');assert.equal(model.duration(p),5);
 const args=buildSegmentArgs(p.clips[0],photo,'a.png','out.mp4','9:16');assert.ok(args.includes('-loop'));
});
test('image components edit, undo and validate source, times and transforms',()=>{
 const p=model.addImageLayer(model.addAsset(base(),photo),image),h=new model.History(p);
 h.commit(model.editImageLayer(p,'i',{x:25,end:2,opacity:50}));assert.equal(h.current.imageLayers[0].x,25);h.undo();assert.deepEqual(h.current.imageLayers[0],image);
 for(const patch of [{assetId:'v'},{end:0},{width:NaN},{rotation:999},{opacity:-1}])assert.throws(()=>model.validateProject({...p,imageLayers:[{...image,...patch}]}));
 assert.deepEqual(model.editImageLayer(p,'i',null).imageLayers,[]);
});
test('background changes are validated and do not change clip duration',()=>{
 const p=base(),q=model.editProject(p,{type:'update',clipId:'c',background:'blur'});assert.equal(q.clips[0].background,'blur');assert.equal(model.duration(q),4);
 assert.throws(()=>model.validateProject({...p,clips:[{...p.clips[0],background:'invalid'}]}));
 const args=buildSegmentArgs(q.clips[0],video,'a.mp4','out.mp4','9:16');assert.ok(args.includes('-filter_complex'));assert.match(args.join(' '),/gblur/);
});
test('custom background color validates, persists in history and renders safe padding',()=>{
 const p=base(),q=model.editProject(p,{type:'update',clipId:'c',background:'color',backgroundColor:'#12ab34'}),h=new model.History(p);
 assert.equal(q.clips[0].backgroundColor,'#12ab34');h.commit(q);assert.deepEqual(h.undo(),p);assert.deepEqual(h.redo(),q);
 const args=buildSegmentArgs(q.clips[0],video,'a.mp4','out.mp4','9:16');assert.match(args.join(' '),/pad=.*0x12ab34/);
 for(const backgroundColor of ['red',"#ffffff,evil",null,123])assert.throws(()=>model.validateProject({...q,clips:[{...q.clips[0],backgroundColor}]}));
 assert.throws(()=>model.validateProject({...q,clips:[{...q.clips[0],backgroundColor:undefined}]}));
});

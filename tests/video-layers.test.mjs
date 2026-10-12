import test from 'node:test';import assert from 'node:assert/strict';import * as m from '../src/project.mjs';
const asset={id:'v',name:'video',duration:6,width:320,height:240,hasAudio:true};
const p=m.addClip(m.addAsset(m.createProject(),asset),'v','c');
const layer={id:'l',assetId:'v',start:1,end:3,in:2,x:50,y:50,width:40,rotation:0,opacity:100};
test('video overlays preserve their source interval, are muted, editable and undoable',()=>{
 const q=m.addVideoLayer(p,layer);assert.equal(q.videoLayers[0].in,2);assert.equal(m.duration(q),6);
 const h=new m.History(q);h.commit(m.editVideoLayer(q,'l',{in:1,start:0,end:4}));assert.equal(h.current.videoLayers[0].end,4);assert.deepEqual(h.undo(),q);
 for(const patch of [{in:-1},{in:5},{assetId:'missing'},{opacity:NaN},{width:0},{start:3}])assert.throws(()=>m.validateProject({...q,videoLayers:[{...layer,...patch}]}));
 assert.deepEqual(m.editVideoLayer(q,'l',null).videoLayers,[]);
});

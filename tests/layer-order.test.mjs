import test from 'node:test';import assert from 'node:assert/strict';import * as m from '../src/project.mjs';
const video={id:'v',name:'v',duration:4,width:160,height:160,hasAudio:false},image={...video,id:'i',kind:'image'};
const place={start:0,end:2,x:50,y:50,width:40,rotation:0,opacity:100};
const text={id:'t',start:0,end:2,text:'Título',style:{font:'Arial',color:'#ffffff',size:10,preset:'clean',position:'center'}};
function base(){let p=m.addClip(m.addAsset(m.addAsset(m.createProject(),video),image),'v','c');p=m.addImageLayer(p,{...place,id:'il',assetId:'i'});p=m.addVideoLayer(p,{...place,id:'vl',assetId:'v',in:0});return m.addTextLayer(p,text);}
test('one global order retains legacy appearance and moves components relative to each other',()=>{
 const p=base();assert.deepEqual(m.layerOrder(p),['il','vl','@captions','t']);
 const q=m.moveLayer(p,'il','front');assert.deepEqual(m.layerOrder(q),['vl','@captions','t','il']);assert.deepEqual(m.layerOrder(p),['il','vl','@captions','t']);
 const back=m.moveLayer(q,'t','back');assert.deepEqual(m.layerOrder(back),['t','vl','@captions','il']);
 const h=new m.History(p);h.commit(q);assert.deepEqual(h.undo(),p);assert.deepEqual(h.redo(),q);
 assert.throws(()=>m.moveLayer(p,'missing','front'));assert.throws(()=>m.moveLayer(p,'il','unknown'));
});
test('adding and deleting preserve order with new components on top; invalid saved orders rejected',()=>{
 let p=m.moveLayer(base(),'il','front');p=m.addTextLayer(p,{...text,id:'new'});assert.equal(m.layerOrder(p).at(-1),'new');
 p=m.editImageLayer(p,'il',null);assert.equal(m.layerOrder(p).includes('il'),false);assert.doesNotThrow(()=>m.validateProject(p));
 for(const layerOrder of [null,['vl','vl'],['missing'],['t']])assert.throws(()=>m.validateProject({...p,layerOrder}));
 assert.throws(()=>m.validateProject({...base(),textLayers:[{...text,id:'il'}]}),'cross-kind identities must be unique');
});

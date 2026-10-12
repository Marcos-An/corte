import test from 'node:test';import assert from 'node:assert/strict';import * as m from '../src/project.mjs';
const shape={id:'s',type:'rectangle',start:0,end:2,x:50,y:50,width:40,height:20,rotation:0,opacity:100,fill:'#ff0000',stroke:'#ffffff',strokeWidth:.5};
test('shapes need no media, are editable, ordered and undoable without changing legacy projects',()=>{
 const p=m.createProject(),q=m.addShapeLayer(p,shape);assert.deepEqual(p,m.createProject());assert.equal(q.assets.length,0);assert.deepEqual(m.layerOrder(q),['@captions','s']);
 for(const type of ['circle','line','arrow'])assert.equal(m.editShapeLayer(q,'s',{type}).shapeLayers[0].type,type);
 const h=new m.History(q);h.commit(m.editShapeLayer(q,'s',{fill:null,x:60}));assert.equal(h.current.shapeLayers[0].fill,null);assert.deepEqual(h.undo(),q);assert.equal(h.redo().shapeLayers[0].x,60);
 assert.deepEqual(m.layerOrder(m.editShapeLayer(m.moveLayer(q,'s','back'),'s',null)),['@captions']);
});
test('shape validation rejects unsafe colors, geometry, times and duplicate identities',()=>{
 const q=m.addShapeLayer(m.createProject(),shape);
 for(const patch of [{type:'svg'},{fill:'url(x)'},{stroke:'red'},{height:0},{width:101},{strokeWidth:-1},{opacity:NaN},{rotation:181},{end:0},{start:-1},{id:'@captions'}])assert.throws(()=>m.validateProject({...q,shapeLayers:[{...shape,...patch}]}));
 assert.throws(()=>m.addShapeLayer(q,shape));assert.throws(()=>m.editShapeLayer(q,'unknown',{}));
});

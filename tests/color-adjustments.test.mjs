import test from 'node:test';import assert from 'node:assert/strict';import * as m from '../src/project.mjs';
const p=m.addClip(m.addAsset(m.createProject(),{id:'v',name:'v',duration:2,width:320,height:240,hasAudio:false}),'v','c');
test('per-clip adjustments validate, survive split/history and reset without touching crop or audio',()=>{
 const adjustments={brightness:.2,contrast:1.5,saturation:.5},q=m.editProject(p,{type:'update',clipId:'c',adjustments});assert.deepEqual(q.clips[0].adjustments,adjustments);assert.equal(p.clips[0].adjustments,undefined);
 const split=m.editProject(q,{type:'split',clipId:'c',time:1,newId:'r'});assert.deepEqual(split.clips[1].adjustments,adjustments);
 const h=new m.History(q);h.commit(m.editProject(q,{type:'update',clipId:'c',adjustments:{brightness:0,contrast:1,saturation:1}}));assert.deepEqual(h.current.clips[0].crop,q.clips[0].crop);assert.equal(h.current.clips[0].volume,q.clips[0].volume);assert.deepEqual(h.undo(),q);
 for(const a of [null,{}, {...adjustments,brightness:2},{...adjustments,contrast:-1},{...adjustments,saturation:NaN},{...adjustments,extra:'x'}])assert.throws(()=>m.editProject(p,{type:'update',clipId:'c',adjustments:a}));
});
test('shared RGB adjustment preserves defaults, changes brightness/contrast and desaturates without touching alpha',async()=>{
 const {adjustPixels}=await import('../src/color-adjustments.mjs');const pixel=new Uint8ClampedArray([120,60,20,123]);assert.deepEqual(adjustPixels(pixel.slice(),undefined),pixel);
 assert.deepEqual([...adjustPixels(pixel.slice(),{brightness:.2,contrast:1,saturation:1})],[171,111,71,123]);
 assert.deepEqual([...adjustPixels(pixel.slice(),{brightness:0,contrast:0,saturation:1})],[128,128,128,123]);
 const gray=adjustPixels(pixel.slice(),{brightness:0,contrast:1,saturation:0});assert.equal(gray[0],gray[1]);assert.equal(gray[1],gray[2]);assert.equal(gray[3],123);
});
test('adjustment processing preserves exact fractional crop geometry rather than rounded buffer aspect',async()=>{
 const {paintClip}=await import('../src/transition-preview.mjs'),draws=[],operations=[],off={width:0,height:0,getContext:()=>({clearRect(){operations.push('clear');},drawImage(){operations.push('draw');},getImageData:()=>({data:new Uint8ClampedArray(4)}),putImageData(){}})};
 const ctx={canvas:{width:406,height:720,ownerDocument:{createElement:()=>off}},fillRect(){},drawImage(...args){draws.push(args);}},crop={x:.13,y:.21,w:.67,h:.64};paintClip(ctx,{naturalWidth:317,naturalHeight:241},{crop,adjustments:{brightness:.2,contrast:1,saturation:1}});
 const foreground=draws.at(-1),expectedHeight=241*.64/(317*.67)*406;assert.ok(Math.abs(foreground.at(-1)-expectedHeight)<.00001,'original crop ratio is preserved');assert.deepEqual(operations,['clear','draw'],'clear reusable pixels before painting');paintClip(ctx,{naturalWidth:317,naturalHeight:241},{crop,adjustments:{brightness:.2,contrast:1,saturation:1}});assert.deepEqual(operations,['clear','draw','clear','draw'],'every redraw clears the reusable buffer');
});

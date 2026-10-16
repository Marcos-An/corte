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
test('temperature warms or cools and sharpness raises edge contrast, in preview math and export filter alike',async()=>{
 const {adjustPixels,adjustmentFilter,hasAdjustments,DEFAULT_ADJUSTMENTS}=await import('../src/color-adjustments.mjs');
 assert.equal(hasAdjustments({brightness:0,contrast:1,saturation:1}),false,'projects saved before temperature/sharpness stay unadjusted');assert.equal(hasAdjustments(DEFAULT_ADJUSTMENTS),false);
 const grey=()=>new Uint8ClampedArray([128,128,128,255]);const warm=adjustPixels(grey(),{...DEFAULT_ADJUSTMENTS,temperature:.5}),cool=adjustPixels(grey(),{...DEFAULT_ADJUSTMENTS,temperature:-.5});
 assert.ok(warm[0]>128&&warm[2]<128&&cool[0]<128&&cool[2]>128,JSON.stringify({warm:[...warm],cool:[...cool]}));assert.equal(warm[3],255);
 const edge=()=>new Uint8ClampedArray([...[100,100,100,255],...[100,100,100,255],...[160,160,160,255],...[160,160,160,255]]),sharp=adjustPixels(edge(),{...DEFAULT_ADJUSTMENTS,sharpness:1},4);
 assert.ok(sharp[4]<100&&sharp[8]>160,'the step between dark and light gets steeper');
 const filter=adjustmentFilter({...DEFAULT_ADJUSTMENTS,temperature:.5,sharpness:.5});assert.match(filter,/colorchannelmixer=rr=1\.06/);assert.match(filter,/unsharp=5:5:0\.75/);
 for(const bad of [{temperature:2},{sharpness:-.1},{sharpness:1.5}])assert.throws(()=>m.validateProject({...p,clips:p.clips.map(c=>({...c,adjustments:{...DEFAULT_ADJUSTMENTS,...bad}}))}),/ajustes/i);
 assert.doesNotThrow(()=>m.validateProject({...p,clips:p.clips.map(c=>({...c,adjustments:{...DEFAULT_ADJUSTMENTS,temperature:-.3,sharpness:.4}}))}));
});

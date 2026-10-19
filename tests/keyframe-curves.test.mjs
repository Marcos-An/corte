import test from 'node:test';import assert from 'node:assert/strict';import * as m from '../src/project.mjs';
import {EASINGS,keyframeAt,keyframeExpression,easedProgress,assFrameInterval} from '../src/keyframes.mjs';
const shape={id:'s',type:'rectangle',start:1,end:5,x:50,y:50,width:40,height:20,rotation:0,opacity:100,fill:'#ffffff',stroke:null,strokeWidth:.5};
const fixture=easing=>m.setKeyframe(m.setKeyframe(m.addShapeLayer(m.createProject(),shape),'s',0,{x:20,y:30,size:20,opacity:20,easing}),'s',4,{x:80,y:70,size:60,opacity:100});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} vs ${b}`),oracle=(id,u)=>id==='ease-in'?u*u:id==='ease-out'?1-(1-u)**2:id==='ease-in-out'?u*u*(3-2*u):u;
test('curves have independently verified intermediate positions, full transforms and held endpoints',()=>{
 for(const {id}of EASINGS){const p=fixture(id),t=p.shapeLayers[0];for(const u of [0,.1,.25,.5,.75,.9,1]){const f=oracle(id,u),sample=keyframeAt(t,4*u);near(sample.x,20+60*f);near(sample.y,30+40*f);near(sample.size,20+40*f);near(sample.opacity,20+80*f);}assert.equal(keyframeAt(t,-1).x,20);assert.equal(keyframeAt(t,6).x,80);}
});
test('nonlinear curves survive repeated trims, exact keyframe boundaries, tiny intervals and extending held endpoints',()=>{
 for(const {id}of EASINGS){let p=fixture(id);p=m.setKeyframe(p,'s',2,{x:50});const original=p.shapeLayers[0];
  const trimmed=m.editShapeLayer(p,'s',{start:1.4,end:4.7}),again=m.editShapeLayer(trimmed,'s',{start:1.8,end:4.2});for(const q of [trimmed,again]){const t=q.shapeLayers[0];for(let i=0;i<=20;i++){const time=(t.end-t.start)*i/20;for(const field of ['x','y','size','opacity'])near(keyframeAt(t,time)[field],keyframeAt(original,t.start-original.start+time)[field]);}}
  for(const bounds of [{start:3,end:5},{start:1,end:3},{start:3,end:4},{start:3-1e-10,end:4},{start:0,end:6}]){const q=m.editShapeLayer(p,'s',bounds).shapeLayers[0];for(let i=0;i<=20;i++){const time=(q.end-q.start)*i/20;near(keyframeAt(q,time).x,keyframeAt(original,q.start-original.start+time).x);}}
 }
});
test('inserting a sampled point leaves the full curve unchanged and removal rejoins it; pose edits retain outgoing curves',()=>{
 for(const id of ['ease-in','ease-out','ease-in-out']){const p=fixture(id),original=p.shapeLayers[0];let q=m.setKeyframe(p,'s',1.3,{});q=m.setKeyframe(q,'s',2.7,{});for(let i=0;i<=80;i++)near(keyframeAt(q.shapeLayers[0],i/20).x,keyframeAt(original,i/20).x);
  q=m.setKeyframe(q,'s',1.3,null);q=m.setKeyframe(q,'s',2.7,null);for(let i=0;i<=80;i++)near(keyframeAt(q.shapeLayers[0],i/20).x,keyframeAt(original,i/20).x);
  const updated=m.setKeyframe(p,'s',0,{opacity:30});assert.equal(updated.shapeLayers[0].keyframes[0].easing,id);const reset=m.setKeyframe(m.setKeyframe(p,'s',1,{}),'s',0,{easing:'linear'});assert.equal(reset.shapeLayers[0].keyframes[0].easing,undefined);assert.equal(reset.shapeLayers[0].keyframes[0].curveWindow,undefined);assert.deepEqual(p,fixture(id));
 }
});
test('curve-only plans preserve poses and history; invalid curves, windows and provider-supplied windows are refused',()=>{
 const p=fixture('linear'),draft={summary:'Suavizar',questions:[],unsupported:[],operations:[{type:'set_keyframe',layerId:'s',time:0,pose:{easing:'ease-in-out'}}]},q=m.applyPlan(p,draft),h=new m.History(p);h.commit(q);assert.deepEqual(h.undo(),p);assert.equal(h.redo().shapeLayers[0].keyframes[0].easing,'ease-in-out');assert.deepEqual(m.validateProject(JSON.parse(JSON.stringify(q))),q);
 for(const patch of [{easing:'invalid'},{easing:null},{curveWindow:{from:0,to:.5}}])assert.throws(()=>m.setKeyframe(p,'s',0,patch));
 for(const window of [null,{from:0,to:0},{from:.6,to:.4},{from:-.1,to:1},{from:0,to:2},{from:0,to:NaN},{from:0,to:1,extra:1}]){const t=structuredClone(q);t.shapeLayers[0].keyframes[0].curveWindow=window;assert.throws(()=>m.validateProject(t));}
 const cropped=m.editShapeLayer(q,'s',{start:2,end:4}).shapeLayers[0],x=keyframeExpression(cropped,'x');assert.ok(x.includes('clip('));assert.ok(!/NaN|Infinity/.test(x));for(const point of [{easing:'ease-in',curveWindow:{from:0,to:1e-10}},{easing:'ease-out',curveWindow:{from:1-1e-10,to:1}},{easing:'ease-out',curveWindow:{from:1-Number.EPSILON/2,to:1}},{easing:'ease-in-out',curveWindow:{from:1-1e-10,to:1}}])for(const u of [0,.1,.5,.9,1])assert.ok(Number.isFinite(easedProgress(point,u))&&easedProgress(point,u)>=0&&easedProgress(point,u)<=1);
});
test('ASS boundaries select exactly the intended 30fps frames even when the renderer truncates milliseconds',()=>{
 const clock=frame=>Math.max(0,Math.floor(frame*1000/30-1e-7)/1000);
 for(let first=0;first<400;first++){
  const interval=assFrameInterval(first/30,(first+1)/30);assert.ok(interval.start<=clock(first));assert.ok(interval.end>clock(first));assert.ok(interval.end<=clock(first+1));if(first)assert.ok(interval.start>clock(first-1));
 }
 const between=assFrameInterval(1.505,1.56);assert.ok(between.start>1.5&&between.start<46/30);assert.ok(between.end<47/30&&between.end>46/30);assert.equal(assFrameInterval(1.501,1.502),null);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {keyframeAt,applyKeyframes,keyframeExpression,keyframeSamples,pointsOf,animated,validateMotion} from '../src/keyframes.mjs';
import * as m from '../src/project.mjs';
const layer=(extra={})=>({id:'i',start:2,end:6,x:50,y:50,width:40,rotation:0,opacity:80,...extra});

test('a motion preset animates from the current pose without storing keyframes',()=>{
 const t=layer({motion:{enter:'rise',exit:'fade'}});
 assert.equal(animated(t),true);assert.equal(t.keyframes,undefined);
 const start=keyframeAt(t,0),settled=keyframeAt(t,2),end=keyframeAt(t,4);
 assert.equal(start.opacity,0);assert.ok(start.y>50);
 assert.deepEqual(settled,{x:50,y:50,size:40,opacity:80});
 assert.equal(end.opacity,0);assert.equal(end.y,50);
 // Moving the component moves the whole animation: presets follow the base pose.
 assert.equal(keyframeAt({...t,x:20},2).x,20);
 assert.equal(applyKeyframes(t,2).opacity,0);assert.equal(applyKeyframes(t,4).opacity,80);
});

test('presets reach the MP4 path through the same expressions and samples',()=>{
 const t=layer({motion:{enter:'pop',exit:'none'}});
 assert.match(keyframeExpression(t,'size','T'),/clip/);
 assert.ok([...keyframeSamples(t)].length>10,'entrance is sampled per frame');
 assert.equal(pointsOf(layer()).length,0);assert.equal(animated(layer()),false);
});

test('manual keyframes win over a preset; invalid presets are rejected',()=>{
 const t=layer({motion:{enter:'fade'},keyframes:[{time:0,x:10,y:10,size:20,opacity:100},{time:4,x:90,y:90,size:20,opacity:100}]});
 assert.equal(keyframeAt(t,0).x,10);
 assert.throws(()=>validateMotion({...layer(),motion:{enter:'spin'}}));
 assert.doesNotThrow(()=>validateMotion(layer({motion:{enter:'zoom',exit:'left'}})));
});

test('setMotion stores the choice on image, video and shape layers and survives validation',()=>{
 const asset={id:'a',name:'a.png',kind:'image',duration:5,width:100,height:100,hasAudio:false};
 let p=m.addAsset(m.createProject(),asset);p=m.addImageLayer(p,{id:'img',assetId:'a',start:0,end:3,x:50,y:50,width:30,rotation:0,opacity:100});
 p=m.setMotion(p,'img',{enter:'fade'});assert.deepEqual(p.imageLayers[0].motion,{enter:'fade'});
 p=m.setMotion(p,'img',{exit:'zoom'});assert.deepEqual(p.imageLayers[0].motion,{enter:'fade',exit:'zoom'});
 p=m.setMotion(p,'img',{enter:'none',exit:'none'});assert.equal(p.imageLayers[0].motion,undefined);
 assert.throws(()=>m.setMotion(p,'img',{enter:'spin'}));
});

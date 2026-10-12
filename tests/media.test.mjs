import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSegmentArgs, parseProbe, sampleTimes, dimensions } from '../desktop/media.mjs';
import { createProject, addAsset, addClip } from '../src/project.mjs';
const a={id:'a',name:'Teste.mp4',duration:10,width:640,height:360,hasAudio:true};
let p=addClip(addAsset(createProject(),a),'a','c');
test('render is argument-only, trimmed, cropped, padded and audio synchronized',()=>{
 const c={...p.clips[0],in:2,out:5,volume:.5,crop:{x:0,y:0,w:1,h:.8}};
 const args=buildSegmentArgs(c,a,'/tmp/a; not-shell.mp4','/tmp/out.mp4','16:9',720);
 assert.equal(args[args.indexOf('-ss')+1],'2');assert.equal(args[args.indexOf('-t')+1],'3');
 assert.ok(args.includes('/tmp/a; not-shell.mp4')); assert.match(args[args.indexOf('-vf')+1],/crop=.*scale=.*pad=/);
 assert.match(args[args.indexOf('-af')+1],/volume=0.5/);assert.ok(args.includes('aac'));
});
test('silent footage gets silence track; invalid probe and render settings fail',()=>{
 assert.ok(buildSegmentArgs(p.clips[0],{...a,hasAudio:false},'a','b','9:16',720).includes('anullsrc=channel_layout=stereo:sample_rate=48000'));
 assert.throws(()=>parseProbe({streams:[],format:{duration:'10'}}));
 assert.throws(()=>parseProbe({streams:[{codec_type:'video',width:640,height:360}],format:{duration:'N/A'}}));
 assert.throws(()=>buildSegmentArgs(p.clips[0],a,'a','b','garbage',720));
 assert.throws(()=>buildSegmentArgs(p.clips[0],a,'a','b','16:9',99999));
});
test('sampling carries exact source timestamps and bounded frame count',()=>{
 assert.deepEqual(sampleTimes(5,2),[0,2,4]);
 assert.ok(sampleTimes(600,2,60).length<=60);assert.throws(()=>sampleTimes(0,2));
});

test('720p/1080p formats preserve conventional short-edge resolution for portrait and landscape',()=>{
 assert.deepEqual(dimensions('9:16',1080),{width:1080,height:1920});
 assert.deepEqual(dimensions('16:9',720),{width:1280,height:720});
 assert.deepEqual(dimensions('4:5',720),{width:720,height:900});
});

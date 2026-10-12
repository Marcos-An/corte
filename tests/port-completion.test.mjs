import test from 'node:test';import assert from 'node:assert/strict';
import {createProject,addAsset,addClip} from '../src/project.mjs';
import {scopeProject,validateScopedPlan,dragCrop} from '../src/editor-experience.mjs';
import {validateRecording,microphoneAllowed} from '../desktop/recording.mjs';
const fixture=()=>addClip(addClip(addAsset(createProject(),{id:'a',name:'v',duration:10,width:640,height:360,hasAudio:true}),'a','a1'),'a','a2');
test('AI selected scope contains one clip; rejects other clips, global changes and reorder',()=>{
 const p=fixture(),q=scopeProject(p,'a2');assert.deepEqual(q.clips.map(c=>c.id),['a2']);assert.equal(p.clips.length,2);
 const plan={summary:'volume',questions:[],unsupported:[],operations:[{type:'update',clipId:'a2',volume:0}]};
 assert.equal(validateScopedPlan(p,plan,'a2'),plan);
 for(const op of [{type:'update',clipId:'a1',volume:0},{type:'set_aspect',aspect:'1:1'},{type:'move',clipId:'a2',index:0}])assert.throws(()=>validateScopedPlan(p,{...plan,operations:[op]},'a2'));
 assert.throws(()=>scopeProject(p,'missing'));
});
test('crop drag pans source crop without extending source bounds',()=>{
 const crop=dragCrop({x:.2,y:.2,w:.5,h:.5},100,-100,500,500);assert.equal(crop.x,.1);assert.ok(Math.abs(crop.y-.3)<1e-12);
 assert.deepEqual(dragCrop({x:0,y:0,w:1,h:1},200,200,500,500),{x:0,y:0,w:1,h:1});
});
test('recordings have bounded typed bytes and strict audio-only permission',()=>{
 assert.equal(validateRecording(new Uint8Array([1,2]),'audio/webm;codecs=opus').extension,'webm');
 assert.throws(()=>validateRecording(new Uint8Array(),'audio/webm'));
 assert.throws(()=>validateRecording(new Uint8Array([1]),'video/webm'));
 assert.throws(()=>validateRecording('base64','audio/webm'));
 assert.equal(microphoneAllowed('media',{mediaTypes:['audio'],isMainFrame:true},true),true);
 assert.equal(microphoneAllowed('media',{mediaTypes:['video'],isMainFrame:true},true),false);
 assert.equal(microphoneAllowed('media',{mediaTypes:['audio'],isMainFrame:true},false),false);
});

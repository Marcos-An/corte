import test from 'node:test';import assert from 'node:assert/strict';
import {requestPromptPlan} from '../desktop/intent.mjs';import {createProject,addAsset,addClip} from '../src/project.mjs';
const project=addClip(addAsset(createProject(),{id:'a',name:'a',duration:1,width:96,height:170,hasAudio:true}),'a','c');
test('semantic intent selects local quality independently of prompt words',async()=>{
 let calls=0;const r=await requestPromptPlan({project,prompt:'Quero a imagem utilizável',interpret:async()=>({route:'local_quality',plan:null}),local:async()=>{calls++;return {plan:{summary:'local',operations:[],questions:[],unsupported:[]}}}});assert.equal(calls,1);assert.equal(r.frames,0);
});
test('other visual criteria never silently use sharpness or upload frames',async()=>{
 const r=await requestPromptPlan({project,prompt:'Remova pés',interpret:async()=>({route:'unsupported_visual',plan:null}),local:()=>assert.fail()});assert.equal(r.plan.operations.length,0);assert.ok(r.plan.unsupported.length);
});
test('invalid intent rejected before processing',async()=>{await assert.rejects(requestPromptPlan({project,prompt:'teste',interpret:async()=>({route:'anything',plan:null}),local:()=>assert.fail()}),/inválida/);});

import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {transcribeLocally} from '../desktop/transcribe.mjs';import {scanLocally} from '../desktop/local.mjs';import {createProject,addAsset,addClip} from '../src/project.mjs';
test('real workers report initialization errors and terminal outcomes without claiming success',{timeout:30000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-worker-log-')),saved=process.env.CORTE_MODEL_PATH;process.env.CORTE_MODEL_PATH=dir;
 const project=addClip(addAsset(createProject(),{id:'a',name:'PRIVATE_VIDEO',duration:1,width:160,height:160,hasAudio:true}),'a','c');
 try{for(const worker of [transcribeLocally,scanLocally]){
  const events=[];let resolveExit;const exited=new Promise(resolve=>resolveExit=resolve);
  await assert.rejects(worker({project,registry:new Map([['a',{path:'/PRIVATE_SOURCE'}]]),directory:dir,purpose:'edit',onProgress:e=>{if(e.stage==='worker-diagnostic'){events.push(e);if(e.event==='worker-exit')resolveExit();}}}));await exited;
  assert.ok(events.some(e=>e.event==='worker-start'));assert.ok(events.some(e=>e.event==='worker-error'));assert.equal(events.find(e=>e.event==='worker-exit').outcome,'error');assert.ok(events.every(e=>!JSON.stringify(e).includes('PRIVATE')));
 }}finally{if(saved===undefined)delete process.env.CORTE_MODEL_PATH;else process.env.CORTE_MODEL_PATH=saved;await rm(dir,{recursive:true,force:true});}
});

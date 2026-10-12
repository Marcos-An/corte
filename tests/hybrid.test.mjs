import test from 'node:test';import assert from 'node:assert/strict';
import {refineVisualPlan} from '../desktop/hybrid.mjs';
import {createProject,addAsset,addClip} from '../src/project.mjs';
const p=addClip(addAsset(createProject(),{id:'a',name:'a.mp4',duration:100,width:640,height:360,hasAudio:true}),'a','c');
const base={summary:'Ajuste',questions:[],unsupported:[],operations:[{type:'remove_ranges',clipId:'c',ranges:[[35,37]]}]};
test('temporal plan gets a second evidence round before returning, not partial application',async()=>{
 const calls=[];const out=await refineVisualPlan({project:p,prompt:'Edite',frames:[{assetId:'a',time:80}],request:async(frames,context)=>{calls.push({frames,context});return {plan:structuredClone(base),usage:{input_tokens:10,output_tokens:2}};}});
 assert.equal(calls.length,2);assert.ok(calls[1].frames.some(f=>f.time===35.25));assert.equal(out.rounds,2);assert.equal(out.usage.input_tokens,20);assert.deepEqual(p.clips.map(c=>[c.in,c.out]),[[0,100]]);
});
test('direct adjustment skips extra images; questions, invalid plans and cancellation do not apply',async()=>{
 const direct={...base,operations:[{type:'update',clipId:'c',volume:.5}]};let count=0;
 const r=await refineVisualPlan({project:p,prompt:'Volume',frames:[],request:async()=>{count++;return {plan:direct};}});assert.equal(count,1);assert.equal(r.rounds,1);
 const q=await refineVisualPlan({project:p,prompt:'Ambíguo',frames:[],request:async()=>({plan:{...base,operations:[],questions:['Qual?']}})});assert.deepEqual(q.plan.operations,[]);
 await assert.rejects(()=>refineVisualPlan({project:p,prompt:'Inválido',frames:[],request:async()=>({plan:{...base,operations:[{type:'delete',clipId:'missing'}]}})}));
 const abort=new AbortController();abort.abort();await assert.rejects(()=>refineVisualPlan({project:p,prompt:'Cancelar',frames:[],signal:abort.signal,request:async()=>{throw new Error('não chamar');}}),/cancelada/);
});

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

test('hybrid editing transcribes locally, shares only included speech and requires review with independent pending items',async()=>{
 const {requestHybridEdit}=await import('../desktop/hybrid.mjs');const project=structuredClone(p);project.clips[0].in=30;project.clips[0].out=40;let calls=0;
 const result=await requestHybridEdit({project,prompt:'Reels, corte a fala ruim e importe Melona',shareEvidence:true,registry:new Map([['a',{path:'/private/source.mp4'}]]),connected:async()=>true,
 transcribe:async()=>[{assetId:'a',words:[{start:1,end:2,text:'fora'},{start:35,end:36,text:'radioativa'},{start:39.5,end:40.5,text:'fora também'}]}],
 planRequest:async options=>{calls++;assert.equal(options.review,true);assert.deepEqual(options.transcripts,[{assetId:'a',words:[{start:35,end:36,text:'radioativa'}]}]);return {plan:structuredClone(base),pendingRequests:['Importe a foto Melona.'],frames:3};}});
 assert.equal(calls,1);assert.equal(result.reviewRequired,true);assert.equal(result.mode,'hybrid');assert.deepEqual(result.pendingRequests,['Importe a foto Melona.']);assert.equal(result.shared.transcriptWords,1);
});
test('missing consent/login and cancellation never process media or contact the planner',async()=>{
 const {requestHybridEdit}=await import('../desktop/hybrid.mjs');const options={project:p,prompt:'Editar',registry:new Map(),transcribe:()=>assert.fail(),planRequest:()=>assert.fail()};
 await assert.rejects(requestHybridEdit({...options,shareEvidence:false,connected:()=>assert.fail()}),/autoriz/i);
 await assert.rejects(requestHybridEdit({...options,shareEvidence:true,connected:async()=>false}),/conect/i);
 const signal=AbortSignal.abort();await assert.rejects(requestHybridEdit({...options,shareEvidence:true,signal,connected:()=>assert.fail()}),/cancelad/i);
});
test('hybrid frame scope rejects all source samples outside included ranges, including refinement',async()=>{
 const {includedEvidence}=await import('../desktop/hybrid.mjs');const project=structuredClone(p);project.clips[0].in=30;project.clips[0].out=40;
 assert.deepEqual(includedEvidence(project,[{assetId:'a',time:29.75},{assetId:'a',time:30},{assetId:'a',time:39.75},{assetId:'a',time:40},{assetId:'other',time:35}]).map(f=>f.time),[30,39.75]);
});

test('overview has a global image budget and never silently drops independent source regions',async()=>{
 const {selectOverview}=await import('../desktop/hybrid.mjs');const candidates=Array.from({length:100},(_,i)=>({assetId:'a',time:i}));const result=selectOverview(p,candidates,60);assert.ok(result.length<=60);
 const fragmented=structuredClone(p);fragmented.clips=Array.from({length:100},(_,i)=>({...p.clips[0],id:'c'+i,in:i*.9,out:i*.9+.4}));
 assert.throws(()=>selectOverview(fragmented,[],60),/regiões|cobertura|trecho menor/i);
});

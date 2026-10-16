import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../src/project.mjs';
import {planSchema} from '../desktop/ai.mjs';
import {requestPromptPlan} from '../desktop/intent.mjs';
import {scopeProject,validateScopedPlan} from '../src/editor-experience.mjs';
const fixture=()=>{let p=m.addAsset(m.createProject(),{id:'v',name:'Video',duration:10,width:320,height:320,hasAudio:true});p=m.addClip(m.addClip(p,'v','c1'),'v','c2');p=m.editProject(p,{type:'trim',clipId:'c1',in:1,out:5});p=m.editProject(p,{type:'trim',clipId:'c2',in:1,out:5});p=m.addAsset(p,{id:'png',name:'Logo',kind:'image',duration:5,width:80,height:40,hasAudio:false});return m.addMusic(p,{id:'audio',name:'Voz',kind:'audio',duration:10,width:0,height:0,hasAudio:true},{id:'voice',in:0,out:8,role:'narration'});};
const plan=operations=>({summary:'Edição combinada',operations,questions:[],unsupported:[]});
const style={font:'Arial',size:6,color:'#ffffff',position:'center',preset:'clean',enter:'rise',exit:'fade'};
const pose={id:'logo',assetId:'png',start:0,end:2,x:50,y:50,width:20,rotation:0,opacity:100};
const operations=[{type:'update',clipId:'c1',speed:2,background:'blur',adjustments:{brightness:.1,contrast:1.2,saturation:.8},fadeIn:.5,fadeOut:.5},
 {type:'set_transition',leftId:'c1',rightId:'c2',effect:'dissolve',duration:.4},
 {type:'edit_audio',audioId:'voice',patch:{volume:.5,fadeIn:.3,fadeOut:.4}},
 {type:'add_text',layer:{id:'title',text:'Olá',start:0,end:2,style}},
 {type:'add_image',layer:pose},
 {type:'add_video',layer:{...pose,id:'overlay',assetId:'v',in:0}},
 {type:'add_shape',layer:{...pose,id:'shape',assetId:undefined,type:'arrow',height:10,fill:null,stroke:'#ff0000',strokeWidth:1}},
 {type:'edit_component',layerId:'title',patch:{text:'Novo título',style:{color:'#00ff00'}}},
 {type:'set_keyframe',layerId:'title',time:0,pose:{x:20,y:30,size:4,opacity:20}},
 {type:'set_keyframe',layerId:'title',time:2,pose:{x:80,y:70,size:8,opacity:100}},
 {type:'move_component',layerId:'logo',direction:'front'}];delete operations[6].layer.assetId;
test('complex plan reuses editor operations atomically, preserves sources and supports one undo',()=>{
 const p=fixture(),before=structuredClone(p),q=m.applyPlan(p,plan(operations));assert.deepEqual(p,before);assert.equal(m.duration(q),6);assert.equal(q.clips[0].speed,2);assert.equal(q.clips[1].speed,undefined);assert.equal(q.transitions[0].duration,.4);assert.equal(q.music[0].volume,.5);assert.equal(q.textLayers[0].text,'Novo título');assert.equal(q.textLayers[0].style.enter,'rise');assert.equal(q.textLayers[0].style.color,'#00ff00');assert.equal(q.textLayers[0].keyframes.length,2);assert.equal(q.layerOrder.at(-1),'logo');
 const h=new m.History(p);h.commit(q);assert.equal(h.entries.length,2);assert.deepEqual(h.undo(),p);assert.deepEqual(h.redo(),q);
 const cleaned=m.applyPlan(q,plan([{type:'remove_keyframe',layerId:'title',time:0},{type:'remove_component',layerId:'overlay'}]));assert.equal(cleaned.videoLayers.length,0);assert.equal(cleaned.textLayers[0].keyframes.length,1);
});
test('untrusted plans reject invalid IDs, media, timing, hidden fields and no source handles without mutation',()=>{
 const p=fixture(),before=structuredClone(p);for(const bad of [
 {type:'update',clipId:'c1',speed:8},{type:'update',clipId:'missing',speed:2},
 {type:'add_image',layer:{...pose,assetId:'missing'}},{type:'add_image',layer:{...pose,path:'/private/logo.png'}},
 {type:'add_text',layer:{id:'t',text:'x',start:0,end:1,style:{...style,evil:true}}},
 {type:'add_shape',layer:{...operations[6].layer,opacity:101}},
 {type:'edit_audio',audioId:'voice',patch:{speed:2}},
 {type:'set_keyframe',layerId:'unknown',time:0,pose:{x:50}},
 {type:'set_keyframe',layerId:'title',time:3,pose:{x:50}},
 {type:'edit_component',layerId:'title',patch:{opacity:20}},
 ]){assert.throws(()=>m.applyPlan(p,plan([...operations,bad])),JSON.stringify(bad));assert.deepEqual(p,before);}
 let noHandles=m.editProject(p,{type:'trim',clipId:'c1',in:0,out:10});noHandles=m.editProject(noHandles,{type:'trim',clipId:'c2',in:0,out:10});assert.throws(()=>m.applyPlan(noHandles,plan([{type:'set_transition',leftId:'c1',rightId:'c2',effect:'dissolve',duration:.4}])),/margem/);
});
test('new capabilities are available to the active intent route, mixed unsupported never applies partly',async()=>{
 const p=fixture();const r=await requestPromptPlan({project:p,prompt:'Combine ajustes e texto animado',interpret:async()=>({route:'edit_plan',plan:plan(operations)}),local:()=>assert.fail()});assert.equal(r.frames,0);assert.equal(m.applyPlan(p,r.plan).textLayers[0].keyframes.length,2);
 await assert.rejects(requestPromptPlan({project:p,prompt:'Adicione título e reconheça pessoas',interpret:async()=>({route:'edit_plan',plan:{...plan(operations),unsupported:['Reconhecimento indisponível']}})}),/parcial/);
});
test('provider schema exposes every new action and single-clip scope rejects cross-project actions',()=>{
 const types=planSchema.properties.operations.items.anyOf.map(op=>op.properties.type.const);for(const op of operations)assert.ok(types.includes(op.type),op.type);
 const p=fixture(),q=m.applyPlan(p,plan(operations));m.validateProject(scopeProject(q,'c1'));
 assert.equal(validateScopedPlan(p,plan([operations[0]]),'c1').operations.length,1);
 for(const op of operations.slice(1))assert.throws(()=>validateScopedPlan(p,plan([op]),'c1'),/fora/);
});
test('component presets and color background can be combined without replacing keyframes or legacy defaults',()=>{
 const p=fixture(),q=m.applyPlan(p,plan([...operations,{type:'set_motion',layerId:'logo',enter:'fade',exit:'pop'},{type:'update',clipId:'c2',background:'color',backgroundColor:'#223344'}]));assert.deepEqual(q.imageLayers[0].motion,{enter:'fade',exit:'pop'});assert.equal(q.clips[1].backgroundColor,'#223344');assert.equal(q.textLayers[0].keyframes.length,2);
 assert.ok(planSchema.properties.operations.items.anyOf.some(s=>s.properties.type.const==='set_motion'));
 const clear=m.applyPlan(q,plan([{type:'set_motion',layerId:'logo',enter:'none',exit:'none'}]));assert.equal(clear.imageLayers[0].motion,undefined);
});
test('missing required fields, unknown nested fields and excessive transition duration are rejected',()=>{
 const p=fixture();for(const op of [{type:'set_transition',leftId:'c1',rightId:'c2',effect:'none'},{type:'update',clipId:'c1',crop:{x:0,y:0,w:1,h:1,secret:'bad'}},{type:'set_transition',leftId:'c1',rightId:'c2',effect:'dissolve',duration:3}])assert.throws(()=>m.applyPlan(p,plan([op])));
});
test('AI uses the editor animation names instead of guessing Portuguese preset translations',async()=>{
 const {buildPrompt}=await import('../desktop/ai.mjs');const input=buildPrompt(fixture(),'Entrada Surgir, saída Encolher',[]);assert.ok(input.includes('Surgir → fade'));assert.ok(input.includes('Encolher → pop'));
});
test('transitions resolve final adjacent clips after cuts generate IDs; invalid positions fail atomically',()=>{
 const p=fixture(),before=structuredClone(p),cuts={type:'keep_ranges',clipId:'c1',ranges:[[1,2],[3,5]]};
 const q=m.applyPlan(p,plan([cuts,{type:'set_transition_at',index:0,effect:'dissolve',duration:.2}]));
 assert.equal(q.clips.length,3);assert.equal(q.transitions[0].leftId,q.clips[0].id);assert.equal(q.transitions[0].rightId,q.clips[1].id);assert.equal(q.transitions[0].duration,.2);
 for(const index of [-1,.5,2,99])assert.throws(()=>m.applyPlan(p,plan([cuts,{type:'set_transition_at',index,effect:'dissolve',duration:.2}])));
 assert.deepEqual(p,before);assert.throws(()=>validateScopedPlan(p,plan([{type:'set_transition_at',index:0,effect:'fade',duration:.2}]),'c1'),/fora/);
 assert.ok(planSchema.properties.operations.items.anyOf.some(s=>s.properties.type.const==='set_transition_at'));
});
test('planner is warned that transition handles must not reintroduce speech or events explicitly removed',async()=>{
 const {buildPrompt}=await import('../desktop/ai.mjs');assert.match(buildPrompt(fixture(),'Corte a queimadura e use cortes limpos',[],{review:true}),/margens fora de in\/out/);assert.match(buildPrompt(fixture(),'Editar',[],{review:true}),/reintroduzir/);
});

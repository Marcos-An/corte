import test from 'node:test';import assert from 'node:assert/strict';
import * as m from '../src/project.mjs';import {captionEntries} from '../src/captions.mjs';import {buildPrompt,planSchema,parseReviewPayload} from '../desktop/ai.mjs';import {prepareCaptionProposal} from '../desktop/caption-proposal.mjs';import {validateScopedPlan} from '../src/editor-experience.mjs';
const plan=operations=>({summary:'Cortes e legendas',operations,questions:[],unsupported:[]}),request=(source='original',style=null)=>({type:'generate_captions',source,style});
function fixture(){let p=m.addClip(m.addAsset(m.createProject(),{id:'v',name:'Vídeo',duration:10,width:640,height:360,hasAudio:true}),'v','c');return m.addMusic(p,{id:'a',name:'Voz',kind:'audio',duration:5,width:0,height:0,hasAudio:true},{id:'voice',role:'narration',start:2,in:1,out:5,volume:.6});}
const transcript=(assetId='v')=>({assetId,provider:'local',model:'test',words:[{start:2,end:4,text:'Prato bonito',tokens:[{start:2,end:3,text:'Prato'},{start:3,end:4,text:'bonito'}]}]});
test('unprepared requests can be structurally checked but never applied, and provider cannot invent prepared speech',()=>{
 const p=fixture(),draft=plan([request()]);assert.doesNotThrow(()=>m.simulatePlan(p,draft));assert.throws(()=>m.applyPlan(p,draft),/Prepare as legendas/);
 assert.throws(()=>m.parsePlan(JSON.stringify(plan([{...request(),transcripts:[transcript()]}]))),/planejador/);assert.throws(()=>m.parsePlan(JSON.stringify({plan:plan([{...request(),transcripts:[transcript()]}])})),/planejador/);
 assert.throws(()=>m.simulatePlan(p,plan([request(),request('narration')])));assert.throws(()=>validateScopedPlan(p,draft,'c'));
 assert.throws(()=>m.simulatePlan(p,plan([request('invented')])));assert.throws(()=>m.simulatePlan(p,plan([request('original',{alien:1})])));
 assert.ok(planSchema.properties.operations.items.anyOf.some(s=>s.properties.type.const==='generate_captions'));assert.ok(!JSON.stringify(planSchema.properties.operations.items.anyOf.find(s=>s.properties.type.const==='generate_captions')).includes('transcripts'));
});
test('cuts, speed, local recognition and captions share a single reversible plan without modifying the proposal snapshot',async()=>{
 const p=fixture(),before=structuredClone(p);p.clips[0].captionWords=[{start:0,end:1,text:'Antiga'}];before.clips[0].captionWords=structuredClone(p.clips[0].captionWords);
 const draft=plan([{type:'trim',clipId:'c',in:1,out:9},{type:'update',clipId:'c',speed:2},request('original',{preset:'karaoke',color:'#ffffff',position:'bottom'})]);let called=false;
 const result=await prepareCaptionProposal({project:p},{plan:draft,analysisRoute:'metadata',shared:{frames:0,transcriptWords:0}},{generate:async({project})=>{called=true;assert.equal(m.duration(project),4);assert.equal(project.clips[0].in,1);return [transcript()];}});
 assert.ok(called);assert.deepEqual(p,before);assert.equal(result.mode,'hybrid');assert.ok(result.reviewRequired);assert.equal(result.shared.transcriptWords,0);assert.equal(result.localCaptions.preview[0].start,.5);assert.equal(result.localCaptions.preview[0].end,1.5);
 const h=new m.History(p),q=m.applyPlan(p,result.plan);h.commit(q);assert.equal(q.captionStyle.preset,'karaoke');assert.equal(captionEntries(q)[0].text,'Prato bonito');assert.equal(q.clips[0].captionWords,undefined);assert.deepEqual(h.undo(),p);assert.deepEqual(h.redo(),q);
 const prompt=buildPrompt(q,'Aumente o brilho',[]);assert.ok(!prompt.includes('Prato bonito'));q.clips[0].captionWords=[{start:2,end:3,text:'PRIVATE_MANUAL_CAPTION'}];assert.ok(!buildPrompt(q,'Aumente o brilho',[]).includes('PRIVATE_MANUAL_CAPTION'));
});
test('narration captions preserve original per-clip edits, other transcripts and volume; position overrides stale Y',async()=>{
 const p=fixture();p.clips[0].captionWords=[{start:0,end:1,text:'Original'}];p.transcripts=[transcript()];p.captionStyle.positionY=80;
 const r=await prepareCaptionProposal({project:p},{plan:plan([request('narration',{position:'top'})])},{generate:async options=>{assert.equal(options.project.captionSource,'narration');return [transcript(),transcript('a')];}});
 const q=m.applyPlan(p,r.plan);assert.deepEqual(q.clips,p.clips);assert.equal(q.captionStyle.position,'top');assert.equal(q.captionStyle.positionY,undefined);assert.equal(q.transcripts.length,2);assert.equal(q.music[0].volume,.6);assert.equal(captionEntries(q)[0].start,3);
});
test('failed recognition leaves independent edits and accurate pending coverage, without leaking raw errors',async()=>{
 const p=fixture(),result={plan:plan([{type:'update',clipId:'c',volume:.4},request()]),coverage:[{request:'Volume',kind:'audio',status:'planned',operationIndexes:[0],reason:'Tempo informado'},{request:'Legendas',kind:'captions',status:'planned',operationIndexes:[1],reason:'Gerar localmente'}]};
 const r=await prepareCaptionProposal({project:p},result,{generate:async()=>{throw Error('PRIVATE_PATH /secret.wav');}});assert.equal(r.plan.operations.length,1);assert.equal(r.coverage[1].status,'pending');assert.deepEqual(r.coverage[1].operationIndexes,[]);assert.equal(m.applyPlan(p,r.plan).clips[0].volume,.4);assert.ok(!JSON.stringify(r).includes('PRIVATE_PATH'));assert.equal(r.localCaptions.prepared,false);
});
test('cancellation never produces an applicable partial result; malformed/native transcript injection is refused',async()=>{
 const p=fixture(),controller=new AbortController();await assert.rejects(()=>prepareCaptionProposal({project:p,signal:controller.signal},{plan:plan([request()])},{generate:async()=>{controller.abort();return [transcript()];}}));
 await assert.rejects(()=>prepareCaptionProposal({project:p},{plan:plan([{...request(),transcripts:[transcript()]}])}));
 for(const transcripts of [[],[transcript('unknown')],[{...transcript(),provider:'openai'}]])assert.throws(()=>m.applyPlan(p,plan([{...request(),transcripts}])));
});
test('caption coverage belongs to final stage and cannot be mislabeled as text or supplied with invented transcript',()=>{
 const p=fixture(),payload={plan:plan([request()]),pendingRequests:[],coverage:[{request:'Legendar',kind:'captions',status:'planned',operationIndexes:[0],reason:'Reconhecimento local'}]};assert.doesNotThrow(()=>parseReviewPayload(p,JSON.stringify(payload),{stage:3}));assert.throws(()=>parseReviewPayload(p,JSON.stringify(payload),{stage:1}));payload.coverage[0].kind='text';assert.throws(()=>parseReviewPayload(p,JSON.stringify(payload)));payload.coverage[0].kind='captions';payload.plan.operations[0].transcripts=[transcript()];assert.throws(()=>parseReviewPayload(p,JSON.stringify(payload)),/planejador/);
});
test('silent held frames do not create zero-duration captions or start a recognition request on their own',()=>{
 let p=fixture();p=m.editProject(p,{type:'freeze',clipId:'c',time:3,duration:1});p.transcripts=[transcript()];assert.ok(captionEntries(p).every(c=>c.end>c.start));const frozen=p.clips.find(c=>c.freeze);p.clips=[frozen];assert.throws(()=>m.applyPlan(p,plan([{...request(),transcripts:[]}])),/não tem áudio/);
});
test('reliable speech evidence is reused locally without a second inference or returning hidden source evidence',async()=>{
 const p=fixture(),r=await prepareCaptionProposal({project:p},{plan:plan([{type:'trim',clipId:'c',in:3,out:9},request()]),localCaptionEvidence:[{assetId:'v',recognizer:'local-model',words:transcript().words[0].tokens,gaps:[]}]},{generate:async()=>{throw Error('Should reuse reliable speech');}});
 assert.ok(r.localCaptions.prepared);assert.equal(r.localCaptionEvidence,undefined);assert.equal(captionEntries(m.applyPlan(p,r.plan))[0].text,'bonito');assert.equal(captionEntries(m.applyPlan(p,r.plan))[0].tokens.length,1);
 let retried=false;await prepareCaptionProposal({project:p},{plan:plan([request()]),localCaptionEvidence:[{assetId:'v',recognizer:'local-model',words:[],gaps:[{start:1,end:2}]}]},{generate:async()=>{retried=true;return [transcript()];}});assert.ok(retried);
});
test('a missing narration produces a visible pending item while preserving independent changes and the current voice',async()=>{
 const p=fixture();p.music=[];const r=await prepareCaptionProposal({project:p},{plan:plan([{type:'update',clipId:'c',volume:.3},request('narration')])});assert.equal(r.plan.operations.length,1);assert.equal(r.coverage[0].status,'pending');assert.equal(r.coverage[0].kind,'captions');const q=m.applyPlan(p,r.plan);assert.equal(q.clips[0].volume,.3);assert.equal(q.captionSource,p.captionSource);assert.ok(r.pendingRequests[0].startsWith('Gerar legendas locais:'));
});
test('appearance-only caption edits preserve manual corrections, measured times, voice and audio without recognition',async()=>{
 const p=fixture();p.clips[0].captionWords=transcript().words;p.transcripts=[transcript()];const draft=plan([{type:'edit_caption_style',style:{preset:'boxed',color:'#ffff00',position:'top'}}]);const r=await prepareCaptionProposal({project:p},{plan:draft},{generate:async()=>{throw Error('Must not recognize speech for style changes');}});const q=m.applyPlan(p,r.plan);assert.deepEqual(q.clips,p.clips);assert.deepEqual(q.transcripts,p.transcripts);assert.deepEqual(q.music,p.music);assert.equal(q.captionSource,p.captionSource);assert.equal(q.captionStyle.preset,'boxed');assert.equal(q.captionStyle.position,'top');assert.equal(r.localCaptions,undefined);assert.ok(buildPrompt(p,'Mude a cor',[]).includes('"count":1'));assert.throws(()=>m.applyPlan(p,plan([{type:'edit_caption_style',style:null}])));
});

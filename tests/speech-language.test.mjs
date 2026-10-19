import test from 'node:test';import assert from 'node:assert/strict';
import {SPEECH_LANGUAGES,speechLanguage,speechOptions} from '../src/speech-language.mjs';
import * as m from '../src/project.mjs';import {prepareCaptionProposal} from '../desktop/caption-proposal.mjs';
import {generateLocalCaptions} from '../desktop/local-captions.mjs';
const fixture=()=>m.addClip(m.addAsset(m.createProject(),{id:'v',name:'Vídeo',duration:5,width:320,height:240,hasAudio:true}),'v','c');
const plan=operations=>({summary:'Legendas',operations,questions:[],unsupported:[]});
const request=language=>({type:'generate_captions',source:'original',style:null,language});
const transcript=(language='en')=>({assetId:'v',language,provider:'local',model:'test',words:[{text:'Hello',start:0,end:1}]});
test('old projects keep Portuguese; explicit languages always transcribe, while detection omits the language hint',()=>{
 assert.equal(speechLanguage(m.createProject()),'pt');
 for(const l of SPEECH_LANGUAGES){assert.doesNotThrow(()=>m.validateProject({...fixture(),speechLanguage:l.id}));assert.equal(speechOptions(l.id).task,'transcribe');assert.equal(speechOptions(l.id).return_timestamps,'word');}
 assert.equal(speechOptions('pt').language,'portuguese');assert.equal(speechOptions('en').language,'english');assert.ok(!('language'in speechOptions('auto')));
 for(const invalid of [null,'xx','english',1,{},[]]){assert.throws(()=>m.validateProject({...fixture(),speechLanguage:invalid}));assert.throws(()=>speechOptions(invalid));}
});
test('language by prompt is prepared before review and only changes the project on atomic application',async()=>{
 const p=fixture(),original=structuredClone(p),draft=plan([request('en')]);let received;
 const result=await prepareCaptionProposal({project:p},{plan:draft},{generate:async({project})=>{received=speechLanguage(project);return [transcript()];}});
 assert.equal(received,'en');assert.deepEqual(p,original);assert.ok(result.reviewRequired);const q=m.applyPlan(p,result.plan);assert.equal(q.speechLanguage,'en');assert.equal(q.transcripts[0].language,'en');assert.equal(q.clips[0].volume,1);
 const history=new m.History(p);history.commit(q);assert.equal(speechLanguage(history.undo()),'pt');assert.equal(speechLanguage(history.redo()),'en');assert.equal(speechLanguage(m.validateProject(JSON.parse(JSON.stringify(q)))),'en');
 assert.throws(()=>m.simulatePlan(p,plan([request('xx')])));
});
test('mismatched evidence is recognized again, matching evidence can be reused and older Portuguese evidence remains compatible',async()=>{
 const p=fixture(),evidence=[{assetId:'v',language:'pt',recognizer:'test',gaps:[],words:[{text:'Olá',start:0,end:1}]}];let calls=0;
 const changed=await prepareCaptionProposal({project:p},{plan:plan([request('en')]),localCaptionEvidence:evidence},{generate:async()=>{calls++;return [transcript()];}});assert.equal(calls,1);assert.equal(m.applyPlan(p,changed.plan).transcripts[0].words[0].text,'Hello');
 const matched=await prepareCaptionProposal({project:p},{plan:plan([request('en')]),localCaptionEvidence:[{...evidence[0],language:'en'}]},{generate:async()=>{throw Error('Must reuse');}});assert.ok(matched.localCaptions.prepared);assert.equal(m.applyPlan(p,matched.plan).transcripts[0].language,'en');
 const old=await prepareCaptionProposal({project:p},{plan:plan([request(null)]),localCaptionEvidence:evidence.map(({language,...t})=>t)},{generate:async()=>{throw Error('Must reuse old PT');}});assert.ok(old.localCaptions.prepared);
 const failed=await prepareCaptionProposal({project:p},{plan:plan([request('en')])},{generate:async()=>[transcript('pt')]});assert.equal(failed.localCaptions.prepared,false);assert.equal(failed.plan.operations.length,0);assert.equal(speechLanguage(m.applyPlan(p,failed.plan)),'pt');
});
test('direct caption generation refuses a transcript from another recognition language',async()=>{
 const p={...fixture(),speechLanguage:'en'};await assert.rejects(()=>generateLocalCaptions({project:p},{transcribe:async()=>[transcript('pt')]}),/idioma/);assert.deepEqual(await generateLocalCaptions({project:p},{transcribe:async()=>[transcript()]}),[transcript()]);
});

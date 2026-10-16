import test from 'node:test';import assert from 'node:assert/strict';
import {parseReviewPayload,buildPrompt,EDIT_STAGES} from '../desktop/ai.mjs';
import {createProject,addAsset,addClip} from '../src/project.mjs';
const p=addClip(addAsset(createProject(),{id:'a',name:'Video',duration:10,width:320,height:240,hasAudio:true}),'a','c');
const style={font:'Arial',size:5,color:'#ffffff',position:'top',preset:'outline',enter:'fade',exit:'fade'};
const payload=(op,kind)=>JSON.stringify({plan:{summary:'s',questions:[],unsupported:[],operations:[op]},pendingRequests:[],coverage:[{request:'r',kind,status:'planned',operationIndexes:[0],reason:'m'},{request:'depois',kind:'text',status:'not_needed',operationIndexes:[],reason:'Fica para a etapa 3 (Textos e acabamento).'}]});
const cut={type:'remove_ranges',clipId:'c',ranges:[[1,2]]},text={type:'add_text',layer:{id:'t',text:'Kokoro',start:0,end:1,style}},grade={type:'update',clipId:'c',adjustments:{brightness:.03,contrast:1.04,saturation:1,temperature:.05,sharpness:.2}},zoom={type:'update',clipId:'c',zoom:{from:1,to:1.1}};
test('three named stages split a long request into cuts, images and finishing',()=>{
 assert.deepEqual(EDIT_STAGES.map(s=>s.name),['Cortes e ordem','Imagens e sobreposições','Textos e acabamento']);
 const input=buildPrompt(p,'Pedido longo',[],{review:true,stage:2});assert.match(input,/Etapa 2 de 3 \(Imagens e sobreposições\)/);assert.match(input,/Fica para a etapa/);
 assert.doesNotMatch(buildPrompt(p,'x',[],{review:true}),/Etapa \d de 3/);
});
test('each stage accepts only its own operations, so the provider gets a corrective round otherwise',()=>{
 assert.doesNotThrow(()=>parseReviewPayload(p,payload(cut,'cut'),{stage:1}));
 assert.throws(()=>parseReviewPayload(p,payload(text,'text'),{stage:1}),/etapa 1/i);
 assert.doesNotThrow(()=>parseReviewPayload(p,payload(zoom,'framing'),{stage:2}));
 assert.throws(()=>parseReviewPayload(p,payload(cut,'cut'),{stage:3}),/etapa 3/i);
 assert.doesNotThrow(()=>parseReviewPayload(p,payload(text,'text'),{stage:3}));assert.doesNotThrow(()=>parseReviewPayload(p,payload(grade,'color'),{stage:3}));
 assert.doesNotThrow(()=>parseReviewPayload(p,payload(text,'text')),'without stages everything is allowed');
 assert.throws(()=>parseReviewPayload(p,payload(cut,'cut'),{stage:4}),/etapa/i);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {parseReviewPayload,reviewPlanSchema,buildPrompt,reviewWithRetry,planSchema} from '../desktop/ai.mjs';
import {createProject,addAsset,addClip} from '../src/project.mjs';
const p=addClip(addAsset(createProject(),{id:'a',name:'Video',duration:10,width:320,height:240,hasAudio:false}),'a','c');
const plan={summary:'Ajuste parcial',operations:[{type:'trim',clipId:'c',in:1,out:9}],questions:[],unsupported:[]};
const item=(kind,status,operationIndexes,reason='Evidência disponível')=>({request:'Pedido de '+kind,kind,status,operationIndexes,reason});
const parse=coverage=>parseReviewPayload(p,JSON.stringify({plan,pendingRequests:[],coverage}));
test('review contract checks every requested editing category and exposes honest partial completion',()=>{
 assert.ok(reviewPlanSchema.required.includes('coverage'));
 const out=parse([item('cut','planned',[0]),item('image','pending',[],'Imagem do Melona não importada')]);
 assert.ok(out.pendingRequests.some(s=>s.includes('Melona')));assert.equal(out.coverage.length,2);
 const input=buildPrompt(p,'Cortes, transições, cor e Melona',[],{review:true});assert.match(input,/coverage/);assert.match(input,/set_transition_at/);
});
test('cut-only plans cannot claim transitions, color or overlays as implemented; indices and all operations are checked',()=>{
 for(const kind of ['transition','color','image','text','speed'])assert.throws(()=>parse([item(kind,'planned',[0])]),/cobertura/i);
 for(const coverage of [[item('cut','planned',[1])],[item('cut','pending',[0])],[item('cut','planned',[])],[],[item('cut','planned',[0,0])]])assert.throws(()=>parse(coverage),/cobertura/i);
 assert.throws(()=>parseReviewPayload(p,JSON.stringify({plan,pendingRequests:[]})),/cobertura/i);
});
test('reordering has its own category and other cannot claim implemented work',()=>{
 const two=addClip(addClip(addAsset(createProject(),{id:'a',name:'Video',duration:10,width:320,height:240,hasAudio:false}),'a','c1'),'a','c2');
 const moved={summary:'Ordem',operations:[{type:'move',clipId:'c2',index:0}],questions:[],unsupported:[]};
 assert.equal(parseReviewPayload(two,JSON.stringify({plan:moved,pendingRequests:[],coverage:[item('order','planned',[0])]})).coverage[0].kind,'order');
 assert.throws(()=>parse([item('other','planned',[0])]),/cobertura/i);
 assert.ok(parse([item('cut','planned',[0]),item('other','pending',[],'Narração ainda não gravada')]).pendingRequests.some(s=>s.includes('Narração')));
});
test('a transition that a later cut removes cannot be reported as planned',()=>{
 const two=addClip(addClip(addAsset(createProject(),{id:'a',name:'Video',duration:10,width:320,height:240,hasAudio:false}),'a','c1'),'a','c2');
 const t={type:'set_transition_at',index:0,effect:'dissolve',duration:.2},cut={type:'keep_ranges',clipId:'c1',ranges:[[1,3],[4,6]]};
 const payload=ops=>JSON.stringify({plan:{summary:'T',operations:ops,questions:[],unsupported:[]},pendingRequests:[],coverage:[item('cut','planned',[ops.indexOf(cut)]),item('transition','planned',[ops.indexOf(t)])]});
 assert.throws(()=>parseReviewPayload(two,payload([t,cut])),/transição/i);
 assert.equal(parseReviewPayload(two,payload([cut,t])).plan.operations.length,2);
});
test('an invalid proposal gets exactly one corrective retry carrying the rejection reason',async()=>{
 const bad=JSON.stringify({plan,pendingRequests:[],coverage:[item('color','planned',[0])]}),good=JSON.stringify({plan,pendingRequests:[],coverage:[item('cut','planned',[0])]});
 const calls=[];const out=await reviewWithRetry(p,async feedback=>{calls.push(feedback);return {text:calls.length===1?bad:good,usage:{n:calls.length}};});
 assert.equal(calls.length,2);assert.equal(calls[0],null);assert.match(calls[1],/cobertura/i);assert.equal(out.coverage[0].kind,'cut');assert.deepEqual(out.usage,{n:3},'usage of both rounds is reported');
 const again=[];await assert.rejects(reviewWithRetry(p,async f=>{again.push(f);return {text:bad};}),/cobertura/i);assert.equal(again.length,2,'never more than one retry');
 const once=[];await assert.rejects(reviewWithRetry(p,async f=>{once.push(f);throw Error('A IA tentou usar uma ferramenta não permitida');}),/ferramenta/);assert.equal(once.length,1,'provider/safety failures are not retried');
});
test('background colour alone is framing, and a split that keeps the junction does not count as a lost transition',()=>{
 const two=addClip(addClip(addAsset(createProject(),{id:'a',name:'Video',duration:10,width:320,height:240,hasAudio:false}),'a','c1'),'a','c2');two.clips[0].background='color';two.clips[0].backgroundColor='#000000';for(const c of two.clips){c.in=1;c.out=9;}
 const colour={summary:'Fundo',operations:[{type:'update',clipId:'c1',backgroundColor:'#0000ff'}],questions:[],unsupported:[]};
 assert.equal(parseReviewPayload(two,JSON.stringify({plan:colour,pendingRequests:[],coverage:[item('framing','planned',[0])]})).plan.operations.length,1);
 const kept={summary:'T',operations:[{type:'set_transition',leftId:'c1',rightId:'c2',effect:'dissolve',duration:.2},{type:'split',clipId:'c1',time:4}],questions:[],unsupported:[]};
 assert.equal(parseReviewPayload(two,JSON.stringify({plan:kept,pendingRequests:[],coverage:[item('transition','planned',[0]),item('cut','planned',[1])]})).plan.operations.length,2);
});
test('speech operations are resolved to source ranges before validation, only in reviewed proposals',()=>{
 const words=[{text:'oi',start:1,end:1.4},{text:'radioativo',start:2,end:2.8},{text:'bom',start:4,end:4.3}],transcripts=[{assetId:'a',words,pauses:[{start:2.9,end:3.9}]}];
 const out=parseReviewPayload(p,JSON.stringify({plan:{...plan,operations:[{type:'remove_words',clipId:'c',ranges:[[1,1]]}]},pendingRequests:[],coverage:[item('cut','planned',[0])]}),{transcripts});
 assert.equal(out.plan.operations[0].type,'remove_ranges');assert.ok(out.plan.operations[0].ranges[0][0]>1.4&&out.plan.operations[0].ranges[0][1]>3.7);
 const kinds=s=>s.properties.operations.items.anyOf.map(o=>o.properties.type.const);
 assert.ok(kinds(reviewPlanSchema.properties.plan).includes('remove_words')&&kinds(reviewPlanSchema.properties.plan).includes('tighten_pauses'));assert.ok(!kinds(planSchema).includes('remove_words'));
 assert.match(buildPrompt(p,'Corte',[],{review:true}),/remove_words/);
});
test('an overlay anchored to speech resolves after the speech cuts into an ordinary component',()=>{
 const two=addClip(addClip(addAsset(createProject(),{id:'a',name:'Video',duration:10,width:320,height:240,hasAudio:true}),'a','c'),'a','b-roll');
 const words=[{text:'oi',start:1,end:1.4},{text:'manga',start:5,end:5.6},{text:'bom',start:7,end:7.3}],transcripts=[{assetId:'a',words,pauses:[]}];
 const ops=[{type:'remove_words',clipId:'c',ranges:[[0,0]]},{type:'place_overlay',anchor:{clipId:'c',from:1,to:1},layer:{id:'cartaz',assetId:'a',in:8,x:50,y:50,width:100,rotation:0,opacity:100}}];
 const out=parseReviewPayload(two,JSON.stringify({plan:{...plan,operations:ops},pendingRequests:[],coverage:[item('cut','planned',[0]),item('composition','planned',[1])]}),{transcripts});
 const [cut,overlay]=out.plan.operations,removed=cut.ranges[0][1]-cut.ranges[0][0];
 assert.equal(overlay.type,'add_video');assert.ok(Math.abs(overlay.layer.start-(5-removed))<1e-6&&Math.abs(overlay.layer.end-(5.6-removed))<1e-6,JSON.stringify({removed,layer:overlay.layer}));
 assert.match(buildPrompt(two,'x',[],{review:true}),/place_overlay/);
});
test('placeholder text on screen is never reported as finished work',()=>{
 const style={font:'Arial',size:5,color:'#ffffff',position:'bottom',preset:'outline',enter:'fade',exit:'fade'};
 const ops=[{type:'add_text',layer:{id:'endereco',text:'Endereço: [INSERIR ENDEREÇO]',start:1,end:3,style}},{type:'add_text',layer:{id:'nome',text:'Kokoro — novo restaurante em Dourados',start:0,end:1,style}}];
 const out=parseReviewPayload(p,JSON.stringify({plan:{...plan,operations:ops},pendingRequests:[],coverage:[item('text','planned',[0,1])]}));
 assert.ok(out.pendingRequests.some(s=>s.includes('[INSERIR ENDEREÇO]')&&s.includes('endereco')),JSON.stringify(out.pendingRequests));assert.equal(out.pendingRequests.length,1);
 const input=buildPrompt(p,'Narração em off será adicionada depois',[],{review:true});assert.match(input,/narração[^.]*FORA do escopo/i);assert.doesNotMatch(input,/Importar narração/);assert.match(input,/temperature/);
});
test('the overview may ask for visual searches and the final round sees which frame answers which query',()=>{
 const ok=parseReviewPayload(p,JSON.stringify({plan,pendingRequests:[],coverage:[item('cut','planned',[0])],visualQueries:[{query:'umbrellas hanging from the ceiling',purpose:'ambiente'}]}));assert.equal(ok.visualQueries.length,1);
 for(const bad of [[{query:'',purpose:'x'}],[{query:'x'.repeat(201),purpose:'x'}],Array.from({length:13},()=>({query:'q',purpose:'p'})),'facade'])assert.throws(()=>parseReviewPayload(p,JSON.stringify({plan,pendingRequests:[],coverage:[item('cut','planned',[0])],visualQueries:bad})),/visual/i);
 assert.ok(reviewPlanSchema.required.includes('visualQueries'));
 assert.match(buildPrompt(p,'x',[{assetId:'a',time:3,path:'/x.jpg',match:'takoyaki cut open'}],{review:true}),/"match":"takoyaki cut open"/);
});

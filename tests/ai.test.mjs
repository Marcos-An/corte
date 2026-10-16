import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, codexEnv, codexArgs, planSchema, codexFailure } from '../desktop/ai.mjs';
import { createProject, addAsset, addClip } from '../src/project.mjs';
const p=addClip(addAsset(createProject(),{id:'a',name:'Clip',duration:8,width:640,height:360,hasAudio:false}),'a','c');
test('AI prompt is generic, constrains supported actions and labels source timestamps',()=>{
 const s=buildPrompt(p,'Mantenha só a pessoa sorrindo',[{assetId:'a',time:2,path:'/private/frame.jpg'}]);
 assert.match(s,/Mantenha só a pessoa sorrindo/);assert.match(s,/keep_ranges/);assert.match(s,/sourceTime/);assert.doesNotMatch(s,/\/private\/frame/);
 assert.throws(()=>buildPrompt(p,'',[]));assert.throws(()=>buildPrompt(p,'x'.repeat(6001),[]));
});
test('CLI uses ChatGPT authentication only, bounded read-only session with tools disabled',()=>{
 const env=codexEnv({PATH:'/bin',OPENAI_API_KEY:'secret',OPENAI_BASE_URL:'evil',ELECTRON_RUN_AS_NODE:'1'});
 assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.OPENAI_BASE_URL,undefined);
 const args=codexArgs('/tmp/schema','/tmp/result',['/tmp/frame']);
 assert.ok(args.includes('--ignore-user-config'));assert.ok(args.includes('--ephemeral'));
 assert.ok(args.includes('read-only'));assert.ok(args.includes('shell_tool=false'));assert.ok(args.includes('--output-schema'));
 assert.ok(planSchema.properties.operations.items.anyOf.length>=5);
});

test('provider JSON schema excludes oneOf and errors never expose raw stderr or secrets',()=>{
 assert.equal(JSON.stringify(planSchema).includes('oneOf'),false);
 assert.match(codexFailure('{"type":"error","message":"invalid_json_schema"}'),/formato/i);
 assert.doesNotMatch(codexFailure('secret-sk-key'),/secret-sk-key/);
});
test('each discriminator and enum has explicit JSON schema type',()=>{
 for(const s of planSchema.properties.operations.items.anyOf){assert.equal(s.properties.type.type,'string');if(s.properties.aspect)assert.equal(s.properties.aspect.type,'string');}
});
test('shared instructions stay generic across temporal, crop and audio requests',()=>{
 for(const request of ['Mantenha a pessoa sorrindo','Remova os momentos sem produto visível','Corte os primeiros 3 segundos','Reenquadre em 1:1','Reduza o volume para 50%']){
  const s=buildPrompt(p,request,[]);assert.ok(s.includes(request));
  assert.doesNotMatch(s,/mão|lente|borrão|defeitos VISUAIS/i);
  assert.match(s,/critério solicitado/i);assert.match(s,/evidência.*sourceTime/i);
  assert.match(s,/tempos explícitos/i);
 }
});
test('conservative editing can remove a confirmed core without claiming exact boundaries',()=>{
 assert.match(buildPrompt(p,'Remova obstruções',[]),/núcleo confirmado/);
});

test('hybrid review prompt includes timed speech, pending requests and no contradictory auto-apply or single-clip restriction',()=>{
 const text=buildPrompt(p,'Reels; não invente endereço',[],{review:true,transcripts:[{assetId:'a',words:[{start:1,end:2,text:'melão'}]}]});
 assert.match(text,/melão/);assert.match(text,/pendingRequests/);assert.doesNotMatch(text,/aplicado automaticamente|Escopo com apenas um clipe/);
});
test('review payload validates executable operations independently from pending requests without weakening legacy plans',async()=>{
 const {parseReviewPayload}=await import('../desktop/ai.mjs');
 const plan={summary:'Vertical',operations:[{type:'set_aspect',aspect:'9:16'}],questions:[],unsupported:[]};
 assert.equal(parseReviewPayload(p,JSON.stringify({plan,pendingRequests:['Endereço ausente']})).pendingRequests.length,1);
 assert.throws(()=>parseReviewPayload(p,JSON.stringify({plan:{...plan,operations:[{type:'delete',clipId:'missing'}]},pendingRequests:[]})));
 assert.throws(()=>parseReviewPayload(p,JSON.stringify({plan:{...plan,questions:['Dúvida que bloqueia operação']},pendingRequests:[]})));
 assert.throws(()=>parseReviewPayload(p,JSON.stringify({plan,pendingRequests:['x'.repeat(2001)]})));
});

test('remote prompt cannot leak saved transcripts or narration captions outside the authorized cut',()=>{
 const project=structuredClone(p);project.clips[0].in=3;project.clips[0].out=7;
 project.transcripts=[{assetId:'a',words:[{start:1,end:2,text:'PRIVATE_OUTSIDE_CUT'}]}];
 project.assets.push({id:'voice',name:'Voz',kind:'audio',duration:8,width:0,height:0,hasAudio:true});project.music=[{id:'voice-clip',assetId:'voice',in:3,out:7,start:0,volume:1,role:'narration',captionWords:[{start:1,end:2,text:'PRIVATE_NARRATION_CAPTION'}]}];
 const text=buildPrompt(project,'Edite',[],{review:true,transcripts:[{assetId:'a',words:[{start:4,end:5,text:'AUTHORIZED_SPEECH'}]}]});
 assert.doesNotMatch(text,/PRIVATE_OUTSIDE_CUT|PRIVATE_NARRATION_CAPTION/);assert.match(text,/AUTHORIZED_SPEECH/);assert.equal(project.transcripts[0].words[0].text,'PRIVATE_OUTSIDE_CUT');
});

test('non-fatal experimental-feature startup warning is suppressed without enabling tools',()=>{
 const args=codexArgs('/tmp/schema','/tmp/result');assert.ok(args.includes('suppress_unstable_features_warning=true'));assert.ok(args.includes('features.skip_host_skill_discovery=true'));assert.ok(args.includes('shell_tool=false'));
});
test('hybrid prompt distinguishes uncertain internal speech from generated subtitles and forbids deleting those regions',()=>{
 const prompt=buildPrompt(p,'Vertical',[],{review:true,speechGaps:[{assetId:p.assets[0].id,start:0,end:1}]});assert.match(prompt,/sem tempos confiáveis/i);assert.match(prompt,/não remova|não exclua/i);assert.match(prompt,/speechGaps/);
});

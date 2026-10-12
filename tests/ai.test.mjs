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

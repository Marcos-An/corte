import test from 'node:test';import assert from 'node:assert/strict';
import {createProject,addAsset,addClip,editProject,validateProject} from '../src/project.mjs';
import {buildPrompt} from '../desktop/ai.mjs';
const p=addClip(addAsset(createProject(),{id:'a',name:'Video',duration:10,width:320,height:240,hasAudio:true}),'a','c');
const facts='Endereço: Rua Hayel Bon Faker, 1500, Dourados. Cardápio: tempurá de camarão e legumes; takoyaki de polvo. Competição de ramen: 2ª edição, 10 a 20 de novembro.';
test('place facts live in the project, are undoable edits and survive validation',()=>{
 const q=editProject(p,{type:'set_brief',facts});assert.equal(q.brief.facts,facts);assert.equal(p.brief,undefined,'pure edit');
 assert.equal(editProject(q,{type:'set_brief',facts:'  '}).brief,undefined,'clearing removes the field');
 for(const bad of [{facts:'x'.repeat(4001)},{facts:3},{facts:'a',extra:1}])assert.throws(()=>validateProject({...p,brief:bad}),/informações/i);
});
test('the provider receives the facts as data, uses them for placeholders and ingredients, and never sees them twice',()=>{
 const input=buildPrompt(editProject(p,{type:'set_brief',facts}),'Cortar ingredientes errados',[],{review:true});
 assert.match(input,/Fatos do local informados pelo usuário/);assert.equal(input.split('Hayel Bon Faker').length-1,1,'only in its own section, not inside the project JSON');
 assert.match(input,/marcadores? como \[INSERIR/i);
 assert.doesNotMatch(buildPrompt(p,'x',[],{review:true}),/Fatos do local informados/);
});

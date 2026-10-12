// Teste opt-in: usa o plano ChatGPT e envia poucos frames do vídeo autorizado.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { probe } from '../desktop/media.mjs';
import { requestPlan } from '../desktop/ai.mjs';
import { createProject, addAsset, addClip, applyPlan, editProject } from '../src/project.mjs';
if(!process.env.CORTE_TEST_VIDEO || !process.env.CORTE_TEST_CODEX_HOME)throw new Error('Defina CORTE_TEST_VIDEO e CORTE_TEST_CODEX_HOME. Este teste envia frames à nuvem.');
const file=process.env.CORTE_TEST_VIDEO,cache=await mkdtemp(path.join(tmpdir(),'corte-ai-test-'));
const a={id:'test-asset',name:'Vídeo autorizado',...await probe(file)};
let p=addClip(addAsset(createProject('Teste visual'),a),'test-asset','clip-1');

// Restringe a fonte de análise com uma amostra curta preparada explicitamente no teste.
try {
 const r=await requestPlan({home:process.env.CORTE_TEST_CODEX_HOME,cache,project:p,prompt:'Faça SOMENTE estas alterações: reenquadre o vídeo excluindo os 25% inferiores da imagem, reduza o volume para 50% e use formato 1:1. Não corte trechos no tempo. Descreva brevemente o conteúdo visual que encontrou.',registry:new Map([[a.id,{path:file}]]),step:5,onProgress:v=>console.log(v.stage,v.completed,v.total)});
 assert.equal(r.plan.questions.length,0);assert.equal(r.plan.unsupported.length,0);
 const q=applyPlan(p,r.plan);assert.equal(q.aspect,'1:1');assert.equal(q.clips[0].volume,.5);assert.deepEqual(q.clips[0].crop,{x:0,y:0,w:1,h:.75});
 await writeFile(path.resolve(import.meta.dirname,'../../validacao-integracao-ia.json'),JSON.stringify({plan:r.plan,frames:r.frames,usage:r.usage},null,2));
 console.log('PASS IA real: plano estruturado, reenquadramento + volume + formato, sem corte temporal.');
} finally {await rm(cache,{recursive:true,force:true});}

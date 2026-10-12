import test from 'node:test';import assert from 'node:assert/strict';
import {transcribeLocally} from '../desktop/transcribe.mjs';
test('caption request validates project, rejects missing audio and pre-cancellation without starting model',async()=>{
 const p={version:1,name:'Teste',aspect:'9:16',assets:[{id:'a',name:'Vídeo',duration:1,width:320,height:240,hasAudio:false}],clips:[{id:'c',assetId:'a',in:0,out:1,volume:1,crop:{x:0,y:0,w:1,h:1}}]};
 await assert.rejects(()=>transcribeLocally({project:p,registry:new Map()}),/áudio/);
 const signal=AbortSignal.abort();await assert.rejects(()=>transcribeLocally({project:p,registry:new Map(),signal}),/cancelada/);
 await assert.rejects(()=>transcribeLocally({project:{},registry:new Map()}),/Projeto inválido/);
});

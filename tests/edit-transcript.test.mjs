import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeRecognition} from '../src/captions.mjs';
import {normalizeEditRecognition} from '../desktop/edit-transcript.mjs';
test('reproduced zero-time words fail caption validation but do not abort internal editing recognition',()=>{
 const raw={chunks:[{text:'não',timestamp:[.2,.2]},{text:'cortar',timestamp:[.3,.8]}]},before=structuredClone(raw);
 assert.throws(()=>normalizeRecognition(raw,1),/Palavra ou tempo de legenda inválido/);
 const out=normalizeEditRecognition(raw,1);assert.deepEqual(out.words,[],'do not selectively remove a negation and preserve misleading speech');assert.deepEqual(out.gaps,[{start:0,end:1,reason:'unreliable-word-times'}]);assert.deepEqual(raw,before);
});
test('missing, negative, reversed, out-of-order and excessive timestamps mark the chunk uncertain without inventing times',()=>{
 for(const timestamps of [[{start:0,end:1}],[[0,null]],[[null,.5]],[[-.1,.2]],[[.5,.2]],[[.8,1.2]],[[.5,.7],[.1,.4]]]){
  const out=normalizeEditRecognition({chunks:timestamps.map(timestamp=>({text:'fala',timestamp}))},1);assert.deepEqual(out.words,[]);assert.equal(out.gaps.length,1);
 }
});
test('good word evidence and real silence stay unchanged; speech without timestamps stays uncertain',()=>{
 assert.deepEqual(normalizeEditRecognition({chunks:[{text:' Olá ',timestamp:[0,.5]}]},1),{words:[{text:'Olá',start:0,end:.5}],gaps:[]});assert.deepEqual(normalizeEditRecognition({text:'',chunks:[]},1),{words:[],gaps:[]});assert.equal(normalizeEditRecognition({text:'fala sem tempo'},1).gaps.length,1);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {detectPauses,speechHints,resolveSpeechOperations} from '../desktop/speech-edit.mjs';
import {createProject,addAsset,addClip} from '../src/project.mjs';
const rate=16000,tone=(seconds,amp)=>Array.from({length:Math.round(seconds*rate)},(_,i)=>amp*Math.sin(i/rate*2*Math.PI*220)),noise=(seconds,amp)=>Array.from({length:Math.round(seconds*rate)},(_,i)=>amp*Math.sin(i*12.9898)*Math.cos(i*78.233));
const near=(a,b,tol=.05)=>Math.abs(a-b)<=tol;
test('pauses are found against the clip noise floor, not a fixed decibel threshold',()=>{
 const quiet=Float32Array.from([...tone(1,.3),...noise(.8,.002),...tone(1,.3)]);const [p]=detectPauses(quiet,rate);assert.ok(p&&near(p.start,1)&&near(p.end,1.8),JSON.stringify(p));
 const restaurant=Float32Array.from([...tone(1,.3),...noise(.6,.02),...tone(.5,.3),...noise(.2,.02),...tone(.5,.3)]).map((v,i)=>v+.01*Math.sin(i*3.1));
 const found=detectPauses(restaurant,rate);assert.equal(found.length,1,'a 0.2s breath is not a pause');assert.ok(near(found[0].start,1)&&near(found[0].end,1.6));
 assert.deepEqual(detectPauses(Float32Array.from(tone(2,.3)),rate),[],'continuous speech has no pause');
 assert.deepEqual(detectPauses(Float32Array.from(noise(2,.02)),rate),[],'no contrast means no claim');
});
test('hints flag hesitations and immediate repetitions, never the verb "é"',()=>{
 const w=t=>t.split(' ').map((text,i)=>({text,start:i,end:i+.5}));
 assert.deepEqual(speechHints(w('éé eu eu quero o sabor é bom a gente a gente foi hum')),[
  {type:'filler',from:0,to:0,text:'éé'},{type:'repeat',from:1,to:1,text:'eu'},{type:'repeat',from:8,to:9,text:'a gente'},{type:'filler',from:13,to:13,text:'hum'}]);
 assert.deepEqual(speechHints(w('Eu, eu. Não')),[{type:'repeat',from:0,to:0,text:'Eu,'}]);
});
const fixture=()=>{
 const p=addClip(addAsset(createProject(),{id:'a',name:'Fala',duration:40,width:320,height:240,hasAudio:true}),'a','c');p.clips[0].in=0;p.clips[0].out=40;
 // "Bonita" is stretched by Whisper over the 2s pause that follows it.
 const words=[['oi',4.8,5.3],['essa',7.58,7.8],['bebida',7.8,8.22],['verde',9.36,10.2],['radioativo',10.2,11.08],['mas',11.26,11.52],['bonita',31.56,33.88],['agora',34.14,34.9],['takoyaki',34.9,35.8]].map(([text,start,end])=>({text,start,end}));
 return {p,transcripts:[{assetId:'a',words,pauses:[{start:5.4,end:7.5},{start:11.1,end:11.24},{start:31.9,end:33.9}]}]};
};
const result=(ops,coverage)=>({plan:{summary:'s',questions:[],unsupported:[],operations:ops},pendingRequests:[],coverage});
const cov=(kind,status,operationIndexes)=>({request:'r '+kind,kind,status,operationIndexes,reason:'motivo'});
test('removing words cuts inside the surrounding silence, keeping a short natural breath',()=>{
 const {p,transcripts}=fixture(),out=resolveSpeechOperations(p,result([{type:'remove_words',clipId:'c',ranges:[[3,4]]}],[cov('cut','planned',[0])]),transcripts);
 const [op]=out.plan.operations;assert.equal(op.type,'remove_ranges');assert.equal(op.clipId,'c');assert.equal(op.ranges.length,1);
 const [[start,end]]=op.ranges;assert.ok(start>8.22&&start<=9.36,'after "bebida" ends, before "verde" starts');assert.ok(near(end,11.17,.01),`middle of the short pause before "mas" (${end})`);
 const tail=resolveSpeechOperations(p,result([{type:'remove_words',clipId:'c',ranges:[[7,8]]}],[cov('cut','planned',[0])]),transcripts).plan.operations[0].ranges[0];
 assert.ok(near(tail[0],32.02,.01),`starts 0.12s into the pause, not at the stretched word end 33.88 (${tail[0]})`);assert.ok(near(tail[1],36.1,.01),'after the last word only 0.3s is taken: what follows may be b-roll, not silence');
 const word=resolveSpeechOperations(p,result([{type:'remove_words',clipId:'c',ranges:[[6,6]]}],[cov('cut','planned',[0])]),transcripts).plan.operations[0].ranges[0];
 assert.ok(near(word[0],31.26,.01)&&near(word[1],33.78,.01),'removing the stretched word removes its silence tail too, keeping 0.12s');
});
test('tightening pauses shortens only long pauses between words, never inside uncertain speech, and reports when there is nothing to do',()=>{
 const {p,transcripts}=fixture(),op={type:'tighten_pauses',clipId:'c',minPause:.6,keep:.3};transcripts[0].pauses.push({start:36,end:39.5});
 const out=resolveSpeechOperations(p,result([op],[cov('cut','planned',[0])]),transcripts);
 assert.deepEqual(out.plan.operations[0].ranges.map(r=>r.map(v=>Number(v.toFixed(2)))),[[5.55,7.35],[32.05,33.75]],'the silence after the last word is left alone');
 const guarded=resolveSpeechOperations(p,result([op],[cov('cut','planned',[0])]),transcripts,[{assetId:'a',start:31,end:34,reason:'unreliable-word-times'}]);
 assert.deepEqual(guarded.plan.operations[0].ranges.map(r=>r.map(v=>Number(v.toFixed(2)))),[[5.55,7.35]]);
 const none=resolveSpeechOperations(p,result([op,{type:'set_aspect',aspect:'9:16'}],[cov('cut','planned',[0]),cov('framing','planned',[1])]),transcripts,[],);
 const tight={...transcripts[0],pauses:[]},empty=resolveSpeechOperations(p,result([op,{type:'set_aspect',aspect:'9:16'}],[cov('cut','planned',[0]),cov('framing','planned',[1])]),[tight]);
 assert.equal(none.plan.operations.length,2);assert.deepEqual(empty.plan.operations.map(o=>o.type),['set_aspect']);
 assert.equal(empty.coverage[0].status,'not_needed');assert.deepEqual(empty.coverage[0].operationIndexes,[]);assert.match(empty.coverage[0].reason,/pausa/i);assert.deepEqual(empty.coverage[1].operationIndexes,[0]);
});
test('every speech cut on one clip becomes a single range operation and coverage follows the new indexes',()=>{
 const {p,transcripts}=fixture(),ops=[{type:'remove_words',clipId:'c',ranges:[[0,0]]},{type:'set_aspect',aspect:'9:16'},{type:'tighten_pauses',clipId:'c',minPause:.6,keep:.3},{type:'remove_ranges',clipId:'c',ranges:[[38,39]]}];
 const out=resolveSpeechOperations(p,result(ops,[cov('cut','planned',[0,3]),cov('framing','planned',[1]),cov('cut','planned',[2])]),transcripts);
 assert.deepEqual(out.plan.operations.map(o=>o.type),['remove_ranges','set_aspect']);assert.equal(out.plan.operations[0].ranges.length,3,'overlapping word and pause cuts are merged');
 assert.deepEqual(out.coverage.map(c=>c.operationIndexes),[[0],[1],[0]]);
});
test('invalid word references are rejected so the provider gets a corrective round',()=>{
 const {p,transcripts}=fixture(),bad=ops=>()=>resolveSpeechOperations(p,result(ops,[cov('cut','planned',[0])]),transcripts);
 for(const ranges of [[[3,2]],[[0,99]],[[-1,0]],[[.5,1]],[]])assert.throws(bad([{type:'remove_words',clipId:'c',ranges}]),/palavras/i);
 assert.throws(bad([{type:'remove_words',clipId:'x',ranges:[[0,0]]}]),/trecho/i);
 assert.throws(bad([{type:'tighten_pauses',clipId:'c',minPause:.6,keep:1}]),/pausa/i);
 assert.throws(bad([{type:'keep_ranges',clipId:'c',ranges:[[0,5]]},{type:'remove_words',clipId:'c',ranges:[[0,0]]}]),/keep_ranges/);
 assert.throws(()=>resolveSpeechOperations(p,result([{type:'remove_words',clipId:'c',ranges:[[0,0]]}],[cov('cut','planned',[0])]),[]),/transcrição/i);
 const trimmed=structuredClone(p);trimmed.clips[0].in=9;assert.throws(()=>resolveSpeechOperations(trimmed,result([{type:'remove_words',clipId:'c',ranges:[[0,0]]}],[cov('cut','planned',[0])]),transcripts),/fora do trecho/i);
 const plain=result([{type:'set_aspect',aspect:'9:16'}],[cov('framing','planned',[0])]);assert.deepEqual(resolveSpeechOperations(p,plain,[]),plain,'plans without speech operations pass through untouched');
});
test('a long silence between words is a scene, not a pause: speech cuts never swallow it',()=>{
 const p=addClip(addAsset(createProject(),{id:'a',name:'Fala',duration:40,width:320,height:240,hasAudio:true}),'a','c');
 const transcripts=[{assetId:'a',words:[['olha',1,1.4],['isso',1.5,2],['pronto',30.7,31.2],['fim',31.3,31.6]].map(([text,start,end])=>({text,start,end})),pauses:[{start:2.1,end:30.6}]}];
 const [[,end]]=resolveSpeechOperations(p,result([{type:'remove_words',clipId:'c',ranges:[[1,1]]}],[cov('cut','planned',[0])]),transcripts).plan.operations[0].ranges;assert.ok(end<=2.3,`removing "isso" keeps the silent scene (cut ends ${end})`);
 const out=resolveSpeechOperations(p,result([{type:'tighten_pauses',clipId:'c',minPause:.6,keep:.25}],[cov('cut','planned',[0])]),transcripts);assert.deepEqual(out.plan.operations,[]);
});
test('coverage remapping never hides invalid indexes and keeps unfinished work pending',()=>{
 const {p,transcripts}=fixture(),rw={type:'remove_words',clipId:'c',ranges:[[0,0]]};
 assert.deepEqual(resolveSpeechOperations(p,result([rw],[cov('cut','planned',[0,7])]),transcripts).coverage[0].operationIndexes,[0,-1],'an out-of-range index stays invalid for validation');
 assert.deepEqual(resolveSpeechOperations(p,result([rw],[cov('cut','planned',[0,0])]),transcripts).coverage[0].operationIndexes,[0,0],'duplicates stay visible');
 const quiet=[{...transcripts[0],pauses:[]}],tighten={type:'tighten_pauses',clipId:'c',minPause:.6,keep:.3};
 const partial=resolveSpeechOperations(p,result([tighten],[{...cov('cut','partial',[0]),reason:'x'.repeat(995)}]),quiet).coverage[0];
 assert.equal(partial.status,'pending','a partial item whose only operation vanished is still unfinished');assert.ok(partial.reason.length<=1000);
 assert.equal(resolveSpeechOperations(p,result([rw,tighten],[cov('cut','planned',[0]),cov('cut','planned',[5])]),quiet).coverage[1].operationIndexes[0],-1,'an index that never existed is not explained away as "no pauses"');
});
test('a short burst of speech in a quiet window still yields its pauses',()=>{
 const samples=Float32Array.from([...noise(14,.002),...tone(1,.3),...noise(15,.002)]),found=detectPauses(samples,rate);
 assert.equal(found.length,2);assert.ok(near(found[0].end,14)&&near(found[1].start,15));
});

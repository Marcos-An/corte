import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeRecognition} from '../src/captions.mjs';
import {normalizeEditRecognition,speechWindows,mergeSpeechWindow} from '../desktop/edit-transcript.mjs';
test('reproduced zero-time words fail caption validation but do not abort internal editing recognition',()=>{
 const raw={chunks:[{text:'não',timestamp:[.2,.2]},{text:'cortar',timestamp:[.3,.8]}]},before=structuredClone(raw);
 assert.throws(()=>normalizeRecognition(raw,1),/Palavra ou tempo de legenda inválido/);
 const out=normalizeEditRecognition(raw,1);assert.deepEqual(out.words,[{text:'cortar',start:.3,end:.8}],'only the unreliable word loses its time');assert.deepEqual(out.gaps,[{start:0,end:.3,reason:'unreliable-word-times'}],'the negation stays protected by a local gap, never silently dropped');assert.deepEqual(out.context,[{start:0,end:.3,text:'não'}]);assert.deepEqual(raw,before);
});
test('missing, negative, reversed, out-of-order and excessive timestamps mark the chunk uncertain without inventing times',()=>{
 for(const timestamps of [[{start:0,end:1}],[[0,null]],[[null,.5]],[[-.1,.2]],[[.5,.2]],[[.8,1.2]],[[.5,.7],[.1,.4],[.2,.3]]]){
  const out=normalizeEditRecognition({chunks:timestamps.map(timestamp=>({text:'fala',timestamp}))},1);assert.deepEqual(out.words,[]);assert.equal(out.gaps.length,1);
 }
});
test('good word evidence and real silence stay unchanged; speech without timestamps stays uncertain',()=>{
 assert.deepEqual(normalizeEditRecognition({chunks:[{text:' Olá ',timestamp:[0,.5]}]},1),{words:[{text:'Olá',start:0,end:.5}],gaps:[]});assert.deepEqual(normalizeEditRecognition({text:'',chunks:[]},1),{words:[],gaps:[]});assert.equal(normalizeEditRecognition({text:'fala sem tempo'},1).gaps.length,1);
});
test('uncertain alignment preserves the complete phrase as coarse context, never individual word times',()=>{
 const out=normalizeEditRecognition({text:'Eu não quero cortar esta fala.',chunks:[{text:'Eu',timestamp:[0,.2]},{text:'não',timestamp:[.2,.2]},{text:'quero',timestamp:[.2,.2]}]},2);
 assert.deepEqual(out.context,[{start:0,end:2,text:'Eu não quero cortar esta fala.'}]);assert.deepEqual(out.words,[]);assert.equal(out.gaps.length,1);
 const fallback=normalizeEditRecognition({chunks:[{text:'não',timestamp:[0,0]},{text:'cortar',timestamp:[0,0]}]},2);assert.equal(fallback.context[0].text,'não cortar');
});
test('one bad word in a window is a local gap between its reliable neighbours, not a 30-second blackout',()=>{
 const chunks=[{text:'o',timestamp:[1,1.2]},{text:'melão',timestamp:[1.3,1.8]},{text:'é',timestamp:[2,2]},{text:'verde',timestamp:[2.1,2.5]},{text:'radioativo',timestamp:[2.6,3.2]},{text:'mas',timestamp:[29.5,null]}];
 const out=normalizeEditRecognition({chunks},30);
 assert.deepEqual(out.words.map(w=>w.text),['o','melão','verde','radioativo']);
 assert.deepEqual(out.gaps,[{start:1.8,end:2.1,reason:'unreliable-word-times'},{start:29.5,end:30,reason:'unreliable-word-times'}],'open final word (null end) only protects the tail');
 assert.deepEqual(out.context.map(c=>c.text),['é','mas']);
 const touching=normalizeEditRecognition({chunks:[{text:'a',timestamp:[0,.5]},{text:'b',timestamp:[.5,.5]},{text:'c',timestamp:[.5,1]}]},1);assert.deepEqual(touching.gaps,[{start:0,end:1,reason:'unreliable-word-times'}],'zero-width neighbourhood widens over the neighbours instead of vanishing');
 const backwards=normalizeEditRecognition({chunks:[{text:'a',timestamp:[.5,.7]},{text:'b',timestamp:[.1,.4]},{text:'c',timestamp:[.8,.9]}]},1);assert.deepEqual(backwards.gaps,[{start:.1,end:.8,reason:'unreliable-word-times'}],'a backwards claim widens the gap to cover where it says it was');
});
test('overlapping windows cover clip edges and each word is kept exactly once',()=>{
 assert.deepEqual(speechWindows(35),[{offset:0,length:30,from:0,to:27.5},{offset:25,length:10,from:27.5,to:35}]);
 assert.deepEqual(speechWindows(20),[{offset:0,length:20,from:0,to:20}]);
 assert.deepEqual(speechWindows(60).map(w=>[w.offset,w.from,w.to]),[[0,0,27.5],[25,27.5,52.5],[50,52.5,60]]);
 const merged={words:[],gaps:[],context:[]};
 mergeSpeechWindow(merged,{words:[{text:'antes',start:20,end:21},{text:'borda',start:27,end:27.4},{text:'dupla',start:28,end:28.6}],gaps:[{start:26,end:30,reason:'unreliable-word-times'}],context:[{start:26,end:30,text:'x'}]},speechWindows(35)[0]);
 mergeSpeechWindow(merged,{words:[{text:'borda',start:2,end:2.4},{text:'dupla',start:3,end:3.6},{text:'fim',start:8,end:9}],gaps:[],context:[]},speechWindows(35)[1]);
 assert.deepEqual(merged.words.map(w=>[w.text,w.start]),[['antes',20],['borda',27],['dupla',28],['fim',33]]);
 assert.deepEqual(merged.gaps,[{start:26,end:27.5,reason:'unreliable-word-times'}],'gaps are clipped to the window that owns them');
 assert.deepEqual(merged.context,[{start:26,end:27.5,text:'x'}]);
});
test('malformed chunk containers remain uncertain instead of crashing the fallback text path',()=>{
 for(const chunks of [{},3,'invalid']){const out=normalizeEditRecognition({chunks},1);assert.deepEqual(out.words,[]);assert.equal(out.gaps.length,1);}
});
test('window overlap tolerates timing jitter between decodes: no duplicated and no vanished word',()=>{
 const [a,b]=speechWindows(35),run=(first,second)=>{const m={words:[],gaps:[],context:[]};mergeSpeechWindow(m,{words:first,gaps:[]},a);mergeSpeechWindow(m,{words:second,gaps:[]},b);return m.words.map(w=>`${w.text}@${w.start}`);};
 assert.deepEqual(run([{text:'eu',start:26.8,end:27.1},{text:'não',start:27.3,end:27.5}],[{text:'eu',start:1.9,end:2.2},{text:'Não',start:2.6,end:2.8},{text:'quero',start:3,end:3.4}]),['eu@26.8','não@27.3','quero@28'],'same word seen at 27.3 and 27.6 is kept once');
 assert.deepEqual(run([{text:'eu',start:26.8,end:27.1},{text:'não',start:27.6,end:27.8}],[{text:'eu',start:1.85,end:2.1},{text:'não',start:2.4,end:2.6},{text:'quero',start:3,end:3.4}]),['eu@26.8','não@27.4','quero@28'],'a word on the far side of the midpoint in both decodes is not lost');
});

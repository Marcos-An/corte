import test from 'node:test';import assert from 'node:assert/strict';
import {captionStyle,captionEntries,toAss,captionRuns} from '../src/captions.mjs';
import {normalizeWordTranscript,transcribeAudio} from '../desktop/cloud-captions.mjs';
test('dynamic transcription keeps provider word times, requests verbose timestamps',async()=>{
 const result={words:[{word:'Olá',start:.1,end:.5},{word:'mundo.',start:.7,end:1.1}]};
 const phrases=normalizeWordTranscript(result,2);assert.deepEqual(phrases[0].tokens,[{text:'Olá',start:.1,end:.5},{text:'mundo.',start:.7,end:1.1}]);
 assert.throws(()=>normalizeWordTranscript({words:[{word:'x',start:0,end:3}]},2));
 let form;await transcribeAudio({key:'test',audio:new Uint8Array([1]),duration:2,wordTiming:true,fetcher:async(_,req)=>{form=req.body;return{ok:true,json:async()=>result}}});
 assert.equal(form.get('model'),'whisper-1');assert.equal(form.get('timestamp_granularities[]'),'word');
});
test('preview and ASS share actual active word boundaries, never interpolate phrases',()=>{
 const c={start:0,end:2,text:'Olá mundo',tokens:[{text:'Olá',start:.1,end:.5},{text:'mundo',start:.7,end:1.1}]};
 const style={font:'Arial',size:6.5,color:'#ffffff',accent:'#eac39b',position:'bottom',positionY:80,width:84,preset:'highlight'};
 assert.equal(captionStyle(style).accent,'#eac39b');
 assert.deepEqual(captionRuns(c,.6,style).map(w=>w.active),[false,false]);
 assert.deepEqual(captionRuns(c,.8,style).map(w=>w.active),[false,true]);
 assert.ok(captionRuns({...c,tokens:undefined},.8,style).every(w=>!w.active));
 const ass=toAss([c],720,1280,style);assert.match(ass,/0:00:00.70,0:00:01.10/);assert.match(ass,/pos\(360,1024\)/);assert.match(ass,/9BC3EA/);
 assert.throws(()=>captionStyle({...style,width:200}));
});
test('timed tokens are remapped with source trim, kept in actual timeline coordinates',()=>{
 const p={clips:[{id:'c',assetId:'a',in:1,out:3}],transcripts:[{assetId:'a',words:[{text:'a b',start:0,end:3,tokens:[{text:'a',start:0,end:.5},{text:'b',start:2,end:2.5}]}]}]};
 assert.equal(captionEntries(p)[0].tokens.find(t=>t.text==='b').start,1);
});

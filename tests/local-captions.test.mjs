import test from 'node:test';import assert from 'node:assert/strict';import * as m from '../src/project.mjs';import {groupCaptionTokens} from '../src/caption-timing.mjs';import {generateLocalCaptions} from '../desktop/local-captions.mjs';
function fixture(){let p=m.addClip(m.addAsset(m.createProject(),{id:'v',name:'Vídeo',duration:10,width:640,height:360,hasAudio:true}),'v','c');return m.addMusic(p,{id:'a',name:'Narração',kind:'audio',duration:4,width:0,height:0,hasAudio:true},{id:'voice',role:'narration',in:0,out:4,start:2,volume:.6});}
test('local phrases retain measured word timestamps, split on punctuation/pauses and avoid fabricated chunk timings',()=>{
 const tokens=[{text:'Olá',start:0,end:.4},{text:'mundo!',start:.5,end:1},{text:'Depois',start:2,end:2.5},{text:'vem',start:2.5,end:2.8},{text:'a comida.',start:2.8,end:3.5}],before=structuredClone(tokens),p=groupCaptionTokens(tokens,4);
 assert.deepEqual(p[0],{start:0,end:1,text:'Olá mundo!',tokens:tokens.slice(0,2)});assert.equal(p[1].tokens,undefined);assert.equal(p[1].text,'Depois vem a comida.');assert.deepEqual(tokens,before);assert.deepEqual(groupCaptionTokens([],4),[]);assert.throws(()=>groupCaptionTokens([{text:'x',start:1,end:null}],4));
});
test('local captions preserve other-source transcripts and manual edits until the caller commits',async()=>{
 const p=fixture();p.transcripts=[{assetId:'v',words:[{start:0,end:1,text:'Original'}]},{assetId:'a',words:[{start:0,end:1,text:'Antiga'}]}];p.clips[0].captionWords=[{start:0,end:1,text:'Manual'}];p.captionSource='narration';let called=false;
 const result=await generateLocalCaptions({project:p},{transcribe:async options=>{called=true;assert.equal(options.purpose,'captions');assert.equal(options.project.captionSource,'narration');return [{assetId:'a',provider:'local',words:[{start:0,end:1,text:'Nova'}]}];}});
 assert.ok(called);assert.equal(result.find(t=>t.assetId==='v').words[0].text,'Original');assert.equal(result.find(t=>t.assetId==='a').words[0].text,'Nova');assert.equal(p.transcripts[1].words[0].text,'Antiga');assert.equal(p.clips[0].captionWords[0].text,'Manual');
});
test('wrong-source, partial, duplicate, invalid and cancelled local responses cannot replace captions',async()=>{
 const p=fixture();p.captionSource='narration';const original=structuredClone(p);
 for(const generated of [[],[{assetId:'v',words:[]}],[{assetId:'a',words:[{start:0,end:9,text:'Fora'}]}],[{assetId:'a',words:[]},{assetId:'a',words:[]}]])await assert.rejects(()=>generateLocalCaptions({project:p},{transcribe:async()=>generated}));
 await assert.rejects(()=>generateLocalCaptions({project:p,signal:AbortSignal.abort()},{transcribe:async()=>{throw Error('Should not run');}}));assert.deepEqual(p,original);
 const c=new AbortController();await assert.rejects(()=>generateLocalCaptions({project:p,signal:c.signal},{transcribe:async()=>{c.abort();return [{assetId:'a',words:[]}];}}));
});

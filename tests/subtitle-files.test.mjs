import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAsset,addClip,editProject,addMusic,History} from '../src/project.mjs';
import {captionEntries} from '../src/captions.mjs';
import {parseSubtitles,importSubtitles,exportSubtitles} from '../src/subtitle-files.mjs';
const srt='1\r\n00:00:01,000 --> 00:00:03,000\r\nOlá, mundo!\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,000\r\nComida boa.';
function fixture(){return addClip(addAsset(createProject(),{id:'v',name:'Vídeo',duration:10,width:640,height:360,hasAudio:true}),'v','c');}
test('reads UTF8/BOM, CRLF, multiline SRT and WebVTT cues without invented word timings',()=>{
 assert.deepEqual(parseSubtitles('\uFEFF'+srt),[{start:1,end:3,text:'Olá, mundo!'},{start:4,end:5,text:'Comida boa.'}]);
 assert.equal(parseSubtitles(srt.replace('\r\n\r\n','\r\n\r\n\r\n')).length,2);
 assert.deepEqual(parseSubtitles('WEBVTT\n\nNOTE local\nignore\n\nname\n00:01.200 --> 00:02.500 align:start\n<b>Olá</b> &amp;\nmundo'),[{start:1.2,end:2.5,text:'Olá & mundo'}]);
});
test('rejects malformed, overlapping, empty, huge or out-of-range files atomically',()=>{
 for(const input of ['', 'hello',srt.replace('00:00:04,000','00:00:02,000'),srt.replace('00:00:03,000','00:60:03,000'),srt.replace('00:00:03,000','00:00:00,000'),'x'.repeat(2*1024*1024+1)])assert.throws(()=>parseSubtitles(input));
 const p=fixture(),before=structuredClone(p);assert.throws(()=>importSubtitles(p,srt.replace('00:00:05,000','00:00:15,000')));assert.deepEqual(p,before);
});
test('timeline imports map across trimmed, sped-up and repeated clips; edits, history and source transcript stay independent',()=>{
 let p=fixture();p=editProject(p,{type:'trim',clipId:'c',in:2,out:6});p=editProject(p,{type:'update',clipId:'c',speed:2});p=addClip(p,'v','repeat');p.transcripts=[{assetId:'v',words:[{start:1,end:2,text:'Original'}]}];
 const h=new History(p),q=importSubtitles(p,'1\n00:00:01,000 --> 00:00:03,000\nOlá');h.commit(q);
 assert.deepEqual(q.clips.map(c=>c.captionWords),[[{start:4,end:6,text:'Olá'}],[{start:0,end:1,text:'Olá'}]]);
 assert.deepEqual(captionEntries(q).map(c=>[c.start,c.end]),[[1,2],[2,3]]);assert.deepEqual(q.transcripts,p.transcripts);
 assert.deepEqual(h.undo(),p);assert.deepEqual(h.redo(),q);
 const moved=editProject(q,{type:'move',clipId:'repeat',index:0});assert.equal(captionEntries(moved)[0].start,0);
});
test('narration import preserves original captions and refuses gaps or ambiguous overlap',()=>{
 let p=fixture();p.clips[0].captionWords=[{start:0,end:1,text:'original'}];
 p=addMusic(p,{id:'a',name:'Voz',kind:'audio',duration:10,width:0,height:0,hasAudio:true},{id:'voice',role:'narration',start:1,in:2,out:6,volume:1});p.captionSource='narration';
 const q=importSubtitles(p,'1\n00:00:01,000 --> 00:00:03,000\nVoz');assert.deepEqual(q.music[0].captionWords,[{start:2,end:4,text:'Voz'}]);assert.deepEqual(q.clips,p.clips);
 assert.throws(()=>importSubtitles(p,'1\n00:00:00,000 --> 00:00:03,000\nVoz'),/fora/);
 p=addMusic(p,p.assets.find(a=>a.id==='a'),{id:'voice2',role:'narration',start:2,in:0,out:2,volume:1});assert.throws(()=>importSubtitles(p,'1\n00:00:01,000 --> 00:00:04,000\nVoz'),/sobrepostas/);
});
test('SRT/VTT exports round-trip current montage timing, accents, no fabricated karaoke tokens',()=>{
 const p=importSubtitles(fixture(),srt);assert.deepEqual(parseSubtitles(exportSubtitles(p,'srt')),parseSubtitles(srt));
 const vtt=exportSubtitles(p,'vtt');assert.ok(vtt.startsWith('WEBVTT\n\n'));assert.match(vtt,/00:00:01\.000 --> 00:00:03\.000/);assert.deepEqual(parseSubtitles(vtt),parseSubtitles(srt));
 assert.ok(captionEntries(p).every(c=>!c.tokens));assert.throws(()=>exportSubtitles(p,'exe'));assert.throws(()=>exportSubtitles(fixture()));
 p.clips[0].captionWords[0].text='Melão < manga & chá';assert.equal(parseSubtitles(exportSubtitles(p))[0].text,'Melão < manga & chá');
});

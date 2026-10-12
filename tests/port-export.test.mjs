import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';
import {saveRecording} from '../desktop/recording.mjs';import {run,binaries,probe,renderProject} from '../desktop/media.mjs';import {createProject,addAsset,addClip,addMusic,History} from '../src/project.mjs';import {saveProjectFile,readProjectFile} from '../desktop/storage.mjs';
test('recorded audio normalizes, persists with history, and exports with real timed colored captions',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'corte-port-complete-'));
 try{
 const voice=path.join(dir,'voice.webm'),video=path.join(dir,'video.mp4');
 await run(binaries().ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=700:sample_rate=48000','-t','2','-c:a','libopus',voice]);
 const recording=await saveRecording(new Uint8Array(await readFile(voice)),'audio/webm',path.join(dir,'narrations'));const info=await probe(recording);assert.ok(info.duration>1.9&&info.duration<2.2);
 await run(binaries().ffmpeg,['-v','error','-f','lavfi','-i','color=black:size=320x240:rate=30','-t','3','-c:v','libx264',video]);
 let p=addClip(addAsset(createProject(),{id:'v',name:'v',...await probe(video)}),'v','clip');p=addMusic(p,{id:'n',name:'Narração',...info},{id:'voice',in:0,out:2,start:.5,role:'narration'});
 p.captionSource='narration';p.captionStyle={font:'Arial',size:8,color:'#ffffff',accent:'#ff0000',position:'bottom',positionY:50,width:84,preset:'highlight'};
 p.transcripts=[{assetId:'n',words:[{start:0,end:2,text:'Sua voz',tokens:[{start:0,end:.7,text:'Sua'},{start:1,end:1.7,text:'voz'}]}]}];
 const registry=new Map([['v',{path:video}],['n',{path:recording}]]),file=path.join(dir,'project.corte');await saveProjectFile(file,p,registry,new History(p).serialize());const reopened=await readProjectFile(file);assert.deepEqual(reopened.project,p);
 const out=path.join(dir,'output.mp4');await renderProject(reopened.project,registry,out,{height:720});assert.ok((await probe(out)).duration>=3);
 const sound=await run(binaries().ffmpeg,['-hide_banner','-ss','0.7','-i',out,'-t','0.2','-af','volumedetect','-f','null','-']);assert.match(sound.stderr,/mean_volume: -(?:[12]\d|3\d)\./);
 const raw=path.join(dir,'frame.rgb');await run(binaries().ffmpeg,['-v','error','-ss','0.7','-i',out,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24',raw]);const pixels=await readFile(raw);let red=0;for(let i=0;i<pixels.length;i+=3)if(pixels[i]>120&&pixels[i]>pixels[i+1]*1.5&&pixels[i]>pixels[i+2]*1.5)red++;assert.ok(red>20,'export must contain the active red word');
 p.captionStyle.preset='karaoke';const karaoke=path.join(dir,'karaoke.mp4');await renderProject(p,registry,karaoke,{height:720});const boxFrame=path.join(dir,'box.rgb');await run(binaries().ffmpeg,['-v','error','-ss','0.7','-i',karaoke,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24',boxFrame]);const boxPixels=await readFile(boxFrame);let boxRed=0;for(let i=0;i<boxPixels.length;i+=3)if(boxPixels[i]>120&&boxPixels[i]>boxPixels[i+1]*1.5&&boxPixels[i]>boxPixels[i+2]*1.5)boxRed++;assert.ok(boxRed>red*1.2,'karaoke must export a filled accent box, not just colored glyphs');
 }finally{await rm(dir,{recursive:true,force:true});}
});

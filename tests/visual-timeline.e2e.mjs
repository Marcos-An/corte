import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {createRequire} from 'node:module';import {binaries,run} from '../desktop/media.mjs';
const require=createRequire(import.meta.url),{_electron}=require('playwright'),root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-images-'));let app;
try{
 const video=path.join(dir,'video.mp4'),image=path.join(dir,'logo.png'),saved=path.join(dir,'test.corte');
 await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=blue:size=320x240:rate=15','-t','2','-c:v','libx264',video]);
 await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=red:size=80x40','-frames:v','1',image]);
 app=await _electron.launch({executablePath:require('electron'),args:[root,`--user-data-dir=${dir}/profile`],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#nav-components').waitFor();
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),video);
 await page.locator('#nav-media').click();await page.locator('.timeline-clip').waitFor();await page.locator('#nav-components').click();await page.locator('#zoom').fill('80');await page.locator('#zoom').dispatchEvent('input');

 await page.locator('#add-video-layer').waitFor();
 const before=await page.locator('.history-entry').count();await app.evaluate(({dialog})=>dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]}));await page.locator('#add-video-layer').click();assert.equal(await page.locator('.history-entry').count(),before);
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),image);await page.locator('#add-video-layer').click();assert.equal(await page.locator('.video-layer-block').count(),0,'video picker rejects images');
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),video);await page.locator('#add-video-layer').click();await page.locator('.video-layer-block').waitFor();assert.equal(await page.locator('.timeline-clip').count(),1);

 const block=page.locator('.video-layer-block');assert.equal(await block.getAttribute('aria-pressed'),'true','selected overlay must retain selection independently of captions');
 const drag=async(selector,pixels)=>{await page.locator(selector).scrollIntoViewIfNeeded();const r=await page.locator(selector).boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+pixels,r.y+r.height/2,{steps:5});await page.mouse.up();};
 const box=await block.boundingBox(),zoom=box.width/2;
 await page.locator('.video-layer-block .image-trim.end').waitFor();
 await drag('.video-layer-block .image-trim.end',-zoom);assert.ok(Math.abs(Number(await page.locator('#image-end').inputValue())-1)<.05,JSON.stringify({zoom,box,end:await page.locator('#image-end').inputValue()}));assert.equal(await page.locator('#image-in').inputValue(),'0');
 const entries=await page.locator('.history-entry').count();await drag('.video-layer-block',zoom*.5);assert.ok(Math.abs(Number(await page.locator('#image-start').inputValue())-.5)<.05);assert.ok(Math.abs(Number(await page.locator('#image-end').inputValue())-1.5)<.05);assert.equal(await page.locator('#image-in').inputValue(),'0');assert.equal(await page.locator('.history-entry').count(),entries+1);
 await drag('.video-layer-block .image-trim.start',zoom*.25);assert.ok(Math.abs(Number(await page.locator('#image-start').inputValue())-.75)<.05);assert.ok(Math.abs(Number(await page.locator('#image-in').inputValue())-.25)<.05);await page.locator('#undo').click();assert.ok(Math.abs(Number(await page.locator('#image-start').inputValue())-.5)<.05);assert.equal(await page.locator('#image-in').inputValue(),'0');
 await page.locator('#undo').click();assert.equal(await page.locator('#image-start').inputValue(),'0');await page.locator('#undo').click();assert.equal(await page.locator('#image-end').inputValue(),'2');
 // A cancelled pointer gesture must neither mutate the project nor create history.
 const count=await page.locator('.history-entry').count();await block.scrollIntoViewIfNeeded();const r=await block.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+25,r.y+r.height/2,{steps:3});await block.dispatchEvent('pointercancel');await page.mouse.up();assert.equal(await page.locator('.history-entry').count(),count);assert.equal(await page.locator('#image-start').inputValue(),'0');
 await page.locator('#playhead-time').fill('0');await page.locator('#playhead-time').press('Tab');await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),image);await page.locator('#add-image').click();await page.locator('#image-end').fill('1');await page.locator('#image-end').press('Tab');
 await drag('.image-block:not(.video-layer-block)',zoom*.5);assert.ok(Math.abs(Number(await page.locator('#image-start').inputValue())-.5)<.05);await drag('.image-block:not(.video-layer-block) .image-trim.end',-zoom*.25);assert.ok(Math.abs(Number(await page.locator('#image-end').inputValue())-1.25)<.05);
 assert.deepEqual(errors,[]);console.log('PASS image/video timeline move, trim, source interval mapping, one history entry per gesture, cancel and undo');
}finally{if(app){await app.evaluate(({dialog})=>dialog.showMessageBoxSync=()=>1);await app.close();}await rm(dir,{recursive:true,force:true});}

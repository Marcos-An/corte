import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {createRequire} from 'node:module';import {binaries,run} from '../desktop/media.mjs';
const require=createRequire(import.meta.url),{_electron}=require('playwright'),root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-images-'));let app;
try{
 const video=path.join(dir,'video.mp4'),image=path.join(dir,'logo.png'),saved=path.join(dir,'test.corte');
 await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=blue:size=320x240:rate=15','-t','2','-c:v','libx264',video]);
 await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=red:size=80x40','-frames:v','1',image]);
 app=await _electron.launch({executablePath:require('electron'),args:[root,`--user-data-dir=${dir}/profile`],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#nav-components').waitFor();
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),video);
 await page.locator('#nav-media').click();await page.locator('.timeline-clip').waitFor();await page.locator('#nav-components').click();

 await page.locator('#add-video-layer').waitFor();
 const before=await page.locator('.history-entry').count();await app.evaluate(({dialog})=>dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]}));await page.locator('#add-video-layer').click();assert.equal(await page.locator('.history-entry').count(),before);
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),image);await page.locator('#add-video-layer').click();assert.equal(await page.locator('.video-layer-block').count(),0,'video picker rejects images');
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),video);await page.locator('#add-video-layer').click();await page.locator('.video-layer-block').waitFor();assert.equal(await page.locator('.timeline-clip').count(),1);
 const overlay=page.locator('.image-layer video');await overlay.waitFor();await page.waitForFunction(()=>document.querySelector('.image-layer video').readyState>=2);
 assert.equal(await overlay.evaluate(v=>v.muted),true);assert.equal(await overlay.evaluate(v=>v.currentTime),0);
 await page.locator('#image-start').fill('0.5');await page.locator('#image-start').press('Tab');await page.locator('#image-end').fill('1.5');await page.locator('#image-end').press('Tab');await page.locator('#image-in').fill('0.5');await page.locator('#image-in').press('Tab');
 await page.locator('#playhead-time').fill('1');await page.locator('#playhead-time').press('Tab');await page.waitForFunction(()=>Math.abs(document.querySelector('.image-layer video')?.currentTime-1)<.06);
 await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('.image-layer video')?.currentTime>1.12);assert.equal(await overlay.evaluate(v=>v.paused),false);await page.locator('#play').click();assert.equal(await overlay.evaluate(v=>v.paused),true);
 await page.locator('#playhead-time').fill('1');await page.locator('#playhead-time').press('Tab');
 const box=await page.locator('.image-layer').boundingBox();await page.mouse.move(box.x+box.width*.1,box.y+box.height*.1);await page.mouse.down();await page.mouse.move(box.x+box.width*.1+30,box.y+box.height*.1+15,{steps:4});await page.mouse.up();assert.ok(Number(await page.locator('#image-x').inputValue())>50);await page.locator('#undo').click();assert.equal(await page.locator('#image-x').inputValue(),'50');
 await app.evaluate(({dialog},file)=>dialog.showSaveDialog=async()=>({canceled:false,filePath:file}),saved);await page.locator('#save-project').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Salvo no computador');const data=JSON.parse(await readFile(saved,'utf8'));assert.equal(data.project.videoLayers[0].in,.5);
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),saved);await page.locator('#open-project').evaluate(b=>b.click());await page.waitForFunction(()=>!document.querySelector('#nav-media').disabled);await page.locator('.video-layer-block').waitFor();await page.locator('.video-layer-block').click();assert.equal(await page.locator('#image-in').inputValue(),'0.5');
 await page.locator('#image-in').click();await page.locator('.video-layer-block').click();assert.equal(await page.locator('.video-layer-block').evaluate(b=>b===document.activeElement),true,'timeline click transfers keyboard focus from the properties');await page.keyboard.press('Delete');assert.equal(await page.locator('.video-layer-block').count(),0);assert.equal(await page.locator('.timeline-clip').count(),1);await page.locator('#undo').click();assert.equal(await page.locator('.video-layer-block').count(),1);
 assert.deepEqual(errors,[]);console.log('PASS video overlay direct timeline import, rejection/cancel, source trim sync, muted playback, canvas move, save/reopen, delete/undo');
}finally{if(app){await app.evaluate(({dialog})=>dialog.showMessageBoxSync=()=>1);await app.close();}await rm(dir,{recursive:true,force:true});}

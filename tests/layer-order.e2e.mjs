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


 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),image);await page.locator('#add-image').click();await page.locator('.image-block').waitFor();await page.locator('#image-width').fill('70');await page.locator('#image-width').press('Tab');
 await page.locator('#add-text').click();await page.locator('.scene-text').waitFor();
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),video);await page.locator('#add-video-layer').click();await page.locator('.video-layer-block').waitFor();
 const top=()=>page.locator('.scene-text').last().evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('.scene-text,.image-layer')?.className;});
 assert.match(await top(),/scene-text/,'legacy text is above imported media');
 await page.locator('#layer-front').click();assert.match(await top(),/image-layer/,'video comes in front of text');
 await page.locator('#undo').click();assert.match(await top(),/scene-text/);await page.locator('#redo').click();assert.match(await top(),/image-layer/);
 await page.locator('#image-track .image-block:not(.video-layer-block)').click({position:{x:18,y:8}});await page.locator('#layer-front').click();
 const at=await page.locator('.scene-text').boundingBox();const hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('.image-layer')?.querySelector('img')!==null,{x:at.x+at.width/2,y:at.y+at.height/2});assert.equal(hit,true,'image is above video and text');
 await page.locator('#layer-back').click();assert.match(await top(),/image-layer/);await page.locator('.text-block').click({position:{x:18,y:8}});await page.locator('#layer-front').click();assert.match(await top(),/scene-text/);
 await app.evaluate(({dialog},file)=>dialog.showSaveDialog=async()=>({canceled:false,filePath:file}),saved);await page.locator('#save-project').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Salvo no computador');const data=JSON.parse(await readFile(saved,'utf8'));assert.equal(data.project.layerOrder.at(-1),data.project.textLayers[0].id);
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),saved);await page.locator('#open-project').evaluate(b=>b.click());await page.waitForFunction(()=>!document.querySelector('#nav-media').disabled);await page.locator('.text-block').waitFor();assert.match(await top(),/scene-text/);
 await page.locator('#image-track .image-block:not(.video-layer-block)').click({position:{x:18,y:8}});await page.locator('#layer-front').click();await page.locator('#add-text').click();assert.equal(await page.locator('.text-block').count(),2);assert.match(await top(),/scene-text/);await page.locator('#remove-text').click();assert.match(await top(),/image-layer/);await page.locator('#undo').click();assert.equal(await page.locator('.text-block').count(),2);
 await page.setViewportSize({width:960,height:680});await page.screenshot({path:path.join(root,'validation/layer-order.png')});
 assert.deepEqual(errors,[]);console.log('PASS global layer order, preview hit testing, image/video/text, history, save/reopen, new-layer placement and delete/undo');
}finally{if(app){await app.evaluate(({dialog})=>dialog.showMessageBoxSync=()=>1);await app.close();}await rm(dir,{recursive:true,force:true});}

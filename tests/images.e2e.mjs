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
 assert.equal(await page.locator('#add-image').count(),1,'components offer direct image import');assert.equal(await page.locator('#component-list').count(),0,'used project items are selected from the timeline, not a sidebar bin');
 await page.locator('#add-text').click();
 const history=await page.locator('.history-entry').count();
 await app.evaluate(({dialog})=>dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]}));
 await page.locator('#add-image').click();assert.equal(await page.locator('.history-entry').count(),history);
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),video);
 await page.locator('#add-image').click();assert.equal(await page.locator('.timeline-clip').count(),1,'image importer rejects non-images without changing timeline');assert.equal(await page.locator('.history-entry').count(),history);
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),image);
 await page.locator('#add-image').click();await page.locator('.image-block').waitFor();
 assert.equal(await page.locator('.image-block').count(),1,'import immediately creates timeline item');assert.equal(await page.locator('.timeline-clip').count(),1);
 assert.equal(await page.locator('#text-properties').isVisible(),false,'image selection hides text-specific controls');
 await page.locator('.image-layer img').waitFor();await page.locator('#image-start').fill('.5');await page.locator('#image-start').dispatchEvent('change');
 assert.equal(await page.locator('.image-layer').count(),0);
 await page.locator('#playhead-time').fill('1');await page.locator('#playhead-time').dispatchEvent('change');await page.locator('.image-layer').waitFor();
 await page.locator('#image-width').fill('30');await page.locator('#image-width').dispatchEvent('change');
 const box=await page.locator('.image-layer').boundingBox();await page.mouse.move(box.x+box.width*.1,box.y+box.height*.1);await page.mouse.down();await page.mouse.move(box.x+box.width*.1+35,box.y+box.height*.1+20,{steps:5});await page.mouse.up();
 assert.ok(Number(await page.locator('#image-x').inputValue())>50,'image can move directly in scene');await page.locator('#undo').click();assert.equal(await page.locator('#image-x').inputValue(),'50');
 await page.locator('#clip-crop').click();await page.locator('[data-background="color"]').click();
 assert.equal(await page.locator('#background-color-field').isVisible(),true);
 await page.locator('#clip-background-color').fill('#00ff00');await page.locator('#clip-background-color').dispatchEvent('change');
 await page.waitForFunction(()=>{const c=document.querySelector('#preview-canvas'),p=c.getContext('2d').getImageData(c.width/2,15,1,1).data;return p[1]>200&&p[2]<30;});
 await page.locator('#undo').click();assert.equal(await page.locator('#clip-background-color').inputValue(),'#000000');await page.locator('#redo').click();
 await page.locator('[data-background="blur"]').click();assert.equal(await page.locator('#background-color-field').isVisible(),false);
 await page.waitForFunction(()=>{const c=document.querySelector('#preview-canvas'),b=c.getContext('2d').getImageData(c.width/2,15,1,1).data;return b[2]>50;});
 await page.locator('#undo').click();assert.equal(await page.locator('#clip-background').inputValue(),'color');assert.equal(await page.locator('#clip-background-color').inputValue(),'#00ff00');await page.locator('#redo').click();
 await app.evaluate(({dialog},file)=>dialog.showSaveDialog=async()=>({canceled:false,filePath:file}),saved);await page.locator('#save-project').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Salvo no computador');
 const data=JSON.parse(await readFile(saved,'utf8'));assert.equal(data.project.imageLayers.length,1);assert.equal(data.project.clips[0].background,'blur');
 // Legacy projects may explicitly mark video kind; re-opening must not mark that file missing.
 for(const state of [data.project,...data.history.entries.map(e=>e.state)])for(const a of state.assets)if(a.name==='video.mp4')a.kind='video';
 await writeFile(saved,JSON.stringify(data));
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),saved);await page.locator('#open-project').evaluate(b=>b.click());await page.waitForFunction(()=>!document.querySelector('#nav-media').disabled);await page.locator('.image-block').waitFor();
 await page.waitForFunction(()=>document.querySelector('#source-video').readyState>=2,null,{timeout:3000});
 await page.locator('#image-track .image-block').click();assert.equal(await page.locator('#image-properties').isVisible(),true);
 await page.setViewportSize({width:1100,height:760});await page.screenshot({path:path.join(root,'validation/image-component.png')});
 await page.locator('#image-track .image-block').press('Delete');assert.equal(await page.locator('.timeline-clip').count(),1,'deleting selected image must not delete the main video');assert.equal(await page.locator('.image-block').count(),0);await page.locator('#undo').click();assert.equal(await page.locator('.image-block').count(),1);
 // Overlapping image imports each remain selectable in their own timeline lane.
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),image);await page.locator('#add-image').click();await page.waitForFunction(()=>document.querySelectorAll('.image-block').length===2);
 const lanes=await page.locator('.image-block').evaluateAll(nodes=>nodes.map(n=>n.style.getPropertyValue('--lane')));assert.equal(new Set(lanes).size,2);
 await page.locator('#undo').click();
 // Generic Add still has no bin: a standalone photograph becomes a primary timeline clip.
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),image);await page.locator('#nav-media').click();await page.waitForFunction(()=>document.querySelectorAll('.timeline-clip').length===2);
 await page.locator('#playhead-time').fill('3');await page.locator('#playhead-time').dispatchEvent('change');
 await page.waitForFunction(()=>{const c=document.querySelector('#preview-canvas'),b=c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data;return b[0]>150&&b[2]<50;});
 assert.deepEqual(errors,[]);console.log('PASS direct image import, timeline, drag, timing, background, cancel, save/open, undo, primary still image');
}finally{if(app){await app.evaluate(({dialog})=>dialog.showMessageBoxSync=()=>1);await app.close();}await rm(dir,{recursive:true,force:true});}

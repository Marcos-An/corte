import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,rm,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {binaries,run} from '../desktop/media.mjs';
const require=createRequire(import.meta.url),{_electron}=require('playwright');
const root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-preview-import-'));let app;
try{
 const file=path.join(dir,'video.mp4');
 await run(binaries().ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=blue:s=320x240:r=15','-t','1','-c:v','libx264','-pix_fmt','yuv420p',file]);
 app=await _electron.launch({executablePath:require('electron'),args:[root,`--user-data-dir=${path.join(dir,'profile')}`],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('#playhead-time').waitFor();
 assert.equal(await page.locator('#playhead-time').inputValue(),'0','initial position has no unnecessary decimals');
 assert.equal(await page.locator('#playhead-time').getAttribute('aria-label'),'Posição da reprodução em segundos');
 assert.equal(await page.locator('#zoom').inputValue(),await page.locator('#zoom').getAttribute('min'),'initial zoom is minimum');
 assert.match(await page.locator('label').filter({has:page.locator('#zoom')}).innerText(),/Zoom da timeline/);
 const projectFile=path.join(dir,'montagem.corte');
 await app.evaluate(({dialog})=>{dialog.previewCalls=0;dialog.showOpenDialog=async()=>{dialog.previewCalls++;return {canceled:true,filePaths:[]};};});
 for(const id of ['preview-add','empty-video','nav-media']){
  const before=await app.evaluate(({dialog})=>dialog.previewCalls);
  await page.locator('#'+id).click();await page.waitForFunction(()=>!document.querySelector('#nav-media').disabled);
  assert.equal(await app.evaluate(({dialog})=>dialog.previewCalls),before+1,id+' opens picker directly');
  assert.equal(await page.locator('.timeline-clip').count(),0);assert.equal(await page.locator('.library').isVisible(),false);
 }
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file,file]});},file);
 await page.locator('#nav-media').click();await page.waitForFunction(()=>document.querySelectorAll('.timeline-clip').length===2);
 assert.equal(await page.locator('.library').isVisible(),false);assert.equal(await page.locator('#media-grid').count(),0);
 await page.locator('#nav-audio').click();assert.equal(await page.locator('#music-panel').isVisible(),true);await page.locator('#context-close').click();
 await app.evaluate(({dialog},file)=>dialog.showSaveDialog=async()=>({canceled:false,filePath:file}),projectFile);
 await page.locator('#save-project').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('Salvo'));
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),projectFile);
 await page.keyboard.press(process.platform==='darwin'?'Meta+O':'Control+O');await page.waitForFunction(()=>!document.querySelector('#open-project').disabled);
 assert.equal(await page.locator('.timeline-clip').count(),2);await page.waitForFunction(()=>document.querySelector('#source-video').readyState>=2);
 const moved=path.join(dir,'relocated.mp4');await rename(file,moved);
 await page.keyboard.press(process.platform==='darwin'?'Meta+O':'Control+O');await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('ausentes'));
 await page.locator('#zoom').fill('50');await page.locator('#zoom').dispatchEvent('input');
 await page.locator('.timeline-clip').first().click({button:'right'});
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),moved);
 await page.getByRole('menuitem',{name:'Localizar mídia ausente'}).click();await page.waitForFunction(()=>document.querySelector('#source-video').readyState>=2);
 assert.deepEqual(errors,[]);
 console.log('PASS direct import: all three entry points, cancel, multiple clips, no media library, music picker, save/reopen and decoded video.');
}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await rm(dir,{recursive:true,force:true});}

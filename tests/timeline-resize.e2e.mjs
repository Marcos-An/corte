import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
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
 await app.evaluate(({dialog})=>{dialog.previewCalls=0;dialog.showOpenDialog=async()=>{dialog.previewCalls++;return {canceled:true,filePaths:[]};};});
 await page.locator('#preview-add').click();
 await page.waitForFunction(()=>!document.querySelector('#nav-media').disabled);
 assert.equal(await app.evaluate(({dialog})=>dialog.previewCalls),1,'preview button must open file picker directly');
 assert.equal(await page.locator('.timeline-clip').count(),0);
 assert.equal(await page.locator('#preview-empty').isVisible(),true);
 assert.equal(await page.locator('#undo').isEnabled(),false,'cancel must not create an edit');
 // A later import still goes straight to the picker.
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>{dialog.previewCalls++;return {canceled:false,filePaths:[file]};};},file);
 await page.locator('#preview-add').click();
 await page.locator('.timeline-clip').waitFor();
 await page.waitForFunction(()=>document.querySelector('#source-video').readyState>=2);
 assert.equal(await app.evaluate(({dialog})=>dialog.previewCalls),2);
 assert.equal(await page.locator('#preview-empty').isVisible(),false);
 assert.equal(await page.locator('.timeline-clip').count(),1);
 await page.locator('#playhead-time').fill('0.5');await page.locator('#playhead-time').press('Tab');
 await page.waitForFunction(()=>Math.abs(document.querySelector('#source-video').currentTime-.5)<.05);
 await page.locator('#zoom').fill('40');await page.locator('#zoom').dispatchEvent('input');
 const width=(await page.locator('.timeline-clip').boundingBox()).width;
 await page.locator('#zoom').fill('80');await page.locator('#zoom').dispatchEvent('input');
 assert.ok((await page.locator('.timeline-clip').boundingBox()).width>width,'zoom expands the clip without changing playback position');
 assert.equal(Number(await page.locator('#playhead-time').inputValue()),.5);
 await page.locator('#go-start').click();await page.locator('#preview-canvas').click();
 assert.equal(await page.locator('#playhead-time').inputValue(),'0');

 const divider=page.getByRole('separator',{name:'Redimensionar timeline'});
 const height=()=>page.locator('.timeline').evaluate(e=>e.getBoundingClientRect().height);
 const drag=async delta=>{const r=await divider.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2,r.y+r.height/2+delta,{steps:8});await page.mouse.up();};
 for(const size of [{width:1440,height:960},{width:1100,height:760}]){
  await page.setViewportSize(size);await divider.waitFor({timeout:3000});
  const maximum=size.height>800?296:248;
  await drag(-1500);assert.ok(Math.abs(await height()-maximum)<2,'upward drag stops at original height');
  await drag(60);assert.ok(Math.abs(await height()-(maximum-60))<3,'timeline can shrink');
  await drag(-1500);assert.ok(Math.abs(await height()-maximum)<2,'expansion returns only to original height');
  await divider.focus();await page.keyboard.press('End');assert.ok(Math.abs(await height()-maximum)<2,'keyboard respects original maximum');
  await drag(1500);assert.ok(await height()>=159);assert.ok(await page.locator('#nav-captions').isVisible());
  await divider.focus();const small=await height();await page.keyboard.press('ArrowUp');assert.ok(await height()>small);
  assert.equal(await page.locator('.timeline-clip').count(),1);assert.equal(Number(await page.locator('#playhead-time').inputValue()),0);assert.equal(await page.locator('#zoom').inputValue(),'80');
 }
 await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#playhead-time').value)>.1);await page.locator('#play').click();
 assert.deepEqual(errors,[]);
 console.log('PASS timeline resize: pointer, keyboard, limits, two sizes, unchanged clips/zoom/position and playback.');
}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await rm(dir,{recursive:true,force:true});}

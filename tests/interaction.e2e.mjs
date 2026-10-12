import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { binaries, run, probe } from '../desktop/media.mjs';
const require=createRequire(import.meta.url);
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dir=await mkdtemp(path.join(tmpdir(),'corte-e2e-'));
const root=path.resolve(import.meta.dirname,'..');
await run(binaries().ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',path.join(dir,'source.mp4')]);
let app;
try {
 app=await electron.launch({executablePath:process.env.CORTE_TEST_APP||require('electron'),args:[...(process.env.CORTE_TEST_APP?[]:[root]),`--user-data-dir=${path.join(dir,'appdata')}`],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
 const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1200,height:800}));await page.setViewportSize({width:1200,height:800});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},path.join(dir,'source.mp4'));
 await page.locator('#nav-media').click();
 await page.locator('.timeline-clip').first().waitFor();
 // These drag distances represent seconds at 50 px/s, independent of the initial zoom.
 await page.locator('#zoom').fill('50');await page.locator('#zoom').dispatchEvent('input');
 page.setDefaultTimeout(3000);const failures=[];
 const check=async(name,fn)=>{try{await fn();console.log('PASS',name);}catch(e){failures.push(name+': '+e.message);console.log('FAIL',name);}};

 await check('simple video blocks have no duration handles',async()=>{assert.equal(await page.locator('.trim-handle').count(),0);});
 await check('secondary B command still splits at cursor',async()=>{await page.locator('#playhead-time').fill('1');await page.locator('#playhead-time').dispatchEvent('change');await page.locator('.timeline-clip').first().focus();await page.keyboard.press('b');assert.equal(await page.locator('.timeline-clip').count(),2);await page.getByRole('button',{name:'Desfazer',exact:true}).click();});
 await check('body moves whole range and red preview skips without editing',async()=>{
  await page.locator('#playhead-time').fill('0');await page.locator('#playhead-time').dispatchEvent('change');await page.getByRole('button',{name:'Recortar',exact:true}).click();assert.match(await page.locator('#range-info').textContent(),/0.00.*4.00/);
  let handle=await page.locator('.range-handle.right').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+25);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2-150,handle.y+25);await page.mouse.up();
  const area=await page.locator('.range-overlay').boundingBox();await page.mouse.move(area.x+area.width/2,area.y+40);await page.mouse.down();await page.mouse.move(area.x+area.width/2+50,area.y+40,{steps:4});await page.mouse.up();assert.match(await page.locator('#range-info').textContent(),/1.00.*2.00/);
  assert.equal(await page.locator('.range-overlay.removal').count(),1);await page.getByRole('button',{name:'Prévia sem o trecho',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('#playhead-time').value)>=2.1);assert.equal(await page.locator('.timeline-clip').count(),1);
  await page.keyboard.press('Escape');assert.equal(await page.locator('.range-overlay').isVisible(),false);assert.equal(await page.locator('.timeline-clip').count(),1);
 });

 await check('context menus delete correct video and mute linked audio with undo',async()=>{
  await page.locator('#go-start').click();
  await page.locator('.timeline-clip').first().click({button:'right'});
  await page.getByRole('menuitem',{name:'Remover trecho'}).click();assert.equal(await page.locator('.timeline-clip').count(),0);
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();await page.locator('.timeline-clip').waitFor();
  await page.locator('.audio-block').first().click({button:'right'});
  await page.getByRole('menuitem',{name:'Silenciar áudio do trecho'}).click();assert.equal(await page.locator('.timeline-clip').count(),1);assert.equal(await page.locator('#volume').inputValue(),'0');
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();assert.equal(await page.locator('#volume').inputValue(),'100');
 });

 await check('seek preserves decoded frame while waiting',async()=>{
  await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
  await page.evaluate(()=>{document.querySelector('#playhead-time').value='1';document.querySelector('#playhead-time').dispatchEvent(new Event('change'));});
  await page.waitForFunction(()=>!document.querySelector('video').seeking);
  const result=await page.evaluate(()=>{
   const canvas=document.querySelector('#preview-canvas'),ctx=canvas.getContext('2d');
   const before=canvas.toDataURL();document.querySelector('#playhead-time').value='3';document.querySelector('#playhead-time').dispatchEvent(new Event('change'));
   return {before,after:canvas.toDataURL()};
  });assert.ok(result.after===result.before,'keep last frame until next is decoded');
  await page.waitForFunction(()=>!document.querySelector('video').seeking&&Math.abs(document.querySelector('video').currentTime-3)<.05);
 });
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
 await page.evaluate(()=>window.editor.setDirty(false));
} finally {if(app){await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;});await app.close();}await rm(dir,{recursive:true,force:true});}

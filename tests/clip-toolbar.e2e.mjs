import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {binaries,run} from '../desktop/media.mjs';
const require=createRequire(import.meta.url),{_electron}=require('playwright'),root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-clip-toolbar-'));let app;
try{
 const file=path.join(dir,'video.mp4');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=blue:size=320x240:rate=15','-t','2','-c:v','libx264',file]);
 app=await _electron.launch({executablePath:require('electron'),args:[root,`--user-data-dir=${dir}/profile`],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#nav-components').waitFor();
 for(const id of ['clip-split','clip-crop','clip-volume','clip-delete']){
  assert.equal(await page.locator(`.timeline-toolbar #${id}`).count(),1,'clip actions belong alongside Recortar');
  assert.equal(await page.locator('#'+id).isDisabled(),true,'no clip disables the action');
 }
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),file);
 await page.locator('#nav-media').click();await page.locator('.timeline-clip').waitFor();
 for(const position of ['left','bottom']){
  await page.locator('#settings').click();await page.locator('#menu-position').selectOption(position);await page.locator('#settings-close').click();
  await page.locator('#clip-crop').click();assert.equal(await page.locator('#video-properties').isVisible(),true);
  await page.locator('#clip-volume').click();assert.equal(await page.locator('#audio-properties').isVisible(),true);
  await page.locator('#playhead-time').fill('1');await page.locator('#playhead-time').dispatchEvent('change');await page.locator('#clip-split').click();
  assert.equal(await page.locator('.timeline-clip').count(),2);
  await page.locator('#clip-delete').click();assert.equal(await page.locator('.timeline-clip').count(),1);
  await page.locator('#undo').click();await page.locator('#undo').click();assert.equal(await page.locator('.timeline-clip').count(),1);
  await page.setViewportSize({width:960,height:680});await page.screenshot({path:path.join(root,`validation/clip-toolbar-${position}.png`)});
 }
 await page.locator('#clip-delete').click();assert.equal(await page.locator('.timeline-clip').count(),0);
 for(const id of ['clip-split','clip-crop','clip-volume','clip-delete'])assert.equal(await page.locator('#'+id).isDisabled(),true);
 assert.deepEqual(errors,[]);console.log('PASS toolbar actions, split/delete/undo, crop/volume, both menus, no-clip blocking');
}finally{if(app){await app.evaluate(({dialog})=>dialog.showMessageBoxSync=()=>1);await app.close();}await rm(dir,{recursive:true,force:true});}

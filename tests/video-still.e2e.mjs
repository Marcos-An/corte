import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
import {run,binaries,probe} from '../desktop/media.mjs';import {saveProjectFile} from '../desktop/storage.mjs';import * as m from '../src/project.mjs';
const require=createRequire(import.meta.url),{_electron}=require('playwright'),root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-still-ui-'));let app;
try{
 const video=path.join(dir,'source.mp4'),saved=path.join(dir,'still.corte');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','testsrc2=s=160x160:r=30','-t','3','-c:v','libx264',video]);
 let p=m.addClip(m.addAsset(m.createProject(),{id:'v',name:'source',...await probe(video)}),'v','c');p=m.addVideoLayer(p,{id:'poster',assetId:'v',in:.5,start:0,end:3,freeze:true,x:50,y:50,width:70,rotation:0,opacity:100});await saveProjectFile(saved,p,new Map([['v',{path:video}]]));
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='ELECTRON_RUN_AS_NODE'));app=await _electron.launch({executablePath:process.env.CORTE_TEST_APP||require('electron'),args:[...(process.env.CORTE_TEST_APP?[]:[root]),`--user-data-dir=${dir}/profile`],env});const page=await app.firstWindow();page.setDefaultTimeout(10000);await page.locator('.history-entry').first().waitFor({state:'attached'});await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),saved);await app.evaluate(({Menu})=>Menu.getApplicationMenu().getMenuItemById('open-project').click());await page.locator('.video-layer-block').waitFor();await page.locator('.video-layer-block').click();
 assert.equal(await page.locator('#image-freeze').isChecked(),true);await page.waitForFunction(()=>{const v=document.querySelector('.image-layer video');return v&&Math.abs(v.currentTime-.5)<.05&&v.paused;});await page.locator('#image-freeze').click();assert.equal(await page.locator('#image-freeze').isChecked(),true,'cannot unfreeze past the source end');await page.locator('#image-in').fill('0');await page.locator('#image-in').press('Tab');await page.locator('#image-freeze').uncheck();assert.equal(await page.locator('#image-freeze').isChecked(),false);
 console.log('PASS packaged frozen overlay preview, editable checkbox and source bounds');
}catch(e){console.error(e);throw e;}finally{if(app){await app.evaluate(({dialog})=>dialog.showMessageBoxSync=()=>1);await app.close();}await rm(dir,{recursive:true,force:true});}




import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';import {binaries,run,probe} from '../desktop/media.mjs';import {saveProjectFile} from '../desktop/storage.mjs';import {createProject,addAsset,addClip} from '../src/project.mjs';
const require=createRequire(import.meta.url),{_electron}=require('playwright'),root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-freeze-e2e-'));let app;
try{
 const source=path.join(dir,'source.mp4'),file=path.join(dir,'project.corte');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','testsrc2=s=320x240:r=30','-f','lavfi','-i','sine=f=440','-t','3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',source]);
 const p=addClip(addAsset(createProject(),{id:'a',name:'Video',...await probe(source)}),'a','c1');p.aspect='16:9';await saveProjectFile(file,p,new Map([['a',{path:source}]]));
 app=await _electron.launch({executablePath:process.env.CORTE_TEST_APP||require('electron'),args:[...(process.env.CORTE_TEST_APP?[]:[root]),`--user-data-dir=${dir}/profile`],env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='ELECTRON_RUN_AS_NODE'))});const page=await app.firstWindow();page.setDefaultTimeout(10000);await page.locator('#preview-add').waitFor();
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),file);await app.evaluate(({Menu})=>Menu.getApplicationMenu().getMenuItemById('open-project').click());await page.locator('.timeline-clip').first().waitFor();
 const box=await page.locator('.timeline-clip').first().boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await page.locator('#play').click();await page.waitForFunction(()=>/00:0[12]/.test(document.querySelector('#current-time').textContent));await page.locator('#play').click();
 await page.locator('#freeze-frame').click();await page.waitForFunction(()=>document.querySelectorAll('.timeline-clip').length===3);
 assert.match(await page.locator('.history-entry').last().textContent(),/Congelar quadro/);
 const total=await page.locator('#total-time').textContent();assert.match(total,/00:05/,'3 s of video plus a 2 s still');
 await page.mouse.click(box.x+2,box.y+box.height/2);await page.locator('#play').click();
 await page.waitForFunction(()=>/00:04/.test(document.querySelector('#current-time').textContent),null,{timeout:12000});
 console.log('PASS freeze frame: toolbar action, three pieces, longer montage, playback runs through the still');
}finally{if(app){await app.evaluate(({dialog})=>dialog.showMessageBoxSync=()=>1);await app.close();}await rm(dir,{recursive:true,force:true});}

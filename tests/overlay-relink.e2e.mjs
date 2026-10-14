import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,rm,rename,readFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {binaries,run,probe} from '../desktop/media.mjs';
import {saveProjectFile} from '../desktop/storage.mjs';
import * as m from '../src/project.mjs';
const require=createRequire(import.meta.url),{_electron}=require('playwright'),root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-relink-'));let app;
try {
 const base=path.join(dir,'base.mp4'),video=path.join(dir,'overlay.mp4'),image=path.join(dir,'logo.png'),saved=path.join(dir,'project.corte'),after=path.join(dir,'after.corte');
 await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=blue:s=320x320:r=30','-t','4','-c:v','libx264',base]);
 await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=green:s=160x160:r=30','-t','4','-c:v','libx264',video]);
 await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=red:s=80x40','-frames:v','1',image]);
 let p=m.addClip(m.addAsset(m.createProject('Relink'),{id:'base',name:'base',...await probe(base)}),'base','c');p.aspect='1:1';
 p=m.addAsset(p,{id:'video',name:'overlay',...await probe(video)});p=m.addAsset(p,{id:'image',name:'logo',...await probe(image)});
 const pose={start:0,end:4,x:50,y:50,width:20,opacity:100,rotation:0};p=m.addImageLayer(p,{...pose,id:'i',assetId:'image'});p=m.addVideoLayer(p,{...pose,id:'v',assetId:'video',in:0});
 for(const id of ['i','v']) {p=m.setKeyframe(p,id,0,{x:20,y:30,size:20,opacity:40});p=m.setKeyframe(p,id,4,{x:80,y:70,size:40,opacity:100});}
 await saveProjectFile(saved,p,new Map([['base',{path:base}],['video',{path:video}],['image',{path:image}]]));
 const movedImage=path.join(dir,'moved.png'),movedVideo=path.join(dir,'moved.mp4');await rename(image,movedImage);await rename(video,movedVideo);
 app=await _electron.launch({executablePath:require('electron'),args:[root,`--user-data-dir=${dir}/profile`],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#nav-media').waitFor();
 const picker=async file=>app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:!file,filePaths:file?[file]:[]}),file);
 await picker(saved);await app.evaluate(({Menu})=>Menu.getApplicationMenu().getMenuItemById('open-project').click());await page.locator('.video-layer-block').waitFor();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('ausentes'));
 const count=await page.locator('.history-entry').count();await picker(null);await page.locator('[data-image-id="i"]').click({button:'right'});assert.equal(await page.locator('.history-entry').count(),count);
 await picker(base);await page.locator('[data-image-id="i"]').click({button:'right'});await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('diferente'));assert.equal(await page.locator('.history-entry').count(),count);
 await picker(movedImage);await page.locator('[data-image-id="i"]').click({button:'right'});await page.waitForFunction(()=>document.querySelector('#busy-message').hidden);await picker(movedVideo);await page.locator('.video-layer-block').click({button:'right'});
 await page.locator('#playhead-time').fill('2');await page.locator('#playhead-time').press('Tab');await page.waitForFunction(()=>{const v=document.querySelector('.image-layer video');return v?.readyState>=2&&Math.abs(v.currentTime-2)<.06;});
 const entries=await page.locator('.image-layer').evaluateAll(ns=>ns.map(n=>({x:parseFloat(n.style.left),y:parseFloat(n.style.top),size:parseFloat(n.style.width),alpha:Number(n.style.opacity)})));
 assert.equal(entries.length,2);for(const e of entries)assert.deepEqual(e,{x:50,y:50,size:30,alpha:.7});assert.equal(await page.locator('.image-layer video').evaluate(v=>v.muted),true);
 await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('.image-layer video').currentTime>2.2);await page.locator('#play').click();assert.equal(await page.locator('.history-entry').count(),count,'relink never changes animation/history');
 await app.evaluate(({dialog},file)=>dialog.showSaveDialog=async()=>({canceled:false,filePath:file}),after);await page.locator('#save-options summary').click();await page.locator('#save-as-project').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Salvo no computador');const stored=JSON.parse(await readFile(after,'utf8'));assert.deepEqual(stored.project,p);assert.equal(stored.sources.find(s=>s.assetId==='image').path,await realpath(movedImage));assert.equal(stored.sources.find(s=>s.assetId==='video').path,await realpath(movedVideo));
 assert.deepEqual(errors,[]);console.log('PASS animated image/video missing-media cancel, incompatible rejection, real relink, poses, muted playback and persisted references');
} finally {if(app){await app.evaluate(({dialog})=>dialog.showMessageBoxSync=()=>1);await app.close();}await rm(dir,{recursive:true,force:true});}

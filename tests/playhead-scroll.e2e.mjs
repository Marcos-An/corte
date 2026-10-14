import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {createRequire} from 'node:module';
import {binaries,run,probe} from '../desktop/media.mjs';import {saveProjectFile} from '../desktop/storage.mjs';import {createProject,addAsset,addClip} from '../src/project.mjs';
const require=createRequire(import.meta.url),{_electron}=require('playwright'),root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-edge-scroll-'));let app;
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='ELECTRON_RUN_AS_NODE'));
try{
 const source=path.join(dir,'source.mp4'),file=path.join(dir,'long.corte');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=blue:s=160x160:r=10','-t','4','-c:v','libx264',source]);let p=addAsset(createProject(),{id:'a',name:'source',...await probe(source)});for(let i=0;i<30;i++)p=addClip(p,'a','c'+i);await saveProjectFile(file,p,new Map([['a',{path:source}]]));
 app=await _electron.launch({executablePath:process.env.CORTE_TEST_APP||require('electron'),args:[...(process.env.CORTE_TEST_APP?[]:[root]),`--user-data-dir=${dir}/profile`,file],env});const page=await app.firstWindow();page.setDefaultTimeout(6000);await page.waitForFunction(()=>document.querySelectorAll('.timeline-clip').length===30);await page.locator('#zoom').fill('40');await page.locator('#zoom').dispatchEvent('input');
 // Hidden transition buttons must not intercept clicks on the sticky track labels.
 await page.evaluate(()=>document.querySelector('#timeline-scroll').scrollLeft=180);
 const junction=await page.locator('.transition-junction').first().boundingBox();
 await page.mouse.click(junction.x+junction.width/2,junction.y+junction.height/2);
 assert.equal(await page.locator('#transition-dialog').evaluate(e=>e.open),false,'transition behind track labels must not open');

 await page.evaluate(()=>document.querySelector('#timeline-scroll').scrollLeft=0);
 await page.locator('.transition-junction').nth(1).click();
 assert.equal(await page.locator('#transition-dialog').evaluate(e=>e.open),true,'visible transition remains editable');
 await page.locator('#transition-close').click();
 // The needle must remain draggable where its line crosses a transition.
 await page.locator('#playhead-time').fill('4');await page.locator('#playhead-time').dispatchEvent('change');
 const cut=await page.locator('.transition-junction').first().boundingBox();
 const needleAtCut=await page.locator('#playhead').boundingBox();
 const edge=await page.locator('#timeline-scroll').boundingBox();
 await page.mouse.move(needleAtCut.x+needleAtCut.width/2,cut.y+cut.height/2);await page.mouse.down();
 await page.mouse.move(edge.x+edge.width-5,cut.y+cut.height/2);
 await page.waitForFunction(()=>document.querySelector('#timeline-scroll').scrollLeft>100);
 await page.mouse.up();await page.evaluate(()=>document.querySelector('#timeline-scroll').scrollLeft=0);
 // Grab the centre of the visible needle, not the ruler beside its tip.
 await page.locator('#playhead-time').fill('8');await page.locator('#playhead-time').dispatchEvent('change');
 const head=await page.locator('#playhead').boundingBox();
 await page.mouse.move(head.x+head.width/2,head.y+6);await page.mouse.down();
 const viewport=await page.locator('#timeline-scroll').boundingBox();
 await page.mouse.move(viewport.x+viewport.width-5,head.y+6);
 await page.waitForFunction(()=>document.querySelector('#timeline-scroll').scrollLeft>100);
 await page.waitForFunction(initial=>document.querySelector('#timeline-scroll').scrollLeft>initial+80,await page.evaluate(()=>document.querySelector('#timeline-scroll').scrollLeft));
 await page.mouse.up();await page.evaluate(()=>document.querySelector('#timeline-scroll').scrollLeft=0);
 const sidebar=await page.locator('.track-sidebar').boundingBox();
 const rect=await page.locator('#timeline-scroll').boundingBox(),ruler=await page.locator('#ruler').boundingBox(),left=rect.x+sidebar.width+3,right=rect.x+rect.width-5,center=(left+right)/2,y=ruler.y+15;
 const state=()=>page.evaluate(()=>({scroll:document.querySelector('#timeline-scroll').scrollLeft,time:Number(document.querySelector('#playhead').getAttribute('aria-valuenow'))}));
 const frames=()=>page.evaluate(async()=>{for(let i=0;i<8;i++)await new Promise(requestAnimationFrame);});
 await page.mouse.move(center,y);await page.mouse.down();await frames();assert.equal((await state()).scroll,0,'center drag does not scroll');
 await page.mouse.move(right,y);await page.waitForFunction(()=>document.querySelector('#timeline-scroll').scrollLeft>100);const first=await state();await page.waitForFunction(initial=>document.querySelector('#timeline-scroll').scrollLeft>initial+80,first.scroll);assert.ok((await state()).time>first.time,'stationary edge advances needle with scroll');await page.mouse.up();const released=await state();await frames();assert.deepEqual(await state(),released,'release stops scrolling and seeking');
 await page.mouse.move(center,y);await page.mouse.down();await page.mouse.move(left,y);await page.waitForFunction(s=>document.querySelector('#timeline-scroll').scrollLeft<s-30,released.scroll);await page.waitForFunction(()=>document.querySelector('#timeline-scroll').scrollLeft===0);await frames();assert.ok((await state()).time>=0);await page.mouse.up();
 const max=await page.evaluate(()=>{const s=document.querySelector('#timeline-scroll');s.scrollLeft=s.scrollWidth-s.clientWidth-50;return s.scrollWidth-s.clientWidth;});const beforeCancel=await state();await page.mouse.move(center,y);await page.mouse.down();await page.mouse.move(right,y);await page.waitForFunction(max=>document.querySelector('#timeline-scroll').scrollLeft===max,max);assert.ok((await state()).time<=120);await page.evaluate(()=>{const target=['playhead','ruler'].map(id=>document.getElementById(id)).find(e=>e.hasPointerCapture(1));target.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true}));});const cancelled=await state();assert.deepEqual(cancelled,beforeCancel,'cancel restores original cursor and scroll');await frames();assert.deepEqual(await state(),cancelled,'cancel ends animation');await page.mouse.up();
 await page.evaluate(()=>document.querySelector('#timeline-scroll').scrollLeft=500);await page.locator('#playhead-time').fill('20');await page.locator('#playhead-time').dispatchEvent('change');const needle=await page.locator('#playhead').boundingBox();await page.mouse.move(needle.x+.5,needle.y+5);await page.mouse.down();await page.mouse.move(right,y);await page.waitForFunction(()=>document.querySelector('#timeline-scroll').scrollLeft>530);await page.evaluate(()=>{const target=['playhead','ruler'].map(id=>document.getElementById(id)).find(e=>e.hasPointerCapture(1));target.releasePointerCapture(1);});await page.mouse.move(center,y);await frames();const lost=await state();await frames();assert.deepEqual(await state(),lost,'loss of pointer capture stops scrolling');await page.mouse.up();assert.equal(await page.locator('.history-entry').count(),1,'scrubbing must not edit the project');
 console.log('PASS timeline: needle over transitions, head drag, sticky labels, stationary/right/left, release/cancel/capture and limits');
}finally{if(app){await app.evaluate(({dialog})=>dialog.showMessageBoxSync=()=>1);await app.close();}await rm(dir,{recursive:true,force:true});}

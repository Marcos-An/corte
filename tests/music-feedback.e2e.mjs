import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{_electron:electron}=require('playwright');
const dir=await mkdtemp(path.join(tmpdir(),'corte-feedback-'));let app;
try{
 app=await electron.launch({executablePath:process.env.CORTE_EXECUTABLE||require('electron'),args:[...(process.env.CORTE_EXECUTABLE?[]:[path.resolve(import.meta.dirname,'..')]),`--user-data-dir=${dir}`],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
 const page=await app.firstWindow();await page.locator('#nav-audio').click();const frame=page.frames().find(f=>f.url().endsWith('/music.html'));
 // Exercise parent commit boundary without waiting for a remote download.
 await frame.evaluate(()=>{const f=window;f.results=[];f.addEventListener('message',e=>{if(e.data?.type==='corte-music-added')f.results.push(e.data)});f.parent.postMessage({type:'corte-music-add',ticket:1,asset:{id:'feedback',name:'Test audio',kind:'audio',duration:60,width:0,height:0,hasAudio:true},in:0,out:30},'*')});
 await page.locator('.music-block').waitFor();
 assert.equal(await page.locator('.music-block').getAttribute('aria-pressed'),'true');
 assert.ok(await page.locator('.music-block').evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('.timeline-scroll').getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom}),'Music must be inside the visible timeline');
 await page.waitForFunction(()=>document.querySelector('#music-frame').contentWindow.results.length===1);
 assert.equal(await page.evaluate(()=>document.querySelector('#music-frame').contentWindow.results[0].ok),true);
 await frame.evaluate(()=>parent.postMessage({type:'corte-music-add',ticket:2,asset:{id:'bad',name:'Invalid',duration:0},in:0,out:30},'*'));
 await page.waitForFunction(()=>document.querySelector('#music-frame').contentWindow.results.length===2);
 assert.equal(await page.evaluate(()=>document.querySelector('#music-frame').contentWindow.results[1].ok),false);
 assert.equal(await page.locator('.music-block').count(),1);
 console.log('PASS commit acknowledgment, selection, viewport reveal and failed commit');
}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{})};await rm(dir,{recursive:true,force:true})}

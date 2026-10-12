import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {binaries,run} from '../desktop/media.mjs';
const require=createRequire(import.meta.url),{_electron}=require('playwright');
const root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-menu-position-'));let app;
const errors=[];
async function launch(){
 app=await _electron.launch({executablePath:require('electron'),args:[root,`--user-data-dir=${dir}/profile`],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.locator('#nav-components').waitFor();return page;
}
async function close(){await app.evaluate(({dialog})=>dialog.showMessageBoxSync=()=>1);await app.close();app=null;}
try{
 const file=path.join(dir,'video.mp4');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=blue:size=320x240:rate=15','-t','2','-c:v','libx264',file]);
 let page=await launch();await page.locator('#settings').click();
 assert.equal(await page.getByLabel('Posição do menu',{exact:true}).count(),1,'settings offer a menu position preference');
 const setting=page.getByLabel('Posição do menu',{exact:true});assert.equal(await setting.inputValue(),'left');
 await page.locator('#settings-close').click();
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),file);
 await page.locator('#nav-media').click();await page.locator('.timeline-clip').waitFor();
 await page.locator('#nav-components').click();await page.locator('#add-text').click();
 const state=await page.locator('.history-entry').count();
 for(const position of ['left','bottom','left']){
  await page.locator('#settings').click();await setting.selectOption(position);await page.locator('#settings-close').click();
  assert.equal(await page.locator('body').getAttribute('data-menu-position'),position);
  assert.equal(await page.locator('#components-panel').isVisible(),true,'open tool stays open');
  assert.equal(await page.locator('#nav-components').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.text-block').count(),1);assert.equal(await page.locator('.history-entry').count(),state,'view preference is not an editing history entry');
 }
 await page.locator('#nav-captions').click();assert.equal(await page.locator('#captions-panel').isVisible(),true);
 await page.locator('#nav-ai').click();assert.equal(await page.locator('#ai-panel').isVisible(),true);
 // Support evidence for layouts, not CSS-contract assertions.
 for(const size of [{width:1400,height:960},{width:960,height:680}]){
  await page.setViewportSize(size);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:path.join(root,`validation/menu-left-${size.width}.png`)});
 }
 await page.locator('#fullscreen').click();assert.equal(await page.locator('.editor-dock').isVisible(),false);await page.locator('#fullscreen').click();assert.equal(await page.locator('.editor-dock').isVisible(),true);
 await close();page=await launch();assert.equal(await page.locator('body').getAttribute('data-menu-position'),'left','preference survives app restart');
 await page.locator('#settings').click();assert.equal(await page.getByLabel('Posição do menu',{exact:true}).inputValue(),'left');await page.getByLabel('Posição do menu',{exact:true}).selectOption('bottom');await page.locator('#settings-close').click();
 await page.screenshot({path:path.join(root,'validation/menu-bottom.png')});await close();page=await launch();assert.equal(await page.locator('body').getAttribute('data-menu-position'),'bottom');
 await page.evaluate(()=>localStorage.setItem('corte.menuPosition','invalid'));await page.reload();await page.locator('#nav-components').waitFor();assert.equal(await page.locator('body').getAttribute('data-menu-position'),'left','invalid stored preference falls back safely');
 assert.deepEqual(errors,[]);console.log('PASS menu positions, active tool/project preservation, restart persistence, invalid fallback and preview focus');
}finally{if(app)await close();await rm(dir,{recursive:true,force:true});}

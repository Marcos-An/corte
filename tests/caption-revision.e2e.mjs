import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {binaries,run} from '../desktop/media.mjs';
const require=createRequire(import.meta.url),{_electron:electron}=require('playwright'),root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-caption-revision-'));
let app;
try{
 const file=path.join(dir,'video.mp4');await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=c=gray:s=406x720:r=25','-f','lavfi','-i','sine=frequency=440','-t','4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',file]);
 app=await electron.launch({executablePath:require('electron'),args:[root,`--user-data-dir=${dir}/app`],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1400,height:900}));
 await app.evaluate(({dialog,ipcMain},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});ipcMain.removeHandler('editor:caption-estimate');ipcMain.handle('editor:caption-estimate',()=>({ok:true,value:{assets:0,seconds:0,estimatedUSD:0}}));ipcMain.removeHandler('editor:transcribe');ipcMain.handle('editor:transcribe',(_,p)=>({ok:true,value:[{assetId:p.assets[0].id,provider:'openai',model:'whisper-1',words:[{start:0,end:2,text:'Olá mundo',tokens:[{start:0,end:1,text:'Olá'},{start:1,end:2,text:'mundo'}]},{start:2,end:4,text:'Segunda fala',tokens:[{start:2,end:3,text:'Segunda'},{start:3,end:4,text:'fala'}]}]}]}));},file);
 await page.locator('#nav-media').click();await page.locator('.timeline-clip').waitFor();await page.locator('#nav-captions').click();await page.locator('#generate-captions').click();await page.waitForFunction(()=>document.querySelectorAll('.caption-row').length===2);
 assert.equal(await page.locator('.caption-block').count(),1,'single caption track block');assert.equal(await page.locator('.caption-block').textContent(),'Legendas');
 await page.locator('[data-caption-view="style"]').click();await page.locator('#caption-font-trigger').click();await page.locator('#caption-font-options button').filter({hasText:'Arial —'}).click();await page.locator('[data-caption-preset="karaoke"]').click();
 for(const [time,word] of [['.25','Olá'],['1.25','mundo']]){
 await page.locator('#playhead-time').fill(time);await page.locator('#playhead-time').dispatchEvent('change');
 await page.waitForFunction(word=>document.querySelector('[data-active-word]')?.textContent===word,word);
 assert.equal(await page.locator('[data-active-word]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(234, 195, 155)');
 }
 await page.locator('#playhead-time').fill('2.50');await page.locator('#playhead-time').dispatchEvent('change');
 await page.waitForFunction(()=>{const v=document.querySelector('#source-video');return v.readyState>=2&&!v.seeking;});
 const editor=page.getByLabel('Editar legenda no vídeo',{exact:true});
 await editor.click();
 assert.equal(await editor.isVisible(),true,'one click directly edits the caption on the video');
 assert.equal(await editor.textContent(),'Segunda fala');assert.equal(await editor.evaluate(e=>e===document.activeElement),true);
 assert.equal(await page.locator('#caption-style-view').isVisible(),true,'inline editing must not switch the right panel');
 await editor.fill('Segunda editada');await editor.press('Control+Enter');
 assert.equal(await page.getByLabel('Texto da legenda 2',{exact:true}).inputValue(),'Segunda editada');assert.equal(await page.getByLabel('Texto da legenda 1',{exact:true}).inputValue(),'Olá mundo');
 await page.locator('#undo').click();assert.equal(await page.getByLabel('Texto da legenda 2',{exact:true}).inputValue(),'Segunda fala');
 await page.locator('#context-close').click();
 await editor.click();
 assert.equal(await editor.isVisible(),true);assert.equal(await page.locator('.library').isVisible(),false,'single click must not open the right panel');
 await editor.fill('Não salvar');await editor.press('Escape');assert.equal(await editor.evaluate(e=>e===document.activeElement),false);assert.equal(await page.getByLabel('Texto da legenda 2',{exact:true}).inputValue(),'Segunda fala');
 await editor.click();await editor.fill('Segunda no vídeo');
 await page.screenshot({path:path.join(root,'validation/caption-inline-edit.png')});
 await page.locator('#preview-canvas').click({position:{x:10,y:10}});
 assert.equal(await editor.evaluate(e=>e===document.activeElement),false,'outside click finishes editing without replacing the text layer');assert.equal(await page.locator('.library').isVisible(),false);
 assert.equal(await page.getByLabel('Texto da legenda 2',{exact:true}).inputValue(),'Segunda no vídeo');
 await page.locator('#undo').click();assert.equal(await page.getByLabel('Texto da legenda 2',{exact:true}).inputValue(),'Segunda fala');
 await page.locator('#nav-captions').click();await page.locator('[data-caption-view=review]').click();
 assert.equal(await page.getByLabel('Fim da legenda 2',{exact:true}).count(),1,'timing remains editable without fragmented timeline');await page.getByLabel('Fim da legenda 2',{exact:true}).fill('3.8');await page.getByLabel('Fim da legenda 2',{exact:true}).dispatchEvent('change');assert.match(await page.locator('.caption-block').getAttribute('style'),/15.2px/);
 await page.screenshot({path:path.join(root,'validation/caption-revision.png')});assert.deepEqual(errors,[]);console.log('PASS single-click inline editing, unchanged sidebar, Escape, blur save, undo, single block and karaoke');
}finally{if(app){await app.evaluate(({dialog})=>dialog.showMessageBoxSync=()=>1);await app.close();}await rm(dir,{recursive:true,force:true});}

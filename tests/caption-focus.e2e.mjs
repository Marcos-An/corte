import assert from 'node:assert/strict';
import path from 'node:path';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {createRequire} from 'node:module';import {binaries,run} from '../desktop/media.mjs';
const require=createRequire(import.meta.url),{_electron}=require('playwright'),root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-cc-focus-'));let app;
try{
 const file=path.join(dir,'speech.mp4');await run(binaries().ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:s=320x240:r=15','-t','20','-c:v','libx264',file]);
 app=await _electron.launch({executablePath:require('electron'),args:[root,`--user-data-dir=${dir}/profile`],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});const page=await app.firstWindow();page.setDefaultTimeout(5000);page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),file);await page.locator('#nav-media').click();await page.locator('.timeline-clip').waitFor();
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('editor:api-status');ipcMain.handle('editor:api-status',()=>({ok:true,value:{configured:true}}));ipcMain.removeHandler('editor:caption-estimate');ipcMain.handle('editor:caption-estimate',()=>({ok:true,value:{assets:1,seconds:20}}));ipcMain.removeHandler('editor:transcribe');ipcMain.handle('editor:transcribe',(_,p)=>({ok:true,value:[{assetId:p.clips[0].assetId,words:Array.from({length:30},(_,i)=>({start:i*.6,end:i*.6+(i===15?.1:.4),text:`Frase completa número ${i+1}`}))}]}));});
 await page.locator('#nav-captions').click();await page.locator('#caption-engine').selectOption('cloud');await page.locator('#generate-captions').click();await page.waitForFunction(()=>document.querySelectorAll('.caption-row').length===30);await page.locator('[data-caption-view=review]').click();
 assert.equal(await page.locator('.caption-block').count(),1,'dense speech has a single caption block');assert.equal(await page.locator('.caption-block .trim-handle').count(),0);
 for(const size of [{width:1440,height:960},{width:1100,height:760}]){
  await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setBounds(size),size);
  await page.getByRole('button',{name:'Ajustar tempo da legenda 16',exact:true}).click();
  assert.equal(await page.locator('.caption-row.selected textarea').inputValue(),'Frase completa número 16');assert.equal(Number(await page.locator('#playhead-time').inputValue()),9);assert.equal(await page.getByLabel('Início da legenda 16',{exact:true}).evaluate(e=>e===document.activeElement),true);
  await page.getByLabel('Fim da legenda 16',{exact:true}).fill('9.2');await page.getByLabel('Fim da legenda 16',{exact:true}).press('Tab');assert.equal(await page.getByLabel('Fim da legenda 16',{exact:true}).inputValue(),'9.2');await page.locator('#undo').click();assert.equal(await page.getByLabel('Fim da legenda 16',{exact:true}).inputValue(),'9.1');
 }
 await page.getByRole('textbox',{name:'Texto da legenda 16',exact:true}).fill('Texto revisado');await page.getByRole('textbox',{name:'Texto da legenda 16',exact:true}).press('Tab');assert.equal(await page.locator('.caption-block').textContent(),'Legendas');assert.equal(await page.getByRole('textbox',{name:'Texto da legenda 16',exact:true}).inputValue(),'Texto revisado');
 assert.deepEqual(errors,[]);console.log('PASS 30 phrases in one block, current selection, timing/undo, two window sizes and text editing.');
}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await rm(dir,{recursive:true,force:true});}

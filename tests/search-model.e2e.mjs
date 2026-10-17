import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{_electron}=require('playwright'),root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-search-ui-'));
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='ELECTRON_RUN_AS_NODE'));let app;
try{
 app=await _electron.launch({executablePath:require('electron'),args:[root,`--user-data-dir=${dir}/profile`],env});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#settings').waitFor();
 await app.evaluate(({ipcMain})=>{
  let installed=false;ipcMain.removeHandler('editor:search-model');ipcMain.handle('editor:search-model',()=>({ok:true,value:{installed,installing:false}}));
  ipcMain.removeHandler('editor:search-model-install');ipcMain.handle('editor:search-model-install',event=>{installed=true;event.sender.send('editor:search-model',{completed:7,total:7});return {ok:true,value:{installed:true}};});
 });
 await page.locator('#settings').click();await page.locator('#search-model-install').waitFor({state:'visible'});
 assert.match(await page.locator('#search-model-status').textContent(),/não instalada/);
 await page.locator('#search-model-install').click();
 try{await page.waitForFunction(()=>document.querySelector('#search-model-status').textContent==='Busca visual instalada.');}catch(error){console.log(JSON.stringify({status:await page.locator('#search-model-status').textContent(),toast:await page.locator('#toast').textContent(),errors}));throw error;}
 assert.equal(await page.locator('#search-model-install').isVisible(),false);assert.deepEqual(errors,[]);
 console.log('PASS visual search settings, isolated install IPC, progress and ready state without network');
}finally{if(app)await app.close();await rm(dir,{recursive:true,force:true});}

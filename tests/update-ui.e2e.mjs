import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{_electron}=require('playwright'),root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-update-ui-'));let app;
try{
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='ELECTRON_RUN_AS_NODE'));
 app=await _electron.launch({executablePath:process.env.CORTE_TEST_APP||require('electron'),args:[...(process.env.CORTE_TEST_APP?[]:[root]),`--user-data-dir=${dir}`],env});const page=await app.firstWindow();page.setDefaultTimeout(6000);await page.locator('#preview-add').waitFor();
 const installedVersion=await app.evaluate(({app})=>app.getVersion());await page.locator('#settings').click();
 await page.waitForFunction(version=>document.querySelector('#installed-version')?.textContent===`Versão instalada: ${version}`,installedVersion);
 await app.evaluate(({BrowserWindow},installedVersion)=>BrowserWindow.getAllWindows()[0].webContents.send('editor:update',{phase:'ready',version:'9.9.9',installedVersion}),installedVersion);
 await page.waitForFunction(()=>document.querySelector('#update-status').textContent.includes('9.9.9'));
 assert.equal(await page.locator('#installed-version').textContent(),`Versão instalada: ${installedVersion}`);
 assert.match(await page.locator('#update-status').textContent(),/instalada automaticamente ao fechar/i);
 await page.locator('#settings-close').click();assert.equal(await page.locator('#install-update').isVisible(),true,'manual restart remains available');
 console.log('PASS installed version differs from ready update; install-on-close copy and optional restart');
}finally{await app?.close();await rm(dir,{recursive:true,force:true});}

import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { binaries, run, probe } from '../desktop/media.mjs';
const require=createRequire(import.meta.url);
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dir=await mkdtemp(path.join(tmpdir(),'corte-e2e-'));
const root=path.resolve(import.meta.dirname,'..');
await run(binaries().ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',path.join(dir,'source.mp4')]);
let app;
try {
 app=await electron.launch({executablePath:require('electron'),args:[root,`--user-data-dir=${path.join(dir,'appdata')}`],env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='ELECTRON_RUN_AS_NODE'))});
 const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1200,height:800}));const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('#preview-add').waitFor({timeout:15000});
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},path.join(dir,'source.mp4'));
 await page.locator('#preview-add').click();
 await page.waitForFunction(()=>document.querySelectorAll('.timeline-clip').length===1);
 assert.equal(await page.locator('.timeline-clip').count(),1);
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('editor:status');ipcMain.handle('editor:status',()=>({ok:true,value:{connected:true}}));ipcMain.removeHandler('editor:login');ipcMain.handle('editor:login',()=>({ok:true,value:{connected:true}}));});await page.locator('#settings').click();await page.waitForFunction(()=>document.querySelector('#connection-label').textContent==='ChatGPT conectado');await page.locator('#settings-close').click();
 assert.equal(await page.locator('#quality').count(),0,'no task-specific button');
 assert.equal(await page.locator('#sampling').count(),0,'analysis quality must not require user selection');
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('editor:analyze');ipcMain.handle('editor:analyze',(_,p,prompt,step)=>{if(step!==.5)throw new Error('automatic analysis must use highest existing coverage');return {ok:true,value:{plan:{summary:'Sem alterações',operations:[],questions:[],unsupported:[]}}};});});
 await page.locator('#nav-ai').click();await page.locator('#settings').click();await page.locator('#ai-engine').selectOption('chatgpt');await page.locator('#settings-close').click();await page.getByLabel('Pedido de edição').fill('Remova partes inutilizáveis');await page.getByRole('button',{name:'Preparar edição',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Nenhuma alteração necessária'));
 assert.deepEqual(errors,[]);console.log('PASS automatic analysis quality, no FPS selector');
}finally{if(app){await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;});await app.close();}await rm(dir,{recursive:true,force:true});}

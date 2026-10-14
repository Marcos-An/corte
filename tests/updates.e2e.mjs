import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=path.resolve(import.meta.dirname,'..');
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+'/src/'))throw Error();res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CORTE_TEST_BROWSER});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.installs=0;window.checks=0;window.isDirty=false;
  window.editor={setDirty:async d=>window.isDirty=d,status:async()=>({connected:false,platform:'win32'}),apiStatus:async()=>({configured:false}),onProgress:()=>{},onOpenProject:()=>{},onSaveProject:()=>{},ready:async()=>{},updateStatus:async()=>({phase:'idle'}),onUpdate:fn=>window.updateEvent=fn,checkUpdate:async()=>{window.checks++;window.updateEvent({phase:'current'});},installUpdate:async()=>{if(window.isDirty)throw Error('Salve o projeto antes de atualizar.');window.installs++;},saveProject:async()=>({name:'fixture.corte',file:'fixture.corte'})};
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/src/index.html`);await page.locator('#preview-add').waitFor();
 await page.locator('#settings').click();await page.locator('#check-update').click();assert.equal(await page.evaluate(()=>window.checks),1);await page.locator('#update-status').filter({hasText:'atualizado'}).waitFor();await page.locator('#settings-close').click();
 await page.evaluate(()=>window.updateEvent({phase:'downloading',percent:43,version:'0.5.5'}));assert.equal(await page.locator('#update-notice').isVisible(),true);assert.match(await page.locator('#update-notice').textContent(),/43%/);assert.equal(await page.locator('#install-update').isVisible(),false);
 await page.evaluate(()=>window.updateEvent({phase:'ready',version:'0.5.5'}));assert.equal(await page.evaluate(()=>window.installs),0);await page.locator('#project-name').fill('Alteração não salva');await page.locator('#project-name').blur();assert.equal(await page.locator('#install-update').isDisabled(),true);assert.match(await page.locator('#update-notice').textContent(),/salve/i);
 await page.locator('#save-project').click();await page.waitForFunction(()=>!window.isDirty);await page.locator('#install-update').click();assert.equal(await page.evaluate(()=>window.installs),1);
 await page.evaluate(()=>window.updateEvent({phase:'error'}));assert.equal(await page.locator('#install-update').isVisible(),false);await page.locator('#settings').click();await page.locator('#update-status').filter({hasText:'Não foi possível'}).waitFor();assert.deepEqual(errors,[]);
 console.log('PASS updater UI: manual check, background progress, no forced restart, dirty protection and retry');
}finally{await browser?.close();await new Promise(r=>server.close(r));}

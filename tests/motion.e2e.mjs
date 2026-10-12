import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {createRequire} from 'node:module';import {binaries,run} from '../desktop/media.mjs';
// Plug-and-play animation: pick an entrance/exit for an image in the same picker as text; manual keyframes stay optional.
const require=createRequire(import.meta.url),{_electron}=require('playwright'),root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-motion-'));let app;
try{
 const video=path.join(dir,'video.mp4'),image=path.join(dir,'logo.png');
 await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=blue:size=320x240:rate=15','-t','3','-c:v','libx264',video]);
 await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=red:size=80x40','-frames:v','1',image]);
 app=await _electron.launch({executablePath:require('electron'),args:[root,`--user-data-dir=${dir}/profile`],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#nav-components').waitFor();
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),video);
 await page.locator('#nav-media').click();await page.locator('.timeline-clip').waitFor();await page.locator('#nav-components').click();
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),image);
 await page.locator('#add-image').click();await page.locator('#image-properties').waitFor({state:'visible'});
 assert.equal(await page.locator('#motion-row').isVisible(),true,'entrance/exit pickers are the first animation control');
 assert.equal(await page.locator('#custom-keyframes').evaluate(d=>d.open),false,'manual keyframes start collapsed');
 assert.equal(await page.locator('#motion-enter-name').textContent(),'Nenhuma');
 await page.locator('#motion-enter-trigger').click();await page.locator('#picker-dialog[open]').waitFor();
 assert.equal(await page.locator('#picker-title').textContent(),'Animação de entrada');
 await page.getByRole('button',{name:'Entrada Surgir',exact:true}).click();
 assert.equal(await page.locator('#picker-dialog').evaluate(d=>d.open),false,'one click applies and closes');
 assert.equal(await page.locator('#motion-enter-name').textContent(),'Surgir');
 await page.locator('#motion-exit-trigger').click();await page.getByRole('button',{name:'Saída Para a esquerda',exact:true}).click();
 assert.equal(await page.locator('#motion-exit-name').textContent(),'Para a esquerda');
 // The base pose stays editable while animated: the size slider is not locked like manual keyframes.
 assert.equal(await page.locator('#image-width').isDisabled(),false);
 await page.getByRole('button',{name:'Desfazer',exact:true}).click();
 assert.equal(await page.locator('#motion-exit-name').textContent(),'Nenhuma','undo removes only the last choice');
 assert.equal(await page.locator('#motion-enter-name').textContent(),'Surgir');
 await page.screenshot({path:path.join(root,'validation/motion-picker.png')});
 assert.deepEqual(errors,[]);console.log('motion e2e ok');
}finally{await app?.close();await rm(dir,{recursive:true,force:true});}

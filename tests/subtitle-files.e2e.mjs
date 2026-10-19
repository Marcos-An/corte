import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
import {binaries,run,probe} from '../desktop/media.mjs';
import {saveProjectFile,readProjectFile} from '../desktop/storage.mjs';
import {createProject,addAsset,addClip} from '../src/project.mjs';
import {captionEntries} from '../src/captions.mjs';import {parseSubtitles} from '../src/subtitle-files.mjs';
const require=createRequire(import.meta.url),{_electron}=require('playwright'),root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-subtitles-'));let app;
try{
 const video=path.join(dir,'video.mp4'),file=path.join(dir,'project.corte'),srt=path.join(dir,'legendas.srt'),output=path.join(dir,'salvas.vtt');
 await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=c=blue:s=320x240:r=30','-t','6','-c:v','libx264',video]);
 const p=addClip(addAsset(createProject(),{id:'v',name:'Vídeo',...await probe(video)}),'v','c');await saveProjectFile(file,p,new Map([['v',{path:video}]]));
 await writeFile(srt,'1\n00:00:01,000 --> 00:00:02,000\nOlá, Kokoro!\n\n2\n00:00:03,000 --> 00:00:04,000\nComida boa.','utf8');
 app=await _electron.launch({executablePath:process.env.CORTE_TEST_APP||require('electron'),args:[...(process.env.CORTE_TEST_APP?[]:[root]),`--user-data-dir=${dir}/profile`],env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='ELECTRON_RUN_AS_NODE'))});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#preview-add').waitFor();
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),file);await page.keyboard.press(process.platform==='darwin'?'Meta+o':'Control+o');await page.locator('.timeline-clip').waitFor();await page.locator('#nav-captions').click();await page.locator('.subtitle-files summary').click();assert.ok(await page.locator('#export-srt').isDisabled());
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),srt);await page.locator('#import-subtitles').click();await page.waitForFunction(()=>document.querySelectorAll('.caption-row').length===2);assert.equal(await page.locator('.caption-row textarea').first().inputValue(),'Olá, Kokoro!');
 await page.locator('#undo').click();assert.equal(await page.locator('.caption-row').count(),0);await page.locator('#redo').click();assert.equal(await page.locator('.caption-row').count(),2);
 await app.evaluate(({dialog},file)=>dialog.showSaveDialog=async()=>({canceled:false,filePath:file}),output);await page.locator('#export-vtt').click();await page.waitForFunction(()=>!document.querySelector('#import-subtitles').disabled);assert.equal(parseSubtitles(await readFile(output,'utf8'))[0].text,'Olá, Kokoro!');
 await app.evaluate(({dialog},file)=>dialog.showSaveDialog=async()=>({canceled:false,filePath:file}),file);await page.locator('#save-project').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Salvo no computador');assert.equal(captionEntries((await readProjectFile(file)).project).length,2);
 await app.evaluate(({dialog})=>dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]}));await page.locator('#import-subtitles').click();await page.waitForFunction(()=>!document.querySelector('#import-subtitles').disabled);assert.equal(await page.locator('.caption-row').count(),2);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(960,680));await page.locator('.subtitle-files').scrollIntoViewIfNeeded();if(process.env.CORTE_SUBTITLE_SCREENSHOT)await page.screenshot({path:process.env.CORTE_SUBTITLE_SCREENSHOT});assert.deepEqual(errors,[]);
 console.log('PASS subtitle UI: native import/export, captions, undo/redo, persisted project, cancellation and compact layout');
}finally{if(app){await app.evaluate(({dialog})=>dialog.showMessageBoxSync=()=>1);await app.close();}await rm(dir,{recursive:true,force:true});}

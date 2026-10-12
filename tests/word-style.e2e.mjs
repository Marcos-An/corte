import assert from 'node:assert/strict';import path from 'node:path';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {createRequire} from 'node:module';import {binaries,run} from '../desktop/media.mjs';
// Editing a text layer on the video with the real keyboard, then styling one word from the floating word toolbar.
const require=createRequire(import.meta.url),{_electron}=require('playwright'),root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'corte-word-'));let app;
try{
 const video=path.join(dir,'video.mp4');
 await run(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i','color=gray:size=320x568:rate=15','-t','4','-c:v','libx264',video]);
 app=await _electron.launch({executablePath:require('electron'),args:[root,`--user-data-dir=${dir}/profile`],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1280,height:820}));
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),video);
 await page.locator('#nav-media').click();await page.locator('.timeline-clip').waitFor();await page.locator('#nav-components').click();
 await page.getByRole('button',{name:'Adicionar texto',exact:true}).click();
 const text=page.getByLabel('Editar texto no vídeo',{exact:true});await text.waitFor();
 // Real typing replaces the placeholder and is saved when leaving the box.
 await text.click();await page.keyboard.press('Meta+A');await page.keyboard.type('Olá mundo');await page.keyboard.press('Meta+Enter');
 await page.waitForFunction(()=>document.querySelector('#text-track .text-block')?.textContent.includes('Olá mundo'));
 // Select one word: the toolbar floats right above the text, inside the stage.
 await text.click();await text.locator('[data-word="1"]').dblclick();
 const bar=page.getByRole('toolbar',{name:'Estilo da palavra selecionada'});await bar.waitFor({state:'visible'});
 const b=await bar.boundingBox(),t=await text.boundingBox(),stage=await page.locator('#preview-stage').boundingBox();
 assert.ok(b.y+b.height<=t.y,'toolbar sits above the text');assert.ok(Math.abs((b.x+b.width/2)-(t.x+t.width/2))<4||b.x>=stage.x,'toolbar is centred on the text or kept inside the stage');
 assert.ok(b.x>=stage.x&&b.x+b.width<=stage.x+stage.width,'toolbar stays inside the preview');
 assert.equal(await bar.locator('select').count(),0,'font is chosen in the font picker, not a native select');
 await bar.getByRole('button',{name:'Negrito na palavra'}).click();
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.scene-text [data-word="1"]')).fontWeight==='700');
 assert.equal(await text.locator('[data-word="0"]').evaluate(w=>w.dataset.own),undefined,'only the selected word changes');
 await page.screenshot({path:path.join(root,'validation/word-toolbar.png')});
 await bar.getByRole('button',{name:'Fonte da palavra'}).click();await page.locator('#caption-font-dialog[open]').waitFor();
 // Full list (Todas): cards in the scrolling grid never overlap and each name stays inside its card.
 const overlap=await page.locator('#caption-font-options').evaluate(list=>{const cards=[...list.querySelectorAll('button')].map(b=>({b,r:b.getBoundingClientRect(),name:b.querySelector('small').getBoundingClientRect()}));const bad=[];for(const c of cards){if(c.name.bottom>c.r.bottom+1)bad.push('name outside '+c.b.title);const below=cards.find(o=>Math.abs(o.r.left-c.r.left)<2&&o.r.top>c.r.top);if(below&&below.r.top<c.r.bottom-1)bad.push('overlap '+c.b.title);}return {count:cards.length,bad};});
 assert.ok(overlap.count>40,'full font list is shown');assert.deepEqual(overlap.bad,[]);
 await page.screenshot({path:path.join(root,'validation/font-picker-all.png')});
 await page.locator('#caption-font-search').fill('Bebas');await page.locator('#caption-font-options button').first().click();
 await page.waitForFunction(()=>document.querySelector('.scene-text [data-word="1"]').style.fontFamily.includes('Bebas'));
 await page.getByRole('button',{name:'Desfazer',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.scene-text [data-word="1"]').style.fontFamily.includes('Bebas'));
 assert.deepEqual(errors,[]);console.log('word style e2e ok');
}finally{await app?.close();await rm(dir,{recursive:true,force:true});}

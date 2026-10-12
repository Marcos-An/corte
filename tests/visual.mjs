import {createRequire} from 'node:module';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=await electron.launch({executablePath:require('electron'),args:[path.resolve(import.meta.dirname,'..'),'--disable-gpu'],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
try {
 const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1500,height:960}));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});await page.getByRole('button',{name:'Importar vídeos',exact:true}).waitFor();
 console.log('Window',await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds()));
 if(process.env.CORTE_TEST_VIDEO){
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},process.env.CORTE_TEST_VIDEO);
  await page.getByRole('button',{name:'Importar vídeos',exact:true}).click();
  await page.getByRole('button',{name:`Adicionar ${path.basename(process.env.CORTE_TEST_VIDEO)} à timeline`}).click();
  await page.locator('#playhead-time').fill('12');await page.locator('#playhead-time').dispatchEvent('change');
  console.log('RANGE',await app.evaluate(async({net},url)=>{const r=await net.fetch(url,{headers:{Range:'bytes=100-200'}});return {status:r.status,range:r.headers.get('content-range'),length:r.headers.get('content-length')};},await page.locator('video').getAttribute('src')));
  try{await page.waitForFunction(()=>document.querySelector('video').readyState>=2 && Math.abs(document.querySelector('video').currentTime-12)<.1,{},{timeout:10000});}catch(e){console.log('SEEK EVIDENCE',await page.evaluate(()=>({time:document.querySelector('video').currentTime,ready:document.querySelector('video').readyState,error:document.querySelector('video').error?.message,duration:document.querySelector('video').duration,seekable:document.querySelector('video').seekable.length,field:document.querySelector('#playhead-time').value,summary:document.querySelector('#timeline-summary').textContent,toast:document.querySelector('#toast').textContent})));throw e;}
  await page.locator('#nav-ai').click();await page.locator('#prompt').fill('Remova os momentos em que a mão encobre a lente e reenquadre para esconder os pés.');
  const pixels=await page.evaluate(()=>{const c=document.querySelector('canvas');return Array.from(c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data);});
  assert.ok(pixels[0]+pixels[1]+pixels[2]>0);
  await page.waitForFunction(()=>!document.querySelector('video').seeking);
  const scrub=await page.evaluate(()=>{
   const canvas=document.querySelector('#preview-canvas'),before=canvas.toDataURL(),field=document.querySelector('#playhead-time'),start=performance.now();
   for(const t of [15,20,30,40,55,70,80]){field.value=String(t);field.dispatchEvent(new Event('change'));}
   return {preserved:canvas.toDataURL()===before,start};
  });assert.ok(scrub.preserved,'real video: preserve frame during rapid scrub');
  await page.waitForFunction(()=>!document.querySelector('video').seeking&&Math.abs(document.querySelector('video').currentTime-80)<.05,{},{timeout:10000});
  console.log('REAL SCRUB',await page.evaluate(start=>({finalTime:document.querySelector('video').currentTime,decodeMs:Math.round(performance.now()-start)}),scrub.start));

 }
 const out=path.resolve(import.meta.dirname,'../../editor-interface.png');
 const png=await app.evaluate(async({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];const image=await win.webContents.capturePage();return image.toPNG().toString('base64');});
 await writeFile(out,Buffer.from(png,'base64'));
 console.log('PASS: captura nativa da interface com preview real');
 await page.evaluate(()=>window.editor.setDirty(false));
}finally{await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;});await app.close();}

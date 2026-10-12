import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {binaries,run} from '../desktop/media.mjs';
const require=createRequire(import.meta.url),{_electron:electron}=require('playwright');
const dir=await mkdtemp(path.join(tmpdir(),'corte-signal-'));let app;
try{
 const video=path.join(dir,'video.mp4'),music=path.join(dir,'music.m4a');
 await run(binaries().ffmpeg,['-v','error','-f','lavfi','-i','color=size=128x128:rate=30','-f','lavfi','-i','sine=frequency=220','-t','12','-c:v','libx264','-c:a','aac',video]);
 await run(binaries().ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=880','-t','8','-c:a','aac',music]);
 app=await electron.launch({executablePath:process.env.CORTE_EXECUTABLE||require('electron'),args:[...(process.env.CORTE_EXECUTABLE?[]:[path.resolve(import.meta.dirname,'..')]),`--user-data-dir=${dir}`],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
 const page=await app.firstWindow();const messages=[];page.on('console',m=>messages.push(m.text()));
 await page.evaluate(()=>{
  window.audioSignals=[];const create=AudioContext.prototype.createMediaElementSource;
  AudioContext.prototype.createMediaElementSource=function(el){const source=create.call(this,el),connect=source.connect.bind(source),context=this;
   source.connect=function(gain,...args){const result=connect(gain,...args),analyser=context.createAnalyser(),sink=context.createGain();sink.gain.value=0;gain.connect(analyser);analyser.connect(sink);sink.connect(context.destination);window.audioSignals.push({el,analyser});return result};return source;
  };
 });
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),video);
 await page.locator('#nav-media').click();await page.locator('.timeline-clip').waitFor();await page.locator('.timeline-clip').click();await page.locator('#clip-volume').click();await page.locator('#mute').click();
 await page.locator('#playhead-time').fill('0');await page.locator('#playhead-time').press('Tab');
 await app.evaluate(({dialog},file)=>dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}),music);
 await page.locator('#nav-media').click();await page.locator('.music-block').waitFor();await page.locator('#play').click();
 const sample=()=>{const rms=s=>{const data=new Float32Array(s.analyser.fftSize);s.analyser.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((n,v)=>n+v*v,0)/data.length)};const signals=window.audioSignals;return {video:rms(signals.find(s=>s.el.tagName==='VIDEO')),music:rms(signals.find(s=>s.el.tagName==='AUDIO'))}};
 try{await page.waitForFunction(()=>{const s=window.audioSignals.find(s=>s.el.tagName==='AUDIO');if(!s)return false;const data=new Float32Array(s.analyser.fftSize);s.analyser.getFloatTimeDomainData(data);return data.some(v=>Math.abs(v)>.001)},null,{timeout:7000})}catch{console.log(messages.filter(m=>/CORS|cross-origin|MediaElementAudio/i.test(m)));assert.fail('Music mixer output must contain an actual nonzero audio signal')}
 await page.waitForFunction(()=>!document.querySelector('#source-video').paused&&!document.querySelector('#source-video').seeking&&document.querySelector('#source-video').currentTime>.3,null,{timeout:5000});const levels=await page.evaluate(sample);assert.equal(levels.video,0,'Original audio must remain muted');assert.ok(levels.music>.001);
 await page.locator('#play').click();await page.waitForFunction(()=>window.audioSignals.every(s=>s.el.paused));
 await page.locator('.music-block').click();await page.locator('#music-volume').fill('0');await page.locator('#music-volume').press('Tab');await page.locator('#play').click();await page.waitForFunction(()=>!document.querySelector('#source-video').paused&&!document.querySelector('#source-video').seeking&&document.querySelector('#source-video').currentTime>0.3,null,{timeout:5000}).catch(async e=>{console.log(await page.evaluate(()=>({time:document.querySelector('#source-video').currentTime,paused:document.querySelector('#source-video').paused,play:document.querySelector('#play').getAttribute('aria-label'),toast:document.querySelector('#toast').textContent})));throw e});await page.waitForFunction(()=>{const s=window.audioSignals.find(s=>s.el.tagName==='AUDIO');const d=new Float32Array(s.analyser.fftSize);s.analyser.getFloatTimeDomainData(d);return d.every(v=>v===0)});await page.locator('#play').click();
 await page.locator('#music-volume').fill('100');await page.locator('#music-volume').press('Tab');await page.locator('#playhead-time').fill('9');await page.locator('#playhead-time').press('Tab');await page.waitForFunction(()=>!document.querySelector('#source-video').seeking);await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#source-video').currentTime>9.2,null,{timeout:5000}).catch(async e=>{console.log(await page.evaluate(()=>({cursor:document.querySelector('#playhead-time').value,video:document.querySelector('#source-video').currentTime,paused:document.querySelector('#source-video').paused,play:document.querySelector('#play').getAttribute('aria-label'),toast:document.querySelector('#toast').textContent})));throw e});assert.equal(await page.evaluate(()=>window.audioSignals.find(s=>s.el.tagName==='AUDIO').el.paused),true,'Music stops outside its range');
 console.log('PASS nonzero music mixer output, original mute, pause, music mute and range end',levels);
}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{})}await rm(dir,{recursive:true,force:true})}

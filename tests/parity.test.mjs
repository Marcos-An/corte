import test from 'node:test';import assert from 'node:assert/strict';
import * as experience from '../src/editor-experience.mjs';
import {captionRuns,toAss,drawCaption,captionStyle} from '../src/captions.mjs';
import {createProject} from '../src/project.mjs';
test('transport advances to the next boundary, clamps at end and handles empty montage',()=>{
 const p={clips:[{in:0,out:3},{in:2,out:7}]};
 assert.equal(experience.nextClipTime(p,0),3);assert.equal(experience.nextClipTime(p,3),8);assert.equal(experience.nextClipTime(p,9),8);assert.equal(experience.nextClipTime({clips:[]},0),0);
});
test('new caption defaults are white without changing the legacy fallback',()=>{assert.equal(createProject().captionStyle.color,'#ffffff');assert.equal(captionStyle().color,'#78ead4');});
test('karaoke highlights only the current word with a box in preview and export',()=>{
 const c={start:0,end:2,text:'Uma história',tokens:[{text:'Uma',start:0,end:.5},{text:'história',start:.7,end:1.5}]};
 const s={font:'Arial',size:6.5,color:'#ffffff',accent:'#eac39b',position:'bottom',preset:'karaoke'};
 assert.deepEqual(captionRuns(c,1,s).map(r=>r.active),[false,true]);assert.deepEqual(captionRuns(c,.6,s).map(r=>r.active),[false,false]);
 const boxes=[],text=[];const ctx={measureText:s=>({width:s.length*20}),fillRect(...args){boxes.push({color:this.fillStyle,args})},strokeText(){},fillText(s){text.push({text:s,color:this.fillStyle})}};
 drawCaption(ctx,c,1,720,1280,s);assert.equal(boxes.length,1);assert.equal(boxes[0].color,s.accent);assert.equal(text[1].color,'#101113');
 const ass=toAss([c],720,1280,s);assert.match(ass,/\\3c&H9BC3EA&/);assert.match(ass,/\\3a&H00&/);assert.match(ass,/\\3a&HFF&/);
});

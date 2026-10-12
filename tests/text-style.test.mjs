import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toAss,captionStyle} from '../src/captions.mjs';
import {TEXT_PRESETS,textAppearance} from '../src/text-style.mjs';
const base={font:'Arial',size:8,color:'#ffffff',position:'center',positionX:50,positionY:50};
const ass=style=>toAss([{id:'t',start:0,end:1,text:'Olá mundo',style:{...base,...style}}],720,1280);
const styleLine=style=>ass(style).match(/^Style: Layer0,.*$/m)[0].split(',');
test('styles saved before the new options export exactly as before',()=>{
 const legacy=readFileSync(new URL('./fixtures-legacy-text-ass.json',import.meta.url),'utf8').trim().split('\n').map(l=>JSON.parse(l));
 assert.deepEqual(['clean','outline','boxed'].map(preset=>ass({preset})),legacy);
});
test('box, stroke, shadow, weight, spacing and capitals reach the export',()=>{
 const fs=Math.round(720*8/100);
 const box=styleLine({preset:'boxed',boxColor:'#ffd84a',boxOpacity:50,bold:true,italic:true,spacing:10});
 assert.equal(box[5],'&H804AD8FF','box colour with half opacity');assert.equal(box[7],'-1');assert.equal(box[8],'-1');assert.equal(box[13],String(Math.round(fs*.1)));assert.equal(box[15],'3');assert.equal(box[16],String(Math.round(fs*.25)));
 const stroke=styleLine({preset:'outline',strokeColor:'#ff0000',strokeWidth:20,shadow:10,shadowColor:'#0000ff'});
 assert.equal(stroke[5],'&H000000FF');assert.equal(stroke[6],'&H00FF0000');assert.equal(stroke[15],'1');assert.equal(stroke[16],String(Math.round(fs*.2)));assert.equal(stroke[17],String(Math.round(fs*.1)));
 assert.match(ass({preset:'clean',uppercase:true}),/OLÁ MUNDO/);
});
test('invalid style values are rejected and every preset is a valid style',()=>{
 for(const bad of [{strokeWidth:-1},{strokeWidth:99},{boxOpacity:101},{boxColor:'red'},{bold:'yes'},{spacing:200},{shadow:NaN}])assert.throws(()=>captionStyle({...base,preset:'clean',...bad}),JSON.stringify(bad));
 assert.equal(new Set(TEXT_PRESETS.map(p=>p.id)).size,TEXT_PRESETS.length,'preset ids are unique');
 for(const p of TEXT_PRESETS)captionStyle({...base,...p.style});
 assert.ok(['neon','hollow','keyword','retro'].every(id=>TEXT_PRESETS.some(p=>p.id===id)),'each preset is its own concept');
 for(const bad of [{glow:30},{glowColor:'x'},{hollow:1},{accentLast:'no'}])assert.throws(()=>captionStyle({...base,preset:'clean',...bad}),JSON.stringify(bad));
});
test('preview appearance follows the same numbers as the export',()=>{
 const a=textAppearance({...base,preset:'boxed',boxColor:'#ffd84a',boxOpacity:50,bold:true,uppercase:true,spacing:10},100);
 assert.equal(a.node.fontWeight,'700');assert.equal(a.node.textTransform,'uppercase');assert.equal(a.node.letterSpacing,'10px');assert.equal(a.box.background,'rgba(255, 216, 74, 0.5)');assert.equal(a.box.padding,'25px');
 const s=textAppearance({...base,preset:'outline',strokeColor:'#ff0000',strokeWidth:20,shadow:10,shadowColor:'#0000ff'},100);
 assert.equal(s.node.webkitTextStroke,'40px #ff0000','css stroke is centred, so twice the outside width');assert.equal(s.node.textShadow,'10px 10px 0 #0000ff');assert.equal(s.box,null);
});
import {ENTER_ANIMATIONS,EXIT_ANIMATIONS,animationAt} from '../src/text-style.mjs';
test('entrance and exit animations are linear over 0.4s and idle in between',()=>{
 const s={...base,preset:'clean',enter:'rise',exit:'pop'};
 assert.deepEqual(animationAt(s,1,5,1),{opacity:0,x:0,y:8,scale:1});
 assert.deepEqual(animationAt(s,1,5,1.2),{opacity:.5,x:0,y:4,scale:1});
 assert.deepEqual(animationAt(s,1,5,3),{opacity:1,x:0,y:0,scale:1});
 assert.deepEqual(animationAt(s,1,5,4.8),{opacity:.5,x:0,y:0,scale:.75});
 assert.deepEqual(animationAt({...s,enter:'left'},1,1.4,1.1),{opacity:.5,x:-6,y:0,scale:1},'short texts split the time between in and out');
 assert.ok(ENTER_ANIMATIONS.length>=8&&EXIT_ANIMATIONS.length>=8);
 assert.throws(()=>captionStyle({...base,preset:'clean',enter:'spin'}));
});
test('animations export as fade, move and scale on their own segments',()=>{
 const out=toAss([{id:'t',start:1,end:5,text:'Oi',style:{...base,preset:'clean',enter:'rise',exit:'pop'}}],720,1280);
 const lines=out.match(/^Dialogue: .*$/gm);assert.equal(lines.length,3,'enter, hold and exit segments');
 assert.match(lines[0],/0:00:01\.00,0:00:01\.40/);assert.match(lines[0],/\\fad\(400,0\)/);assert.match(lines[0],/\\move\(360,742,360,640,0,400\)/);
 assert.match(lines[1],/\\pos\(360,640\)/);assert.doesNotMatch(lines[1],/\\fad|\\move/);
 assert.match(lines[2],/\\fad\(0,400\)/);assert.match(lines[2],/\\t\(0,400,\\fscx50\\fscy50\)/);
 assert.equal(toAss([{id:'t',start:1,end:5,text:'Oi',style:{...base,preset:'clean'}}],720,1280).match(/^Dialogue: .*$/gm).length,1,'no animation keeps one event');
});
test('glow, hollow letters and a highlighted last word reach preview and export',()=>{
 const fs=Math.round(720*8/100);
 const neon=ass({preset:'clean',glow:10,glowColor:'#00e5ff'});
 assert.equal(neon.match(/^Style: Layer0,.*$/m)[0].split(',')[5],'&H00FFE500','glow colours the outline');assert.match(neon,/\\blur\d/);
 assert.match(ass({preset:'outline',strokeWidth:6,strokeColor:'#ffffff',hollow:true}).match(/^Style: Layer0,.*$/m)[0],/^Style: Layer0,Arial,\d+,&HFF/,'hollow letters have a transparent fill');
 const key=toAss([{id:'t',start:0,end:1,text:'Olá mundo novo',style:{...base,preset:'clean',accentLast:true,accent:'#ffd84a'}}],720,1280);
 const event=key.match(/^Dialogue: .*$/m)[0];assert.match(event,/\{\\c&H4AD8FF&\}novo\{\\c&HFFFFFF&\}$/,'only the last word changes colour');assert.equal(event.match(/\\c&H4AD8FF/g).length,1);
 const glow=textAppearance({...base,preset:'clean',glow:10,glowColor:'#00e5ff'},100).node.textShadow;assert.equal(glow,'0 0 10px #00e5ff, 0 0 20px #00e5ff');
 assert.equal(textAppearance({...base,preset:'outline',strokeWidth:6,hollow:true},100).node.webkitTextFillColor,'transparent');
});

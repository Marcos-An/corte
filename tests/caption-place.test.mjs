import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,validateProject} from '../src/project.mjs';
import {captionEntries,projectCaptions,toAss} from '../src/captions.mjs';
import {editCaption,alignCaptions} from '../src/caption-editing.mjs';
function project(){
 const p=createProject();p.assets=[{id:'a',name:'v',duration:6,width:720,height:1280,hasAudio:true}];p.clips=[{id:'c',assetId:'a',in:0,out:6,volume:1,crop:{x:0,y:0,w:1,h:1}}];
 p.transcripts=[{assetId:'a',words:[{start:0,end:2,text:'Primeira fala'},{start:2,end:4,text:'Segunda fala'}]}];return validateProject(p);
}
test('one caption can sit somewhere else without moving the others',()=>{
 const p=project(),[first]=captionEntries(p),q=editCaption(p,first,{place:{positionX:40,positionY:20}});
 const [a,b]=captionEntries(q);assert.deepEqual(a.place,{positionX:40,positionY:20});assert.equal(b.place,undefined);
 const [ea,eb]=projectCaptions(q);assert.equal(ea.style.positionY,20);assert.equal(eb.style,undefined);
 assert.match(toAss(projectCaptions(q),720,1280,q.captionStyle),/\\pos\(288,256\)/);
});
test('align all removes every individual position in one step',()=>{
 const p=project(),[first,second]=captionEntries(p);
 const q=editCaption(editCaption(p,first,{place:{positionX:40,positionY:20}}),second,{place:{positionX:60,positionY:70}});
 const r=alignCaptions(q);assert.ok(captionEntries(r).every(w=>w.place===undefined));assert.equal(captionEntries(r)[0].text,'Primeira fala');
});
test('invalid individual positions are rejected and a long phrase keeps its position on every page',()=>{
 const p=project(),[first]=captionEntries(p);
 assert.throws(()=>editCaption(p,first,{place:{positionX:40,positionY:99}}));
 const q=structuredClone(p);q.clips[0].captionWords=[{start:0,end:4,text:'uma frase bem longa que precisa virar duas paginas na tela',place:{positionX:50,positionY:30}}];
 assert.ok(captionEntries(validateProject(q)).length>1);assert.ok(captionEntries(q).every(w=>w.place.positionY===30));
});

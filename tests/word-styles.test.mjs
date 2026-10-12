import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/project.mjs';
import {toAss} from '../src/captions.mjs';
const style={font:'Arial',size:8,color:'#ffffff',position:'center',positionX:50,positionY:50,preset:'clean'};
const layer=(extra={})=>model.addTextLayer(model.createProject(),{id:'t',text:'Seu texto aqui',start:0,end:2,style,...extra});
test('a single word keeps its own colour, weight, size and font',()=>{
 const p=layer({wordStyles:[{index:0,color:'#ff0000',bold:true,scale:150,font:'Anton'}]});
 assert.deepEqual(p.textLayers[0].wordStyles,[{index:0,color:'#ff0000',bold:true,scale:150,font:'Anton'}]);
 for(const bad of [{index:3},{index:-1},{index:0,color:'red'},{index:0,scale:500},{index:0,font:'Comic'},{index:0,bold:'x'}])assert.throws(()=>layer({wordStyles:[bad]}),JSON.stringify(bad));
 assert.throws(()=>layer({wordStyles:[{index:0,bold:true},{index:0,italic:true}]}),'one entry per word');
});
test('editing the text keeps each look on the same word',()=>{
 const p=layer({wordStyles:[{index:0,color:'#ff0000'},{index:2,italic:true}]});
 assert.deepEqual(model.editTextLayer(p,'t',{text:'Olha seu novo texto aqui'}).textLayers[0].wordStyles,[{index:4,italic:true}],'Seu changed case so it lost its look; aqui moved to index 4');
 assert.deepEqual(model.editTextLayer(p,'t',{text:'Seu lindo texto aqui'}).textLayers[0].wordStyles,[{index:0,color:'#ff0000'},{index:3,italic:true}]);
 assert.deepEqual(model.remapWordStyles('a b','c d',[{index:0,bold:true}]),[]);
});
test('word looks export as inline overrides that switch back after the word',()=>{
 const ass=toAss([{id:'t',start:0,end:1,text:'Seu texto',style,wordStyles:[{index:0,color:'#ff0000',bold:true,scale:150,font:'Anton'}]}],1280,720);
 const fs=Math.round(1280*8/100);
 assert.match(ass,new RegExp(`\\{\\\\c&H0000FF&\\\\b1\\\\fs${Math.round(fs*1.5)}\\\\fnAnton\\}Seu\\{\\\\c&HFFFFFF&\\\\b0\\\\fs${fs}\\\\fnArial\\} texto`));
});

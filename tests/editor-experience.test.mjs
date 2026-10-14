import test from 'node:test';
import assert from 'node:assert/strict';
import {timelinePointerTime,playbackStart,editorPanel,snapPoint,assignLanes} from '../src/editor-experience.mjs';
test('dragging playhead converts screen position including scrolling and clamps to montage',()=>{
 assert.equal(timelinePointerTime(250,150,50,18),2);
 assert.equal(timelinePointerTime(20,150,50,18),0);
 assert.equal(timelinePointerTime(2000,150,50,18),18);
 assert.equal(timelinePointerTime(250,-150,50,18),8);
});
test('play skips selected removal, leaves normal playback unchanged and avoids restarting inside removal',()=>{
 assert.equal(playbackStart(3,18,{start:2,end:7}),7);
 assert.equal(playbackStart(1,18,{start:2,end:7}),1);
 assert.equal(playbackStart(18,18,{start:0,end:2}),2);
 assert.equal(playbackStart(3,18,null),3);
});
test('tool panel is independent of clip selection and toggles off without losing selection',()=>{
 assert.equal(editorPanel('media','ai'),'ai');
 assert.equal(editorPanel('ai','ai'),null);
 assert.equal(editorPanel(null,'captions'),'captions');
});
test('dragged text snaps to the nearest alignment line and reports which guides to draw',()=>{
 const targets={x:[50,30],y:[50]};
 assert.deepEqual(snapPoint(49.2,70,targets,1.5,1.5),{x:50,y:70,guides:{x:50,y:null}});
 assert.deepEqual(snapPoint(31,50.9,targets,1.5,1.5),{x:30,y:50,guides:{x:30,y:50}});
 assert.deepEqual(snapPoint(40.04,20,targets,1.5,1.5),{x:40,y:20,guides:{x:null,y:null}});
});
test('box edges snap to margins and other boxes, and the center wins a tie',()=>{
 const offsets={x:[0,-10,10],y:[0,-4,4]};
 assert.deepEqual(snapPoint(15.6,40,{x:[5,50,95],y:[50]},1.5,1.5,offsets),{x:15,y:40,guides:{x:5,y:null}});
 assert.deepEqual(snapPoint(84.5,46.5,{x:[5,50,95],y:[50]},1.5,1.5,offsets),{x:85,y:46,guides:{x:95,y:50}});
 assert.deepEqual(snapPoint(50,50,{x:[50,60,40],y:[50]},1.5,1.5,offsets).guides,{x:50,y:50});
});
test('overlapping text blocks share the row in lanes and a lone block keeps the full height',()=>{
 const lanes=assignLanes([{id:'a',start:0,end:4},{id:'b',start:2,end:6},{id:'c',start:3,end:5},{id:'d',start:4.5,end:7},{id:'e',start:10,end:12}]);
 assert.deepEqual(Object.fromEntries(lanes),{a:{lane:0,lanes:3},b:{lane:1,lanes:3},c:{lane:2,lanes:3},d:{lane:0,lanes:3},e:{lane:0,lanes:1}});
 assert.deepEqual(Object.fromEntries(assignLanes([{id:'x',start:0,end:2},{id:'y',start:2,end:3}])),{x:{lane:0,lanes:1},y:{lane:0,lanes:1}},'touching blocks do not overlap');
});
test('playhead edge scrolling is proportional, bounded and inactive in the center/narrow viewport',async()=>{
 const {timelineEdgeSpeed}=await import('../src/editor-experience.mjs');
 assert.equal(timelineEdgeSpeed(500,100,900),0);assert.equal(timelineEdgeSpeed(100,100,900),-720);assert.equal(timelineEdgeSpeed(900,100,900),720);assert.equal(timelineEdgeSpeed(124,100,900),-360);assert.equal(timelineEdgeSpeed(876,100,900),360);assert.equal(timelineEdgeSpeed(-200,100,900),-720);assert.equal(timelineEdgeSpeed(1300,100,900),720);assert.equal(timelineEdgeSpeed(105,100,110),0);
});

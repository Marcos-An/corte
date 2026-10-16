import test from 'node:test';import assert from 'node:assert/strict';
import {beginMediaHydration} from '../desktop/open-media.mjs';
const assets=[1,2,3].map(n=>({id:String(n),name:'video'+n+'.mp4',duration:9,width:160,height:90,hasAudio:true})),sources=assets.map(a=>({assetId:a.id,path:'/videos/'+a.name}));
test('montage is returned immediately; ready files do not wait for another stalled validation',async()=>{
 let release;const changes=[];const h=beginMediaHydration({assets,sources,onChange:s=>changes.push(s),register:async(_file,id,a)=>{if(id==='1')await new Promise(r=>release=r);return {...a,url:'ready:'+id,missing:false};}});
 assert.equal(h.state.pending,3);assert.ok(h.state.assets.every(a=>a.pending&&!a.url));await new Promise(r=>setImmediate(r));assert.equal(h.state.assets.find(a=>a.id==='2').url,'ready:2');assert.equal(h.state.assets.find(a=>a.id==='3').url,'ready:3');assert.equal(h.state.pending,1);release();await h.done;assert.equal(h.state.pending,0);assert.ok(changes.length>=3);
});
test('cancel retains validated media and montage descriptors without authorizing unverified paths',async()=>{
 const h=beginMediaHydration({assets,sources,register:async(_file,id,a,{signal})=>{if(id==='1')return {...a,url:'ready:1',missing:false};await new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(Error('canceled')),{once:true}));}});
 await new Promise(r=>setImmediate(r));h.cancel();await h.done;assert.equal(h.state.pending,0);assert.equal(h.state.assets[0].url,'ready:1');assert.equal(h.state.assets.length,3);assert.ok(h.state.assets.slice(1).every(a=>a.missing&&!a.url&&!a.pending));assert.equal(h.state.canceled,true);
});
test('failed files are reported independently and never acquire media URLs',async()=>{
 const h=beginMediaHydration({assets,sources,register:async(_f,id,a)=>{if(id==='2')throw Error('Tempo limite ao validar');return {...a,url:'ready:'+id};}});await h.done;assert.equal(h.state.pending,0);assert.equal(h.state.errors.length,1);assert.equal(h.state.assets[1].missing,true);assert.equal(h.state.assets[1].url,null);assert.equal(h.state.assets[0].url,'ready:1');
});

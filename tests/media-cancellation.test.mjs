import test from 'node:test';import assert from 'node:assert/strict';import {run} from '../desktop/media.mjs';
test('cancellation waits for the native process to close before releasing temporary evidence',async()=>{
 const controller=new AbortController();let pid;
 await assert.rejects(run(process.execPath,['-e','console.log(process.pid);setInterval(()=>{},1000)'],{signal:controller.signal,onData:data=>{pid=Number(data.trim());controller.abort();}}),/cancelada/);
 assert.ok(pid);assert.throws(()=>process.kill(pid,0));
});

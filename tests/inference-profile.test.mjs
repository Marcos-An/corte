import test from 'node:test';import assert from 'node:assert/strict';import {inferenceOptions,visualBackend} from '../desktop/inference-profile.mjs';
test('DirectML disables unsupported memory patterns and CPU fallback bounds oversubscription',()=>{
 const dml=inferenceOptions('dml');assert.equal(dml.session_options.executionMode,'sequential');assert.equal(dml.session_options.enableMemPattern,false);
 assert.equal(inferenceOptions('cpu',{cores:12}).session_options.intraOpNumThreads,6);
 assert.equal(inferenceOptions('cpu',{cores:1}).session_options.intraOpNumThreads,1);
 assert.equal(inferenceOptions('cpu',{cores:128}).session_options.intraOpNumThreads,6);
 assert.equal(visualBackend('win32'),'cpu');assert.equal(visualBackend('darwin'),'coreml');
});

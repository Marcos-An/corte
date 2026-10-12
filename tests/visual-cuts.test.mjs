import test from 'node:test';import assert from 'node:assert/strict';
import {decisionsToRanges,validateVisualDecision} from '../src/visual-cuts.mjs';
test('local decisions cover confirmed events through video edges instead of retaining bad border frames',()=>{
 const samples=[{time:0,decision:'remove'},{time:.25,decision:'remove'},{time:.5,decision:'keep'},{time:.75,decision:'keep'},{time:1,decision:'remove'}];
 assert.deepEqual(decisionsToRanges(samples,1.2),[[0,.375],[.875,1.2]]);
});
test('uncertainty is not silently cut; invalid or incomplete coverage is rejected',()=>{
 assert.throws(()=>decisionsToRanges([{time:0,decision:'uncertain'}],.2),/incerta/);
 assert.throws(()=>decisionsToRanges([{time:.25,decision:'remove'}],1),/cobertura/);
 assert.throws(()=>validateVisualDecision({decision:'remove',reason:42}),/inválida/);
 assert.equal(validateVisualDecision({decision:'keep',reason:'The requested action is not occurring.'}).decision,'keep');
});

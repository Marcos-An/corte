import test from 'node:test';import assert from 'node:assert/strict';import {newEditSession,recordEditStage,editSessionSummary} from '../src/edit-session.mjs';
test('skipped stages and unresolved assets never become a claim that the request was completed',()=>{
 const run=newEditSession('Prompt complexo');recordEditStage(run,1,'applied');
 recordEditStage(run,2,'skipped',{coverage:[{request:'Melona',status:'planned'}]});recordEditStage(run,3,'applied',{pendingRequests:['Gravar narração','Informar endereço']});
 const summary=editSessionSummary(run);assert.equal(summary.applied,2);assert.equal(summary.skipped,1);assert.equal(summary.pending.length,3);assert.match(summary.text,/não executadas/);
 assert.throws(()=>recordEditStage(run,4,'applied'));
});

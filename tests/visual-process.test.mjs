import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';
const module=await import('../desktop/visual-process.mjs').catch(()=>({}));
async function fixture(fn){const dir=await mkdtemp(path.join(tmpdir(),'corte-visual-process-'));try{const entry=path.join(dir,'fixture.mjs');await writeFile(entry,`import {appendFileSync} from 'node:fs';process.on('message',m=>{if(m.cancel)return;if(!m.data)return;const d=m.data;appendFileSync(d.trace,d.backend+'\\n');process.send({progress:{stage:'test-ready',pid:process.pid}});if(d.mode==='hang')return;if(d.mode==='cpu-transition-crash'){process.send({progress:{stage:'worker-diagnostic',event:'worker-start',worker:'vision',backend:'cpu'}},()=>process.kill(process.pid,'SIGKILL'));return;}if(d.mode==='fail'){process.send({error:'Modelo inválido.'},()=>process.disconnect());return;}if(d.backend!=='cpu'||d.mode==='always-crash'){process.kill(process.pid,'SIGKILL');return;}process.send({result:{frames:[],report:{backend:d.backend,childPid:process.pid,resources:d.resources}}},()=>process.disconnect());});`);await fn({entry,trace:path.join(dir,'trace'),dir});}finally{await rm(dir,{recursive:true,force:true});}}
test('real accelerator process death keeps the parent alive and retries exactly once in a separate CPU process',()=>fixture(async({entry,trace,dir})=>{
 const progress=[],r=await module.runVisualProcess({data:{trace},backend:'dml',entry,directory:dir,onProgress:p=>progress.push(p)});
 assert.equal(r.report.backend,'cpu');assert.notEqual(r.report.childPid,process.pid);assert.equal(r.report.fallback,true);assert.deepEqual((await readFile(trace,'utf8')).trim().split('\n'),['dml','cpu']);assert.equal(progress.filter(p=>p.event==='worker-exit').length,2);assert.equal(progress.find(p=>p.event==='worker-exit').outcome,'error');assert.ok(progress.some(p=>p.stage==='vision-start'));
}));
test('CPU process death fails safely without an infinite retry or partial result',()=>fixture(async({entry,trace})=>{
 await assert.rejects(module.runVisualProcess({data:{trace,mode:'always-crash'},backend:'dml',entry}),/interrompida/i);assert.deepEqual((await readFile(trace,'utf8')).trim().split('\n'),['dml','cpu']);
}));
test('reported model errors do not masquerade as GPU crashes and are not retried',()=>fixture(async({entry,trace})=>{
 await assert.rejects(module.runVisualProcess({data:{trace,mode:'fail'},backend:'dml',entry}),/Modelo inválido/);assert.equal((await readFile(trace,'utf8')).trim(),'dml');
}));
test('cancellation stops a non-responsive child, waits for exit and never starts CPU fallback',()=>fixture(async({entry,trace})=>{
 const c=new AbortController();let childPid;
 const p=module.runVisualProcess({data:{trace,mode:'hang'},backend:'dml',entry,signal:c.signal,cancelGraceMs:100,onProgress:e=>{if(e.stage==='test-ready')c.abort();if(e.pid)childPid=e.pid;}});
 await assert.rejects(p,/cancelada/);assert.ok(childPid);assert.throws(()=>process.kill(childPid,0));assert.equal((await readFile(trace,'utf8')).trim(),'dml');
}));
test('pre-cancellation never launches a process',async()=>{await assert.rejects(module.runVisualProcess({signal:AbortSignal.abort(),data:{},backend:'dml'}),/cancelada/);});

test('CPU fallback initialization crash is not misidentified as another accelerator crash',()=>fixture(async({entry,trace})=>{
 await assert.rejects(module.runVisualProcess({data:{trace,mode:'cpu-transition-crash'},backend:'dml',entry}),/interrompida/);assert.equal((await readFile(trace,'utf8')).trim(),'dml');
}));
test('the isolated runner also carries non-visual work, marking a CPU fallback on its report',()=>fixture(async({entry,trace,dir})=>{
 const progress=[],r=await module.runIsolated({data:{trace},backend:'dml',entry,worker:'speech',onProgress:p=>progress.push(p)});
 assert.equal(r.report.fallback,true);assert.ok(progress.filter(p=>p.event==='worker-start').every(p=>p.worker==='speech'));
 await assert.rejects(module.runIsolated({data:{trace,mode:'always-crash'},backend:'dml',entry,worker:'speech',crashError:'A transcrição foi interrompida.'}),/transcrição foi interrompida/);
}));

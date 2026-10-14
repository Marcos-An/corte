import {realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),repo='Marcos-An/corte';
export function validateVersion(version,current){
 const format=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
 if(!format.test(version)||!format.test(current))throw Error('Use uma versão numérica, por exemplo 0.5.5.');
 const a=version.split('.').map(BigInt),b=current.split('.').map(BigInt);const i=a.findIndex((n,i)=>n!==b[i]);
 if(i<0||a[i]<b[i])throw Error('A versão deve ser maior que a versão atual.');return version;
}
export function dispatchRelease({version,current,dryRun=false,run}){
 validateVersion(version,current);
 if(run('git',['status','--porcelain']).trim())throw Error('Commit/push das alterações antes de gerar a release.');
 const sha=run('git',['rev-parse','HEAD']).trim();
 if(run('git',['ls-remote','origin','refs/heads/main']).trim().split(/\s/)[0]!==sha)throw Error('HEAD deve estar publicado em origin/main.');
 const releases=run('gh',['api','--paginate',`repos/${repo}/releases`,'--jq','.[].tag_name']).trim().split('\n');
 for(const tag of releases)if(/^v\d+\.\d+\.\d+$/.test(tag))validateVersion(version,tag.slice(1));
 if(releases.includes('v'+version)||run('git',['ls-remote','origin','refs/tags/v'+version]).trim())throw Error('Versão já existe; não sobrescrever releases.');
 run('npm',['test']);run('npm',['run','check']);
 run('gh',['workflow','run','release.yml','--repo',repo,'--ref','main','-f','version='+version,'-f','expected_sha='+sha,'-f','dry_run='+String(dryRun)]);
 return sha;
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
 const args=process.argv.slice(2);if(args.length<1||args.length>2||(args[1]&&args[1]!=='--dry-run'))throw Error('Uso: npm run release -- 0.5.5 [--dry-run]');
 const run=(cmd,args)=>execFileSync(cmd==='npm'?process.execPath:cmd,cmd==='npm'?[process.env.npm_execpath,...args]:args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','inherit']});
 const current=JSON.parse(readFileSync(root+'package.json')).version;
 const sha=dispatchRelease({version:args[0],current,dryRun:args.includes('--dry-run'),run});
 console.log(`Workflow acionado para ${args[0]} (${sha.slice(0,7)}). ${args.includes('--dry-run')?'Somente artefatos, sem release.':'Apenas rascunho, sem publicação pública.'}\nhttps://github.com/${repo}/actions/workflows/release.yml`);
 }catch(e){console.error(e.message);process.exitCode=1;}
}

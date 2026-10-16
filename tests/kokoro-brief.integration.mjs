// Opt-in acceptance test for the Kokoro Reels brief. Real path end to end: local transcription, local visual analysis
// and search, two ChatGPT rounds, review contract, MP4 export. Sends ONLY synthetic TTS speech and public Wikimedia
// Commons photos, never user media. macOS only (TTS via `say`). Requires CORTE_TEST_CODEX_HOME (a logged-in Codex home).
import assert from 'node:assert/strict';import {mkdtemp,mkdir,rm,writeFile,copyFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {run,binaries,probe,renderProject} from '../desktop/media.mjs';import {requestHybridEdit} from '../desktop/hybrid.mjs';import * as m from '../src/project.mjs';import {clipDuration} from '../src/clip-time.mjs';
const home=process.env.CORTE_TEST_CODEX_HOME;if(!home)throw Error('Defina CORTE_TEST_CODEX_HOME; este teste envia fala sintética e fotos públicas ao ChatGPT.');
const dir=await mkdtemp(path.join(tmpdir(),'corte-kokoro-')),ffmpeg=binaries().ffmpeg,img=name=>path.join(dir,'img',name+'.jpg');
const PROMPT=`Edite este vídeo em formato vertical para Reels, com ritmo dinâmico, natural e com estética de conteúdo gastronômico.
ABERTURA:
Corte completamente o trecho original do começo em que eu apareço dizendo algo como “Oi, hoje eu tô aqui no Kokoro...” ou me apresentando no local.
O vídeo deve começar com imagens da fachada, placa ou detalhes externos do Kokoro.
Sobre essas imagens, usar uma narração em off que será adicionada depois:
“Essa semana eu fui conhecer um lugar novo aqui em Dourados: o Kokoro.”
Em seguida, continuar mostrando fachada e imagens bonitas do ambiente enquanto entra o restante da narração de abertura.
Priorizar imagens da decoração interna, especialmente os guarda-chuvas no teto e outros detalhes que mostrem que o ambiente é diferente e visualmente interessante.
Depois dessa introdução, entrar naturalmente nos trechos originais que gravei durante a visita.
RITMO E CORTES:
Eliminar pausas longas, repetições, hesitações, trechos em que demoro para concluir uma frase e momentos sem informação relevante.
Se algum trecho estiver muito lento, acelerar levemente sem deixar a fala artificial.
Cortar partes borradas, desfocadas ou visualmente ruins quando elas não forem necessárias para entender o vídeo.
Fazer uma correção leve de imagem, melhorando nitidez, exposição, contraste e equilíbrio de cores, mas mantendo aparência natural.
BEBIDA DE MELÃO:
Na parte em que provo a bebida de melão, cortar a fala em que digo que ela tem um “verde radioativo”.
Manter apenas os comentários positivos sobre a bebida, o sabor de melão e a aparência chamativa.
Quando eu falar que o sabor lembra melão, inserir rapidamente uma imagem do picolé Melona como referência visual divertida.
Existe um momento em que eu digo que escolhi a opção de melão porque não gosto muito de manga e que havia também uma bebida de manga.
Nesse trecho, manter meu áudio original, mas sobrepor a imagem/cartaz da bebida de manga.
TAKOYAKI:
Na parte em que estou comendo takoyaki, cortar completamente o momento em que acabo queimando a boca.
Manter a parte em que digo que está muito gostoso e depois mostrar o take em que abro o takoyaki para mostrar o interior.
INGREDIENTES:
Cortar qualquer trecho em que eu fale ingredientes de forma incorreta.
Se houver continuidade visual importante nesses momentos, usar imagens da comida por cima e manter somente o áudio que estiver correto.
TEMPURÁ E OUTRAS COMIDAS:
Priorizar os melhores closes, principalmente os que mostram textura, crocância, recheio e detalhes da comida.
Sempre que possível, usar imagens dos pratos enquanto meu áudio continua por cima, evitando deixar meu rosto falando por períodos muito longos.
INFORMAÇÕES SOBRE O LOCAL:
Inserir de forma discreta ao longo do vídeo:
“Kokoro — novo restaurante em Dourados”
“Do Grupo Uchida”
“Endereço: [INSERIR ENDEREÇO]”
COMPETIÇÃO DE RAMEN:
Próximo ao final, inserir uma nova narração em off sobre a competição de ramen.
Enquanto essa narração acontece, usar imagens de ramen, do restaurante ou do ambiente.
Inserir também na tela:
“2ª edição da competição de ramen”
“[INSERIR DATA / PERÍODO / INFORMAÇÕES OFICIAIS]”
FINALIZAÇÃO:
Finalizar com uma imagem bonita do restaurante, comida ou fachada, junto da última frase da narração.
O vídeo deve transmitir a sensação de que eu realmente fui conhecer um lugar novo, experimentei as comidas e estou compartilhando a experiência de forma espontânea.
Não exagerar em transições ou efeitos. Preferir cortes limpos, pequenos zooms quando necessário e sobreposições de imagem que ajudem a ilustrar o que estou falando.`;
const PHOTOS={facade:'restaurant facade sign night',umbrellas:'umbrellas ceiling decoration',interior:'japanese restaurant interior',melon:'melon soda',mango:'mango juice glass',takoyaki:'takoyaki',inside:{title:'File:たこやん half-eaten.jpg'},tempura:'tempura shrimp',ramen:'ramen bowl'};
// Clip script mirroring the brief: speech clips carry the lines the prompt refers to; the rest is silent b-roll.
const CLIPS=[
 ['intro','interior','Oi, hoje eu tô aqui no Kokoro, um restaurante novo aqui em Dourados.'],
 ['fachada','facade',6],['guarda-chuvas','umbrellas',6],['ambiente','interior',5],
 ['melao','melon','Essa é a bebida de melão. Ela tem um verde radioativo, mas o sabor é muito bom, lembra muito melão de verdade. Eu escolhi a de melão porque não gosto muito de manga, mas também tinha uma bebida de manga.'],
 ['cartaz-manga','poster',5],
 ['takoyaki','takoyaki','Agora o takoyaki. Ai, ai, queimei a boca, tá muito quente! Mas nossa, está muito gostoso.'],
 ['takoyaki-aberto','inside',5],
 ['tempura','tempura','Esse é o tempurá de camarão com chocolate. Muito crocante e sequinho.'],
 ['ramen','ramen',5],['borrado','tempura',4],['final','facade',5]];
async function photos(){
 await mkdir(path.join(dir,'img'));
 for(const [name,query] of Object.entries(PHOTOS)){
  const pick=query.title?`titles=${encodeURIComponent(query.title)}`:`generator=search&gsrsearch=${encodeURIComponent(query+' filetype:bitmap')}&gsrnamespace=6&gsrlimit=3`,api=`https://commons.wikimedia.org/w/api.php?action=query&${pick}&prop=imageinfo&iiprop=url&iiurlwidth=1080&format=json`,headers={'User-Agent':'corte-test/1.0 (local acceptance test)'};
  const pages=Object.values((await (await fetch(api,{headers})).json()).query?.pages||{}).sort((a,b)=>a.index-b.index),url=pages.map(p=>p.imageinfo?.[0]?.thumburl).find(u=>/\.(jpe?g|png)(\?|$)/i.test(u||''));
  if(!url)throw Error('Foto pública indisponível: '+JSON.stringify(query));await writeFile(img(name),Buffer.from(await (await fetch(url,{headers})).arrayBuffer()));
 }
 // The brief speaks of a mango drink poster: a readable one, so the evidence can actually prove it.
 const font=path.resolve(import.meta.dirname,'../vendor/fonts/Anton-Regular.ttf');
 await run(ffmpeg,['-v','error','-y','-i',img('mango'),'-vf',`scale=720:-2,drawbox=x=0:y=ih-230:w=iw:h=230:color=0xf59e0b@0.92:t=fill,drawtext=fontfile=${font}:text='SUCO DE MANGA':fontcolor=white:fontsize=78:x=(w-tw)/2:y=h-205,drawtext=fontfile=${font}:text='NOVIDADE KOKORO':fontcolor=0x7c2d12:fontsize=46:x=(w-tw)/2:y=h-95`,'-frames:v','1',img('poster')]);
}
async function clip(name,photo,content,index){
 const out=path.join(dir,`${String(index+1).padStart(2,'0')}-${name}.mp4`),video=['-loop','1','-i',img(photo)],blur=name==='borrado'?',boxblur=12:2':'';
 let audio=['-f','lavfi','-i','anoisesrc=color=pink:amplitude=0.004:sample_rate=48000'],seconds=content;
 if(typeof content==='string'){const aiff=path.join(dir,name+'.aiff');execFileSync('say',['-v','Luciana','-o',aiff,content]);seconds=(await probe(aiff)).duration+.6;audio=['-i',aiff];}
 await run(ffmpeg,['-v','error','-y',...video,...audio,'-t',String(seconds),'-vf',`${photo==='poster'?'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=0x1c1917':'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280'},zoompan=z='min(zoom+0.0008,1.08)':d=1:s=720x1280:fps=30${blur}`,'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-af','apad','-shortest',out]);
 return out;
}
const words=(t,asset)=>t.find(x=>x.assetId===asset)?.words||[],fold=s=>s.toLowerCase().normalize('NFD').replace(/[^a-z]/g,'');
const plays=(project,assetId,time)=>{let t=0;for(const c of project.clips){if(c.assetId===assetId&&time>=c.in&&time<c.out)return t+(time-c.in)/(c.speed??1);t+=clipDuration(c);}return null;};
try{
 await photos();
 const melona=path.join(dir,'melona.png');await run(ffmpeg,['-v','error','-y','-f','lavfi','-i','color=c=0x9be37a:s=600x600','-vf',"drawbox=x=250:y=80:w=100:h=380:color=0x7ccf5a:t=fill,drawbox=x=285:y=460:w=30:h=110:color=0xd9b38c:t=fill",'-frames:v','1',melona]);
 let project=m.createProject('Kokoro');const registry=new Map();
 for(const [i,[name,photo,content]] of CLIPS.entries()){const file=await clip(name,photo,content,i),id='a'+(i+1);project=m.addClip(m.addAsset(project,{id,name:path.basename(file),...await probe(file)}),id,'c'+(i+1));registry.set(id,{path:file});}
 project=m.addAsset(project,{id:'melona',name:'Picolé Melona.png',kind:'image',...await probe(melona),duration:5,hasAudio:false});registry.set('melona',{path:melona});
 const isolated=path.join(dir,'codex-home');await mkdir(isolated);await copyFile(path.join(home,'auth.json'),path.join(isolated,'auth.json'));
 const started=performance.now(),progress=[];let transcripts;
 const out=await requestHybridEdit({project,prompt:PROMPT,shareEvidence:true,registry,home:isolated,cache:path.join(dir,'cache'),step:.5,onProgress:p=>{if(p.stage&&p.stage!=='worker-diagnostic')progress.push(p.stage);},
  transcribe:async options=>{transcripts=await (await import('../desktop/transcribe.mjs')).transcribeLocally(options);return transcripts;}});
 const elapsedMs=Math.round(performance.now()-started),edited=m.applyPlan(project,out.plan),ops=out.plan.operations;
 const speech=(clipNo,pattern)=>words(transcripts,'a'+clipNo).find(w=>pattern.test(fold(w.text))),kept=(clipNo,pattern)=>{const w=speech(clipNo,pattern);return w?plays(edited,'a'+clipNo,(w.start+w.end)/2)!==null:null;};
 const overlay=(type,asset)=>ops.find(o=>o.type===type&&o.layer.assetId===asset),texts=ops.filter(o=>o.type==='add_text').map(o=>o.layer.text).join(' | ');
 const melonWord=words(transcripts,'a5').filter(w=>/^melao/.test(fold(w.text)))[1],melonAt=melonWord&&plays(edited,'a5',melonWord.start),mangaWord=words(transcripts,'a5').find(w=>/^manga/.test(fold(w.text))),mangaAt=mangaWord&&plays(edited,'a5',mangaWord.start);
 const order=edited.clips.map(c=>c.assetId),firstSpeech=order.findIndex(a=>['a1','a5','a7','a9'].includes(a));
 const checks={
  vertical:edited.aspect==='9:16',
  introCut:kept(1,/^kokoro|^dourados/)!==true&&kept(1,/^oi$/)!==true,
  opensOnPlace:['a2','a3','a4','a12'].includes(order[0]),
  placeBeforeSpeech:firstSpeech<0||order.slice(0,firstSpeech).some(a=>a==='a3'),
  radioactiveCut:kept(5,/^radioativ/)===false,
  positivesKept:kept(5,/^sabor/)===true,
  melonaOverMelon:!!overlay('add_image','melona')&&melonAt!=null&&Math.abs(overlay('add_image','melona').layer.start-melonAt)<2.5,
  mangoPosterOverManga:!!overlay('add_video','a6')&&mangaAt!=null&&overlay('add_video','a6').layer.start<=mangaAt+1.5&&overlay('add_video','a6').layer.end>=mangaAt-.5,
  burnCut:kept(7,/^queim/)===false,
  tastyKept:kept(7,/^gostos/)===true,
  insideAfterTasty:(()=>{const g=speech(7,/^gostos/),at=g&&plays(edited,'a7',g.start),inside=order.indexOf('a8'),before=edited.clips.slice(0,Math.max(0,inside)).reduce((n,c)=>n+clipDuration(c),0),layer=overlay('add_video','a8');return at!=null&&(inside>=0&&before>=at-.5||!!layer&&layer.layer.start>=at-1);})(),
  wrongIngredientHandled:kept(9,/^chocolat/)===false||out.pendingRequests.some(s=>/ingredient/i.test(s)),
  placeTexts:/kokoro/i.test(texts)&&/uchida/i.test(texts)&&/endere/i.test(texts),
  placeholdersPending:out.pendingRequests.some(s=>s.includes('[INSERIR')),
  // Narration is out of scope for AI editing (it has its own feature): ignored, never reserved, muted or pending.
  narrationIgnored:!out.pendingRequests.some(s=>/narra/i.test(s))&&(out.coverage||[]).filter(c=>/narra/i.test(c.request)).every(c=>c.status==='not_needed'),
  blurryCut:!order.includes('a11'),
  ramenNearEnd:order.lastIndexOf('a10')>=order.length-4||ops.some(o=>o.type==='add_video'&&o.layer.assetId==='a10'),
  lightGrade:ops.some(o=>o.type==='update'&&o.adjustments||o.type==='adjust_ranges'&&o.patch.adjustments),
  noTransitionOverload:ops.filter(o=>/transition/.test(o.type)&&o.effect!=='none').length<=3,
 };
 const mp4=path.join(dir,'kokoro.mp4');await renderProject(edited,registry,mp4);const exported=await probe(mp4);checks.exportedMp4=Math.abs(exported.duration-m.duration(edited))<.2&&exported.height>exported.width;
 if(process.env.CORTE_KEEP_KOKORO)await writeFile(path.join(dir,'result.json'),JSON.stringify({plan:out.plan,coverage:out.coverage,pending:out.pendingRequests,transcripts,timeline:edited.clips.map(c=>[c.assetId,c.in,c.out,c.speed??1])},null,1));
 const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
 console.log(JSON.stringify({passed:!failed.length,failed,checks,recognizer:transcripts[0]?.recognizer,visualSearch:out.visualSearch,searchMatches:out.searchMatches,rounds:out.rounds,elapsedMs,duration:m.duration(edited),operations:ops.map(o=>o.type),coverage:out.coverage?.map(c=>`${c.kind}:${c.status}:${c.request}`),pending:out.pendingRequests,warnings:out.analysisWarnings,texts},null,1));
 assert.deepEqual(failed,[],'every section of the brief is honoured or honestly pending');
}finally{if(!process.env.CORTE_KEEP_KOKORO)await rm(dir,{recursive:true,force:true});else console.log('kept',dir);}

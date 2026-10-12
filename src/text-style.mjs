// One description of a text look, read by the preview here and by toAss for the export.
// Sizes are percentages of the font size, so both sides scale the same way at any resolution.
const look=(style)=>({preset:'clean',color:'#ffffff',strokeColor:'#101113',strokeWidth:0,shadow:0,shadowColor:'#000000',bold:false,italic:false,uppercase:false,spacing:0,boxColor:'#101113',boxOpacity:85,glow:0,glowColor:'#00e5ff',hollow:false,accentLast:false,accent:'#ffd84a',...style});
// Each preset is a different idea, not a recolour: colours are tuned afterwards in Editar.
// Presets may carry a font; the rest keep the font the user already picked.
export const TEXT_PRESETS=[
 {id:'simple',name:'Simples',hint:'Texto limpo',style:look({})},
 {id:'outline',name:'Contorno',hint:'Clássico de legenda',style:look({preset:'outline',strokeWidth:12})},
 {id:'shadow',name:'Sombra',hint:'Leitura sobre qualquer fundo',style:look({shadow:7})},
 {id:'box',name:'Caixa',hint:'Fundo atrás de cada linha',style:look({preset:'boxed',boxOpacity:90})},
 {id:'neon',name:'Neon',hint:'Brilho em volta das letras',style:look({color:'#f4feff',glow:9,glowColor:'#00e5ff'})},
 {id:'hollow',name:'Vazado',hint:'Só o contorno',style:look({preset:'outline',strokeColor:'#ffffff',strokeWidth:4,hollow:true,uppercase:true,spacing:4})},
 {id:'retro',name:'Retrô',hint:'Sombra dura deslocada',style:look({preset:'outline',strokeWidth:5,shadow:12,shadowColor:'#ff3d6e',bold:true})},
 {id:'keyword',name:'Palavra-chave',hint:'Última palavra em destaque',style:look({preset:'outline',strokeWidth:10,accentLast:true,accent:'#ffd84a',bold:true})},
 {id:'editorial',name:'Editorial',hint:'Maiúsculas finas e espaçadas',font:'Inter',style:look({uppercase:true,spacing:28,shadow:3})},
 {id:'headline',name:'Manchete',hint:'Impacto máximo',font:'Anton',style:look({preset:'outline',strokeColor:'#000000',strokeWidth:18,uppercase:true})},
 {id:'signature',name:'Assinatura',hint:'Manuscrito elegante',font:'Pacifico',style:look({shadow:5})},
 {id:'typewriter',name:'Máquina',hint:'Papel e tinta',font:'Special Elite',style:look({preset:'boxed',color:'#1d1b17',boxColor:'#f4ecd8',boxOpacity:100})}
].map(p=>p.font?{...p,style:{...p.style,font:p.font}}:p);

const LOOK_KEYS=Object.keys(look({}));
export function presetOf(style){return TEXT_PRESETS.find(p=>LOOK_KEYS.every(k=>p.style[k]===style[k]))?.id||null;}
const rgba=(hex,opacity)=>`rgba(${parseInt(hex.slice(1,3),16)}, ${parseInt(hex.slice(3,5),16)}, ${parseInt(hex.slice(5,7),16)}, ${opacity/100})`;
const px=v=>Number(v.toFixed(2))+'px';
// Styles saved before these options existed (no strokeWidth / boxColor) keep their old look.
export function textAppearance(style,size){
 const boxed=style.preset==='boxed',modernBox=boxed&&style.boxColor!==undefined,shadow=style.shadow?size*style.shadow/100:0,shadowColor=style.shadowColor||'#000000';
 const stroke=boxed?'0px #101113':style.strokeWidth===undefined?(style.preset==='clean'?0:2)+'px #101113':px(2*size*style.strokeWidth/100)+' '+(style.strokeColor||'#101113');
 const node={fontWeight:style.bold?'700':'400',fontStyle:style.italic?'italic':'normal',textTransform:style.uppercase?'uppercase':'none',letterSpacing:style.spacing?px(size*style.spacing/100):'normal',
  webkitTextStroke:stroke,webkitTextFillColor:style.hollow?'transparent':'',textShadow:[style.glow?`0 0 ${px(size*style.glow/100)} ${style.glowColor||'#00e5ff'}, 0 0 ${px(2*size*style.glow/100)} ${style.glowColor||'#00e5ff'}`:'',shadow&&!modernBox?`${px(shadow)} ${px(shadow)} 0 ${shadowColor}`:''].filter(Boolean).join(', ')||'none',background:boxed&&!modernBox?'#101113cc':'transparent'};
 const box=modernBox?{background:rgba(style.boxColor,style.boxOpacity??100),padding:px(size*.25),boxDecorationBreak:'clone',webkitBoxDecorationBreak:'clone',boxShadow:shadow?`${px(shadow)} ${px(shadow)} 0 ${shadowColor}`:'none'}:null;
 return {node,box};
}
// Older styles have no stroke or box fields; spell them out before the first edit so every control has a value.
export function fullLook(style){return look({...style,strokeWidth:style.strokeWidth??(style.preset==='outline'?12:0)});}

// Entrance/exit animations are linear so the preview matches ASS \\fad, \\move and \\t exactly.
// Offsets are % of the canvas; scale is the size at the far end of the animation.
export const ANIMATION_SECONDS=.4;
export const ENTER_ANIMATIONS=[{id:'none',name:'Nenhuma'},{id:'fade',name:'Surgir'},{id:'rise',name:'Subir'},{id:'drop',name:'Descer'},{id:'left',name:'Da esquerda'},{id:'right',name:'Da direita'},{id:'pop',name:'Pop'},{id:'zoom',name:'Zoom'}];
export const EXIT_ANIMATIONS=[{id:'none',name:'Nenhuma'},{id:'fade',name:'Sumir'},{id:'rise',name:'Subir'},{id:'drop',name:'Descer'},{id:'left',name:'Para a esquerda'},{id:'right',name:'Para a direita'},{id:'pop',name:'Encolher'},{id:'zoom',name:'Ampliar'}];
const ENTER_MOTION={fade:{},rise:{y:8},drop:{y:-8},left:{x:-12},right:{x:12},pop:{scale:.5},zoom:{scale:1.5}};
const EXIT_MOTION={fade:{},rise:{y:-8},drop:{y:8},left:{x:-12},right:{x:12},pop:{scale:.5},zoom:{scale:1.5}};
export const ANIMATION_IDS=ENTER_ANIMATIONS.map(a=>a.id);
export function animationSpan(start,end){return Math.min(ANIMATION_SECONDS,(end-start)/2);}
export function motionOf(kind,id){return id&&id!=='none'?(kind==='enter'?ENTER_MOTION:EXIT_MOTION)[id]:null;}
export function animationAt(style,start,end,time){
 const d=animationSpan(start,end),enter=motionOf('enter',style.enter),exit=motionOf('exit',style.exit);
 let motion=null,p=1;
 if(enter&&time<start+d){motion=enter;p=(time-start)/d;}else if(exit&&time>end-d){motion=exit;p=(end-time)/d;}
 if(!motion)return {opacity:1,x:0,y:0,scale:1};
 p=Math.max(0,Math.min(1,p));const r=1-p,round=v=>Math.round(v*1000)/1000;
 return {opacity:round(p),x:round((motion.x||0)*r),y:round((motion.y||0)*r),scale:round(motion.scale?1+(motion.scale-1)*r:1)};
}

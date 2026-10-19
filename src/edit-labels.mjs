const number=n=>Number(n.toFixed(2)).toLocaleString('pt-BR');
export function describePatch(patch){
 const names={brightness:'Brilho',contrast:'Contraste',saturation:'Saturação',temperature:'Temperatura',sharpness:'Nitidez',volume:'Volume',fadeIn:'Entrada',fadeOut:'Saída',start:'Posição',in:'Início',out:'Fim'};
 return Object.entries(patch).flatMap(([k,v])=>{
  if(k==='adjustments')return [describePatch(v)];
  if(k==='speed')return [`Velocidade ${number(v)}×`];
  if(k==='zoom')return [`Zoom ${number(v.from*100)}–${number(v.to*100)}%`];
  if(k==='crop')return ['Enquadramento'];
  if(k==='background')return [`Fundo ${({black:'preto',blur:'borrado',color:'colorido'})[v]||v}`];
  if(k==='backgroundColor')return [`Cor ${v}`];
  if(typeof v==='number'&&names[k])return [`${names[k]} ${number(['fadeIn','fadeOut','start','in','out'].includes(k)?v:v*100)}${['fadeIn','fadeOut','start','in','out'].includes(k)?' s':'%'}`];
  return [];
 }).join(' · ');
}

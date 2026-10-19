export const MAX_BLUR_LAYERS=8;
export const BLUR_FIELDS=['start','end','x','y','width','height','rotation','opacity','strength','blurShape'];
export const blurRadius=(layer,width)=>width*layer.strength/2000;
export function validateBlurLayer(t){
 if(Object.keys(t).some(k=>!['id','type','fill','stroke','strokeWidth','keyframes','motion',...BLUR_FIELDS].includes(k))||!Number.isFinite(t.strength)||t.strength<1||t.strength>100||!['rectangle','ellipse'].includes(t.blurShape)||t.fill!==null||t.stroke!==null||t.strokeWidth!==0)throw Error('Área de desfoque inválida. Use intensidade de 1 a 100 e região retangular ou oval.');
}
export function blurLayer(layer){return {strength:60,blurShape:'ellipse',...structuredClone(layer),type:'blur',fill:null,stroke:null,strokeWidth:0};}

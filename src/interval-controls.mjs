export const INTERVAL_CONTROLS={
 volume:{label:'Volume',min:0,max:200,initial:100,step:1},
 brightness:{label:'Brilho',min:-100,max:100,initial:0,step:1},
 contrast:{label:'Contraste',min:0,max:200,initial:100,step:1},
 saturation:{label:'Saturação',min:0,max:200,initial:100,step:1},
 temperature:{label:'Temperatura',min:-100,max:100,initial:0,step:1},
 sharpness:{label:'Nitidez',min:0,max:100,initial:0,step:1},
 speed:{label:'Velocidade',min:25,max:400,initial:100,step:5},
 zoom:{label:'Zoom suave',min:100,max:200,initial:100,step:1},
 eqLow:{label:'Graves do áudio',min:-12,max:12,initial:0,step:.5,unit:'dB'},
 eqMid:{label:'Clareza do áudio',min:-12,max:12,initial:0,step:.5,unit:'dB'},
 eqHigh:{label:'Agudos do áudio',min:-12,max:12,initial:0,step:.5,unit:'dB'},
 eqCut:{label:'Corte de graves',min:0,max:200,initial:0,step:10,unit:'Hz'},
};
export function intervalPatch(property,value){
 const control=INTERVAL_CONTROLS[property];if(!control||!Number.isFinite(value)||value<control.min||value>control.max)throw Error('Ajuste de intervalo inválido.');
 if(property.startsWith('eq'))return {audioEQ:{[({eqLow:'low',eqMid:'mid',eqHigh:'high',eqCut:'highpass'})[property]]:value}};
 if(property==='volume'||property==='speed')return {[property]:value/100};
 if(property==='zoom')return {zoom:{from:1,to:value/100}};
 return {adjustments:{[property]:value/100}};
}

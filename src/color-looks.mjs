export const COLOR_LOOKS=[
 {id:'natural',name:'Natural',adjustments:{brightness:.02,contrast:1.04,saturation:1.03,temperature:0,sharpness:.12}},
 {id:'food',name:'Comida',adjustments:{brightness:.03,contrast:1.08,saturation:1.1,temperature:.06,sharpness:.22}},
 {id:'warm',name:'Quente',adjustments:{brightness:.02,contrast:1.03,saturation:1.04,temperature:.25,sharpness:.08}},
 {id:'mono',name:'P&B',adjustments:{brightness:.02,contrast:1.12,saturation:0,temperature:0,sharpness:.12}}
];
export function colorLook(id){const look=COLOR_LOOKS.find(l=>l.id===id);if(!look)throw Error('Visual desconhecido.');return structuredClone(look.adjustments);}

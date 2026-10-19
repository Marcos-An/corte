// Language describes the source audio, never a translation target.
export const SPEECH_LANGUAGES=[
 {id:'pt',label:'Português',model:'portuguese'},
 {id:'auto',label:'Detectar idioma',model:null},
 {id:'en',label:'Inglês',model:'english'},
 {id:'es',label:'Espanhol',model:'spanish'},
 {id:'fr',label:'Francês',model:'french'},
 {id:'it',label:'Italiano',model:'italian'},
 {id:'de',label:'Alemão',model:'german'},
 {id:'ja',label:'Japonês',model:'japanese'}
];
export const SPEECH_LANGUAGE_IDS=SPEECH_LANGUAGES.map(l=>l.id);
export function speechLanguage(project){
 const value=project.speechLanguage===undefined?'pt':project.speechLanguage;
 if(!SPEECH_LANGUAGE_IDS.includes(value))throw Error('Idioma do áudio inválido.');
 return value;
}
export function speechOptions(language='pt'){
 const selected=SPEECH_LANGUAGES.find(l=>l.id===language);if(!selected)throw Error('Idioma do áudio inválido.');
 return {...(selected.model?{language:selected.model}:{}),task:'transcribe',return_timestamps:'word'};
}

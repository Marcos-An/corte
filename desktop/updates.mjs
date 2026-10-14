// electron-updater owns HTTPS, checksums, differential downloads and installation.
export function createUpdates({updater,prepare,blocked,installedVersion,notify=()=>{}}){
 let state={phase:'idle',installedVersion},checking=false,installing=false;
 const publish=(phase,extra={})=>{state={phase,installedVersion,...extra};notify({...state});};
 updater.autoDownload=true;updater.autoInstallOnAppQuit=true;updater.allowPrerelease=true;updater.allowDowngrade=false;
 updater.on('checking-for-update',()=>publish('checking'));
 updater.on('update-not-available',()=>publish('current'));
 updater.on('update-available',info=>publish('downloading',{version:info.version,percent:0}));
 updater.on('download-progress',info=>publish('downloading',{version:state.version,percent:Math.floor(Math.max(0,Math.min(100,Number(info.percent)||0)))}));
 updater.on('update-downloaded',info=>publish('ready',{version:info.version}));
 updater.on('error',()=>{installing=false;publish('error');}); // Do not expose URLs, local paths or credentials.
 return {
  status:()=>({...state}),
  async check(){
   if(checking||installing||['ready','downloading'].includes(state.phase))return;
   checking=true;publish('preparing');
   try{await prepare();await updater.checkForUpdates();}catch{publish('error');}finally{checking=false;}
  },
  install(){
   if(blocked())throw Error('Salve o projeto e conclua a operação atual antes de atualizar.');
   if(state.phase!=='ready'||installing)throw Error('A atualização ainda não está pronta.');
   installing=true;try{updater.quitAndInstall(false,true);return true;}catch{installing=false;publish('error');throw Error('Não foi possível instalar. Tente novamente.');}
  }
 };
}

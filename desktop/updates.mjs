// electron-updater owns HTTPS, checksums, differential downloads and installation.
export function createUpdates({updater,prepare,blocked,installedVersion,notify=()=>{},busy=()=>false}){
 let state={phase:'idle',installedVersion},checking=false,installing=false,availableVersion=null;
 const publish=(phase,extra={})=>{state={phase,installedVersion,...extra};notify({...state});};
 updater.autoDownload=false;updater.autoInstallOnAppQuit=true;updater.allowPrerelease=true;updater.allowDowngrade=false;
 updater.on('checking-for-update',()=>publish('checking'));
 updater.on('update-not-available',()=>publish('current'));
 updater.on('update-available',info=>{availableVersion=info.version;publish('preparing',{version:info.version});});
 updater.on('download-progress',info=>publish('downloading',{version:state.version,percent:Math.floor(Math.max(0,Math.min(100,Number(info.percent)||0)))}));
 updater.on('update-downloaded',info=>publish('ready',{version:info.version}));
 updater.on('error',()=>{installing=false;publish('error');}); // Do not expose URLs, local paths or credentials.
 return {
  status:()=>({...state}),
  async check(){
   if(checking||installing||['ready','downloading'].includes(state.phase))return;
   if(busy()){publish('waiting');return;}checking=true;availableVersion=null;publish('checking');
   try{await updater.checkForUpdates();if(availableVersion){if(busy()){publish('waiting',{version:availableVersion});return;}await prepare();if(busy()){publish('waiting',{version:availableVersion});return;}publish('downloading',{version:availableVersion,percent:0});await updater.downloadUpdate();}}catch{publish('error');}finally{checking=false;}
  },
  install(){
   if(blocked())throw Error('Salve o projeto e conclua a operação atual antes de atualizar.');
   if(state.phase!=='ready'||installing)throw Error('A atualização ainda não está pronta.');
   installing=true;try{updater.quitAndInstall(true,true);return true;}catch{installing=false;publish('error');throw Error('Não foi possível instalar. Tente novamente.');}
  }
 };
}

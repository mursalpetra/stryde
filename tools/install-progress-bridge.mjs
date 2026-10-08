import fs from 'node:fs';
let account=fs.readFileSync('account-cloud.js','utf8');
const marker='  if (rootElement) new MutationObserver(paintButton)';
const api=`
  // Authenticated, owner-scoped media operations. No auth token or service key leaves this closure.
  window.strydeAccountStatus = () => ({signedIn:Boolean(user),userId:user?.id||null,ready,conflict:Boolean(conflict),status:syncStatus});
  async function photoUser() {
    if (!client || !user) { openAccount(); throw Error('Log in before uploading private photos.'); }
    if (conflict) throw Error('Resolve the account sync choice before saving photos.');
    const {data,error}=await client.auth.getUser();
    if(error||!data.user||data.user.id!==user.id)throw Error('Please sign in again.');
    return data.user.id;
  }
  const photoReference = meta => {
    if(!['goal','benchmark'].includes(meta.reference_type)||!/^[a-zA-Z0-9_-]{1,120}$/.test(meta.reference_id||''))throw Error('Choose a saved goal or benchmark first.');
  };
  window.strydePrivatePhotos = {
    async list(type,reference) {
      const uid=await photoUser(); photoReference({reference_type:type,reference_id:reference});
      const {data,error}=await client.from('stryde_photo_entries').select('id,reference_type,reference_id,stage,view_label,photo_date,caption,object_path').eq('user_id',uid).eq('reference_type',type).eq('reference_id',reference).order('photo_date',{ascending:true});
      if(error)throw Error('Unable to load private photos.');
      if(user?.id!==uid)throw Error('Account changed. Reopen this page.');
      return data||[];
    },
    async upload(blob,meta) {
      const uid=await photoUser();photoReference(meta);
      if(!(blob instanceof Blob)||blob.type!=='image/jpeg'||blob.size>4194304)throw Error('Use a JPEG photo under 4 MB after compression.');
      if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(meta.photo_date||''))throw Error('Choose a photo date.');
      const id=crypto.randomUUID(),path=uid+'/'+id+'.jpg';
      const {error:uploadError}=await client.storage.from('stryde-private-photos').upload(path,blob,{upsert:false,contentType:'image/jpeg',cacheControl:'0'});
      if(uploadError)throw Error('Photo upload failed. Check your connection and retry.');
      if(user?.id!==uid)throw Error('Account changed. Reopen this page before continuing.');
      const row={id,user_id:uid,reference_type:meta.reference_type,reference_id:meta.reference_id,stage:['baseline','followup','progress'].includes(meta.stage)?meta.stage:'progress',view_label:['front','side','back','other'].includes(meta.view_label)?meta.view_label:'other',photo_date:meta.photo_date,caption:String(meta.caption||'').slice(0,500),object_path:path};
      const {error}=await client.from('stryde_photo_entries').insert(row);
      if(error){await client.storage.from('stryde-private-photos').remove([path]);throw Error('Photo details could not be saved. Please retry.');}
      return {...row,user_id:undefined};
    },
    async download(path) {
      const uid=await photoUser();
      if(typeof path!=='string'||!path.startsWith(uid+'/')||path.includes('..'))throw Error('Photo access denied.');
      const {data,error}=await client.storage.from('stryde-private-photos').download(path);
      if(error||user?.id!==uid)throw Error('Unable to open this private photo.');
      return data;
    },
    async remove(id) {
      const uid=await photoUser();
      const {data,error}=await client.from('stryde_photo_entries').select('object_path').eq('id',id).eq('user_id',uid).single();
      if(error||!data.object_path.startsWith(uid+'/'))throw Error('Photo not found for this account.');
      const deleted=await client.storage.from('stryde-private-photos').remove([data.object_path]);
      if(deleted.error)throw Error('Unable to delete photo. Please retry.');
      const result=await client.from('stryde_photo_entries').delete().eq('id',id).eq('user_id',uid);
      if(result.error)throw Error('The image was removed; its details could not be cleared yet.');
    }
  };
`;
if(!account.includes('window.strydePrivatePhotos')){
 if(!account.includes(marker))throw Error('Account integration marker not found');
 account=account.replace(marker,api+'\n'+marker);
 account=account.replace('    user = next;\n    paintButton();',"    user = next;\n    if(changed) window.dispatchEvent(new CustomEvent('stryde-account-change',{detail:{userId:user?.id||null}}));\n    paintButton();");
 fs.writeFileSync('account-cloud.js',account);
}
let runs=fs.readFileSync('strava-runs.js','utf8');
if(!runs.includes('window.strydeStravaSnapshot')){
 runs=runs.replace("const signedIn=()=>Boolean(ROOT?.querySelector('.stryde-account-button.is-signed-in'));", "const signedIn=()=>window.strydeAccountStatus?window.strydeAccountStatus().signedIn:Boolean(ROOT?.querySelector('.stryde-account-button.is-signed-in'));");
 runs=runs.replace('const value=signedIn();',"const value=window.strydeAccountStatus?.().userId||null;");
 runs=runs.replace('busy=false;paint();}}',"busy=false;paint();window.dispatchEvent(new Event('stryde-runs-changed'));}}");
 const anchor='  window.strydeConnectStrava=connect;';
 if(!runs.includes(anchor))throw Error('Run bridge marker not found');
 runs=runs.replace(anchor,"  window.strydeStravaSnapshot=()=>({rows:signedIn()?rows.map(a=>({...a})):[],connected:signedIn()&&connected,loaded:Boolean(lastRead)&&!busy,busy,userId:window.strydeAccountStatus?.().userId||null,limited:rows.length>=50});\n  window.strydeMountRuns=mount;\n"+anchor);
 fs.writeFileSync('strava-runs.js',runs);
}

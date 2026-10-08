/* Private Strava run history, visible in Progress and connection settings.
 * Records stay in memory; never embed athlete records in the published source.
 */
(() => {
  'use strict';
  const ROOT=document.getElementById('root');
  let rows=[],connected=false,busy=false,notice='',lastRead=0,authSeen=null,serial=0;
  const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const signedIn=()=>Boolean(ROOT?.querySelector('.stryde-account-button.is-signed-in'));
  const number=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
  const duration=v=>{const n=number(v);if(n===null||n<0)return '—';const s=Math.round(n);return s>=3600?Math.floor(s/3600)+':'+String(Math.floor(s/60)%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0'):Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
  const distance=v=>number(v)===null?'—':(Number(v)/1000).toFixed(2);
  const pace=a=>number(a.distance_m)>0&&number(a.moving_time_seconds)>0?duration(Number(a.moving_time_seconds)/(Number(a.distance_m)/1000)):'—';
  const localDate=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'Date unavailable';
  const pages=()=>view==='progress'||view==='strava';
  function cardMarkup(){
    const authorized=signedIn();
    const button=authorized?(connected?'<button class="btn orange" data-run-action="sync" '+(busy?'disabled':'')+'>Sync from Strava</button>':'<button class="btn orange" data-run-action="connect" '+(busy?'disabled':'')+'>Connect Strava</button>'):'<button class="btn orange" data-run-action="login">Log in to see runs</button>';
    const cards=rows.map(a=>'<article class="stryde-run"><div class="stryde-run-title"><div><strong>'+html(a.name||'Run')+'</strong><time>'+html(localDate(a.started_at))+'</time></div><span class="stryde-run-source">STRAVA</span></div><div class="stryde-run-stats"><div><small>Distance</small><strong>'+distance(a.distance_m)+' <em>km</em></strong></div><div><small>Moving pace</small><strong>'+pace(a)+' <em>/km</em></strong></div><div><small>Moving time</small><strong>'+duration(a.moving_time_seconds)+'</strong></div><div><small>Total time</small><strong>'+duration(a.elapsed_time_seconds)+'</strong></div></div><div class="stryde-run-bottom"><span>Elevation '+(number(a.elevation_m)===null?'—':Math.round(a.elevation_m)+' m')+'</span>'+(number(a.average_heartrate)===null?'':'<span>Avg heart rate '+Math.round(a.average_heartrate)+' bpm</span>')+(String(a.activity_id||'').match(/^\d+$/)?'<a href="https://www.strava.com/activities/'+a.activity_id+'" target="_blank" rel="noopener">View on Strava ↗</a>':'')+'</div></article>').join('');
    const empty=authorized?(busy?'Loading your runs…':connected?'No running activities imported yet. Tap Sync from Strava.':'Authorize Strava once, then import your runs here.'):'Your run history is private. Log in to your STRYDE account to view it.';
    return '<div class="stryde-runs-head"><div><div class="eyebrow">RUNNING HISTORY</div><h3>Runs · Strava</h3></div>'+button+'</div><p class="stryde-runs-status" role="status">'+html(notice||(authorized?(connected?'Strava connected':'Checking your connection…'):'Not signed in'))+'</p>'+(cards||'<p class="stryde-runs-empty">'+html(empty)+'</p>')+'<div class="stryde-runs-footer"><span>'+(rows.length?rows.length+' imported run'+(rows.length===1?'':'s')+' shown':'')+'</span>'+(authorized?'<button class="stryde-runs-link" data-run-action="refresh" '+(busy?'disabled':'')+'>Refresh saved runs</button>':'')+'</div><p class="muted">Actual Strava results, separate from planned distances and gym logs. Moving pace uses moving time. Total time includes stops when Strava supplies it.</p>';
  }
  function paint(){const node=ROOT?.querySelector('#stryde-runs-panel');if(node)node.innerHTML=cardMarkup();}
  async function request(action,method='GET'){
    if(typeof window.strydeStravaRequest!=='function')throw Error('Run connection is unavailable. Reload STRYDE.');
    const result=await window.strydeStravaRequest(action,method);
    if(result?.error)throw Error(result.error);return result||{};
  }
  async function load(sync=false){
    if(busy)return;
    if(!signedIn()){notice='Log in to see your private running history.';paint();return;}
    const thisRead=++serial;lastRead=Date.now();busy=true;notice=sync?'Syncing runs from Strava…':'Loading saved runs…';paint();
    try{
      const status=await request('status');if(thisRead!==serial||!signedIn())return;
      connected=Boolean(status.connected);
      if(!connected){rows=[];notice='Strava is not connected to this STRYDE account yet.';return;}
      let imported;
      if(sync){const result=await request('sync','POST');imported=result.synced;}
      const data=await request('activities');if(thisRead!==serial||!signedIn())return;
      rows=Array.isArray(data.activities)?data.activities:[];
      lastRead=Date.now();
      notice=sync?'Sync complete. '+(Number.isFinite(imported)?imported+' run'+(imported===1?'':'s')+' processed.':'Your saved runs are up to date.'):'Strava connected · '+rows.length+' saved run'+(rows.length===1?'':'s')+' loaded.';
    }catch(error){if(thisRead===serial)notice=error?.message||'Unable to load runs. Please retry.';}
    finally{if(thisRead===serial){busy=false;paint();}}
  }
  async function connect(){
    if(!signedIn()){window.strydeOpenAccount?.();return;}
    if(busy)return;busy=true;notice='Opening Strava authorization…';paint();
    try{const result=await request('start');const url=new URL(result.url);if(url.origin!=='https://www.strava.com'||url.pathname!=='/oauth/authorize')throw Error('Unexpected authorization address.');window.location.assign(url.href);}
    catch(error){notice=error?.message||'Could not open Strava.';busy=false;paint();}
  }
  function refreshAccount(){
    const value=signedIn();
    if(value!==authSeen){authSeen=value;serial++;busy=false;rows=[];connected=false;notice='';lastRead=0;paint();}
    if(value&&pages()&&!busy&&!lastRead)void load();
  }
  function mount(){
    ROOT?.querySelector('#stryde-runs-panel')?.remove();
    if(!pages())return;
    if(view==='strava'){
      // Replace the old connection-only body, keeping the header/account button.
      Array.from(ROOT.children).forEach(node=>{if(!node.classList.contains('top'))node.remove();});
    }
    const panel=document.createElement('section');panel.className='card stryde-runs-panel';panel.id='stryde-runs-panel';
    if(view==='progress'){const anchor=ROOT.querySelector('.hero')||ROOT.firstElementChild;anchor?anchor.after(panel):ROOT.prepend(panel);}
    else ROOT.append(panel);
    paint();requestAnimationFrame(refreshAccount);
  }
  document.addEventListener('click',event=>{
    const control=event.target.closest('[data-run-action]');if(!control)return;
    const action=control.dataset.runAction;
    if(action==='login')window.strydeOpenAccount?.();
    else if(action==='connect')void connect();
    else if(action==='sync')void load(true);
    else if(action==='refresh')void load(false);
  });
  // A logout immediately drops in-memory runs. No shared local cache.
  if(ROOT)new MutationObserver(()=>{if(pages())refreshAccount();else if(authSeen&&!signedIn()){serial++;rows=[];connected=false;lastRead=0;busy=false;authSeen=false;}}).observe(ROOT,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  const previousRender=window.render;
  window.render=function(...args){const result=previousRender.apply(this,args);mount();return result;};
  window.strydeConnectStrava=connect;
  window.strydeSyncStrava=()=>load(true);
  window.strydeLoadStrava=()=>load(false);
  const params=new URLSearchParams(window.location.search);
  if(params.has('strava')){
    const result=params.get('strava');params.delete('strava');
    window.history.replaceState(null,'',window.location.pathname+(params.size?'?'+params.toString():'')+window.location.hash);
    setTimeout(()=>{window.go('progress');notice=result==='connected'?'Strava authorized. Tap Sync from Strava to import your runs.':'Strava authorization: '+result;paint();},0);
  }
  mount();
})();

/* Private gym attendance evidence. Never enters workout history or load calculations. */
(() => {
  'use strict';
  if (window.strydeAttendance) return;
  const P=window.strydeProgressModel, root=document.getElementById('root');
  if(!P||!root)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const account=()=>window.strydeAccountStatus?.()||{};
  const label=d=>new Date(d+'T12:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  const clock=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'}):'Time not recorded';
  let rows=[],owner=null,version=0,loaded=false,busy=false,error='',listDialog=null,lastRead=0;
  function current(){const a=account();return a.signedIn&&a.userId===owner?rows:[];}
  function forDate(d){return current().filter(r=>r.attendance_date===d);}
  function group(data){const map=new Map();for(const r of data){if(!P.validDate(r.attendance_date))continue;if(!map.has(r.attendance_date))map.set(r.attendance_date,[]);map.get(r.attendance_date).push(r);}return [...map.entries()].sort((a,b)=>b[0].localeCompare(a[0]));}
  function times(data){return [...new Set(data.map(r=>clock(r.checked_in_at)))].sort().join(', ');}
  function venues(data){return [...new Set(data.map(r=>r.venue))].join(' · ');}
  function dayMarkup(date,compact=false){
    const a=forDate(date);if(!a.length)return '';
    if(compact)return `<p class="attendance-inline"><b>✓ Gym attendance confirmed</b> · ${esc(times(a))} Shenzhen time. Workout details not recorded.</p>`;
    return `<section class="attendance-evidence"><div class="eyebrow">ATTENDANCE ONLY · FUSION FITNESS</div><h3>✓ Gym attended</h3><p><b>Check-in${a.length>1?'s':''}:</b> ${esc(times(a))} · Shenzhen time</p><p>${esc(venues(a))}</p>${a.length>1?'<p>Multiple check-in scans on this date; counted as one attendance day, not multiple workouts.</p>':''}<p><b>Workout type and duration: unknown.</b> Facility labels such as Swimming or HYROX do not identify what you did. The source’s 23:59 is not used as your finish time.</p><small>Imported from your gym check-in screenshots. Existing sets, weights and run records are unchanged.</small></section>`;
  }
  function listMarkup(data){return group(data).map(([d,a])=>`<button type="button" class="attendance-row" data-attendance-date="${d}"><span><b>${esc(label(d))}</b><small>${esc(times(a))} · Shenzhen</small><small>${esc(venues(a))}</small></span><span class="attendance-tick" aria-label="Attended">✓</span></button>`).join('');}
  function overview(){
    const host=view==='progress'&&root.querySelector('[data-hub="tab"][data-tab="overview"][aria-selected="true"]')?root.querySelector('.hub-content'):null;
    if(!host){root.querySelector('[data-attendance-panel]')?.remove();return;}
    const month=root.querySelector('#hub-month')?.value||P.iso().slice(0,7),data=current().filter(r=>r.attendance_date.startsWith(month)),days=group(data).length,a=account();
    const signature=JSON.stringify([month,owner,a.userId,loaded,busy,error,data.map(r=>r.id)]);
    let box=host.querySelector('[data-attendance-panel]');
    if(box?.dataset.signature===signature)return;
    if(!box){box=document.createElement('section');box.className='hub-card attendance-overview';box.dataset.attendancePanel='';host.prepend(box);}
    box.dataset.signature=signature;
    const notice=!a.signedIn?'Log in to see your private gym attendance.':error||(!loaded?'Loading gym attendance…':days?`${data.length} check-in scan${data.length===1?'':'s'} across ${days} date${days===1?'':'s'}.`:'No gym check-ins imported for this month.');
    box.innerHTML=`<div class="eyebrow">GYM ATTENDANCE · ${esc(month)}</div><h2>${a.signedIn&&loaded?days+' day'+(days===1?'':'s'):'Gym attendance'}</h2><p role="status">${esc(notice)}</p><p class="hub-footnote">Attendance is separate from completed workouts. No exercises, duration, calories or strength progress are inferred.</p>${listMarkup(data)}<div class="attendance-actions"><button type="button" class="btn" data-attendance-action="all">All attendance dates</button><button type="button" class="hub-link" data-attendance-action="refresh" ${busy?'disabled':''}>Refresh attendance</button></div>`;
  }
  const originalStatus=P.dayStatus;
  P.dayStatus=function(date,records){
    const result=originalStatus.call(this,date,records);
    if(result.code!=='done'&&forDate(date).length)return {...result,code:'done',attendanceOnly:true,label:'Gym attendance confirmed · workout details unknown'};
    return result;
  };
  function calendar(){
    if(!['today','plan'].includes(view))return;
    const actual=P.records(state,window.strydeStravaSnapshot?.().rows||[]);
    const paint=(el,date)=>{
      if(actual.some(r=>r.date===date)||!forDate(date).length)return;
      const node=el.querySelector('small')||el.querySelector('.hub-status');
      if(!node)return;
      const markup='<span class="hub-status done" aria-label="Gym attendance confirmed">✓</span>';
      if(node.classList.contains('hub-status')){node.className='hub-status done';if(node.textContent!=='✓')node.textContent='✓';node.setAttribute('aria-label','Gym attendance confirmed');}
      else if(node.innerHTML!==markup)node.innerHTML=markup;
      el.title=date+' · Gym attendance confirmed; workout details unknown';
      el.setAttribute('aria-label',el.title);
    };
    root.querySelectorAll('.daypill').forEach((el,i)=>{const d=dateFor(state.week,i),date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');paint(el,date);});
    root.querySelectorAll('[data-hub="day"][data-date]').forEach(el=>paint(el,el.dataset.date));
  }
  function mount(){overview();calendar();}
  function notify(){mount();window.dispatchEvent(new Event('stryde-attendance-changed'));}
  async function load(force=false){
    const a=account();
    if(!a.signedIn||!a.userId)return;
    if(busy||(!force&&owner===a.userId&&loaded&&Date.now()-lastRead<60000))return;
    const uid=a.userId,epoch=++version;owner=uid;busy=true;error='';mount();
    try{
      if(typeof window.strydeFetchAttendance!=='function')throw Error('Reload STRYDE to load attendance.');
      const result=await window.strydeFetchAttendance();
      if(epoch!==version||account().userId!==uid)return;
      if(result.userId!==uid)throw Error('Account changed. Reopen attendance.');
      const seen=new Set();
      rows=(Array.isArray(result.rows)?result.rows:[]).filter(r=>{
        if(!r?.id||seen.has(r.id)||!P.validDate(r.attendance_date)||r.attendance_date>P.iso())return false;
        seen.add(r.id);return true;
      });loaded=true;lastRead=Date.now();
    }catch(e){if(epoch===version)error=e.message||'Could not load attendance. Please retry.';}
    finally{if(epoch===version){busy=false;notify();}}
  }
  function showAll(){
    if(!account().signedIn){window.strydeOpenAccount?.();return;}
    listDialog?.close();const el=document.createElement('dialog');listDialog=el;el.className='hub-dialog attendance-dialog';el.setAttribute('aria-label','Gym attendance history');
    el.innerHTML=`<div class="hub-dialog-top"><h2>Gym attendance</h2><button type="button" data-attendance-action="close" aria-label="Close">×</button></div><p>${group(current()).length} distinct dates · ${current().length} check-in scans</p><p>These are visits, not reconstructed workouts. Check-in times are in Shenzhen time. Workout type, exercises and duration remain unknown.</p>${listMarkup(current())||'<p>No attendance records loaded yet. Close this list and refresh attendance.</p>'}<small>No automatic connection to WeChat is enabled.</small>`;
    document.body.append(el);el.addEventListener('close',()=>{el.remove();if(listDialog===el)listDialog=null;});el.showModal();
  }
  window.strydeAttendance={forDate,dayMarkup,group,refresh:()=>load(true),snapshot:()=>({rows:current().map(r=>({...r})),loaded,busy,error})};
  const previousRender=window.render;window.render=function(...args){const r=previousRender.apply(this,args);mount();return r;};
  let queued=false;
  new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;mount();});}).observe(root,{childList:true,subtree:true});
  window.addEventListener('stryde-account-change',()=>{version++;rows=[];loaded=false;busy=false;error='';owner=null;lastRead=0;listDialog?.close();notify();queueMicrotask(()=>load());});
  document.addEventListener('click',e=>{const date=e.target.closest('[data-attendance-date]'),b=e.target.closest('[data-attendance-action]');if(date){listDialog?.close();window.strydeDayWorkflows?.dayDetail(date.dataset.attendanceDate);}else if(b){if(b.dataset.attendanceAction==='all')showAll();else if(b.dataset.attendanceAction==='refresh')void load(true);else if(b.dataset.attendanceAction==='close')listDialog?.close();}});
  mount();void load();
})();

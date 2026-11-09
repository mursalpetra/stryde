/* Attendance and dated availability, read from private account tables.
 * Attendance never enters P.records(), lifting scores, run totals or workout duration.
 */
(() => {
 'use strict';
 const D=window.strydeTrainingData,ROOT=document.getElementById('root');if(!D||!ROOT)return;
 const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const account=()=>window.strydeAccountStatus?.()||{};
 const dayLabel=d=>new Date(d+'T12:00:00Z').toLocaleDateString([],{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
 const checkTime=t=>new Date(t).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'});
 let busy=false,attempted=null,request=0,error='',listDialog=null;
 const today=()=>trainingCalendarToday().date;
 const groups=rows=>[...new Set(rows.map(e=>e.attendance_date))].sort().reverse().map(date=>({date,rows:rows.filter(e=>e.attendance_date===date)}));
 function dayMarkup(date){const a=D.on(date);if(!a.length)return '';return `<section class="attendance-day"><div class="eyebrow">GYM ATTENDANCE CONFIRMED</div><h3>✓ Attended · workout not recorded</h3>${a.map(e=>`<div class="attendance-check"><b>${h(checkTime(e.checked_in_at))}</b><span>${h(e.venue)}</span></div>`).join('')}<p>Check-in times, Shenzhen time. Exercise type, sets and duration are unknown. The source’s 23:59 is not used as a workout finish time.</p></section>`;}
 function rowMarkup(g){return `<button type="button" class="attendance-record" data-attendance-day="${g.date}"><span><b>${h(dayLabel(g.date))}</b><small>${g.rows.map(e=>h(checkTime(e.checked_in_at))).join(' · ')} · Shenzhen time</small><small>${g.rows.length>1?g.rows.length+' check-ins, one attendance day':'Gym attendance'}</small></span><span aria-hidden="true">✓</span></button>`;}
 function progressMarkup(){
  const a=account(),s=D.snapshot(),month=document.getElementById('hub-month')?.value||today().slice(0,7),items=s.events.filter(e=>e.attendance_date.startsWith(month)),days=groups(items);
  return `<div class="attendance-heading"><div><div class="eyebrow">ATTENDANCE · NOT WORKOUT PERFORMANCE</div><h2>Gym visits</h2></div><button type="button" class="hub-link" data-attendance-refresh ${busy?'disabled':''}>Refresh</button></div>${!a.signedIn?'<p>Log in to view your private gym attendance.</p><button class="btn" type="button" data-attendance-login>Log in</button>':!s.loaded?`<p role="status">${h(error||(busy?'Loading saved check-ins…':'Checking saved attendance…'))}</p>`:`<div class="attendance-count"><strong>${days.length}</strong><span>attendance day${days.length===1?'':'s'} in ${h(month)}<small>${items.length} source check-in${items.length===1?'':'s'}</small></span></div><p>These confirm you went to the gym, not what workout you did. They are separate from run counts, lifting gains and training time.</p>${days.slice(0,4).map(rowMarkup).join('')}${days.length===0?'<p class="muted">No imported gym check-ins in this month.</p>':''}<button type="button" class="btn" data-attendance-all>All attendance · ${groups(s.events).length} days</button>${error?`<p role="status">${h(error)}</p>`:''}`}`;
 }
 function mount(){
  const overview=typeof view!=='undefined'&&view==='progress'&&ROOT.querySelector('.hub-tabs [data-tab="overview"][aria-selected="true"]');
  let card=document.getElementById('stryde-attendance-progress');
  if(overview){if(!card){card=document.createElement('section');card.id='stryde-attendance-progress';card.className='hub-card attendance-progress';const host=ROOT.querySelector('.hub-content');host?.querySelector('.hub-stats')?.after(card);if(!card.isConnected)host?.prepend(card);}const html=progressMarkup();if(card.innerHTML!==html)card.innerHTML=html;}
  else card?.remove();
  let banner=document.getElementById('stryde-availability-note');
  const preference=D.version(today());
  if(['today','plan'].includes(view)&&preference){
   if(!banner){banner=document.createElement('section');banner.id='stryde-availability-note';banner.className='attendance-availability';(ROOT.querySelector('.hub-today-actions')||ROOT.querySelector('.hero')||ROOT.firstElementChild)?.after(banner);}
   const names=preference.recovery_weekdays.map(i=>['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]);
   const html=`<strong>Recovery: ${h(names.join(' & '))}</strong><span>Protected morning availability · from ${h(dayLabel(preference.effective_from))}</span>`;if(banner.innerHTML!==html)banner.innerHTML=html;
  }else banner?.remove();
 }
 function safeRender(){
  if(!document.querySelector('dialog[open]')&&['today','plan','progress','me','goals'].includes(view)){const y=window.scrollY;window.render();window.scrollTo(0,y);}else mount();
 }
 async function load(force=false){
  const a=account();if(!a.signedIn){D.clear();mount();return;}
  if(busy||(!force&&attempted===a.userId))return;
  const uid=a.userId,serial=++request;busy=true;attempted=uid;error='';mount();
  try{
   const result=await window.strydeReadTrainingContext();
   if(serial!==request||account().userId!==uid)return;
   if(!D.accept(result,uid))return;
   if(result.limited)error='Only the first 1,000 check-ins loaded.';
   window.dispatchEvent(new Event('stryde-training-data-changed'));
  }catch(e){if(serial===request)error=e.message||'Private attendance could not load. Please refresh.';}
  finally{if(serial===request){busy=false;safeRender();}}
 }
 function showAll(){
  listDialog?.close();const el=document.createElement('dialog');listDialog=el;el.className='hub-dialog attendance-dialog';el.setAttribute('aria-label','All gym attendance');
  const rows=D.all();el.innerHTML=`<div class="hub-dialog-top"><h2>Gym attendance</h2><button type="button" data-attendance-close aria-label="Close">×</button></div><p>${groups(rows).length} attendance days · ${rows.length} check-ins</p><p class="hub-footnote">Imported from your Fusion Fitness screenshots. These are attendance events only; venue labels do not identify what you trained.</p>${groups(rows).map(rowMarkup).join('')}`;
  document.body.append(el);el.addEventListener('close',()=>{el.remove();if(listDialog===el)listDialog=null;});el.showModal();
 }
 document.addEventListener('click',e=>{
  if(e.target.closest('[data-attendance-refresh]'))void load(true);
  else if(e.target.closest('[data-attendance-all]'))showAll();
  else if(e.target.closest('[data-attendance-close]'))listDialog?.close();
  else if(e.target.closest('[data-attendance-login]'))window.strydeOpenAccount?.();
  else{const b=e.target.closest('[data-attendance-day]');if(b){listDialog?.close();window.strydeDayWorkflows?.dayDetail(b.dataset.attendanceDay);}}
 });
 window.addEventListener('stryde-account-change',()=>{request++;busy=false;attempted=null;error='';D.clear();listDialog?.close();safeRender();setTimeout(()=>load(),0);});
 window.addEventListener('online',()=>{if(account().signedIn)void load(true);});
 // Local Progress tab changes render directly rather than through window.render.
 new MutationObserver(mount).observe(ROOT,{childList:true});
 const render=window.render;window.render=function(...args){const r=render.apply(this,args);mount();return r;};
 window.strydeAttendanceUI={dayMarkup,mount,load,showAll};mount();setTimeout(()=>load(),0);
})();

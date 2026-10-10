/* Full session duration: Finish minus Start, INCLUDING rests and transitions.
 * v1 timings remain readable; no historical set/rep/weight edits are made.
 */
(() => {
  'use strict';
  if(window.strydeWorkoutTimer)return;
  const ROOT=document.getElementById('root');
  const nowMs=()=>Date.now(),stamp=ms=>new Date(ms).toISOString();
  const logKey=()=>Number.isInteger(sessionDay)?`${state.week}-${sessionDay}`:null;
  const validKey=k=>/^\d{1,2}-[0-6]$/.test(k||'');
  const record=k=>state.logs?.[k],timer=k=>record(k)?.timing;
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clock=iso=>iso&&Number.isFinite(Date.parse(iso))?new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'—';
  function length(ms){const s=Math.max(0,Math.floor(ms/1000));return s>=3600?`${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`:`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
  function elapsedMs(t,at=nowMs()){
    if(!t)return 0;
    const start=Date.parse(t.started_at),end=t.ended_at?Date.parse(t.ended_at):at;
    if(Number.isFinite(start)&&Number.isFinite(end))return Math.max(0,end-start);
    return Math.max(0,Number(t.elapsed_ms)||Number(t.accumulated_ms)||0);
  }
  const activeKey=()=>Object.keys(state.logs||{}).find(k=>['running','paused'].includes(timer(k)?.state))||null;
  function persist(){try{save();}catch(_){alert('The browser could not save this update. Export your workout data before closing STRYDE.');}}
  function start(k){
    if(!validKey(k))return;
    const existing=activeKey();
    if(existing&&existing!==k){alert('Finish the open workout before starting another timer.');return;}
    const l=record(k)||{};if(l.status==='done'||timer(k))return;
    const at=nowMs();
    const prescription=window.strydeCoaching?.snapshotFor(k);
    if(prescription)l.prescriptionSnapshot=prescription;
    l.timing={version:2,state:'running',source:'timer',duration_kind:'elapsed',started_at:stamp(at),ended_at:null,running_since:stamp(at),accumulated_ms:0,time_zone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'};
    l.status='in_progress';state.logs[k]=l;persist();mount();
  }
  function complete(k,preserveManualRunMinutes=false,at=nowMs()){
    const t=timer(k),l=record(k);if(!t||!['running','paused'].includes(t.state))return false;
    if(t.version===1){l.timing_history=Array.isArray(l.timing_history)?l.timing_history:[];l.timing_history.push({...t});}
    const elapsed=elapsedMs(t,at);
    t.version=2;t.duration_kind='elapsed';t.elapsed_ms=elapsed;t.accumulated_ms=elapsed;
    t.ended_at=stamp(at);t.running_since=null;t.state='finished';
    l.started_at=t.started_at;l.ended_at=t.ended_at;l.duration_seconds=Math.floor(elapsed/1000);l.elapsed_seconds=l.duration_seconds;
    if(!preserveManualRunMinutes)l.minutes=+(elapsed/60000).toFixed(2);
    persist();mount();return true;
  }
  function openTimed(k){if(!validKey(k))return;const [w,d]=k.split('-').map(Number);state.week=w;state.selectedDay=d;window.openSession(d);}
  function doFinish(k){if(k!==logKey()){openTimed(k);return;}if(view==='exercise'){alert('Save this exercise, then finish from the exercise list.');return;}if(isGym(sessionDay))window.finishSession();else window.saveRun();}
  function dateInput(iso){if(!iso||!Number.isFinite(Date.parse(iso)))return '';const d=new Date(iso),pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
  function editTimes(k){
    if(!validKey(k))return;const l=record(k)||{},t=timer(k);
    if(t&&['running','paused'].includes(t.state)){alert('Finish the timer before correcting its times.');return;}
    document.getElementById('stryde-time-dialog')?.remove();
    const dialog=document.createElement('dialog');dialog.id='stryde-time-dialog';dialog.className='workout-time-dialog';dialog.setAttribute('aria-labelledby','time-edit-title');
    dialog.innerHTML=`<form id="workout-time-form"><h2 id="time-edit-title">Full workout times</h2><p>Record the whole session, including rests and warm-up. Use your device’s local time; choose the end date too for an overnight session.</p><label>Start time<input name="start" type="datetime-local" step="1" required value="${dateInput(t?.started_at||l.started_at)}"></label><label>End time<input name="end" type="datetime-local" step="1" required value="${dateInput(t?.ended_at||l.ended_at)}"></label><p class="time-edit-result" aria-live="polite"></p><p class="time-edit-error" role="alert"></p><div class="workout-time-buttons"><button class="btn" type="button" data-cancel>Cancel</button><button class="btn orange" type="submit">Save full duration</button></div></form>`;
    document.body.append(dialog);const form=dialog.querySelector('form'),result=form.querySelector('.time-edit-result'),error=form.querySelector('.time-edit-error');
    function values(){const f=new FormData(form),a=Date.parse(f.get('start')),b=Date.parse(f.get('end'));if(!Number.isFinite(a)||!Number.isFinite(b))throw Error('Enter both dates and times.');if(b<=a)throw Error('The end must be after the start.');if(b>nowMs()+60000)throw Error('Use an end time that has already happened.');return {a,b,elapsed:b-a};}
    form.addEventListener('input',()=>{try{const v=values();result.textContent=`Full workout duration: ${length(v.elapsed)} (rests included)`;error.textContent='';}catch(_){result.textContent='';}});
    form.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    form.onsubmit=event=>{event.preventDefault();try{const v=values();if(t&&!confirm('Replace the recorded times? Your sets and weights will stay unchanged.'))return;if(t){l.timing_history=Array.isArray(l.timing_history)?l.timing_history:[];l.timing_history.push({...t});}l.timing={version:2,state:'finished',source:'manual',duration_kind:'elapsed',started_at:stamp(v.a),ended_at:stamp(v.b),running_since:null,accumulated_ms:v.elapsed,elapsed_ms:v.elapsed,time_zone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'};l.started_at=stamp(v.a);l.ended_at=stamp(v.b);l.duration_seconds=Math.floor(v.elapsed/1000);l.elapsed_seconds=l.duration_seconds;l.minutes=+(v.elapsed/60000).toFixed(2);state.logs[k]=l;persist();dialog.close();mount();}catch(e){error.textContent=e.message;}};dialog.showModal();
  }
  function panel(k,compact=false){
    const t=timer(k),l=record(k)||{},finished=t?.state==='finished',ongoing=t&&!finished;
    const box=document.createElement('section');box.className=`workout-clock${compact?' compact':''}`;box.dataset.timerMounted='panel';box.setAttribute('aria-label','Full workout duration');
    const title=finished?'FULL WORKOUT SAVED':ongoing?'FULL WORKOUT IN PROGRESS':'FULL WORKOUT TIME';
    let buttons=!t&&l.status!=='done'?'<button class="btn orange" data-time-action="start">Start workout</button>':'';
    if(ongoing&&!compact)buttons+='<button class="btn orange" data-time-action="finish">Finish workout</button>';
    if((!t||finished)&&!compact)buttons+=`<button class="workout-time-link" data-time-action="edit">${t?'Edit times':'Enter times manually'}</button>`;
    const elapsed=t?length(elapsedMs(t)):l.minutes?`${Number(l.minutes)} min`:'0:00';
    box.innerHTML=`<div class="workout-clock-head"><div><span class="workout-clock-label">${title}</span><strong data-timer-elapsed="${escape(k)}">${elapsed}</strong></div><div class="workout-time-buttons">${buttons}</div></div>${compact?'':`<dl class="workout-clock-times"><div><dt>Started</dt><dd>${clock(t?.started_at)}</dd></div><div><dt>Finished</dt><dd>${clock(t?.ended_at)}</dd></div><div><dt>Total time</dt><dd data-timer-elapsed="${escape(k)}">${t?elapsed:'Not timed'}</dd></div></dl><p class="workout-clock-note">Full time from Start to Finish, including warm-up, rests and time between exercises. No pausing needed.</p>`}`;
    box.querySelectorAll('[data-time-action]').forEach(btn=>btn.onclick=()=>({start,finish:doFinish,edit:editTimes}[btn.dataset.timeAction])(k));return box;
  }
  function mount(){
    if(!ROOT)return;ROOT.querySelectorAll('[data-timer-mounted]').forEach(el=>el.remove());const k=logKey();
    if((view==='session'||view==='exercise')&&k&&(isGym(sessionDay)||[1,4,6].includes(sessionDay))){const compact=view==='exercise'||(view==='session'&&sessionTab!=='workout'),node=panel(k,compact),anchor=ROOT.querySelector('.statline')||ROOT.querySelector('.hero')||ROOT.querySelector('h1')||ROOT.querySelector('.tabs')||ROOT.firstElementChild;anchor?anchor.after(node):ROOT.prepend(node);}
    if(view==='today'||view==='plan'){const running=activeKey();if(running){const bar=document.createElement('button');bar.className='workout-clock-return';bar.dataset.timerMounted='return';bar.innerHTML=`<span><strong>${escape(nameFor(Number(running.split('-')[1])))}</strong><small>Full session · <span data-timer-elapsed="${escape(running)}">${length(elapsedMs(timer(running)))}</span></small></span><span>Return to workout →</span>`;bar.onclick=()=>openTimed(running);(ROOT.querySelector('.top')||ROOT.firstElementChild)?.after(bar);}}
    if(view==='progress'){
      const entries=Object.entries(state.logs||{}).filter(([k,l])=>validKey(k)&&(l.timing||l.started_at)).sort((a,b)=>Date.parse(b[1].timing?.started_at||b[1].started_at)-Date.parse(a[1].timing?.started_at||a[1].started_at));
      const section=document.createElement('section');section.className='card workout-timing-history';section.dataset.timerMounted='history';section.innerHTML='<h3>Full workout duration</h3><p class="muted">Start-to-finish time, with all rests included.</p>';
      if(!entries.length)section.innerHTML+='<p class="muted">Start a workout or enter times manually to record your session.</p>';
      entries.slice(0,20).forEach(([k,l])=>{const t=l.timing,row=document.createElement('button');row.className='workout-time-history-row';const date=new Date(t?.started_at||l.started_at).toLocaleDateString([],{month:'short',day:'numeric'});row.innerHTML=`<span><strong>${escape(nameFor(Number(k.split('-')[1])))}</strong><small>${escape(date)} · ${clock(t?.started_at||l.started_at)} – ${clock(t?.ended_at||l.ended_at)}</small></span><span>${t?length(elapsedMs(t)):l.started_at&&l.ended_at?length(Date.parse(l.ended_at)-Date.parse(l.started_at)):escape(l.minutes||'—')+' min'}<small>${t?.state==='finished'?'Total duration':'In progress'}</small></span>`;row.onclick=()=>openTimed(k);section.append(row);});
      (ROOT.querySelector('.grid')||ROOT.querySelector('.hero')||ROOT.firstElementChild)?.after(section);
    }
    tick();
  }
  function tick(){document.querySelectorAll('[data-timer-elapsed]').forEach(el=>{const t=timer(el.dataset.timerElapsed);if(t)el.textContent=length(elapsedMs(t));});}
  const previousRender=window.render;window.render=function(...args){const r=previousRender.apply(this,args);mount();return r;};
  const previousFinish=window.finishSession;window.finishSession=function(...args){const k=logKey(),wasDone=record(k)?.status==='done',at=nowMs();const r=previousFinish.apply(this,args);if(!wasDone&&record(k)?.status==='done')complete(k,false,at);return r;};
  const previousSaveRun=window.saveRun;window.saveRun=function(...args){const k=logKey(),preserve=Boolean(document.getElementById('run-time')?.value.trim()),at=nowMs();const r=previousSaveRun.apply(this,args);if(record(k)?.status==='done')complete(k,preserve,at);return r;};
  window.strydeWorkoutTimer={start,complete,editTimes,mount,elapsedMs};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});window.addEventListener('pageshow',tick);setInterval(()=>{if(!document.hidden)tick();},1000);mount();
})();


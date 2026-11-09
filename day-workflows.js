/* Today-first navigation and actual-date logging. No planned session is silently completed.
 * Strava data stays in memory and in the existing owner-restricted import table.
 */
(() => {
  'use strict';
  if(window.strydeDayWorkflows)return;
  const ROOT=document.getElementById('root'),P=window.strydeProgressModel;
  if(!ROOT||!P)return;
  const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today=()=>trainingCalendarToday().date;
  const dateLabel=d=>new Date(d+'T12:00:00Z').toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'});
  const fmt=n=>Number.isFinite(Number(n))?String(Math.round(Number(n)*100)/100):'—';
  const signed=()=>window.strydeAccountStatus?.()||{};
  const getRows=()=>P.records(state,window.strydeStravaSnapshot?.().rows||[]);
  const presets=[
    {id:'back-shoulders',name:'Back & shoulders',ids:[4,5,6]},
    {id:'upper',name:'Back, shoulders & arms',ids:[4,5,6,7]},
    {id:'lower',name:'Glutes & legs',ids:[0,1,2,3]},
    {id:'back-legs',name:'Back & legs',ids:[0,2,4,5]},
    {id:'full',name:'Full body',ids:[0,2,4,6]}
  ];
  let outsideFocus=null,pendingToday=false,detail=null,detailDate=null,hidden=false,dayEpoch=0;
  const dayCache=new Map(),inflight=new Map(),formState=new WeakMap();
  const noFuture=d=>P.validDate(d)&&d<=today();
  function calendarPoint(date){
    if(!P.validDate(date))return null;
    const n=P.days('2026-10-05',date),week=Math.floor(n/7)+1;
    return {week,day:((n%7)+7)%7,inPlan:n>=0&&(n<WEEKS.length*7||Boolean(window.strydeFoundation?.active(date)))};
  }
  function selectedDate(){
    if(outsideFocus)return outsideFocus;
    const d=dateFor(state.week,Math.max(0,Math.min(6,Number(state.selectedDay)||0)));
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  }
  function safeHome(){return ['today','plan'].includes(view)&&!document.querySelector('dialog[open]')&&!ROOT.contains(document.activeElement?.closest?.('input,textarea,select'));}
  function focusToday(){
    const t=refreshCalendarClock();
    if(t.inPlan){state.week=t.week;state.selectedDay=t.day;outsideFocus=null;}else outsideFocus=t.date;
    window.strydeTrainingHub?.focusCalendar(t.date);pendingToday=false;
    // Deliberately no save(): browsing dates must not write cloud workout state.
  }
  function resume(){
    pendingToday=true;
    if(safeHome()){focusToday();window.render();}
  }
  const oldGo=window.go;
  window.go=function(v,...args){
    if(v==='today'){
      if(document.querySelector('dialog[open]')){pendingToday=true;return;}
      focusToday();
    }
    return oldGo.call(this,v,...args);
  };
  const oldSelect=window.selectDay;
  window.selectDay=function(d,...args){outsideFocus=null;return oldSelect.call(this,d,...args);};
  const oldWeek=window.changeWeek;
  window.changeWeek=function(...args){outsideFocus=null;return oldWeek.apply(this,args);};
  const oldRender=window.render;
  window.render=function(...args){
    refreshCalendarClock();
    if(pendingToday&&safeHome())focusToday();
    const result=oldRender.apply(this,args);
    if(['today','plan'].includes(view)){if(outsideFocus)outOfPlan();else mountSummary();}
    return result;
  };
  function originalPlan(date){
    const point=calendarPoint(date);if(!point?.inPlan)return {name:'No scheduled session',detail:'Outside the dated training block.',point};
    const {week,day}=point,configured=trainingPlanFor(week,day),{kind,km}=configured;
    const entry=state.logs?.[`${week}-${day}`],snapshot=entry?.prescriptionSnapshot;
    return {name:configured.name,kind,point,km,snapshot,detail:kind==='run'?(configured.foundation?'Easy, time-based conditioning':`${fmt(km)} km planned`):kind==='strength'?`${configured.ids.length} planned exercises`:configured.protectedRecovery?'Protected recovery · morning unavailable':'Rest / recovery was scheduled'};
  }
  function summary(date,compact=false){
    const plan=originalPlan(date),actual=getRows().filter(r=>r.date===date);
    const attended=(window.strydeAttendance?.forDate(date)||[]).length>0;
    const note=actual.length?actual.map(r=>r.name).join(' · '):attended?'Gym attendance confirmed':date>today()?'Not yet due':'No completed activity logged';
    let out=`<div class="day-compare"><div><span class="day-label">PLANNED</span><strong>${h(plan.name)}</strong><small>${h(plan.detail)}</small></div><div class="${actual.length||attended?'day-done':''}"><span class="day-label">ACTUALLY DONE</span><strong>${actual.length||attended?'✓ ':''}${h(note)}</strong><small>${actual.length?actual.length+' recorded '+(actual.length===1?'activity':'activities'):attended?'Attendance only · workout type and duration unknown':'A missing log does not prove you skipped training.'}</small></div></div>`;
    out+=window.strydeAttendance?.dayMarkup(date,compact)||'';
    if(compact)return out;
    if(plan.snapshot?.exercises){out+=`<details class="day-snapshot"><summary>Targets saved when this session began</summary>${Object.entries(plan.snapshot.exercises).map(([i,e])=>`<p>${h(P.exerciseInfo(i,e)?.name||'Exercise')} · ${h(e.sets)} × ${h(e.reps)} · ${e.weight? h(e.weight+' '+(e.unit||'')):'Load not saved'}</p>`).join('')}</details>`;}
    out+=actual.map(recordCard).join('');
    if(!actual.length&&!attended)out+='<p class="day-empty">Your completed exercises, sets, weights and run results will appear here. Nothing in the original plan has been marked complete.</p>';
    return out;
  }
  function recordCard(r){
    const source=r.plannedKey?state.logs?.[r.plannedKey]:(state.extraWorkouts||[]).find(x=>'extra:'+x.id===r.id);
    const ex=Object.entries(r.exercises||{}),snapshot=source?.prescriptionSnapshot;
    const snapshots=Array.isArray(snapshot?.exercises)?snapshot.exercises:Object.entries(snapshot?.exercises||{}).map(([id,e])=>({id,...e}));
    const time=r.started_at||source?.started_at||source?.timing?.started_at;
    return `<article class="day-actual-record"><header><div><h3>${h(r.name)}</h3><small>${h(r.source)}${time?' · '+h(new Date(time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',timeZone:P.TZ})):''}</small></div><span class="day-record-check">✓</span></header><p class="day-actual-stats">${r.distance>0?fmt(r.distance)+' km · ':''}${r.minutes>0?fmt(r.minutes)+' min total':ex.length+' exercises logged'}</p>${r.moving>0?'<p class="muted">Moving time '+fmt(r.moving)+' min</p>':''}${ex.length?`<ul class="day-lift-list">${ex.map(([id,e])=>{const reps=String(e.reps||'').split(',').filter(Boolean),target=snapshots.find(x=>String(x.id)===id);return `<li><strong>${h(P.exerciseInfo(id,e)?.name||e.name||'Exercise')}</strong><span>${h(e.weight)} ${h(e.unit||'unit not recorded')} · ${reps.length} sets · reps ${h(e.reps)}</span>${target?'<small>Saved target: '+h(target.sets)+' × '+h(target.reps)+(target.weight?' at '+h(target.weight+' '+target.unit):'')+'</small>':''}</li>`;}).join('')}</ul>`:''}${source?.notes?`<p class="day-record-note">${h(source.notes)}</p>`:''}${r.stravaId&&/^\d+$/.test(r.stravaId)?`<a href="https://www.strava.com/activities/${r.stravaId}" target="_blank" rel="noopener">View on Strava ↗</a>`:''}${snapshot?.name?`<p class="muted">Chosen session: ${h(snapshot.name)}. The original calendar plan above is kept separately.</p>`:''}${r.dateInferred?'<p class="muted">Legacy log: date inferred from its planned week/day.</p>':''}</article>`;
  }
  function mountSummary(){
    ROOT.querySelector('[data-day-summary]')?.remove();
    ROOT.querySelector('[data-availability-note]')?.remove();
    const date=selectedDate(),box=document.createElement('section');box.className='card day-summary';box.dataset.daySummary=date;
    box.innerHTML=`<header><h3>${h(date===today()?'Today’s record':dateLabel(date))}</h3><button class="hub-link" data-day-flow="details" data-date="${date}">View details →</button></header>${summary(date,true)}`;
    const focus=ROOT.querySelector('[data-adaptive-focus]')||Array.from(ROOT.querySelectorAll('.card')).find(e=>e.querySelector('button[onclick^="openSession("]'));
    if(focus)focus.after(box);else ROOT.querySelector('.hero')?.after(box);
    const actions=ROOT.querySelector('.hub-today-actions');
    if(date>=TRAINING_AVAILABILITY_FROM&&!ROOT.querySelector('[data-availability-note]')){const note=document.createElement('p');note.className='muted';note.dataset.availabilityNote='';note.textContent='Recovery days: Tuesday & Friday · applies from Nov 9. Other days remain adaptable to your recovery.';actions?.after(note);}
    if(actions&&!actions.querySelector('[data-day-flow="today"]'))actions.insertAdjacentHTML('beforeend','<button type="button" class="day-today-button" data-day-flow="today">Today</button>');
    ROOT.querySelectorAll('.daypill').forEach((el,i)=>{const current=state.week===actualWeek&&i===trainingCalendarToday().day;el.toggleAttribute('aria-current',current);if(current)el.setAttribute('aria-current','date');});
  }
  function outOfPlan(){
    // Never label the last race week as "today" after the block ends.
    ROOT.querySelectorAll('.hero,.weeknav,.daystrip,.day-summary').forEach(e=>{if(!e.closest('[data-adaptive-pending]'))e.remove();});
    ROOT.querySelectorAll('.card').forEach(e=>{if(e.querySelector('button[onclick^="openSession("]')||e.hasAttribute('data-adaptive-focus'))e.remove();});
    const box=document.createElement('section');box.className='card day-summary';box.dataset.daySummary=outsideFocus;
    box.innerHTML=`<div class="eyebrow">TODAY · ${h(dateLabel(outsideFocus))}</div><h1>Your training continues.</h1><p>No session is scheduled in this dated block for today. Your past records remain available.</p>${summary(outsideFocus,true)}<div class="day-actions"><button class="btn orange" data-day-flow="extra" data-date="${outsideFocus}">Log today’s workout</button><button class="btn" data-day-flow="details" data-date="${outsideFocus}">Today’s details</button><button class="btn" data-day-flow="browse-plan">Browse training block</button></div>`;
    ROOT.querySelector('.top')?.after(box);
  }
  function closeDetails(){detail?.close();}
  function detailBody(date){
    return `<div class="hub-dialog-top"><div><div class="eyebrow">PLANNED VS ACTUAL · SHENZHEN</div><h2>${h(dateLabel(date))}</h2></div><button type="button" data-day-flow="close-detail" aria-label="Close day">×</button></div><div data-day-detail-body>${summary(date)}</div><p class="day-strava-note" data-day-detail-status role="status"></p><div class="day-actions">${noFuture(date)?`<button type="button" class="btn orange" data-day-flow="extra" data-date="${date}">Log another workout</button><button type="button" class="btn" data-day-flow="check-day-run" data-date="${date}">Check Strava for this day</button>`:''}${originalPlan(date).point?.inPlan?`<button class="btn" data-day-flow="open-day-plan" data-date="${date}">Open planned session</button>`:''}</div>`;
  }
  function dayDetail(date){
    if(!P.validDate(date))return;
    document.querySelector('#hub-extra-form')?.closest('dialog')?.close();
    closeDetails();detailDate=date;const el=document.createElement('dialog');detail=el;el.className='hub-dialog day-review-dialog';el.setAttribute('aria-label','Planned and actual workouts for '+date);el.innerHTML=detailBody(date);document.body.append(el);
    el.addEventListener('close',()=>{el.remove();if(detail===el){detail=null;detailDate=null;}});el.showModal();
    if(noFuture(date)&&signed().signedIn)void lookupDay(date,false).then(()=>paintDetail(date)).catch(error=>paintDetail(date,error.message));
    else paintDetail(date);
  }
  function paintDetail(date,error=''){
    if(detailDate!==date||!detail?.open)return;
    const content=detail.querySelector('[data-day-detail-body]');if(content)content.innerHTML=summary(date);
    const status=detail.querySelector('[data-day-detail-status]');
    if(status)status.textContent=error||(!signed().signedIn?'Sign in to include your private Strava runs.':'Strava records use the Shenzhen calendar date. Check Strava to import a newly saved run.');
  }
  async function lookupDay(date,sync=true){
    if(!noFuture(date))throw Error('Choose a date up to today.');
    const a=signed();if(!a.signedIn)throw Error('Log in to check Strava for this date.');
    const uid=a.userId,key=uid+'|'+date,epoch=dayEpoch;
    const cached=dayCache.get(key);
    if(cached&&Date.now()-cached.at<30000&&(!sync||cached.synced))return cached;
    if(inflight.has(key)){await inflight.get(key);return lookupDay(date,sync);}
    const task=(async()=>{
      const res=await window.strydeStravaRequest(sync?'sync-day':'activities-day','POST',{date});
      if(dayEpoch!==epoch||signed().userId!==uid)throw Error('Account changed. Reopen this date.');
      if(res?.error)throw Object.assign(new Error(res.error),{code:res.code||'request_failed'});
      const rows=(Array.isArray(res.activities)?res.activities:[]).filter(r=>P.iso(r.started_at)===date&&/^\d+$/.test(String(r.activity_id)));
      const result={rows,at:Date.now(),synced:sync,connected:res.connected!==false,partial:!!res.partial};dayCache.set(key,result);
      window.strydeMergeStravaDay?.(rows,uid);return result;
    })();
    inflight.set(key,task);
    try{return await task;}finally{if(inflight.get(key)===task)inflight.delete(key);}
  }
  function mountExtra(form){
    if(!form||formState.has(form))return;
    const data={owner:state,uid:signed().userId||null,token:0,manual:false,preset:null,used:new Map(),lookup:null};formState.set(form,data);
    const section=form.querySelector('[data-extra-strength]');
    const picker=document.createElement('section');picker.className='day-presets';picker.innerHTML=`<h3>Start with a preset</h3><p>Tap the session you did. Its exercises and suggested targets appear below; adjust anything that was different.</p><div role="group" aria-label="Workout presets">${presets.map(p=>`<button type="button" data-day-flow="preset" data-preset="${p.id}" aria-pressed="false">${h(p.name)}<small>${p.ids.length} exercises</small></button>`).join('')}<button type="button" data-day-flow="blank-preset" aria-pressed="false">Custom session<small>Choose your own</small></button></div><p data-preset-status role="status"></p></section>`;section.prepend(picker);
    const review=document.createElement('label');review.className='day-preset-confirm';review.hidden=true;review.innerHTML='<input type="checkbox" name="presetReviewed" disabled><span>I reviewed the preset below. The weights and reps shown are what I actually completed.</span>';section.append(review);
    const runBox=document.createElement('section');runBox.className='day-strava-lookup';runBox.hidden=true;runBox.innerHTML='<div data-run-lookup-content role="status"></div><div class="day-actions"><button type="button" class="hub-link" data-day-flow="retry-run">Check again</button><button type="button" class="hub-link" data-day-flow="manual-run">Enter a run manually</button></div>';
    form.querySelector('[data-extra-run]').before(runBox);
    form.addEventListener('change',event=>{
      if(event.target.name==='kind'){data.manual=false;refreshExtra(form);}
      else if(event.target.name==='date'){
        data.token++;data.lookup=null;
        if(form.elements.kind.value==='run')void findExtraRun(form);
        if(data.preset){form.querySelector('[name="presetReviewed"]').checked=false;form.querySelector('[data-preset-status]').textContent='Date changed. Review the actual loads and reps before saving; your entered values have not been overwritten.';}
      }
    });
    form.addEventListener('input',event=>{if(event.target.closest('[data-extra-exercise]')){const check=form.querySelector('[name="presetReviewed"]');if(check)check.checked=false;}});
    // Native activity controls are delegated on document; run our state update after them.
    form.addEventListener('change',event=>{if(event.target.name==='kind')queueMicrotask(()=>{if(form.isConnected)refreshExtra(form,false);});});
  }
  function refreshExtra(form,lookup=true){
    const data=formState.get(form);if(!data)return;
    const isRun=form.elements.kind.value==='run',strength=form.elements.kind.value==='strength';
    form.querySelector('.day-strava-lookup').hidden=!isRun;
    const check=form.querySelector('[name="presetReviewed"]');check.disabled=!strength||!data.preset;check.required=strength&&!!data.preset;
    if(isRun){setManual(form,data.manual);if(lookup)void findExtraRun(form);}
    else{setManual(form,true);form.querySelector('[data-extra-run]').hidden=!['run','walk'].includes(form.elements.kind.value);}
  }
  function setManual(form,enabled){
    const isRun=form.elements.kind.value==='run';
    const entry=isRun?enabled:true;
    for(const name of ['name','minutes','notes']){const input=form.elements[name];if(input){input.disabled=!entry;input.closest('label').hidden=!entry;}}
    const runSection=form.querySelector('[data-extra-run]');runSection.hidden=!(isRun&&enabled)&&form.elements.kind.value!=='walk';
    runSection.querySelectorAll('input,select').forEach(e=>{e.disabled=isRun&&!enabled;});
    form.elements.km.required=isRun&&enabled;
    const submit=form.querySelector('[type="submit"]');submit.hidden=isRun&&!enabled;submit.disabled=isRun&&!enabled;
  }
  async function findExtraRun(form){
    const data=formState.get(form);if(!data||form.elements.kind.value!=='run')return;
    const date=form.elements.date.value,token=++data.token,box=form.querySelector('[data-run-lookup-content]');
    if(!noFuture(date)){box.textContent='Select an actual date first.';return;}
    box.innerHTML=`<div class="eyebrow">STRAVA · ${h(dateLabel(date))}</div><h3>Checking this day’s runs…</h3><p>No manual entry is needed if the run is already in Strava.</p>`;
    try{
      const result=await lookupDay(date,true);
      if(!form.isConnected||data.token!==token||form.elements.kind.value!=='run'||data.owner!==state)return;
      data.lookup=result;
      if(!result.connected){box.innerHTML='<h3>Connect Strava once</h3><p>This STRYDE account is not connected yet.</p><button type="button" class="btn orange" data-day-flow="connect-run">Connect Strava</button>';return;}
      if(result.rows.length){box.innerHTML=`<div class="eyebrow">${h(dateLabel(date))}</div><h3>✓ ${result.rows.length} ${result.rows.length===1?'run':'runs'} synced</h3><p>Already included in your calendar and Progress. No second workout entry is created.</p>${result.rows.map(r=>`<article class="day-run-match"><strong>${h(r.name||'Run')}</strong><span>${fmt(Number(r.distance_m)/1000)} km · ${r.elapsed_time_seconds?fmt(r.elapsed_time_seconds/60)+' min total':'duration unavailable'}</span><small>${h(new Date(r.started_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',timeZone:P.TZ}))} · Shenzhen time</small></article>`).join('')}<button type="button" class="btn orange" data-day-flow="show-run-day" data-date="${date}">View this day</button>${result.partial?'<p>Strava returned a partial result. Check again for any remaining activities.</p>':''}`;}
      else{box.innerHTML=`<h3>${result.partial?'No matching run in this partial response':'No Strava run found for '+h(dateLabel(date))}</h3><p>${result.partial?'Try again before assuming nothing was recorded.':'Save your activity in Strava, then check again—or enter an unrecorded run manually below.'}</p>`;data.manual=true;setManual(form,true);}
    }catch(error){
      if(!form.isConnected||data.token!==token||data.owner!==state)return;
      box.innerHTML=`<h3>Strava check unavailable</h3><p>${h(error.message)} This is not confirmation that no run exists.</p>${!signed().signedIn?'<button type="button" class="btn orange" data-day-flow="login-run">Log in</button>':error.code==='not_connected'?'<button type="button" class="btn orange" data-day-flow="connect-run">Connect Strava</button>':''}`;
      data.manual=true;setManual(form,true);
    }
  }
  function presetTarget(id,date){
    const e=EX[id];
    const prior=getRows().filter(r=>r.kind==='strength'&&r.date<=date&&r.exercises?.[id]&&P.unit(r.exercises[id].unit)===P.unit(e.unit)).at(-1);
    const p=date===today()?target(id):{weight:prior?.exercises[id]?.weight||'',sets:e.sets,reps:e.reps};
    const sets=Math.max(1,Math.min(10,Number(p.sets)||e.sets));
    return {name:e.name,unit:e.unit,weight:Number(p.weight)>0?p.weight:'',sets,reps:Number(p.reps)>0?p.reps:e.reps,why:prior?'Based on saved history; confirm your actual performance.':p.weight?'Starting trial from your plan, not a previously logged load.':'No confirmed load. Enter what you actually used.'};
  }
  function applyPreset(form,id){
    const data=formState.get(form),preset=presets.find(x=>x.id===id);if(!data||!preset)return;
    if(form.querySelector('[data-extra-exercise]')&&!confirm('Replace this form’s exercise list with '+preset.name+'? Saved workouts will not change.'))return;
    form.querySelectorAll('[data-hub="remove-exercise"]').forEach(b=>b.click());
    form.querySelector('#hub-custom-name').value='';data.preset=preset;data.used.clear();
    for(const i of preset.ids){
      const select=form.querySelector('#hub-add-exercise');select.value=String(i);select.dispatchEvent(new Event('change',{bubbles:true}));form.querySelector('[data-hub="add-exercise"]').click();
      const box=form.querySelector(`[data-extra-exercise="${i}"]`),p=presetTarget(i,form.elements.date.value);if(!box)continue;
      data.used.set(String(i),p);form.elements['weight'+i].value=p.weight;form.elements['reps'+i].value=Array(p.sets).fill(p.reps).join(',');
      const note=document.createElement('p');note.className='day-target-note';note.textContent=`Suggested: ${p.sets} × ${p.reps}${p.weight?' at '+p.weight+' '+p.unit:''}. ${p.why} Edit below to match what you did.`;box.querySelector('legend').after(note);
    }
    form.elements.name.value=preset.name;form.querySelector('.day-preset-confirm').hidden=false;const check=form.elements.presetReviewed;check.disabled=false;check.required=true;check.checked=false;
    form.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===id)));
    const status=form.querySelector('[data-preset-status]');status.textContent=preset.name+' loaded. Review the suggested sets and weights, edit anything different, then confirm and save.';
    status.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function validateExtra(form){
    const data=formState.get(form);if(!data)return;
    const a=signed();if(a.conflict||(a.signedIn&&!a.ready))throw Error('Open Account and finish syncing before saving a workout. Your entries are still here.');
    if(data.owner!==state||data.uid!==(a.userId||null))throw Error('Account changed. Reopen this form.');
    if(form.elements.kind.value==='strength'&&data.preset&&!form.elements.presetReviewed.checked)throw Error('Review and confirm that the preset values match what you actually completed.');
    if(form.elements.kind.value==='run'){
      if(!data.manual)throw Error('This Strava run is already in your history; no manual entry is needed.');
      const km=Number(form.elements.km.value),minutes=Number(form.elements.minutes.value);
      const similar=(data.lookup?.rows||[]).find(a=>Number(a.distance_m)>0&&Math.abs(a.distance_m/1000-km)/(a.distance_m/1000)<.05&&a.elapsed_time_seconds>0&&Math.abs(a.elapsed_time_seconds/60-minutes)/(a.elapsed_time_seconds/60)<.15);
      if(similar&&!confirm('A similar run is already imported for this date. Save this as a different, additional run? Cancel avoids counting it twice.'))throw Error('No duplicate entry saved. Use the imported run or correct the details.');
    }
  }
  function extraMetadata(form){
    const data=formState.get(form);if(!data?.preset||form.elements.kind.value!=='strength')return {};
    return {presetId:data.preset.id,prescriptionSnapshot:{version:1,source:'extra-workout-preset',date:form.elements.date.value,name:data.preset.name,exercises:Array.from(data.used,([id,p])=>({id,...p})),reviewedAsActual:true}};
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('.daypill')&&['today','plan'].includes(view)){dayDetail(selectedDate());return;}
    const b=event.target.closest('[data-day-flow]');if(!b)return;
    const action=b.dataset.dayFlow,form=b.closest('#hub-extra-form');
    if(action==='today'){focusToday();window.go('today');}
    else if(action==='details')dayDetail(b.dataset.date);
    else if(action==='close-detail')closeDetails();
    else if(action==='extra'){const date=b.dataset.date;closeDetails();window.strydeTrainingHub.extra(date);}
    else if(action==='preset'&&form)applyPreset(form,b.dataset.preset);
    else if(action==='blank-preset'&&form){const data=formState.get(form);if(form.querySelector('[data-extra-exercise]')&&!confirm('Clear this form’s exercise list? Saved workouts will not change.'))return;form.querySelectorAll('[data-hub="remove-exercise"]').forEach(b=>b.click());data.preset=null;data.used.clear();form.querySelector('.day-preset-confirm').hidden=true;form.elements.presetReviewed.disabled=true;form.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed','false'));form.elements.name.value='';form.querySelector('#hub-add-exercise').focus();}
    else if(action==='retry-run'&&form){const data=formState.get(form);dayCache.delete(signed().userId+'|'+form.elements.date.value);data.manual=false;setManual(form,false);void findExtraRun(form);}
    else if(action==='manual-run'&&form){formState.get(form).manual=true;setManual(form,true);form.elements.minutes.focus();}
    else if(action==='login-run'){form?.closest('dialog')?.close();window.strydeOpenAccount?.();}
    else if(action==='connect-run'){form?.closest('dialog')?.close();window.go('strava');window.strydeConnectStrava?.();}
    else if(action==='show-run-day'){form?.closest('dialog')?.close();dayDetail(b.dataset.date);}
    else if(action==='check-day-run'){const date=b.dataset.date;b.disabled=true;const node=detail?.querySelector('[data-day-detail-status]');if(node)node.textContent='Checking Strava for this date…';void lookupDay(date,true).then(()=>paintDetail(date)).catch(err=>paintDetail(date,err.message)).finally(()=>{b.disabled=false;});}
    else if(action==='open-day-plan'){const p=calendarPoint(b.dataset.date);closeDetails();if(p?.inPlan){outsideFocus=null;state.week=p.week;state.selectedDay=p.day;window.openSession(p.day);}}
    else if(action==='browse-plan'){outsideFocus=null;state.week=WEEKS.length;state.selectedDay=6;window.go('plan');}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hidden=true;else if(hidden){hidden=false;resume();}});
  window.addEventListener('pageshow',()=>resume());
  window.addEventListener('stryde-runs-changed',()=>{if(['today','plan'].includes(view)&&!outsideFocus)mountSummary();if(detailDate)paintDetail(detailDate);});
  window.addEventListener('stryde-attendance-changed',()=>{if(['today','plan'].includes(view)&&!outsideFocus)mountSummary();if(detailDate)paintDetail(detailDate);});
  window.addEventListener('stryde-account-change',()=>{dayEpoch++;dayCache.clear();inflight.clear();closeDetails();});
  window.strydeDayWorkflows={resume,focusToday,dayDetail,mountExtra,validateExtra,extraMetadata,lookupDay,originalPlan,presets,selectedDate};
  focusToday();window.render();
})();

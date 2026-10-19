/* Adaptive recommendations are derived. Only completed actual workouts enter history. */
(() => {
  'use strict';
  const S = window.strydeScheduleModel, P = window.strydeProgressModel, C = window.strydeCoachingModel;
  const ROOT = document.getElementById('root');
  if (!S || !P || !ROOT) return;
  const h = esc, clone = x => JSON.parse(JSON.stringify(x)), today = () => P.iso();
  const dateLabel = d => new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, {weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
  const names = {upper:'Back, shoulders & arms',lower:'Glutes & hamstrings',easy:'Easy run',long:'Long run',recovery:'Recovery',rest:'Recovery',race:'Race milestone'};
  const dose = d => d.km?'At most '+d.km+' km'+(d.minutes?' or '+d.minutes+' minutes, whichever comes first':''):'Up to '+(d.minutes||20)+' minutes';
  const originalNames = {upper:'Back, Shoulders & Arms',lower:'Glutes & Legs',easy:'Easy Run',long:'Long Run',recovery:'Recovery'};
  const dateForDay = d => { const dt = dateFor(state.week,d); return [dt.getFullYear(),String(dt.getMonth()+1).padStart(2,'0'),String(dt.getDate()).padStart(2,'0')].join('-'); };
  const rows = () => P.records(state, window.strydeStravaSnapshot?.().rows || []);
  const schedule = () => S.build(state, rows(), today());
  const selectedDate = () => dateForDay(Math.max(0,Math.min(6,Number.isInteger(state.selectedDay)?state.selectedDay:(new Date(today()+'T12:00:00Z').getUTCDay()+6)%7)));
  const button = (action,label,extra='',primary=false) => `<button type="button" class="btn ${primary?'orange':''}" data-adaptive="${action}" ${extra}>${label}</button>`;
  const activeLegacy = date => {
    const key=S.keyFor(date),l=state.logs?.[key];
    if(!l)return false;
    if(l.status==='done')return P.logDate(key,l)===date;
    return !!(l.status==='in_progress'||l.timing||l.started_at||l.prescriptionSnapshot||Object.keys(l.exercises||{}).length);
  };
  let dialog = null, dialogState = null, checkDate = null, choiceResult = null, draft = null, notice = '', lastDate = today(), rolloverTimer = null;
  function writable() {
    const account = window.strydeAccountStatus?.() || {};
    if (account.conflict) throw Error('Resolve your account sync choice before saving. Open Account at the top.');
    if (account.signedIn && !account.ready) throw Error('Wait for your account copy to load before saving. Open Account to retry if needed.');
    if (state.adaptiveSchedule && state.adaptiveSchedule.version!==1) throw Error('Update STRYDE before editing this newer adaptive-plan data.');
    if (dialog && state!==dialogState) throw Error('Your account data changed while this form was open. Close and reopen it before saving.');
    if (draft && state!==draft.owner) throw Error('Your saved account data changed. Close this workout and reopen today’s recommendation.');
  }
  function commit(fields) {
    writable();
    const old = Object.fromEntries(Object.keys(fields).map(k=>[k,{has:Object.prototype.hasOwnProperty.call(state,k),value:state[k]}]));
    let stored; try { stored = localStorage.getItem('stryde-v1'); } catch (_) {}
    Object.assign(state, fields);
    try { save(); } catch (error) {
      Object.entries(old).forEach(([k,v])=>{if(v.has)state[k]=v.value;else delete state[k];});
      try { if(stored!==undefined){if(stored===null)localStorage.removeItem('stryde-v1');else localStorage.setItem('stryde-v1',stored);} } catch (_) {}
      throw Error('Device storage is unavailable. Nothing was saved. Keep this form open and export a backup before closing STRYDE.');
    }
  }
  function capture() {
    const form = dialog?.querySelector('#adaptive-workout-form');
    if (!form || !draft) return;
    draft.values = Object.fromEntries(new FormData(form));
  }
  function close() {
    capture();
    if(draft?.startedAt&&!draft.saved&&draft.owner===state) { try { persistDraft(); } catch(err) { notice=err.message+' Your unsaved draft remains in this app tab.'; } }
    if(draft&&draft.owner!==state)draft=null;
    dialog?.close();mount();
  }
  function restoreDraft() {
    if(draft?.owner===state)return draft;
    if(dialog)return null;
    const saved=state.adaptiveSchedule?.activeSession;
    if(saved?.id&&saved.status==='in_progress'&&P.validDate(saved.date)&&saved.snapshot&&saved.choice&&saved.startedAt)draft={...clone(saved),owner:state,saved:false};
    else draft=null;
    return draft;
  }
  function persistDraft() {
    if(!draft?.startedAt||draft.saved)return;
    const {owner,saved,...session}=draft;
    const next=clone(state.adaptiveSchedule||{version:1,checkins:{}});
    session.status='in_progress';session.updatedAt=new Date().toISOString();next.activeSession=session;
    commit({adaptiveSchedule:next});
  }
  function modal(title,body,owner=state) {
    const opener = document.activeElement;
    if (dialog) { const old=dialog; dialog=null; old.close(); old.remove(); }
    dialogState=owner;
    const el = document.createElement('dialog'); dialog=el; el.className='adaptive-dialog';
    el.setAttribute('aria-labelledby','adaptive-title');
    el.innerHTML=`<div class="adaptive-dialog-head"><h2 id="adaptive-title">${h(title)}</h2><button type="button" data-adaptive="close" aria-label="Close">×</button></div>${body}<p class="adaptive-error" data-adaptive-error role="alert"></p>`;
    document.body.append(el);
    el.addEventListener('cancel',capture);
    el.addEventListener('close',()=>{el.remove();if(dialog===el)dialog=null;if(opener?.isConnected)opener.focus();});
    el.showModal(); el.querySelector('input,select,textarea,button')?.focus();
  }
  function error(err) {
    const node=dialog?.querySelector('[data-adaptive-error]');
    if(node)node.textContent=err.message;else {notice=err.message;mount();}
  }
  const checkSummary = c => !c?'':c.rest?'You chose recovery today. Check readiness again if you want to reconsider.':c.comfort==='pain'?'Pain or other symptoms recorded: pause exercise and seek appropriate advice.':c.comfort==='sore'||(c.energy!==null&&c.energy<=2)||c.soreness==='both'?'Your readiness check calls for recovery today.':c.soreness==='lower'?'Lower-body soreness recorded: keep lower-body loading off today’s options.':c.soreness==='upper'?'Upper-body soreness recorded: keep upper-body loading off today’s options.':!c.historyComplete?'Recent activity is not confirmed. Review missing workouts before choosing another session.':'Readiness checked today. You can check again if anything changes.';
  function weekly(plan,date) {
    const start = S.weekStart(date), end=P.add(start,6);
    const days=Object.values(plan.days).filter(d=>d.date>=start&&d.date<=end&&d.date>=today());
    if(!days.length)return '';
    return `<section class="adaptive-week" data-adaptive-week><div class="adaptive-week-head"><div><div class="eyebrow">REMAINING THIS WEEK</div><h3>A plan that moves with you</h3></div><span>Live suggestions</span></div><p class="adaptive-note">Actual completed workouts shape the next sessions. Missed sessions are never added on top.</p><ol>${days.map(d=>`<li><span class="adaptive-day">${dateLabel(d.date)}</span><div><b>${h(d.name)}</b>${d.originalType!==d.type&&!['completed','started'].includes(d.type)?`<small>Original: ${h(originalNames[d.originalType]||d.originalType)} → Updated</small>`:''}<details><summary>Why this day?</summary><p>${h(d.reason)}</p></details></div></li>`).join('')}</ol><details class="adaptive-limitations"><summary>What this plan knows</summary>${plan.warnings.map(w=>`<p>${h(w)}</p>`).join('')}<p>These are conservative planning rules, not medical clearance. Future sessions are provisional and recalculate when actual activity changes.</p></details></section>`;
  }
  function mount() {
    if (!['today','plan'].includes(view)) return;
    const active=restoreDraft(),date=selectedDate(),plan=schedule(),day=plan.days[date];
    const pending=active&&active.owner===state&&!active.saved&&active.startedAt;
    ROOT.querySelectorAll('[data-adaptive-week],[data-adaptive-pending]').forEach(el=>el.remove());
    let focus=ROOT.querySelector('[data-adaptive-focus]');
    if(!focus)focus=[...ROOT.querySelectorAll('.card')].find(el=>el.querySelector('button[onclick^="openSession("]'));
    // A saved workout remains reachable even after the dated planning block ends,
    // or while historical/legacy/future selection keeps the original focus card.
    if(pending&&(!focus||date!==today()||activeLegacy(date)||!day||day.type==='completed'||day.legacyKey)) {
      const card=document.createElement('section');card.className='card adaptive-focus';card.setAttribute('data-adaptive-pending','');
      card.innerHTML=`<div class="eyebrow">SAVED UNFINISHED WORKOUT</div><h3>${h(active.choice.name||'Your workout')}</h3><p class="adaptive-note">Started ${h(dateLabel(active.date))}. Your entered sets and original prescription are saved. Continue this workout or discard the unfinished draft; neither action starts a new session.</p><div class="adaptive-actions">${button('resume','Continue workout','',true)}${button('discard','Discard unfinished workout')}</div>${notice?`<p class="adaptive-notice" role="status">${h(notice)}</p>`:''}`;
      if(focus)focus.before(card);else {const hero=ROOT.querySelector('.hero');if(hero)hero.after(card);else ROOT.append(card);}
    }
    if(!focus)return;
    if(date<today()||activeLegacy(date)||!day) {
      if(focus.hasAttribute('data-adaptive-focus'))return;
      if(date>=today())focus.insertAdjacentHTML('afterend',weekly(plan,date));
      return;
    }
    const isToday=date===today(), completed=day.type==='completed', future=!isToday;
    const c=(state.adaptiveSchedule?.checkins?.[date]||state.coaching?.recovery?.[date])?S.readiness(state,date):null,legacyPending=day.type==='started'&&day.legacyKey,rest=day.kind==='recovery'&&day.type!=='started';
    focus.setAttribute('data-adaptive-focus','');focus.className='card adaptive-focus';
    focus.innerHTML=`<div class="adaptive-kicker"><div class="eyebrow">${isToday?'● TODAY':'SELECTED DAY'} · ADAPTIVE PLAN</div><span>${future?'Preview':completed?'Recorded':rest?'Recovery first':'Based on your logs'}</span></div><div class="hero"><h1>${pending&&isToday?'Continue '+h(active.choice.name):rest&&isToday?'Rest is still a good option':h(day.name)}</h1><p class="sub">${pending&&isToday?'Your unfinished workout and entered sets are saved. Complete or discard it before choosing another session.':completed?'Your recorded activity is already included in the remaining week.':rest?'Recovery counts. You do not need to make up a missed session.':`${day.kind==='strength'?'Indoor strength':'Outdoor run / walk'}${day.minutes?' · up to '+day.minutes+' min':''}${day.km?' · at most '+day.km+' km':''}`}</p></div>${day.type!==day.originalType&&!completed?`<p class="adaptive-original">Original: ${h(originalNames[day.originalType]||day.originalType)} · Updated: ${h(day.name)}</p>`:''}<p class="adaptive-reason">${h(day.reason)}</p>${isToday&&c?`<p class="adaptive-readiness">${h(checkSummary(c))}</p>`:''}<div class="adaptive-actions">${completed?button('progress','See recorded activity'):legacyPending?button('legacy','Continue saved workout',`data-key="${h(day.legacyKey)}"`,true):future?button('preview','Preview this day',`data-date="${date}"`):pending?button('resume','Continue workout','',true):button('check',rest?'Want to move? Check your options':'Check readiness & choose',`data-date="${date}"`,true)}</div>${isToday&&!completed?'<p class="adaptive-note">Choose an indoor muscle focus or a short outdoor option when your recovery allows it. Choosing does not count as a completed workout.</p>':''}${notice?`<p class="adaptive-notice" role="status">${h(notice)}</p>`:''}`;
    focus.insertAdjacentHTML('afterend',weekly(plan,date));
    ROOT.querySelectorAll('.daypill').forEach((el,i)=>{const d=plan.days[dateForDay(i)];if(d&&!activeLegacy(d.date)){el.title=`${d.date} · Updated suggestion: ${d.name}`;el.setAttribute('aria-label',el.title);}});
  }
  function readiness(date=today()) {
    if(!dialog)restoreDraft();
    writable();
    if(date!==today())return preview(date);
    if(draft?.startedAt&&!draft.saved)return workout();
    draft=null;checkDate=date;choiceResult=null;
    const c=S.readiness(state,date);
    modal('A quick check for today',`<form id="adaptive-readiness-form" class="adaptive-form"><p>Rest stays available. Tell STRYDE how you feel and how much time you have before choosing one session.</p><label>How does movement feel?<select name="comfort" required><option value="">Choose…</option>${[['comfortable','Comfortable / pain-free'],['sore','Unusually sore or tired'],['pain','Pain or other symptoms']].map(([v,l])=>`<option value="${v}" ${c.comfort===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Any ordinary muscle soreness?<select name="soreness" required>${[['none','None'],['lower','Lower body'],['upper','Upper body'],['both','Upper and lower body']].map(([v,l])=>`<option value="${v}" ${c.soreness===v?'selected':''}>${l}</option>`).join('')}</select></label><div class="adaptive-fields"><label>Energy, 1–5<input name="energy" type="number" min="1" max="5" step="1" required value="${h(c.energy??'')}" placeholder="1 = low, 5 = good"></label><label>Time available (minutes)<input name="minutes" type="number" min="10" max="90" step="1" required value="${h(c.minutes??'')}" placeholder="10–90"></label></div><label class="adaptive-check"><input name="historyComplete" type="checkbox" ${c.historyComplete?'checked':''}>My workouts from the last 14 days are logged or synced, including yesterday.</label><p class="adaptive-note">If something is missing, sync Strava or log the actual workout in Progress first. An empty day is not proof of rest.</p><div class="adaptive-actions"><button class="btn orange" type="submit">See today’s options</button>${button('close','Keep recovery / close')}</div></form>`);
  }
  const alternatives = {
    0:{name:'Dumbbell sumo deadlift',unit:'lb total',muscles:['Glutes','Hamstrings','Quadriceps'],cue:'Hold one dumbbell centrally; use a comfortable stance and controlled hip hinge.'},
    1:{name:'Dumbbell glute bridge',unit:'lb total',muscles:['Glutes','Hamstrings'],cue:'Use a padded dumbbell at the hips; keep ribs down and stop before the lower back arches.'},
    2:{name:'Goblet squat to a box',unit:'lb total',muscles:['Quadriceps','Glutes'],cue:'Hold one dumbbell close to the chest; sit lightly to a stable box and stand smoothly.'},
    3:{name:'Sliding hamstring curl',unit:'bodyweight',muscles:['Hamstrings','Glutes'],cue:'Use a short, controlled sliding range on a suitable surface; skip if you cannot control it.'},
    4:{name:'Single-arm dumbbell row',unit:'lb per hand',muscles:['Back','Lats','Biceps'],cue:'Support your free hand on a stable bench; keep your torso steady. Complete each side.'},
    5:{name:'Chest-supported dumbbell row',unit:'lb per hand',muscles:['Back','Biceps'],cue:'Keep your chest supported on an incline bench and draw your elbows back without shrugging.'},
    6:{name:'Seated dumbbell shoulder press',unit:'lb per hand',muscles:['Shoulders','Triceps'],cue:'Use a supported seat; press through a comfortable range without arching your back.'},
    7:{name:'Dumbbell floor press',unit:'lb per hand',muscles:['Chest','Triceps'],cue:'Lower until your upper arms lightly touch the floor; press smoothly without bouncing.'}
  };
  function prescription(choice) {
    const block=C?.activeBlock(C.data(state),choice.date);
    return {version:1,recordedAt:new Date().toISOString(),date:choice.date,type:choice.type,name:choice.name,minutes:choice.minutes,km:choice.km,reason:choice.reason,
      blockId:block?.id||null,blockVersion:block?.version||null,exercises:(choice.ids||[]).map(id=>{
        const e=EX[id],p=block?.prescriptions?.[id],alt=alternatives[id],existingAlt=alt&&Object.values(state.customExercises||{}).find(x=>x.name===alt.name&&P.unit(x.unit)===P.unit(alt.unit)&&P.customId(x.id));
        const sets=p?.sets||Math.min(e.sets,choice.minutes<30?2:3),reps=p?.reps||e.reps;
        return {id,name:e.name,sets,reps,unit:p?.unit||e.unit,weight:p?.weight??'',muscles:clone(e.muscles||[]),cue:e.cue,restSeconds:90,
          source:p?'Accepted block v'+block.version:'Conservative starting prescription',
          alternative:alt?{...clone(alt),id:existingAlt?.id||'custom-'+crypto.randomUUID(),custom:true,sets:Math.min(2,sets),reps:Math.min(12,reps),restSeconds:90}:null};
      })};
  }
  function choices() {
    if(!choiceResult)return;
    modal('Choose one option',`<p>${h(choiceResult.reason)}</p><div class="adaptive-choices">${choiceResult.choices.map(c=>`<article class="adaptive-choice ${c.id==='rest'?'is-rest':''}"><div class="eyebrow">${c.id==='rest'?'RECOVERY':c.kind==='strength'?'INDOORS · STRENGTH':'OUTDOORS · EASY'}</div><h3>${h(c.name)}</h3>${c.minutes||c.km?`<b>${h(dose(c))}${c.kind==='strength'?' · '+c.ids.length+' exercises':''}</b>`:''}<p>${h(c.reason)}</p>${button(c.id==='rest'?'rest':'choose',c.id==='rest'?'Choose rest':'See this workout',`data-choice="${h(c.id)}"`,c.id!=='rest')}</article>`).join('')}</div>${(choiceResult.warnings||[]).map(w=>`<p class="adaptive-note">${h(w)}</p>`).join('')}<p class="adaptive-note">No workout has been logged. Exercise options depend on today’s answers and available recent records.</p>${button('check','Change my check-in')}`,dialogState);
  }
  function prescriptionMarkup(snapshot) {
    if(!snapshot.exercises.length)return `<div class="adaptive-run-guide"><h3>Easy means conversational</h3><ol><li>Begin with 3–5 minutes of comfortable walking.</li><li>Run gently or alternate run/walk intervals. ${h(dose(snapshot))}. This is a ceiling, not a target to force. Stop sooner whenever needed.</li><li>Finish with easy walking. Choose a familiar, suitable outdoor route; skip or shorten for heat, unsafe air, or poor conditions.</li></ol><p>Do not chase pace or add distance to make up another run. Stop for pain, dizziness or other concerning symptoms.</p></div>`;
    return `<p class="adaptive-calibrate"><b>Warm up first.</b> Use 3–5 minutes of easy movement and a lighter practice set. Calibrate a load that leaves about 3 clean reps available at the end of each set. Stop for pain or a change in technique.</p><ol class="adaptive-prescription">${snapshot.exercises.map(e=>`<li><div><b>${h(e.name)}</b><span>${e.sets} × ${e.reps} reps · rest ${e.restSeconds} sec</span></div><p>${h(e.cue)}</p><small>${e.weight!==''?`${h(e.source)}: ${h(e.weight)} ${h(e.unit)}. This is a target, not a recorded load; use less if needed.`:`Load: calibrate in ${h(e.unit)}. No automatic weight increase.`}</small>${e.alternative?`<details><summary>Equipment unavailable?</summary><p>Optional familiar substitute: ${h(e.alternative.name)} · ${e.alternative.sets} × ${e.alternative.reps}, ${h(e.alternative.unit)}. ${h(e.alternative.cue)} You can choose it in the log or skip this exercise.</p></details>`:''}</li>`).join('')}</ol>`;
  }
  function preview(date) {
    const d=schedule().days[date];if(!d)return;
    modal(date===today()?'Today’s suggestion':dateLabel(date)+' · preview',`<div class="eyebrow">PROVISIONAL SUGGESTION</div><h3>${h(d.name)}</h3><p>${h(d.reason)}</p><p class="adaptive-original">Original: ${h(originalNames[d.originalType]||d.originalType)} · Updated: ${h(d.name)}</p>${d.minutes?`<p>${h(dose(d))}.</p>`:''}<p class="adaptive-note">${date>today()?'This can change after your next completed workout. Come back on the day for a readiness check; future workouts cannot be logged here.':'Review how you feel before choosing an exercise option.'}</p>${date===today()&&!activeLegacy(date)&&!['completed','race'].includes(d.type)?button('check','Check today’s options','',true):''}${button('close','Close preview')}`);
  }
  function choose(id) {
    writable();if(state.adaptiveSchedule?.activeSession)throw Error('Continue or discard the unfinished workout before choosing another.');if(checkDate!==today())throw Error('The date has changed. Close and check today’s readiness again.');
    if(!choiceResult?.choices.some(c=>c.id===id)||id==='rest')return;
    const c=S.options(state,rows(),today()).choices.find(c=>c.id===id);
    if(!c)throw Error('Recent activity or readiness changed. Check today’s options again before choosing.');
    // The prescription is frozen at this deliberate choice, before any activity is saved.
    draft={id:crypto.randomUUID(),owner:state,date:today(),choice:clone(c),snapshot:prescription(c),check:clone(state.adaptiveSchedule.checkins[today()]),values:{},startedAt:null,saved:false};
    modal(c.name,`<div class="eyebrow">${c.kind==='strength'?'INDOOR STRENGTH':c.type==='long'?'OUTDOOR EASY RUN':'SHORT OUTDOOR OPTION'} · ${h(dose(c))}</div>${prescriptionMarkup(draft.snapshot)}<p class="adaptive-note">This session is a suggestion. Use familiar equipment and choose a substitute only if you know the movement. Skip anything that does not feel right.</p><div class="adaptive-actions">${button('start','Start & open actual log','',true)}${button('options','Back to options')}</div>`,draft.owner);
  }
  function restoreValues(form,values) {
    for(const [name,value] of Object.entries(values||{})) {const el=form.elements.namedItem(name);if(!el||el.disabled)continue;if(el.type==='checkbox')el.checked=value==='on';else el.value=value;}
  }
  function exerciseFields(e) {
    const v=draft.values,sub=v['movement-'+e.id]==='alternative',def=sub&&e.alternative?e.alternative:e;
    const skip=v['skip-'+e.id]==='on',prefix=String(e.id);
    return `<fieldset class="adaptive-log-exercise" data-exercise="${e.id}"><legend>${h(def.name)}</legend><label>Movement<select name="movement-${prefix}" data-adaptive-movement="${prefix}"><option value="original">${h(e.name)} · ${h(e.unit)}</option>${e.alternative?`<option value="alternative" ${sub?'selected':''}>Substitute: ${h(e.alternative.name)} · ${h(e.alternative.unit)}</option>`:''}</select></label><p>${def.sets} × ${def.reps} prescribed · rest ${def.restSeconds} sec<br><small>${h(def.cue)}</small></p><label class="adaptive-check"><input type="checkbox" name="skip-${prefix}" data-adaptive-skip="${prefix}" ${skip?'checked':''}>Skip this exercise</label><div class="adaptive-actual-fields" ${skip?'hidden':''}>${def.unit==='bodyweight'?'<p>Bodyweight movement. No external load is assumed.</p>':`<label>Actual weight (${h(def.unit)})<input name="weight-${prefix}" type="number" min="0" max="2000" step="any" inputmode="decimal" placeholder="Enter what you used" ${skip?'disabled':''}></label>`}<div class="adaptive-reps">${Array.from({length:def.sets},(_,i)=>`<label>Set ${i+1} reps<input name="reps-${prefix}-${i}" type="number" min="1" max="100" step="1" inputmode="numeric" placeholder="Actual" ${skip?'disabled':''}></label>`).join('')}</div><p class="adaptive-note">Leave later sets blank if you did fewer. Use one recorded weight for these sets; note any load changes below.</p><div class="adaptive-fields"><label>Effort<select name="effort-${prefix}" ${skip?'disabled':''}><option value="unknown">Not recorded</option><option value="easy">Easy · 4+ reps left</option><option value="moderate">Controlled · 2–3 left</option><option value="hard">Hard · 0–1 left</option></select></label><label>Form<select name="form-${prefix}" ${skip?'disabled':''}><option value="unsure">Not confirmed</option><option value="good">Controlled and pain-free</option></select></label></div><label>Equipment / setup (optional)<input name="setup-${prefix}" maxlength="100" placeholder="Machine, seat setting, or substitution notes" ${skip?'disabled':''}></label></div></fieldset>`;
  }
  function clearSavedDraft() {
    if(!draft||(state.extraWorkouts||[]).every(w=>w.id!==draft.id))return false;
    const next=clone(state.adaptiveSchedule||{version:1,checkins:{}});
    if(next.activeSession?.id===draft.id)delete next.activeSession;
    commit({adaptiveSchedule:next});draft.saved=true;close();draft=null;
    notice='This workout was already saved. No duplicate was added.';window.render();return true;
  }
  function workout() {
    writable();if(!draft||draft.saved)return;
    if(clearSavedDraft())return;
    const d=draft,kind=d.choice.kind;
    modal('Log what you actually did',`<div class="adaptive-session-heading"><div class="eyebrow">${dateLabel(d.date)} · FROZEN SESSION TARGET</div><h3>${h(d.choice.name)}</h3><p>Targets stay unchanged while this workout is open. Nothing counts as completed until you save below.</p></div><form id="adaptive-workout-form" class="adaptive-form"><details class="adaptive-workout-reference"><summary>View the saved prescription & warm-up</summary>${prescriptionMarkup(d.snapshot)}</details>${kind==='strength'?d.snapshot.exercises.map(exerciseFields).join(''):`<div class="adaptive-run-guide"><p>Stay at a conversational effort; walking breaks count. Record the distance and full elapsed duration you actually completed.</p><label>Actual distance (km)<input name="distanceKm" type="number" min="0.01" max="200" step="any" inputmode="decimal" required placeholder="Enter actual distance"></label><label>Effort (1–10, optional)<input name="rpe" type="number" min="1" max="10" step="1"></label><p class="adaptive-note">If you recorded this run in Strava, sync it instead of saving the same run twice. A synced run will update your remaining plan.</p>${button('strava','Close log & open Strava')}</div>`}<label>Actual full duration (minutes)<input name="durationMinutes" type="number" min="1" max="1440" step="any" inputmode="decimal" required placeholder="Include warm-up and rests"></label><label>Notes (optional)<textarea name="notes" maxlength="1000" rows="3" placeholder="How it felt, skipped movements, or changes you made"></textarea></label><p class="adaptive-note">Actual weights and reps start empty. Your chosen target is kept separately from the completed record.</p><div class="adaptive-actions"><button class="btn orange" type="submit">Save completed workout</button>${button('close','Close & keep draft')}${button('discard','Discard unfinished workout')}</div><p class="adaptive-note">Your unfinished draft is saved privately as you enter it. It does not count as a completed workout. Finish here after training, or discard it if you did not train.</p></form>`,d.owner);
    restoreValues(dialog.querySelector('form'),d.values);
  }
  function finish(form) {
    writable();if(!draft||draft.saved)return;
    if(clearSavedDraft())return;
    capture();const v=draft.values,d=draft,minutes=Number(v.durationMinutes);
    if(!P.validDate(d.date)||d.date>today()||!d.startedAt)throw Error('Start the workout on its actual day before recording completion.');
    if(!(minutes>=1&&minutes<=1440))throw Error('Enter the actual full workout duration.');
    const ex={},custom={},skipped=[];
    if(d.choice.kind==='strength') {
      for(const e of d.snapshot.exercises) {
        if(v['skip-'+e.id]==='on'){skipped.push({id:e.id,name:e.name});continue;}
        const def=v['movement-'+e.id]==='alternative'?e.alternative:e;
        if(!def)throw Error('Choose a valid exercise or skip it.');
        const raw=Array.from({length:def.sets},(_,i)=>String(v[`reps-${e.id}-${i}`]||'').trim());
        const last=raw.reduce((n,x,i)=>x?i:n,-1),actual=raw.slice(0,last+1);
        if(!actual.length||actual.some(x=>!/^\d+$/.test(x)||Number(x)<1||Number(x)>100))throw Error('Enter consecutive actual set reps for '+def.name+', or mark it skipped.');
        const rawWeight=v['weight-'+e.id],weight=def.unit==='bodyweight'?0:Number(rawWeight);
        if(def.unit!=='bodyweight'&&(rawWeight===undefined||String(rawWeight).trim()===''||!Number.isFinite(weight)||weight<0||weight>2000))throw Error('Enter the actual weight for '+def.name+'.');
        const unit=def.unit;
        ex[def.id]={name:def.name,weight,reps:actual.join(','),unit,effort:v['effort-'+e.id]||'unknown',form:v['form-'+e.id]||'unsure',setup:String(v['setup-'+e.id]||'').trim().slice(0,100),muscles:clone(def.muscles||[]),custom:!!def.custom};
        if(def.custom)custom[def.id]={id:def.id,name:def.name,unit,custom:true,muscles:clone(def.muscles||[]),createdAt:new Date().toISOString()};
      }
      if(!Object.keys(ex).length)throw Error('Log at least one exercise you completed. If you rested, close this draft without saving a workout.');
    }
    const km=d.choice.kind==='run'?Number(v.distanceKm):null,rpe=v.rpe?Number(v.rpe):null;
    if(d.choice.kind==='run'&&!(km>0&&km<=200))throw Error('Enter the distance you actually completed.');
    if(rpe!==null&&(!Number.isInteger(rpe)||rpe<1||rpe>10))throw Error('Effort must be 1–10 or left blank.');
    const item={id:d.id,date:d.date,kind:d.choice.kind,status:'done',name:d.choice.name,durationMinutes:minutes,exercises:ex,notes:String(v.notes||'').trim().slice(0,1000),distanceKm:km,rpe,terrain:'',createdAt:new Date().toISOString(),started_at:d.startedAt,source:'adaptive-schedule',adaptiveType:d.choice.type,prescriptionSnapshot:clone(d.snapshot),readinessSnapshot:clone(d.check),skippedExercises:skipped};
    const adaptive=clone(state.adaptiveSchedule||{version:1,checkins:{}});
    if(adaptive.activeSession?.id===d.id)delete adaptive.activeSession;
    const changes={extraWorkouts:[...(state.extraWorkouts||[]),item],adaptiveSchedule:adaptive};
    if(Object.keys(custom).length)changes.customExercises={...(state.customExercises||{}),...custom};
    const submit=form.querySelector('[type="submit"]');submit.disabled=true;
    try {commit(changes);} catch(err){submit.disabled=false;throw err;}
    d.saved=true;close();draft=null;choiceResult=null;notice='Workout saved. Your remaining week has been recalculated from what you completed.';window.render();
    window.dispatchEvent(new CustomEvent('stryde-adaptive-completed',{detail:{id:item.id,date:item.date}}));
  }
  document.addEventListener('submit',event=>{
    const f=event.target;if(!['adaptive-readiness-form','adaptive-workout-form'].includes(f.id))return;
    event.preventDefault();
    try {
      if(!f.reportValidity())return;
      if(f.id==='adaptive-workout-form')return finish(f);
      writable();if(checkDate!==today())throw Error('The date has changed. Close and check today again.');
      const v=Object.fromEntries(new FormData(f)),check={comfort:v.comfort,soreness:v.soreness,energy:Number(v.energy),minutes:Number(v.minutes),historyComplete:v.historyComplete==='on',updatedAt:new Date().toISOString()};
      if(!['comfortable','sore','pain'].includes(check.comfort)||!['none','lower','upper','both'].includes(check.soreness)||!Number.isInteger(check.energy)||check.energy<1||check.energy>5||!Number.isInteger(check.minutes)||check.minutes<10||check.minutes>90)throw Error('Complete the readiness fields with valid values.');
      const next=clone(state.adaptiveSchedule||{version:1,checkins:{}});next.checkins=next.checkins||{};next.checkins[checkDate]=check;
      commit({adaptiveSchedule:next});choiceResult=S.options(state,rows(),today(),check);mount();choices();
    }catch(err){error(err);}
  });
  document.addEventListener('input',event=>{if(event.target.form?.id==='adaptive-workout-form'){capture();try{persistDraft();}catch(err){error(err);}}});
  document.addEventListener('change',event=>{
    if(event.target.form?.id!=='adaptive-workout-form')return;
    try {
      capture();const field=event.target;
      if(field.dataset.adaptiveMovement!==undefined){const id=field.dataset.adaptiveMovement;Object.keys(draft.values).filter(k=>k.startsWith('weight-'+id)||k.startsWith('reps-'+id+'-')||k==='effort-'+id||k==='form-'+id||k==='setup-'+id).forEach(k=>delete draft.values[k]);persistDraft();workout();}
      else if(field.dataset.adaptiveSkip!==undefined){persistDraft();workout();}
      else persistDraft();
    }catch(err){error(err);}
  });
  document.addEventListener('click',event=>{
    const b=event.target.closest('[data-adaptive]');if(!b)return;
    try {
      const action=b.dataset.adaptive;
      if(action==='close')return close();
      if(action==='check')return readiness(b.dataset.date||today());
      if(action==='preview')return preview(b.dataset.date);
      if(action==='rest'){
        writable();if(checkDate!==today())throw Error('The date changed. Check today’s readiness again.');
        const next=clone(state.adaptiveSchedule||{version:1,checkins:{}});next.checkins=next.checkins||{};
        next.checkins[today()]={...(next.checkins[today()]||{}),restChosen:true,restUpdatedAt:new Date().toISOString()};commit({adaptiveSchedule:next});
        draft=null;notice='Rest is a good choice. Your check-in is saved; no workout was added.';close();window.render();return;
      }
      if(action==='options'){draft=null;return choices();}
      if(action==='choose')return choose(b.dataset.choice);
      if(action==='start'){
        writable();if(!draft||draft.date!==today())throw Error('The date changed. Check today’s readiness before starting.');
        if(!draft.startedAt&&!S.options(state,rows(),today()).choices.some(c=>c.id===draft.choice.id))throw Error('Recent activity or readiness changed. Close this preview and check today’s options again.');
        draft.startedAt=draft.startedAt||new Date().toISOString();persistDraft();mount();return workout();
      }
      if(action==='resume'){restoreDraft();return workout();}
      if(action==='legacy') {
        const m=/^(\d+)-([0-6])$/.exec(b.dataset.key||'');if(!m)return;
        close();state.week=Number(m[1]);state.selectedDay=Number(m[2]);return oldOpen.call(window,Number(m[2]));
      }
      if(action==='discard') {
        writable();if(!draft)return;
        if(!confirm('Discard this unfinished workout and its entered draft sets? No completed activity will be added.'))return;
        const next=clone(state.adaptiveSchedule||{version:1,checkins:{}});
        if(next.activeSession?.id===draft.id)delete next.activeSession;
        commit({adaptiveSchedule:next});draft=null;choiceResult=null;close();notice='Unfinished workout discarded. No activity was added.';window.render();return;
      }
      if(action==='progress'){close();return window.go('progress');}
      if(action==='strava'){close();return window.go('strava');}
    }catch(err){error(err);}
  });
  const oldOpen=window.openSession;
  window.openSession=function(day,...args) {
    const date=dateForDay(day);
    if(date<today()||activeLegacy(date))return oldOpen.call(this,day,...args);
    const recommendation=schedule().days[date];
    if(!recommendation)return date>today()?preview(date):oldOpen.call(this,day,...args);
    if(date>today()||['race','completed'].includes(recommendation.type))return preview(date);
    try{return readiness(date);}catch(err){error(err);}
  };
  const oldRender=window.render;
  window.render=function(...args){const result=oldRender.apply(this,args);mount();return result;};
  function refresh() {
    const date=today(),changed=date!==lastDate;lastDate=date;
    if(changed&&['today','plan'].includes(view)) {
      const p=P.planOn(date);if(p){state.week=p.week;state.selectedDay=p.day;}
      // Do not save navigation or rebuild an open form during rollover.
      if(!dialog)window.render();else mount();
    }else mount();
    armRollover();
  }
  function armRollover() {
    clearTimeout(rolloverTimer);
    // One wake at the next Asia/Shanghai calendar boundary, not an interval rendering forms.
    const next=Date.parse(P.add(today(),1)+'T00:00:00+08:00');
    rolloverTimer=setTimeout(refresh,Math.max(1000,next-Date.now()+1000));
  }
  window.addEventListener('stryde-runs-changed',refresh);
  window.addEventListener('pageshow',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('stryde-account-change',()=>{draft=null;choiceResult=null;checkDate=null;notice='';dialog?.close();dialogState=null;requestAnimationFrame(mount);});
  window.strydeAdaptiveSchedule={mount,preview,readiness,refresh};
  mount();armRollover();
})();

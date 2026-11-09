/* Homepage summary + transparent strength-first coaching controls.
 * Uses the same monthly calculation as the calendar. All writes are owner-checked and preserve logs.
 */
(() => {
 'use strict';
 const F=window.strydeFoundation,P=window.strydeProgressModel,R=document.getElementById('root');if(!F||!P||!R)return;
 const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const today=()=>P.iso(),account=()=>window.strydeAccountStatus?.()||{};
 const records=()=>{const a=account(),s=window.strydeStravaSnapshot?.()||{};return P.records(state,a.signedIn&&s.userId===a.userId?s.rows||[]:[]);};
 let dialog=null,dialogOwner=null,dialogUid=null;
 function ensureWritable(){const a=account();if(a.conflict||a.signedIn&&!a.ready)throw Error('Resolve account sync before saving. Your device workouts have not been replaced.');if(dialogOwner&&dialogOwner!==state||dialogUid!==(a.userId||null))throw Error('Your account changed. Close and reopen this review.');}
 function commit(field,value){ensureWritable();const previous=state[field];state[field]=value;try{save();}catch(e){if(previous===undefined)delete state[field];else state[field]=previous;throw Error('Device storage could not save this review. Your previous data is unchanged.');}}
 function close(){dialog?.close();}
 function modal(title,body){close();const d=document.createElement('dialog');d.className='hub-dialog foundation-dialog';d.innerHTML=`<div class="hub-dialog-top"><h2>${h(title)}</h2><button type="button" data-foundation="close" aria-label="Close">×</button></div>${body}<p class="foundation-error" role="alert"></p>`;document.body.append(d);dialog=d;dialogOwner=state;dialogUid=account().userId||null;d.addEventListener('close',()=>{d.remove();if(dialog===d){dialog=null;dialogOwner=null;dialogUid=null;}});d.showModal();return d;}
 function home(){
  if(view!=='today'){R.querySelector('[data-foundation-home]')?.remove();return;}
  const rows=records(),s=window.strydeStravaSnapshot?.()||{},a=account(),attendance=window.strydeAttendance?.snapshot?.()||{},month=today().slice(0,7);
  const tally=window.strydeMonthlyTally?.calculate(month,rows,a.signedIn?attendance.rows||[]:[]);if(!tally)return;
  const note=window.strydeMonthlyTally.sourceNote(a,s,attendance),review=F.review(state,rows,today());
  const signature=JSON.stringify([tally,note,review,today()]);let box=R.querySelector('[data-foundation-home]');if(box?.dataset.signature===signature)return;
  if(!box){box=document.createElement('section');box.className='foundation-home';box.dataset.foundationHome='';const anchor=R.querySelector('.top');if(anchor)anchor.after(box);else R.prepend(box);}
  box.dataset.signature=signature;
  const monthName=new Date(month+'-01T12:00:00Z').toLocaleDateString([],{month:'long',year:'numeric',timeZone:'UTC'});
  box.innerHTML=`<header><div><span class="eyebrow">YOUR MONTH AT A GLANCE</span><h2>${h(monthName)}</h2></div><button type="button" data-foundation="month" aria-label="Open this month's calendar">Calendar ↗</button></header><div class="foundation-total"><strong>${tally.completed}<span> / ${tally.goal??'—'}</span></strong><div><b>workouts logged</b><small>${tally.goal?Math.max(0,tally.goal-tally.completed)+' toward the baseline target':'No target set'}</small></div><span class="foundation-percent">${tally.percent??0}%</span></div>${tally.goal?`<progress max="${tally.goal}" value="${Math.min(tally.completed,tally.goal)}" aria-label="${tally.completed} of ${tally.goal} monthly workouts"></progress>`:''}<div class="foundation-numbers"><div><span>Strength</span><b>${tally.strength} <small>/ ${tally.target.strength}</small></b></div><div><span>Runs</span><b>${tally.runs} <small>/ ${tally.target.run}</small></b></div><div><span>Attendance</span><b>${tally.attendanceDays}<small> days</small></b></div></div><p class="foundation-note">Attendance is separate from logged workouts. The target is a guide—not missed work to catch up.</p>${note?`<p class="foundation-note" role="status">${h(note)}</p>`:''}<div class="foundation-focus"><div><span class="eyebrow">STRENGTH FIRST · RUNNING FOUNDATION</span><h3>${h(review.phase)}</h3></div><button type="button" data-foundation="method">Plan & why →</button></div><div class="foundation-checks"><button type="button" data-foundation="run-feedback">Review a recent run</button><button type="button" data-foundation="review">${review.due?'Training review due':'Review training & recovery'}</button></div>`;
 }
 function goals(){
  if(view!=='goals')return;
  let box=R.querySelector('[data-foundation-goals]');if(box)return;
  box=document.createElement('section');box.dataset.foundationGoals='';box.className='hub-card foundation-goals';
  box.innerHTML=`<div class="eyebrow">CURRENT COACHING DIRECTION</div><h3>Strength now. Endurance for the long term.</h3><p>Three strength slots and two easy running-conditioning slots each week, adjusted from actual performance and recovery. Tuesday and Friday remain protected.</p><p>2027 is a preparation horizon, not a confirmed race date or distance. The December 2026 race no longer drives your plan.</p><button class="btn" data-foundation="method">See the weekly rhythm</button>`;
  (R.querySelector('.hub-heading')||R.firstElementChild)?.after(box);
  const archived=(state.milestones||[]).filter(m=>m.status==='archived');if(archived.length&&!R.querySelector('[data-foundation-archived]')){
   const a=document.createElement('details');a.className='hub-card';a.dataset.foundationArchived='';a.innerHTML='<summary>Archived goals · history retained</summary>'+archived.map(m=>`<article><h3>${h(m.title)}</h3><p>${h(m.archiveReason||'Archived, not completed.')}</p><button class="btn" data-journal="reflect" data-id="${h(m.id)}">Reflections & photos</button></article>`).join('');R.append(a);
  }
 }
 function method(){
  modal('Your coaching plan',`<div class="foundation-lead"><span class="eyebrow">STRENGTH + GRADUAL RUN CONDITIONING</span><h3>A repeatable rhythm, not random sessions.</h3><p>Build definition and strength while gradually developing running tolerance. A lower scale number never increases your training score, and the app does not promise targeted fat loss.</p></div><div class="foundation-week">${F.TYPES.map((type,i)=>`<article><b>${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]}</b><div><strong>${h(F.NAMES[type])}</strong><p>${h(F.REASONS[type])}</p></div></article>`).join('')}</div><h3>How STRYDE makes the next decision</h3><p><b>Strength:</b> start with two working sets per movement. Use recent comparable logs for load; build reps inside the displayed range. After two controlled top-range sessions, review the next available load. Your approval is required. Old or missing loads are marked for calibration, not guessed.</p><p><b>Volume:</b> after six recorded strength sessions in 28 days, main upper/lower days may use three sets if effort supports it. Full-body day stays modest before Sunday. Two recent sessions with mostly hard effort trigger fewer sets and a recovery review, not a forced increase.</p><p><b>Running:</b> start with easy, time-based run/walk. Two similar runs reported comfortable, easy and recovered the next day can support an optional two-minute extension. Run times from Strava alone do not prove readiness. No speed sessions or marathon-distance jumps in this foundation phase.</p><p><b>Recovery:</b> pain or concerning symptoms stop the recommendation. Low energy, widespread soreness, a demanding recent run, repeated strength loading, or several training days can reduce or replace a session—with an explicit reason. A short easy run after normal leg training is not automatically cancelled.</p><p><b>Review:</b> use a four-week review of consistency, rep/load progress, running tolerance, and how you feel. This is a review cadence, not an automatic four-week transformation or guaranteed deload.</p><h3>Evidence and limits</h3><p>Progressive resistance training and regular major-muscle exposure are evidence-based. These exact rep gates, session counts, recovery thresholds and two-minute running steps are conservative application choices—not validated measurements of your body.</p><p><a href="https://acsm.org/resistance-training-guidelines-update-2026/" target="_blank" rel="noopener">ACSM 2026 resistance-training guidance ↗</a><br><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC8891239/" target="_blank" rel="noopener">Concurrent endurance and strength evidence ↗</a><br><a href="https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/" target="_blank" rel="noopener">NHS gradual run/walk guidance ↗</a><br><a href="https://www.cdc.gov/physical-activity-basics/measuring/index.html" target="_blank" rel="noopener">CDC talk-test guidance ↗</a></p><p class="foundation-note">STRYDE organizes training and provides rule-based feedback. It cannot observe technique, diagnose an injury, verify your reported effort, or clear concerning symptoms. Use a qualified professional for those situations; do not push through pain to satisfy a target.</p>`);
 }
 function feedback(){
  const runs=records().filter(r=>r.kind==='run'&&r.date>=P.add(today(),-28)).slice(-8).reverse();
  if(!runs.length){modal('Run feedback','<p>No recent recorded run is available. Sync Strava or log the actual run first; a planned run is not a result.</p><button class="btn orange" data-foundation="strava">Open Strava history</button>');return;}
  modal('How did the run feel?',`<form id="foundation-run-feedback" class="hub-form"><label>Recorded run<select name="runId">${runs.map(r=>`<option value="${h(r.id)}">${h(r.date)} · ${h(r.name)} · ${h(r.distance)} km</option>`).join('')}</select></label><label>Effort (1–10)<input type="number" min="1" max="10" name="effort" required placeholder="Easy usually feels around 2–4"></label><label>Was movement comfortable and pain-free?<select name="comfortable" required><option value="">Choose…</option><option value="yes">Yes</option><option value="no">No / symptoms</option></select></label><label>Recovered normally the following day?<select name="recovered" required><option value="unknown">Too soon / not sure</option><option value="yes">Yes</option><option value="no">No</option></select></label><p class="foundation-note">Leave next-day recovery unknown until that day has happened. A faster run alone does not justify increasing time.</p><button class="btn orange">Save run feedback</button></form>`);
 }
 function review(){const r=F.review(state,records(),today());modal('Training review',`<p>Last 28 days: <b>${r.lifts} strength sessions · ${r.runs} runs</b>. ${h(r.why)}</p><form id="foundation-review" class="hub-form"><label>What is improving, and what needs attention?<textarea name="note" maxlength="2000" rows="4" required placeholder="Technique, energy, recovery, confidence, reps or endurance…"></textarea></label><p>Saving a reflection does not certify readiness or increase your loads. Your actual logs and recovery checks still drive session recommendations.</p><button class="btn orange">Save coaching review</button></form>`);}
 function approveLoad(id){const e=EX[id];if(!e)return;const t=F.exerciseTarget(id,today(),state,records());if(!t.readyToIncrease){modal('Keep building',`<p>${h(t.reason)}</p>`);return;}
  modal('Approve your next load',`<form id="foundation-load" class="hub-form" data-lift="${id}"><h3>${h(e.name)}</h3><p>Current recorded load: <b>${h(t.last.weight)} ${h(t.unit)}</b>. Choose the smallest practical next increment on the same equipment. This does not change an already-started session.</p><label>Next available weight (${h(t.unit)})<input name="weight" type="number" step="any" min="${Number(t.last.weight)+.01}" max="2000" required placeholder="Enter the equipment’s next setting"></label><label class="hub-check"><input name="sameSetup" type="checkbox" required>I used the same equipment and controlled technique in both sessions.</label><button class="btn orange">Approve for the next session</button></form>`);
 }
 document.addEventListener('click',e=>{const b=e.target.closest('[data-foundation]');if(!b)return;const act=b.dataset.foundation;
  if(act==='close')close();else if(act==='method')method();else if(act==='run-feedback')feedback();else if(act==='review')review();else if(act==='strava'){close();window.go('strava');}
  else if(act==='month'){window.strydeTrainingHub?.focusCalendar(today());window.strydeTrainingHub?.setCalendarMode?.('month');window.go('plan');}
 });
 document.addEventListener('submit',e=>{
  if(!['foundation-run-feedback','foundation-review','foundation-load'].includes(e.target.id))return;e.preventDefault();const form=e.target;
  try{if(!form.reportValidity())return;ensureWritable();const v=Object.fromEntries(new FormData(form));
   if(form.id==='foundation-run-feedback'){
    const r=records().find(r=>r.id===v.runId&&r.kind==='run');if(!r)throw Error('This run is no longer available. Reopen the form.');
    if(v.recovered==='yes'&&r.date>=today())throw Error('Next-day recovery cannot be confirmed on the run date. Choose Too soon / not sure.');
    const effort=Number(v.effort);if(!Number.isInteger(effort)||effort<1||effort>10)throw Error('Choose effort from 1 to 10.');
    commit('foundationRunFeedback',{...state.foundationRunFeedback,[r.id]:{effort,comfortable:v.comfortable==='yes',recovered:v.recovered==='yes',recoveryKnown:v.recovered!=='unknown',date:r.date,updatedAt:new Date().toISOString()}});
    // A reported movement problem is a present review flag, not a medical diagnosis.
    if(v.comfortable==='no') {const check=state.coaching||{};commit('coaching',{...check,recovery:{...check.recovery,[today()]:{...check.recovery?.[today()],comfort:'pain',note:'Movement symptoms reported in run review; reassess before training.',updatedAt:new Date().toISOString()}}});}
   }else if(form.id==='foundation-review'){commit('foundationReviews',[...(state.foundationReviews||[]),{id:crypto.randomUUID(),date:today(),note:String(v.note).trim().slice(0,2000)}]);}
   else {const id=Number(form.dataset.lift),t=F.exerciseTarget(id,today(),state,records()),weight=Number(v.weight);if(!t.readyToIncrease||!v.sameSetup||!Number.isFinite(weight)||weight<=t.weight||weight>2000)throw Error('Recheck eligibility and the next available load.');if(weight>t.weight*1.1)throw Error('That is over 10% above the last load. Keep this load and build reps, or review an intermediate option with a coach.');commit('approvedLoads',{...state.approvedLoads,[id]:{weight,previous:t.weight,approvedAt:new Date().toISOString(),source:'foundation-review'}});}
   close();window.render();
  }catch(err){const error=dialog?.querySelector('.foundation-error');if(error)error.textContent=err.message;}
 });
 function mount(){home();goals();}
 let queued=false;function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount();});}
 new MutationObserver(queue).observe(R,{childList:true,subtree:true});
 for(const name of ['stryde-runs-changed','stryde-attendance-changed','stryde-account-change','stryde-adaptive-completed'])window.addEventListener(name,queue);
 window.addEventListener('stryde-account-change',close);
 const oldRender=window.render;window.render=function(...args){const r=oldRender.apply(this,args);mount();return r;};
 const previousTarget=window.target;
 window.target=function(id){
  const date=Number.isInteger(sessionDay)&&['session','exercise'].includes(view)?trainingPlanFor(state.week,sessionDay).date:today();
  const saved=Number.isInteger(sessionDay)?state.logs?.[key(sessionDay)]:null;
  if(!F.active(date)||saved&&['session','exercise'].includes(view)&&(saved.status==='done'||saved.status==='in_progress'||saved.prescriptionSnapshot||saved.timing))return previousTarget(id);
  const t=F.exerciseTarget(id,date,state,records());return {...t,label:t.source,why:t.reason};
 };
 window.strydeFoundationUI={mount,method,approveLoad};mount();
})();

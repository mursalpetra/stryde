/* STRYDE run-day preparation.
 * Read-only plans + per-date preparation preferences; never fabricates recorded runs.
 * Nutrition references are linked in the Tips tab. Conditions are user-reported, not live weather.
 */
(() => {
  'use strict';
  if (window.strydeRunDay) return;
  const ROOT = document.getElementById('root');
  const RUN_DAYS = [1, 4, 6];
  const SOURCES = [
    ['Fuel during endurance exercise · Australian Institute of Sport', 'https://www.ausport.gov.au/ais/nutrition/supplements/group_a/sports-foods2/sports-drink/how-and-when-do-i-use-it'],
    ['Food and timing · Mayo Clinic', 'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/exercise/art-20045506'],
    ['Warm-up, cool-down and run/walk · NHS', 'https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/'],
    ['Pacing with the talk test · CDC', 'https://www.cdc.gov/physical-activity-basics/measuring/index.html'],
    ['Hydration and avoiding overdrinking · international consensus', 'https://doi.org/10.1136/bjsports-2015-095004'],
    ['Recording in Strava · Strava Help', 'https://support.strava.com/en-us/articles/15402137-how-do-i-record-an-activity-on-strava']
  ];
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid = (v, min, max) => v !== '' && v != null && Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max;
  const dateId = date => [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
  const runView = () => typeof view !== 'undefined' && view === 'session' && RUN_DAYS.includes(sessionDay);
  const shortTime = mins => mins < 60 ? `${mins} min` : `${Math.floor(mins/60)}h ${String(mins%60).padStart(2,'0')}m`;
  const stamp = date => date.toLocaleDateString([], {weekday:'long',month:'short',day:'numeric'});
  const metric = v => Number.isInteger(v) ? String(v) : String(Math.round(v*10)/10);
  let launchKey = null, launchNotice = '', preparedNotice = '';

  function paceEstimate(w, d) {
    const before = dateFor(w,d).getTime();
    const candidates = Object.entries(state.logs || {}).flatMap(([key, l]) => {
      const match = /^(\d{1,2})-([0-6])$/.exec(key);
      if (!match || l?.status !== 'done' || !RUN_DAYS.includes(Number(match[2]))) return [];
      const time = dateFor(Number(match[1]), Number(match[2])).getTime();
      if (time >= before || before-time > 90*86400000) return [];
      const minutes = valid(l.elapsed_seconds,60,43200) ? Number(l.elapsed_seconds)/60 : Number(l.minutes);
      const distance = Number(l.actual);
      if (!valid(distance,1,80) || !valid(minutes,5,720)) return [];
      const pace = minutes/distance;
      return pace >= 4 && pace <= 20 ? [{time,pace}] : [];
    }).sort((a,b)=>b.time-a.time).slice(0,5);
    if (!candidates.length) return {pace:9,source:'Planning estimate at 9:00/km. Change the expected time below; this is not a pace target.'};
    const values = candidates.map(v=>v.pace).sort((a,b)=>a-b), mid = Math.floor(values.length/2);
    const pace = values.length%2 ? values[mid] : (values[mid-1]+values[mid])/2;
    return {pace,source:`Estimated from ${values.length} earlier saved run${values.length===1?'':'s'} in STRYDE. Not a pace target; allow for walk breaks and conditions.`};
  }
  function context(w = state.week, d = sessionDay) {
    if (!RUN_DAYS.includes(d) || !WEEKS[w-1]) return null;
    const date = dateFor(w,d), id = dateId(date);
    const settings = state.runPreparation?.[id] || {};
    const km = Number(WEEKS[w-1][d===1?0:d===4?1:2]);
    const estimate = paceEstimate(w,d);
    const minutes = valid(settings.minutes,5,600) ? Math.round(Number(settings.minutes)) : Math.max(5,Math.round(km*estimate.pace));
    const isRace = id === RACE && d===6 && km>=20;
    const daysToRace = Math.round((new Date(RACE+'T12:00:00')-date)/86400000);
    const taper = !isRace && daysToRace > 0 && daysToRace <= 13;
    const previousLong = w>1 ? Number(WEEKS[w-2]?.[2]) : null;
    const cutback = !isRace && d===6 && previousLong && km<previousLong;
    const startIn = ['soon','oneTwo','threeFour'].includes(settings.startIn) ? settings.startIn : 'soon';
    const weather = ['unknown','mild','hot'].includes(settings.weather) ? settings.weather : 'unknown';
    const terrain = ['flat','hills','treadmill'].includes(settings.terrain) ? settings.terrain : 'flat';
    return {w,d,date,id,km,minutes,isRace,taper,cutback,startIn,weather,terrain,
      type:isRace?'Half-marathon race':d===6?'Long easy run':taper?'Easy taper run':'Easy run',
      estimateSource:valid(settings.minutes,5,600)?'Your expected run / run-walk time, including stops. Separate from the result you record.':estimate.source};
  }
  function guidance(c) {
    const longFuel = c.minutes >= 90, medium = c.minutes>=60 && !longFuel;
    let purpose = c.isRace ? `Complete your ${metric(c.km)} km milestone with the run/walk and fueling strategy you rehearsed. Today is not the time to test new food or equipment.`
      : c.cutback ? `A shorter ${metric(c.km)} km long run this week. Let the lighter load do its job; do not add distance to catch up.`
      : c.taper ? `Keep this ${metric(c.km)} km session comfortable. The goal is to arrive at the race rested, not gain last-minute fitness.`
      : c.d===6 ? `Build time on your feet across ${metric(c.km)} km. Keep it easy rather than chasing a faster pace.`
      : c.d===4 ? `A comfortable ${metric(c.km)} km run before Sunday's long run. Finish with energy left, rather than turning today into a hard workout.`
      : `Settle back into running with ${metric(c.km)} km at easy effort. Save enough energy for the next scheduled strength session.`;
    let before = c.startIn==='soon'
      ? 'Starting within an hour: choose a small familiar carbohydrate snack if needed, such as a banana or one slice of toast with jam. Avoid a large meal right before leaving.'
      : c.startIn==='oneTwo'
        ? 'About 1–2 hours before: have a familiar light carbohydrate-rich snack or meal, for example toast with jam and a banana, or a small bowl of cereal with milk or a tolerated alternative.'
        : 'About 3–4 hours before: have a familiar carbohydrate-rich meal, such as rice with a small serving of eggs or tofu, or your usual porridge and fruit. Leave time to digest.';
    if(longFuel) before += ' Fuel before this longer run; do not deliberately skip breakfast to chase fat loss. Keep a big, fatty or high-fibre meal for another time if it upsets your stomach.';
    else before += ' For this shorter easy outing, an extra snack is optional if you have already eaten and feel comfortable.';
    let during = longFuel
      ? `Because you expect ${c.minutes} minutes, plan carbohydrate during the run, not just before it. A usual endurance range is 30–60 g/hour. Practise toward the lower end first with familiar fuel; do not force an untested intake.`
      : medium
        ? `At ${c.minutes} minutes, carbohydrate can be useful, especially if hungry or running harder. Take a familiar gel, chews or a small snack for practice rather than waiting to feel depleted; food is not mandatory for every easy run of this length.`
        : `For an adequately fueled ${c.minutes}-minute easy run, gels or food during the run are usually unnecessary. Keep the focus on a relaxed rhythm, not extra fuel or speed.`;
    if(c.minutes>150) during += ' This is over 2½ hours: rehearse your full fueling plan in training. Higher intakes require practice and individual advice; STRYDE will not jump you to 90 g/hour.';
    const water = c.weather==='hot'
      ? `You marked hot / humid conditions. Choose a cooler start or shorten the session, lower your pace, and make water/refill access part of the route. For prolonged sweaty running, a familiar electrolyte drink may help replace sodium; never force large volumes.`
      : (longFuel || medium)
        ? `For around ${shortTime(c.minutes)} on your feet, carry water or plan refills. Sip according to thirst and your practiced needs; do not force a bottle-per-hour target. Consider a familiar electrolyte drink for heavy sweating, and count any drink carbohydrates in your fuel total.`
        : 'Start normally hydrated. For this short easy run, drink as needed and know where water is available, especially in warmth. No need to force large amounts.';
    const pacing = c.terrain==='hills'
      ? 'Hills today: keep the effort easy and allow the pace to slow. Walk steep sections rather than trying to hold a flat-road pace.'
      : c.terrain==='treadmill'
        ? 'Treadmill today: use comfortable effort and check the treadmill distance. The Strava phone GPS recorder is for outdoor movement; for this session use a compatible watch indoor mode or log the treadmill result manually.'
        : c.isRace
          ? 'Start conservatively and use your rehearsed walk breaks from the beginning. Do not chase other runners or a pace you have not practiced.'
          : 'Start slower than you think you need to. You should be able to talk in sentences; ease off or take a walk break if you can only manage a few words.';
    const recovery = longFuel
      ? 'After you finish, walk gently to cool down, then have a carbohydrate-and-protein meal or snack within the next couple of hours. Examples: yogurt or soy yogurt with cereal and fruit; eggs on toast; or rice with chicken or tofu. Rehydrate gradually.'
      : 'Finish with a gentle cool-down walk. Your next normal meal with carbohydrate and protein is usually enough; for example eggs on toast or rice and tofu. No special recovery supplement is required.';
    const next = c.isRace ? 'After the race: recovery first. Review the result before setting your next milestone; do not automatically resume a hard session.'
      : c.d===6 ? 'Monday is scheduled recovery. Do not use it to make up missed distance.'
      : c.d===4 ? 'Sunday is the long run. Today should not leave you unusually exhausted for it.'
      : 'The next scheduled session is Glutes & Legs. If soreness changes your gait, recover and reassess instead of forcing the plan.';
    // A clearly labelled example, based on packet labels, not an asserted nutrient value for every gel.
    const portions = longFuel ? Math.ceil((c.minutes/60*30)/25) : 0;
    const fuelTimes = Array.from({length:portions},(_,i)=>Math.round((i+.5)*c.minutes/portions));
    return {purpose,before,during,water,pacing,recovery,next,longFuel,medium,portions,fuelTimes,
      totalCarbs:portions*25,
      pack:longFuel?'Familiar fuel, water/refill plan, charged phone, and the shoes you have trained in.':medium?'Water/refill access, one familiar backup snack, and a charged phone.':'Comfortable shoes, charged phone and water access if needed.'};
  }
  const icon = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
  function heading(c) {
    return `<section class="run-day-hero"><div class="eyebrow">${escape(stamp(c.date))} · WEEK ${c.w}</div><h1>${escape(c.type)}</h1><div class="run-day-stats"><div><small>Planned distance</small><strong>${metric(c.km)} <em>km</em></strong></div><div><small>Expected run time</small><strong>~${c.minutes} <em>min</em></strong></div></div><p class="run-day-estimate">${escape(c.estimateSource)}</p></section>`;
  }
  function prep(c) {
    const option = (value,label,current) => `<option value="${value}" ${current===value?'selected':''}>${label}</option>`;
    return `<details class="run-preparation"><summary>Adjust this day's preparation <span>Time · food timing · conditions</span></summary><form id="run-preparation-form" data-prep-date="${c.id}"><label>Expected run time, including walk breaks (minutes)<input name="minutes" type="number" min="5" max="600" step="1" required value="${c.minutes}"></label><label>How soon will you start?<select name="startIn">${option('soon','Within an hour',c.startIn)}${option('oneTwo','In 1–2 hours',c.startIn)}${option('threeFour','In 3–4 hours',c.startIn)}</select></label><div class="run-prep-grid"><label>Conditions you expect<select name="weather">${option('unknown','Not specified',c.weather)}${option('mild','Mild / cool',c.weather)}${option('hot','Hot / humid',c.weather)}</select></label><label>Where are you running?<select name="terrain">${option('flat','Mostly flat outdoors',c.terrain)}${option('hills','Hilly outdoors',c.terrain)}${option('treadmill','Treadmill',c.terrain)}</select></label></div><p class="muted">These are your estimates, not a weather forecast. Saving updates only this date's preparation; it does not alter your distance plan or completed runs.</p><button class="btn orange" type="submit">Update this day's tips</button><button class="run-day-link" type="button" data-run-day-action="reset-estimate">Use estimate from logged runs</button></form></details>`;
  }
  function fuelCard(c,g) {
    if (!g.longFuel) return '';
    return `<section class="run-day-fuel"><span class="eyebrow">FUEL PLAN · ~${c.minutes} MIN</span><h2>Eat before. Bring fuel with you.</h2><p>${escape(g.during)}</p><div class="run-fuel-example"><strong>Example using 25 g carbohydrate portions</strong><p>Pack ${g.portions} familiar portions (${g.totalCarbs} g total), such as gels or chews whose label shows 25 g. Take one around each time below, with water as directed on the packet.</p><div class="run-fuel-times">${g.fuelTimes.map(t=>`<span>~${t} min</span>`).join('')}</div><small>An example within the endurance range, not a required feeding schedule. Drinks count toward the total. Check labels, start with amounts you tolerate, and practise before race day. STRYDE does not send timed fuel alerts while Strava is open.</small></div></section>`;
  }
  function launch(c) {
    return `<section class="run-day-launch"><a class="run-strava-open" href="strava://record" data-run-day-action="launch">Open Strava to record ${icon}</a><p>In Strava, select <strong>Run</strong>, then tap <strong>Start</strong>. Opening Strava does not begin recording or complete your STRYDE workout.</p>${c.terrain==='treadmill'?'<p class="run-day-caution">For a treadmill, use a watch indoor-run mode or log the result manually; phone GPS will not measure treadmill distance.</p>':''}<details><summary>Strava did not open?</summary><p>Install Strava and open this from your phone. You can also open the Strava icon yourself, then select Record → Run → Start.</p><a href="https://www.strava.com/mobile" target="_blank" rel="noopener">Get / open Strava</a></details><p class="run-launch-message" role="status">${escape(launchKey===c.id?launchNotice:'')}</p></section>`;
  }
  function tipCard(number,title,text){return `<section class="run-day-tip"><span class="run-tip-step">${number}</span><div><h3>${title}</h3><p>${escape(text)}</p></div></section>`;}
  function sources(){return `<details class="run-tip-sources"><summary>Sources and how these tips are chosen</summary><p>Rules use the selected date, planned distance, expected duration, and the conditions you enter. Food choices are examples—use foods that suit your allergies and tolerance. No glucose diagnosis or calorie-deficit target is inferred.</p>${SOURCES.map(([title,url])=>`<a href="${url}" target="_blank" rel="noopener">${title} ↗</a>`).join('')}<p>General training guidance, not a medical or individualized dietetic prescription. Stop for concerning symptoms or pain that changes your movement.</p></details>`;}
  function afterRun(){return `<section class="run-day-after"><h3>Finished your run?</h3><p>Save it in Strava first, then bring the real result back here. Imported runs stay separate from planned distances.</p><div class="run-day-actions"><button class="btn orange" data-run-day-action="sync">Sync finished run</button><button class="btn" data-run-day-action="history">View my Strava runs</button></div><p class="muted">No automatic completion or duplicate manual entry just from opening Strava.</p></section>`;}
  function manual(c) {
    const l = state.logs?.[`${c.w}-${c.d}`] || {};
    return `<details class="run-day-manual"><summary>Log without Strava</summary><p>For a treadmill, an unrecorded run, or a device problem. Do not also manually log a run already imported from Strava.</p><div class="statline run-manual-timer-anchor"></div><form id="run-day-manual-form"><label>Actual distance (km)<input id="run-distance" name="distance" type="number" min="0.1" max="200" step="0.01" required value="${escape(l.actual||'')}"></label><label>Full run duration (minutes)<input id="run-time" name="minutes" type="number" min="1" max="1440" step="0.1" required value="${escape(l.minutes||'')}"></label><label>Effort (1–10)<input id="run-effort" name="effort" type="number" min="1" max="10" step="1" required value="${escape(l.effort||'')}"></label><button class="btn orange" type="submit">Save manual run</button></form></details>`;
  }
  function markup(c,tab) {
    const g=guidance(c);
    const tabs=[['workout','Run'],['tips',"This day's tips"],['history','History']];
    const active=tabs.some(([t])=>t===tab)?tab:'workout';
    const top=`<div class="backbar"><button type="button" onclick="go('today')" aria-label="Back to Today">‹</button><h3>${escape(c.type)}</h3><button type="button" data-run-day-action="account" aria-label="Account">⋯</button></div><div class="tabs run-day-tabs" role="tablist" aria-label="Run details">${tabs.map(([t,n])=>`<button type="button" role="tab" aria-selected="${t===active}" class="${t===active?'active':''}" onclick="setSessionTab('${t}')">${n}</button>`).join('')}</div>`;
    let body=heading(c);
    if(active==='workout') body+=`<div class="run-day-purpose"><strong>Your focus</strong><p>${escape(g.purpose)}</p></div>${launch(c)}${g.longFuel?fuelCard(c,g):`<div class="run-short-note"><h3>For your ~${c.minutes}-minute run</h3><p>${escape(g.during)}</p></div>`}<button type="button" class="run-day-tip-link" onclick="setSessionTab('tips')">What to eat, drink and do for this run ${icon}</button>${prep(c)}${afterRun()}${manual(c)}`;
    else if(active==='tips') body+=`<p class="run-day-specific">Made for ${escape(stamp(c.date))}: ${metric(c.km)} km, about ${shortTime(c.minutes)}. ${escape(g.purpose)}</p>${prep(c)}${tipCard('01','Before you leave',g.before)}${tipCard('02','Warm up for this run','Walk easily for 5 minutes, then start running gently. The expected run time above excludes your separate warm-up and cool-down.')}${tipCard('03',c.isRace?'Your race approach':'How to run today',g.pacing)}${g.longFuel?fuelCard(c,g):tipCard('04','Fuel during this run',g.during)}${tipCard('05','Water and conditions',g.water)}${tipCard('06','After this run',g.recovery)}<div class="run-next-session"><strong>What comes next</strong><p>${escape(g.next)}</p></div><div class="run-day-pack"><strong>Bring today</strong><p>${escape(g.pack)}</p></div>${c.weather==='unknown'?'<p class="muted">Weather has not been checked. In heat or humidity, slow down, plan water access and shorten the run if needed.</p>':''}<p class="run-day-safety">Stop if you develop sharp or worsening pain, dizziness, chest pain, or unusual breathlessness. Seek urgent help for severe or persistent symptoms.</p>${sources()}${launch(c)}`;
    else body+=`${afterRun()}<div class="run-day-purpose"><h3>Planned is not completed</h3><p>Strava contains the recorded distance and times. Use View my Strava runs to see the imported history; a planned ${metric(c.km)} km run is not logged as completed until you actually record it.</p></div>`;
    return top+`<article class="run-day" data-stryde-run-day="${c.id}" data-run-tab="${active}">${body}<p class="run-prep-saved" role="status">${escape(preparedNotice)}</p></article>`;
  }
  function draw() {
    const c=context();if(!c)return;
    ROOT.innerHTML=markup(c,sessionTab);
    if(typeof navHTML==='function')document.getElementById('nav').innerHTML=navHTML();
    // Keep the optional STRYDE timer inside manual logging, not competing with Strava.
    if(sessionTab==='workout')window.strydeWorkoutTimer?.mount();
  }
  const originalSaveRun=window.saveRun;
  window.saveRun=function(...args){
    const form=ROOT?.querySelector('#run-day-manual-form');
    if(runView()&&form&&!form.reportValidity())return;
    return originalSaveRun.apply(this,args);
  };
  const originalRender=window.render;
  window.render=function(...args){if(runView()){draw();return;}preparedNotice='';return originalRender.apply(this,args);};
  function persistPreparation(c,settings){
    if(!state.runPreparation||typeof state.runPreparation!=='object'||Array.isArray(state.runPreparation))state.runPreparation={};
    state.runPreparation[c.id]={...state.runPreparation[c.id],...settings};
    save();
  }
  document.addEventListener('submit',event=>{
    if(!runView())return;
    if(event.target.id==='run-preparation-form'){
      event.preventDefault();const form=event.target;if(!form.reportValidity())return;
      const c=context(),f=new FormData(form);
      if(form.dataset.prepDate!==c.id)return;
      const minutes=Number(f.get('minutes'));
      if(!valid(minutes,5,600))return;
      persistPreparation(c,{minutes:Math.round(minutes),startIn:String(f.get('startIn')),weather:String(f.get('weather')),terrain:String(f.get('terrain'))});
      preparedNotice='Preparation saved for '+stamp(c.date)+'. Tips updated.';window.render();
    }else if(event.target.id==='run-day-manual-form'){
      event.preventDefault();if(event.target.reportValidity())window.saveRun();
    }
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-run-day-action]');if(!button)return;
    const action=button.dataset.runDayAction;
    if(action==='launch'){
      const c=context();if(!c)return;
      launchKey=c.id;launchNotice='Opening Strava. Select Run, then tap Start there. No activity has been created in STRYDE.';
      const node=ROOT.querySelector('.run-launch-message');if(node)node.textContent=launchNotice;
      // Do not prevent the user-initiated app link, start a timer, or mark a workout complete.
    }else if(action==='sync'){
      window.go('strava');requestAnimationFrame(()=>window.strydeSyncStrava?.());
    }else if(action==='history')window.go('strava');
    else if(action==='account')window.strydeOpenAccount?.();
    else if(action==='reset-estimate'){
      const c=context();if(!c)return;persistPreparation(c,{minutes:null});preparedNotice='Expected time recalculated from available saved runs.';window.render();
    }
  });
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&launchKey&&runView()){
      const c=context();if(c.id!==launchKey)return;
      launchNotice='Back from Strava? Save your activity there, then tap Sync finished run below.';
      const node=ROOT.querySelector('.run-launch-message');if(node)node.textContent=launchNotice;
    }
  });
  window.strydeRunDay={context,guidance,render:draw};
  if(runView())draw();
})();

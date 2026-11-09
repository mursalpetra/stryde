/* Monthly calendar target and completed-workout tally.
 * Read-only derived UI: never creates workouts, changes plans, or stores private records.
 * Attendance-only visits stay separate; the target is the dated baseline, not catch-up work.
 */
(() => {
  'use strict';
  if (window.strydeMonthlyTally) return;
  const P = window.strydeProgressModel;
  if (!P) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label = date => new Date(date + 'T12:00:00Z').toLocaleDateString(undefined, {month:'short',day:'numeric',timeZone:'UTC'});

  function calculate(month, records = [], attendance = [], asOf = P.iso()) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '') || !P.validDate(month + '-01') || !P.validDate(asOf)) return null;
    const first = month + '-01', end = new Date(first + 'T12:00:00Z');
    end.setUTCMonth(end.getUTCMonth() + 1);
    const last = P.add(end.toISOString().slice(0,10), -1);
    const target = {run:0,strength:0}, covered = [];
    for (let date = first; date <= last; date = P.add(date,1)) {
      const plan = typeof trainingPlanOn === 'function' ? trainingPlanOn(date) : null;
      if (!plan || !Number.isInteger(plan.week) || plan.week < 1 || typeof WEEKS === 'undefined' || (plan.week > WEEKS.length && !plan.foundation)) continue;
      covered.push(date);
      if (plan.kind === 'run' || plan.kind === 'strength') target[plan.kind]++;
    }
    const seen = new Set();
    const rows = (Array.isArray(records) ? records : []).filter(r => {
      if (!r || !r.id || seen.has(r.id) || !P.validDate(r.date) || r.date < first || r.date > last || r.date > asOf || r.deleted || (r.status && r.status !== 'done')) return false;
      seen.add(r.id); return true;
    });
    const runs = rows.filter(r => r.kind === 'run').length;
    const strength = rows.filter(r => r.kind === 'strength').length;
    const completed = runs + strength;
    const workoutDates = new Set(rows.filter(r => ['run','strength'].includes(r.kind)).map(r => r.date));
    const attendanceDates = new Set((Array.isArray(attendance) ? attendance : []).filter(r => r && P.validDate(r.attendance_date) && r.attendance_date >= first && r.attendance_date <= last && r.attendance_date <= asOf).map(r => r.attendance_date));
    const attendanceOnly = [...attendanceDates].filter(d => !workoutDates.has(d)).length;
    const goal = covered.length ? target.run + target.strength : null;
    return {
      month, first, last, goal, completed, runs, strength, target,
      workoutDays:workoutDates.size, attendanceDays:attendanceDates.size, attendanceOnly,
      otherActivities:rows.filter(r => ['walk','other'].includes(r.kind)).length,
      remaining:goal === null ? null : Math.max(0,goal-completed),
      percent:goal > 0 ? Math.round(100*completed/goal) : null,
      coveredFrom:covered[0] || null, coveredTo:covered.at(-1) || null,
      partialPlan:covered.length > 0 && (covered[0] !== first || covered.at(-1) !== last),
      isPast:last < asOf,
      possibleDuplicates:typeof P.analyze === 'function' ? P.analyze(rows,{start:first,end:asOf < last ? asOf : last}).duplicates.length : 0
    };
  }

  function sourceNote(account, runs, attendance) {
    if (!account.signedIn) return 'Device logs only. Sign in to include your saved Strava runs and gym check-ins.';
    const notes = [];
    if (account.conflict || !account.ready) notes.push('Account sync is not complete; totals may be incomplete.');
    if (runs.busy || !runs.attempted) notes.push('Loading saved Strava runs…');
    else if (!runs.loaded) notes.push('Strava is not connected or could not be fully loaded. Only available records are counted.');
    if (runs.limited) notes.push('Only the loaded Strava history is counted; older months may be incomplete.');
    if (attendance.error) notes.push('Gym check-ins could not be refreshed.');
    else if (attendance.busy || !attendance.loaded) notes.push('Loading gym check-ins…');
    return notes.join(' ');
  }

  function markup(t, note) {
    const hasGoal = t.goal > 0;
    const caption = t.goal === null ? 'No target set for this month' : t.goal === 0 ? 'No runs or strength sessions scheduled' : 'workouts logged / monthly target';
    const remaining = !hasGoal ? '' : t.remaining === 0 ? 'Target reached · keep your recovery days' : t.isPast ? `${t.remaining} below the baseline target` : `${t.remaining} remaining toward target`;
    const attendance = t.attendanceDays ? `<p class="month-tally-attendance"><strong>${t.attendanceDays} gym attendance day${t.attendanceDays===1?'':'s'}</strong>${t.attendanceOnly ? ` · ${t.attendanceOnly} with no run or strength details logged` : ' · all on days with a logged workout'}. Attendance is separate, not added to the workout total.</p>` : '';
    return `<div class="month-tally-kicker">MONTHLY WORKOUT GOAL</div>
      <div class="month-tally-heading"><div><div class="month-tally-number"><strong data-month-completed>${t.completed}</strong>${hasGoal?`<span>/ <b data-month-target>${t.goal}</b></span>`:''}</div><span class="month-tally-caption">${caption}</span></div>${hasGoal?`<span class="month-tally-percent">${t.percent}%</span>`:''}</div>
      ${hasGoal?`<progress class="month-tally-progress" max="${t.goal}" value="${Math.min(t.completed,t.goal)}" aria-label="${t.completed} completed workouts toward a ${t.goal}-workout monthly target">${t.completed} of ${t.goal}</progress><p class="month-tally-remaining">${remaining}</p>`:''}
      <div class="month-tally-split"><div><span>Runs</span><strong>${t.runs}${hasGoal?` <small>/ ${t.target.run} planned</small>`:''}</strong></div><div><span>Strength</span><strong>${t.strength}${hasGoal?` <small>/ ${t.target.strength} planned</small>`:''}</strong></div></div>
      ${attendance}${t.otherActivities?`<p class="month-tally-note">Plus ${t.otherActivities} walk / other activit${t.otherActivities===1?'y':'ies'}, shown in the calendar but separate from the run-and-strength goal.</p>`:''}
      ${note?`<p class="month-tally-note" role="status">${esc(note)}</p>`:''}
      ${t.possibleDuplicates?'<p class="month-tally-note">Possible duplicate runs are still counted until confirmed. Review them under Progress.</p>':''}
      <details class="month-tally-method"><summary>How this tally works</summary><p>Completed = logged runs + strength sessions, including extra workouts on recovery days. Two separate sessions on one date count as two workouts. Linked duplicate runs count once; unconfirmed possible duplicates are flagged for review.</p><p>${t.goal===null?'There is no dated training plan for this month. Your actual records still appear; no target is invented.':`Target = ${t.target.run} scheduled runs + ${t.target.strength} strength sessions in the dated baseline calendar. Recovery days are excluded, using the availability in effect on each date.${t.partialPlan?` This month’s plan covers ${label(t.coveredFrom)}–${label(t.coveredTo)}; completed records cover the full month.`:''} The target stays stable when sessions are missed; adaptive recovery can reduce the suggested work. It is not a catch-up quota.`}</p><p>Gym attendance proves a visit, not the type or duration of a workout. Repeated check-in scans on the same date count as one attendance day. Your saved history and plan are not changed by this tally.</p></details>`;
  }

  function mount() {
    const root = document.getElementById('root');
    if (!root || !['today','plan'].includes(typeof view === 'undefined' ? '' : view)) return;
    const calendar = root.querySelector('.hub-month[data-hub-mounted="calendar"]');
    if (!calendar) return;
    const month = calendar.querySelector('.hub-month-grid [data-date]')?.dataset.date?.slice(0,7);
    const account = window.strydeAccountStatus?.() || {};
    const runSnapshot = window.strydeStravaSnapshot?.() || {rows:[],loaded:false};
    const attendance = window.strydeAttendance?.snapshot?.() || {rows:[],loaded:false};
    // Private providers already scope records to the active account. Recheck identity as defense in depth.
    const imported = account.signedIn && runSnapshot.userId === account.userId ? runSnapshot.rows || [] : [];
    const rows = P.records(state, imported);
    const tally = calculate(month, rows, account.signedIn ? attendance.rows || [] : []);
    if (!tally) return;
    const note = sourceNote(account, runSnapshot, attendance), signature = JSON.stringify([tally,note]);
    let panel = calendar.querySelector('[data-month-tally]');
    if (panel?.dataset.tallySignature === signature) return;
    if (!panel) {
      panel = document.createElement('section'); panel.className='month-tally'; panel.setAttribute('data-month-tally',month);
      panel.setAttribute('aria-label','Monthly workout target and completed tally');
      const grid=calendar.querySelector('.hub-month-grid'); if (!grid) return; grid.before(panel);
    }
    const expanded = panel.querySelector('details')?.open || false;
    panel.dataset.tallySignature = signature; panel.dataset.monthTally=month;
    panel.innerHTML = markup(tally,note);
    if (expanded) panel.querySelector('details').open=true;
  }

  window.strydeMonthlyTally={calculate,mount,sourceNote,markup};
  const root=document.getElementById('root');
  if(!root)return;
  let scheduled=false;
  const queue=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;mount();});};
  // calendar() is also called directly after imports, so watch its mounted subtree as well as render().
  new MutationObserver(queue).observe(root,{childList:true,subtree:true});
  for(const name of ['stryde-runs-changed','stryde-attendance-changed','stryde-account-change'])window.addEventListener(name,queue);
  const previousRender=window.render;
  if(typeof previousRender==='function')window.render=function(...args){const result=previousRender.apply(this,args);mount();return result;};
  mount();
})();

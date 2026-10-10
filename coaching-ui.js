/* Coaching workspace: user-entered tracking and review, not a connected AI service. */
(() => {
  'use strict';
  const C = window.strydeCoachingModel, P = window.strydeProgressModel;
  if (!C || !P) return;
  const ROOT = document.getElementById('root'), NAV = document.getElementById('nav');
  const html = esc, dayLabel = d => new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const round = n => n === null ? '—' : Math.round(n * 10) / 10;
  const options = (pairs, selected) => pairs.map(([v, label]) => `<option value="${html(v)}" ${v === selected ? 'selected' : ''}>${html(label)}</option>`).join('');
  const fields = f => Object.fromEntries(new FormData(f));
  let tab = 'overview', selectedDate = C.today(), planDate = C.today(), dialog = null, dialogState = null, notice = '';
  const read = () => C.data(state);
  const currentAccount = () => window.strydeAccountStatus?.() || {};
  function writable() {
    if (read().version !== C.VERSION) throw Error('This coaching data uses a newer version. Update STRYDE before editing it.');
    const account = currentAccount();
    if (account.conflict) throw Error('Resolve your account’s sync choice before editing coaching data. Open Account at the top.');
    if (account.signedIn && !account.ready) throw Error('Wait for your account copy to finish loading before editing coaching data. If sync is unavailable, open Account and retry.');
  }
  function commit(edit, message = 'Saved on this device.') {
    writable();
    if (dialog && state !== dialogState) throw Error('Your saved account data changed while this form was open. Close and reopen the form before saving.');
    const previous = state.coaching, next = C.clone(read());
    edit(next); state.coaching = next;
    try { save(); } catch (error) { state.coaching = previous; throw Error('Device storage is unavailable. Nothing was saved. Export a backup before closing STRYDE.'); }
    notice = message; return next;
  }
  function close() { dialog?.close(); }
  function modal(title, body) {
    dialog?.close(); dialog?.remove();
    const opener = document.activeElement;
    dialogState = state;
    dialog = document.createElement('dialog'); dialog.className = 'coach-dialog';
    dialog.innerHTML = `<div class="coach-dialog-title"><h2 id="coach-dialog-title">${html(title)}</h2><button type="button" data-coach="close" aria-label="Close">×</button></div>${body}<p class="coach-error" data-coach-error role="alert"></p>`;
    dialog.setAttribute('aria-labelledby', 'coach-dialog-title'); document.body.append(dialog);
    const current = dialog;
    current.addEventListener('close', () => { current.remove(); if (dialog === current) dialog = null; if (opener?.isConnected) opener.focus(); });
    dialog.showModal(); dialog.querySelector('input,textarea,select')?.focus();
  }
  const buttons = () => `<div class="coach-tabs" aria-label="Coaching sections">${[['overview','Review'],['food','Food log'],['meals','Meal plan'],['training','Training'],['profile','Intake']].map(([v, label]) => `<button data-coach="tab" data-tab="${v}" class="${v === tab ? 'active' : ''}" aria-pressed="${v === tab}">${label}</button>`).join('')}</div>`;
  const button = (action, text, extra = '', primary = false) => `<button type="button" class="btn ${primary ? 'orange' : ''}" data-coach="${action}" ${extra}>${text}</button>`;
  const card = (title, body, tag = '') => `<section class="coach-card">${tag ? `<div class="eyebrow">${tag}</div>` : ''}<h2>${title}</h2>${body}</section>`;
  function privacy() {
    const a = currentAccount();
    return `<p class="coach-privacy">${a.conflict ? 'Sync needs your review. Open Account before editing.' : a.signedIn ? 'Private account data · ' + html(a.status || 'Sync status in Account') : 'Saved in this browser. Sign in to sync privately across your devices.'} This device keeps an offline copy, including after sign-out. Use your own device.</p>`;
  }
  function overview(c) {
    const w = C.weekSummary(c), recovery = Object.entries(c.recovery).filter(([date]) => date >= C.addDays(C.today(), -6) && date <= C.today());
    const energy = recovery.map(([, x]) => C.number(x.energy, 1, 5)).filter(n => n !== null);
    const rows = P.records(state, window.strydeStravaSnapshot?.().rows || []).filter(r => r.date >= C.addDays(C.today(), -6) && r.date <= C.today());
    const strength = rows.filter(r => r.kind === 'strength'), rpe = rows.map(r => r.rpe).filter(n => C.number(n, 1, 10) !== null);
    const active = C.activeBlock(c, C.today()), target = C.targetOn(c, C.today());
    return `<div class="coach-metrics"><div><small>PROTEIN / COMPLETE DAY</small><strong>${round(w.average)}<em>${w.average === null ? '' : ' g'}</em></strong><span>${w.complete} of 7 days complete</span></div><div><small>AT YOUR PROTEIN TARGET</small><strong>${w.targetDays ? w.atTarget + ' / ' + w.targetDays : '—'}</strong><span>${w.targetDays ? 'Eligible complete days' : 'No eligible days yet'}</span></div></div>`
      + card('The last seven days', `<p>${dayLabel(C.addDays(C.today(), -6))}–${dayLabel(C.today())} · ${P.TZ}</p><div class="coach-week">${w.days.map(d => `<button data-coach="day" data-date="${d.date}" class="${d.complete && d.proteinKnown ? 'complete' : ''}"><small>${new Date(d.date + 'T12:00:00Z').toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' })}</small><b>${d.protein === null ? '—' : round(d.protein)}</b><span>${d.complete && d.proteinKnown ? 'Complete' : d.entries.length ? 'Partial' : 'Unknown'}</span></button>`).join('')}</div><p class="coach-note">Only days you mark complete with protein filled for every entry enter the average. ${w.incomplete} days remain incomplete or unknown. ${w.estimatedDays} included days contain estimates. Missing food is never treated as zero.</p>${button('tab', 'Log a meal', 'data-tab="food"', true)}`)
      + card('Training & recovery', `<div class="coach-review-grid"><div><b>${strength.length}</b><span>Strength sessions logged</span></div><div><b>${rows.filter(r => r.kind === 'run').length}</b><span>Runs recorded</span></div><div><b>${rpe.length ? round(rpe.reduce((a, b) => a + b, 0) / rpe.length) : '—'}</b><span>Mean session RPE · ${rpe.length} reports</span></div><div><b>${energy.length ? round(energy.reduce((a, b) => a + b, 0) / energy.length) + '/5' : '—'}</b><span>Energy · ${energy.length} check-ins</span></div></div><p class="coach-note">Logged activity and self-reported effort, not a fitness or body-composition score. ${recovery.filter(([, r]) => r.rest).length} recovery/rest days confirmed. Recovery stays separate from exercise completion. Imported run totals may change after Strava sync.</p>${button('recovery', 'Add recovery check-in')}${button('progress', 'View comparable lifting history')}`)
      + card('Your next review', `<p>${active ? `Active: <b>${html(active.title)}</b> · v${active.version} · ${dayLabel(active.start)}–${dayLabel(active.end)}` : 'No accepted training block yet. Your original 11-week plan continues.'}</p><p>${target?.protein ? 'Your provisional protein target: ' + html(target.protein) + ' g/day.' : 'Add a protein target only when you have one you want to track.'}</p><p class="coach-note">Look at complete food days, repeatable lifting sets, energy and recovery together. This tracker does not diagnose, prescribe a calorie deficit or automatically change workouts. Coaching discussed in chat is not automatically imported.</p>${button('tab', 'Review training blocks', 'data-tab="training"')}`);
  }
  function food(c) {
    const d = C.daySummary(c, selectedDate), target = d.target;
    return card('Today’s nourishment', `<label class="coach-date">Log date<input id="coach-food-date" type="date" value="${selectedDate}" max="${C.today()}"></label><div class="coach-metrics compact"><div><small>PROTEIN LOGGED</small><strong>${round(d.protein)}<em> g</em></strong><span>${target?.protein ? 'Target ' + html(target.protein) + ' g · provisional' : 'No target set'}</span></div><div><small>CALORIES LOGGED</small><strong>${round(d.calories)}<em> kcal</em></strong><span>${target?.calories ? 'Your reference ' + html(target.calories) + ' kcal · provisional' : 'No calorie reference set'}</span></div></div><p class="coach-note">These are logged totals, not a measurement of your whole-day intake. ${d.caloriesKnown ? 'Every entry has a calorie value.' : 'Some or all calorie values are unknown.'} Values marked estimated remain estimates. No calories are inferred from photos.</p><div class="coach-actions">${button('meal-add', 'Add food or meal', '', true)}${button('target', 'Edit targets')}</div>`, 'FOOD · PORTIONS · PROTEIN')
      + card('Your entries', `${d.entries.map(m => `<div class="coach-record"><div><b>${html(m.description)}</b><p>${html(m.portion)}</p><small>${m.protein === null ? 'Protein unknown' : round(m.protein) + ' g protein'} · ${m.calories === null ? 'Calories unknown' : round(m.calories) + ' kcal'} · ${m.basis === 'label' ? 'Label/reference checked' : 'Estimated'}${m.source ? ' · ' + html(m.source) : ''}</small></div><div class="coach-record-actions">${button('meal-edit', 'Edit', `data-id="${html(m.id)}"`)}${button('meal-remove', 'Remove', `data-id="${html(m.id)}"`)}</div></div>`).join('') || '<p>No entries for this day. That means unknown intake.</p>'}<label class="coach-check"><input type="checkbox" id="coach-day-complete" ${d.complete ? 'checked' : ''} ${d.entries.length ? '' : 'disabled'}> I’ve logged everything I ate this day</label><p class="coach-note">${d.complete && !d.proteinKnown ? 'Protein is still unknown in one or more entries, so this day is excluded from the protein average.' : 'You can leave a day partial. Adding, editing or removing food reopens it for review.'}</p>${c.meals.some(m => m.deleted && m.date === selectedDate) ? `<details><summary>Removed entries</summary>${c.meals.filter(m => m.deleted && m.date === selectedDate).map(m => `<div class="coach-record"><span>${html(m.description)}</span>${button('meal-restore', 'Restore', `data-id="${html(m.id)}"`)}</div>`).join('')}</details>` : ''}`);
  }
  function meals(c) {
    const plan = c.mealPlans[planDate] || {}, profile = c.profile;
    return card('Make meals easier', `<p>A flexible, manual template. Choose foods that suit your preferences and check every ingredient against your allergies or restrictions.</p><p class="coach-note">${profile.foodPreferences ? 'Your preferences: ' + html(profile.foodPreferences) : 'Food preferences not entered.'} ${profile.allergens ? 'Avoid/check: ' + html(profile.allergens) : 'Allergies and restrictions are unknown; this template does not assume any food is safe for you.'}</p><label>Plan date<input id="coach-plan-date" type="date" value="${planDate}"></label><form id="coach-meal-plan" class="coach-form">${['Breakfast','Lunch','Dinner','Snack'].map(slot => `<label>${slot}<textarea name="${slot.toLowerCase()}" maxlength="500" rows="2" placeholder="Food you enjoy · portion · protein source">${html(plan[slot.toLowerCase()] || '')}</textarea></label>`).join('')}<label>Prep / shopping notes<textarea name="notes" maxlength="800" rows="3" placeholder="What to buy, prepare or use up">${html(plan.notes || '')}</textarea></label><button class="btn orange">Save meal plan</button></form><p class="coach-note">Planning does not log food as eaten. Use Food log to record actual portions and label/reference values or estimates. A useful template includes a protein source, carbohydrate, produce and fat in amounts that work for you.</p>`, 'PLAN AHEAD');
  }
  function training(c) {
    return card('Build, review, then accept', `<p>Create a dated version after discussing your goals, equipment and recovery with your coach. Proposed changes do nothing until you accept them.</p><p class="coach-note">The original running schedule, exercise IDs and set counts stay in place. A block can set rep/load targets for those lifts and record wider coaching notes. Add extra or custom exercises through Progress. New saved sets keep a prescription snapshot; older logs cannot reveal an original target that was never recorded.</p>${button('block-add', 'Propose a training block', '', true)}`, 'TRAINING · VERSIONED')
      + c.blocks.slice().sort((a, b) => b.version - a.version).map(b => card(html(b.title), `<div class="coach-pills"><span>Version ${b.version}</span><span>${html(b.status)}</span><span>${dayLabel(b.start)}–${dayLabel(b.end)}</span></div><p>${html(b.rationale)}</p>${b.schedule ? `<p class="coach-preserve">${html(b.schedule)}</p>` : ''}<ul class="coach-prescriptions">${Object.entries(b.prescriptions || {}).map(([i, p]) => `<li><b>${html(EX[i]?.name || 'Exercise')}</b><span>${p.sets} × ${p.reps} · ${p.weight === '' ? 'Calibrate load' : html(p.weight + ' ' + p.unit)}</span></li>`).join('') || '<li>No rep/load overrides. Original prescriptions remain in place.</li>'}</ul><p class="coach-note">${b.status === 'accepted' ? 'Accepted ' + html(b.acceptedAt?.slice(0, 10)) + '. For overlapping dates, the highest accepted version applies to unstarted sessions. Saved prescriptions stay unchanged.' : b.status === 'proposed' ? 'Pending your review. No workout has changed.' : 'This proposal was declined.'}</p><div class="coach-actions">${b.status === 'proposed' ? button('block-accept', 'Review & accept', `data-id="${html(b.id)}"`, true) + button('block-decline', 'Decline', `data-id="${html(b.id)}"`) : ''}${button('block-revise', 'Create revised proposal', `data-id="${html(b.id)}"`)}</div>`)).join('');
  }
  function profile(c) {
    const p = c.profile;
    const goals = ['General fitness','Body recomposition','Glute / hamstring strength','Upper-body strength','Core stability','Running endurance','Mobility'];
    return card('Start with what matters', `<p>Only share what helps you plan safely. These details are optional and stay in your private saved data. Public sample values are never treated as confirmed intake.</p><form id="coach-profile" class="coach-form"><fieldset><legend>Goals you want to prioritize</legend><div class="coach-goals">${goals.map(g => `<label class="coach-check"><input type="checkbox" name="goals" value="${html(g)}" ${(p.goals || []).includes(g) ? 'checked' : ''}>${g}</label>`).join('')}</div></fieldset><label>Your first priority<input name="priority" maxlength="180" value="${html(p.priority || '')}" placeholder="What would meaningful progress look like?"></label><div class="coach-fields"><label>Training days / week<input name="daysPerWeek" type="number" min="0" max="7" value="${html(p.daysPerWeek ?? '')}"></label><label>Minutes available / session<input name="minutes" type="number" min="5" max="240" value="${html(p.minutes ?? '')}"></label></div><label>Equipment and activity schedule<textarea name="equipment" maxlength="600" rows="3" placeholder="Available equipment, running days, hard or long sessions">${html(p.equipment || '')}</textarea></label><label>Food preferences<textarea name="foodPreferences" maxlength="500" rows="2" placeholder="Usual meals, foods you enjoy, practical constraints">${html(p.foodPreferences || '')}</textarea></label><label>Allergies / dietary restrictions, if any<input name="allergens" maxlength="300" value="${html(p.allergens || '')}" placeholder="Leave blank if not established"></label><details><summary>Optional context for a coaching conversation</summary><p class="coach-note">This app does not use these fields to calculate calories or assess whether exercise is medically safe. Avoid detailed medical records.</p><div class="coach-fields"><label>Age, if relevant<input name="age" type="number" min="18" max="110" value="${html(p.age ?? '')}"></label><label>Confirmed height (cm)<input name="height" type="number" min="100" max="250" step="0.1" value="${html(p.height ?? '')}"></label></div><label>Pregnancy / breastfeeding context<select name="pregnancy">${options([['unknown','Not provided / unknown'],['not-applicable','Not applicable'],['pregnant','Pregnant'],['breastfeeding','Breastfeeding'],['both','Pregnant and breastfeeding'],['prefer-not','Prefer not to say']], p.pregnancy || 'unknown')}</select></label><label>Relevant movement restrictions or symptoms<textarea name="restrictions" maxlength="500" rows="2" placeholder="Only what a coach needs to know; optional">${html(p.restrictions || '')}</textarea></label><p class="coach-note">If you have pain, dizziness or a condition affecting training/nutrition, get appropriate clinical guidance before changing your plan. No individualized calorie target is generated here.</p></details><button class="btn orange">Save private intake</button></form>`, 'YOUR STARTING POINT');
  }
  function renderCoach() {
    const c = read(); ROOT.innerHTML = header() + `<div class="coach-heading"><div class="eyebrow">YOUR COACHING WORKSPACE</div><h1>Small steps.<br>Clearer progress.</h1><p>Training, food and recovery. One honest picture.</p></div>` + buttons() + `<p class="coach-notice" role="status" aria-live="polite">${html(notice)}</p>` + (c.version !== C.VERSION ? '<p class="coach-error">Update STRYDE before editing this newer coaching data.</p>' : '') + privacy() + `<div class="coach-content">${({ overview, food, meals, training, profile })[tab](c)}</div>`;
    NAV.innerHTML = navHTML();
  }
  function mealForm(previous) {
    const m = previous || { date: selectedDate, basis: 'estimate' };
    modal(previous ? 'Edit food entry' : 'Log food or a meal', `<form id="coach-meal-form" data-id="${html(m.id || '')}" class="coach-form"><label>Date<input name="date" type="date" required max="${C.today()}" value="${m.date}"></label><label>Food / meal<input name="description" required maxlength="180" value="${html(m.description || '')}" placeholder="Describe what you ate"></label><label>Portion / assumptions<input name="portion" required maxlength="120" value="${html(m.portion || '')}" placeholder="e.g. one bowl, approximate serving"></label><div class="coach-fields"><label>Protein (g, optional)<input name="protein" type="number" min="0" max="500" step="0.1" value="${html(m.protein ?? '')}" placeholder="Unknown"></label><label>Calories (kcal, optional)<input name="calories" type="number" min="0" max="10000" step="1" value="${html(m.calories ?? '')}" placeholder="Unknown"></label></div><label>Value basis<select name="basis">${options([['estimate','Manual estimate'],['label','Checked label / reference and portion']], m.basis)}</select></label><label>Source or note<input name="source" maxlength="200" value="${html(m.source || '')}" placeholder="Package label, recipe, rough estimate…"></label><p class="coach-note">Enter the total for the portion above. Blank means unknown; zero means explicitly zero. Label values and portion estimates still have uncertainty.</p><div class="coach-actions"><button class="btn orange">Save entry</button>${button('close','Cancel')}</div></form>`);
  }
  function targetForm() {
    const t = C.targetOn(read(), C.today()) || {};
    modal('Targets you choose', `<form id="coach-target-form" class="coach-form"><p>Optional tracking references. These are user-entered, provisional targets, not a calorie or protein prescription.</p><label>Effective from<input name="start" type="date" min="${C.today()}" required value="${C.today()}"></label><label>Protein target (g/day, optional)<input name="protein" type="number" min="1" max="500" step="1" value="${html(t.protein ?? '')}"></label><label>Calorie reference (kcal/day, optional)<input name="calories" type="number" min="1" max="10000" step="1" value="${html(t.calories ?? '')}"></label><label>Basis / agreed with<input name="note" maxlength="250" value="${html(t.note || '')}" placeholder="Your preference or a qualified professional’s advice"></label><p class="coach-note">Targets apply from the chosen date. Historical day comparisons keep the target valid then. Clear a field to stop tracking it from that date. Energy needs vary; a logged number is not a recommendation.</p><button class="btn orange">Save provisional targets</button></form>`);
  }
  function blockForm(previous) {
    const b = previous || {}, start = b.start >= C.today() ? b.start : C.today(), end = b.end >= start ? b.end : C.addDays(start, 27);
    modal(previous ? 'Propose a revision' : 'Propose a training block', `<form id="coach-block-form" class="coach-form"><label>Block name<input name="title" maxlength="100" required value="${html(b.title || '')}" placeholder="A clear focus for the next few weeks"></label><div class="coach-fields"><label>Start<input name="start" type="date" min="${C.today()}" required value="${start}"></label><label>End / review date<input name="end" type="date" min="${start}" required value="${end}"></label></div><label>Reason / evidence for the change<textarea name="rationale" maxlength="700" required rows="3" placeholder="What changed in your logs, goals or recovery?">${html(b.rationale || '')}</textarea></label><label>Schedule / coaching notes<textarea name="schedule" maxlength="1000" rows="3" placeholder="Training focus, rest, technique cues. These notes do not reschedule the existing run plan.">${html(b.schedule || '')}</textarea></label><fieldset><legend>Optional original-lift targets</legend><p class="coach-note">Check only the exercises you want to change. Set counts and units stay unchanged. Blank load means calibrate; no automatic increase.</p>${EX.map((e, i) => { const p = b.prescriptions?.[i]; return `<div class="coach-exercise"><label class="coach-check"><input type="checkbox" name="include-${i}" ${p ? 'checked' : ''}>${html(e.name)} · ${e.sets} sets</label><div class="coach-fields"><label>Reps / set<input name="reps-${i}" type="number" min="1" max="30" value="${p?.reps ?? e.reps}"></label><label>Load (${html(e.unit)})<input name="weight-${i}" type="number" min="0.01" max="1000" step="any" value="${html(p?.weight ?? '')}" placeholder="Calibrate"></label></div></div>`; }).join('')}</fieldset><p class="coach-note">This saves a proposal only. Review its exact targets before accepting. Individualized training changes should follow an intake and recovery review.</p><button class="btn orange">Save proposal for review</button></form>`);
  }
  function recoveryForm(date = C.today()) {
    const r = read().recovery[date] || {};
    modal('Recovery check-in', `<form id="coach-recovery-form" class="coach-form"><label>Date<input name="date" type="date" required max="${C.today()}" value="${date}"></label><div class="coach-fields"><label>Sleep (hours, optional)<input name="sleep" type="number" min="0" max="24" step="0.5" value="${html(r.sleep ?? '')}"></label><label>Energy (1–5, optional)<input name="energy" type="number" min="1" max="5" step="1" value="${html(r.energy ?? '')}"></label></div><label>How did movement feel?<select name="comfort">${options([['unknown','Not recorded'],['comfortable','Comfortable'],['sore','Sore / unusually tired'],['pain','Pain or other symptoms']], r.comfort || 'unknown')}</select></label><label class="coach-check"><input name="rest" type="checkbox" ${r.rest ? 'checked' : ''}>Planned recovery / rest completed</label><label>Optional note<textarea name="note" maxlength="400" rows="2">${html(r.note || '')}</textarea></label><p class="coach-note">Changing the date loads that day’s saved check-in. Rest counts as recovery, not a missed workout. Pain or concerning symptoms are a reason to pause and seek appropriate advice, not push through a target.</p><button class="btn orange">Save recovery check-in</button></form>`);
  }
  document.addEventListener('click', event => {
    const b = event.target.closest('[data-coach]'); if (!b) return;
    try {
      const action = b.dataset.coach, id = b.dataset.id;
      if (action === 'close') return close();
      if (action === 'tab') { tab = b.dataset.tab; notice = ''; return renderCoach(); }
      if (action === 'day') { selectedDate = b.dataset.date; tab = 'food'; return renderCoach(); }
      if (action === 'progress') return window.strydeTrainingHub.setTab('strength');
      if (action === 'meal-add') { writable(); return mealForm(); }
      if (action === 'meal-edit') { writable(); return mealForm(read().meals.find(m => m.id === id && !m.deleted)); }
      if (action === 'target') { writable(); return targetForm(); }
      if (action === 'recovery') { writable(); return recoveryForm(); }
      if (action === 'block-add') { writable(); return blockForm(); }
      if (action === 'block-revise') { writable(); return blockForm(read().blocks.find(x => x.id === id)); }
      if (['meal-remove','meal-restore'].includes(action)) {
        commit(c => { const m = c.meals.find(m => m.id === id); if (!m) throw Error('Entry not found.'); m.deleted = action === 'meal-remove'; m.updatedAt = new Date().toISOString(); c.days[m.date] = { complete: false }; });
      } else if (action === 'block-decline') { commit(c => { const b = c.blocks.find(x => x.id === id); if (b?.status === 'proposed') b.status = 'declined'; }); }
      else if (action === 'block-accept') {
        const b = read().blocks.find(x => x.id === id); if (!b || b.status !== 'proposed') return;
        modal('Accept this training version?', `<p><b>${html(b.title)} · v${b.version}</b><br>${dayLabel(b.start)}–${dayLabel(b.end)}</p><p>${html(b.rationale)}</p><p>These targets will apply to unstarted original-plan sessions on those dates. Saved sessions and the running schedule stay intact.</p><ul class="coach-prescriptions">${Object.entries(b.prescriptions || {}).map(([i, p]) => `<li>${html(EX[i].name)}: ${p.sets} × ${p.reps}, ${p.weight === '' ? 'calibrate' : html(p.weight + ' ' + p.unit)}</li>`).join('') || '<li>No load/rep changes.</li>'}</ul><div class="coach-actions">${button('block-confirm','Accept version '+b.version,`data-id="${html(id)}"`,true)}${button('close','Keep as proposal')}</div>`); return;
      } else if (action === 'block-confirm') { commit(c => C.acceptBlock(c, id), 'Training version accepted. Previously saved prescriptions are unchanged.'); close(); }
      renderCoach();
    } catch (error) { showError(error); }
  });
  function showError(error) { const node = dialog?.querySelector('[data-coach-error]'); if (node) node.textContent = error.message; else { notice = error.message; if (view === 'coach') renderCoach(); } }
  document.addEventListener('change', event => {
    try {
      if (event.target.name === 'date' && event.target.form?.id === 'coach-recovery-form' && C.date(event.target.value) && event.target.value <= C.today()) { recoveryForm(event.target.value); return; }
      if (event.target.id === 'coach-food-date' && C.date(event.target.value) && event.target.value <= C.today()) { selectedDate = event.target.value; renderCoach(); }
      if (event.target.id === 'coach-plan-date' && C.date(event.target.value)) { planDate = event.target.value; renderCoach(); }
      if (event.target.id === 'coach-day-complete') { commit(c => { c.days[selectedDate] = { complete: event.target.checked, updatedAt: new Date().toISOString() }; }); renderCoach(); }
    } catch (error) { showError(error); }
  });
  document.addEventListener('submit', event => {
    const f = event.target; if (!f.id.startsWith('coach-')) return;
    event.preventDefault();
    try {
      if (!f.reportValidity()) return; const v = fields(f);
      if (f.id === 'coach-meal-form') {
        commit(c => { const index = c.meals.findIndex(m => m.id === f.dataset.id); const previous = c.meals[index]; const entry = C.meal(v, previous);
          if (index < 0) c.meals.push(entry); else c.meals[index] = entry;
          c.days[entry.date] = { complete: false }; if (previous) c.days[previous.date] = { complete: false }; selectedDate = entry.date;
        }); close();
      } else if (f.id === 'coach-target-form') {
        if (!C.date(v.start) || v.start < C.today()) throw Error('Targets must start today or later.');
        const protein = C.number(v.protein, 1, 500), calories = C.number(v.calories, 1, 10000);
        if ((v.protein && protein === null) || (v.calories && calories === null)) throw Error('Check your target values.');
        commit(c => c.targets.push({ id: C.id(), start: v.start, protein, calories, note: C.text(v.note, 250), status: 'provisional', createdAt: new Date().toISOString() })); close();
      } else if (f.id === 'coach-profile') {
        commit(c => { c.profile = { goals: new FormData(f).getAll('goals'), priority: C.text(v.priority, 180), equipment: C.text(v.equipment, 600),
          daysPerWeek: C.number(v.daysPerWeek, 0, 7), minutes: C.number(v.minutes, 5, 240), age: C.number(v.age, 18, 110), height: C.number(v.height, 100, 250), pregnancy: v.pregnancy,
          foodPreferences: C.text(v.foodPreferences, 500), allergens: C.text(v.allergens, 300), restrictions: C.text(v.restrictions, 500), updatedAt: new Date().toISOString() }; });
      } else if (f.id === 'coach-meal-plan') {
        commit(c => { c.mealPlans[planDate] = { breakfast: C.text(v.breakfast), lunch: C.text(v.lunch), dinner: C.text(v.dinner), snack: C.text(v.snack), notes: C.text(v.notes, 800), updatedAt: new Date().toISOString() }; });
      } else if (f.id === 'coach-block-form') {
        const prescriptions = {}; EX.forEach((_, i) => { if (v['include-' + i]) prescriptions[i] = { reps: v['reps-' + i], weight: v['weight-' + i] }; });
        commit(c => c.blocks.push(C.block(c, { ...v, prescriptions })), 'Proposal saved. Review and accept it to change future targets.'); close();
      } else if (f.id === 'coach-recovery-form') {
        if (!C.date(v.date) || v.date > C.today()) throw Error('Choose today or an earlier date.');
        commit(c => { c.recovery[v.date] = { sleep: C.number(v.sleep, 0, 24), energy: C.number(v.energy, 1, 5), comfort: v.comfort, rest: Boolean(v.rest), note: C.text(v.note, 400), updatedAt: new Date().toISOString() }; }); close();
      }
      renderCoach();
    } catch (error) { showError(error); }
  });
  // Extend navigation without replacing the existing workout, Strava, or photo views.
  const originalNav = window.navHTML;
  window.navHTML = function() { return originalNav() + `<button class="${view === 'coach' ? 'active' : ''}" onclick="go('coach')"><span class="navico">◌</span>Coach</button>`; };
  const originalRender = window.render;
  window.render = function(...args) { if (view === 'coach') return renderCoach(); return originalRender.apply(this, args); };
  // Preserve the first prescription saved for a session. Completed legacy logs are not backfilled.
  const originalTarget = window.target;
  function sessionDate(k) {
    const match = /^(\d+)-([0-6])$/.exec(k || ''); if (!match) return null;
    const d = dateFor(Number(match[1]), Number(match[2]));
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }
  function sessionTarget(i, k) {
    const legacy = originalTarget(i), l = state.logs[k] || {}, saved = l.prescriptionSnapshot?.exercises?.[i];
    if (saved) return { ...legacy, ...saved, label: 'Saved session target', why: saved.why || 'The prescription recorded when this session was first started or saved.' };
    if (l.status === 'done' || l.status === 'in_progress' || l.timing || l.started_at || Object.keys(l.exercises || {}).length) return legacy;
    const day = sessionDate(k), b = day && C.activeBlock(read(), day), p = b?.prescriptions?.[i];
    if (!p) return legacy;
    return { ...legacy, ...p, label: `Accepted block · v${b.version}`, why: b.rationale, blockId: b.id, blockVersion: b.version };
  }
  window.target = function(i) {
    // Progress has no selected session. Never leak a previously opened session's snapshot there.
    if (!['session', 'exercise'].includes(view) || !Number.isInteger(sessionDay)) return originalTarget(i);
    return sessionTarget(i, key(sessionDay));
  };
  function snapshotFor(k) {
    const match = /^(\d+)-([0-6])$/.exec(k || ''); if (!match) return null;
    const day = Number(match[2]), l = state.logs[k] || {};
    if (!isGym(day) || l.prescriptionSnapshot || l.status === 'done' || l.status === 'in_progress' || l.timing || l.started_at || Object.keys(l.exercises || {}).length) return null;
    return { recordedAt: new Date().toISOString(), date: sessionDate(k), exercises: Object.fromEntries(idsFor(day).map(i => [i, { ...sessionTarget(i, k), sets: EX[i].sets, unit: EX[i].unit }])) };
  }
  const originalSaveLift = window.saveLift;
  window.saveLift = function(...args) {
    // Validation stays in the original action. A failed save must not create a snapshot.
    const e = EX[selectedExercise], weight = Number(document.getElementById('lift-weight')?.value);
    const valid = e && Number.isFinite(weight) && weight > 0 && Array.from({ length: e.sets }, (_, j) => document.getElementById('rep' + j)?.value.trim()).every(v => v && Number(v) >= 1);
    if (valid && Number.isInteger(sessionDay)) {
      const k = key(sessionDay), snapshot = snapshotFor(k);
      if (snapshot) { state.logs[k] = { ...log(sessionDay), prescriptionSnapshot: snapshot }; }
    }
    return originalSaveLift.apply(this, args);
  };
  window.addEventListener('stryde-account-change', () => { close(); notice = ''; tab = 'overview'; selectedDate = C.today(); planDate = C.today(); if (view === 'coach') renderCoach(); });
  window.strydeCoaching = { snapshotFor, render: renderCoach, setTab: value => { tab = ['overview','food','meals','training','profile'].includes(value) ? value : 'overview'; window.go('coach'); } };
  render();
})();

/* STRYDE session timing. Saved timestamps, never a background counter or passwords. */
(() => {
  'use strict';
  if (window.strydeWorkoutTimer) return;
  const ROOT = document.getElementById('root');
  const nowMs = () => Date.now();
  const logKey = () => Number.isInteger(sessionDay) ? `${state.week}-${sessionDay}` : null;
  const record = k => state.logs?.[k];
  const timer = k => record(k)?.timing;
  const validKey = k => /^\d{1,2}-[0-6]$/.test(k || '');
  const stamp = ms => new Date(ms).toISOString();
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clock = iso => iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—';
  const length = ms => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2,'0')}`;
  };
  function activeMs(t, at = nowMs()) {
    if (!t) return 0;
    const base = Math.max(0, Number(t.accumulated_ms) || 0);
    return base + (t.state === 'running' && Number.isFinite(Date.parse(t.running_since)) ? Math.max(0, at - Date.parse(t.running_since)) : 0);
  }
  function activeKey() {
    return Object.keys(state.logs || {}).find(k => ['running','paused'].includes(timer(k)?.state)) || null;
  }
  function persist() {
    try { save(); }
    catch (_) { alert('The browser could not save this update. Export your workout data before closing STRYDE.'); }
  }
  function start(k) {
    if (!validKey(k)) return;
    const existing = activeKey();
    if (existing && existing !== k) { alert('Another workout timer is open. Return to it and finish it before starting another.'); return; }
    const l = state.logs[k] || {};
    if (l.status === 'done' || timer(k)) return;
    const at = nowMs();
    l.timing = {version:1,state:'running',source:'timer',started_at:stamp(at),ended_at:null,running_since:stamp(at),accumulated_ms:0,time_zone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'};
    l.status = 'in_progress';
    state.logs[k] = l;
    persist(); mount();
  }
  function pause(k) {
    const t = timer(k);
    if (t?.state !== 'running') return;
    t.accumulated_ms = activeMs(t);
    t.running_since = null;
    t.state = 'paused';
    persist(); mount();
  }
  function resume(k) {
    const t = timer(k);
    if (t?.state !== 'paused') return;
    t.running_since = stamp(nowMs());
    t.state = 'running';
    persist(); mount();
  }
  // Called only after the normal workout completion flow was accepted.
  function complete(k, preserveManualRunMinutes = false) {
    const t = timer(k), l = record(k);
    if (!t || !['running','paused'].includes(t.state)) return false;
    const at = nowMs();
    t.accumulated_ms = activeMs(t, at);
    t.ended_at = stamp(at);
    t.running_since = null;
    t.state = 'finished';
    l.started_at = t.started_at;
    l.ended_at = t.ended_at;
    l.duration_seconds = Math.floor(t.accumulated_ms / 1000);
    l.elapsed_seconds = Math.max(0, Math.floor((at - Date.parse(t.started_at)) / 1000));
    l.paused_seconds = Math.max(0, l.elapsed_seconds - l.duration_seconds);
    if (!preserveManualRunMinutes) l.minutes = +(t.accumulated_ms / 60000).toFixed(2);
    persist(); mount();
    return true;
  }
  function openTimed(k) {
    if (!validKey(k)) return;
    const [w,d] = k.split('-').map(Number);
    state.week = w; state.selectedDay = d;
    window.openSession(d);
  }
  function doFinish(k) {
    if (k !== logKey()) { openTimed(k); return; }
    // Never drop unsaved exercise inputs to finish from another screen.
    if (view === 'exercise') { alert('Save this exercise first, then finish the workout from the exercise list.'); return; }
    if (isGym(sessionDay)) window.finishSession(); else window.saveRun();
  }
  const dateInput = iso => {
    if (!iso || !Number.isFinite(Date.parse(iso))) return '';
    const d = new Date(iso), pad = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  function editTimes(k) {
    if (!validKey(k)) return;
    const l = record(k) || {}, t = timer(k);
    if (t && ['running','paused'].includes(t.state)) { alert('Finish the workout timer before correcting its times.'); return; }
    document.getElementById('stryde-time-dialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'stryde-time-dialog'; dialog.className = 'workout-time-dialog';
    dialog.setAttribute('aria-labelledby','time-edit-title');
    dialog.innerHTML = `<form id="workout-time-form"><h2 id="time-edit-title">Workout times</h2><p>Use your device’s local time. Enter the end date too if the workout crossed midnight.</p><label>Start time<input name="start" type="datetime-local" step="1" required value="${dateInput(t?.started_at || l.started_at)}"></label><label>End time<input name="end" type="datetime-local" step="1" required value="${dateInput(t?.ended_at || l.ended_at)}"></label><label>Paused minutes<input name="paused" type="number" min="0" step="0.01" required value="${Math.round((Number(l.paused_seconds)||0)/60*100)/100}"></label><p class="time-edit-result" aria-live="polite"></p><p class="time-edit-error" role="alert"></p><div class="workout-time-buttons"><button class="btn" type="button" data-cancel>Cancel</button><button class="btn orange" type="submit">Save times</button></div></form>`;
    document.body.append(dialog);
    const form = dialog.querySelector('form'), result = form.querySelector('.time-edit-result'), error = form.querySelector('.time-edit-error');
    function values() {
      const f = new FormData(form), a = Date.parse(f.get('start')), b = Date.parse(f.get('end')), paused = Number(f.get('paused')) * 60000;
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw Error('Enter both dates and times.');
      if (b <= a) throw Error('The end must be after the start.');
      if (b > nowMs() + 60000) throw Error('Use an end time that has already happened.');
      if (!Number.isFinite(paused) || paused < 0 || paused >= b-a) throw Error('Paused time must be shorter than the workout.');
      return {a,b,paused,active:b-a-paused};
    }
    form.addEventListener('input', () => {
      try { const v = values(); result.textContent = `Duration: ${length(v.active)} (pauses excluded)`; error.textContent = ''; }
      catch (_) { result.textContent = ''; }
    });
    form.querySelector('[data-cancel]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => dialog.remove(), {once:true});
    form.onsubmit = event => {
      event.preventDefault();
      try {
        const v = values();
        if (t && !confirm('Replace the recorded start, end and duration? Your sets and weights will stay unchanged.')) return;
        if (t) { l.timing_history = Array.isArray(l.timing_history) ? l.timing_history : []; l.timing_history.push({...t}); }
        l.timing = {version:1,state:'finished',source:'manual',started_at:stamp(v.a),ended_at:stamp(v.b),running_since:null,accumulated_ms:v.active,time_zone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'};
        l.started_at = stamp(v.a); l.ended_at = stamp(v.b);
        l.duration_seconds = Math.floor(v.active/1000); l.elapsed_seconds = Math.floor((v.b-v.a)/1000); l.paused_seconds = Math.floor(v.paused/1000); l.minutes = +(v.active/60000).toFixed(2);
        state.logs[k] = l; persist(); dialog.close(); mount();
      } catch (e) { error.textContent = e.message; }
    };
    dialog.showModal();
  }
  function panel(k, compact = false) {
    const t = timer(k), l = record(k) || {}, finished = t?.state === 'finished', ongoing = t && !finished;
    const box = document.createElement('section');
    box.className = `workout-clock${compact ? ' compact' : ''}`;
    box.dataset.timerMounted = 'panel';
    box.setAttribute('aria-label','Workout timing');
    const title = finished ? 'WORKOUT SAVED' : t?.state === 'paused' ? 'WORKOUT PAUSED' : ongoing ? 'WORKOUT IN PROGRESS' : 'WORKOUT TIMER';
    let buttons = '';
    if (t?.state === 'running') buttons = '<button class="btn" data-time-action="pause">Pause</button>';
    else if (t?.state === 'paused') buttons = '<button class="btn orange" data-time-action="resume">Resume</button>';
    else if (!t && l.status !== 'done') buttons = '<button class="btn orange" data-time-action="start">Start workout</button>';
    if (ongoing && !compact) buttons += '<button class="btn" data-time-action="finish">Finish workout</button>';
    if ((!t || finished) && !compact) buttons += `<button class="workout-time-link" data-time-action="edit">${t ? 'Edit times' : 'Enter times manually'}</button>`;
    const elapsed = t ? length(activeMs(t)) : l.minutes ? `${Number(l.minutes)} min` : '0:00';
    box.innerHTML = `<div class="workout-clock-head"><div><span class="workout-clock-label">${title}</span><strong data-timer-elapsed="${escape(k)}">${elapsed}</strong></div><div class="workout-time-buttons">${buttons}</div></div>${compact ? '' : `<dl class="workout-clock-times"><div><dt>Started</dt><dd>${clock(t?.started_at)}</dd></div><div><dt>Finished</dt><dd>${clock(t?.ended_at)}</dd></div><div><dt>Duration</dt><dd data-timer-elapsed="${escape(k)}">${t ? elapsed : 'Not timed'}</dd></div></dl><p class="workout-clock-note">${t ? 'Duration excludes pauses. Start and end times use your device’s local time.' : 'Starts only when you tap Start. Browsing your plan does not count as training.'}</p>`}`;
    box.querySelectorAll('[data-time-action]').forEach(btn => {
      btn.onclick = () => ({start,pause,resume,finish:doFinish,edit:editTimes}[btn.dataset.timeAction])(k);
    });
    return box;
  }
  function mount() {
    if (!ROOT) return;
    ROOT.querySelectorAll('[data-timer-mounted]').forEach(e => e.remove());
    const k = logKey();
    if ((view === 'session' || view === 'exercise') && k && (isGym(sessionDay) || [1,4,6].includes(sessionDay))) {
      const compact = view === 'exercise' || (view === 'session' && sessionTab !== 'workout');
      const node = panel(k, compact), anchor = ROOT.querySelector('.statline') || ROOT.querySelector('.hero') || ROOT.querySelector('h1') || ROOT.querySelector('.tabs') || ROOT.firstElementChild;
      if (anchor) anchor.after(node); else ROOT.prepend(node);
    }
    if (view === 'today' || view === 'plan') {
      const running = activeKey();
      if (running) {
        const bar = document.createElement('button'); bar.className = 'workout-clock-return'; bar.dataset.timerMounted = 'return';
        bar.innerHTML = `<span><strong>${escape(nameFor(Number(running.split('-')[1])))}</strong><small>${timer(running).state === 'paused' ? 'Paused' : 'In progress'} · <span data-timer-elapsed="${escape(running)}">${length(activeMs(timer(running)))}</span></small></span><span>Return to workout →</span>`;
        bar.onclick = () => openTimed(running);
        (ROOT.querySelector('.top') || ROOT.firstElementChild)?.after(bar);
      }
    }
    if (view === 'progress') {
      const entries = Object.entries(state.logs || {}).filter(([k,l]) => validKey(k) && (l.timing || l.started_at)).sort((a,b) => Date.parse(b[1].timing?.started_at || b[1].started_at) - Date.parse(a[1].timing?.started_at || a[1].started_at));
      const section = document.createElement('section'); section.className = 'card workout-timing-history'; section.dataset.timerMounted = 'history';
      section.innerHTML = '<h3>Workout times</h3>';
      if (!entries.length) section.innerHTML += '<p class="muted">Start a workout timer to record your start, finish and duration here.</p>';
      entries.slice(0,20).forEach(([k,l]) => {
        const t = l.timing, row = document.createElement('button'); row.className = 'workout-time-history-row';
        const date = new Date(t?.started_at || l.started_at).toLocaleDateString([], {month:'short',day:'numeric'});
        row.innerHTML = `<span><strong>${escape(nameFor(Number(k.split('-')[1])))}</strong><small>${escape(date)} · ${clock(t?.started_at || l.started_at)} – ${clock(t?.ended_at || l.ended_at)}</small></span><span>${t ? length(activeMs(t)) : escape(l.minutes || '—') + ' min'}<small>${t?.state === 'finished' ? 'Completed timing' : 'In progress'}</small></span>`;
        row.onclick = () => openTimed(k); section.append(row);
      });
      (ROOT.querySelector('.grid') || ROOT.querySelector('.hero') || ROOT.firstElementChild)?.after(section);
    }
    tick();
  }
  function tick() {
    document.querySelectorAll('[data-timer-elapsed]').forEach(el => {
      const t = timer(el.dataset.timerElapsed);
      if (t) el.textContent = length(activeMs(t));
    });
  }
  const previousRender = window.render;
  window.render = function (...args) { previousRender.apply(this,args); mount(); };
  const previousFinish = window.finishSession;
  window.finishSession = function (...args) {
    const k = logKey(), wasDone = record(k)?.status === 'done';
    const result = previousFinish.apply(this,args);
    if (!wasDone && record(k)?.status === 'done') complete(k);
    return result;
  };
  const previousSaveRun = window.saveRun;
  window.saveRun = function (...args) {
    const k = logKey(), preserve = Boolean(document.getElementById('run-time')?.value.trim());
    const result = previousSaveRun.apply(this,args);
    if (record(k)?.status === 'done') complete(k,preserve);
    return result;
  };
  window.strydeWorkoutTimer = {start,pause,resume,complete,editTimes,mount};
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('pageshow', tick);
  setInterval(() => { if (!document.hidden) tick(); }, 1000);
  mount();
})();

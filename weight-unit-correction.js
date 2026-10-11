/* Explicit, account-local label corrections. Never convert numbers or add workout/progression events. */
(() => {
  'use strict';
  const machineIds = new Set(window.strydeMachineIds || []);
  const clone = value => JSON.parse(JSON.stringify(value));
  const kg = unit => /^(kg|kgs|kilograms?)( total)?$/i.test(String(unit || '').trim());
  const eligible = unit => /^(lb|lbs|pounds?)( total)?$|^machine display$/i.test(String(unit || '').trim());
  function fields(s) {
    const out = [];
    function add(map, path, implicit = false) {
      for (const [id, row] of Object.entries(map || {})) {
        if (!row || typeof row !== 'object') continue;
        if (eligible(row.unit) || (implicit && machineIds.has(id) && (!row.unit || row.unit === 'unrecorded'))) out.push({id, row, path: [...path, id]});
      }
    }
    for (const [key, log] of Object.entries(s.logs || {})) {
      add(log.exercises, ['logs', key, 'exercises'], true);
      add(log.prescriptionSnapshot?.exercises, ['logs', key, 'prescriptionSnapshot', 'exercises'], true);
    }
    (s.extraWorkouts || []).forEach((log, i) => {
      add(log.exercises, ['extraWorkouts', i, 'exercises'], true);
      add(log.prescriptionSnapshot?.exercises, ['extraWorkouts', i, 'prescriptionSnapshot', 'exercises'], true);
    });
    (s.coaching?.blocks || []).forEach((b, i) => add(b.prescriptions, ['coaching', 'blocks', i, 'prescriptions'], true));
    add(s.approvedLoads, ['approvedLoads'], true);
    add(s.customExercises, ['customExercises']);
    return out;
  }
  function candidates(s) {
    const result = new Map();
    for (const field of fields(s)) {
      // Free weights are deliberately excluded. Custom total-load entries require an explicit selection.
      if (!machineIds.has(field.id) && !/^custom-[0-9a-f-]+$/i.test(field.id)) continue;
      if (!result.has(field.id)) result.set(field.id, {id: field.id, name: EX[field.id]?.name || s.customExercises?.[field.id]?.name || field.row.name || 'Custom exercise', builtin: machineIds.has(field.id), count: 0});
      result.get(field.id).count++;
    }
    return [...result.values()];
  }
  function correct(s, ids, at = new Date().toISOString()) {
    const allowed = new Set(candidates(s).map(c => c.id));
    const selected = new Set(ids.map(String).filter(id => allowed.has(id)));
    const next = clone(s), changes = [];
    for (const field of fields(next)) {
      if (!selected.has(field.id)) continue;
      changes.push({path: field.path, before: clone(field.row), afterUnit: 'kg'});
      field.row.unit = 'kg';
    }
    if (changes.length) {
      next.weightUnitCorrections = [...(next.weightUnitCorrections || []), {version: 1, kind: 'machine-label-correction', correctedAt: at, exerciseIds: [...selected], numericValuesChanged: false, changes}];
    }
    return {state: next, count: changes.length};
  }
  window.strydeWeightUnits = {fields, candidates, correct};

  let dialog, reviewedState;
  function close() { if (dialog) { dialog.close(); dialog.remove(); dialog = null; } reviewedState = null; }
  window.strydeReviewWeightUnits = function() {
    close();
    const rows = candidates(state);
    reviewedState = JSON.stringify(state);
    dialog = document.createElement('dialog');
    dialog.id = 'weight-unit-dialog'; dialog.className = 'hub-dialog';
    dialog.innerHTML = '<div class="hub-dialog-head"><h2>Review machine units</h2><button type="button" data-unit-close aria-label="Close unit review">×</button></div><p>Select only machines whose displayed numbers were kilograms but were labeled pounds. The numbers, reps, dates, training versions and approvals stay the same. This is a label correction, not a conversion.</p><form id="weight-unit-form">' + rows.map(row => '<label><input type="checkbox" name="machine" value="' + esc(row.id) + '" ' + (row.builtin ? 'checked' : '') + '>' + esc(row.name) + ' · ' + row.count + ' saved labels</label>').join('') + (rows.length ? '<p>Custom exercises are unchecked. Leave genuine pound loads and free weights unchanged.</p><button class="btn orange" type="submit">Confirm selected machines used kg</button>' : '<p>No eligible machine labels need correcting.</p>') + '</form><p>Original entries are retained in your private correction audit and included in Export backup.</p><p role="alert" id="weight-unit-error"></p><button type="button" class="btn" data-unit-close>Cancel</button>';
    document.body.append(dialog);
    dialog.querySelectorAll('[data-unit-close]').forEach(b => b.addEventListener('click', close));
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialog.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      if (reviewedState !== JSON.stringify(state)) { dialog.querySelector('#weight-unit-error').textContent = 'Your account or data changed. Close this review and open it again.'; return; }
      const ids = [...dialog.querySelectorAll('input[name="machine"]:checked')].map(input => input.value);
      if (!ids.length) { dialog.querySelector('#weight-unit-error').textContent = 'Select a machine first.'; return; }
      const result = correct(state, ids);
      // Persist first: if storage is full, leave the original state untouched.
      try { localStorage.setItem('stryde-v1', JSON.stringify(result.state)); }
      catch { dialog.querySelector('#weight-unit-error').textContent = 'Could not save the correction. Export a backup and free storage, then retry.'; return; }
      state = result.state; window.strydeCloudSave?.(state); close(); render();
    });
    dialog.showModal();
  };
  window.addEventListener('stryde-account-change', close);

  const oldLast = window.lastLift;
  window.lastLift = function(i) {
    const previous = oldLast(i);
    // Never reuse an unreviewed pound/missing-unit machine load as a kilogram target.
    return machineIds.has(String(i)) && previous && !kg(previous.unit) ? null : previous;
  };
  const oldTarget = window.target;
  window.target = function(i) {
    const result = oldTarget(i);
    const approved = state.approvedLoads?.[i];
    if (machineIds.has(String(i)) && ((result.unit && !kg(result.unit)) || (approved && !kg(approved.unit) && result.label === 'Approved trial'))) {
      return {...result, weight: '', unit: 'kg', label: 'Review machine units', why: 'A saved target uses an old unit label. Review machine units in Me before reusing that load.'};
    }
    return result;
  };
  const oldRender = window.render;
  window.render = function(...args) {
    const result = oldRender.apply(this, args);
    if (view === 'exercise' && machineIds.has(String(selectedExercise))) {
      const entry = log(sessionDay).exercises?.[selectedExercise];
      if (entry && !kg(entry.unit)) {
        root.innerHTML = '<div class="card"><h2>Check this machine’s unit</h2><p>This saved entry uses an old unit label. Review it before editing so its number is not silently treated as kg.</p><button class="btn orange" onclick="strydeReviewWeightUnits()">Review weight units</button><button class="btn" onclick="go(\'session\')">Back to session</button></div>';
      }
    }
    if (view === 'me') {
      const card = document.createElement('section'); card.className = 'card'; card.id = 'weight-unit-settings';
      card.innerHTML = '<h3>Strength weight units</h3><p>Machine loads and new custom exercises default to kg. Free-weight history keeps its recorded unit.</p><button class="btn" onclick="strydeReviewWeightUnits()">Review weight units</button>';
      root.append(card);
    }
    return result;
  };
  render();
})();

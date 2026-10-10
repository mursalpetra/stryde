/* Private, additive coaching data. Pure helpers are shared by the UI and tests. */
(() => {
  'use strict';
  const VERSION = 1;
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  const number = (v, min = 0, max = Infinity) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };
  const text = (v, limit = 500) => String(v ?? '').trim().slice(0, limit);
  const clone = v => JSON.parse(JSON.stringify(v));
  const date = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && Number.isFinite(Date.parse(v + 'T12:00:00Z')) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
  const addDays = (v, n) => { const d = new Date(v + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const today = () => window.strydeProgressModel?.iso() || new Date().toISOString().slice(0, 10);
  const id = () => crypto.randomUUID();
  function data(s) {
    const c = object(s?.coaching) ? s.coaching : {};
    return { ...c, version: c.version ?? VERSION, profile: object(c.profile) ? c.profile : {},
      targets: Array.isArray(c.targets) ? c.targets : [], meals: Array.isArray(c.meals) ? c.meals : [],
      days: object(c.days) ? c.days : {}, mealPlans: object(c.mealPlans) ? c.mealPlans : {},
      blocks: Array.isArray(c.blocks) ? c.blocks : [], recovery: object(c.recovery) ? c.recovery : {} };
  }
  function targetOn(c, day) {
    return c.targets.filter(t => date(t.start) && t.start <= day).sort((a, b) => b.start.localeCompare(a.start) || String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
  }
  function daySummary(c, day) {
    const entries = c.meals.filter(m => !m.deleted && m.date === day);
    const proteinEntries = entries.filter(m => number(m.protein, 0, 500) !== null);
    const calorieEntries = entries.filter(m => number(m.calories, 0, 10000) !== null);
    const protein = proteinEntries.reduce((n, m) => n + Number(m.protein), 0);
    const calories = calorieEntries.reduce((n, m) => n + Number(m.calories), 0);
    return { date: day, entries, protein: proteinEntries.length ? protein : null, calories: calorieEntries.length ? calories : null,
      complete: c.days[day]?.complete === true, proteinKnown: entries.length > 0 && entries.length === proteinEntries.length,
      caloriesKnown: entries.length > 0 && entries.length === calorieEntries.length,
      estimated: entries.filter(m => m.basis !== 'label').length, target: targetOn(c, day) };
  }
  function weekSummary(c, end = today()) {
    const days = Array.from({ length: 7 }, (_, i) => daySummary(c, addDays(end, i - 6)));
    const complete = days.filter(d => d.complete && d.proteinKnown);
    const withTarget = complete.filter(d => number(d.target?.protein, 1, 500) !== null);
    return { days, complete: complete.length, incomplete: 7 - complete.length,
      average: complete.length ? complete.reduce((n, d) => n + d.protein, 0) / complete.length : null,
      atTarget: withTarget.filter(d => d.protein >= Number(d.target.protein)).length, targetDays: withTarget.length,
      estimatedDays: complete.filter(d => d.estimated > 0).length };
  }
  function meal(input, previous) {
    if (!date(input.date) || input.date > today()) throw Error('Choose today or an earlier meal date.');
    if (!text(input.description, 180) || !text(input.portion, 120)) throw Error('Describe the food and portion first.');
    const protein = number(input.protein, 0, 500), calories = number(input.calories, 0, 10000);
    if (input.protein !== '' && protein === null) throw Error('Protein must be between 0 and 500 g, or left unknown.');
    if (input.calories !== '' && calories === null) throw Error('Calories must be between 0 and 10,000 kcal, or left unknown.');
    return { id: previous?.id || id(), date: input.date, description: text(input.description, 180), portion: text(input.portion, 120),
      protein, calories, basis: input.basis === 'label' ? 'label' : 'estimate', source: text(input.source, 200),
      createdAt: previous?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  }
  function block(c, input) {
    if (!text(input.title, 100) || !text(input.rationale, 700)) throw Error('Give the block a name and a reason for the change.');
    if (!date(input.start) || !date(input.end) || input.start < today() || input.end < input.start) throw Error('Choose a start date today or later and an end date after it.');
    if ((Date.parse(input.end) - Date.parse(input.start)) / 86400000 > 90) throw Error('Keep a review block to 90 days or less.');
    const prescriptions = {};
    for (const [key, value] of Object.entries(input.prescriptions || {})) {
      if (!/^\d+$/.test(key) || !EX[Number(key)]) throw Error('This exercise is not in the original plan. Add extra/custom exercises from Progress.');
      const reps = number(value.reps, 1, 30), weight = number(value.weight, 0.01, 1000);
      if (reps === null || !Number.isInteger(reps)) throw Error('Enter a whole-number rep target from 1 to 30.');
      if (value.weight !== '' && weight === null) throw Error('Enter a positive load, or leave it blank to calibrate.');
      prescriptions[key] = { reps, weight: weight ?? '', sets: EX[Number(key)].sets, unit: EX[Number(key)].unit };
    }
    return { id: id(), version: c.blocks.reduce((n, b) => Math.max(n, Number(b.version) || 0), 0) + 1,
      status: 'proposed', title: text(input.title, 100), start: input.start, end: input.end,
      rationale: text(input.rationale, 700), schedule: text(input.schedule, 1000), prescriptions,
      createdAt: new Date().toISOString(), source: 'User-entered revision' };
  }
  function activeBlock(c, day) {
    return c.blocks.filter(b => b.status === 'accepted' && b.start <= day && b.end >= day)
      .sort((a, b) => Number(b.version) - Number(a.version))[0] || null;
  }
  function acceptBlock(c, blockId) {
    const item = c.blocks.find(b => b.id === blockId && b.status === 'proposed');
    if (!item) throw Error('This proposal is no longer pending.');
    if (item.start < today()) throw Error('This proposal starts in the past. Create a revised proposal with a new start date.');
    item.status = 'accepted'; item.acceptedAt = new Date().toISOString(); return item;
  }
  window.strydeCoachingModel = { VERSION, object, number, text, clone, date, addDays, today, id, data, targetOn, daySummary, weekSummary, meal, block, activeBlock, acceptBlock };
})();

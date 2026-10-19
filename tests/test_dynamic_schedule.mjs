/* Offline-only adaptive schedule invariants. Synthetic data; no external services.
 * Run: node --test tests/test_dynamic_schedule.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const TODAY = '2026-10-19';
const START = '2026-10-05';
const RACE = '2026-12-20';
const add = (date, count) => new Date(Date.parse(date + 'T12:00:00Z') + count * 86400000).toISOString().slice(0, 10);
const dates = (from, to) => { const result = []; for (let d = from; d <= to; d = add(d, 1)) result.push(d); return result; };
const run = (id, date, distance = 4, minutes = 30, overrides = {}) => ({id, date, kind:'run', distance, minutes, rpe:3, ...overrides});
const strength = (id, date, focus = 'lower', overrides = {}) => ({id, date, kind:'strength', minutes:30, exercises: Object.fromEntries((focus === 'lower' ? [0, 1, 3] : [4, 5, 6, 7]).map(i => [i, {weight:10, reps:'10,10', unit:'machine display', form:'good', effort:'moderate'}])), ...overrides});
const ready = overrides => ({comfort:'comfortable', soreness:'none', energy:4, minutes:30, historyComplete:true, ...overrides});
const stateFixture = overrides => ({week:3, selectedDay:0, lastSeenV2:true, logs:{}, profile:{}, approvedLoads:{}, extraWorkouts:[], milestones:[{id:'synthetic-race', kind:'race', status:'active', title:'Synthetic race', date:RACE}], ...overrides});
const exercise = d => ['easy','long','upper','lower'].includes(d.type);

function environment(initial = stateFixture()) {
  const stored = new Map([['stryde-v1', JSON.stringify(initial)]]);
  const c = {console, Intl, document:{getElementById:() => null}, localStorage:{getItem:key => stored.get(key) ?? null, setItem:(key, value) => stored.set(key, value)}};
  c.window = c;
  vm.createContext(c);
  vm.runInContext(`{ const NativeDate = Date; Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ['${TODAY}T04:00:00Z'])); } static now() { return NativeDate.parse('${TODAY}T04:00:00Z'); } }; }`, c);
  for (const filename of ['v2-core.js','progress-model.js','dynamic-schedule-model.js']) vm.runInContext(source(filename), c, {filename});
  return {c, M:c.strydeScheduleModel, P:c.strydeProgressModel, state:() => copy(vm.runInContext('state', c))};
}

test('derivation is additive, deterministic and never edits actual history or saved prescriptions', () => {
  const state = stateFixture({logs:{'2-2':{status:'done', performed_on:'2026-10-14', prescriptionSnapshot:{date:'2026-10-14', exercises:{0:{weight:8, reps:12, blockVersion:1}}}, exercises:{0:{weight:8, reps:'12,12,12', unit:'lbs per hand'}}}}, adaptiveSchedule:{version:1, futureField:{keep:true}}});
  const rows = [strength('plan:2-2','2026-10-14'), run('strava:123','2026-10-16')];
  const before = copy({state, rows});
  const {M} = environment(state);
  const first = copy(M.build(state, rows, TODAY));
  assert.deepEqual(copy(M.build(state, rows, TODAY)), first);
  assert.deepEqual({state, rows}, before);
  assert.equal(first.days['2026-10-18'], undefined);
  assert.equal(first.days[TODAY].type, 'recovery');
  assert.equal(first.days[RACE].type, 'race');
});

test('invalid and out-of-block dates cannot create a new training block or move the race', () => {
  const {M} = environment(), state = stateFixture();
  assert.deepEqual(copy(M.build(state, [], '2026-02-30').days), {});
  assert.deepEqual(copy(M.build(state, [], '2026-12-21').days), {});
  assert.equal(Object.keys(M.build(state, [], '2026-10-01').days)[0], START);
  assert.equal(Object.keys(M.build(state, [], START).days).at(-1), RACE);
  assert.equal(state.milestones[0].date, RACE);
});

test('completed recovery-day lower strength replaces the remaining lower session and protects the next day', () => {
  const state = stateFixture(), {M} = environment(state), date = '2026-10-08';
  const result = M.build(state, [strength('extra:synthetic-lower', date)], date);
  assert.equal(result.days[date].type, 'completed');
  assert.equal(result.days[date].kind, 'strength');
  assert.ok(!['lower','easy','long'].includes(result.days['2026-10-09'].type));
  assert.equal(dates(date, '2026-10-11').filter(d => result.days[d].type === 'lower').length, 0);
  assert.equal(result.days[date].activities[0].id, 'extra:synthetic-lower');
});

test('completed upper strength consumes that week’s upper slot without fabricating completion', () => {
  const state = stateFixture(), {M} = environment(state), date = '2026-10-08';
  const result = M.build(state, [strength('extra:synthetic-upper', date, 'upper')], date);
  assert.equal(dates(date, '2026-10-11').filter(d => result.days[d].type === 'upper').length, 0);
  assert.deepEqual(state.logs, {});
  assert.deepEqual(state.extraWorkouts, []);
});

test('no previous-week catch-up is carried into a new week', () => {
  const {M} = environment(), state = stateFixture();
  const skipped = stateFixture({logs:{'1-1':{status:'skipped'}, '1-4':{status:'skipped'}, '1-6':{status:'skipped'}, '2-2':{status:'skipped'}}});
  assert.deepEqual(copy(M.build(skipped, [], TODAY)), copy(M.build(state, [], TODAY)));
});

test('future activity and duplicate records do not add phantom actual training', () => {
  const {M} = environment(), state = stateFixture();
  const rows = [run('strava:123', '2026-10-18')];
  const one = copy(M.build(state, rows, TODAY));
  assert.deepEqual(copy(M.build(state, [...rows, rows[0]], TODAY)), one);
  assert.deepEqual(copy(M.build(state, [...rows, run('strava:future', '2026-10-22')], TODAY)), one);
});

test('verified manual/Strava duplicate links count one actual session through Progress', () => {
  const state = stateFixture({extraWorkouts:[{id:'synthetic-manual', date:'2026-10-18', kind:'run', status:'done', distanceKm:4, durationMinutes:30}], runDuplicateLinks:{'extra:synthetic-manual':'123'}});
  const {M,P} = environment(state);
  const imported = [{activity_id:'123', started_at:'2026-10-18T00:00:00Z', distance_m:4000, elapsed_time_seconds:1800}];
  const rows = P.records(state, imported);
  assert.equal(rows.length, 1);
  assert.equal(M.build(state, rows, '2026-10-18').days['2026-10-18'].activities.length, 1);
});

test('every future rolling week has at least two recovery days and no four consecutive activities', () => {
  const {M} = environment(), state = stateFixture();
  const actual = [strength('a','2026-10-16','upper'), run('b','2026-10-17',5,40)];
  const result = M.build(state, actual, TODAY);
  const occupied = new Set([...actual.map(r => r.date), ...Object.values(result.days).filter(exercise).map(d => d.date)]);
  for (const from of dates('2026-10-13','2026-12-14')) {
    assert.ok(dates(from, add(from,6)).filter(d => occupied.has(d)).length <= 5, `More than five training days from ${from}`);
    assert.ok(!dates(from, add(from,3)).every(d => occupied.has(d)), `Four consecutive training days from ${from}`);
  }
});

test('same muscle regions and runs get a clear day between planned sessions', () => {
  const {M} = environment(), result = M.build(stateFixture(), [run('a','2026-10-16',5,40),strength('b','2026-10-18','upper')], TODAY);
  const scheduled = Object.values(result.days).filter(exercise);
  for (const item of scheduled) {
    const tomorrow = result.days[add(item.date,1)];
    if (!tomorrow || !exercise(tomorrow)) continue;
    if (item.type === 'upper') assert.notEqual(tomorrow.type, 'upper');
    else assert.equal(tomorrow.type, 'upper', `Lower body load repeated after ${item.date}`);
  }
});

test('hard or long actual runs protect the following day regardless of muscle focus', () => {
  const {M} = environment(), state = stateFixture(), date = '2026-10-20';
  for (const actual of [run('long','2026-10-19',8,75), run('hard','2026-10-19',3,25,{rpe:8})]) {
    assert.equal(M.build(state,[actual],date).days[date].type,'recovery');
    assert.deepEqual(copy(M.options(state,[actual],date,ready()).choices.map(x=>x.id)), ['rest']);
  }
});

test('run distances stay within recent recorded running and limited history holds long progression', () => {
  const {M} = environment(), state = stateFixture();
  const actual = [run('old-long','2026-09-01',18,160),run('a','2026-10-14',4,30),run('b','2026-10-17',5,40)];
  const result = M.build(state, actual, TODAY);
  for (const d of Object.values(result.days).filter(x => x.kind === 'run')) assert.ok(d.km === null || d.km <= 5, `Distance jumped on ${d.date}`);
  const limited = M.build(state,[run('only','2026-10-17',3,25)],TODAY);
  assert.ok(!Object.values(limited.days).some(d => d.type === 'long'));
  assert.ok(limited.warnings.some(w => /limited|held/i.test(w)));
});

test('the active race date stays fixed and its final two days are protected in the derived plan', () => {
  const {M} = environment(), state = stateFixture();
  const result = M.build(state, [run('a','2026-12-08',10,80),run('b','2026-12-12',12,90)],'2026-12-17');
  assert.equal(result.days[RACE].type,'race');
  assert.equal(result.days['2026-12-18'].type,'recovery');
  assert.equal(result.days['2026-12-19'].type,'recovery');
  assert.match(result.days[RACE].reason,/not confirmation|not.*ready/i);
});

test('optional recovery-day workouts cannot bypass the final race recovery window', () => {
  const {M} = environment(), state = stateFixture();
  for (const date of ['2026-12-18','2026-12-19',RACE]) {
    assert.deepEqual(copy(M.options(state,[],date,ready()).choices.map(x=>x.id)),['rest'], `An optional workout was offered on ${date}`);
  }
});

test('recovery remains recovery until an explicit activity is completed; readiness itself creates no log', () => {
  const {M} = environment(), state = stateFixture(), before = copy(state);
  const result = M.options(state,[],TODAY,ready());
  assert.ok(result.choices.some(x=>x.id==='upper'));
  assert.ok(result.choices.some(x=>x.id==='lower'));
  assert.ok(result.choices.some(x=>x.id==='easy'));
  assert.equal(M.build(state,[],TODAY).days[TODAY].type,'recovery');
  assert.deepEqual(state,before);
  assert.equal(result.choices.find(x=>x.id==='easy').location,'outdoors');
  assert.equal(result.choices.find(x=>x.id==='upper').location,'indoors');
});

test('unknown history, pain, soreness, low energy, or unavailable time never offers exercise', () => {
  const {M} = environment(), state = stateFixture();
  for (const check of [undefined,ready({historyComplete:false}),ready({comfort:'pain'}),ready({comfort:'sore'}),ready({comfort:'unknown'}),ready({energy:2}),ready({energy:null}),ready({soreness:'both'}),ready({minutes:9}),ready({minutes:null})]) {
    assert.deepEqual(copy(M.options(state,[],TODAY,check).choices.map(x=>x.id)),['rest'],JSON.stringify(check));
  }
  assert.deepEqual(copy(M.options(stateFixture({coaching:{recovery:{[TODAY]:{rest:true}}}}),[],TODAY,ready()).choices.map(x=>x.id)),['rest']);
});

test('muscle-specific soreness removes only incompatible exercise options', () => {
  const {M} = environment(), state = stateFixture();
  const lower = M.options(state,[],TODAY,ready({soreness:'lower'})).choices.map(x=>x.id);
  assert.ok(lower.includes('upper')); assert.ok(!lower.includes('lower')); assert.ok(!lower.includes('easy'));
  const upper = M.options(state,[],TODAY,ready({soreness:'upper'})).choices.map(x=>x.id);
  assert.ok(!upper.includes('upper')); assert.ok(upper.includes('lower')); assert.ok(upper.includes('easy'));
});

test('optional duration respects available time and short checks do not create strength sessions', () => {
  const {M} = environment(), state = stateFixture();
  const short = M.options(state,[],TODAY,ready({minutes:15})).choices;
  assert.deepEqual(copy(short.map(x=>x.id)),['rest','easy']);
  assert.equal(short[1].minutes,15);
  const long = M.options(state,[],TODAY,ready({minutes:90})).choices;
  assert.ok(long.filter(x=>x.kind==='strength').every(x=>x.minutes<=35));
  assert.ok(long.filter(x=>x.kind==='run').every(x=>x.minutes<=20));
});

test('recent muscle work, unknown custom movements and same-day activity suppress unsafe repeat options', () => {
  const {M} = environment(), state = stateFixture();
  const afterLower = M.options(state,[strength('lower',add(TODAY,-1))],TODAY,ready()).choices.map(x=>x.id);
  assert.ok(afterLower.includes('upper')); assert.ok(!afterLower.includes('lower')); assert.ok(!afterLower.includes('easy'));
  const unknown = strength('custom',add(TODAY,-1),'lower',{exercises:{'custom-00000000-0000-4000-8000-000000000001':{name:'Synthetic unknown movement',weight:10,reps:'10'}}});
  assert.deepEqual(copy(M.options(state,[unknown],TODAY,ready()).choices.map(x=>x.id)),['rest']);
  assert.deepEqual(copy(M.options(state,[run('today',TODAY)],TODAY,ready()).choices.map(x=>x.id)),['rest']);
});

test('started legacy sessions retain their frozen targets and block a replacement activity', () => {
  const snapshot = {recordedAt:'2026-10-20T00:00:00Z',exercises:{0:{weight:8,reps:12}}};
  const state = stateFixture({logs:{'3-1':{status:'in_progress',prescriptionSnapshot:snapshot,timing:{state:'running',started_at:'2026-10-20T00:00:00Z'}}}});
  const {M} = environment(state), before = copy(state);
  const result = M.build(state,[],'2026-10-20');
  assert.equal(result.days['2026-10-20'].type,'started');
  assert.equal(result.days['2026-10-20'].legacyKey,'3-1');
  assert.deepEqual(copy(M.options(state,[],'2026-10-20',ready()).choices.map(x=>x.id)),['rest']);
  assert.deepEqual(state,before);
});

test('an unfinished earlier legacy timer prevents an overlapping adaptive session today', () => {
  const state = stateFixture({logs:{'2-6':{status:'in_progress',timing:{state:'running',started_at:'2026-10-18T12:00:00Z'},prescriptionSnapshot:{preserved:true}}}});
  const {M} = environment(state), before = copy(state);
  assert.deepEqual(copy(M.options(state,[],TODAY,ready()).choices.map(x=>x.id)),['rest']);
  assert.deepEqual(state,before);
});

test('a confirmed quiet previous week caps the restart week at three training days', () => {
  const state = stateFixture({adaptiveSchedule:{version:1,checkins:{[TODAY]:ready()}}}), {M} = environment(state);
  const result = M.build(state,[],TODAY);
  const currentWeek = Object.values(result.days).filter(d=>d.date<=add(TODAY,6)&&exercise(d));
  assert.ok(currentWeek.length<=3);
  assert.ok(result.warnings.some(w=>/restart week.*three/i.test(w)));
});

test('after three completed restart-week days, both the plan and optional choices keep recovery', () => {
  const date = '2026-10-24', state = stateFixture({adaptiveSchedule:{version:1,checkins:{[date]:ready()}}}), {M} = environment(state);
  const rows = [run('a','2026-10-19',3,25),strength('b','2026-10-21','upper'),run('c','2026-10-22',3,25)];
  const result = M.build(state,rows,date);
  assert.ok(dates(date,'2026-10-25').every(d=>!exercise(result.days[d])));
  assert.deepEqual(copy(M.options(state,rows,date,ready()).choices.map(x=>x.id)),['rest']);
});

test('a persisted adaptive start reserves its day and preserves all frozen draft fields', () => {
  const activeSession = {id:'synthetic-active',status:'in_progress',date:TODAY,startedAt:TODAY+'T04:00:00Z',choice:{id:'upper',type:'upper',kind:'strength',ids:[4,5,6,7]},snapshot:{version:1,date:TODAY,exercises:[{id:4,reps:10,sets:2,weight:12,unit:'machine display'}]},values:{'weight-4':'11','reps-4-0':'8'}};
  const state = stateFixture({adaptiveSchedule:{version:1,checkins:{[TODAY]:ready()},activeSession}}), {M,P} = environment(state), before=copy(state);
  const plan=M.build(state,[],TODAY);
  assert.equal(plan.days[TODAY].type,'started');
  assert.equal(plan.days[TODAY].adaptiveId,activeSession.id);
  assert.ok(dates(TODAY,add(TODAY,6)).every(d=>plan.days[d].type!=='upper'));
  assert.deepEqual(copy(M.options(state,[],TODAY,ready()).choices.map(x=>x.id)),['rest']);
  assert.deepEqual(copy(P.records(state,[])),[]);
  assert.deepEqual(state,before);
});

test('yesterday’s unfinished adaptive draft blocks overlap without moving its actual date', () => {
  const activeSession = {id:'synthetic-overnight',status:'in_progress',date:add(TODAY,-1),startedAt:add(TODAY,-1)+'T15:00:00Z',choice:{id:'lower',type:'lower',kind:'strength',ids:[0,1,3]},snapshot:{date:add(TODAY,-1),exercises:[]},values:{notes:'Synthetic overnight fixture'}};
  const state = stateFixture({adaptiveSchedule:{version:1,checkins:{},activeSession}}), {M} = environment(state), before=copy(state);
  assert.equal(M.build(state,[],TODAY).days[TODAY].adaptiveId,activeSession.id);
  assert.deepEqual(copy(M.options(state,[],TODAY,ready()).choices.map(x=>x.id)),['rest']);
  assert.deepEqual(state,before);
});

test('a supported scheduled long run is executable with recorded distance and time ceilings', () => {
  const date='2026-11-01',state=stateFixture(),{M}=environment(state),rows=[run('a','2026-10-27',5,45),run('b','2026-10-30',7,55)];
  const planned=M.build(state,rows,date).days[date];
  assert.equal(planned.type,'long');
  const choice=M.options(state,rows,date,ready({minutes:60})).choices.find(c=>c.id==='long');
  assert.ok(choice,'The scheduled long run must be selectable after readiness');
  assert.equal(choice.kind,'run');
  assert.equal(choice.km,planned.km);
  assert.equal(choice.minutes,55);
  assert.equal(M.options(state,rows,date,ready({minutes:40})).choices.find(c=>c.id==='long').minutes,40);
  assert.ok(!M.options(state,rows,date,ready({minutes:20})).choices.some(c=>c.id==='long'));
  assert.ok(!M.options(state,rows.map(r=>({...r,minutes:null})),date,ready({minutes:60})).choices.some(c=>c.id==='long'));
  assert.ok(!M.options(state,rows,date,ready({soreness:'lower',minutes:60})).choices.some(c=>c.id==='long'));
});

test('an explicit rest choice converts today’s planned training to recovery without a fake log', () => {
  const date='2026-10-24',state=stateFixture({adaptiveSchedule:{version:1,checkins:{[date]:ready()}}}),{M}=environment(state);
  assert.ok(exercise(M.build(state,[],date).days[date]));
  state.adaptiveSchedule.checkins[date].restChosen=true;
  const before=copy(state),plan=M.build(state,[],date);
  assert.equal(plan.days[date].type,'recovery');
  assert.deepEqual(copy(M.options(state,[],date).choices.map(x=>x.id)),['rest']);
  assert.deepEqual(state,before);
  assert.deepEqual(state.logs,{});
  assert.deepEqual(state.extraWorkouts,[]);
});

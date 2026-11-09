/* Synthetic owner data only; no production identity, timestamps or credentials. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const pref={effective_from:'2026-11-09',recovery_weekdays:[1,4],weekly_types:['easy','recovery','lower','easy','recovery','upper','long']};
function env(){
 const c={console,Intl,document:{getElementById:()=>null},localStorage:{getItem:()=>null,setItem:()=>{}}};c.window=c;
 let uid='fixture-a';c.strydeAccountStatus=()=>({signedIn:!!uid,userId:uid});
 vm.createContext(c);for(const f of ['v2-core.js','attendance-model.js','progress-model.js','dynamic-schedule-model.js'])vm.runInContext(source(f),c,{filename:f});
 const get=s=>JSON.parse(JSON.stringify(vm.runInContext(s,c)));return {c,D:c.strydeTrainingData,P:c.strydeProgressModel,S:c.strydeScheduleModel,get,setUser:u=>uid=u};
}
const row=(id,date,time='08:00')=>({id,attendance_date:date,checked_in_at:date+'T'+time+':00+08:00',venue:'Fixture gym',time_zone:'Asia/Shanghai'});
const ready={comfort:'comfortable',energy:4,minutes:40,historyComplete:true,soreness:'none'};
test('availability applies only from effective date and does not alter workout data',()=>{
 const {c,D,get}=env(),before=get('state');D.accept({preferences:[pref],attendance:[]},'fixture-a');
 assert.equal(D.plan('2026-11-03').type,'easy');assert.equal(D.plan('2026-11-06').type,'easy');
 for(const date of ['2026-11-10','2026-11-13','2026-12-15','2026-12-18'])assert.equal(D.plan(date).protected,true);
 assert.deepEqual(get('state'),before);assert.equal(D.plan('2026-11-09').type,'easy');assert.equal(D.plan('2026-11-12').runSlot,1);
});
test('all future unavailable weekdays are excluded from automatic recommendations',()=>{
 const {D,S}=env();D.accept({preferences:[pref]},'fixture-a');const result=S.build({milestones:[],logs:{}},[],'2026-11-09');
 for(const [date,day] of Object.entries(result.days))if(D.plan(date).protected){assert.equal(day.type,'recovery',date);assert.equal(day.protected,true);}
 for(const date of ['2026-11-10','2026-11-13'])assert.deepEqual(JSON.parse(JSON.stringify(S.options({},[],date,ready).choices.map(c=>c.id))),['rest']);
});
test('new weekday helpers agree on run pages; old sessions remain dated correctly',()=>{
 const {D,get}=env();D.accept({preferences:[pref]},'fixture-a');
 assert.equal(get('isRunDay(0,6)'),true);assert.equal(get('runSlotFor(0,6)'),0);assert.equal(get('isRunDay(1,6)'),false);
 assert.equal(get('isRunDay(3,6)'),true);assert.equal(get('runSlotFor(3,6)'),1);assert.equal(get('isRunDay(4,6)'),false);
 assert.equal(get('isRunDay(1,5)'),true);assert.equal(get('nameFor(0,5)'),'Recovery');assert.equal(get('nameFor(0,6)'),'Easy Run');
});
test('attendance is day-grouped but every distinct check-in is kept',()=>{
 const {D}=env();D.accept({attendance:[row('a','2026-10-22'),row('b','2026-10-22','08:05'),row('c','2026-10-25'),row('c','2026-10-25')]},'fixture-a');
 assert.equal(D.all().length,3);assert.equal(D.on('2026-10-22').length,2);assert.equal(new Set(D.all().map(r=>r.attendance_date)).size,2);
});
test('attendance never creates workouts, training minutes, lifting gains or run totals',()=>{
 const {D,P,get}=env();D.accept({attendance:[{...row('a','2026-10-23'),duration_seconds:999,activity_type:'Swimming'}]},'fixture-a');
 assert.equal(D.all()[0].duration_seconds,null);assert.equal(D.all()[0].activity_type,null);
 const records=P.records({logs:{},extraWorkouts:[]},[]);assert.equal(records.length,0);
 const result=P.analyze(records,{start:'2026-10-01',end:'2026-10-31'});assert.equal(result.runCount,0);assert.equal(result.liftCount,0);assert.equal(result.minutes,0);
 assert.equal(P.dayStatus('2026-10-23',[]).code,'attendance');assert.deepEqual(get('state.logs'),{});
});
test('actual recorded workout and attendance coexist without double-counting performance',()=>{
 const {D,P}=env();D.accept({attendance:[row('a','2026-10-23')]},'fixture-a');const r={id:'test',date:'2026-10-23',kind:'strength',exercises:{},minutes:40};
 assert.equal(P.dayStatus('2026-10-23',[r]).code,'done');assert.equal(P.analyze([r],{start:'2026-10-01',end:'2026-10-31'}).liftCount,1);
});
test('wrong-account and late results are discarded; sign-out hides both settings and attendance',()=>{
 const {D,setUser}=env();assert.equal(D.accept({preferences:[pref],attendance:[row('a','2026-10-23')]},'fixture-b'),false);
 D.accept({preferences:[pref],attendance:[row('a','2026-10-23')]},'fixture-a');setUser('fixture-b');assert.equal(D.all().length,0);assert.equal(D.plan('2026-11-10').protected,false);
 assert.equal(D.accept({attendance:[row('b','2026-10-23')]},'fixture-a'),false);setUser(null);assert.equal(D.snapshot().loaded,false);D.clear();assert.equal(D.snapshot().events.length,0);
});
test('malformed preference versions cannot shift calendar days',()=>{
 const {D}=env();D.accept({preferences:[{...pref,weekly_types:['easy']},{...pref,recovery_weekdays:[7]}]},'fixture-a');assert.equal(D.plan('2026-11-10').protected,false);
 assert.equal(D.plan('bad-date'),null);
});

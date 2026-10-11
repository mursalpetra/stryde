import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source = n => readFileSync(new URL('../'+n, import.meta.url), 'utf8');
function model() {
 const c={EX:[{unit:'lb per hand'},{unit:'lb total'},{name:'Synthetic machine',unit:'machine display'}],state:{logs:{}},view:'today',render(){},lastLift(){return null},target(){return {weight:5}},addEventListener(){}};
 c.window=c;vm.createContext(c);vm.runInContext(source('weight-units.js'),c);vm.runInContext(source('weight-unit-correction.js'),c);return c;
}
const id='custom-00000000-0000-4000-8000-000000000001';
const row=unit=>({weight:17,reps:'8,9',unit,form:'good',effort:'moderate'});
const fixture=()=>({logs:{'1-2':{status:'done',exercises:{0:row('lbs per hand'),1:row('lb total'),2:row('lbs')},prescriptionSnapshot:{recordedAt:'synthetic',exercises:{2:row('lbs')}}}},extraWorkouts:[{id:'synthetic',status:'done',exercises:{2:row('machine display'),[id]:row('lbs')}}],approvedLoads:{2:{weight:19,previous:17,approvedAt:'synthetic'}},customExercises:{[id]:{id,name:'Synthetic machine',unit:'lbs'}},coaching:{blocks:[{version:7,status:'accepted',prescriptions:{2:row('lbs')}}]}});
test('machine defaults use kg, free weights retain their real unit',()=>{const c=model();assert.equal(c.EX[2].unit,'kg');assert.equal(c.EX[0].unit,'lb per hand');assert.equal(c.EX[1].unit,'lb total');});
test('selected machine labels preserve numbers, full originals, versions and workout counts',()=>{const c=model(),s=fixture(),before=JSON.stringify(s),r=c.strydeWeightUnits.correct(s,['2'],'synthetic-time');assert.equal(JSON.stringify(s),before);assert.equal(r.count,5);assert.equal(r.state.logs['1-2'].exercises[2].weight,17);assert.equal(r.state.logs['1-2'].exercises[2].unit,'kg');assert.equal(r.state.coaching.blocks[0].version,7);assert.equal(r.state.approvedLoads[2].weight,19);assert.equal(r.state.extraWorkouts.length,1);assert.equal(r.state.logs['1-2'].exercises[0].unit,'lbs per hand');assert.equal(r.state.logs['1-2'].exercises[1].unit,'lb total');assert.equal(r.state.customExercises[id].unit,'lbs');assert.equal(r.state.weightUnitCorrections[0].changes[0].before.unit,'lbs');assert.equal(r.state.weightUnitCorrections[0].numericValuesChanged,false);});
test('correction is idempotent and ignores unapproved free weight IDs',()=>{const c=model(),a=c.strydeWeightUnits.correct(fixture(),['0','1','2']);const b=c.strydeWeightUnits.correct(a.state,['0','1','2']);assert.equal(b.count,0);assert.deepEqual(b.state,a.state);assert.equal(a.state.logs['1-2'].exercises[1].unit,'lb total');});
test('custom machine correction requires its explicit ID and includes its catalog entry',()=>{const c=model(),r=c.strydeWeightUnits.correct(fixture(),[id]);assert.equal(r.count,2);assert.equal(r.state.customExercises[id].unit,'kg');assert.equal(r.state.extraWorkouts[0].exercises[id].weight,17);assert.equal(r.state.logs['1-2'].exercises[2].unit,'lbs');});
test('empty/new accounts require no migration and are not marked corrected',()=>{const c=model(),s={logs:{},profile:{weight:71}};const r=c.strydeWeightUnits.correct(s,['2']);assert.equal(r.count,0);assert.deepEqual(JSON.parse(JSON.stringify(r.state)),s);});

// Execute the real target/snapshot/action stack with synthetic state and no network.
function actions() {
 const nodes=new Map(['root','nav','next-load','lift-weight','rep0','rep1','rep2','lift-effort','lift-form'].map(id=>[id,{innerHTML:'',value:'',append(){}}]));
 const stored=new Map(),alerts=[];
 const c={console,localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},
  document:{getElementById:id=>nodes.get(id)||null,addEventListener(){}},addEventListener(){},scrollTo(){},confirm:()=>true,alert:message=>alerts.push(message)};
 c.window=c;vm.createContext(c);const run=code=>vm.runInContext(code,c),load=name=>run(source(name));
 load('v2-core.js');load('weight-units.js');run('window.render=()=>{};window.navHTML=()=>""');
 for(const name of ['v2-actions.js','progress-model.js','coaching-model.js','coaching-ui.js','weight-unit-correction.js'])load(name);
 run("state.week=1;state.logs={};state.approvedLoads={};view='exercise';sessionDay=5;selectedExercise=4");
 return {c,run,nodes,alerts,stored};
}

test('unreviewed machine approvals cannot be relabeled kg by snapshot creation',()=>{
 for(const unit of [undefined,'lbs','machine display']){
  const e=actions(),approval={weight:30,previous:25,approvedAt:'synthetic',...(unit?{unit}:{})};
  e.run(`state.approvedLoads[4]=${JSON.stringify(approval)}`);
  assert.notEqual(e.c.target(4).weight,30);
  const snapshot=e.c.strydeCoaching.snapshotFor('1-5');
  assert.notEqual(snapshot.exercises[4].weight,30);
  e.run(`state.logs['1-5']={prescriptionSnapshot:${JSON.stringify(snapshot)}}`);
  assert.notEqual(e.c.target(4).weight,30);
  assert.deepEqual(JSON.parse(e.run('JSON.stringify(state.approvedLoads[4])')),approval);
 }
});

test('missing and pound machine snapshot units remain blocked until explicit review',()=>{
 for(const unit of [undefined,'lbs','machine display']){
  const e=actions(),entry={weight:30,reps:10,...(unit?{unit}:{})};
  e.run(`state.logs['1-5']={prescriptionSnapshot:{recordedAt:'synthetic',exercises:{4:${JSON.stringify(entry)}}}}`);
  assert.equal(e.c.target(4).weight,'');
  e.run("state=strydeWeightUnits.correct(state,['4'],'synthetic').state");
  assert.equal(e.c.target(4).weight,30);assert.equal(e.c.target(4).unit,'kg');
  assert.equal(e.run("state.logs['1-5'].prescriptionSnapshot.recordedAt"),'synthetic');
 }
});

test('missing and pound accepted-block units stay blocked, including saved snapshots',()=>{
 for(const unit of [undefined,'lbs','machine display']){
  const e=actions(),entry={weight:30,reps:10,...(unit?{unit}:{})};
  e.run(`state.coaching={blocks:[{id:'synthetic',version:7,status:'accepted',start:'2026-10-01',end:'2026-11-01',rationale:'Synthetic',prescriptions:{4:${JSON.stringify(entry)}}}]}`);
  assert.equal(e.c.target(4).weight,'');
  const snapshot=e.c.strydeCoaching.snapshotFor('1-5');
  e.run(`state.logs['1-5']={prescriptionSnapshot:${JSON.stringify(snapshot)}}`);
  assert.equal(e.c.target(4).weight,'');
  e.run("state=strydeWeightUnits.correct(state,['4'],'synthetic').state");
  assert.equal(e.c.target(4).weight,30);assert.equal(e.c.target(4).unit,'kg');
  assert.equal(e.run('state.coaching.blocks[0].version'),7);
 }
});

test('old machine logs cannot create kg progression approvals via finish or direct handlers',()=>{
 for(const unit of [undefined,'lbs','machine display']){
  const e=actions(),entry={weight:30,reps:'12,12',effort:'moderate',form:'good',...(unit?{unit}:{})};
  e.run(`state.logs['1-5']={status:'done',exercises:{4:${JSON.stringify(entry)}}};openSession(5);finishSession()`);
  assert.equal(e.nodes.get('root').innerHTML.includes('30 kg'),false);
  e.run('showUpgrade([4],0)');
  assert.equal(e.nodes.get('root').innerHTML.includes('30 kg'),false);
  e.nodes.get('next-load').value='32.5';e.c.approveUpgrade(4,30,0);
  assert.equal(e.run('state.approvedLoads[4]'),undefined);
  assert.deepEqual(JSON.parse(e.run("JSON.stringify(state.logs['1-5'].exercises[4])")),entry);
 }
});

test('reviewed kg logs still offer and persist normal progression with explicit units',()=>{
 const e=actions();e.run("state.logs['1-5']={status:'done',exercises:{4:{weight:30,unit:'kg',reps:'12,12',effort:'moderate',form:'good'}}};openSession(5);finishSession()");
 assert.equal(e.nodes.get('root').innerHTML.includes('30 kg'),true);
 e.nodes.get('next-load').value='32.5';e.c.approveUpgrade(4,30,0);
 assert.equal(e.run('state.approvedLoads[4].weight'),32.5);assert.equal(e.run('state.approvedLoads[4].unit'),'kg');
});

test('mixed-unit machine history is incomparable until explicit review, without new workouts',()=>{
 const e=actions();e.run("state.extraWorkouts=[{id:'synthetic-first',date:'2026-10-06',kind:'strength',status:'done',exercises:{2:{weight:17,unit:'lbs',reps:'10,10',form:'good',effort:'moderate',setup:'Synthetic same machine'}}},{id:'synthetic-next',date:'2026-10-08',kind:'strength',status:'done',exercises:{2:{weight:19,unit:'kg',reps:'10,10',form:'good',effort:'moderate',setup:'Synthetic same machine'}}}]");
 const P=e.c.strydeProgressModel,period={start:'2026-10-01',end:'2026-10-31'};
 assert.equal(P.records().length,2);assert.equal(P.liftChanges(P.records(),period).length,0);
 e.run("state=strydeWeightUnits.correct(state,['2'],'synthetic').state");
 const changes=P.liftChanges(P.records(),period);
 assert.equal(P.records().length,2);assert.equal(changes.length,1);assert.equal(changes[0].sessions,2);
 assert.equal(changes[0].first.weight,17);assert.equal(changes[0].last.weight,19);
 assert.ok(Math.abs(changes[0].load-(19/17-1)*100)<1e-9);
 assert.equal(e.run('state.weightUnitCorrections[0].changes[0].before.unit'),'lbs');
});

test('custom per-hand free weights remain unchanged even when their IDs are selected',()=>{
 for(const unit of ['lbs per hand','kg per hand']){
  const c=model(),s={logs:{},customExercises:{[id]:{id,name:'Synthetic dumbbell curl',unit}},extraWorkouts:[{id:'synthetic',status:'done',exercises:{[id]:row(unit)}}]};
  const before=JSON.stringify(s),r=c.strydeWeightUnits.correct(s,[id]);
  assert.equal(r.count,0);assert.equal(JSON.stringify(r.state),before);
 }
});

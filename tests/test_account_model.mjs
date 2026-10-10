/* Offline account/cloud regression fallback. No browser or remote service needed.
 * Run: node --test tests/test_account_model.mjs
 * Complements Playwright; this does not claim DOM or layout coverage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source = name => readFileSync(new URL('../'+name,import.meta.url),'utf8');
const copy = v => JSON.parse(JSON.stringify(v));
const A = 'synthetic-account-a', B = 'synthetic-account-b';
const payload = label => ({week:1,selectedDay:3,lastSeenV2:true,logs:{'1-0':{status:'done',notes:'Synthetic recovery'}},profile:{weight:70,height:170},approvedLoads:{},milestones:[{id:'synthetic-goal',title:'Synthetic goal',status:'active',date:'2026-12-01'}],coaching:{version:1,testLabel:label,profile:{},targets:[],meals:[{id:'synthetic-meal',date:'2026-10-09',description:'Synthetic meal',portion:'One serving',protein:25,calories:null,basis:'estimate'}],days:{},mealPlans:{},blocks:[],recovery:{}},customExercises:{},extraWorkouts:[],bodyChecks:[],goalReflections:{}});
function store(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(String(k),String(v)),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i],get length(){return map.size},map};}
function element(){const nodes=new Map();return {open:false,innerHTML:'',textContent:'',value:'',classList:{add(){},remove(){},toggle(){}},setAttribute(){},addEventListener(){},append(){},remove(){},focus(){},showModal(){this.open=true},close(){this.open=false},querySelector(selector){if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);},querySelectorAll(){return []}};}
function environment(local,remote={},uid=null,owner=null){
 const localStorage=store(),sessionStorage=store();
 localStorage.setItem('stryde-v1',JSON.stringify(local));
 localStorage.setItem('__test_mock_user',JSON.stringify(uid?{id:uid,email:uid+'@example.invalid'}:null));
 if(owner)localStorage.setItem('stryde-cloud-owner-v1',owner);
 const nodes=new Map(),listeners=new Map();
 const c={console,Blob,URL,crypto:webcrypto,localStorage,sessionStorage,setTimeout,clearTimeout,setInterval:()=>0,requestAnimationFrame:fn=>setTimeout(fn,0),__testConfig:{cloud:remote},
  document:{getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>{const e=element();Object.defineProperty(e,'id',{set(id){nodes.set(id,e)}});return e;},body:element(),activeElement:null},
  confirm:()=>true,alert(){},scrollTo(){},
  addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn)},
  dispatchEvent:event=>(listeners.get(event.type)||[]).forEach(fn=>fn(event)),
  CustomEvent:class {constructor(type,args){this.type=type;this.detail=args?.detail}},
  Event:class {constructor(type){this.type=type}},
  fetch:()=>{throw Error('Network forbidden in test')},
 };
 c.window=c;vm.createContext(c);
 vm.runInContext("{const NativeDate=Date,instant=NativeDate.parse('2026-10-10T04:00:00Z');Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[instant]))}static now(){return instant}};}",c);
 const run=code=>vm.runInContext(code,c);
 run(source('v2-core.js'));
 run('window.render=()=>{};window.navHTML=()=>"";');
 run(readFileSync(new URL('mock_supabase.js',import.meta.url),'utf8'));
 run(source('account-cloud.js'));
 return {c,run,nodes,storage:localStorage,state:()=>copy(run('state')),choose(choice){c.strydeOpenAccount();nodes.get('stryde-account-dialog').querySelector('#stryde-use-'+choice).onclick();}};
}
async function wait(check){const end=Date.now()+1000;while(!check()){if(Date.now()>end)throw Error('Timed out waiting for account state');await new Promise(r=>setTimeout(r,2));}}

test('coaching survives the same full-payload save path as legacy fields',async()=>{
 const p=payload('Device'),e=environment(p);await wait(()=>e.c.strydeAccountStatus().status==='Not signed in');
 e.run("state.coaching.testLabel='Edited';save()");
 const stored=JSON.parse(e.storage.getItem('stryde-v1'));
 assert.equal(stored.coaching.testLabel,'Edited');delete stored.coaching;const legacy=copy(p);delete legacy.coaching;assert.deepEqual(stored,legacy);
 const reload=environment(JSON.parse(e.storage.getItem('stryde-v1')));await wait(()=>reload.c.strydeAccountStatus().status==='Not signed in');assert.equal(reload.state().coaching.testLabel,'Edited');
});

test('conflicting coaching is never silently uploaded or downloaded; cloud choice backs up latest edit',async()=>{
 const local=payload('Device'),remote=payload('Cloud'),e=environment(local,{[A]:remote},A,A);await wait(()=>e.c.strydeAccountStatus().conflict);
 assert.equal(e.state().coaching.testLabel,'Device');assert.equal(e.c.__mock.upserts.length,0);assert.deepEqual(copy(e.c.__mock.cloud[A]),remote);
 e.run("state.coaching.testLabel='Pending device edit';save()");assert.equal(e.c.__mock.upserts.length,0);
 e.choose('cloud');await wait(()=>e.c.strydeAccountStatus().ready);
 assert.equal(e.state().coaching.testLabel,'Cloud');assert.equal(e.c.__mock.upserts.length,0);
 const keys=[...e.storage.map.keys()].filter(k=>k.startsWith('stryde-backup-before-cloud-'));assert.equal(keys.length,1);assert.equal(JSON.parse(e.storage.getItem(keys[0])).coaching.testLabel,'Pending device edit');
});

test('device choice preserves cloud backup and uploads only after explicit review',async()=>{
 const local=payload('Device'),remote=payload('Cloud'),e=environment(local,{[A]:remote},A,A);await wait(()=>e.c.strydeAccountStatus().conflict);
 e.choose('device');await wait(()=>e.c.__mock.upserts.length===1);assert.equal(e.c.__mock.cloud[A].coaching.testLabel,'Device');
 const backups=[...e.storage.map.keys()].filter(k=>k.startsWith('stryde-backup-before-device-'));assert.equal(backups.length,1);assert.equal(JSON.parse(e.storage.getItem(backups[0])).coaching.testLabel,'Cloud');
});

test('switching accounts blocks sync until explicit cloud choice and isolates subsequent writes',async()=>{
 const a=payload('A'),b=payload('B'),e=environment(a,{[A]:a,[B]:b},A,A);await wait(()=>e.c.strydeAccountStatus().ready);
 e.c.__mock.switchUser(B);await wait(()=>e.c.strydeAccountStatus().conflict);assert.equal(e.state().coaching.testLabel,'A');assert.equal(e.c.__mock.upserts.length,0);
 e.choose('cloud');await wait(()=>e.c.strydeAccountStatus().ready);assert.equal(e.state().coaching.testLabel,'B');
 e.run("state.coaching.testLabel='B edited';save()");await wait(()=>e.c.__mock.upserts.length===1);assert.equal(e.c.__mock.upserts[0].user_id,B);assert.deepEqual(copy(e.c.__mock.cloud[A]),a);
 e.c.__mock.switchUser(null);await wait(()=>!e.c.strydeAccountStatus().signedIn);e.run("state.coaching.testLabel='Offline B';save()");assert.equal(e.c.__mock.upserts.length,1);
});

test('failed cloud save keeps device coaching and queued retry succeeds',async()=>{
 const p=payload('Initial'),e=environment(p,{[A]:p},A,A);await wait(()=>e.c.strydeAccountStatus().ready);
 e.c.__mock.failWrites=true;e.run("state.coaching.testLabel='Offline edit';save()");await wait(()=>e.c.strydeAccountStatus().status.includes('saved on this device'));
 assert.equal(JSON.parse(e.storage.getItem('stryde-v1')).coaching.testLabel,'Offline edit');assert.equal(e.c.__mock.cloud[A].coaching.testLabel,'Initial');
 e.c.__mock.failWrites=false;e.c.dispatchEvent(new e.c.Event('online'));await wait(()=>e.c.strydeAccountStatus().status==='Synced');assert.equal(e.c.__mock.cloud[A].coaching.testLabel,'Offline edit');
});

test('private photos remain authenticated, JPEG-only, private-bucket and account-scoped',async()=>{
 const p=payload('A'),e=environment(p,{[A]:p},A,A);await wait(()=>e.c.strydeAccountStatus().ready);
 const api=e.c.strydePrivatePhotos;assert.deepEqual(Object.keys(api).sort(),['download','list','remove','upload']);
 const row=await api.upload(new Blob(['synthetic'],{type:'image/jpeg'}),{reference_type:'goal',reference_id:'synthetic-goal',photo_date:'2026-10-09',stage:'baseline',view_label:'front'});
 assert.ok(row.object_path.startsWith(A+'/'));assert.equal(row.user_id,undefined);assert.equal((await api.list('goal','synthetic-goal')).length,1);assert.equal((await api.download(row.object_path)).type,'image/jpeg');await api.remove(row.id);
 for(const call of e.c.__mock.calls){if(call.kind.startsWith('photo-'))assert.equal(call.bucket,'stryde-private-photos');if(call.table==='stryde_photo_entries'&&['select','delete'].includes(call.kind))assert.ok(call.filters.some(([key,value])=>key==='user_id'&&value===A));}
 await assert.rejects(api.download(B+'/other.jpg'),/denied/);await assert.rejects(api.download(A+'/../other.jpg'),/denied/);
 await assert.rejects(api.upload(new Blob(['x'],{type:'image/png'}),{reference_type:'goal',reference_id:'synthetic-goal',photo_date:'2026-10-09'}),/JPEG/);
 e.c.__mock.switchUser(null);await wait(()=>!e.c.strydeAccountStatus().signedIn);await assert.rejects(api.list('goal','synthetic-goal'),/Log in/);assert.deepEqual(e.state(),p);
});

test('recovery remains a recovery plan with extra activity recorded separately',()=>{
 const p=payload('A'),e=environment(p);e.run(source('progress-model.js'));
 const model=e.c.strydeProgressModel,date='2026-10-08';assert.equal(model.planOn(date).kind,'recovery');assert.equal(model.dayStatus(date,[]).code,'rest');
 e.run("state.extraWorkouts=[{id:'synthetic-extra',date:'2026-10-08',kind:'strength',status:'done',name:'Synthetic workout',durationMinutes:30,exercises:{}}]");
 assert.equal(model.dayStatus(date,model.records()).code,'done');assert.equal(model.planOn(date).kind,'recovery');assert.deepEqual(e.state().logs,p.logs);assert.equal(e.run('EX.length'),8);
});

test('existing delayed-read limitation stays non-destructive and recovers through Sync now',async()=>{
 const a=payload('A'),b=payload('B'),e=environment(a,{[A]:a,[B]:b},A,A);
 e.c.__mock.holdReads=true;await wait(()=>e.c.__mock.deferredReads.length===1);
 e.c.__mock.switchUser(B);await wait(()=>e.c.strydeAccountStatus().userId===B);
 e.c.__mock.releaseReads();await new Promise(resolve=>setTimeout(resolve,20));
 // Legacy account-cloud.js does not schedule the new user's read after an older
 // request finishes. No copy is overwritten; the existing Sync now action recovers.
 assert.equal(e.c.strydeAccountStatus().ready,false);assert.equal(e.c.__mock.upserts.length,0);assert.equal(e.state().coaching.testLabel,'A');
 e.c.strydeOpenAccount();await e.nodes.get('stryde-account-dialog').querySelector('#stryde-sync-now').onclick();
 assert.equal(e.c.strydeAccountStatus().conflict,true);e.choose('cloud');await wait(()=>e.c.strydeAccountStatus().ready);assert.equal(e.state().coaching.testLabel,'B');
});

function withCoaching(local=payload('Synthetic')){
 const e=environment(local);e.run(source('progress-model.js'));e.run(source('coaching-model.js'));return e;
}
function mealInput(overrides={}){return {date:'2026-10-09',description:'Synthetic meal',portion:'One synthetic serving',protein:'25',calories:'200',basis:'estimate',source:'Synthetic fixture',...overrides};}
function blockInput(overrides={}){return {title:'Synthetic block',start:'2026-10-10',end:'2026-10-31',rationale:'Synthetic review evidence',prescriptions:{'0':{reps:12,weight:10}},...overrides};}

test('coaching data is additive, non-mutating, preserves unknown keys and detects future versions',()=>{
 const e=withCoaching(),C=e.c.strydeCoachingModel,legacy={logs:{'1-0':{notes:'Synthetic'}},profile:{}};
 const before=copy(legacy),data=C.data(legacy);assert.deepEqual(legacy,before);assert.equal(legacy.coaching,undefined);
 assert.deepEqual(Object.keys(data).sort(),['blocks','days','mealPlans','meals','profile','recovery','targets','version']);
 assert.equal(data.version,1);assert.equal(data.meals.length,0);assert.equal(C.data({coaching:{version:2,futureFlag:true}}).futureFlag,true);assert.equal(C.data({coaching:{version:2}}).version,2);
 const malformed=C.data({coaching:{profile:[],targets:{},days:[],mealPlans:null,blocks:'bad',recovery:[]}});assert.equal(malformed.targets.length,0);assert.equal(Array.isArray(malformed.profile),false);
});

test('weekly averages exclude unknown and partial days and include an explicit zero',()=>{
 const e=withCoaching(),C=e.c.strydeCoachingModel,c=C.data({});
 c.targets=[{start:'2026-10-01',protein:25,createdAt:'2026-10-01T00:00:00Z'}];
 c.meals=[
  {id:'one',date:'2026-10-04',protein:20,calories:null,basis:'estimate'},
  {id:'two',date:'2026-10-05',protein:null,calories:300,basis:'label'},
  {id:'three',date:'2026-10-06',protein:30,calories:400,basis:'label'},
  {id:'four',date:'2026-10-07',protein:0,calories:0,basis:'label'},
  {id:'deleted',date:'2026-10-07',protein:500,calories:1000,basis:'estimate',deleted:true},
  {id:'partial-known',date:'2026-10-08',protein:15,calories:100,basis:'label'},
  {id:'partial-unknown',date:'2026-10-08',protein:null,calories:null,basis:'estimate'},
 ];
 c.days={'2026-10-04':{complete:true},'2026-10-05':{complete:true},'2026-10-06':{complete:false},'2026-10-07':{complete:true},'2026-10-08':{complete:true},'2026-10-09':{complete:true}};
 const week=C.weekSummary(c,'2026-10-10');assert.equal(week.complete,2);assert.equal(week.incomplete,5);assert.equal(week.average,10);assert.equal(week.estimatedDays,1);assert.equal(week.targetDays,2);assert.equal(week.atTarget,0);
 assert.equal(C.daySummary(c,'2026-10-05').protein,null);assert.equal(C.daySummary(c,'2026-10-07').protein,0);assert.equal(C.daySummary(c,'2026-10-09').proteinKnown,false);assert.equal(C.daySummary(c,'2026-10-08').proteinKnown,false);
});

test('dated targets preserve historical comparisons and latest same-date revision wins',()=>{
 const C=withCoaching().c.strydeCoachingModel,c=C.data({});
 c.targets=[{id:'old',start:'2026-10-01',protein:80,createdAt:'2026-10-01T01:00:00Z'},{id:'new',start:'2026-10-10',protein:100,createdAt:'2026-10-10T01:00:00Z'},{id:'revision',start:'2026-10-10',protein:null,createdAt:'2026-10-10T02:00:00Z'}];
 assert.equal(C.targetOn(c,'2026-09-30'),null);assert.equal(C.targetOn(c,'2026-10-09').id,'old');assert.equal(C.targetOn(c,'2026-10-10').id,'revision');assert.equal(C.targetOn(c,'2026-10-10').protein,null);
});

test('meal validation distinguishes unknown from zero and rejects unsafe or invalid inputs',()=>{
 const C=withCoaching().c.strydeCoachingModel;
 const unknown=C.meal(mealInput({protein:'',calories:''}));assert.equal(unknown.protein,null);assert.equal(unknown.calories,null);
 const zero=C.meal(mealInput({protein:'0',calories:'0',basis:'label'}));assert.equal(zero.protein,0);assert.equal(zero.calories,0);assert.equal(zero.basis,'label');
 const edited=C.meal(mealInput({description:'Synthetic edit'}),unknown);assert.equal(edited.id,unknown.id);assert.equal(edited.createdAt,unknown.createdAt);
 for(const override of [{date:'2026-02-30'},{date:'2026-10-11'},{description:' '},{portion:''},{protein:'-1'},{protein:'501'},{calories:'10001'},{protein:'NaN'},{calories:'Infinity'}])assert.throws(()=>C.meal(mealInput(override)));
});

test('training proposals require explicit acceptance, use dated versions and protect original exercise identity',()=>{
 const e=withCoaching(),C=e.c.strydeCoachingModel,c=C.data({});
 const proposal=C.block(c,blockInput());c.blocks.push(proposal);assert.equal(proposal.status,'proposed');assert.equal(C.activeBlock(c,'2026-10-14'),null);assert.equal(proposal.prescriptions['0'].sets,3);assert.equal(proposal.prescriptions['0'].unit,e.run('EX[0].unit'));
 C.acceptBlock(c,proposal.id);assert.equal(proposal.status,'accepted');assert.equal(C.activeBlock(c,'2026-10-14').id,proposal.id);assert.equal(C.activeBlock(c,'2026-11-01'),null);assert.throws(()=>C.acceptBlock(c,proposal.id));
 const second=C.block(c,blockInput({title:'Synthetic revision'}));c.blocks.push(second);assert.equal(second.version,2);assert.equal(C.activeBlock(c,'2026-10-14').version,1);C.acceptBlock(c,second.id);assert.equal(C.activeBlock(c,'2026-10-14').version,2);
 for(const override of [{start:'2026-10-09'},{end:'2027-02-01'},{rationale:''},{prescriptions:{'custom-123':{reps:10,weight:10}}},{prescriptions:{'999':{reps:10,weight:10}}},{prescriptions:{'0':{reps:2.5,weight:10}}},{prescriptions:{'0':{reps:10,weight:-1}}}])assert.throws(()=>C.block(c,blockInput(override)));
 c.blocks.push({id:'past-proposal',status:'proposed',start:'2026-10-09'});assert.throws(()=>C.acceptBlock(c,'past-proposal'),/past/);
});

function withCoachingActions(includeTimer=false){
 const e=withCoaching();e.run(source('v2-actions.js'));if(includeTimer)e.run(source('workout-timer-full.js'));e.run(source('coaching-ui.js'));
 for(const [id,value] of Object.entries({'lift-weight':'10',rep0:'12',rep1:'12',rep2:'12','lift-effort':'moderate','lift-form':'good'})){const el=element();el.value=value;e.nodes.set(id,el);}
 e.run("state.week=2;sessionDay=2;selectedExercise=0;view='exercise';state.coaching=strydeCoachingModel.data(state);const initialBlock=strydeCoachingModel.block(state.coaching,{title:'Synthetic initial block',start:'2026-10-10',end:'2026-10-31',rationale:'Synthetic agreed targets',prescriptions:{'0':{reps:12,weight:10}}});state.coaching.blocks.push(initialBlock);strydeCoachingModel.acceptBlock(state.coaching,initialBlock.id)");
 return e;
}

test('first valid saved lift freezes every session target across later accepted revisions',()=>{
 const e=withCoachingActions();assert.equal(e.c.target(0).weight,10);assert.equal(e.c.target(0).reps,12);e.c.saveLift();
 const first=e.state().logs['2-2'];assert.equal(Object.keys(first.prescriptionSnapshot.exercises).length,4);assert.equal(first.prescriptionSnapshot.exercises['0'].blockVersion,1);assert.equal(first.prescriptionSnapshot.exercises['0'].reps,12);
 const persisted=JSON.parse(e.storage.getItem('stryde-v1'));assert.deepEqual(persisted.logs['2-2'].prescriptionSnapshot,first.prescriptionSnapshot);
 e.run("const revisedBlock=strydeCoachingModel.block(state.coaching,{title:'Synthetic new block',start:'2026-10-10',end:'2026-10-31',rationale:'Synthetic new targets',prescriptions:{'0':{reps:8,weight:15}}});state.coaching.blocks.push(revisedBlock);strydeCoachingModel.acceptBlock(state.coaching,revisedBlock.id)");
 assert.equal(e.c.target(0).weight,10);assert.equal(e.c.target(0).reps,12);assert.equal(e.c.target(0).label,'Saved session target');assert.deepEqual(e.state().logs['2-2'].prescriptionSnapshot,first.prescriptionSnapshot);
 e.run('state.week=3;sessionDay=2;');assert.equal(e.c.target(0).weight,15);assert.equal(e.c.target(0).reps,8);assert.equal(e.c.target(0).blockVersion,2);
});

test('invalid lifts and completed legacy workouts receive no invented snapshots',()=>{
 const e=withCoachingActions();e.nodes.get('rep1').value='';e.c.saveLift();assert.equal(e.state().logs['2-2'],undefined);
 e.run("state.logs['2-2']={status:'done',exercises:{'0':{weight:7,reps:'9,9,9',unit:EX[0].unit,effort:'moderate',form:'good'}}}");
 const before=copy(e.state().logs['2-2']);assert.equal(e.c.target(0).blockId,undefined);assert.deepEqual(e.state().logs['2-2'],before);
 e.nodes.get('rep1').value='12';e.run('selectedExercise=0');e.c.saveLift();assert.equal(e.state().logs['2-2'].prescriptionSnapshot,undefined);
});

test('custom exercises keep stable IDs, units and historical names without changing the original plan',()=>{
 const e=withCoaching(),id='custom-00000000-0000-4000-8000-000000000001',P=e.c.strydeProgressModel;
 e.run(`state.customExercises={'${id}':{id:'${id}',name:'Synthetic cable movement',unit:'kg',custom:true}};state.extraWorkouts=[{id:'synthetic-one',date:'2026-10-06',kind:'strength',status:'done',durationMinutes:30,exercises:{'${id}':{name:'Synthetic cable movement',custom:true,weight:20,reps:'10,10',unit:'kg',effort:'moderate',form:'good',setup:'Synthetic station'}}},{id:'synthetic-two',date:'2026-10-08',kind:'strength',status:'done',durationMinutes:30,exercises:{'${id}':{name:'Synthetic cable movement',custom:true,weight:22,reps:'10,10',unit:'kg',effort:'moderate',form:'good',setup:'Synthetic station'}}}];save()`);
 const records=P.records(),changes=P.liftChanges(records,P.period('2026-10'));
 assert.equal(P.customId(id),true);assert.equal(P.exerciseInfo(id).name,'Synthetic cable movement');assert.equal(changes.length,1);assert.equal(changes[0].custom,true);assert.equal(changes[0].i,id);assert.ok(Math.abs(changes[0].load-10)<1e-9);assert.equal(e.run('EX.length'),8);
 const saved=JSON.parse(e.storage.getItem('stryde-v1'));assert.equal(saved.customExercises[id].unit,'kg');assert.equal(saved.extraWorkouts[0].exercises[id].name,'Synthetic cable movement');
 e.run(`state.extraWorkouts[1].exercises['${id}'].unit='lbs'`);assert.equal(P.liftChanges(P.records(),P.period('2026-10')).length,0);
});

test('Progress and other non-session views never inherit a stale session prescription',()=>{
 const e=withCoachingActions();e.run("view='progress'");const baseline=copy(e.c.target(0));
 e.run("view='exercise'");assert.equal(e.c.target(0).blockVersion,1);e.c.saveLift();assert.equal(e.c.target(0).label,'Saved session target');
 for(const view of ['progress','today','plan','coach','goals']){e.run(`view='${view}'`);assert.deepEqual(copy(e.c.target(0)),baseline,view);}
 e.run("view='session'");assert.equal(e.c.target(0).label,'Saved session target');assert.equal(e.c.target(0).blockVersion,1);
});

test('starting the real workout timer captures and persists targets before the first set',()=>{
 const e=withCoachingActions(true);e.run("view='session'");e.c.strydeWorkoutTimer.start('2-2');
 const started=e.state().logs['2-2'];assert.equal(started.status,'in_progress');assert.equal(started.timing.state,'running');assert.equal(started.exercises,undefined);
 assert.equal(started.prescriptionSnapshot.date,'2026-10-14');assert.equal(started.prescriptionSnapshot.exercises['0'].blockVersion,1);assert.equal(started.prescriptionSnapshot.exercises['0'].weight,10);
 const stored=JSON.parse(e.storage.getItem('stryde-v1'));assert.deepEqual(stored.logs['2-2'].prescriptionSnapshot,started.prescriptionSnapshot);
 e.run("const afterStartRevision=strydeCoachingModel.block(state.coaching,{title:'Synthetic later revision',start:'2026-10-10',end:'2026-10-31',rationale:'Synthetic new target review',prescriptions:{'0':{reps:8,weight:15}}});state.coaching.blocks.push(afterStartRevision);strydeCoachingModel.acceptBlock(state.coaching,afterStartRevision.id)");
 assert.equal(e.c.target(0).weight,10);assert.equal(e.c.target(0).reps,12);assert.equal(e.c.target(0).blockVersion,1);
 e.c.strydeWorkoutTimer.start('2-2');assert.deepEqual(e.state().logs['2-2'].prescriptionSnapshot,started.prescriptionSnapshot);
 e.run("view='exercise';selectedExercise=0");e.c.saveLift();assert.deepEqual(e.state().logs['2-2'].prescriptionSnapshot,started.prescriptionSnapshot);
 assert.equal(e.c.strydeWorkoutTimer.complete('2-2'),true);assert.equal(e.state().logs['2-2'].timing.state,'finished');assert.deepEqual(e.state().logs['2-2'].prescriptionSnapshot,started.prescriptionSnapshot);
});

test('legacy in-progress, timed or partially logged sessions never receive invented targets',()=>{
 const cases=[{status:'in_progress'},{timing:{state:'finished',started_at:'2026-10-10T03:00:00Z',ended_at:'2026-10-10T03:30:00Z'}},{started_at:'2026-10-10T03:00:00Z'},{exercises:{'0':{weight:7,reps:'9,9,9',effort:'moderate',form:'good',unit:'lbs per hand'}}}];
 for(const legacy of cases){const e=withCoachingActions();e.run(`state.logs['2-2']=${JSON.stringify(legacy)}`);assert.equal(e.c.strydeCoaching.snapshotFor('2-2'),null);assert.equal(e.c.target(0).blockId,undefined);assert.equal(e.c.target(0).label==='Saved session target',false);e.c.saveLift();assert.equal(e.state().logs['2-2'].prescriptionSnapshot,undefined);}
 const e=withCoachingActions(true);e.run("state.logs['2-2']={status:'in_progress',notes:'Synthetic existing session'}");e.c.strydeWorkoutTimer.start('2-2');assert.equal(e.state().logs['2-2'].prescriptionSnapshot,undefined);assert.equal(e.state().logs['2-2'].notes,'Synthetic existing session');
 assert.equal(e.c.strydeCoaching.snapshotFor('bad-key'),null);assert.equal(e.c.strydeCoaching.snapshotFor('2-3'),null);
});


test('zero-load block overrides are rejected instead of creating unloggable targets',()=>{
 const C=withCoaching().c.strydeCoachingModel;
 assert.throws(()=>C.block(C.data({}),blockInput({prescriptions:{0:{reps:10,weight:0}}})),/positive load/);
});

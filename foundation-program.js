/* Strength-first, time-based running foundation. Transparent coaching rules, not medical clearance.
 * Goals are migrated additively. Never infer completed sets, change past logs, or use body weight as a fitness score.
 * Evidence and the deliberately conservative implementation heuristics are described in FOUNDATION-COACH.md.
 */
(() => {
 'use strict';
 const FROM='2026-11-09', ID='strength-running-foundation-v1', DAY=86400000;
 const TYPES=['upper','recovery','lower','easy','recovery','full','baseRun'];
 const NAMES={upper:'Back, shoulders & arms',lower:'Glutes & legs',full:'Full-body strength',easy:'Easy run / walk',baseRun:'Aerobic base run / walk',recovery:'Recovery',rest:'Recovery',completed:'Activity recorded',started:'Continue saved workout'};
 const IDS={upper:[4,5,6,7],lower:[0,1,2,3],full:[1,2,5,7]};
 const REASONS={upper:'Upper-body strength after Sunday’s aerobic session gives your legs a lighter day.',lower:'The main lower-body strength session follows Tuesday’s recovery. Thursday stays easy, not a hard run.',full:'A controlled second exposure for legs, back and chest. Keep lower-body work modest before Sunday’s easy aerobic session.',easy:'Short conversational running or run/walk after leg day, only if walking and easy jogging feel comfortable. It is not an interval or speed day.',baseRun:'Build comfortable time on your feet, not race distance. Walk breaks are welcome; do not extend after a demanding Saturday.',recovery:'Tuesday and Friday are protected recovery days because you are unavailable for your morning workout.'};
 const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
 const add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);
 const span=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/DAY);
 const weekday=d=>(new Date(d+'T12:00:00Z').getUTCDay()+6)%7;
 const number=v=>v!==''&&v!=null&&Number.isFinite(Number(v))?Number(v):null;
 const active=d=>valid(d)&&d>=FROM;
 const kind=t=>IDS[t]?'strength':['easy','baseRun'].includes(t)?'run':'recovery';
 const clone=x=>JSON.parse(JSON.stringify(x));
 function migrate(s) {
  if(!s||typeof s!=='object'||Array.isArray(s))return s;
  if(s.trainingProgram?.id===ID)return s;
  // A later explicit user program must not be replaced by a one-time migration.
  if(s.trainingProgram?.effectiveFrom>FROM)return s;
  s.milestones=Array.isArray(s.milestones)?s.milestones:[];
  s.milestones=s.milestones.map(m=>m&&((m.id==='shenzhen-half-2026')||(m.kind==='race'&&m.date==='2026-12-20'&&/shenzhen/i.test(m.title||'')))&&m.status==='active'?{...m,status:'archived',archivedOn:FROM,archiveReason:'Race withdrawn by user; replaced with strength and long-term running conditioning.'}:m);
  if(!s.milestones.some(m=>m.id==='strength-foundation'))s.milestones.push({id:'strength-foundation',kind:'training',title:'Build strength & running consistency',date:'2026-12-07',dateLabel:'First coaching review',status:'active',source:'Goal reset requested by user'});
  if(!s.milestones.some(m=>m.id==='race-aspiration-2027'))s.milestones.push({id:'race-aspiration-2027',kind:'aspiration',title:'Build toward a 2027 marathon goal',targetYear:2027,date:null,distance:null,status:'planned',source:'Race and distance not yet selected'});
  s.trainingProgram={id:ID,version:1,effectiveFrom:FROM,name:'Strength & running foundation',primaryFocus:'strength',secondaryFocus:'aerobic base',bodyGoals:['Muscle definition','Gradual body-composition change','Endurance'],reviewEveryDays:28,recoveryWeekdays:[1,4],weeklyTypes:TYPES.slice(),futureRace:{year:2027,date:null,distance:null},source:'User-requested goal change'};
  return s;
 }
 function plan(date) {
  if(!active(date))return null;
  const day=weekday(date),type=TYPES[day];
  return {date,day,week:Math.floor(span('2026-10-05',date)/7)+1,type,kind:kind(type),name:NAMES[type],ids:(IDS[type]||[]).slice(),km:null,minutes:kind(type)==='strength'?40:kind(type)==='run'?20:0,runIndex:kind(type)==='run'?(day===6?2:0):null,foundation:true,protectedRecovery:type==='recovery',reason:REASONS[type],originalType:type};
 }
 const rowsBefore=(rows,date,lookback=28)=>(rows||[]).filter(r=>valid(r.date)&&r.date<=date&&r.date>=add(date,-lookback)&&!r.deleted);
 function muscles(r) {
  if(r.kind==='run')return ['lower'];if(r.kind!=='strength')return [];
  const out=new Set();
  for(const [id,e] of Object.entries(r.exercises||{})){
   const def=window.strydeProgressModel?.exerciseInfo(id,e),text=[...(e.muscles||[]),...(def?.muscles||[])].join(' ').toLowerCase();
   if(/glute|hamstring|quad|calf|calves|leg|adductor/.test(text))out.add('lower');
   if(/lat|back|shoulder|chest|bicep|tricep|arm/.test(text))out.add('upper');
   if(!text){out.add('lower');out.add('upper');}
  }
  if(!out.size){out.add('lower');out.add('upper');}return [...out];
 }
 function hard(r){return number(r.rpe)>=7||r.kind==='strength'&&Object.values(r.exercises||{}).some(e=>e.effort==='hard');}
 function fatigue(rows,date) {
  const last=rowsBefore(rows,date,10).filter(r=>r.kind==='strength').slice(-2);
  return last.length===2&&last.every(r=>{const ex=Object.values(r.exercises||{});return ex.length>0&&ex.filter(e=>e.effort==='hard').length/ex.length>=.5;});
 }
 function checkFor(s,date,readiness,input) {
  const c=readiness?readiness(s,date,input):{...(s.coaching?.recovery?.[date]||{}),...(input||s.adaptiveSchedule?.checkins?.[date]||{})};
  return {...c,soreness:c.soreness||'none',sleep:number(input?.sleep??c.sleep??s.coaching?.recovery?.[date]?.sleep)};
 }
 function runDose(date,rows=[],s={}) {
  const p=plan(date),end=window.strydeProgressModel?.iso?.()||date,cutoff=end<date?end:date;
  const recent=rowsBefore(rows,cutoff).filter(r=>r.kind==='run'&&number(r.minutes)>0).sort((a,b)=>a.date.localeCompare(b.date));
  const limit=p?.type==='baseRun'?40:30,last=recent.at(-1),feedback=s.foundationRunFeedback||{};
  const qualified=recent.filter(r=>{const f=feedback[r.id]||{};return number(f.effort??r.rpe)>=1&&number(f.effort??r.rpe)<=4&&f.comfortable===true&&f.recovered===true;}).slice(-2);
  let minutes=last?Math.max(10,Math.min(20,Math.floor(last.minutes))):20,progression=false;
  let reason=recent.length?'Repeat a short, comfortable duration. Recorded times alone do not establish recovery or authorize a longer run.':'Recent run history is limited: begin with up to 20 minutes of comfortable run/walk, or less. This is a ceiling, not a required finish.';
  const eligible=qualified.length===2&&qualified[0].date!==qualified[1].date&&last?.id===qualified[1].id&&Math.max(qualified[0].minutes,qualified[1].minutes)/Math.min(qualified[0].minutes,qualified[1].minutes)<=1.25;
  if(eligible){minutes=Math.min(limit,Math.floor(Math.min(...qualified.map(r=>r.minutes))+2));progression=minutes>Math.min(...qualified.map(r=>r.minutes));reason=progression?'Two similar recent runs were reported easy, comfortable and recovered the next day: an optional two-minute extension. Keep the pace easy; do not also add speed.':'Comfortable base duration held at this phase’s cap. Review before adding longer-distance training.';}
  const prior=rowsBefore(rows,add(date,-1),1).filter(r=>r.date===add(date,-1));
  if(prior.some(r=>hard(r)||r.kind==='run'&&r.minutes>=60)||fatigue(rows,cutoff)){minutes=Math.min(minutes,15);progression=false;reason='Recent demanding work calls for a shorter run/walk and no progression. Replace it with walking or rest if your legs do not feel comfortable.';}
  return {minutes,km:null,progression,reason,qualified:qualified.length,foundation:true};
 }
 function exerciseTarget(id,date,s,rows=[]) {
  const e=EX[id],P=window.strydeProgressModel,low=id===3?10:8,high=id===3?15:12;
  const entries=rowsBefore(rows,date,84).filter(r=>r.kind==='strength'&&r.exercises?.[id]&&number(r.exercises[id].weight)>0&&P.unit(r.exercises[id].unit)===P.unit(e.unit)).map(r=>({...r.exercises[id],date:r.date,recordId:r.id})).sort((a,b)=>a.date.localeCompare(b.date));
  const last=entries.at(-1),parse=x=>String(x?.reps||'').split(',').map(Number),good=x=>x?.form==='good'&&['easy','moderate'].includes(x.effort)&&parse(x).length>0&&parse(x).every(n=>Number.isInteger(n)&&n>0);
  const out={id,name:e.name,sets:2,reps:low,repMin:low,repMax:high,unit:e.unit,weight:'',muscles:e.muscles.slice(),cue:e.cue,restSeconds:id===3?90:120,last:last?{date:last.date,weight:last.weight,reps:last.reps,unit:last.unit}:null,readyToIncrease:false,source:'Calibrate',reason:'No recent comparable log. Use a familiar light load and finish with 2–3 clean reps still possible.'};
  if(!last)return out;
  if(span(last.date,date)>28){out.source='Re-establish technique';out.reason='Your last comparable load is over four weeks old. Recalibrate today; the old value is a reference, not an automatic target.';return out;}
  out.weight=Number(last.weight);out.reps=Math.max(low,Math.min(high,Math.min(...parse(last))||low));out.source='Repeat';
  if(!good(last)){out.reason='Last effort was hard or technique was not confirmed. Repeat only if comfortable, otherwise use less. Do not increase the load.';return out;}
  out.reps=Math.min(high,out.reps+1);out.source='Build reps';out.reason='Add a controlled rep before adding weight. Stop the set with 2–3 good reps left; do not force the target.';
  const pair=entries.slice(-2),setup=x=>String(x.setup||x.equipment||'').trim().toLowerCase();
  out.readyToIncrease=pair.length===2&&pair[0].date!==pair[1].date&&pair.every(x=>good(x)&&span(x.date,date)<=28&&Number(x.weight)===Number(last.weight)&&parse(x).every(r=>r>=high))&&parse(pair[0]).length===parse(pair[1]).length&&setup(pair[0])===setup(pair[1]);
  if(out.readyToIncrease){out.source='Review next load';out.reason='Two comparable sessions reached the top of the rep range. Confirm the same equipment, then approve its smallest practical increase; it will not increase automatically.';}
  const approved=s.approvedLoads?.[id];
  if(out.readyToIncrease&&number(approved?.weight)>out.weight&&Number(approved?.previous)===out.weight&&valid(String(approved?.approvedAt||'').slice(0,10))&&span(String(approved.approvedAt).slice(0,10),date)<=28){out.weight=Number(approved.weight);out.reps=low;out.source='Approved trial';out.reason='You approved this next load. Start at the lower end of the rep range and return to the previous weight if technique changes.';}
  const same=entries.slice(-3);if(!out.readyToIncrease&&same.length===3&&same.every(x=>good(x)&&x.weight===last.weight&&x.reps===last.reps)){out.reason+=' Three unchanged logs: review rest, setup and recovery before adding more work.';}
  return out;
 }
 function prescription(choice,s,rows=[]) {
  const recent=rowsBefore(rows,choice.date,28).filter(r=>r.kind==='strength'),build=recent.length>=6&&!fatigue(rows,choice.date),light=choice.light||fatigue(rows,choice.date);
  const exercises=(choice.ids||[]).map(id=>{const t=exerciseTarget(id,choice.date,s,rows);t.sets=light?1:build&&choice.type!=='full'?3:2;t.reps=light?t.repMin:t.reps;t.source=light?'Lighter session · '+t.source:t.source;return t;});
  return {version:2,programId:ID,recordedAt:new Date().toISOString(),date:choice.date,type:choice.type,name:choice.name,minutes:choice.minutes,km:null,reason:choice.reason,exercises,phase:light?'Recovery-adjusted':build?'Build':'Re-establish consistency',warmup:'5–8 minutes of easy movement and lighter practice sets. No maximal-load testing.',effort:'Keep 2–3 good reps in reserve; stop for pain or loss of control.'};
 }
 function recommend(s,rows,date,asOf,readiness,input) {
  const p=plan(date);if(!p)return null;
  const actual=rowsBefore(rows,asOf,90),done=actual.filter(r=>r.date===date),base={...p,originalType:p.type,adjusted:false,provisional:date>asOf};
  if(done.length)return {...base,type:'completed',name:done.map(r=>r.name).join(' · '),kind:done[0].kind,activities:done,reason:'Recorded activity is preserved. No second workout is required today.'};
  if(p.protectedRecovery)return base;
  const legacy=s.logs?.[`${p.week}-${p.day}`];
  if(legacy&&legacy.status!=='done'&&(legacy.status==='in_progress'||legacy.started_at||legacy.timing||Object.keys(legacy.exercises||{}).length))return {...base,type:'started',name:'Continue saved workout',legacyKey:`${p.week}-${p.day}`,reason:'Finish or review the session already in progress. Its original targets remain unchanged.'};
  const pending=s.adaptiveSchedule?.activeSession;
  if(pending?.status==='in_progress'&&(pending.date===date||date===asOf))return {...base,type:'started',name:'Continue saved workout',adaptiveId:pending.id,reason:'Your unfinished session and its targets are preserved. Finish or discard it before starting another.'};
  if(date===asOf){
   const c=checkFor(s,date,readiness,input);
   if(c.rest||c.comfort==='pain'||c.comfort==='sore'||number(c.energy)!==null&&c.energy<=2||c.soreness==='both')return {...base,type:'recovery',kind:'recovery',name:c.comfort==='pain'?'Pause training':'Extra recovery today',ids:[],minutes:0,adjusted:true,reason:c.comfort==='pain'?'You reported pain or concerning symptoms. Pause and seek appropriate clinical advice. The planned session remains visible, but is not a safe-workout clearance.':'Your reported fatigue, soreness or choice to rest overrides today’s workout. This is extra recovery, not a change to Tuesday/Friday availability.'};
   if(c.soreness==='lower'&&['lower','full','easy','baseRun'].includes(p.type))return {...base,type:'upper',kind:'strength',name:'Upper body · legs recovering',ids:IDS.upper.slice(0,3),minutes:30,light:true,adjusted:true,reason:'Lower-body soreness reported: leave legs unloaded and use a lighter upper-body option only if comfortable. Rest remains available.'};
   if(c.soreness==='upper'&&['upper','full'].includes(p.type))return {...base,type:'easy',kind:'run',name:'Easy walk / run · upper body recovering',ids:[],minutes:15,light:true,adjusted:true,reason:'Upper-body soreness reported: avoid pressing and pulling today. A short easy walk/run is an alternative only if your legs are recovered.'};
  }
  if(p.kind==='run')return {...base,...runDose(date,rows,s),reason:p.reason+' '+runDose(date,rows,s).reason};
  if(fatigue(rows,asOf)&&date<=add(asOf,6))return {...base,light:true,minutes:25,adjusted:true,reason:'Most lifts were hard in your last two logged strength sessions. Reduce working sets for this review week and reassess recovery; do not force heavier loads.'};
  return base;
 }
 function safetyAdjust(d,rows,asOf) {
  if(!d||!['strength','run'].includes(d.kind)||['completed','started'].includes(d.type)||d.date>add(asOf,1))return d;
  const recent=rowsBefore(rows,add(d.date,-1),6),dates=new Set(recent.map(r=>r.date));
  const recovery=reason=>({...d,type:'recovery',kind:'recovery',ids:[],minutes:0,name:'Extra recovery recommended',adjusted:true,reason});
  if(dates.size>=5)return recovery('Five training days are already recorded in the preceding six days. Keep a recovery day rather than adding catch-up work.');
  const yesterday=recent.filter(r=>r.date===add(d.date,-1)),groups=d.type==='full'?['upper','lower']:d.kind==='run'||d.type==='lower'?['lower']:['upper'];
  if(d.kind==='strength'&&yesterday.some(r=>r.kind==='strength'&&muscles(r).some(g=>groups.includes(g))))return recovery('The same muscle region was trained yesterday. Allow another day before repeating loaded strength work; the baseline is not rewritten.');
  if(d.kind==='run'&&yesterday.some(r=>r.kind==='run'))return recovery('A run is already recorded yesterday. Keep a day between runs during this conditioning phase.');
  if(yesterday.some(r=>r.kind==='run'&&(hard(r)||r.minutes>=60))&&groups.includes('lower'))return recovery('Yesterday’s run was long or hard. Protect lower-body recovery rather than forcing today’s lower-body session.');
  if(d.kind==='run'&&yesterday.some(r=>r.kind==='strength'&&muscles(r).includes('lower')&&hard(r)))return {...d,type:'recovery',kind:'recovery',ids:[],minutes:0,name:'Gentle walking or recovery',light:true,walkOnly:true,adjusted:true,reason:'Hard leg work was recorded yesterday. Prefer gentle walking or rest today; do not run through soreness.'};
  return d;
 }
 function build(s={},rows=[],today,readiness) {
  const days={},changes=[],warnings=[];if(!active(today))return {days,changes,warnings};
  const horizon=add(today,62);
  for(let date=today;date<=horizon;date=add(date,1)){let d=safetyAdjust(recommend(s,rows,date,today,readiness),rows,today);days[date]=d;if(d.adjusted)changes.push({date,from:plan(date).name,to:d.name,reason:d.reason});}
  if(!checkFor(s,today,readiness).historyComplete)warnings.push('Recent history is not confirmed. The weekly rhythm is a baseline, not evidence of recovery. Review check-ins and missing logs before starting.');
  warnings.push('Three strength and two easy conditioning slots are opportunities, not a mandatory quota. No missed session is added on top.','Exact readiness thresholds and the two-minute running step are conservative app heuristics, not validated measurements of your body.');
  return {days,changes,warnings,program:ID};
 }
 function options(s={},rows=[],today,readiness,input) {
  const rest={...plan(today),id:'rest',type:'rest',kind:'recovery',name:'Recovery',ids:[],minutes:0,reason:'Rest remains an available choice. Do not make up missed training.'},choices=[rest],c=checkFor(s,today,readiness,input);
  if(plan(today)?.protectedRecovery)return {choices,reason:REASONS.recovery,warnings:[]};
  if(c.comfort==='pain')return {choices,reason:'You reported pain or concerning symptoms. Pause training and seek appropriate clinical advice before resuming.',warnings:[]};
  if(c.comfort!=='comfortable'||number(c.energy)===null||number(c.minutes)===null||!c.historyComplete)return {choices,reason:'Confirm comfortable movement, energy, time available and your recent activity before starting. The planned week remains visible while these are unknown.',warnings:[]};
  let d=safetyAdjust(recommend(s,rows,today,today,readiness,input),rows,today);
  if(!d||['completed','started'].includes(d.type)||d.kind==='recovery')return {choices,reason:d?.reason||'Review today’s readiness.',warnings:[]};
  // Check the adjusted alternative too: a body-area swap must not bypass recovery spacing.
  if(c.sleep!==null&&c.sleep<6){d={...d,light:true,minutes:Math.min(d.minutes,25),reason:d.reason+' You reported under six hours of sleep: keep this session shorter and easier. This single report is context, not a diagnosis.'};}
  d.minutes=Math.min(d.minutes,c.minutes);if(d.kind==='strength'&&d.minutes<30)d.ids=d.ids.slice(0,3);
  choices.unshift({...d,id:'foundation-'+d.type});
  return {choices,reason:'Today’s session follows your strength-first rhythm, adjusted only from reported recovery and completed work.',warnings:[]};
 }
 function review(s,rows,today){
  const recent=rowsBefore(rows,today),lifts=recent.filter(r=>r.kind==='strength'),runs=recent.filter(r=>r.kind==='run');
  const overdue=span(FROM,today)>=28&&!s.foundationReviews?.some(r=>valid(r.date)&&r.date>=add(today,-28));
  return {lifts:lifts.length,runs:runs.length,phase:fatigue(rows,today)?'Recovery review':lifts.length<6?'Re-establish consistency':'Build strength',due:overdue,nextReview:add(FROM,(Math.floor(Math.max(0,span(FROM,today))/28)+1)*28),why:fatigue(rows,today)?'Recent hard effort calls for fewer sets, not a bigger target.':lifts.length<6?'Keep the first sessions repeatable. Establish recent working loads before increasing volume.':'Repeat the same core movements so changes in reps and load are comparable.'};
 }
 window.strydeFoundation={FROM,ID,TYPES,NAMES,IDS,REASONS,valid,add,span,weekday,active,kind,migrate,plan,runDose,exerciseTarget,prescription,build,options,review,checkFor,muscles,safetyAdjust};
})();

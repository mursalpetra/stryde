/* Conservative, deterministic replanning from recorded activity.
 * Derived recommendations only: never rewrites original plans, goals or logs.
 * Recovery spacing is a planning heuristic, not medical clearance or a readiness score.
 */
(() => {
  'use strict';
  const P = window.strydeProgressModel;
  const VERSION = 1, START = '2026-10-05', END = '2026-12-20';
  const TYPES = ['recovery','easy','lower','recovery','easy','upper','long'];
  const names = {recovery:'Recovery',rest:'Rest & gentle movement',easy:'Short easy run / walk',long:'Long easy run',lower:'Glutes & hamstrings',upper:'Back, shoulders & arms',race:'Race milestone',completed:'Activity recorded',started:'Continue saved workout'};
  const kind = type => ['upper','lower'].includes(type)?'strength':['easy','long'].includes(type)?'run':'recovery';
  const keyFor = date => {const n=P.days(START,date);return `${Math.floor(n/7)+1}-${((n%7)+7)%7}`;};
  const weekStart = date => P.add(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));
  const base = date => TYPES[((P.days(START,date)%7)+7)%7];
  function muscleGroups(row) {
    if(row.kind==='run')return ['lower'];
    if(row.kind!=='strength')return [];
    const groups=new Set();
    for(const [id,entry] of Object.entries(row.exercises||{})){
      const info=P.exerciseInfo(id,entry);const muscles=[...(entry.muscles||[]),...(info?.muscles||[])].join(' ').toLowerCase();
      if(/glute|hamstring|quadricep|calf|calves|leg/.test(muscles))groups.add('lower');
      if(/back|lat|bicep|tricep|shoulder|chest|arm/.test(muscles))groups.add('upper');
      // Unknown/custom movements are not assumed to leave either region recovered.
      if(!muscles||!info) {groups.add('upper');groups.add('lower');}
    }
    if(!groups.size){groups.add('upper');groups.add('lower');}
    return [...groups];
  }
  function actuals(rows,today){
    const seen=new Set();return (rows||[]).filter(r=>P.validDate(r.date)&&r.date<=today&&['strength','run','walk','other'].includes(r.kind)&&!seen.has(r.id)&&seen.add(r.id)).map(r=>({...r,groups:muscleGroups(r)}));
  }
  function day(type,date,reason='',extra={}) {
    return {date,type,name:names[type],kind:kind(type),ids:type==='upper'?[4,5,6,7]:type==='lower'?[0,1,3]:[],minutes:type==='upper'||type==='lower'?30:type==='easy'?20:0,km:null,reason,originalType:base(date),...extra};
  }
  function activity(type,date){return {date,kind:kind(type),groups:type==='upper'?['upper']:type==='lower'||['easy','long'].includes(type)?['lower']:[],planned:true};}
  function compatible(type,date,occupied) {
    const candidate=activity(type,date);
    if(occupied.some(r=>r.date===date))return false;
    const near=occupied.filter(r=>Math.abs(P.days(r.date,date))<2);
    if(near.some(r=>r.groups.some(g=>candidate.groups.includes(g))))return false;
    // A hard/long actual session gets a clear recovery day regardless of next muscle focus.
    if(near.some(r=>r.kind==='run'&&(Number(r.rpe)>=7||Number(r.minutes)>=60)))return false;
    const dates=new Set([...occupied.map(r=>r.date),date]);
    const start=weekStart(date);
    if([...dates].filter(d=>d>=start&&d<=P.add(start,6)).length>5)return false;
    // Also enforce rolling rest across Sunday/Monday boundaries.
    for(let offset=-6;offset<=0;offset++){
      const from=P.add(date,offset),to=P.add(from,6);
      if([...dates].filter(d=>d>=from&&d<=to).length>5)return false;
    }
    for(let offset=-3;offset<=0;offset++)if([0,1,2,3].every(n=>dates.has(P.add(date,offset+n))))return false;
    return true;
  }
  function readiness(s,today,check) {
    const r=s.coaching?.recovery?.[today]||{},c=check||s.adaptiveSchedule?.checkins?.[today]||{};
    const rawComfort=c.comfort||r.comfort||'unknown';
    const comfort=['comfortable','sore','pain'].includes(rawComfort)?rawComfort:'unknown';
    const rawEnergy=P.n(c.energy)??P.n(r.energy),energy=rawEnergy>=1&&rawEnergy<=5?rawEnergy:null;
    return {...c,comfort,energy,soreness:c.soreness||'none',minutes:P.n(c.minutes)>=10&&P.n(c.minutes)<=90?P.n(c.minutes):null,historyComplete:c.historyComplete===true,rest:r.rest===true||c.restChosen===true};
  }
  function blocked(type,c) {
    if(c.rest||c.comfort==='pain'||c.comfort==='sore'||(c.energy!==null&&c.energy<=2))return true;
    if(c.soreness==='both')return true;
    return c.soreness==='lower'&&type!=='upper'||c.soreness==='upper'&&type==='upper';
  }
  function longest(rows,today){const runs=rows.filter(r=>r.kind==='run'&&r.date>=P.add(today,-28)&&Number(r.distance)>0);return {runs,max:runs.length?Math.max(...runs.map(r=>Number(r.distance))):null};}
  function runDose(type,date,rows,today){
    const {runs,max}=longest(rows,today),week=Math.floor(P.days(START,date)/7),baseline=typeof WEEKS!=='undefined'?WEEKS[week]:null;
    if(type==='long'&&runs.length>=2&&max>=4){const km=Math.min(max,baseline?.[2]||max);return {km,minutes:null,reason:'Distance held at or below your longest recorded run in the last 28 days. No calendar-based distance jump.'};}
    const km=max?Math.min(max,baseline?.[0]||3):null;
    return {km,minutes:20,reason:type==='long'?'Long-run progression is on hold until recent recorded running supports it. Choose a short, comfortable run/walk instead.':'Keep a conversational effort. Walk breaks are welcome; duration is a ceiling, not a target to force.'};
  }
  function build(s={},rows=[],today=P.iso()) {
    const days={},changes=[],warnings=[];
    if(!P.validDate(today))return {days,changes,warnings:['Today’s date is unavailable.']};
    const actual=actuals(rows,today),occupied=actual.slice(),check=readiness(s,today);
    const race=(s.milestones||[]).find(m=>m.status==='active'&&m.kind==='race'&&P.validDate(m.date));
    const activeAdaptive=s.adaptiveSchedule?.activeSession?.status==='in_progress'?s.adaptiveSchedule.activeSession:null;
    const activeLegacy=Object.entries(s.logs||{}).find(([,l])=>l.status!=='done'&&(l.status==='in_progress'||['running','paused'].includes(l.timing?.state)));
    const from=today<START?START:today;if(from>END)return {days,changes,warnings:['The original training block has ended. Review your next block; no race readiness is assumed.']};
    for(let d=from;d<=END;d=P.add(d,1)){
      days[d]=day('recovery',d,'Recovery space is protected. Missed sessions are not carried forward.');
      const log=s.logs?.[keyFor(d)],done=actual.filter(r=>r.date===d);
      if(done.length)days[d]=day('completed',d,'Recorded activity is preserved; the remaining plan adapts around it.',{activities:done,kind:done[0].kind});
      else if(log&&(log.status==='in_progress'||log.timing||log.started_at||Object.keys(log.exercises||{}).length)){
        days[d]=day('started',d,'The saved session and its prescription stay unchanged. Finish or review it before selecting another workout.',{legacyKey:keyFor(d)});
        const groups=muscleGroups({kind:['easy','long'].includes(base(d))?'run':'strength',exercises:log.exercises});occupied.push({date:d,kind:'strength',groups});
      }
      if(race?.date===d&&!done.length&&days[d].type!=='started')days[d]=day('race',d,'Your race date stays fixed. This is a goal, not confirmation that you are ready; review training and symptoms before racing.');
    }
    if(activeAdaptive){
      const target=days[activeAdaptive.date]?activeAdaptive.date:today;
      if(days[target])days[target]=day('started',target,'Continue or review the saved workout. Its prescription and entered sets remain unchanged.',{adaptiveId:activeAdaptive.id});
      if(target!==today&&days[today])days[today]=day('started',today,'Finish or review your unfinished workout before starting another.',{adaptiveId:activeAdaptive.id});
      const ids=activeAdaptive.choice?.ids||[],exercises=Object.fromEntries(ids.map(id=>[id,{}]));
      const type=activeAdaptive.choice?.type;
      occupied.push({date:target,kind:kind(type),groups:muscleGroups({kind:kind(type),exercises})});
    }
    if(activeLegacy&&days[today]?.type!=='completed')days[today]=day('started',today,'Finish or review the saved workout before starting another.',{legacyKey:activeLegacy[0]});
    for(let start=weekStart(from);start<=END;start=P.add(start,7)){
      const end=P.add(start,6),recorded=actual.filter(r=>r.date>=start&&r.date<=end);
      const priorWeekDays=new Set(actual.filter(r=>r.date>=P.add(start,-7)&&r.date<start).map(r=>r.date)).size;
      // A confirmed quiet week gets a smaller restart week, not the entire missed quota.
      const restart=start===weekStart(today)&&check.historyComplete&&priorWeekDays<=2;
      const weekCap=restart?3:5;
      if(restart)warnings.push('A lighter restart week is limited to three training days after the quiet week you confirmed. Unused sessions are dropped, not made up.');
      const count={run:recorded.filter(r=>r.kind==='run').length,upper:0,lower:0};
      for(const d of Object.keys(days).filter(d=>d>=start&&d<=end&&days[d].type==='started')){const legacyDay=Number(days[d].legacyKey?.split('-')[1]),t=days[d].adaptiveId?activeAdaptive?.choice?.type:TYPES[legacyDay]||base(d);if(['easy','long'].includes(t))count.run++;else if(t==='upper'||t==='lower')count[t]++;}
      for(const r of recorded.filter(r=>r.kind==='strength'))for(const g of r.groups)count[g]++;
      const candidates=[];
      if(count.run<3)candidates.push({type:'long',preferred:P.add(start,6)});
      if(!count.lower)candidates.push({type:'lower',preferred:P.add(start,2)});
      if(!count.upper)candidates.push({type:'upper',preferred:P.add(start,5)});
      for(let n=count.run;n<2;n++)candidates.push({type:'easy',preferred:P.add(start,n===0?1:4)});
      for(const candidate of candidates){
        const type=candidate.type;
        const dates=Object.keys(days).filter(d=>d>=start&&d<=end&&days[d].type==='recovery'&&d>=today)
          .filter(d=>!(d===today&&base(d)==='recovery')) // Keep today's planned rest until the user chooses.
          .filter(d=>!(d===today&&blocked(type,check)))
          .filter(d=>!(race&&P.days(d,race.date)>=0&&P.days(d,race.date)<=2))
          .sort((a,b)=>Math.abs(P.days(a,candidate.preferred))-Math.abs(P.days(b,candidate.preferred))||a.localeCompare(b));
        const trainingDays=new Set(occupied.filter(r=>r.date>=start&&r.date<=end).map(r=>r.date)).size;
        const date=trainingDays<weekCap?dates.find(d=>compatible(type,d,occupied)):null;
        if(!date)continue; // Drop work that does not fit; never spill a missed quota into another week.
        const dose=['easy','long'].includes(type)?runDose(type,date,actual,today):{};
        const effective=type==='long'&&dose.minutes===20?'easy':type;
        days[date]=day(effective,date,dose.reason||'Muscle recovery and completed sessions determine this slot.',dose);
        occupied.push(activity(type,date));
      }
    }
    for(const item of Object.values(days))if(!['completed','started','race'].includes(item.type)&&item.type!==item.originalType)changes.push({date:item.date,from:names[item.originalType],to:item.name,reason:item.reason});
    warnings.push('Based on available workout logs, not proof of what happened on unlogged days. Sync Strava and record missing activity before relying on the plan.');
    if(longest(actual,today).runs.length<2)warnings.push('Recent running history is limited. Long-run progression is held; the race date does not override recovery.');
    if(check.comfort==='pain')warnings.push('Pause exercise for pain or concerning symptoms and seek appropriate advice.');
    return {days,changes,warnings};
  }
  function options(s={},rows=[],today=P.iso(),input) {
    const c=readiness(s,today,input),actual=actuals(rows,today),rest=day('rest',today,'Rest is a successful choice. No missed training needs to be made up.',{id:'rest'}),choices=[rest],warnings=[];
    if(c.comfort!=='comfortable'||c.energy===null||c.minutes===null||c.minutes<10||!c.historyComplete||c.rest){
      return {choices,reason:c.comfort==='pain'?'Pause exercise for pain or other symptoms. Seek appropriate advice before resuming.':!c.historyComplete?'Sync or add missing workouts, then confirm your recent activity so the recommendation does not repeat an unknown muscle load.':'Rest or gentle comfortable movement today; a short readiness check is needed before an exercise option.',warnings};
    }
    if(c.energy<=2||c.soreness==='both')return {choices,reason:'Low energy or widespread soreness calls for recovery today.',warnings};
    if(actual.some(r=>r.date===today))return {choices,reason:'You already have activity recorded today. Recover and let the remaining week adapt.',warnings};
    const race=(s.milestones||[]).find(m=>m.status==='active'&&m.kind==='race'&&P.validDate(m.date));
    if(race&&P.days(today,race.date)>=0&&P.days(today,race.date)<=2)return {choices,reason:'Protect the final recovery days and keep the race date fixed. Review readiness and your race plan rather than adding a new workout.',warnings};
    const planned=build(s,rows,today).days[today];
    if(planned?.type==='started')return {choices,reason:'Continue or review the session already in progress before choosing another.',warnings};
    const start=weekStart(today),priorDays=new Set(actual.filter(r=>r.date>=P.add(start,-7)&&r.date<start).map(r=>r.date)).size;
    const currentDays=new Set(actual.filter(r=>r.date>=start&&r.date<=today).map(r=>r.date)).size;
    if(c.historyComplete&&priorDays<=2&&currentDays>=3)return {choices,reason:'Your lighter restart week already has three training days. Keep the remaining recovery space.',warnings};
    if(planned?.type==='long'&&!blocked('long',c)&&compatible('long',today,actual)){
      const previous=longest(actual,today).runs.filter(r=>Number(r.distance)>=Number(planned.km)&&Number(r.minutes)>0);
      const duration=previous.length?Math.min(c.minutes,90,Math.max(...previous.map(r=>Number(r.minutes)))):20;
      if(duration>=30)choices.push({...planned,id:'long',location:'outdoors',minutes:duration,recommended:true,reason:'Your current long-run slot, held to recent recorded distance and duration. Stop at the distance or time ceiling, whichever comes first; shorten or walk as needed.'});
    }
    const order=['upper','lower'].sort((a,b)=>{
      const last=g=>actual.filter(r=>r.groups.includes(g)).at(-1)?.date||'0000-00-00';return last(a).localeCompare(last(b));
    });
    for(const type of [...order,'easy']){
      if(blocked(type,c)||!compatible(type,today,actual))continue;
      const minutes=Math.min(c.minutes,type==='easy'?20:35),ids=type==='upper'?[4,5,6,7]:type==='lower'?[0,1,3]:[];
      if(minutes<20&&type!=='easy')continue;
      choices.push(day(type,today,type==='easy'?'Short and conversational, preferably outdoors when conditions are suitable. Walk breaks are welcome.':'This muscle focus has available recovery based on recorded activity. Keep a few clean repetitions in reserve.',{id:type,minutes,ids:minutes<30?ids.slice(0,2):ids,km:null,location:type==='easy'?'outdoors':'indoors',recommended:type===order[0]}));
    }
    return {choices,reason:'Choose one option. Only saving what you actually completed changes the remaining training balance. No catch-up workload.',warnings};
  }
  window.strydeScheduleModel={VERSION,START,END,build,options,muscleGroups,compatible,readiness,keyFor,weekStart};
})();

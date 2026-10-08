/* STRYDE transparent progress model. No health scores, invented PRs, or calorie targets. */
(() => {
 'use strict';
 const TZ='Asia/Shanghai';
 const n=v=>v!==''&&v!=null&&Number.isFinite(Number(v))?Number(v):null;
 const iso=v=>{try{return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v??Date.now()));}catch{return ''}};
 const validDate=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;};
 const add=(s,d)=>{if(!validDate(s))return '';const a=new Date(s+'T12:00:00Z');a.setUTCDate(a.getUTCDate()+d);return a.toISOString().slice(0,10)};
 const days=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
 const median=a=>{if(!a.length)return null;const v=a.slice().sort((a,b)=>a-b),i=Math.floor(v.length/2);return v.length%2?v[i]:(v[i-1]+v[i])/2};
 const pct=(a,b)=>a>0?(b/a-1)*100:null;
 const text=v=>String(v??'').trim();
 const unit=s=>/per hand|each hand/.test(s||'')?'lbs per hand':/^(lb|lbs|lb total|lbs total)$/.test(s||'')?'lbs':s||'unrecorded';
 const reps=e=>String(e?.reps||'').split(',').map(x=>n(x.trim())).filter(x=>x!==null&&x>0&&x<=100);
 function logDate(key,l){
  if(validDate(l.performed_on))return l.performed_on;
  const t=l.timing?.started_at||l.started_at;if(t&&Number.isFinite(Date.parse(t)))return iso(t);
  const m=/^(\d+)-([0-6])$/.exec(key);if(!m)return '';
  const d=dateFor(Number(m[1]),Number(m[2]));return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 }
 function records(s=state,imported=[]){
  const today=iso(),out=[],seen=new Set(),links=s.runDuplicateLinks||{};
  for(const a of imported){
   const id=text(a.activity_id),date=iso(a.started_at),km=n(a.distance_m)/1000;
   if(!/^\d+$/.test(id)||seen.has(id)||!date||date>today||!(km>0))continue;
   seen.add(id);out.push({id:'strava:'+id,stravaId:id,date,kind:'run',source:'Strava',name:a.name||'Run',distance:km,minutes:n(a.elapsed_time_seconds)>0?n(a.elapsed_time_seconds)/60:null,moving:n(a.moving_time_seconds)>0?n(a.moving_time_seconds)/60:null,elevation:n(a.elevation_m),type:a.activity_type||'Run',rpe:null,started_at:a.started_at});
  }
  function addRecord(r){if(!validDate(r.date)||r.date>today)return;if(r.kind==='run'&&((r.stravaId&&seen.has(String(r.stravaId)))||(links[r.id]&&seen.has(String(links[r.id])))))return;out.push(r)}
  for(const [k,l] of Object.entries(s.logs||{})){
   if(l?.status!=='done')continue;const date=logDate(k,l),d=Number(k.split('-')[1]),ex=l.exercises||{};
   const kind=l.session_type==='run'||[1,4,6].includes(d)?'run':Object.keys(ex).length||[2,5].includes(d)?'strength':'recovery';
   if(kind==='recovery')continue;
   const distance=n(l.actual),minutes=n(l.elapsed_seconds)>0?n(l.elapsed_seconds)/60:n(l.minutes);
   if(kind==='run'&&!(distance>0))continue;
   if(kind==='strength'&&!Object.keys(ex).some(i=>n(ex[i].weight)>0&&reps(ex[i]).length)&&!(minutes>0))continue;
   addRecord({id:'plan:'+k,date,plannedKey:k,kind,source:'Workout log',name:nameFor(d),distance,minutes,moving:n(l.moving_time_seconds)>0?n(l.moving_time_seconds)/60:null,rpe:n(l.effort),terrain:l.terrain||'',elevation:n(l.elevation_m),type:l.activity_type||'Run',exercises:ex,stravaId:l.strava_activity_id||null,dateInferred:!l.performed_on&&!l.started_at&&!l.timing?.started_at});
  }
  for(const l of s.extraWorkouts||[]){if(l.deleted||l.status!=='done')continue;addRecord({id:'extra:'+l.id,date:l.date,kind:l.kind,source:'Extra workout',name:l.name||l.kind,distance:n(l.distanceKm),minutes:n(l.durationMinutes),moving:n(l.movingMinutes),rpe:n(l.rpe),terrain:l.terrain||'',elevation:n(l.elevationM),type:l.terrain==='treadmill'?'VirtualRun':l.terrain==='trail'?'TrailRun':'Run',exercises:l.exercises||{},stravaId:l.stravaActivityId||null});}
  return out.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 }
 function period(month=iso().slice(0,7)){
  const start=month+'-01';if(!validDate(start))return period();const dt=new Date(start+'T12:00:00Z');dt.setUTCMonth(dt.getUTCMonth()+1);const last=add(dt.toISOString().slice(0,10),-1);return {month,start,end:last<iso()?last:iso(),last};
 }
 function liftChanges(rows,p){
  const by=new Map();
  for(const r of rows.filter(r=>r.kind==='strength'&&r.date>=p.start&&r.date<=p.end))for(const [i,e] of Object.entries(r.exercises||{})){
   if(!EX[Number(i)]||e.form!=='good'||!['easy','moderate'].includes(e.effort)||!(n(e.weight)>0))continue;
   const rr=reps(e);if(!rr.length||rr.length!==String(e.reps).split(',').length||rr.some(x=>x>20))continue;
   const u=unit(e.unit);if(u==='machine display'||u==='unrecorded')continue;
   const group=[i,u,rr.length,e.effort,text(e.setup||e.equipment).toLowerCase()].join('|');
   if(!by.has(group))by.set(group,[]);by.get(group).push({id:r.id,date:r.date,i:Number(i),weight:n(e.weight),reps:rr.reduce((a,b)=>a+b,0)/rr.length,sets:rr.length,unit:u,setup:e.setup||e.equipment||'',effort:e.effort});
  }
  const result=[];
  for(const a of by.values()){
   const first=a[0],last=a[a.length-1];if(a.length<2||days(first.date,last.date)<1)continue;
   result.push({i:first.i,name:EX[first.i].name,first,last,sessions:a.length,load:pct(first.weight,last.weight),rep:pct(first.reps,last.reps),output:pct(first.weight*first.reps,last.weight*last.reps),setupUnknown:!first.setup});
  }
  // One comparison per exercise. Most observations, then longest time span; never cherry-pick the biggest gain.
  const each=new Map();for(const r of result){const prev=each.get(r.i);if(!prev||r.sessions>prev.sessions||(r.sessions===prev.sessions&&days(r.first.date,r.last.date)>days(prev.first.date,prev.last.date)))each.set(r.i,r)}
  return [...each.values()].sort((a,b)=>b.output-a.output);
 }
 function runChange(runs){
  for(let b=runs.length-1;b>0;b--)for(let a=0;a<b;a++){
   const x=runs[a],y=runs[b];if(x.date===y.date||Math.max(x.distance,y.distance)/Math.min(x.distance,y.distance)>1.10||x.type!==y.type)continue;
   if(x.terrain&&y.terrain&&x.terrain!==y.terrain)continue;
   if(x.rpe!==null&&y.rpe!==null&&Math.abs(x.rpe-y.rpe)>1)continue;
   if(x.elevation!==null&&y.elevation!==null&&Math.abs(x.elevation/x.distance-y.elevation/y.distance)>5)continue;
   const moving=x.moving>0&&y.moving>0;const xT=moving?x.moving:x.minutes,yT=moving?y.moving:y.minutes;
   if(!(xT>0&&yT>0))continue;const old=xT/x.distance,newP=yT/y.distance;
   return {first:x,last:y,basis:moving?'moving':'elapsed',oldPace:old,newPace:newP,change:(old-newP)/old*100,limited:true};
  }return null;
 }
 function duplicates(rows){const saved=rows.filter(r=>r.kind==='run'&&r.source==='Strava'),manual=rows.filter(r=>r.kind==='run'&&r.source!=='Strava');return manual.flatMap(m=>saved.filter(s=>s.date===m.date&&Math.abs(s.distance-m.distance)/s.distance<.05&&s.minutes>0&&m.minutes>0&&Math.abs(s.minutes-m.minutes)/s.minutes<.15).map(s=>({manual:m,imported:s})));}
 function analyze(rows,p){
  const inRange=rows.filter(r=>r.date>=p.start&&r.date<=p.end),runs=inRange.filter(r=>r.kind==='run'),lifts=inRange.filter(r=>r.kind==='strength');
  const changes=liftChanges(rows,p),loadWinner=changes.filter(r=>r.load>0&&r.last.reps>=r.first.reps).sort((a,b)=>b.load-a.load)[0]||null;
  return {rows:inRange,runs,lifts,runCount:runs.length,liftCount:lifts.length,km:runs.reduce((s,r)=>s+(r.distance||0),0),minutes:inRange.reduce((s,r)=>s+(r.minutes||0),0),changes,loadWinner,performance:changes.length>=2?median(changes.map(r=>r.output)):null,runTrend:runChange(runs),duplicates:duplicates(inRange)};
 }
 function planOn(date){if(!validDate(date))return null;const offset=days('2026-10-05',date);if(offset<0||offset>=77)return null;const d=offset%7;return {week:Math.floor(offset/7)+1,day:d,kind:[1,4,6].includes(d)?'run':[2,5].includes(d)?'strength':'recovery',name:nameFor(d)};}
 function dayStatus(date,rows){const a=rows.filter(r=>r.date===date),plan=planOn(date);if(a.length)return {code:'done',label:a.length+' activity recorded',activities:a,plan};if(date>iso())return {code:'future',label:plan?.name||'No plan',plan};if(plan?.kind==='recovery')return {code:'rest',label:'Recovery day',plan};if(plan&&date<iso())return {code:'unlogged',label:'Planned workout — no completion logged',plan};return {code:'pending',label:plan?.name||'No scheduled workout',plan};}
 function due(s=state){const settings=s.bodyCheckSettings||{},checks=(s.bodyChecks||[]).filter(c=>validDate(c.date)&&c.date<=iso()&&n(c.kg)>0).sort((a,b)=>a.date.localeCompare(b.date));const last=checks.at(-1),interval=[7,14,28].includes(Number(settings.cadenceDays))?Number(settings.cadenceDays):7;const next=last?add(last.date,interval):iso();return {last,checks,next,enabled:settings.reminders!==false,isDue:settings.reminders!==false&&next<=iso()&&(!validDate(settings.snoozeUntil)||settings.snoozeUntil<=iso()),interval};}
 window.strydeProgressModel={TZ,n,iso,validDate,add,days,median,pct,unit,reps,logDate,records,period,liftChanges,runChange,analyze,planOn,dayStatus,due};
})();

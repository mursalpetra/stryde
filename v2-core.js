const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],START=new Date(2026,9,5,12),RACE='2026-12-20';
const WEEKS=[[3,3,5],[3,3,6],[3,4,7],[3,3,6],[4,4,8],[4,4,9],[4,4,10],[4,5,12],[4,5,14],[3,4,10],[3,3,21.1]];
const EX=[
['Romanian Deadlift (RDL)',3,10,0,'lb per hand','Glutes,Hamstrings','Hinge at your hips, keep dumbbells close and maintain a neutral spine.','DBRomanianDeadlift','416717'],
['Hip Thrust',2,10,15,'lb total','Glutes,Core','Keep ribs down and squeeze glutes at the top. Trial load only.','BBHipThrust','841130'],
['Leg Press',2,12,0,'machine display','Quadriceps,Glutes','Keep hips supported and move through a comfortable range.','SL45LegPress','1552242'],
['Leg Curl',2,12,0,'machine display','Hamstrings','Control the lowering phase.','LVSeatedLegCurl','2261485'],
['Lat Pulldown',2,10,15,'machine display','Lats,Biceps','Draw elbows toward your ribs without swinging.','CBFrontPulldown','1552106'],
['Seated Row',2,12,0,'machine display','Back,Biceps','Keep your chest steady and pull elbows back.','CBSeatedRow','1552252'],
['Shoulder Press',2,10,10,'machine display','Shoulders,Triceps','Handles near shoulder height; avoid shrugging.','LVShoulderPress','136405'],
['Chest Press',2,10,0,'machine display','Chest,Triceps','Handles near mid-chest, press smoothly.','LVChestPress','1552249']
].map((v,i)=>({name:v[0],sets:v[1],reps:v[2],trial:v[3],unit:v[4],muscles:v[5].split(','),cue:v[6],url:'https://exrx.net/WeightExercises/'+(['Hamstrings','GluteusMaximus','Quadriceps','Hamstrings','LatissimusDorsi','BackGeneral','DeltoidAnterior','PectoralSternal'][i])+'/'+v[7],image:null,photoStatus:'unverified'}));
let state=JSON.parse(localStorage.getItem('stryde-v1')||'null')||{week:1,logs:{},profile:{}};
function normalize(){state.logs=state.logs||{};state.profile=state.profile||{};state.approvedLoads=state.approvedLoads||{};state.milestones=state.milestones||[];window.strydeFoundation?.migrate(state);}
normalize();
// Navigation is transient: every fresh launch opens the current Shenzhen date.
function trainingCalendarToday(at = new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const date=`${parts.year}-${parts.month}-${parts.day}`,utc=Date.UTC(+parts.year,+parts.month-1,+parts.day);
  const week=Math.floor((utc-Date.UTC(2026,9,5))/604800000)+1;
  return {date,week,day:(new Date(utc).getUTCDay()+6)%7,inPlan:week>=1&&(week<=WEEKS.length||Boolean(window.strydeFoundation?.active(date)))};
}
function trainingLastWeek(){return window.strydeFoundation?Math.max(WEEKS.length,trainingCalendarToday().week+8):WEEKS.length;}
let now,actualWeek;
function refreshCalendarClock(){const t=trainingCalendarToday();now=new Date(t.date+'T12:00:00');actualWeek=t.week;return t;}
const launchDay=refreshCalendarClock();
if(launchDay.inPlan){state.week=launchDay.week;state.selectedDay=launchDay.day}
state.lastSeenV2=true;state.week=Math.max(1,Math.min(trainingLastWeek(),Number(state.week)||1));
let view='today',sessionTab='workout',muscleSide='both',selectedExercise=null,sessionDay=null;
const root=document.getElementById('root'),nav=document.getElementById('nav');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const save=()=>{localStorage.setItem('stryde-v1',JSON.stringify(state));window.strydeCloudSave?.(state)};
const dateFor=(w,d)=>new Date(2026,9,5+(w-1)*7+d,12),key=(d,w=state.week)=>w+'-'+d,log=d=>state.logs[key(d)]||{};
// Availability change is date-effective; historical plans and actual logs are never rewritten.
const TRAINING_AVAILABILITY_FROM='2026-11-09';
function trainingPlanFor(w,d){
 const dt=new Date(Date.UTC(2026,9,5+(Number(w)-1)*7+Number(d))),date=dt.toISOString().slice(0,10);
 const foundation=window.strydeFoundation?.plan(date);if(foundation)return foundation;
 const updated=date>=TRAINING_AVAILABILITY_FROM;
 const types=updated?['easy','recovery','lower','easy','recovery','upper','long']:['recovery','easy','lower','recovery','easy','upper','long'];
 const type=types[d],kind=['easy','long'].includes(type)?'run':['lower','upper'].includes(type)?'strength':'recovery';
 const runIndex=type==='long'?2:type==='easy'?(d===(updated?0:1)?0:1):null;
 return {date,week:Number(w),day:Number(d),type,kind,name:{easy:'Easy Run',long:'Long Run',lower:'Glutes & Legs',upper:'Back, Shoulders & Arms',recovery:'Recovery'}[type]||'Recovery',ids:type==='lower'?[0,1,2,3]:type==='upper'?[4,5,6,7]:[],km:runIndex===null?null:WEEKS[w-1]?.[runIndex]??null,runIndex,protectedRecovery:updated&&[1,4].includes(Number(d))};
}
function trainingPlanOn(date){
 const days=Math.round((Date.parse(date+'T12:00:00Z')-Date.parse('2026-10-05T12:00:00Z'))/86400000);
 return trainingPlanFor(Math.floor(days/7)+1,((days%7)+7)%7);
}
function sessionKindFor(d,w=state.week){
 const entry=state.logs?.[key(d,w)];
 if(entry&&(entry.status==='done'||entry.status==='in_progress'||entry.timing||entry.prescriptionSnapshot)){
  if(['run','strength'].includes(entry.session_type))return entry.session_type;
  if(Object.keys(entry.exercises||{}).length)return 'strength';
  if(Number(entry.actual)>0)return 'run';
 }
 return trainingPlanFor(w,d).kind;
}
const nameFor=(d,w=state.week)=>trainingPlanFor(w,d).name,isGym=(d,w=state.week)=>sessionKindFor(d,w)==='strength',idsFor=(d,w=state.week)=>{const l=state.logs?.[key(d,w)],snap=l?.prescriptionSnapshot?.exercises;if(snap&&!Array.isArray(snap))return Object.keys(snap).filter(i=>/^\d+$/.test(i)&&EX[Number(i)]).map(Number);if(l&&(l.status==='done'||l.status==='in_progress'||l.timing||l.started_at))return d===2?[0,1,2,3]:d===5?[4,5,6,7]:Object.keys(l.exercises||{}).map(Number).filter(i=>EX[i]);return trainingPlanFor(w,d).ids;};
const fmt=d=>d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
function history(i){return Object.entries(state.logs).filter(([k,v])=>v.status==='done'&&v.exercises?.[i]&&Number(v.exercises[i].weight)>0).map(([k,v])=>({week:Number(k.split('-')[0]),day:Number(k.split('-')[1]),...v.exercises[i]})).sort((a,b)=>b.week-a.week||b.day-a.day)}
function lastLift(i){return history(i)[0]||null}
function target(i){let e=EX[i],p=lastLift(i),approved=state.approvedLoads[i];if(approved&&(!p||Number(approved.weight)>Number(p.weight)))return {weight:approved.weight,reps:Math.max(8,e.reps-2),why:'You approved a heavier trial. Warm up first; return to your previous weight if technique changes.',label:'Approved trial'};
if(!p)return {weight:e.trial||'',reps:e.reps,why:'No confirmed recent working weight. Calibrate a load with 2–3 reps left in reserve.',label:'Calibrate'};

let reps=String(p.reps||'').split(',').map(Number),full=reps.length>=e.sets&&reps.slice(0,e.sets).every(n=>n>0),min=full?Math.min(...reps.slice(0,e.sets)):0;
if(!full)return {weight:p.weight,reps:e.reps,why:'Your last set log is incomplete. Repeat the weight and log each set.',label:'Repeat'};
if(p.effort==='hard'||p.form==='unsure'||min<e.reps-2)return {weight:p.weight,reps:Math.max(e.reps-2,min),why:'Technique or effort calls for a controlled repeat; reduce load if needed.',label:'Technique first'};
if(min>=e.reps+2)return {weight:p.weight,reps:e.reps+2,why:'Top-range reps reached. You can review a small increase after confirming form.',label:'Review progression'};
return {weight:p.weight,reps:Math.min(e.reps+2,Math.max(e.reps,min+1)),why:'Build reps at the same weight. Do not increase automatically.',label:'Build reps'};}
function muscleTags(d){return [...new Set(idsFor(d).flatMap(i=>EX[i]?.muscles||[]))].map(x=>'<span class="tag">'+esc(x)+'</span>').join('')}
function anatomy(side,d){const lower=d===2,active=n=>(lower?['glutes','quads','hams']:['back','shoulders','arms']).includes(n)?'#f65a26':'#d6bfb4';return '<svg viewBox="0 0 150 300" role="img" aria-label="Illustrated female muscle anatomy '+side+'"><path d="M69 32 Q59 28 57 17 Q56 5 74 4 Q93 5 92 18 Q90 28 82 32 L81 40 Q102 38 111 52 Q118 64 122 91 L130 135 Q133 147 126 150 Q119 150 116 139 L105 105 L104 91 Q102 110 103 131 Q111 154 100 179 L94 223 L91 285 Q86 297 77 289 L75 227 L71 188 L66 226 L64 288 Q55 298 51 287 L48 224 L42 180 Q34 158 42 132 Q45 113 43 91 L34 108 L29 143 Q25 152 18 147 Q12 144 17 132 L28 82 Q30 49 47 42 L67 39Z" fill="#eddfd5" stroke="#b69a8b" stroke-width="1.4"/>'+(side==='front'?'<path d="M45 53 Q57 43 73 58 L70 84 Q52 88 44 72Z M104 53 Q91 43 76 58 L79 84 Q97 88 104 72Z" fill="'+active('back')+'"/><path d="M44 148 Q56 142 70 158 L65 217 Q48 216 46 183Z M79 158 Q95 142 105 148 L102 184 Q100 216 83 217Z" fill="'+active('quads')+'"/><path d="M30 65 L24 121 M119 65 L125 121" stroke="'+active('arms')+'" stroke-width="12" stroke-linecap="round"/>':'<path d="M44 50 Q72 43 75 58 Q81 44 104 50 L102 107 Q82 117 75 130 Q65 116 46 107Z" fill="'+active('back')+'"/><path d="M43 143 Q55 133 74 151 Q93 133 106 143 L105 171 Q92 185 76 174 Q55 185 44 171Z" fill="'+active('glutes')+'"/><path d="M44 179 Q55 178 68 180 L65 222 L49 222Z M82 180 Q96 177 105 179 L99 222 L83 222Z" fill="'+active('hams')+'"/><path d="M32 68 L25 118 M117 68 L125 118" stroke="'+active('arms')+'" stroke-width="12" stroke-linecap="round"/>')+'<path d="M43 58 Q48 47 63 47 M107 58 Q102 47 87 47" fill="none" stroke="'+active('shoulders')+'" stroke-width="10" stroke-linecap="round"/><g stroke="#bda396" stroke-width="1" fill="none"><path d="M75 54 L75 132 M51 86 L69 92 M99 86 L81 92 M52 162 L65 201 M98 162 L85 201 M55 222 L50 276 M95 222 L100 276"/></g><text x="75" y="299" text-anchor="middle" font-size="10" fill="#777">'+side.toUpperCase()+'</text></svg>'}


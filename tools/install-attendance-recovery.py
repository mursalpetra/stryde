"""Install the tested attendance/recovery integration; never touch private workout data."""
from pathlib import Path
import re, hashlib
B=Path('.')
changes={}
def patch(file,old,new,count=1):
 s=(B/file).read_text(); n=s.count(old)
 if n!=count: raise RuntimeError(f'{file}: expected {count} exact markers, found {n}')
 (B/file).write_text(s.replace(old,new));changes.setdefault(file,[]).append((old,new))
patch('v2-core.js',"const nameFor=d=>['Recovery','Easy Run','Glutes & Legs','Recovery','Easy Run','Back, Shoulders & Arms','Long Run'][d],isGym=d=>d===2||d===5,idsFor=d=>d===2?[0,1,2,3]:d===5?[4,5,6,7]:[];",'''function sessionPlan(d,w=state.week){
 const dt=dateFor(w,d),date=[dt.getFullYear(),String(dt.getMonth()+1).padStart(2,'0'),String(dt.getDate()).padStart(2,'0')].join('-');
 return window.strydeTrainingData?.plan(date)||{date,type:['recovery','easy','lower','recovery','easy','upper','long'][d],name:['Recovery','Easy Run','Glutes & Legs','Recovery','Easy Run','Back, Shoulders & Arms','Long Run'][d],kind:[1,4,6].includes(d)?'run':[2,5].includes(d)?'strength':'recovery',runSlot:d===1?0:d===4?1:d===6?2:-1,ids:d===2?[0,1,2,3]:d===5?[4,5,6,7]:[],protected:false};
}
const nameFor=(d,w=state.week)=>sessionPlan(d,w).name,isGym=(d,w=state.week)=>sessionPlan(d,w).kind==='strength',idsFor=(d,w=state.week)=>sessionPlan(d,w).ids,isRunDay=(d,w=state.week)=>sessionPlan(d,w).kind==='run',runSlotFor=(d,w=state.week)=>sessionPlan(d,w).runSlot;''')
patch('v2-views.js',"distance=d===1?w[0]:d===4?w[1]:d===6?w[2]:null", "distance=isRunDay(d)?w[runSlotFor(d)]:null")
patch('v2-views.js',"distance=d===1?w[0]:d===4?w[1]:d===6?w[2]:0", "distance=isRunDay(d)?w[runSlotFor(d)]:0")
patch('v2-views.js',"}}else{let w=WEEKS[state.week-1],distance=", "}}else if(!isRunDay(d)){out+='<h1>Recovery</h1><div class=\"card\"><h3>No workout scheduled</h3><p>This is a recovery day. There is no missed-workout target to make up.</p><button class=\"btn\" onclick=\"window.strydeTrainingHub.extra()\">Log activity you actually did</button></div>'}else{let w=WEEKS[state.week-1],distance=")
patch('run-day.js',"RUN_DAYS.includes(sessionDay)","isRunDay(sessionDay)")
patch('run-day.js',"!RUN_DAYS.includes(Number(match[2]))","!(l.session_type==='run'||Number(l.actual)>0)")
patch('run-day.js',"!RUN_DAYS.includes(d)","!isRunDay(d,w)")
patch('run-day.js',"WEEKS[w-1][d===1?0:d===4?1:2]","WEEKS[w-1][runSlotFor(d,w)]")
patch('run-day.js',"return {w,d,date,id,km,minutes,isRace", "return {w,d,date,id,km,minutes,runSlot:runSlotFor(d,w),isRace")
patch('run-day.js',"c.d===4", "c.runSlot===1",count=2)
patch('run-day.js',"'Monday is scheduled recovery. Do not use it to make up missed distance.'", "'Check the next day in your plan. Keep any follow-up easy and do not make up missed distance.'")
patch('run-day.js',"'The next scheduled session is Glutes & Legs. If soreness changes your gait, recover and reassess instead of forcing the plan.'", "'Follow the next day shown in your calendar, including protected recovery days. If soreness changes your gait, recover rather than forcing the plan.'")
patch('run-weather.js',"[1,4,6].includes(sessionDay)","isRunDay(sessionDay)")
patch('workout-timer-full.js',"[1,4,6].includes(sessionDay)","isRunDay(sessionDay)")
patch('workout-timer-full.js',"nameFor(Number(running.split('-')[1]))","nameFor(Number(running.split('-')[1]),Number(running.split('-')[0]))")
patch('workout-timer-full.js',"nameFor(Number(k.split('-')[1]))","nameFor(Number(k.split('-')[1]),Number(k.split('-')[0]))")
patch('progress-model.js',"const kind=l.session_type==='run'||[1,4,6].includes(d)?'run':Object.keys(ex).length||[2,5].includes(d)?'strength':'recovery';", "const kind=l.session_type==='run'||n(l.actual)>0?'run':Object.keys(ex).length||[2,5].includes(d)?'strength':'recovery';")
patch('progress-model.js',"source:'Workout log',name:nameFor(d)","source:'Workout log',name:l.session_name||nameFor(d,Number(k.split('-')[0]))")
patch('progress-model.js',"const original={week:Math.floor(offset/7)+1,day:d,kind:[1,4,6].includes(d)?'run':[2,5].includes(d)?'strength':'recovery',name:nameFor(d)};", "const w=Math.floor(offset/7)+1;const original={week:w,day:d,kind:sessionPlan(d,w).kind,name:nameFor(d,w)};")
patch('progress-model.js',"if(date>iso())return {code:'future'", "const attendance=window.strydeTrainingData?.on(date)||[];if(attendance.length)return {code:'attendance',label:'Gym attended — workout not recorded',attendance,plan};if(date>iso())return {code:'future'")
patch('training-hub.js',"function statusMark(s){return s.code==='done'?", "function statusMark(s){if(s.code==='attendance')return '<span class=\"hub-status done attendance-mark\" aria-label=\"Gym attended; workout not recorded\">✓</span>';return s.code==='done'?")
patch('training-hub.js',"✓ Activity recorded · × Past planned day with no log · − Recovery", "✓ Activity / attendance recorded · × Past planned day with no log · − Recovery")
patch('day-workflows.js',"const {week,day}=point,kind=[1,4,6].includes(day)?'run':[2,5].includes(day)?'strength':'recovery';\n    const w=WEEKS[week-1],km=day===1?w[0]:day===4?w[1]:day===6?w[2]:null;", "const {week,day}=point,kind=sessionPlan(day,week).kind;\n    const w=WEEKS[week-1],km=isRunDay(day,week)?w[runSlotFor(day,week)]:null;")
patch('day-workflows.js',"return {name:nameFor(day),kind,point", "return {name:nameFor(day,week),kind,point")
patch('day-workflows.js',"const plan=originalPlan(date),actual=getRows().filter(r=>r.date===date);", "const plan=originalPlan(date),actual=getRows().filter(r=>r.date===date),attendance=window.strydeTrainingData?.on(date)||[];")
patch('day-workflows.js',"actual.map(r=>r.name).join(' · '):date>today()?", "actual.map(r=>r.name).join(' · '):attendance.length?'Gym attended — workout not recorded':date>today()?")
patch('day-workflows.js',"${actual.length?'day-done':''}","${actual.length||attendance.length?'day-done':''}")
patch('day-workflows.js',"${actual.length?'✓ ':''}","${actual.length||attendance.length?'✓ ':''}")
patch('day-workflows.js',"'A missing log does not prove you skipped training.'", "attendance.length?'Check-in confirmed. Exercise type and duration unknown.':'A missing log does not prove you skipped training.'")
patch('day-workflows.js',"out+=actual.map(recordCard).join('');", "out+=actual.map(recordCard).join('');out+=window.strydeAttendanceUI?.dayMarkup(date)||'';")
patch('day-workflows.js',"if(!actual.length)out+=", "if(!actual.length&&!attendance.length)out+=")
patch('day-workflows.js',"window.addEventListener('stryde-runs-changed',()=>{", "window.addEventListener('stryde-training-data-changed',()=>{if(detailDate)paintDetail(detailDate);});\n  window.addEventListener('stryde-runs-changed',()=>{")
patch('dynamic-schedule-model.js',"const base = date => TYPES[((P.days(START,date)%7)+7)%7];", "const base = date => window.strydeTrainingData?.plan(date)?.type||TYPES[((P.days(START,date)%7)+7)%7];\n  const unavailable=date=>window.strydeTrainingData?.plan(date)?.protected===true;")
patch('dynamic-schedule-model.js',"const candidate=activity(type,date);", "if(unavailable(date))return false;\n    const candidate=activity(type,date);")
patch('dynamic-schedule-model.js',"preferred:P.add(start,n===0?1:4)", "preferred:(Array.from({length:7},(_,i)=>P.add(start,i)).filter(d=>base(d)==='easy')[n===0?0:1]||P.add(start,n===0?1:4))")
patch('dynamic-schedule-model.js',".filter(d=>!(d===today&&base(d)==='recovery'))", ".filter(d=>!unavailable(d))\n          .filter(d=>!(d===today&&base(d)==='recovery'))")
patch('dynamic-schedule-model.js',"for(const item of Object.values(days))if(!['completed','started','race']", "for(const item of Object.values(days))if(unavailable(item.date)&&!['completed','started','race'].includes(item.type)){Object.assign(item,day('recovery',item.date,'Protected recovery day: you are unavailable for morning training.',{protected:true}));}\n    for(const item of Object.values(days))if(!['completed','started','race']")
patch('dynamic-schedule-model.js',"if(c.comfort!=='comfortable'||c.energy===null", "if(unavailable(today))return {choices,reason:'This is a protected recovery day. No workout is suggested; extra activity can still be logged separately.',warnings};\n    if(c.comfort!=='comfortable'||c.energy===null")
patch('dynamic-schedule-model.js',"TYPES[legacyDay]||base(d)","base(d)")
patch('dynamic-schedule-ui.js',"${isToday&&!completed?'<p class=\"adaptive-note\">Choose an indoor muscle focus", "${isToday&&!completed&&!window.strydeTrainingData?.plan(date)?.protected?'<p class=\"adaptive-note\">Choose an indoor muscle focus")
patch('dynamic-schedule-ui.js',"if(date!==today())return preview(date);", "if(date!==today())return preview(date);\n    if(window.strydeTrainingData?.plan(date)?.protected&&!draft?.startedAt)return modal('Recovery day','<p>This day is protected for recovery because you are unavailable for morning training. Nothing needs to be made up.</p><button type=\"button\" class=\"btn\" data-adaptive=\"close\">Done</button>');")
patch('dynamic-schedule-ui.js',"button('check',rest?'Want to move? Check your options':'Check readiness & choose'", "button('check',window.strydeTrainingData?.plan(date)?.protected?'Recovery day':rest?'Want to move? Check your options':'Check readiness & choose'")
bridge='''  window.strydeReadTrainingContext=async()=>{
    if(!client||!user)throw Error('Log in to load private attendance and schedule preferences.');
    const uid=user.id,version=epoch;
    const [a,p]=await Promise.all([
      client.from('stryde_attendance_events').select('id,attendance_date,checked_in_at,time_zone,venue,source,notes').eq('user_id',uid).order('checked_in_at',{ascending:true}).limit(1000),
      client.from('stryde_schedule_preferences').select('effective_from,recovery_weekdays,weekly_types,time_zone').eq('user_id',uid).order('effective_from',{ascending:true})
    ]);
    if(user?.id!==uid||epoch!==version)throw Error('Account changed. Reopen this page.');
    if(a.error||p.error)throw Error('Attendance or recovery settings could not load. Your workout history is unchanged.');
    return {userId:uid,attendance:a.data||[],preferences:p.data||[],limited:(a.data||[]).length>=1000};
  };
'''
patch('account-cloud.js',"  // Authenticated, owner-scoped media operations.",bridge+"\n  // Authenticated, owner-scoped media operations.")
patch('v2-actions.js',"l.actual=document.getElementById('run-distance').value;", "l.session_type='run';l.session_name=nameFor(d);l.actual=document.getElementById('run-distance').value;")
s=(B/'index.html').read_text();old='20261109-dayflow1';new='20261109-attendance-recovery1'
s=s.replace('<meta name="stryde-build" content="'+old+'">','<meta name="stryde-build" content="'+new+'">')
for file in changes:
 if file.endswith(('.js','.css')): s=re.sub(r'('+re.escape(file)+r'\?v=)[^"\']+',r'\g<1>'+new,s)
s=s.replace('<script src="weight-units.js', '<script src="attendance-model.js?v='+new+'"></script>\n<script src="weight-units.js')
s=s.replace('</head>','<link rel="stylesheet" href="attendance.css?v='+new+'">\n</head>')
s=s.replace('</body>','<script src="attendance-ui.js?v='+new+'"></script>\n</body>')
(B/'index.html').write_text(s)
expected={'v2-core.js':'b5005018f44cf554698d2eff28881a2616617be4daab72a80224ebe9ec5d0a47','workout-timer-full.js':'4978ec005ab4b9e7b311fb9d47466cab7b89f33eed0e5f288635a28f924cc8c0','day-workflows.js':'0cce25d09fdfd4dc7ac9a4076d2dc44901a36c6b39bcbe1513fbd304a75f0ee3','v2-views.js':'d46ac9e1b1dfdb1783e7d8f48b931e87e220ae6f5fa1ab84dd01424e2725259c','dynamic-schedule-model.js':'4a1e3d2a969915c86dcb22da2a8dedbf4461c351171bc36413662b0f6ff3fae8','account-cloud.js':'f7e1f9ccbc70f7976c590d2736fc74abea75870631a509e7a1ccb16e7edcba08','index.html':'b8f3d27b7941698be8c96dc8b157a6206cac0d47f36e895709156ede4be72511','run-weather.js':'7ae775e1622963f9b8e02f07660c0b4eed76c715d5da62812a283ab159b77f5e','run-day.js':'b4293ff10ad018e8399234b361d8f00c030d1a56d124851ca83e103f0d6c2f40','training-hub.js':'8a4dd451dc8cc726a8ca81f4bd3f19074f752be981f132644e67a0754164cd49','progress-model.js':'0cecc72431ddc8851cbd673eb53764a21dabceb90b761e5402d507e5dd67e5a9','dynamic-schedule-ui.js':'84a53df2764e8f2f09d335ca40db0e49ca395d01aba898d622a1296f437b830c','v2-actions.js':'165874dfadade48e69f0e6a742ee86b56b089a848b2430894eac70c57a09497b'}
for file,digest in expected.items():
 if hashlib.sha256((B/file).read_bytes()).hexdigest()!=digest: raise RuntimeError('Output does not match tested version: '+file)
print('Verified 13 patched files match the tested build.')

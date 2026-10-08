"""Apply the tested Custom exercise update without overwriting concurrent app changes."""
from pathlib import Path
import hashlib

site = Path('.')
def blob(path):
    data = path.read_bytes()
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
before = {
    'training-hub.js': 'c8b7c0d5f8b045b80f0fad6a276478057e36a292',
    'progress-model.js': 'c0575f3e8972ea3d389ce50d443e13aa44f8b5ce',
    'index.html': 'a6f0408584bc56eea15a780f1935506431a466ae'
}
after = {
    'training-hub.js': 'd244776ddc6c4791c13d5dbcdf512fbe20010730',
    'progress-model.js': '2efc5bcaebc088a52bddbe3f6e540059f9cbdba9',
    'index.html': '5f40e47afe1cf4935b5aec12831dd583e7e288f6'
}
if all(blob(site / name) == sha for name, sha in after.items()):
    print('Custom exercise update already installed.')
    raise SystemExit(0)
for name, sha in before.items():
    if blob(site / name) != sha:
        raise SystemExit('Source changed; review before applying: ' + name)

p=site/'progress-model.js';s=p.read_text()
old=" const reps=e=>String(e?.reps||'').split(',').map(x=>n(x.trim())).filter(x=>x!==null&&x>0&&x<=100);"
assert old in s
s=s.replace(old,old+'''
 // Custom lifts keep stable IDs and their name/unit in each log. Never append them to EX,
 // whose numeric IDs identify the existing prescribed exercises on every device.
 const customId = id => /^custom-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
 function exerciseInfo(id, entry = {}, s = state) {
  if (/^\\d+$/.test(String(id)) && EX[Number(id)]) return {...EX[Number(id)],id:Number(id),custom:false};
  if (!customId(id)) return null;
  const saved = s.customExercises?.[id];
  const name = text(entry.name || saved?.name).slice(0,80);
  if (!name) return null;
  return {id:String(id),name,unit:entry.unit || saved?.unit || 'unrecorded',custom:true};
 }
''')
s=s.replace("   if(!EX[Number(i)]||e.form!=='good'", "   const definition=exerciseInfo(i,e);\n   if(!definition||e.form!=='good'")
s=s.replace("date:r.date,i:Number(i),weight:n(e.weight)","date:r.date,i:definition.id,name:definition.name,custom:definition.custom,weight:n(e.weight)")
s=s.replace("name:EX[first.i].name,first,last", "name:first.name,custom:first.custom,first,last")
s=s.replace("={TZ,n,iso,validDate", "={customId,exerciseInfo,TZ,n,iso,validDate")
old_unit=" const unit=s=>/per hand|each hand/.test(s||'')?'lbs per hand':/^(lb|lbs|lb total|lbs total)$/.test(s||'')?'lbs':s||'unrecorded';"
new_unit=" const unit=s=>{const u=text(s).toLowerCase();if(/^(kg|kgs|kilograms?) (per|each) hand$/.test(u))return 'kg per hand';if(/^(lb|lbs|pounds?) (per|each) hand$/.test(u))return 'lbs per hand';if(/^(lb|lbs|pounds?)( total)?$/.test(u))return 'lbs';if(/^(kg|kgs|kilograms?)( total)?$/.test(u))return 'kg';return u||'unrecorded';};"
assert old_unit in s
s=s.replace(old_unit,new_unit)
p.write_text(s)

p=site/'training-hub.js';s=p.read_text()
start=s.index(' function nextLift(r)');end=s.index(' function coach(a)',start)
s=s[:start]+''' function nextLift(r){
  if(r.custom)return `For ${r.name}, your latest reference is ${rnd(r.last.weight)} ${r.last.unit}, ${r.last.sets} sets averaging ${rnd(r.last.reps)} reps. Keep the exercise and machine setup consistent when comparing sessions. This custom lift has no automatically prescribed weight increase.`;
  const t=target(r.i),e=EX[r.i];return `Next ${e.name}: ${t.weight||'calibrate'} ${e.unit}, ${e.sets} × ${t.reps}. ${t.why}`;
 }
 function customHistory(a){
  const logs=a.lifts.flatMap(r=>Object.entries(r.exercises||{}).flatMap(([id,e])=>{const def=M.exerciseInfo(id,e);return def?.custom?[{...e,id,name:def.name,date:r.date}]:[]}));
  if(!logs.length)return '';
  return `<section class="hub-card"><div class="eyebrow">YOUR CUSTOM LIFTS</div><h3>Custom exercise history</h3><p>Actual weights and reps, including first sessions. Progress comparisons appear above after matching repeat logs.</p>${logs.slice().reverse().map(e=>`<div class="hub-custom-history"><strong>${esc(e.name)}</strong><small>${dateLabel(e.date)} · ${esc(e.setup||'Setup not recorded')}</small><span>${rnd(e.weight)} ${esc(e.unit)} · ${M.reps(e).length} sets · reps ${esc(e.reps)}</span></div>`).join('')}</section>`;
 }
''' + s[end:]
start=s.index(' function strength(a)');end=s.index(' function body()',start)
frag=s[start:end];needle='${methodology()}`;}'
assert needle in frag
frag=frag.replace(needle,'${customHistory(a)}${methodology()}`;}')
s=s[:start]+frag+s[end:]
start=s.index(' function extra(date=M.iso())');end=s.index(' function statusMark(s)',start)
s=s[:start]+''' // Definitions created in this dialog remain a draft until the workout is saved.
 const customUnits=['lbs','kg','lbs per hand','kg per hand'];
 const cleanName=v=>String(v||'').normalize('NFKC').replace(/[\\u0000-\\u001f\\u007f]/g,'').trim().replace(/\\s+/g,' ');
 const nameKey=v=>cleanName(v).toLocaleLowerCase('en');
 function savedCustom(){
  const catalog=state.customExercises;
  return catalog&&typeof catalog==='object'&&!Array.isArray(catalog)?Object.values(catalog).filter(e=>e&&M.customId(e.id)&&cleanName(e.name)&&customUnits.includes(e.unit)):[];
 }
 function extraDefinition(id){return extraDraft?.definitions?.[id]||M.exerciseInfo(id);}
 function extraOptions(){return `<option value="custom">＋ Custom exercise…</option><optgroup label="Training exercises">${EX.map((e,i)=>`<option value="${i}" ${i===0?'selected':''}>${esc(e.name)}</option>`).join('')}</optgroup>${savedCustom().length?`<optgroup label="Your custom exercises">${savedCustom().sort((a,b)=>a.name.localeCompare(b.name)).map(e=>`<option value="${e.id}">${esc(e.name)} · ${esc(e.unit)}</option>`).join('')}</optgroup>`:''}`;}
 function extra(date=M.iso()){
  const actual=M.validDate(date)&&date<=M.iso()?date:M.iso();extraRows=[];extraDraft={date:actual,definitions:{}};
  modal('Log extra workout',`<form id="hub-extra-form" class="hub-form"><p>Save what you actually did. This will not replace a recovery day or complete another planned session.</p><div class="hub-fields"><label>Activity<select name="kind" id="hub-extra-kind"><option value="strength">Strength workout</option><option value="run">Run</option><option value="walk">Walk</option><option value="other">Other activity</option></select></label><label>Actual date<input name="date" type="date" value="${actual}" max="${M.iso()}" required></label></div><label>Workout name<input name="name" maxlength="100" placeholder="e.g. Glutes & legs"></label><label>Full workout duration (minutes)<input name="minutes" type="number" min="1" max="1440" step="1" required inputmode="numeric"></label><section data-extra-run hidden><div class="hub-fields"><label>Distance (km)<input name="km" type="number" min="0.1" max="200" step="0.01"></label><label>Effort (1–10)<input name="rpe" type="number" min="1" max="10"></label></div><label>Terrain<select name="terrain"><option value="">Not recorded</option><option value="flat">Flat outdoors</option><option value="hills">Hills</option><option value="treadmill">Treadmill</option><option value="trail">Trail</option></select></label><p class="hub-footnote">Do not manually enter a run that will also import from Strava; link duplicates in Progress when needed.</p></section><section data-extra-strength><h3>Your exercises</h3><div id="hub-extra-exercises"></div><label for="hub-add-exercise">Choose an exercise</label><select id="hub-add-exercise">${extraOptions()}</select><div id="hub-custom-fields" class="hub-custom-fields" hidden><label for="hub-custom-name">Custom exercise name<input id="hub-custom-name" maxlength="80" placeholder="e.g. Adductor machine" autocomplete="off" disabled></label><label for="hub-custom-unit">Weight unit<select id="hub-custom-unit" disabled>${customUnits.map(u=>`<option value="${u}">${u}</option>`).join('')}</select></label><p class="hub-footnote">Give different machines or variations distinct names. This exercise is saved for reuse when you save the workout.</p></div><button type="button" class="btn" data-hub="add-exercise">Add exercise</button><p class="hub-footnote">Cannot find your machine? Choose Custom exercise. Add only what you did; enter reps like 10,10,8.</p><p class="hub-custom-message" role="status"></p></section><label>Notes<textarea name="notes" maxlength="1000" placeholder="How did the session feel?"></textarea></label><p class="hub-error" role="alert"></p><button class="btn orange" type="submit">Save actual workout</button></form>`);
 }
 function extraMessage(message){const box=dialog?.querySelector('.hub-custom-message');if(box)box.textContent=message;}
 function toggleCustom(){
  if(!dialog)return;
  const visible=dialog.querySelector('#hub-add-exercise').value==='custom'&&dialog.querySelector('#hub-extra-kind').value==='strength';
  const box=dialog.querySelector('#hub-custom-fields');box.hidden=!visible;box.querySelectorAll('input,select').forEach(e=>e.disabled=!visible);
  const add=dialog.querySelector('[data-hub="add-exercise"]');add.textContent=visible?'Add custom exercise':'Add exercise';
  extraMessage('');
 }
 function addExercise(){
  if(!dialog||dialog.querySelector('#hub-extra-kind').value!=='strength')return;
  let id=dialog.querySelector('#hub-add-exercise').value,definition;
  if(id==='custom'){
   const input=dialog.querySelector('#hub-custom-name'),name=cleanName(input.value),unit=dialog.querySelector('#hub-custom-unit').value;
   if(!name||name.length>80){extraMessage('Enter an exercise name, up to 80 characters.');input.focus();return;}
   if(!customUnits.includes(unit)){extraMessage('Choose a weight unit.');return;}
   const existing=[...savedCustom(),...Object.values(extraDraft.definitions)].find(e=>nameKey(e.name)===nameKey(name)&&e.unit===unit);
   id=existing?.id||'custom-'+crypto.randomUUID();
   definition=existing||{id,name,unit,custom:true,createdAt:new Date().toISOString()};
   if(!existing)extraDraft.definitions[id]=definition;
  }else definition=extraDefinition(id);
  if(!definition){extraMessage('Choose an exercise or create a custom one.');return;}
  id=String(id);
  if(extraRows.includes(id)){extraMessage(definition.name+' is already in this workout. Add any extra sets to its reps field.');return;}
  extraRows.push(id);
  const box=document.createElement('fieldset');box.dataset.extraExercise=id;
  const previous=M.records(state,[]).filter(r=>r.kind==='strength'&&r.exercises?.[id]&&M.unit(r.exercises[id].unit)===M.unit(definition.unit)).at(-1);
  const last=previous?.exercises?.[id];
  box.innerHTML=`<legend>${esc(definition.name)}${definition.custom?'<span class="hub-custom-badge">Custom</span>':''}</legend>${last?`<p class="hub-footnote">Last log: ${rnd(last.weight)} ${esc(last.unit)} · reps ${esc(last.reps)} · ${dateLabel(previous.date)}. Reference only; enter what you used today.</p>`:''}<div class="hub-fields"><label>Weight (${esc(definition.unit)})<input name="weight${id}" type="number" min="0.1" max="2000" step="any" required inputmode="decimal"></label><label>Reps by set<input name="reps${id}" required placeholder="10,10,10" pattern="[0-9, ]+" inputmode="text"></label></div><label>Effort<select name="effort${id}"><option value="unknown">Not recorded</option><option value="easy">Easy · 4+ reps left</option><option value="moderate">Controlled · 2–3 left</option><option value="hard">Hard · 0–1 left</option></select></label><label>Form<select name="form${id}"><option value="unsure">Not confirmed</option><option value="good">Controlled and pain-free</option></select></label><label>Machine / setup (optional)<input name="setup${id}" maxlength="80" placeholder="e.g. same machine, seat position 3"></label><button type="button" class="hub-link" data-hub="remove-exercise" data-i="${id}">Remove exercise</button>`;
  dialog.querySelector('#hub-extra-exercises').append(box);
  extraMessage(definition.name+' added. Enter the weight and reps you actually completed.');
  if(dialog.querySelector('#hub-add-exercise').value==='custom')dialog.querySelector('#hub-custom-name').value='';
  box.querySelector('input').focus();
 }
 function saveExtra(form){
  const data=new FormData(form),kind=String(data.get('kind')),date=String(data.get('date')),minutes=M.n(data.get('minutes'));
  if(!['strength','run','walk','other'].includes(kind)||!M.validDate(date)||date>M.iso()||!(minutes>=1&&minutes<=1440))throw Error('Enter an actual date and duration.');
  if(kind==='strength'&&form.querySelector('#hub-add-exercise').value==='custom'&&cleanName(form.querySelector('#hub-custom-name').value))throw Error('Tap Add custom exercise to include that movement, or clear its name before saving.');
  const ex={},definitions={};
  if(kind==='strength')for(const id of extraRows){
   const definition=extraDefinition(id),weight=M.n(data.get('weight'+id)),r=String(data.get('reps'+id)||'').split(',').map(x=>Number(x.trim()));
   if(!definition||!(weight>0&&weight<=2000)||!r.length||r.length>10||r.some(n=>!Number.isInteger(n)||n<1||n>100))throw Error('Enter a weight and valid reps for each lift (up to 10 sets).');
   const effort=String(data.get('effort'+id)),formValue=String(data.get('form'+id));
   if(!['unknown','easy','moderate','hard'].includes(effort)||!['unsure','good'].includes(formValue))throw Error('Check the effort and form fields.');
   ex[id]={weight,reps:r.join(','),unit:definition.unit,effort,form:formValue,setup:String(data.get('setup'+id)||'').slice(0,80)};
   if(definition.custom){ex[id].name=definition.name;ex[id].custom=true;definitions[id]={...definition,id,custom:true};}
  }
  const km=M.n(data.get('km'));if(kind==='run'&&!(km>0&&km<=200))throw Error('Enter the actual run distance.');
  const item={id:crypto.randomUUID(),date,kind,status:'done',name:String(data.get('name')||'').trim().slice(0,100)||({strength:'Extra strength workout',run:'Extra run',walk:'Walk',other:'Other activity'}[kind]),durationMinutes:minutes,distanceKm:['run','walk'].includes(kind)?km:null,rpe:M.n(data.get('rpe')),terrain:String(data.get('terrain')||''),exercises:ex,notes:String(data.get('notes')||'').slice(0,1000),createdAt:new Date().toISOString()};
  const oldWorkouts=state.extraWorkouts,oldCatalog=state.customExercises;
  state.extraWorkouts=[...(Array.isArray(oldWorkouts)?oldWorkouts:[]),item];
  if(Object.keys(definitions).length)state.customExercises={...(oldCatalog&&typeof oldCatalog==='object'&&!Array.isArray(oldCatalog)?oldCatalog:{}),...definitions};
  if(safeSave()){close();window.render();}
  else {state.extraWorkouts=oldWorkouts;state.customExercises=oldCatalog;throw Error('The workout was not saved. Your entries are still here; please retry.');}
 }
''' + s[end:]
s=s.replace("extraRows.filter(i=>i!==Number(b.dataset.i))", "extraRows.filter(i=>String(i)!==b.dataset.i)")
s=s.replace(" document.addEventListener('change',e=>{if(e.target.id==='hub-month')", " document.addEventListener('change',e=>{if(e.target.id==='hub-add-exercise'&&dialog)toggleCustom();if(e.target.id==='hub-month')")
s=s.replace("dialog.querySelector('input[name=km]').required=kind==='run';}", "dialog.querySelector('input[name=km]').required=kind==='run';toggleCustom();}")
p.write_text(s)
(site/'custom-exercises.css').write_text('''/* Custom extra-workout entries only. Keep the existing mobile form and per-user data. */
.hub-custom-fields{background:#fff5ef;border:1px solid #ffdccb;border-radius:13px;padding:13px;margin:12px 0}
.hub-custom-fields[hidden]{display:none}
.hub-custom-fields label:first-child{margin-top:0}
.hub-custom-fields .hub-footnote{margin-bottom:0}
.hub-custom-message{font-size:12px;line-height:1.5;color:#5e483c;margin:10px 0}
.hub-custom-message:empty{display:none}
.hub-custom-badge{display:inline-block;background:#fff0e6;color:#a0390a;font-size:10px;font-weight:750;border-radius:99px;padding:4px 7px;margin-left:8px;vertical-align:middle}
.hub-custom-history{padding:14px 0;border-bottom:1px solid #ebeef0}
.hub-custom-history:last-child{border-bottom:0}
.hub-custom-history strong,.hub-custom-history small,.hub-custom-history span{display:block;overflow-wrap:anywhere}
.hub-custom-history strong{font-size:14px}.hub-custom-history small{font-size:11px;color:#70767b;margin:4px 0}.hub-custom-history span{font-size:13px;line-height:1.5}
#hub-extra-exercises legend{max-width:100%;overflow-wrap:anywhere}
#hub-extra-form select{max-width:100%}
#hub-extra-form [data-hub="add-exercise"]{margin-top:10px;width:100%;min-height:44px}
''')
p=site/'index.html';s=p.read_text().replace('content="20261008-studio1"','content="20261009-custom1"').replace('training-hub.js?v=20261008-studio1','training-hub.js?v=20261009-custom1').replace('progress-model.js?v=20261008-studio1','progress-model.js?v=20261009-custom1').replace('</head>','<link rel="stylesheet" href="custom-exercises.css?v=20261009-custom1">\n</head>')
p.write_text(s)
for name,sha in after.items():
    if blob(site/name)!=sha:
        raise SystemExit('Output differs from browser-tested build: '+name)
print('Custom exercise files match the browser-tested build.')

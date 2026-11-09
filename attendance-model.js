/* Private attendance is not a completed workout. Schedule versions apply by date.
 * This module contains no personal check-ins, identities, or schedule preferences.
 */
(() => {
 'use strict';
 const OLD=['recovery','easy','lower','recovery','easy','upper','long'];
 const NAMES={recovery:'Recovery',easy:'Easy Run',lower:'Glutes & Legs',upper:'Back, Shoulders & Arms',long:'Long Run'};
 let owner=null,events=[],versions=[],loaded=false;
 const valid=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d||''))return false;const t=new Date(d+'T12:00:00Z');return Number.isFinite(+t)&&t.toISOString().slice(0,10)===d;};
 const day=d=>(new Date(d+'T12:00:00Z').getUTCDay()+6)%7;
 const status=()=>window.strydeAccountStatus?.()||{};
 const own=()=>!!owner&&status().signedIn&&status().userId===owner;
 function version(date){if(!valid(date)||!own())return null;return versions.filter(v=>v.effective_from<=date).at(-1)||null;}
 function plan(date){
  if(!valid(date))return null;
  const i=day(date),v=version(date),types=v?.weekly_types||OLD,type=types[i];
  const slot=type==='long'?2:type==='easy'?types.slice(0,i+1).filter(t=>t==='easy').length-1:-1;
  return {date,day:i,type,name:NAMES[type],kind:['easy','long'].includes(type)?'run':['upper','lower'].includes(type)?'strength':'recovery',runSlot:slot,ids:type==='lower'?[0,1,2,3]:type==='upper'?[4,5,6,7]:[],protected:!!v&&v.recovery_weekdays.includes(i),effectiveFrom:v?.effective_from||null};
 }
 function accept(data,uid){
  if(!uid||status().userId!==uid||!status().signedIn)return false;
  const ids=new Set();owner=uid;
  events=(Array.isArray(data.attendance)?data.attendance:[]).filter(e=>e&&typeof e.id==='string'&&!ids.has(e.id)&&ids.add(e.id)&&valid(e.attendance_date)&&Number.isFinite(Date.parse(e.checked_in_at))).map(e=>({...e,activity_type:null,duration_seconds:null})).sort((a,b)=>a.checked_in_at.localeCompare(b.checked_in_at));
  versions=(Array.isArray(data.preferences)?data.preferences:[]).filter(v=>v&&valid(v.effective_from)&&Array.isArray(v.weekly_types)&&v.weekly_types.length===7&&v.weekly_types.every(t=>t in NAMES)&&Array.isArray(v.recovery_weekdays)&&v.recovery_weekdays.every(i=>Number.isInteger(i)&&i>=0&&i<7&&v.weekly_types[i]==='recovery')&&v.weekly_types.filter(t=>t==='easy').length<=2).map(v=>({...v,weekly_types:[...v.weekly_types],recovery_weekdays:[...v.recovery_weekdays]})).sort((a,b)=>a.effective_from.localeCompare(b.effective_from));
  loaded=true;return true;
 }
 function clear(){owner=null;events=[];versions=[];loaded=false;}
 const on=date=>own()?events.filter(e=>e.attendance_date===date).map(e=>({...e})):[];
 const all=()=>own()?events.map(e=>({...e})):[];
 const snapshot=()=>({loaded:own()&&loaded,owner:own()?owner:null,events:all(),preferences:own()?versions.map(v=>({...v})):[]});
 window.strydeTrainingData={valid,weekday:day,plan,version,on,all,snapshot,accept,clear};
})();

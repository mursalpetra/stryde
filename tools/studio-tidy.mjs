import fs from 'node:fs';
let hub=fs.readFileSync('training-hub.js','utf8');
const original="if(tab==='overview'){window.strydeMountRuns?.();window.strydeWorkoutTimer?.mount();}";
const replacement="if(tab==='overview'){window.strydeMountRuns?.();window.strydeWorkoutTimer?.mount();const host=ROOT.querySelector('.hub-content');for(const panel of ROOT.querySelectorAll('#stryde-runs-panel,.workout-timing-history'))host?.append(panel);}";
if(hub.includes(original))hub=hub.replace(original,replacement);
else if(!hub.includes("host?.append(panel)"))throw Error('Progress layout marker changed');
const calendarStart="function calendar(){\n  const rows=all();";
const enhanced="function calendar(){\n  const runState=snapshot();if(window.strydeAccountStatus?.().signedIn&&!runState.attempted&&!runState.busy&&typeof window.strydeLoadStrava==='function')requestAnimationFrame(()=>{const s=snapshot();if(!s.attempted&&!s.busy)void window.strydeLoadStrava();});\n  const rows=all();";
if(hub.includes(calendarStart))hub=hub.replace(calendarStart,enhanced);
fs.writeFileSync('training-hub.js',hub);
let runs=fs.readFileSync('strava-runs.js','utf8');
if(!runs.includes('let loadSucceeded=false;')){
 runs=runs.replace("  const ROOT=document.getElementById('root');","  const ROOT=document.getElementById('root');\n  let loadSucceeded=false;");
 runs=runs.replace('rows=Array.isArray(data.activities)?data.activities:[];','rows=Array.isArray(data.activities)?data.activities:[];loadSucceeded=true;');
 runs=runs.replace('if(value!==authSeen){authSeen=value;','if(value!==authSeen){loadSucceeded=false;authSeen=value;');
 runs=runs.replace('loaded:Boolean(lastRead)&&!busy,busy,','loaded:loadSucceeded&&!busy,attempted:Boolean(lastRead),notice,busy,');
}
fs.writeFileSync('strava-runs.js',runs);

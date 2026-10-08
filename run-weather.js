/* Fixed-city outdoor weather. No geolocation permission, personal address or workout data sent. */
(() => {
 'use strict';const ROOT=document.getElementById('root'),M=window.strydeProgressModel;
 const CACHE='stryde-shenzhen-weather-v1',TZ='Asia/Shanghai',TTL=30*60000;
 const endpoint='https://api.open-meteo.com/v1/forecast?latitude=22.5431&longitude=114.0579&timezone=Asia%2FShanghai&forecast_days=16&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
 let cache=null,pending=null,error='',lastAttempt=0;try{cache=JSON.parse(localStorage.getItem(CACHE)||'null')}catch{}
 const context=()=>typeof view!=='undefined'&&view==='session'&&[1,4,6].includes(sessionDay)?window.strydeRunDay?.context():null;
 function condition(code){if(code===0)return 'Clear';if([1,2].includes(code))return 'Partly cloudy';if(code===3)return 'Overcast';if([45,48].includes(code))return 'Fog';if(code>=95)return 'Thunderstorm risk';if([71,73,75,77,85,86].includes(code))return 'Snow';if(code>=51)return 'Rain / showers';return 'Forecast';}
 function summary(c,data=cache){
  if(!Array.isArray(data?.hourly?.time)||!Number.isFinite(data.received)||!c)return null;
  const time=state.runPreparation?.[c.id]?.weatherHour||'07:00';const hour=/^([01]\d|2[0-3]):[0-5]\d$/.test(time)?time:'07:00';
  const target=Date.parse(c.id+'T'+hour+':00+08:00'),duration=c.minutes*60000;
  const indexes=data.hourly.time.map((t,i)=>({i,ms:Date.parse(t+':00+08:00')})).filter(x=>x.ms>=target-3599999&&x.ms<=target+duration).map(x=>x.i);
  if(!indexes.length)return null;const values=field=>indexes.map(i=>number(data.hourly[field]?.[i])).filter(x=>x!==null);
  const max=field=>{const a=values(field);return a.length?Math.max(...a):null};const start=field=>number(data.hourly[field]?.[indexes[0]]);
  const result={hour,temp:start('temperature_2m'),feels:max('apparent_temperature'),humidity:max('relative_humidity_2m'),rain:max('precipitation_probability'),wind:max('wind_speed_10m'),gust:max('wind_gusts_10m'),code:start('weather_code'),storm:values('weather_code').some(x=>x>=95),received:data.received};
  if([result.temp,result.feels,result.humidity,result.rain,result.wind].every(x=>x===null))return null;result.hot=result.feels>=30||(result.temp>=28&&result.humidity>=75);result.rainy=result.rain>=50;result.windy=result.wind>=30||result.gust>=45;result.stale=Date.now()-data.received>TTL;return result;
 }
 function advice(c,w){
  if(!w)return {pacing:'Weather unavailable. Check local conditions and warnings before going outside.',water:'Have water access and adapt to the actual heat and sweat loss. Do not force a fixed drinking volume.'};
  const start=`For ${c.km} km over about ${c.minutes} minutes in Shenzhen: `;
  let pacing=w.storm?'Thunderstorm risk appears in this run window. Postpone the outdoor run or use an indoor alternative. If you hear thunder, go indoors and follow local warnings.':w.windy?'Gusty conditions are forecast. Avoid exposed or tree-lined routes; consider moving indoors or shortening the outing.':(w.hot||c.weather==='hot')?'Warm / humid conditions raise the effort of running. Choose a cooler start, slow down, shorten the session or move indoors rather than chasing your usual pace.':'Use conversational effort. The forecast does not replace checking how you feel or what is happening on your route.';
  if(w.rainy&&!w.storm)pacing+=' Rain is possible: choose grippy shoes, avoid slippery surfaces and do not cross flooded paths.';
  const water=(w.hot||c.weather==='hot')?`Plan water/refill access for this ${c.minutes}-minute run. Sip to your needs, rather than forcing a bottle-per-hour target. A familiar electrolyte drink may help during prolonged heavy sweating; count any carbohydrate in the drink toward your fuel plan.`:c.minutes>=60?'Carry water or plan refill access for the longer time outside. Drink according to thirst and practiced needs; avoid forced large volumes.':'Start normally hydrated and keep water access available. A short easy run does not call for forced extra fluid.';
  return {pacing:start+pacing,water};
 }
 async function load(force=false){
  if(pending)return pending;if(!force&&Date.now()-lastAttempt<60000)return;if(!force&&cache?.received&&Date.now()-cache.received<TTL)return;
  lastAttempt=Date.now();const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);error='';
  pending=(async()=>{try{const r=await fetch(endpoint,{credentials:'omit',signal:controller.signal});if(!r.ok)throw Error('Forecast service unavailable');const d=await r.json();if(!Array.isArray(d.hourly?.time)||d.timezone!==TZ)throw Error('Unexpected forecast response');cache={...d,received:Date.now()};try{localStorage.setItem(CACHE,JSON.stringify(cache))}catch{}}
   catch{error='Forecast could not refresh. Check your connection or try again.';}finally{clearTimeout(timeout);pending=null;paint();}})();return pending;
 }
 function metrics(w){const val=(v,suffix)=>v===null?'—':Math.round(v)+suffix;return `<div class="weather-values"><div><small>Start temperature</small><b>${val(w.temp,'°C')}</b></div><div><small>Peak feels-like</small><b>${val(w.feels,'°C')}</b></div><div><small>Humidity up to</small><b>${val(w.humidity,'%')}</b></div><div><small>Rain chance up to</small><b>${val(w.rain,'%')}</b></div><div><small>Wind up to</small><b>${val(w.wind,' km/h')}</b></div><div><small>Gusts up to</small><b>${val(w.gust,' km/h')}</b></div></div>`;}
 function paint(){const c=context(),panel=ROOT.querySelector('#shenzhen-run-weather');if(!c||!panel)return;const today=M?M.iso():new Intl.DateTimeFormat('en-CA',{timeZone:TZ}).format(new Date());const dayGap=(Date.parse(c.id+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000;
  if(c.terrain==='treadmill'){panel.remove();return;}
  if(dayGap<0){panel.innerHTML='<h3>Shenzhen · past run</h3><p>Live forecasts are not historical observations. Weather was not archived for this past session.</p>';return;}
  if(dayGap>=16){panel.innerHTML='<h3>Shenzhen · outdoor run</h3><p>Forecast not available yet for '+esc(c.id)+'. Open this run closer to the date. No weather is being guessed.</p>';return;}
  const w=summary(c),fresh=w&&Date.now()-w.received<6*3600000,available=fresh?w:null;
  panel.innerHTML=`<div class="weather-title"><div><div class="eyebrow">OUTDOOR RUN · SHENZHEN</div><h3>${available?condition(w.code):pending?'Fetching forecast…':'Forecast unavailable'}</h3></div><button class="hub-link" data-weather-refresh>Refresh</button></div><form id="weather-hour-form"><label>Planned run start · Shenzhen time (UTC+8)<input name="hour" type="time" value="${esc(state.runPreparation?.[c.id]?.weatherHour||'07:00')}" required></label><button class="btn">Update start time</button></form><p>Forecast for ${esc(c.id)}, across your ~${c.minutes}-minute run. The default 07:00 planning time is editable—not a recorded start time.</p>${available?metrics(w)+`<div class="weather-advice ${w.storm||w.hot?'caution':''}"><b>For this run</b><p>${esc(advice(c,w).pacing)}</p></div><p class="hub-footnote">${w.stale?'Saved forecast · may be stale. ':''}Fetched ${new Date(w.received).toLocaleString([],{timeZone:TZ,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})} Shenzhen time. City-level model forecast, not a weather alert or route sensor.</p>`:`<p>${esc(error||'No forecast for the selected run window has loaded. Try refreshing; do not assume conditions are safe from a missing forecast.')}</p>`}<p class="hub-footnote">Guidance: <a href="https://www.cdc.gov/heat-health/risk-factors/heat-and-athletes.html" target="_blank" rel="noopener">CDC heat &amp; athletes</a>. Weather: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>, CC BY 4.0. Fixed city coordinates; no phone location requested. Check local storm and typhoon warnings before outdoor exercise.</p>`;
  if(available&&sessionTab==='tips'){
   const a=advice(c,w);ROOT.querySelectorAll('.run-day-tip').forEach(t=>{const h=t.querySelector('h3')?.textContent;if(h==='Water and conditions')t.querySelector('p').textContent=a.water;else if(h==='How to run today'||h==='Your race approach'){const p=t.querySelector('p');if(!t.dataset.originalTip)t.dataset.originalTip=p.textContent;p.textContent=t.dataset.originalTip+' '+a.pacing;}t.dataset.weatherApplied='yes'});
   ROOT.querySelectorAll('.run-day>.muted').forEach(p=>{if(p.textContent.startsWith('Weather has not been checked.'))p.textContent='Shenzhen forecast shown above. Recheck local conditions before leaving.'});
  }
 }
 function mount(){const c=context();if(!c||c.terrain==='treadmill'||sessionTab==='history')return;let panel=ROOT.querySelector('#shenzhen-run-weather');if(!panel){panel=document.createElement('section');panel.id='shenzhen-run-weather';panel.className='run-weather-card';ROOT.querySelector('.run-day-hero')?.after(panel);const hint=ROOT.querySelector('#run-preparation-form .muted');if(hint)hint.textContent='Shenzhen forecast appears above for outdoor runs. Conditions here are your own override if it feels hotter than forecast. Saving updates preparation for this date, not the completed result.';}paint();const today=M?.iso()||'';const gap=(Date.parse(c.id+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000;if(gap>=0&&gap<16)void load();}
 const prev=window.render;window.render=function(...args){const r=prev.apply(this,args);mount();return r};
 document.addEventListener('click',e=>{if(e.target.closest('[data-weather-refresh]'))void load(true)});
 document.addEventListener('submit',e=>{if(e.target.id!=='weather-hour-form')return;e.preventDefault();const c=context(),hour=new FormData(e.target).get('hour');if(!c||!/^([01]\d|2[0-3]):[0-5]\d$/.test(hour))return;if(!state.runPreparation)state.runPreparation={};state.runPreparation[c.id]={...state.runPreparation[c.id],weatherHour:hour};save();window.render();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&context())mount()});
 window.strydeWeather={summary,advice,mount,load};mount();
})();

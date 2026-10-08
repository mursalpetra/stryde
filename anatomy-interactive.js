/* STRYDE interactive anatomy: single licensed anatomy illustration, with selectable muscle overlays. */
const MUSCLE_EXERCISES={
  glutes:[0,1,2],hamstrings:[0,3],quadriceps:[2],
  lats:[4,5],upperback:[5,4],shoulders:[6],biceps:[4,5],triceps:[6,7],chest:[7]
};
const MUSCLE_LABELS={glutes:'Glutes',hamstrings:'Hamstrings',quadriceps:'Quadriceps',lats:'Latissimus dorsi (lats)',upperback:'Upper back / trapezius',shoulders:'Deltoids (shoulders)',biceps:'Biceps',triceps:'Triceps',chest:'Pectorals (chest)'};
const ANATOMY_POINTS={
  front:{
    glutes:[50,55],hamstrings:[51,72],quadriceps:[50,70],
    lats:[39,42],upperback:[49,31],shoulders:[29,31],biceps:[23,44],triceps:[77,45],chest:[49,37]
  },
  back:{
    glutes:[50,59],hamstrings:[48,72],quadriceps:[47,68],
    lats:[43,43],upperback:[50,32],shoulders:[28,31],biceps:[23,44],triceps:[77,44],chest:[49,37]
  }
};
let selectedMuscle=null;
function muscleCard(d,full=false){
  const keys=d===2?['glutes','hamstrings','quadriceps']:['lats','upperback','shoulders','biceps','triceps','chest'];
  const side=muscleSide==='back'?'back':'front';
  const current=keys.includes(selectedMuscle)?selectedMuscle:null;
  const points=ANATOMY_POINTS[side];
  const spots=keys.map(k=>{const xy=points[k];return '<button type="button" class="anatomy-hotspot '+(current===k?'chosen':'')+'" style="left:'+xy[0]+'%;top:'+xy[1]+'%" title="'+MUSCLE_LABELS[k]+'" aria-label="Show exercises for '+MUSCLE_LABELS[k]+'" onclick="chooseMuscle(\''+k+'\')" onmouseenter="previewMuscle(\''+k+'\')" onfocus="previewMuscle(\''+k+'\')"><span></span></button>'}).join('');
  const chips=keys.map(k=>'<button class="anatomy-chip '+(current===k?'active':'')+'" onclick="chooseMuscle(\''+k+'\')">'+MUSCLE_LABELS[k]+'</button>').join('');
  const items=current?MUSCLE_EXERCISES[current].filter(i=>idsFor(d).includes(i)):[];
  const exerciseRows=items.map(i=>{const e=EX[i],p=target(i);return '<button class="anatomy-exercise" onclick="openExercise('+i+')"><span><strong>'+esc(e.name)+'</strong><small>'+e.sets+' sets × '+p.reps+' reps · '+(p.weight?esc(p.weight+' '+e.unit):'Calibrate weight')+'</small></span><span class="anatomy-chevron">›</span></button>'}).join('');
  return '<section class="musclebox anatomy-interactive"><div class="muscle-head"><div><div class="eyebrow">MUSCLE FOCUS</div><h3>'+nameFor(d)+'</h3><p class="muted">Tap a muscle to see which exercises train it.</p></div></div><div class="segment anatomy-side"><button class="'+(side==='front'?'active':'')+'" onclick="setSide(\'front\')">Front</button><button class="'+(side==='back'?'active':'')+'" onclick="setSide(\'back\')">Back</button></div><div class="anatomy-stage"><div class="anatomy-figure '+side+'"><img src="https://commons.wikimedia.org/wiki/Special:FilePath/Muscles_front_and_back.svg" alt="Detailed human muscle anatomy, '+side+' view" loading="lazy" onerror="this.closest(\'.anatomy-figure\').classList.add(\'unavailable\')"><div class="anatomy-overlay">'+spots+'</div><div class="anatomy-unavailable">Anatomical illustration unavailable. Select a muscle below.</div></div></div><div class="anatomy-chips">'+chips+'</div><div class="anatomy-results" id="anatomy-results">'+(current?'<div class="eyebrow">TODAY · '+MUSCLE_LABELS[current].toUpperCase()+'</div><h3>'+items.length+' exercise'+(items.length===1?'':'s')+' targeting this area</h3>'+exerciseRows:'<div class="anatomy-prompt"><strong>Select a highlighted muscle</strong><p>See today’s movements, recommended weights and reps.</p></div>')+'</div><p class="anatomy-credit">Anatomical illustration: OpenStax &amp; Tomáš Kebert / umimeto.org, <a target="_blank" rel="noopener" href="https://commons.wikimedia.org/wiki/File:Muscles_front_and_back.svg">CC BY-SA 4.0</a>. Muscle markers indicate approximate regions and are not a diagnostic map.</p></section>';
}
window.chooseMuscle=k=>{selectedMuscle=k;render();const panel=document.getElementById('anatomy-results');if(panel&&window.innerWidth<600)panel.scrollIntoView({block:'nearest',behavior:'smooth'})};
window.previewMuscle=k=>{const box=document.querySelector('.anatomy-results');if(!box||selectedMuscle)return;const ids=MUSCLE_EXERCISES[k].filter(i=>idsFor(sessionDay??state.selectedDay??2).includes(i));box.innerHTML='<div class="eyebrow">'+MUSCLE_LABELS[k].toUpperCase()+'</div><h3>'+ids.length+' exercise'+(ids.length===1?'':'s')+' today</h3>'+ids.map(i=>{let e=EX[i],p=target(i);return '<button class="anatomy-exercise" onclick="openExercise('+i+')"><span><strong>'+esc(e.name)+'</strong><small>'+e.sets+' × '+p.reps+' · '+(p.weight?esc(p.weight+' '+e.unit):'Calibrate')+'</small></span><span>›</span></button>'}).join('')};
const originalSetSide=window.setSide;
window.setSide=t=>{muscleSide=t==='both'?'front':t;render()};

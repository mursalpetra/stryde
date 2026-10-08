/* STRYDE muscle-region explorer. Overlays derived from the displayed anatomy.
 * Artwork + overlays: CC BY-SA 4.0. Source credit is rendered in the viewer.
 * Regions show primary and assisting muscles, not activation measurements.
 */
(() => {
  'use strict';
  const SRC = 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Muscles_front_and_back.svg';
  const names = {glutes:'Glutes',hamstrings:'Hamstrings',quadriceps:'Quadriceps',lats:'Lats',upperback:'Upper back / trapezius',shoulders:'Deltoids (shoulders)',biceps:'Biceps',triceps:'Triceps',chest:'Pectorals (chest)'};
  const groups = {
    0:['glutes','hamstrings'], 1:['glutes','hamstrings'], 2:['glutes','quadriceps'], 3:['hamstrings'],
    4:['lats','upperback','biceps'], 5:['lats','upperback','shoulders','biceps'],
    6:['shoulders','triceps'], 7:['chest','shoulders','triceps']
  };
  // Coordinates follow the original 960 x 836 artwork, not screen percentages.
  // One side of each bilateral region is reflected around the figure midline.
  const front = {
    shoulders:['M155 151 C137 160 120 183 123 214 L126 231 Q140 209 155 214 Q161 185 195 166 L180 158 Z'],
    chest:['M232 176 Q214 169 196 165 C174 171 153 191 153 216 Q160 242 175 256 Q197 269 232 267 L235 205 Z'],
    biceps:['M150 214 C137 212 129 229 123 251 L114 291 Q132 286 141 267 L156 232 Q160 217 150 214 Z'],
    quadriceps:['M164 413 L177 435 L172 461 Q175 519 197 560 L192 565 Q174 548 164 508 Q156 469 160 437 Z','M184 432 Q199 453 218 482 L231 509 Q236 535 221 567 L211 567 Q202 527 197 490 Z']
  };
  const back = {
    shoulders:['M173 183 Q151 195 149 221 L150 255 Q183 240 217 202 L218 194 Q192 191 173 183 Z'],
    upperback:['M235 110 L247 121 L253 153 L246 161 L228 166 L220 173 L246 188 L255 203 L258 300 Q244 278 235 251 L219 202 Q197 194 176 180 Q198 162 232 153 Z'],
    lats:['M219 218 Q207 248 187 252 L190 289 Q197 320 213 340 L204 358 L228 360 Q236 338 249 315 L257 305 Q239 278 231 248 Z'],
    triceps:['M168 252 L185 246 Q195 273 186 309 L177 330 L168 332 L161 312 Q148 296 148 277 Z'],
    glutes:['M213 366 Q194 371 190 397 L189 416 Q190 435 204 443 Q239 456 259 436 L262 418 Q261 394 246 376 L235 366 Z'],
    hamstrings:['M203 463 Q223 452 250 449 L251 490 L246 529 L240 552 L232 559 L223 546 L218 556 L211 547 L212 533 L205 511 L201 488 Z']
  };
  let filter = null, pinned = null, hovered = null, activeDay = null;
  const escape = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sessionIds = d => idsFor(d).filter(i=>Array.isArray(groups[i]));
  const sessionGroups = d => [...new Set(sessionIds(d).flatMap(i=>groups[i]))];
  function selection() { return hovered !== null ? hovered : pinned; }
  function zoneMarkup(side,d) {
    const regions = side === 'back' ? back : front;
    const axis = side === 'back' ? 263 : 241;
    const orange = sessionGroups(d);
    const chosen = groups[selection()] || [];
    return Object.entries(regions).map(([key,paths])=> {
      if(!orange.includes(key)) return ''; // Do not cover untargeted anatomy.
      const cls='muscle-zone'+(chosen.includes(key)?' is-green':'');
      const shapes=paths.map(path=>'<path d="'+path+'"/><path d="'+path+'" transform="translate('+(axis*2)+' 0) scale(-1 1)"/>').join('');
      return '<g class="'+cls+'" data-zone="'+key+'" tabindex="0" role="button" aria-label="Show '+names[key]+' exercises" aria-pressed="'+(filter===key)+'"><title>'+names[key]+'</title>'+shapes+'</g>';
    }).join('');
  }
  function row(i) {
    const e=EX[i],p=target(i);
    const count=e.sets;
    const label=(p.weight!==''&&p.weight!=null?escape(p.weight+' '+e.unit):'Calibrate weight');
    return '<div class="muscle-exercise-row"><button class="muscle-exercise-preview'+(selection()===i?' is-selected':'')+'" data-zone-exercise="'+i+'" aria-pressed="'+(pinned===i)+'"><strong>'+escape(e.name)+'</strong><span>'+count+' × '+p.reps+' reps · '+label+'</span></button><button class="muscle-exercise-log" data-zone-log="'+i+'" aria-label="Open '+escape(e.name)+' weight and rep log">Log →</button></div>';
  }
  window.muscleCard=function(d) {
    if(!isGym(d))return '';
    if(activeDay!==d){activeDay=d;filter=null;pinned=null;hovered=null;}
    const side=muscleSide==='back'?'back':'front',all=sessionGroups(d);
    if(!all.includes(filter))filter=null;
    const ids=sessionIds(d).filter(i=>!filter||groups[i].includes(filter));
    const offset=side==='back'?480:0;
    return '<section class="musclebox muscle-regions" data-muscle-day="'+d+'"><header><div class="eyebrow">MUSCLE FOCUS</div><h3>'+escape(nameFor(d))+'</h3><p>Hover over an exercise, or tap it on your phone.</p></header><div class="muscle-regions-controls"><div class="segment">'+['front','back'].map(s=>'<button type="button" data-zone-side="'+s+'" class="'+(s===side?'active':'')+'" aria-pressed="'+(s===side)+'">'+(s==='front'?'Front':'Back')+'</button>').join('')+'</div><button class="muscle-clear" data-zone-clear>Reset highlight</button></div><div class="muscle-region-legend"><span><i class="legend-orange"></i>This session</span><span><i class="legend-green"></i>Selected exercise</span></div><div class="muscle-region-layout"><div class="muscle-region-body"><svg viewBox="'+offset+' 0 480 836" preserveAspectRatio="xMidYMin meet" role="group" aria-label="'+side+' anatomy; orange regions are used today"><image href="'+SRC+'" x="0" y="0" width="960" height="836"/><g transform="translate('+offset+' 0)">'+zoneMarkup(side,d)+'</g></svg><small>'+side.toUpperCase()+'</small></div><aside class="muscle-region-info"><div class="muscle-region-pills">'+all.map(k=>'<button data-zone-filter="'+k+'" class="muscle-region-pill'+(filter===k?' is-filtered':'')+'" aria-pressed="'+(filter===k)+'">'+names[k]+'</button>').join('')+'</div><div class="muscle-region-rows"><div class="eyebrow">'+(filter?escape(names[filter]):'TODAY’S EXERCISES')+'</div>'+ids.map(row).join('')+'</div><p class="muscle-selection-note" aria-live="polite">'+(selection()!=null?escape(EX[selection()].name)+' highlighted in green.':'All session muscles are orange.')+'</p></aside></div><p class="muscle-region-credit">Original anatomy: OpenStax, Tomáš Kebert &amp; umimeto.org. <a href="https://commons.wikimedia.org/wiki/File:Muscles_front_and_back.svg" target="_blank" rel="noopener">Source</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Region overlays adapted for STRYDE under the same license. Shows primary and assisting muscle groups, not measured activation or exact clinical boundaries.</p></section>';
  };
  function repaint() {
    const id=selection(),active=groups[id]||[];
    document.querySelectorAll('.muscle-regions [data-zone]').forEach(el=>el.classList.toggle('is-green',active.includes(el.dataset.zone)));
    document.querySelectorAll('[data-zone-exercise]').forEach(el=>{el.classList.toggle('is-selected',Number(el.dataset.zoneExercise)===id);el.setAttribute('aria-pressed',String(Number(el.dataset.zoneExercise)===pinned));});
    const text=document.querySelector('.muscle-selection-note');
    if(text)text.textContent=id==null?'All session muscles are orange.':EX[id].name+' highlighted in green. Other session muscles stay orange.';
  }
  function draw(){const y=window.scrollY;render();window.scrollTo(0,y);}
  document.addEventListener('click',event=>{
    const panel=event.target.closest('.muscle-regions');if(!panel)return;
    const side=event.target.closest('[data-zone-side]'),clear=event.target.closest('[data-zone-clear]'),part=event.target.closest('[data-zone-filter],[data-zone]'),exercise=event.target.closest('[data-zone-exercise]'),open=event.target.closest('[data-zone-log]');
    if(side){muscleSide=side.dataset.zoneSide;hovered=null;draw();}
    else if(clear){filter=null;pinned=null;hovered=null;draw();}
    else if(part){const k=part.dataset.zoneFilter||part.dataset.zone;filter=filter===k?null:k;hovered=null;draw();}
    else if(exercise){const i=Number(exercise.dataset.zoneExercise);pinned=pinned===i?null:i;hovered=null;repaint();}
    else if(open){sessionDay=Number(panel.dataset.muscleDay);openExercise(Number(open.dataset.zoneLog));}
  });
  document.addEventListener('pointerover',event=>{
    if(event.pointerType==='touch')return;
    const row=event.target.closest('[data-zone-exercise]');if(!row||row.contains(event.relatedTarget))return;
    hovered=Number(row.dataset.zoneExercise);repaint();
  });
  document.addEventListener('pointerout',event=>{
    if(event.pointerType==='touch')return;
    const row=event.target.closest('[data-zone-exercise]');if(row&&!row.contains(event.relatedTarget)){hovered=null;repaint();}
  });
  document.addEventListener('focusin',event=>{const row=event.target.closest('[data-zone-exercise]');if(row){hovered=Number(row.dataset.zoneExercise);repaint();}});
  document.addEventListener('focusout',event=>{if(event.target.closest('[data-zone-exercise]')){hovered=null;repaint();}});
  document.addEventListener('keydown',event=>{const region=event.target.closest('[data-zone]');if(region&&['Enter',' '].includes(event.key)){event.preventDefault();region.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
})();

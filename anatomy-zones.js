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
  let filter = null, pinned = null, pointerPreview = null, focusPreview = null, activeDay = null;
  const escape = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sessionIds = d => idsFor(d).filter(i => Array.isArray(groups[i]));
  const sessionGroups = d => [...new Set(sessionIds(d).flatMap(i => groups[i]))];
  const sideName = () => muscleSide === 'back' ? 'back' : 'front';
  const regionsFor = side => side === 'back' ? back : front;
  const asElement = node => node instanceof Element ? node : node?.parentElement || null;
  const contains = (el, node) => node instanceof Node && el.contains(node);
  function selection() {
    return pointerPreview || focusPreview || (pinned !== null ? {kind:'exercise',id:pinned} : filter ? {kind:'muscle',id:filter} : null);
  }
  function selectedGroups() {
    const selected = selection();
    return selected?.kind === 'exercise' ? groups[selected.id] || [] : selected ? [selected.id] : [];
  }
  function visibleSide(side, d) {
    const active = selectedGroups().filter(k => sessionGroups(d).includes(k));
    if (!active.length || active.some(k => regionsFor(side)[k])) return side;
    const other = side === 'front' ? 'back' : 'front';
    return active.some(k => regionsFor(other)[k]) ? other : side;
  }
  function zoneMarkup(side, d) {
    const axis = side === 'back' ? 263 : 241, session = sessionGroups(d), active = selectedGroups();
    return Object.entries(regionsFor(side)).map(([key, paths]) => {
      if (!session.includes(key)) return ''; // Leave non-session anatomy untouched.
      const cls = 'muscle-zone' + (active.includes(key) ? ' is-green' : '');
      const shapes = paths.map(path => '<path d="'+path+'"/><path d="'+path+'" transform="translate('+(axis*2)+' 0) scale(-1 1)"/>').join('');
      return '<g class="'+cls+'" data-zone="'+key+'" tabindex="0" role="button" aria-label="Show '+names[key]+' exercises" aria-pressed="'+(filter===key)+'"><title>'+names[key]+'</title>'+shapes+'</g>';
    }).join('');
  }
  function row(i) {
    const e = EX[i], p = target(i), selected = selection();
    const chosen = selected?.kind === 'exercise' && selected.id === i;
    const label = p.weight !== '' && p.weight != null ? escape(p.weight+' '+e.unit) : 'Calibrate weight';
    return '<div class="muscle-exercise-row'+(chosen?' is-selected':'')+'" data-zone-row="'+i+'"><button type="button" class="muscle-exercise-preview'+(chosen?' is-selected':'')+'" data-zone-exercise="'+i+'" aria-label="Highlight muscles for '+escape(e.name)+'" aria-pressed="'+(pinned===i)+'"><strong>'+escape(e.name)+'</strong><span>'+e.sets+' × '+p.reps+' reps · '+label+'</span></button><button type="button" class="muscle-exercise-log" data-zone-log="'+i+'" aria-label="Open '+escape(e.name)+' weight and rep log">Log →</button></div>';
  }
  function selectionNote() {
    const selected = selection();
    if (!selected) return 'All muscles in this session are light green. Hover or tap an exercise to highlight its muscles.';
    const label = selected.kind === 'exercise' ? EX[selected.id].name : names[selected.id];
    return label+' — dark green. Other session muscles stay light green.';
  }
  window.muscleCard = function(d) {
    if (!isGym(d)) return '';
    if (activeDay !== d) { activeDay=d; filter=null; pinned=null; pointerPreview=null; focusPreview=null; }
    const all = sessionGroups(d);
    if (!all.includes(filter)) filter = null;
    const side = sideName(), offset = side === 'back' ? 480 : 0, active = selectedGroups();
    const ids = sessionIds(d).filter(i => !filter || groups[i].includes(filter));
    return '<section class="musclebox muscle-regions" data-muscle-day="'+d+'"><header><div class="eyebrow">MUSCLE FOCUS</div><h3>'+escape(nameFor(d))+'</h3><p>Hover over any exercise card or muscle. On your phone, tap to keep its highlight.</p></header><div class="muscle-regions-controls"><div class="segment">'+['front','back'].map(s=>'<button type="button" data-zone-side="'+s+'" class="'+(s===side?'active':'')+'" aria-pressed="'+(s===side)+'">'+(s==='front'?'Front':'Back')+'</button>').join('')+'</div><button type="button" class="muscle-clear" data-zone-clear>Reset highlight</button></div><div class="muscle-region-legend"><span><i class="legend-session" aria-hidden="true"></i>Light green · this session</span><span><i class="legend-selected" aria-hidden="true"></i>Dark green · selected</span></div><div class="muscle-region-layout"><div class="muscle-region-body" data-visible-side="'+side+'"><svg viewBox="'+offset+' 0 480 836" preserveAspectRatio="xMidYMin meet" role="group" aria-label="'+side+' anatomy; session muscles light green, selection dark green"><image href="'+SRC+'" x="0" y="0" width="960" height="836"/><g data-zone-layer transform="translate('+offset+' 0)">'+zoneMarkup(side,d)+'</g></svg><small data-zone-caption>'+side.toUpperCase()+'</small></div><aside class="muscle-region-info"><div class="muscle-region-pills">'+all.map(k=>'<button type="button" data-zone-filter="'+k+'" class="muscle-region-pill'+(filter===k?' is-filtered':'')+(active.includes(k)?' is-previewed':'')+'" aria-pressed="'+(filter===k)+'">'+names[k]+'</button>').join('')+'</div><div class="muscle-region-rows"><div class="eyebrow">'+(filter?escape(names[filter]):'TODAY’S EXERCISES')+'</div>'+ids.map(row).join('')+'</div><p class="muscle-selection-note" aria-live="polite" aria-atomic="true">'+escape(selectionNote())+'</p></aside></div><p class="muscle-region-credit">Original anatomy: OpenStax, Tomáš Kebert &amp; umimeto.org. <a href="https://commons.wikimedia.org/wiki/File:Muscles_front_and_back.svg" target="_blank" rel="noopener">Source</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Region overlays adapted for STRYDE under the same license. Shows primary and assisting muscle groups, not measured activation or exact clinical boundaries.</p></section>';
  };
  function repaint(allowSideChange = true) {
    const panel = document.querySelector('.muscle-regions');
    if (!panel) return;
    const d = Number(panel.dataset.muscleDay), selected = selection(), active = selectedGroups();
    const figure = panel.querySelector('.muscle-region-body');
    const side = allowSideChange ? visibleSide(sideName(),d) : sideName();
    if (figure && figure.dataset.visibleSide !== side) {
      // Change only the illustration. Keep the hovered card and keyboard focus stable.
      muscleSide = side;
      figure.dataset.visibleSide = side;
      const offset = side === 'back' ? 480 : 0;
      const svg = figure.querySelector('svg'), layer = figure.querySelector('[data-zone-layer]');
      svg.setAttribute('viewBox',offset+' 0 480 836');
      svg.setAttribute('aria-label',side+' anatomy; session muscles light green, selection dark green');
      layer.setAttribute('transform','translate('+offset+' 0)');
      layer.innerHTML = zoneMarkup(side,d);
      figure.querySelector('[data-zone-caption]').textContent = side.toUpperCase();
    }
    panel.querySelectorAll('[data-zone-side]').forEach(el => {
      const on = el.dataset.zoneSide === side;
      el.classList.toggle('active',on); el.setAttribute('aria-pressed',String(on));
    });
    panel.querySelectorAll('[data-zone]').forEach(el => el.classList.toggle('is-green',active.includes(el.dataset.zone)));
    panel.querySelectorAll('[data-zone-filter]').forEach(el => el.classList.toggle('is-previewed',active.includes(el.dataset.zoneFilter)));
    panel.querySelectorAll('[data-zone-row]').forEach(el => {
      const i = Number(el.dataset.zoneRow), chosen = selected?.kind === 'exercise' && selected.id === i;
      el.classList.toggle('is-selected',chosen);
      const button = el.querySelector('[data-zone-exercise]');
      button.classList.toggle('is-selected',chosen); button.setAttribute('aria-pressed',String(pinned===i));
    });
    const text = panel.querySelector('.muscle-selection-note'), note = selectionNote();
    if (text && text.textContent !== note) text.textContent = note;
  }
  function draw() { const y=window.scrollY; render(); window.scrollTo(0,y); }
  function interaction(node) {
    const el = asElement(node);
    if (!el?.closest('.muscle-regions')) return null;
    const row = el.closest('[data-zone-row]');
    if (row) return {element:row, kind:'exercise', id:Number(row.dataset.zoneRow)};
    const part = el.closest('[data-zone-filter],[data-zone]');
    return part ? {element:part, kind:'muscle', id:part.dataset.zoneFilter || part.dataset.zone} : null;
  }
  document.addEventListener('click', event => {
    const el=asElement(event.target), panel=el?.closest('.muscle-regions'); if(!panel)return;
    const side=el.closest('[data-zone-side]'), clear=el.closest('[data-zone-clear]'), open=el.closest('[data-zone-log]');
    const part=el.closest('[data-zone-filter],[data-zone]'), row=el.closest('[data-zone-row]');
    pointerPreview=null; focusPreview=null;
    if(side){muscleSide=side.dataset.zoneSide;repaint(false);}
    else if(clear){filter=null;pinned=null;draw();}
    else if(open){sessionDay=Number(panel.dataset.muscleDay);openExercise(Number(open.dataset.zoneLog));}
    else if(part){
      const k=part.dataset.zoneFilter||part.dataset.zone;
      filter=filter===k?null:k; pinned=null;
      muscleSide=visibleSide(sideName(),Number(panel.dataset.muscleDay));
      draw();
    } else if(row){
      const i=Number(row.dataset.zoneRow);pinned=pinned===i?null:i;repaint();
    }
  });
  // Delegate from the complete exercise row, not just its text button. This includes
  // the Log area and card padding, while child-to-child movement keeps the highlight.
  document.addEventListener('pointerover', event => {
    if(event.pointerType==='touch')return;
    const hit=interaction(event.target);if(!hit||contains(hit.element,event.relatedTarget))return;
    pointerPreview={kind:hit.kind,id:hit.id};repaint();
  });
  document.addEventListener('pointerout', event => {
    if(event.pointerType==='touch')return;
    const hit=interaction(event.target);
    if(hit&&!contains(hit.element,event.relatedTarget)){pointerPreview=null;repaint(false);}
  });
  document.addEventListener('pointercancel', () => {pointerPreview=null;repaint(false);});
  document.addEventListener('focusin', event => {
    const el=asElement(event.target),hit=interaction(el);
    if(hit && el.matches(':focus-visible')){focusPreview={kind:hit.kind,id:hit.id};repaint();}
  });
  document.addEventListener('focusout', event => {
    const hit=interaction(event.target);
    if(hit&&!contains(hit.element,event.relatedTarget)){focusPreview=null;repaint(false);}
  });
  document.addEventListener('keydown', event => {
    const region=asElement(event.target)?.closest('.muscle-regions [data-zone]');
    if(region&&['Enter',' '].includes(event.key)){
      event.preventDefault();region.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    }
  });
})();

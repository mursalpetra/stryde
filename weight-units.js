/* Machine displays use kg. This changes new entries only; historical corrections require review. */
(() => {
  'use strict';
  window.strydeMachineIds = EX.map((e, i) => e.unit === 'machine display' ? String(i) : null).filter(i => i !== null);
  for (const id of window.strydeMachineIds) EX[id].unit = 'kg';
})();

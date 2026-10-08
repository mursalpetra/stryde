/* Machine loads are recorded in pounds as requested. Numeric history is untouched. */
(() => {
  'use strict';
  for (const exercise of EX) {
    if (exercise.unit === 'machine display') exercise.unit = 'lbs';
  }
})();

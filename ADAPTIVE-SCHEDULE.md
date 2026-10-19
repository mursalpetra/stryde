# Adaptive workout scheduling

This additive extension derives upcoming recommendations from actual saved workouts, extra activities and loaded Strava runs. The original eleven-week template, goals, historical logs and started-session snapshots remain unchanged. It uses the existing private account payload and needs no database or permission changes.

## Behavior

- Today and Plan display the adaptive schedule and why it differs from the original template. The calendar uses the same effective future plan; past days remain historical.
- A planned recovery day stays recovery. A quick check of comfort, muscle soreness, energy, available time and recent-log completeness can offer an indoor muscle-focused workout or a short outdoor easy run/walk. Rest remains available.
- Choosing or opening an option does not count as exercise. Saving completed activity records the actual sets/duration once, with its original prescription snapshot, in the existing extra-workout model.
- Completion, editing/removing an existing log, loaded Strava changes and returning to the app recalculate the remaining future recommendations. There is no background coach service or automatic import of chat messages.
- The planner counts actual activity in the current week, rather than transferring a missed-week backlog. It drops sessions that do not fit. A confirmed quiet prior week receives a lighter, three-training-day restart ceiling.
- It protects at least two non-training days in a rolling seven-day window and avoids four consecutive training days. The same muscle region, running, and lower-body strength receive a clear calendar day between exposures. Unknown custom strength work is treated conservatively as both upper and lower loading.
- Long-run distance never exceeds the longest recorded run from the last 28 days or the original template distance. Limited running history downgrades the long slot to short easy run/walk guidance. Future weeks are provisional and never assume future sessions were completed.
- Active race dates are preserved as milestones, not assertions of readiness. Optional training is blocked in the final two days and on the race date. The original training block still ends on its original date; a new block requires review.
- Pain, unusual soreness/tiredness, low energy, incomplete activity history, and an unresolved started session prevent a new optional workout. Each new workout requires a fresh day's check; this is not medical clearance.
- Recovery and adaptive check-ins resolve answered comfort/energy fields by their latest timestamp, with the more cautious signal retained when timestamps are missing or tied. Options are revalidated before choosing or starting, so a newer symptom report blocks a stale preview.
- Saved unfinished workouts remain available to resume or discard after the original training block ends. They never create a new training block or count as completed activity.

## Policy rationale and limits

The day-spacing principles follow [NHS beginner running guidance](https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/) and [Mayo Clinic strength-training guidance](https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/strength-training/art-20046670). Exact weekly ceilings, conservative muscle mapping and repeat-distance rules are transparent product heuristics, not a validated training algorithm, individualized race plan, clinical assessment, or percentage-risk prediction. Missing logs are unknown activity, not proof of rest.

All tests use synthetic data. No real workout history, intake data, photos or credentials are included in this repository. Existing cloud conflict review and account boundaries apply. No live account records are changed by publication of this code.

## Checks

- JavaScript syntax: `for f in *.js; do node --check "$f"; done`
- Deterministic model and account checks: `node --test tests/*.mjs`
- UI checks: `python tests/test_browser.py -v` and `python tests/test_dynamic_browser.py -v`
- The PR-only synthetic QA workflow runs all checks without publishing the application.

Merging this draft into main triggers GitHub Pages publication and requires separate approval. This change is independent of the pending kilogram-label correction PR.

# STRYDE regression checks

All fixtures are synthetic. The test harnesses replace Supabase/authentication/photo storage and never access a live account or write to cloud services.

## Account, data model and action integration

```sh
node --test tests/test_account_model.mjs
```

Runs the actual app scripts in isolated Node VM contexts with a minimal DOM adapter. Covers:

- Legacy fields and coaching payload preservation; offline save and retry
- Cloud conflict non-overwrite, both explicit choices, and replaced-copy backups
- Account switching, sign-out, and owner-scoped private photo operations
- Recovery days and custom exercise identity/unit comparisons
- Missing food vs explicit zero; completed-day averages; historical target dates
- Meal validation and explicit training-proposal acceptance
- Timer-start and first-save prescription snapshots, later revisions, and legacy workouts
- Stale session targets never leaking into Progress or other non-session screens

One case documents the existing account-switch/delayed-read limitation: no data is overwritten, but Account → Sync now may be needed before choosing the new account's copy. This behavior predates the coaching extension.

## Real browser UI

```sh
python tests/test_browser.py -v
```

Requires Python Playwright and Chromium at `/usr/bin/chromium`, or set `CHROMIUM_PATH`. Starts a temporary loopback HTTP server, uses fresh browser contexts, fixes the date/time zone, fulfills the Supabase CDN with the local mock, fulfills Strava reads with empty synthetic results, and blocks all other remote requests. It uses phone-sized viewports, including 320px and 390px widths for every Coach tab.

The 15 scenarios cover:

- Legacy/coaching save/reload, sync conflict choices, account switching, offline retry, and private photo API boundaries
- Custom exercise creation/reuse while preserving the recovery-day plan
- All five Coach tabs at both narrow widths, with page-overflow assertions
- Private intake and manual meal-plan persistence without logging planned food as eaten
- Food creation/edit/removal/restoration/cancel, unknown values, and complete-day reopening
- Training proposal → explicit acceptance → timer-start snapshot → later accepted revision → frozen saved sets
- Recovery date switching that loads the saved day and leaves workout logs intact
- Account switching dismissing unsaved forms; same-account cloud replacement blocking a stale modal save

The mobile checks write synthetic-only screenshots to `tests/screenshots/`, including `coach-review-mobile.png`, `food-log-mobile.png`, `training-mobile.png`, width-specific versions, and relevant saved/error states. The PR-only QA workflow uploads these as a review artifact; this does not publish or deploy the app. Screenshots are generated during test execution rather than checked in.

Browser execution needs a runtime that allows Chromium's local IPC sockets. A browser-launch failure is an environment blocker, not a passing UI test; the Node checks are not a substitute for DOM/layout verification.

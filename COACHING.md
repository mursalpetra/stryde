# Coaching workspace (draft)

This additive, buildless extension uses the existing STRYDE app and private account sync. No database migration, new service, or permissions change is required.

## Features

- Coach navigation with Review, Food log, Meal plan, Training, and Intake.
- Optional user-entered intake and goal priorities, with unknown context left unknown.
- Dated manual food/portion/protein/calorie entries, editable source/basis, soft removal and restore.
- User-entered provisional targets, versioned by effective date. No calorie calculation or deficit recommendation.
- Daily log-completeness confirmation. Protein averages use only complete days with protein in every entry; partial/unknown days are not zero. Estimates remain labeled.
- Editable daily meal plans and prep notes. Plans do not become consumed-food records.
- Dated, versioned proposed training blocks. Acceptance is separate and explicit; rep/load overrides preserve original exercise IDs, set counts, units and run schedule. Notes do not reschedule workouts. Custom exercise logging stays in Progress.
- Starting a strength timer or saving the first sets snapshots the entire session prescription. Subsequent accepted changes do not rewrite that snapshot. Completed legacy records are not backfilled with invented historical targets.
- Weekly recorded strength/runs, session RPE and recovery context. Existing comparable lifting and run analyses remain in Progress.

## Storage and privacy

The new version-1 namespace is `state.coaching` in the existing `stryde-v1` device payload, synced by the unchanged `account-cloud.js` to the authenticated owner's `stryde_cloud_state.payload`. There are no new tables, policies, storage buckets, secrets or endpoints. Existing conflict review and backups apply to the complete payload. Coaching edits are blocked while account-copy review is pending; unsaved coaching dialogs close on account change.

The existing app keeps its device copy on sign-out. The coaching UI discloses this. Use on a private device. Private photo APIs, Strava, and cloud-auth implementation are unchanged. Never put real intake, account payloads, photos or credentials in source, test fixtures or PR attachments.

Personal profile/baseline defaults were removed from active and legacy source; previously saved user state is retained. Removing current source values does **not** remove earlier Git history or published copies. An existing saved profile is not automatically imported into the new confirmed intake.

No AI service is called. Coaching discussed in chat must be entered/reviewed here; the app does not claim automatic chat synchronization, food-photo analysis, body-fat estimation, medical assessment or individualized calorie prescription.

## Verification

Run from the repository root:

```
for f in *.js; do node --check "$f"; done
node --test tests/*.mjs
python -m py_compile tests/test_browser.py
python tests/test_browser.py -v
```

The Node tests use a VM and deterministic, fully synthetic Supabase/auth/photo mocks. They test the real application modules but do not provide a browser DOM or layout engine.

The Playwright suite uses Python Playwright and `/usr/bin/chromium` (`CHROMIUM_PATH` can override it). It starts a loopback HTTP server, blocks external traffic, substitutes a synthetic SDK and uses fresh synthetic accounts. No live cloud reads/writes are performed.

### Draft verification results

- All JavaScript syntax checks: passed.
- Node tests: passed (model, prescription and account regressions).
- Python browser test syntax: passed.
- Browser interactions and mobile visual/screenshot checks: **not run successfully in this workspace**. Local Chromium launch is blocked by the execution environment, and the available cloud browser cannot access the local preview server. No public preview was deployed.
- Live account, Strava and photo end-to-end tests: not run. These services and security policies were not changed.

Known pre-existing account behavior: changing accounts during an outstanding cloud read can leave the new account waiting after the old read resolves. Account → Sync now recovers the normal copy-review flow. A deterministic test documents this race without changing auth code.

## Before publication

This is draft-only. Review the changes and run the browser suite and a small-screen visual pass, including interrupted forms, food edits/restores, account-copy selection, existing workouts and custom exercises. Verify the final commit's checks. Merging to `main` triggers the existing GitHub Pages deployment and needs separate publication approval. Do not enable auto-merge or deploy this draft automatically.

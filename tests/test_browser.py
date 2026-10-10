#!/usr/bin/env python3
"""Offline-only STRYDE browser regressions.

Run: python tests/test_browser.py -v
Requires Python Playwright and Chromium (CHROMIUM_PATH overrides /usr/bin/chromium).
Every browser context is fresh, uses synthetic fixtures, and blocks remote traffic.
The CDN SDK, authentication, cloud state, and photo storage are all local mocks.
No credentials, production account access, or cloud writes are used.
"""
from __future__ import annotations

import copy
import functools
import http.server
import json
import os
from pathlib import Path
import threading
import unittest

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CUSTOM_ID = "custom-00000000-0000-4000-8000-000000000001"
UID_A = "synthetic-account-a"
UID_B = "synthetic-account-b"


def fixture(label="Device"):
    """Legacy data deliberately spans every pre-extension persistence surface."""
    return {
        "week": 1, "selectedDay": 3, "lastSeenV2": True,
        "logs": {
            "1-0": {"status": "done", "notes": f"{label} recovery note"},
            "1-1": {"status": "done", "actual": "3", "minutes": "22", "effort": "3", "performed_on": "2026-10-06"},
            "1-2": {"status": "done", "performed_on": "2026-10-07", "exercises": {
                "0": {"weight": 8, "reps": "10,10,10", "unit": "lbs per hand", "effort": "moderate", "form": "good"}
            }},
        },
        "profile": {"weight": 70, "height": 170, "waist": "80", "testLabel": label},
        "approvedLoads": {"0": {"weight": 9, "previous": 8, "approvedAt": "2026-10-07T12:00:00Z"}},
        "milestones": [{"id": "synthetic-goal", "title": f"{label} training goal", "date": "2026-12-01", "status": "active", "kind": "strength"}],
        "customExercises": {CUSTOM_ID: {"id": CUSTOM_ID, "name": "Synthetic cable movement", "unit": "kg", "custom": True}},
        "extraWorkouts": [{"id": "synthetic-extra", "date": "2026-10-07", "kind": "strength", "status": "done", "name": "Synthetic extra workout", "durationMinutes": 30, "exercises": {
            CUSTOM_ID: {"name": "Synthetic cable movement", "custom": True, "weight": 20, "reps": "10,10", "unit": "kg", "effort": "moderate", "form": "good", "setup": "Synthetic station"}
        }}],
        "bodyChecks": [{"id": "synthetic-check", "date": "2026-10-06", "kg": 70, "note": "Synthetic fixture"}],
        "bodyCheckSettings": {"cadenceDays": 14, "reminders": False},
        "goalReflections": {"synthetic-goal": [{"id": "synthetic-reflection", "date": "2026-10-07", "feeling": 3, "reflection": "Synthetic reflection", "next": "Continue"}]},
        "benchmarkCycles": [{"id": "synthetic-benchmark", "title": "Synthetic benchmark", "startDate": "2026-10-01", "targetDate": "2027-01-08", "days": 100}],
        "runDuplicateLinks": {"extra:synthetic-run": "12345"},
    }


def coaching(label="Device"):
    return {
        "version": 1, "testLabel": label, "profile": {}, "targets": [],
        "meals": [{"id": f"synthetic-{label.lower()}", "date": "2026-10-09", "protein": 25, "calories": None,
                   "description": f"{label} synthetic meal", "portion": "One synthetic serving", "basis": "estimate"}],
        "days": {}, "mealPlans": {}, "blocks": [], "recovery": {},
    }


MOCK_SDK = (ROOT / "tests" / "mock_supabase.js").read_text()


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class BrowserRegressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), headless=True, args=["--no-sandbox"])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    def setUp(self):
        self.context = self.browser.new_context(viewport={"width": 390, "height": 844}, timezone_id="Asia/Shanghai", locale="en-US", service_workers="block")
        self.remote_requests = []
        self.unexpected_remote = []
        self.page_errors = []
        self.context.route("**/*", self.route)
        self.page = self.context.new_page()
        self.page.set_default_timeout(5000)
        self.page.on("pageerror", lambda error: self.page_errors.append(str(error)))
        self.page.on("dialog", lambda dialog: dialog.accept())

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.unexpected_remote, [], "Unexpected remote traffic was blocked")
        self.assertEqual(self.page_errors, [], "Uncaught browser JavaScript errors")

    def route(self, route):
        url = route.request.url
        if url.startswith(self.base + "/"):
            route.continue_()
        elif "cdn.jsdelivr.net/npm/@supabase/supabase-js@2/" in url:
            self.remote_requests.append(url)
            route.fulfill(status=200, content_type="application/javascript", body=MOCK_SDK)
        elif ".supabase.co/functions/v1/stryde-strava?" in url:
            self.remote_requests.append(url)
            route.fulfill(status=200, content_type="application/json", body='{"connected":false,"activities":[]}')
        else:
            # An allowlist prevents accidental telemetry, CDN, auth or database calls.
            self.unexpected_remote.append(url)
            route.abort()

    def boot(self, local=None, uid=None, cloud=None, owner=None, **cfg):
        local = fixture() if local is None else local
        cfg.update(local=local, cloud=cloud or {}, uid=uid, owner=owner)
        self.context.add_init_script("""
        (() => {
          const cfg = %s; window.__testConfig = cfg;
          const NativeDate = Date; const instant = NativeDate.parse('2026-10-10T04:00:00Z');
          window.Date = class extends NativeDate {constructor(...args){super(...(args.length ? args : [instant]));} static now(){return instant;}};
          if (!localStorage.getItem('__test_seeded')) {
            localStorage.clear(); sessionStorage.clear();
            localStorage.setItem('__test_seeded','yes');
            localStorage.setItem('stryde-v1', JSON.stringify(cfg.local));
            localStorage.setItem('__test_mock_user', JSON.stringify(cfg.uid ? {id:cfg.uid,email:cfg.uid+'@example.invalid'} : null));
            if(cfg.owner)localStorage.setItem('stryde-cloud-owner-v1',cfg.owner);
          }
        })();
        """ % json.dumps(cfg))
        self.page.goto(self.base + "/", wait_until="networkidle")
        self.page.wait_for_function("window.strydeAccountStatus && !['Checking account…'].includes(strydeAccountStatus().status)")
        return copy.deepcopy(local)

    def state(self):
        return self.page.evaluate("JSON.parse(JSON.stringify(state))")

    def stored(self):
        return self.page.evaluate("JSON.parse(localStorage.getItem('stryde-v1'))")

    def settle(self, predicate):
        self.page.wait_for_function(predicate)

    def test_legacy_state_survives_load_save_reload(self):
        expected = self.boot()
        self.page.evaluate("save()")
        for key, value in expected.items():
            self.assertEqual(self.stored()[key], value, key)
        self.page.reload(wait_until="networkidle")
        for key, value in expected.items():
            self.assertEqual(self.state()[key], value, key)
        self.assertEqual(self.page.evaluate("__mock.upserts.length"), 0)

    def test_coaching_namespace_saves_without_rewriting_legacy_data(self):
        before = self.boot()
        value = coaching()
        self.page.evaluate("value => {state.coaching=value;save()}", value)
        self.page.reload(wait_until="networkidle")
        self.assertEqual(self.state()["coaching"], value)
        for key, item in before.items():
            self.assertEqual(self.state()[key], item, key)

    def test_cloud_conflict_does_not_overwrite_either_copy(self):
        local = fixture(); local["coaching"] = coaching("Device")
        remote = copy.deepcopy(local); remote["coaching"] = coaching("Cloud")
        self.boot(local, UID_A, {UID_A: remote}, UID_A)
        self.settle("strydeAccountStatus().conflict")
        self.assertEqual(self.state()["coaching"], local["coaching"])
        self.assertEqual(self.page.evaluate("__mock.cloud[__mock.user.id]"), remote)
        self.assertEqual(self.page.evaluate("__mock.upserts"), [])
        self.page.evaluate("state.coaching.testLabel='Unsynced device edit';save();strydeOpenAccount()")
        self.assertIn("Neither has been overwritten", self.page.locator("#stryde-account-dialog").inner_text())
        self.assertEqual(self.page.evaluate("__mock.upserts"), [])
        self.page.locator("#stryde-use-cloud").click()
        self.settle("strydeAccountStatus().ready && !strydeAccountStatus().conflict")
        self.assertEqual(self.state()["coaching"], remote["coaching"])
        backups = self.page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('stryde-backup-before-cloud-')).map(k=>JSON.parse(localStorage.getItem(k)))")
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0]["coaching"]["testLabel"], "Unsynced device edit")
        self.assertEqual(self.page.evaluate("__mock.upserts"), [])

    def test_account_switch_requires_explicit_choice_and_isolates_coaching(self):
        a = fixture("Account A"); a["coaching"] = coaching("A")
        b = fixture("Account B"); b["coaching"] = coaching("B")
        self.boot(a, UID_A, {UID_A: a, UID_B: b}, UID_A)
        self.settle("strydeAccountStatus().ready")
        self.page.evaluate("uid=>__mock.switchUser(uid)", UID_B)
        self.settle("strydeAccountStatus().conflict && strydeAccountStatus().userId === 'synthetic-account-b'")
        self.assertEqual(self.state()["coaching"], a["coaching"])
        self.assertEqual(self.page.evaluate("__mock.upserts"), [])
        self.page.evaluate("strydeOpenAccount()")
        self.page.locator("#stryde-use-cloud").click()
        self.settle("strydeAccountStatus().ready && !strydeAccountStatus().conflict")
        self.assertEqual(self.state()["coaching"], b["coaching"])
        self.assertNotIn("Account A", json.dumps(self.state()))
        self.page.evaluate("state.coaching.testLabel='B updated';save()")
        self.settle("__mock.upserts.length===1")
        self.assertEqual(self.page.evaluate("__mock.upserts[0].user_id"), UID_B)
        self.assertEqual(self.page.evaluate("uid=>__mock.cloud[uid]", UID_A), a)
        self.page.evaluate("__mock.switchUser(null)")
        self.settle("!strydeAccountStatus().signedIn")
        self.page.evaluate("state.coaching.testLabel='Offline B';save()")
        self.assertEqual(self.page.evaluate("__mock.upserts.length"), 1)

    def test_offline_save_reload_and_reconnect_preserves_coaching(self):
        initial = fixture(); initial["coaching"] = coaching("Initial")
        self.boot(initial, UID_A, {UID_A: initial}, UID_A)
        self.settle("strydeAccountStatus().ready")
        self.context.set_offline(True)
        self.page.evaluate("__mock.failWrites=true;state.coaching.testLabel='Saved while offline';save()")
        self.settle("strydeAccountStatus().status.includes('saved on this device')")
        self.assertEqual(self.stored()["coaching"]["testLabel"], "Saved while offline")
        self.assertEqual(self.page.evaluate("__mock.cloud[__mock.user.id].coaching.testLabel"), "Initial")
        # Local asset serving resumes for reload; the cloud adapter remains offline.
        self.context.set_offline(False)
        self.context.add_init_script("window.__testOffline=true;")
        self.page.reload(wait_until="networkidle")
        self.assertEqual(self.state()["coaching"]["testLabel"], "Saved while offline")
        self.page.evaluate("__mock.failReads=false;__mock.failWrites=false;window.dispatchEvent(new Event('online'))")
        self.settle("strydeAccountStatus().status==='Synced'")
        self.assertEqual(self.page.evaluate("__mock.cloud[__mock.user.id].coaching.testLabel"), "Saved while offline")

    def test_private_photo_api_stays_authenticated_and_owner_scoped(self):
        seed = fixture()
        self.boot(seed, UID_A, {UID_A: seed}, UID_A)
        self.settle("strydeAccountStatus().ready")
        self.assertEqual(self.page.evaluate("Object.keys(strydePrivatePhotos).sort()"), ["download", "list", "remove", "upload"])
        result = self.page.evaluate("""async () => {
          const photo=await strydePrivatePhotos.upload(new Blob(['synthetic'],{type:'image/jpeg'}),{
           reference_type:'benchmark',reference_id:'synthetic-benchmark',photo_date:'2026-10-09',
           stage:'baseline',view_label:'front',caption:'Synthetic test image'});
          const list=await strydePrivatePhotos.list('benchmark','synthetic-benchmark');
          const blob=await strydePrivatePhotos.download(photo.object_path);
          await strydePrivatePhotos.remove(photo.id);
          return {photo,list,blobType:blob.type};
        }""")
        self.assertTrue(result["photo"]["object_path"].startswith(UID_A + "/"))
        self.assertIsNone(result["photo"].get("user_id"))
        self.assertEqual(len(result["list"]), 1)
        self.assertEqual(result["blobType"], "image/jpeg")
        calls = self.page.evaluate("__mock.calls")
        for call in calls:
            if call["kind"].startswith("photo-"):
                self.assertEqual(call["bucket"], "stryde-private-photos")
            if call.get("table") == "stryde_photo_entries" and call["kind"] in ("select", "delete"):
                self.assertIn(["user_id", UID_A], call["filters"])
        for key, value in seed.items():
            self.assertEqual(self.state()[key], value, key)
        errors = self.page.evaluate("""async () => {
          const failures=[];
          for (const op of [
            ()=>strydePrivatePhotos.download('synthetic-account-b/other.jpg'),
            ()=>strydePrivatePhotos.download('synthetic-account-a/../other.jpg'),
            ()=>strydePrivatePhotos.list('benchmark','../bad-reference'),
            ()=>strydePrivatePhotos.upload(new Blob(['x'],{type:'image/png'}),{reference_type:'goal',reference_id:'synthetic-goal',photo_date:'2026-10-09'})
          ]) {try{await op();failures.push(null)}catch(e){failures.push(e.message)}}
          return failures;
        }""")
        self.assertTrue(all(errors), errors)
        self.page.evaluate("__mock.switchUser(null)")
        self.settle("!strydeAccountStatus().signedIn")
        error = self.page.evaluate("strydePrivatePhotos.list('goal','synthetic-goal').catch(e=>e.message)")
        self.assertIn("Log in", error)

    def test_custom_exercise_save_does_not_complete_recovery_day(self):
        before = self.boot()
        exercise_count = self.page.evaluate("EX.length")
        self.page.evaluate("strydeTrainingHub.extra('2026-10-08')")
        self.page.locator('#hub-extra-form [name="name"]').fill("Synthetic recovery-day activity")
        self.page.locator('#hub-extra-form [name="minutes"]').fill("35")
        self.page.locator("#hub-add-exercise").select_option("custom")
        self.page.locator("#hub-custom-name").fill("Synthetic reverse fly")
        self.page.locator("#hub-custom-unit").select_option("kg")
        self.page.locator('[data-hub="add-exercise"]').click()
        row = self.page.locator("[data-extra-exercise]")
        custom_id = row.get_attribute("data-extra-exercise")
        row.locator('input[name^="weight"]').fill("12")
        row.locator('input[name^="reps"]').fill("10,10,8")
        row.locator('select[name^="effort"]').select_option("moderate")
        row.locator('select[name^="form"]').select_option("good")
        row.locator('input[name^="setup"]').fill("Synthetic station 2")
        self.page.locator('#hub-extra-form button[type="submit"]').click()
        self.settle("state.extraWorkouts.length===2")
        saved = self.state()
        self.assertEqual(saved["logs"], before["logs"])
        self.assertNotIn("1-3", saved["logs"])
        self.assertEqual(saved["customExercises"][custom_id]["name"], "Synthetic reverse fly")
        self.assertEqual(saved["extraWorkouts"][-1]["date"], "2026-10-08")
        self.assertEqual(saved["extraWorkouts"][-1]["exercises"][custom_id]["reps"], "10,10,8")
        self.assertEqual(self.page.evaluate("EX.length"), exercise_count)
        self.assertEqual(self.page.evaluate("strydeProgressModel.planOn('2026-10-08').kind"), "recovery")
        self.assertEqual(self.page.evaluate("strydeProgressModel.dayStatus('2026-10-08',[]).code"), "rest")
        self.assertEqual(self.page.evaluate("strydeProgressModel.dayStatus('2026-10-08',strydeProgressModel.records()).code"), "done")
        self.page.reload(wait_until="networkidle")
        self.assertEqual(self.state()["customExercises"][custom_id], saved["customExercises"][custom_id])
        self.page.evaluate("strydeTrainingHub.extra('2026-10-09')")
        self.page.locator("#hub-add-exercise").select_option(custom_id)
        self.page.locator('[data-hub="add-exercise"]').click()
        self.assertIn("Last log: 12 kg", self.page.locator("[data-extra-exercise]").inner_text())
        self.page.locator('[data-hub="close"]').click()
        self.assertEqual(self.state()["extraWorkouts"], saved["extraWorkouts"])


    def test_real_food_entry_save_reload_preserves_unknown_values_and_legacy_data(self):
        before = self.boot()
        self.page.evaluate("strydeCoaching.setTab('food')")
        self.page.locator('[data-coach="meal-add"]').click()
        form = self.page.locator("#coach-meal-form")
        form.locator('[name="description"]').fill("Synthetic food entry")
        form.locator('[name="portion"]').fill("One synthetic serving")
        form.locator('[name="protein"]').fill("25")
        form.locator('button').filter(has_text="Save entry").click()
        self.settle("state.coaching?.meals.length===1")
        item = self.state()["coaching"]["meals"][0]
        self.assertEqual(item["protein"], 25)
        self.assertIsNone(item["calories"])
        self.assertFalse(self.state()["coaching"]["days"]["2026-10-10"]["complete"])
        self.page.locator("#coach-day-complete").check()
        self.assertEqual(self.page.evaluate("strydeCoachingModel.weekSummary(strydeCoachingModel.data(state)).average"), 25)
        self.page.reload(wait_until="networkidle")
        self.assertEqual(self.state()["coaching"]["meals"][0], item)
        for key, value in before.items():
            self.assertEqual(self.state()[key], value, key)

    def test_account_switch_closes_unsaved_coaching_form_and_blocks_conflicted_edits(self):
        a = fixture("Account A"); a["coaching"] = coaching("A")
        b = fixture("Account B"); b["coaching"] = coaching("B")
        self.boot(a, UID_A, {UID_A: a, UID_B: b}, UID_A)
        self.settle("strydeAccountStatus().ready")
        self.page.evaluate("strydeCoaching.setTab('food')")
        self.page.locator('[data-coach="meal-add"]').click()
        self.page.locator('#coach-meal-form [name="description"]').fill("Unsaved account A draft")
        self.page.evaluate("uid=>__mock.switchUser(uid)", UID_B)
        self.settle("strydeAccountStatus().conflict")
        self.assertEqual(self.page.locator(".coach-dialog[open]").count(), 0)
        self.page.evaluate("strydeCoaching.setTab('food')")
        self.page.locator('[data-coach="meal-add"]').click()
        self.assertEqual(self.page.locator(".coach-dialog[open]").count(), 0)
        self.assertIn("Resolve your account", self.page.locator(".coach-notice").inner_text())
        self.assertEqual(self.state()["coaching"], a["coaching"])
        self.assertEqual(self.page.evaluate("__mock.upserts"), [])


    def screenshot(self, filename):
        folder = ROOT / "tests" / "screenshots"
        folder.mkdir(parents=True, exist_ok=True)
        self.page.screenshot(path=str(folder / filename), full_page=True, animations="disabled")

    def assert_no_horizontal_overflow(self, label):
        geometry = self.page.evaluate("""() => ({
          viewport: innerWidth, document: document.documentElement.scrollWidth,
          offenders: [...document.querySelectorAll('body *')].filter(e => {
            const r=e.getBoundingClientRect(); return r.width>0 && (r.right>innerWidth+1 || r.left< -1);
          }).slice(0,10).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,60)}))
        })""")
        self.assertLessEqual(geometry["document"], geometry["viewport"] + 1, f"{label}: {geometry}")

    def test_coach_tabs_fit_small_mobile_widths_and_capture_synthetic_screenshots(self):
        seed = fixture("Synthetic mobile fixture")
        seed["coaching"] = coaching("Synthetic")
        seed["coaching"]["days"]["2026-10-09"] = {"complete": True}
        seed["coaching"]["profile"] = {"priority": "Synthetic strength and running routine", "foodPreferences": "Synthetic flexible meal preferences"}
        self.boot(seed)
        names = {"overview": "coach-review", "food": "food-log", "meals": "meal-plan", "training": "training", "profile": "intake"}
        for width in (320, 390):
            self.page.set_viewport_size({"width": width, "height": 844})
            for tab, filename in names.items():
                with self.subTest(width=width, tab=tab):
                    self.page.evaluate("tab=>strydeCoaching.setTab(tab)", tab)
                    if tab == "food":
                        self.page.locator("#coach-food-date").fill("2026-10-09")
                        self.page.locator("#coach-food-date").dispatch_event("change")
                    self.page.locator(".coach-content").wait_for(state="visible")
                    self.screenshot(f"{filename}-mobile-{width}.png")
                    if width == 390:
                        self.screenshot(f"{filename}-mobile.png")
                    self.assert_no_horizontal_overflow(f"{tab} at {width}px")

    def test_private_intake_and_meal_plan_save_reload_without_logging_planned_food(self):
        before = self.boot()
        self.page.evaluate("strydeCoaching.setTab('profile')")
        form = self.page.locator("#coach-profile")
        form.locator('[name="goals"][value="General fitness"]').check()
        form.locator('[name="priority"]').fill("Synthetic consistent training goal")
        form.locator('[name="daysPerWeek"]').fill("3")
        form.locator('[name="minutes"]').fill("40")
        form.locator('[name="equipment"]').fill("Synthetic dumbbells and training station")
        form.locator('[name="foodPreferences"]').fill("Synthetic simple meal preference")
        form.get_by_role("button", name="Save private intake", exact=True).click()
        self.settle("state.coaching?.profile.priority==='Synthetic consistent training goal'")
        profile = self.state()["coaching"]["profile"]
        self.assertEqual(profile["goals"], ["General fitness"])
        self.assertEqual(profile["daysPerWeek"], 3)
        self.assertIsNone(profile["age"])
        self.assertIsNone(profile["height"])
        self.page.evaluate("strydeCoaching.setTab('meals')")
        self.page.locator("#coach-plan-date").fill("2026-10-11")
        self.page.locator("#coach-plan-date").dispatch_event("change")
        plan_form = self.page.locator("#coach-meal-plan")
        plan_values = {"breakfast": "Synthetic breakfast plan", "lunch": "Synthetic lunch plan", "dinner": "Synthetic dinner plan", "snack": "Synthetic snack plan", "notes": "Synthetic preparation note"}
        for name, value in plan_values.items():
            plan_form.locator(f'[name="{name}"]').fill(value)
        plan_form.get_by_role("button", name="Save meal plan", exact=True).click()
        self.settle("state.coaching.mealPlans['2026-10-11']?.breakfast==='Synthetic breakfast plan'")
        self.assertEqual(self.state()["coaching"]["meals"], [])
        self.page.reload(wait_until="networkidle")
        self.assertEqual(self.state()["coaching"]["profile"], profile)
        self.page.evaluate("strydeCoaching.setTab('profile')")
        self.assertEqual(self.page.locator('#coach-profile [name="priority"]').input_value(), profile["priority"])
        self.page.evaluate("strydeCoaching.setTab('meals')")
        self.page.locator("#coach-plan-date").fill("2026-10-11")
        self.page.locator("#coach-plan-date").dispatch_event("change")
        for name, value in plan_values.items():
            self.assertEqual(self.page.locator(f'#coach-meal-plan [name="{name}"]').input_value(), value)
        for key, value in before.items():
            self.assertEqual(self.state()[key], value, key)

    def test_food_edit_remove_restore_reopens_complete_days_and_cancel_is_safe(self):
        seed = fixture(); seed["coaching"] = coaching("Synthetic")
        seed["coaching"]["meals"][0]["date"] = "2026-10-10"
        seed["coaching"]["days"]["2026-10-10"] = {"complete": True}
        self.boot(seed)
        self.page.evaluate("strydeCoaching.setTab('food')")
        self.assertTrue(self.page.locator("#coach-day-complete").is_checked())
        self.page.locator('[data-coach="meal-edit"]').click()
        form = self.page.locator("#coach-meal-form")
        form.locator('[name="protein"]').fill("30")
        form.locator('[name="portion"]').fill("One updated synthetic serving")
        form.get_by_role("button", name="Save entry", exact=True).click()
        self.settle("state.coaching.meals[0].protein===30")
        self.assertFalse(self.state()["coaching"]["days"]["2026-10-10"]["complete"])
        self.page.locator("#coach-day-complete").check()
        self.page.locator('[data-coach="meal-remove"]').click()
        self.settle("state.coaching.meals[0].deleted===true")
        self.assertFalse(self.state()["coaching"]["days"]["2026-10-10"]["complete"])
        self.assertTrue(self.page.locator("#coach-day-complete").is_disabled())
        self.page.get_by_text("Removed entries", exact=True).click()
        self.page.locator('[data-coach="meal-restore"]').click()
        self.settle("state.coaching.meals[0].deleted===false")
        self.assertFalse(self.page.locator("#coach-day-complete").is_checked())
        self.assertEqual(len(self.state()["coaching"]["meals"]), 1)
        before_cancel = self.state()["coaching"]
        self.page.locator('[data-coach="meal-edit"]').click()
        self.page.locator('#coach-meal-form [name="description"]').fill("Unsaved synthetic change")
        self.page.get_by_role("button", name="Cancel", exact=True).click()
        self.assertEqual(self.state()["coaching"], before_cancel)
        self.screenshot("food-log-edited-restored-mobile.png")
        self.page.reload(wait_until="networkidle")
        self.assertEqual(self.state()["coaching"], before_cancel)

    def test_training_proposal_acceptance_and_timer_snapshot_ui_flow(self):
        before = self.boot()
        self.page.evaluate("strydeCoaching.setTab('training')")
        self.page.locator('[data-coach="block-add"]').click()
        form = self.page.locator("#coach-block-form")
        form.locator('[name="title"]').fill("Synthetic training block")
        form.locator('[name="start"]').fill("2026-10-10")
        form.locator('[name="end"]').fill("2026-10-31")
        form.locator('[name="rationale"]').fill("Synthetic review of repeatable sets and recovery")
        form.locator('[name="include-0"]').check()
        form.locator('[name="reps-0"]').fill("12")
        form.locator('[name="weight-0"]').fill("10")
        form.get_by_role("button", name="Save proposal for review", exact=True).click()
        self.settle("state.coaching?.blocks.length===1")
        self.assertEqual(self.state()["coaching"]["blocks"][0]["status"], "proposed")
        self.assertEqual(self.state()["logs"], before["logs"])
        self.page.locator('[data-coach="block-accept"]').click()
        self.assertEqual(self.state()["coaching"]["blocks"][0]["status"], "proposed")
        self.page.locator('[data-coach="block-confirm"]').click()
        self.settle("state.coaching.blocks[0].status==='accepted'")
        self.screenshot("training-accepted-mobile.png")
        self.page.evaluate("state.week=2;openSession(2)")
        self.page.locator('[data-time-action="start"]').click()
        self.settle("state.logs['2-2']?.timing?.state==='running'")
        snapshot = self.state()["logs"]["2-2"]["prescriptionSnapshot"]
        self.assertEqual(snapshot["exercises"]["0"]["weight"], 10)
        self.assertEqual(snapshot["exercises"]["0"]["blockVersion"], 1)
        self.assertEqual(len(snapshot["exercises"]), 4)
        self.page.evaluate("strydeCoaching.setTab('training')")
        self.page.locator('[data-coach="block-revise"]').click()
        form = self.page.locator("#coach-block-form")
        form.locator('[name="title"]').fill("Synthetic revised block")
        form.locator('[name="reps-0"]').fill("8")
        form.locator('[name="weight-0"]').fill("15")
        form.get_by_role("button", name="Save proposal for review", exact=True).click()
        self.settle("state.coaching.blocks.length===2")
        self.page.locator('[data-coach="block-accept"]').click()
        self.page.locator('[data-coach="block-confirm"]').click()
        self.settle("state.coaching.blocks[1].status==='accepted'")
        self.page.evaluate("openSession(2)")
        self.page.locator('.excard[onclick="openExercise(0)"]').click()
        self.assertEqual(self.page.locator("#lift-weight").input_value(), "10")
        self.assertEqual(self.page.locator("#rep0").get_attribute("placeholder"), "12")
        self.page.locator("#lift-weight").fill("10")
        for index in range(3):
            self.page.locator(f"#rep{index}").fill("12")
        self.page.locator("#lift-effort").select_option("moderate")
        self.page.locator("#lift-form").select_option("good")
        self.page.get_by_role("button", name="Save sets & next exercise →", exact=True).click()
        self.assertEqual(self.state()["logs"]["2-2"]["prescriptionSnapshot"], snapshot)
        self.page.evaluate("go('progress')")
        self.assertIsNone(self.page.evaluate("target(0).blockId || null"))
        self.page.reload(wait_until="networkidle")
        self.assertEqual(self.state()["logs"]["2-2"]["prescriptionSnapshot"], snapshot)
        for key, value in before["logs"].items():
            self.assertEqual(self.state()["logs"][key], value, key)

    def test_recovery_date_change_loads_saved_values_and_keeps_workout_logs_separate(self):
        seed = fixture(); seed["coaching"] = coaching("Synthetic")
        seed["coaching"]["recovery"] = {
            "2026-10-08": {"sleep": 7.5, "energy": 3, "comfort": "comfortable", "rest": True, "note": "Synthetic earlier recovery"},
            "2026-10-10": {"sleep": 8, "energy": 4, "comfort": "unknown", "rest": False, "note": "Synthetic current check-in"},
        }
        before = self.boot(seed)
        self.page.evaluate("strydeCoaching.setTab('overview')")
        self.page.locator('[data-coach="recovery"]').click()
        form = self.page.locator("#coach-recovery-form")
        self.assertEqual(form.locator('[name="sleep"]').input_value(), "8")
        form.locator('[name="date"]').fill("2026-10-08")
        self.page.locator('#coach-recovery-form [name="date"]').dispatch_event("change")
        form = self.page.locator("#coach-recovery-form")
        self.assertEqual(form.locator('[name="sleep"]').input_value(), "7.5")
        self.assertEqual(form.locator('[name="energy"]').input_value(), "3")
        self.assertEqual(form.locator('[name="note"]').input_value(), "Synthetic earlier recovery")
        self.assertTrue(form.locator('[name="rest"]').is_checked())
        form.locator('[name="note"]').fill("Synthetic revised recovery note")
        form.get_by_role("button", name="Save recovery check-in", exact=True).click()
        self.settle("state.coaching.recovery['2026-10-08'].note==='Synthetic revised recovery note'")
        self.assertEqual(self.state()["coaching"]["recovery"]["2026-10-10"], before["coaching"]["recovery"]["2026-10-10"])
        self.assertEqual(self.state()["logs"], before["logs"])
        self.assertNotIn("1-3", self.state()["logs"])
        self.page.reload(wait_until="networkidle")
        self.assertEqual(self.state()["coaching"]["recovery"]["2026-10-08"]["sleep"], 7.5)

    def test_cloud_payload_replacement_blocks_a_stale_open_coaching_form(self):
        seed = fixture(); seed["coaching"] = coaching("Initial")
        self.boot(seed, UID_A, {UID_A: seed}, UID_A)
        self.settle("strydeAccountStatus().ready")
        self.page.evaluate("strydeCoaching.setTab('food')")
        self.page.locator('[data-coach="meal-add"]').click()
        form = self.page.locator("#coach-meal-form")
        form.locator('[name="description"]').fill("Stale synthetic draft")
        form.locator('[name="portion"]').fill("One synthetic serving")
        form.locator('[name="protein"]').fill("20")
        remote = copy.deepcopy(seed); remote["coaching"] = coaching("New cloud payload")
        self.page.evaluate("remote=>{__mock.cloud[__mock.user.id]=remote;strydeOpenAccount()}", remote)
        self.page.locator("#stryde-sync-now").click()
        self.settle("state.coaching.testLabel==='New cloud payload' && strydeAccountStatus().ready")
        self.page.locator('#stryde-account-dialog [data-close-account]').first.click()
        self.page.locator('#coach-meal-form').get_by_role("button", name="Save entry", exact=True).click()
        self.assertIn("changed while this form was open", self.page.locator("[data-coach-error]").inner_text())
        self.assertEqual(self.state()["coaching"], remote["coaching"])
        self.assertEqual(self.page.evaluate("__mock.upserts"), [])
        self.screenshot("stale-form-blocked-mobile.png")


if __name__ == "__main__":
    unittest.main()

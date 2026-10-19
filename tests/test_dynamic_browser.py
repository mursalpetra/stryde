#!/usr/bin/env python3
"""Synthetic adaptive scheduling UI checks, with the existing offline-only browser harness.

Run: python tests/test_dynamic_browser.py -v
Every request is intercepted by BrowserRegressions; no production account/data is used.
"""
from __future__ import annotations

import copy
import unittest

from test_browser import BrowserRegressions, UID_A, UID_B, coaching, fixture


TODAY = "2026-10-10"


def adaptive_fixture(label="Synthetic adaptive"):
    seed = fixture(label)
    seed.update({"week": 1, "selectedDay": 5, "logs": {}, "extraWorkouts": [], "runDuplicateLinks": {}})
    seed["coaching"] = coaching(label)
    seed["milestones"] = [{"id": "synthetic-race", "kind": "race", "status": "active", "title": "Synthetic race", "date": "2026-12-20"}]
    return seed


class DynamicBrowserRegressions(BrowserRegressions):
    def boot_adaptive(self, seed=None, **kwargs):
        seed = adaptive_fixture() if seed is None else seed
        result = self.boot(seed, **kwargs)
        self.page.locator("[data-adaptive-focus]").wait_for(state="visible")
        return result

    def check_readiness(self, *, comfort="comfortable", soreness="none", energy="4", minutes="30", history=True):
        self.page.locator('[data-adaptive-focus] [data-adaptive="check"]').click()
        form = self.page.locator("#adaptive-readiness-form")
        form.locator('[name="comfort"]').select_option(comfort)
        form.locator('[name="soreness"]').select_option(soreness)
        form.locator('[name="energy"]').fill(energy)
        form.locator('[name="minutes"]').fill(minutes)
        form.locator('[name="historyComplete"]').set_checked(history)
        form.locator('[type="submit"]').click()
        self.page.locator(".adaptive-choices").wait_for(state="visible")

    def choose_and_start(self, focus="upper"):
        self.page.locator(f'[data-adaptive="choose"][data-choice="{focus}"]').click()
        self.page.locator('[data-adaptive="start"]').click()
        self.page.locator("#adaptive-workout-form").wait_for(state="visible")

    def complete_strength(self):
        form = self.page.locator("#adaptive-workout-form")
        for field in form.locator('[name^="weight-"]').all():
            field.fill("10")
        # Record one actual set, explicitly leaving later prescribed sets unfilled.
        for field in form.locator('[name^="reps-"][name$="-0"]').all():
            field.fill("8")
        form.locator('[name="durationMinutes"]').fill("24")
        form.locator('[name="notes"]').fill("Synthetic completed-session fixture")
        form.locator('[type="submit"]').click()
        self.settle("(state.extraWorkouts||[]).some(w=>w.source==='adaptive-schedule')")

    def test_adaptive_readiness_and_rest_never_fabricate_workout_completion(self):
        before = self.boot_adaptive()
        self.check_readiness()
        self.assertEqual(self.state()["logs"], before["logs"])
        self.assertEqual(self.state()["extraWorkouts"], [])
        self.page.locator('[data-adaptive="rest"]').click()
        self.assertEqual(self.state()["extraWorkouts"], [])
        check = self.state()["adaptiveSchedule"]["checkins"][TODAY]
        self.assertEqual(check["energy"], 4)
        self.assertTrue(check["historyComplete"])
        self.assertTrue(check["restChosen"])
        self.assertEqual(self.page.evaluate("strydeScheduleModel.build(state,[],\"2026-10-10\").days[\"2026-10-10\"].type"), "recovery")
        self.page.reload(wait_until="networkidle")
        self.assertEqual(self.state()["adaptiveSchedule"]["checkins"][TODAY], check)
        self.assertEqual(self.state()["logs"], before["logs"])
        self.assertEqual(self.state()["extraWorkouts"], [])

    def test_adaptive_completed_strength_is_saved_once_and_rebalances_remaining_days(self):
        before = self.boot_adaptive()
        self.check_readiness()
        self.choose_and_start("lower")
        self.assertEqual(self.state()["extraWorkouts"], [])
        snapshot = copy.deepcopy(self.state()["adaptiveSchedule"]["activeSession"]["snapshot"])
        self.complete_strength()
        actual = self.state()["extraWorkouts"]
        self.assertEqual(len(actual), 1)
        self.assertEqual(actual[0]["kind"], "strength")
        self.assertEqual(actual[0]["date"], TODAY)
        self.assertEqual(actual[0]["prescriptionSnapshot"], snapshot)
        self.assertEqual(actual[0]["durationMinutes"], 24)
        self.assertEqual(self.state()["logs"], before["logs"])
        self.assertFalse(self.state()["adaptiveSchedule"].get("activeSession"))
        plan = self.page.evaluate("strydeScheduleModel.build(state,strydeProgressModel.records(state,[]),'2026-10-10')")
        self.assertEqual(plan["days"][TODAY]["type"], "completed")
        self.assertNotIn(plan["days"]["2026-10-11"]["type"], ["lower", "easy", "long"])
        self.page.reload(wait_until="networkidle")
        self.assertEqual(self.state()["extraWorkouts"], actual)
        self.assertEqual(self.state()["logs"], before["logs"])
        self.assertEqual(self.page.locator('[data-adaptive-focus] [data-adaptive="check"]').count(), 0)

    def test_adaptive_start_snapshot_survives_reload_and_later_prescription_changes(self):
        self.boot_adaptive()
        self.check_readiness()
        self.choose_and_start("upper")
        snapshot = copy.deepcopy(self.state()["adaptiveSchedule"]["activeSession"]["snapshot"])
        self.page.evaluate("""() => {state.coaching.blocks.push({id:'synthetic-later',version:99,status:'accepted',title:'Synthetic later revision',start:'2026-10-10',end:'2026-12-20',prescriptions:{4:{sets:2,reps:5,weight:99,unit:'machine display'}}});save();}""")
        self.page.reload(wait_until="networkidle")
        self.assertEqual(self.state()["adaptiveSchedule"]["activeSession"]["snapshot"], snapshot)
        self.assertEqual(self.state()["extraWorkouts"], [])
        self.page.locator('[data-adaptive="resume"]').click()
        self.page.locator("#adaptive-workout-form").wait_for(state="visible")
        self.complete_strength()
        self.assertEqual(self.state()["extraWorkouts"][0]["prescriptionSnapshot"], snapshot)
        self.assertNotEqual(snapshot["exercises"][0]["reps"], 5)

    def test_adaptive_pain_and_soreness_gate_the_actual_options(self):
        self.boot_adaptive()
        self.check_readiness(comfort="pain")
        self.assertEqual(self.page.locator('[data-adaptive="choose"]').count(), 0)
        self.assertEqual(self.page.locator('[data-adaptive="rest"]').count(), 1)
        self.page.locator('[data-adaptive="rest"]').click()
        self.check_readiness(soreness="lower")
        self.assertEqual(self.page.locator('[data-adaptive="choose"][data-choice="upper"]').count(), 1)
        self.assertEqual(self.page.locator('[data-adaptive="choose"][data-choice="lower"]').count(), 0)
        self.assertEqual(self.page.locator('[data-adaptive="choose"][data-choice="easy"]').count(), 0)
        self.assertEqual(self.state()["extraWorkouts"], [])

    def test_adaptive_future_preview_never_starts_or_logs_a_future_workout(self):
        before = self.boot_adaptive()
        self.page.evaluate("selectDay(6)")
        self.page.locator('[data-adaptive="preview"]').click()
        self.assertIn("preview", self.page.locator(".adaptive-dialog").inner_text().lower())
        self.assertEqual(self.page.locator('[data-adaptive="start"]').count(), 0)
        self.assertEqual(self.page.locator("#adaptive-workout-form").count(), 0)
        self.assertEqual(self.state()["logs"], before["logs"])
        self.assertEqual(self.state()["extraWorkouts"], [])

    def test_adaptive_account_switch_dismisses_unsaved_form_and_blocks_conflicted_changes(self):
        a, b = adaptive_fixture("A"), adaptive_fixture("B")
        self.boot_adaptive(a, uid=UID_A, cloud={UID_A: a, UID_B: b}, owner=UID_A)
        self.settle("strydeAccountStatus().ready")
        self.page.locator('[data-adaptive-focus] [data-adaptive="check"]').click()
        self.page.locator('#adaptive-readiness-form [name="energy"]').fill("4")
        self.page.evaluate("uid=>__mock.switchUser(uid)", UID_B)
        self.settle("strydeAccountStatus().conflict")
        self.assertEqual(self.page.locator(".adaptive-dialog[open]").count(), 0)
        self.page.locator('[data-adaptive-focus] [data-adaptive="check"]').click()
        self.assertEqual(self.page.locator(".adaptive-dialog[open]").count(), 0)
        self.assertIn("Resolve your account", self.page.locator(".adaptive-notice").inner_text())
        self.assertEqual(self.state()["extraWorkouts"], [])
        self.assertEqual(self.state()["logs"], {})
        self.assertEqual(self.page.evaluate("__mock.upserts"), [])

    def test_adaptive_stale_same_account_payload_blocks_the_open_form_save(self):
        self.boot_adaptive()
        self.page.locator('[data-adaptive-focus] [data-adaptive="check"]').click()
        form = self.page.locator("#adaptive-readiness-form")
        form.locator('[name="comfort"]').select_option("comfortable")
        form.locator('[name="energy"]').fill("4")
        form.locator('[name="minutes"]').fill("30")
        form.locator('[name="historyComplete"]').check()
        self.page.evaluate("state=JSON.parse(JSON.stringify(state))")
        form.locator('[type="submit"]').click()
        self.assertIn("changed", self.page.locator("[data-adaptive-error]").inner_text())
        self.assertNotIn("adaptiveSchedule", self.state())
        self.assertEqual(self.state()["extraWorkouts"], [])

    def test_adaptive_supported_long_run_preserves_its_distance_and_duration_prescription(self):
        seed = adaptive_fixture()
        seed["extraWorkouts"] = [
            {"id": "synthetic-run-a", "status": "done", "kind": "run", "date": "2026-10-27", "distanceKm": 5, "durationMinutes": 45},
            {"id": "synthetic-run-b", "status": "done", "kind": "run", "date": "2026-10-30", "distanceKm": 7, "durationMinutes": 55},
        ]
        self.boot_adaptive(seed)
        self.page.evaluate("""() => {const PreviousDate=Date;window.Date=class extends PreviousDate{constructor(...args){super(...(args.length?args:['2026-11-01T04:00:00Z']));}static now(){return PreviousDate.parse('2026-11-01T04:00:00Z');}};strydeAdaptiveSchedule.refresh();}""")
        self.check_readiness(minutes="60")
        self.choose_and_start("long")
        snapshot = self.state()["adaptiveSchedule"]["activeSession"]["snapshot"]
        self.assertEqual(snapshot["type"], "long")
        self.assertEqual(snapshot["km"], 6)
        self.assertEqual(snapshot["minutes"], 55)
        form = self.page.locator("#adaptive-workout-form")
        form.locator('[name="distanceKm"]').fill("5.5")
        form.locator('[name="durationMinutes"]').fill("45")
        form.locator('[name="rpe"]').fill("3")
        form.locator('[type="submit"]').click()
        self.settle("(state.extraWorkouts||[]).length===3")
        actual = self.state()["extraWorkouts"][-1]
        self.assertEqual(actual["adaptiveType"], "long")
        self.assertEqual(actual["distanceKm"], 5.5)
        self.assertEqual(actual["prescriptionSnapshot"], snapshot)
        self.assertFalse(self.state()["adaptiveSchedule"].get("activeSession"))

    def test_adaptive_all_core_screens_fit_320_and_390_pixel_mobile_widths(self):
        self.boot_adaptive()

        def inspect(stage):
            for width in (320, 390):
                self.page.set_viewport_size({"width": width, "height": 844})
                self.assert_no_horizontal_overflow(f"adaptive {stage} at {width}px")
                self.screenshot(f"adaptive-{stage}-{width}.png")
                dialog = self.page.locator(".adaptive-dialog[open]")
                if dialog.count():
                    geometry = dialog.evaluate("e=>({scroll:e.scrollWidth,client:e.clientWidth,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})")
                    self.assertLessEqual(geometry["scroll"], geometry["client"] + 1, f"Dialog overflow: {stage} {geometry}")
                    self.assertGreaterEqual(geometry["left"], -1)
                    self.assertLessEqual(geometry["right"], width + 1)

        inspect("today")
        self.page.locator('[data-adaptive-focus] [data-adaptive="check"]').click()
        inspect("readiness")
        form = self.page.locator("#adaptive-readiness-form")
        form.locator('[name="comfort"]').select_option("comfortable")
        form.locator('[name="energy"]').fill("4")
        form.locator('[name="minutes"]').fill("30")
        form.locator('[name="historyComplete"]').check()
        form.locator('[type="submit"]').click()
        inspect("choices")
        self.page.locator('[data-adaptive="choose"][data-choice="upper"]').click()
        inspect("prescription")
        self.page.locator('[data-adaptive="start"]').click()
        inspect("actual-log")
        self.assertEqual(self.state()["extraWorkouts"], [])


def load_tests(loader, tests, pattern):
    # Reuse the harness without silently rerunning every inherited baseline test.
    return unittest.TestSuite(DynamicBrowserRegressions(name) for name in sorted(DynamicBrowserRegressions.__dict__) if name.startswith("test_adaptive_"))


if __name__ == "__main__":
    unittest.main()

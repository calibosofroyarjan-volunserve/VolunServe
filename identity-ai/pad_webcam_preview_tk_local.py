"""Local GUI webcam preview for the VolunServe exploratory PAD research pilot.

Uses Python's built-in Tkinter PNG PhotoImage, so it DOES NOT require OpenCV's
GUI functions, Pillow, browser permissions, web servers or extra dependencies.
Frames are displayed transiently only on the participant's computer.
NO photos, videos, face crops, scores or detection coordinates are written
to disk, transmitted, logged, or returned to VolunServe/Firebase.

This is research UI, not identity verification. Keep the official 2.7x crop
and all PAD/class-map limitations. One physical presentation = one trial.
"""
import base64
import time
from functools import partial

import cv2
import numpy as np

import evaluate_pad_scales_local as paired
import evaluate_pad_ensemble_local as ensemble
from pad_frame_guidance_local import analyze_framing, draw_guidance, HELP
from pad_camera_quality_local import quality_hint
from run_pad_webcam_trials_local import valid_frame, CATEGORIES


PAIR_OUTCOMES = frozenset(("live", "attack", "inconclusive"))
MAX_FRAMES_PER_TRIAL = 8


def fit_preview_only(frame, *, max_width=690, max_height=450):
    """Fit higher-resolution on-screen PNG; never change the PAD model input."""
    height, width = frame.shape[:2]
    factor = min(1.0, max_width / width, max_height / height)
    if factor >= 1:
        return frame
    display_size = (max(1, round(width * factor)),
                    max(1, round(height * factor)))
    return cv2.resize(frame, display_size, interpolation=cv2.INTER_AREA)


class TrialProgress:
    """Pure state used by Tk and testable without a real camera/display."""
    def __init__(self, *, trials_per_class=3, enabled_categories=CATEGORIES,
                 four_hypothesis=False):
        if not isinstance(trials_per_class, int) or not 1 <= trials_per_class <= 10:
            raise ValueError("INVALID_TRIAL_COUNT")
        if (not isinstance(enabled_categories, tuple) or
                not enabled_categories or len(set(enabled_categories)) != len(enabled_categories) or
                any(kind not in CATEGORIES for kind in enabled_categories) or
                tuple(kind for kind in CATEGORIES if kind in enabled_categories) != enabled_categories):
            raise ValueError("INVALID_PRESENTATION_CATEGORY_SELECTION")
        self.trials_per_class = trials_per_class
        self.enabled_categories = enabled_categories
        self.four_hypothesis = four_hypothesis is True
        self.trials = {kind: [] for kind in CATEGORIES}

    @property
    def complete(self):
        return all(len(self.trials[kind]) == self.trials_per_class
                   for kind in self.enabled_categories)

    @property
    def current(self):
        for kind in self.enabled_categories:
            if len(self.trials[kind]) < self.trials_per_class:
                return kind, len(self.trials[kind]) + 1
        return None, None

    def undo_last(self):
        """Discard only the most recently recorded label/count in RAM."""
        for kind in reversed(self.enabled_categories):
            if self.trials[kind]:
                return kind, self.trials[kind].pop()
        return None, None

    def add(self, pair):
        kind, _number = self.current
        if kind is None:
            raise ValueError("PILOT_ALREADY_COMPLETE")
        if self.four_hypothesis:
            # A four-model trial contains only categorical in-memory counts,
            # not model vectors, scores, frames, filenames or subjects.
            valid = (
                type(pair) is dict and
                set(pair) == {"hypotheses", "ensemble", "anyHypothesisObservedLive"} and
                type(pair["hypotheses"]) in (tuple, list) and
                len(pair["hypotheses"]) == 4 and
                all(x in PAIR_OUTCOMES for x in pair["hypotheses"]) and
                pair["ensemble"] in PAIR_OUTCOMES and
                type(pair["anyHypothesisObservedLive"]) is bool
            )
        else:
            valid = (isinstance(pair, tuple) and len(pair) == 2 and
                     all(value in PAIR_OUTCOMES for value in pair))
        if not valid:
            raise ValueError("INVALID_UNTRUSTED_TRIAL_OUTCOME")
        self.trials[kind].append(pair)


def cropped_pad_input(frame, guidance):
    """Only the complete 2.7x frame context (no padding/edge bypass)."""
    if (not valid_frame(frame) or not guidance.capture_ready or
            guidance.context_rect is None):
        return None
    left, top, right, bottom = guidance.context_rect
    if (not 0 <= left < right <= frame.shape[1] or
            not 0 <= top < bottom <= frame.shape[0]):
        return None
    roi = frame[top:bottom, left:right]
    if roi.size == 0:
        return None
    return cv2.resize(roi, (80, 80), interpolation=cv2.INTER_LINEAR)


def assess_ready_frame(frame, guidance, *, assessor=paired.assess_paired_frame):
    """Process both scales on EXACTLY the currently displayed 2.7x crop."""
    crop = cropped_pad_input(frame, guidance)
    if crop is None:
        return ("inconclusive", "inconclusive")
    try:
        result = assessor(frame, cropper=lambda _frame: crop)
        if (not isinstance(result, tuple) or len(result) != 2 or
                any(value not in (
                    "model_prefers_live_unvalidated",
                    "model_prefers_attack_unvalidated",
                    "inconclusive",
                ) for value in result)):
            return ("inconclusive", "inconclusive")
        return result
    except (cv2.error, ValueError, TypeError, OverflowError):
        return ("inconclusive", "inconclusive")


class GuidedPadWebcamUI:
    """Tk event-loop capture and preview; no on-disk media or background work."""
    PROMPTS = {
        "live": "LIVE — show one consenting adult physically in front of camera.",
        "print": "PRINT — show a physical portrait print, NEVER a government ID.",
        "replay": "REPLAY — aim camera at a second screen playing a consenting face video.",
    }
    # The operator must attest to the PHYSICAL presentation in front of the
    # camera for EACH trial. The camera face box is not anti-spoofing evidence.
    PRESENTATION_CONFIRMATIONS = {
        "live": "I confirm: an actual consenting adult is in front of the webcam.",
        "print": "I confirm: a PHYSICAL PRINTED PORTRAIT is in front of the webcam.",
        "replay": "I confirm: a SECOND SCREEN is playing a consenting face VIDEO.",
    }

    def __init__(self, camera, *, trials_per_class=3, frames_per_trial=3,
                 preview_only=False, enabled_categories=CATEGORIES,
                 tick_ms=105, clock=time.monotonic,
                 framing=None, assessor=assess_ready_frame,
                 four_hypothesis=False):
        if not 1 <= frames_per_trial <= MAX_FRAMES_PER_TRIAL:
            raise ValueError("INVALID_FRAME_COUNT")
        self.camera = camera
        self.preview_only = preview_only is True
        self.progress = TrialProgress(
            trials_per_class=trials_per_class, enabled_categories=enabled_categories,
            four_hypothesis=four_hypothesis)
        self.four_hypothesis = four_hypothesis is True
        self.frames_per_trial = frames_per_trial
        self.tick_ms = tick_ms
        self.clock = clock
        # Combined study requires V1SE's full 4x crop, not just the old
        # V2-only 2.7x preview. Do not accept trial with missing V1SE context.
        # Retain injectable custom framing function for no-camera tests.
        self.framing = (framing if framing is not None else
                        partial(analyze_framing,
                                context_scale=4.0 if self.four_hypothesis else 2.7))
        self.assessor = assessor
        self.cancelled = True
        self.camera_failed = False
        self._closing = False
        self._capturing = False
        self._samples = []
        self._next_sample_at = 0.0
        self._preview_frame = None
        self._photo = None
        self._last_guidance = None
        self._presentation_confirmed = False
        self._failures = 0
        self._quality_ticks = 0

    def _build(self):
        # Tk import is delayed to keep the existing headless CI tests working.
        import tkinter as tk
        self.tk = tk
        self.root = tk.Tk()
        self.root.title("VolunServe | PRIVATE Camera Framing — Staging QA")
        self.root.configure(bg="#eef5f1")
        self.root.resizable(False, False)
        self.root.protocol("WM_DELETE_WINDOW", self._close)
        container = tk.Frame(self.root, bg="#eef5f1", padx=19, pady=15)
        container.pack()
        tk.Label(container, text="VolunServe · Private webcam preview",
                 bg="#eef5f1", fg="#084938",
                 font=("Segoe UI", 16, "bold")).pack(anchor="w")
        tk.Label(container,
                 text="LOCAL ONLY · No photo/video saved · AI is NOT verified liveness",
                 bg="#eef5f1", fg="#6a4835",
                 font=("Segoe UI", 9)).pack(anchor="w", pady=(4, 9))
        # Tk text-label width/height are CHARACTER units, not pixels.
        # Use a fixed-sized container so the preview never creates an
        # enormous off-screen window before the first camera frame.
        preview_panel = tk.Frame(container, bg="#152d2c", width=700, height=470)
        preview_panel.pack(pady=8)
        preview_panel.pack_propagate(False)
        self.preview = tk.Label(preview_panel, bg="#152d2c")
        self.preview.pack(fill="both", expand=True)
        self.guidance_label = tk.Label(
            container, text="Finding a face...", bg="#eef5f1",
            fg="#80520b", font=("Segoe UI", 10, "bold"),
            wraplength=680, justify="left")
        self.guidance_label.pack(anchor="w")
        self.quality_label = tk.Label(
            container,
            text="Checking actual webcam resolution, image detail and lighting...",
            bg="#eef5f1", fg="#475569", font=("Segoe UI", 9),
            wraplength=680, justify="left")
        self.quality_label.pack(anchor="w", pady=(3, 1))
        self.step_label = tk.Label(
            container, text="", bg="#eef5f1",
            fg="#143d38", font=("Segoe UI", 10),
            wraplength=680, justify="left")
        self.step_label.pack(anchor="w", pady=(12, 4))
        self.progress_label = tk.Label(container, text="", bg="#eef5f1",
                                       fg="#415956", font=("Segoe UI", 9))
        self.progress_label.pack(anchor="w")
        self.presentation_consent_var = tk.BooleanVar(value=False)
        self.presentation_check = tk.Checkbutton(
            container, variable=self.presentation_consent_var,
            text="Confirm physical presentation for this trial",
            command=self._confirm_current_presentation,
            bg="#eef5f1", fg="#143d38",
            font=("Segoe UI", 9, "bold"), wraplength=680,
            justify="left")
        self.presentation_check.pack(anchor="w", pady=(8, 2))
        buttons = tk.Frame(container, bg="#eef5f1")
        buttons.pack(anchor="w", pady=(10, 5), fill="x")
        self.capture_button = tk.Button(
            buttons, text="Start capture (in-memory)",
            font=("Segoe UI", 10, "bold"), bg="#0b8062", fg="#ffffff",
            activebackground="#0a644f", activeforeground="#ffffff",
            width=25, state="disabled", command=self._start_capture)
        self.capture_button.pack(side="left")
        self.undo_button = tk.Button(
            buttons, text="Discard last trial / Retake",
            command=self._undo_last_trial,
            font=("Segoe UI", 9), width=23, state="disabled")
        self.undo_button.pack(side="left", padx=(8, 0))
        self.cancel_button = tk.Button(
            buttons, text="Cancel and close", command=self._close,
            font=("Segoe UI", 10), width=18)
        self.cancel_button.pack(side="left", padx=12)
        self._update_step()

    def _confirm_current_presentation(self):
        # Operator-reported label only, NOT AI-authenticated ground truth.
        self._presentation_confirmed = (
            not self.preview_only and
            not self.progress.complete and
            bool(self.presentation_consent_var.get()))
        if not self._presentation_confirmed:
            self.capture_button.configure(state="disabled")

    def _undo_last_trial(self):
        """Undo one wrong-label/poor-view attempt; keep other good trials in RAM."""
        if self._capturing or self._closing or self.preview_only:
            return
        kind, _discarded = self.progress.undo_last()
        if kind is None:
            return
        self.cancelled = True
        self._samples = []
        self.capture_button.configure(
            text="Start capture (in-memory)", command=self._start_capture)
        self._update_step()
        self.guidance_label.configure(
            text=f"Discarded last {kind.upper()} trial. Reposition and confirm the "
                 "correct physical presentation before a new capture.",
            fg="#a05616")

    def _update_step(self):
        kind, number = self.progress.current
        completed = sum(len(values) for values in self.progress.trials.values())
        self.undo_button.configure(
            state="normal" if completed and not self.preview_only else "disabled")
        # Require renewed confirmation for every trial, including repeated
        # captures of the same type, to prevent accidental LIVE/PRINT/REPLAY
        # label carryover.
        self._presentation_confirmed = False
        self.presentation_consent_var.set(False)
        if self.preview_only:
            self.presentation_check.configure(state="disabled")
            self.step_label.configure(
                text="FRAMING ONLY — check the full 2.7x face box. No test frames are sampled.")
            self.progress_label.configure(
                text="Move back until FRAMING READY. Close when finished; no trial is counted.")
            self.capture_button.configure(state="disabled")
            return
        if kind is None:
            self.presentation_check.configure(state="disabled")
            self.step_label.configure(
                text="Exploratory capture complete. No identity approval granted.")
            self.progress_label.configure(text="All categories recorded.")
            self.capture_button.configure(state="disabled")
            return
        self.presentation_check.configure(
            state="normal",
            text=self.PRESENTATION_CONFIRMATIONS[kind])
        self.step_label.configure(
            text=(f"{self.PROMPTS[kind]}   Trial {number}/{self.progress.trials_per_class}"
                  + ("   FULL 4x V1SE CROP REQUIRED" if self.four_hypothesis else "")))
        completed = sum(len(values) for values in self.progress.trials.values())
        target = self.progress.trials_per_class * len(self.progress.enabled_categories)
        self.progress_label.configure(
            text=f"Trials recorded: {completed}/{target} "
                 "(one presentation = one trial)"
                 + (" | LIVE-ONLY DIAGNOSTIC: PRINT/REPLAY NOT TESTED"
                    if self.progress.enabled_categories == ("live",) else ""))

    def _start_capture(self):
        if (not self._presentation_confirmed or
                self.preview_only or self._closing or self._capturing or
                self.progress.complete or
                self._last_guidance is None or
                not self._last_guidance.capture_ready):
            return
        self._capturing = True
        self.undo_button.configure(state="disabled")
        self._samples = []
        self._next_sample_at = self.clock() + 0.3
        self.capture_button.configure(state="disabled")
        self.guidance_label.configure(
            text="Capturing: keep the presentation steady. Do not close the app.",
            fg="#095d48")

    def _abort_current(self, message):
        self._capturing = False
        self._samples = []
        completed = sum(len(values) for values in self.progress.trials.values())
        self.undo_button.configure(state="normal" if completed else "disabled")
        self.guidance_label.configure(text=message, fg="#a05616")
        self.capture_button.configure(state="disabled")

    def _sample_frame(self, frame, guidance):
        if not self._capturing or self.clock() < self._next_sample_at:
            return
        if not guidance.capture_ready:
            self._abort_current(
                "Trial not counted: face crop lost. Move back / reposition then retry.")
            return
        result = self.assessor(frame, guidance)
        if (not isinstance(result, tuple) or
                len(result) != (4 if self.four_hypothesis else 2) or
                any(v not in (
                    "model_prefers_live_unvalidated",
                    "model_prefers_attack_unvalidated", "inconclusive") for v in result)):
            self._abort_current("Invalid model output. No trial was counted.")
            return
        self._samples.append(result)
        self._next_sample_at = self.clock() + 0.90
        self.progress_label.configure(
            text=f"Capturing frame {len(self._samples)}/{self.frames_per_trial} "
                 "(not independent trials)")
        if len(self._samples) == self.frames_per_trial:
            trial = (ensemble.combine_one_presentation(self._samples)
                     if self.four_hypothesis else paired.combine_paired_frames(self._samples))
            self.progress.add(trial)
            self._samples = []
            self._capturing = False
            self._update_step()
            if self.progress.complete:
                self.cancelled = False
                self.guidance_label.configure(
                    text="Capture complete. Close window to show aggregate counts. "
                         "Not proof of real liveness.",
                    fg="#095d48")
                self.capture_button.configure(
                    text="Finish / show aggregate", state="normal",
                    command=self._finish)
            else:
                self.guidance_label.configure(
                    text="Trial recorded in RAM; next presentation when ready.",
                    fg="#095d48")

    def _finish(self):
        if self.progress.complete:
            self.cancelled = False
            self._closing = True
            self.root.quit()

    def _tick(self):
        if self._closing:
            return
        try:
            ok, frame = self.camera.read()
            if not ok or not valid_frame(frame):
                self._failures += 1
                self._last_guidance = None
                self.capture_button.configure(state="disabled")
                self.guidance_label.configure(
                    text="Camera frame unavailable. Check device/permissions.",
                    fg="#a05616")
                if self._capturing:
                    self._abort_current("Camera frame unavailable; trial discarded.")
                if self._failures >= 20:
                    self.camera_failed = True
                    self._close()
                    return
            else:
                self._failures = 0
                guidance = self.framing(frame)
                self._last_guidance = guidance
                self._quality_ticks += 1
                # A heuristic every ~0.8 sec, on ephemeral camera frames.
                # This never influences the classifier or Start Capture gate.
                if self._quality_ticks == 1 or self._quality_ticks % 8 == 0:
                    self.quality_label.configure(
                        text=quality_hint(frame, guidance.face_rect))
                self._sample_frame(frame, guidance)
                if not self._capturing and not self.progress.complete:
                    # Framing-only never captures; the 2.7x guide is visual only.
                    self.capture_button.configure(
                        state="normal" if guidance.capture_ready and
                        self._presentation_confirmed and
                        not self.preview_only else "disabled")
                    if guidance.code != "ready":
                        self.guidance_label.configure(
                            text=HELP.get(guidance.code, "Face not ready."),
                            fg="#a05616")
                    elif not self.guidance_label.cget("text").startswith("Trial recorded"):
                        self.guidance_label.configure(
                            text=HELP["ready"], fg="#095d48")
                # draw_guidance only returns a RAM array for the local UI.
                view = fit_preview_only(draw_guidance(frame, guidance))
                encoded, payload = cv2.imencode(".png", view)
                if not encoded:
                    raise ValueError("INVALID_PREVIEW_PNG")
                self._photo = self.tk.PhotoImage(
                    data=base64.b64encode(payload.tobytes()).decode("ascii"),
                    format="png")
                self.preview.configure(image=self._photo)
                self._preview_frame = None
                del view
                del frame
        except (cv2.error, TypeError, ValueError, OverflowError, RuntimeError) as _exc:
            self.camera_failed = True
            self._abort_current("Camera/preview error; results discarded.")
            self._close()
            return
        self.root.after(self.tick_ms, self._tick)

    def _close(self):
        if self._closing:
            return
        self._closing = True
        # The camera never saves photos; closing drops transient image memory.
        self._samples = []
        self._photo = None
        self._preview_frame = None
        self.cancelled = not self.progress.complete
        self.root.quit()

    def launch(self):
        """Open visible preview (default Windows path); return only trial pairs."""
        self._build()
        try:
            self.root.after(100, self._tick)
            self.root.mainloop()
        finally:
            self._samples.clear()
            self._photo = None
            self._preview_frame = None
            self.root.destroy()
        return None if self.cancelled or self.camera_failed else self.progress.trials


def launch_webcam_preview(camera, *, trials_per_class, frames_per_trial,
                          preview_only=False, enabled_categories=CATEGORIES,
                          four_hypothesis=False, assessor=assess_ready_frame):
    """Safe, lazy GUI entry; caller owns/releases webcam in a finally block."""
    ui = GuidedPadWebcamUI(
        camera, trials_per_class=trials_per_class,
        frames_per_trial=frames_per_trial, preview_only=preview_only,
        enabled_categories=enabled_categories,
        four_hypothesis=four_hypothesis, assessor=assessor)
    return ui.launch()

"""VolunServe PRIVATE local camera capture for offline face/PAD QA.

This script never calls the backend, API, Firebase or network. It takes no
government ID. Use only your own face or explicitly consenting adult subjects.
Start it manually on the PC with the physical camera and a GUI-enabled OpenCV.

Run: py -3.11 identity-ai/capture_private_camera_qa.py --kind same
Kinds: same, different, live, print, replay
  same/different -> 2 separate JPEG captures in face/<kind>/pairNNN/
  live/print/replay -> 1 JPEG in pad/<kind>/trialNNN.jpg

All files remain in ~/VolunServe-Private-QA, OUTSIDE the Git repository.
There are no auto-uploads, embeddings, labels of real identities or approvals.
Press C to take each capture, Q or Escape to cancel without saving.
"""
import argparse
import os
from pathlib import Path
import sys

import cv2
import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ROOT = Path.home() / "VolunServe-Private-QA"
PAIR_KINDS = frozenset(("same", "different"))
PAD_KINDS = frozenset(("live", "print", "replay"))
KINDS = PAIR_KINDS | PAD_KINDS
MAX_SIZE_BYTES = 10 * 1024 * 1024
MAX_CAPTURE_DIM = 3000
MAX_NUMBER = 1000
WINDOW_TITLE = "VolunServe — PRIVATE Camera QA (no upload)"


def _inside(parent, candidate):
    parent = Path(parent).resolve()
    candidate = Path(candidate).resolve()
    return candidate == parent or parent in candidate.parents


def validated_root(path):
    supplied = Path(path).expanduser()
    if supplied.is_symlink():
        raise ValueError("Private QA folder must not be a symlink.")
    root = supplied.resolve()
    if _inside(REPO_ROOT, root):
        raise ValueError("Store PRIVATE camera samples OUTSIDE the Git repository.")
    if root == Path(root.anchor):
        raise ValueError("Choose a dedicated private folder, not a drive root.")
    return root


def _sample_parent(root, kind):
    if kind not in KINDS:
        raise ValueError("Unknown capture category.")
    folder = root / ("face" if kind in PAIR_KINDS else "pad") / kind
    if any(folder_part.is_symlink() for folder_part in (root, folder.parent, folder)):
        raise ValueError("Do not store QA samples through symlink folders.")
    return folder


def _next_output(root, kind):
    """Create a unique target name only; never overwrite or delete old trials."""
    parent = _sample_parent(root, kind)
    for number in range(1, MAX_NUMBER + 1):
        if kind in PAIR_KINDS:
            folder = parent / f"pair{number:03d}"
            if not folder.exists() and not folder.is_symlink():
                return folder
        else:
            file = parent / f"trial{number:03d}.jpg"
            if not file.exists() and not file.is_symlink():
                return file
    raise ValueError("No free QA trial slots; archive and securely remove old samples.")


def encode_frame(frame):
    if not isinstance(frame, np.ndarray) or frame.dtype != np.uint8:
        raise ValueError("Invalid camera frame.")
    if frame.ndim != 3 or frame.shape[2] != 3:
        raise ValueError("Expected a color image from the camera.")
    height, width = frame.shape[:2]
    if not 120 <= height <= MAX_CAPTURE_DIM or not 120 <= width <= MAX_CAPTURE_DIM:
        raise ValueError("Camera image dimensions are outside the evaluation limits.")
    success, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if not success or encoded is None:
        raise ValueError("Could not encode camera frame.")
    data = encoded.tobytes()
    if not 0 < len(data) <= MAX_SIZE_BYTES:
        raise ValueError("Camera JPEG is too large for the local evaluator.")
    return data


def save_frames(root, kind, frames):
    """Atomic-ish local write; rollback only files this call created.

    All camera captures stay in memory until explicitly accepted; files are
    opened exclusively and cannot overwrite previous local QA trials.
    """
    root = validated_root(root)
    count = 2 if kind in PAIR_KINDS else 1
    if kind not in KINDS or not isinstance(frames, (list, tuple)) or len(frames) != count:
        raise ValueError("Incorrect number of camera captures.")
    if count == 2 and np.array_equal(frames[0], frames[1]):
        raise ValueError("Two distinct camera captures are required.")
    payloads = [encode_frame(frame) for frame in frames]
    destination = _next_output(root, kind)
    folder = destination if count == 2 else destination.parent
    parent_created = not folder.exists()
    if count == 2 and destination.exists():
        raise ValueError("Refusing to overwrite an existing sample folder.")
    folder.mkdir(parents=True, exist_ok=True)
    targets = [destination / "first.jpg", destination / "second.jpg"] if count == 2 else [destination]
    created = []
    try:
        for target, data in zip(targets, payloads):
            with target.open("xb") as output:
                created.append(target)
                output.write(data)
    except (OSError, ValueError):
        for target in created:
            target.unlink(missing_ok=True)
        if parent_created and count == 2:
            try:
                destination.rmdir()
            except OSError:
                pass
        raise
    return destination


def _instructions(kind):
    if kind == "same":
        return ("Two different camera captures of the SAME consenting person.",
                "Change camera angle or pose between the two shots.")
    if kind == "different":
        return ("Two DIFFERENT consenting people, one capture each.",
                "Have the second person consent before their capture.")
    if kind == "live":
        return ("A consenting living person standing at the camera.",
                "No print, display, old portrait, or government ID.")
    if kind == "print":
        return ("Verification camera viewing a printed photo (consented face).",
                "Capture what the CAMERA sees, not the original digital photo.")
    return ("Verification camera viewing another screen playing video of a consenting face.",
            "Capture the screen USING the camera, never the source video directly.")


def capture_from_camera(kind, camera_index=0):
    count = 2 if kind in PAIR_KINDS else 1
    cap = cv2.VideoCapture(camera_index)
    frames = []
    try:
        if not cap.isOpened():
            raise RuntimeError("Camera unavailable. Check permissions and other camera apps.")
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        # Mouse input works even if Windows does not deliver keyboard focus to
        # the OpenCV preview window. A click requests ONE camera capture.
        click_requested = False
        mouse_hook_attempted = False

        def on_mouse(event, _x, _y, _flags, _userdata):
            nonlocal click_requested
            if event == cv2.EVENT_LBUTTONUP:
                click_requested = True

        while len(frames) < count:
            ok, frame = cap.read()
            if not ok or frame is None:
                raise RuntimeError("Cannot read camera frame; no samples were saved.")
            preview = frame.copy()
            text = f"{kind.upper()}: {len(frames) + 1}/{count} - CLICK / SPACE / C | Q cancel"
            cv2.putText(preview, text, (12, 28), cv2.FONT_HERSHEY_SIMPLEX,
                        0.55, (255, 255, 255), 2, cv2.LINE_AA)
            if frames:
                cv2.putText(preview, "FIRST PHOTO CAPTURED - TAKE SECOND",
                            (12, 55), cv2.FONT_HERSHEY_SIMPLEX,
                            0.52, (255, 255, 255), 2, cv2.LINE_AA)
            cv2.imshow(WINDOW_TITLE, preview)
            if not mouse_hook_attempted:
                mouse_hook_attempted = True
                try:
                    cv2.setMouseCallback(WINDOW_TITLE, on_mouse)
                except cv2.error:
                    # Some test/headless environments lack a native preview
                    # window; keyboard capture remains available.
                    pass
            key = cv2.waitKey(35) & 0xFF
            if key in (ord("q"), ord("Q"), 27):
                return None
            if key in (ord("c"), ord("C"), 32, 13) or click_requested:
                click_requested = False
                if frames and np.array_equal(frames[-1], frame):
                    continue
                frames.append(frame.copy())
                print(f"Camera capture {len(frames)}/{count} accepted locally.", flush=True)
        return frames
    except cv2.error as exc:
        raise RuntimeError(
            "Camera preview requires GUI OpenCV on Windows. Install "
            "opencv-contrib-python instead of opencv-contrib-python-headless."
        ) from exc
    finally:
        cap.release()
        try:
            cv2.destroyAllWindows()
        except cv2.error:
            pass


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kind", choices=sorted(KINDS), required=True)
    parser.add_argument("--camera", type=int, default=0, help="Local camera index, default 0")
    parser.add_argument("--output", type=Path, default=DEFAULT_ROOT,
                        help="Private local QA folder outside Git (default ~/VolunServe-Private-QA)")
    args = parser.parse_args(argv)
    try:
        root = validated_root(args.output)
        if not 0 <= args.camera <= 8:
            raise ValueError("Camera index must be between 0 and 8.")
        message, reminder = _instructions(args.kind)
        print("LOCAL-ONLY VolunServe QA. No government IDs. No cloud upload.")
        print(message)
        print(reminder)
        print("Raw captures are saved on THIS computer only. Delete them after testing.")
        if input("Do all pictured people explicitly consent? Type YES to start camera: ").strip() != "YES":
            print("Cancelled before camera access; no files created.")
            return 1
        captured = capture_from_camera(args.kind, args.camera)
        if captured is None:
            print("Cancelled; no files created.")
            return 1
        destination = save_frames(root, args.kind, captured)
        # Path is local only. Do not print names of persons or scores.
        print(f"PASS saved {len(captured)} capture(s) locally: {destination}")
        print("No files were uploaded and no identity verification decision was made.")
        return 0
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"Capture not completed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

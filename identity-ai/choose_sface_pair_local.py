"""Private SFace local two-photo picker for Windows (no cloud, no webcam).

Select two already-existing consented photos from the SAME private folder.
No model downloads, uploads, identity account writes, match/verified decision,
or camera capture. Photo filenames, paths and embeddings never enter stdout.
"""
from pathlib import Path
from types import SimpleNamespace

from check_sface_two_photos_local import (
    inspect_two_photos, print_safe_result, safe_block_reason,
)


def selected_private_pair(id_choice, selfie_choice):
    """Convert two local same-directory selections to the restricted QA input."""
    if not id_choice or not selfie_choice:
        raise ValueError("photo_selection_cancelled")
    try:
        first = Path(id_choice).resolve(strict=True)
        second = Path(selfie_choice).resolve(strict=True)
        allowed = {".jpg", ".jpeg", ".png", ".webp"}
        if (not first.is_file() or not second.is_file() or
                first.suffix.lower() not in allowed or
                second.suffix.lower() not in allowed):
            raise ValueError("private_photo_missing_or_invalid")
        if first.parent != second.parent:
            raise ValueError("photos_must_share_private_folder")
    except (OSError, RuntimeError):
        raise ValueError("private_photo_missing_or_invalid") from None
    return SimpleNamespace(
        consent_confirmed=True,
        image_root=str(first.parent),
        id_image=first.name,
        selfie_image=second.name,
    )


def pick_pair_with_consent():
    """Only local OS file dialogs; no network, images or filename output."""
    import tkinter as tk
    from tkinter import filedialog, messagebox

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    try:
        consent = messagebox.askyesno(
            "VolunServe — Local Research Only",
            "Use only photos you own or have permission to test.\\n"
            "This is research, NOT identity verification or liveness.\\n"
            "No photos will be uploaded or saved by this tool.\\n\\n"
            "Do you consent to local analysis of these two images?",
            parent=root,
        )
        if not consent:
            raise ValueError("informed_consent_required")
        types = (
            ("Photo files", "*.jpg *.jpeg *.png *.webp"),
            ("JPEG", "*.jpg *.jpeg"),
            ("PNG", "*.png"),
            ("WebP", "*.webp"),
        )
        first = filedialog.askopenfilename(
            title="1 of 2 — Select local ID portrait/photo", filetypes=types,
            parent=root,
        )
        if not first:
            raise ValueError("photo_selection_cancelled")
        second = filedialog.askopenfilename(
            title="2 of 2 — Select a different selfie in the SAME folder",
            initialdir=str(Path(first).parent), filetypes=types, parent=root,
        )
    finally:
        root.destroy()
    return selected_private_pair(first, second)


def main():
    try:
        result = inspect_two_photos(pick_pair_with_consent())
    except Exception as error:
        # Never expose machine paths, face templates, ID details or native errors.
        print("LOCAL_SFACE_BLOCKED: " + safe_block_reason(error))
        raise SystemExit(2) from None
    print_safe_result(result)


if __name__ == "__main__":
    main()

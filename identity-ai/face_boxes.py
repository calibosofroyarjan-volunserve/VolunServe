def deduplicate_face_boxes(boxes):
    """Merge near-identical detector boxes without ignoring distinct faces.

    Haar detections can overlap heavily around a single portrait. This
    removes duplicate boxes only; spatially separate detections still
    trigger the existing multiple-face safety check.
    """
    ordered = sorted(
        [tuple(map(int, box)) for box in boxes],
        key=lambda box: box[2] * box[3],
        reverse=True,
    )
    kept = []
    for candidate in ordered:
        cx, cy, cw, ch = candidate
        if cw <= 0 or ch <= 0:
            continue
        duplicate = False
        for existing in kept:
            ex, ey, ew, eh = existing
            left = max(cx, ex)
            top = max(cy, ey)
            right = min(cx + cw, ex + ew)
            bottom = min(cy + ch, ey + eh)
            intersection = max(0, right - left) * max(0, bottom - top)
            if intersection <= 0:
                continue
            union = cw * ch + ew * eh - intersection
            overlap = intersection / union if union else 0
            containment = intersection / min(cw * ch, ew * eh)
            if overlap >= 0.65 or containment >= 0.90:
                duplicate = True
                break
        if not duplicate:
            kept.append(candidate)
    return kept



"""Conservative rule for ignoring small secondary ID security portraits.

This is not an authenticity decision or an identity-match decision. An
ambiguous multi-face ID must still be rejected for re-capture, and all
successful AI comparisons still require independent manual verification.
"""


def has_clear_primary_id_portrait(face_boxes):
    """True only when the biggest detected portrait clearly dominates others.

    Input rectangles are (x, y, width, height) from OpenCV. Do not accept two
    comparably sized portraits, even if one is slightly bigger.
    """
    rectangles = []
    for box in face_boxes:
        try:
            _, _, width, height = box
            width, height = int(width), int(height)
        except (TypeError, ValueError):
            return False
        if width <= 0 or height <= 0:
            return False
        rectangles.append((width, height))
    if len(rectangles) < 2:
        return False
    rectangles.sort(key=lambda box: box[0] * box[1], reverse=True)
    primary_width, primary_height = rectangles[0]
    runner_up_width, runner_up_height = rectangles[1]
    return (
        primary_width * primary_height >= 3 * runner_up_width * runner_up_height
        and primary_width >= 1.5 * runner_up_width
        and primary_height >= 1.5 * runner_up_height
    )

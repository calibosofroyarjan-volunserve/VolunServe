"""Private VolunServe staging AI image-ingress limits.

Pure standard-library checks: no uploads, image decoding, logs, network or
credentials. These are *preconditions*, not biometric/liveness authenticity.
The Node staging upload gate remains HTTP 423 until independently approved.
"""

MAX_IMAGE_PIXELS = 16_000_000  # Bound decoded RGBA/RGB memory before EXIF/resize.


def matching_image_signature(data: bytes, content_type: str) -> bool:
    """Require the declared media type to match a real file signature.

    Deep/complete image decoding still belongs to Pillow. A signature alone
    cannot prove image integrity, government ID legitimacy or selfie liveness.
    """
    if not isinstance(data, bytes) or not isinstance(content_type, str):
        return False
    mime = content_type.strip().lower()
    if mime in ("image/jpeg", "image/jpg"):
        return len(data) >= 3 and data[:3] == b"\xff\xd8\xff"
    if mime == "image/png":
        return len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n"
    if mime == "image/webp":
        return (
            len(data) >= 12 and data[:4] == b"RIFF"
            and data[8:12] == b"WEBP"
        )
    return False


def image_dimensions_allowed(width: int, height: int) -> bool:
    """Before any image expansion, reject unreasonable pixel dimensions."""
    return (
        type(width) is int and type(height) is int
        and width > 0 and height > 0
        and width * height <= MAX_IMAGE_PIXELS
    )

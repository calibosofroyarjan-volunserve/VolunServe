"""Generate VolunServe icons from its EXISTING original emblem, no redesign."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets/images/logo.png"
ASSETS = ROOT / "assets/images"
PUBLIC = ROOT / "public"

def emblem():
    image = Image.open(SOURCE).convert("RGBA")
    alpha = image.getchannel("A")
    # Trim only empty transparent padding; preserve all visible emblem details.
    box = alpha.point(lambda v: 255 if v >= 16 else 0).getbbox()
    if not box:
        raise SystemExit("Original VolunServe emblem is empty")
    return image.crop(box)

def draw(source, size, fraction, white=True, monochrome=False):
    edge = max(1, round(size * fraction))
    ratio = min(edge / source.width, edge / source.height)
    dimensions = (round(source.width * ratio), round(source.height * ratio))
    scaled = source.resize(dimensions, Image.Resampling.LANCZOS)
    if monochrome:
        mask = Image.new("RGBA", dimensions, (0, 0, 0, 0))
        mask.putalpha(scaled.getchannel("A"))
        scaled = mask
    background = (255, 255, 255, 255) if white else (0, 0, 0, 0)
    canvas = Image.new("RGBA", (size, size), background)
    canvas.alpha_composite(scaled, ((size - dimensions[0]) // 2, (size - dimensions[1]) // 2))
    return canvas

def save(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)
    print(f"saved {path.relative_to(ROOT)} ({image.width}x{image.height})")

def main():
    art = emblem()
    save(draw(art, 96, .98), ASSETS / "favicon.png")
    save(draw(art, 1024, .94), ASSETS / "icon.png")
    # Adaptive launcher foreground must fit inside launcher masking safe zone.
    save(draw(art, 1024, .67, white=False), ASSETS / "android-icon-foreground.png")
    save(draw(art, 1024, .67, white=False, monochrome=True), ASSETS / "android-icon-monochrome.png")
    save(draw(art, 1024, .78, white=False), ASSETS / "splash-icon.png")
    save(draw(art, 192, .96), PUBLIC / "volunserve-192.png")
    save(draw(art, 512, .96), PUBLIC / "volunserve-512.png")
    save(draw(art, 512, .78), PUBLIC / "volunserve-maskable-512.png")
    save(draw(art, 180, .94), PUBLIC / "apple-touch-icon.png")
    ico = draw(art, 64, .96).convert("RGB")
    ico.save(PUBLIC / "favicon.ico", format="ICO",
             sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("saved public/favicon.ico")

if __name__ == "__main__":
    main()

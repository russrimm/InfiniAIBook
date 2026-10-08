"""Regenerate every app icon from the master artwork.

    python scripts/brand/make-icons.py

The master is public/brand/infiniaibook-icon.png: a square RGBA image with a transparent background.
Needs Pillow (pip install pillow). Writes:

  public/brand/infiniaibook-mark.png  transparent logo for in-app use
  src/app/favicon.ico                 16/32/48/64 px, transparent
  src/app/icon.png                    512 px, transparent
  src/app/apple-icon.png              180 px on white (iOS rejects transparency)
  public/icons/icon-192.png           web app manifest icons
  public/icons/icon-512.png
  public/icons/icon-maskable-512.png  on white, artwork inside the safe zone
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "public/brand/infiniaibook-icon.png"
WHITE = (255, 255, 255, 255)


def tight(img: Image.Image, pad: float) -> Image.Image:
    """Crop to the artwork, then pad to a square by a fraction of its longest side."""
    box = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    art = img.crop(box)
    side = round(max(art.size) * (1 + 2 * pad))
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(art, ((side - art.width) // 2, (side - art.height) // 2), art)
    return sq


def on_white(img: Image.Image) -> Image.Image:
    bg = Image.new("RGBA", img.size, WHITE)
    bg.alpha_composite(img)
    return bg


def sized(img: Image.Image, n: int) -> Image.Image:
    # Premultiplied, so fully transparent pixels do not darken the edges.
    return img.convert("RGBa").resize((n, n), Image.LANCZOS).convert("RGBA")


def main() -> None:
    master = Image.open(MASTER).convert("RGBA")
    mark = master
    glyph = tight(mark, 0.04)

    (ROOT / "public/icons").mkdir(parents=True, exist_ok=True)
    sized(tight(mark, 0.02), 512).save(ROOT / "public/brand/infiniaibook-mark.png", optimize=True)
    big = sized(glyph, 512)
    big.save(ROOT / "src/app/icon.png", optimize=True)
    big.save(ROOT / "public/icons/icon-512.png", optimize=True)
    sized(glyph, 192).save(ROOT / "public/icons/icon-192.png", optimize=True)
    sized(on_white(tight(mark, 0.12)), 180).convert("RGB").save(ROOT / "src/app/apple-icon.png", optimize=True)
    # Maskable icons may be cropped to a circle; the artwork stays within the middle 60%.
    sized(on_white(tight(mark, 0.28)), 512).convert("RGB").save(
        ROOT / "public/icons/icon-maskable-512.png", optimize=True
    )
    sized(glyph, 256).save(ROOT / "src/app/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])


if __name__ == "__main__":
    main()

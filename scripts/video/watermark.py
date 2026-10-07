"""
Stamp a text or image watermark onto every frame of an MP4.

    python scripts/video/watermark.py config.json

config.json:
{
  "input": "path/to/video.mp4",
  "output": "path/to/output.mp4",
  "position": "bottom-right",   # top|middle|bottom - left|center|right, or "center"
  "opacity": 0.6,               # 0..1
  # either a line of text ...
  "text": "Contoso Learning",
  "text_height": 0.045,         # text height as a fraction of the frame height
  # ... or a PNG
  "image": "path/to/logo.png",
  "max_width": 0.18,            # the image fits inside this fraction of the frame
  "max_height": 0.15
}

The mark is drawn once with Pillow, then laid over the video with FFmpeg's
overlay filter. The picture is re-encoded; the soundtrack is copied untouched.

Requires: Pillow, imageio-ffmpeg  (python -m pip install pillow imageio-ffmpeg)
"""
import json, os, re, subprocess, sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont
import imageio_ffmpeg

cfg = json.load(open(sys.argv[1], encoding="utf-8"))
ff = imageio_ffmpeg.get_ffmpeg_exe()

SRC, OUT = cfg["input"], cfg["output"]
POSITION = cfg.get("position", "bottom-right")
OPACITY = min(1.0, max(0.05, float(cfg.get("opacity", 0.6))))

_FONTS = [
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/opt/venv/lib/python3.12/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]
FONT = cfg.get("font") or next((p for p in _FONTS if os.path.exists(p)), None)

if not os.path.exists(SRC):
    sys.exit(f"input not found: {SRC}")


def frame_size(path):
    err = subprocess.run([ff, "-hide_banner", "-i", path], capture_output=True, text=True).stderr
    found = re.search(r"Video:.*?\b(\d{2,5})x(\d{2,5})\b", err)
    if not found:
        sys.exit("could not read the video frame size")
    return int(found.group(1)), int(found.group(2))


def font(px):
    if FONT:
        return ImageFont.truetype(FONT, px)
    # Pillow 10.1+ ships a scalable default; older versions only a bitmap one.
    try:
        return ImageFont.load_default(px)
    except TypeError:
        return ImageFont.load_default()


def text_box(text, f, stroke):
    return ImageDraw.Draw(Image.new("L", (1, 1))).textbbox((0, 0), text, font=f, stroke_width=stroke)


def text_mark(text, height_frac, W, H):
    px = max(12, int(H * height_frac))
    # Shrink to fit if a long line would run off the frame.
    while True:
        f, stroke = font(px), max(1, px // 14)
        l, t, r, b = text_box(text, f, stroke)
        if r - l <= W * 0.9 or px <= 12:
            break
        px = max(12, int(px * 0.9))
    pad = max(4, px // 4)
    w, h = r - l + pad * 2, b - t + pad * 2
    # A soft shadow under a white face with a dark rim reads on light and dark frames alike.
    shadow = Image.new("L", (w, h), 0)
    ImageDraw.Draw(shadow).text((pad - l, pad - t + max(1, px // 20)), text, font=f, fill=200,
                                stroke_width=stroke)
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(1, px // 12)))
    mark = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    mark.paste((0, 0, 0, 255), (0, 0), shadow)
    ImageDraw.Draw(mark).text((pad - l, pad - t), text, font=f, fill=(255, 255, 255, 255),
                              stroke_width=stroke, stroke_fill=(20, 20, 20, 255))
    return mark


def image_mark(path, max_w, max_h, W, H):
    if not os.path.exists(path):
        sys.exit(f"watermark image not found: {path}")
    img = Image.open(path).convert("RGBA")
    s = min(W * max_w / img.width, H * max_h / img.height)
    return img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)


W, H = frame_size(SRC)
if cfg.get("text"):
    mark = text_mark(str(cfg["text"]), float(cfg.get("text_height", 0.045)), W, H)
elif cfg.get("image"):
    mark = image_mark(cfg["image"], float(cfg.get("max_width", 0.18)), float(cfg.get("max_height", 0.15)), W, H)
else:
    sys.exit("nothing to stamp: give text or image")

mark.putalpha(mark.getchannel("A").point(lambda a: round(a * OPACITY)))

margin = round(min(W, H) * 0.035)
row, col = ("middle", "center") if POSITION == "center" else (POSITION.split("-", 1) + ["right"])[:2]
x = {"left": margin, "center": (W - mark.width) // 2}.get(col, W - mark.width - margin)
y = {"top": margin, "middle": (H - mark.height) // 2}.get(row, H - mark.height - margin)

png = OUT + ".mark.png"
mark.save(png)
try:
    subprocess.run([
        ff, "-y", "-loglevel", "error", "-i", SRC, "-i", png,
        "-filter_complex", f"[0:v][1:v]overlay={max(0, x)}:{max(0, y)}:format=auto,format=yuv420p[v]",
        "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "copy", "-movflags", "+faststart", OUT,
    ], check=True)
finally:
    try:
        os.remove(png)
    except OSError:
        pass
print("watermarked", OUT, f"{W}x{H}", POSITION)

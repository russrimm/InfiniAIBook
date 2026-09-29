"""Write synthetic assets for scripts/check-motion.ts.

Usage:
    python scripts/motion/fixtures.py OUT_DIR

Creates a background plate, a transparent hero, an opaque prop on white (to
exercise the renderer's key-out), two tone clips standing in for narration and
a short stereo music loop. No model calls, no network.
"""
import os, subprocess, sys
from PIL import Image, ImageDraw
import imageio_ffmpeg

d = sys.argv[1]
os.makedirs(d, exist_ok=True)
ff = imageio_ffmpeg.get_ffmpeg_exe()

bg = Image.new("RGB", (1536, 1024), (200, 225, 230))
draw = ImageDraw.Draw(bg)
draw.rectangle((0, 700, 1536, 1024), fill=(150, 190, 170))
draw.ellipse((1200, 80, 1400, 280), fill=(250, 210, 120))
bg.save(os.path.join(d, "bg.png"))

hero = Image.new("RGBA", (1024, 1536), (0, 0, 0, 0))
draw = ImageDraw.Draw(hero)
draw.ellipse((400, 200, 620, 420), fill=(240, 200, 170, 255))
draw.rounded_rectangle((350, 430, 670, 1000), 60, fill=(27, 154, 170, 255))
draw.rectangle((380, 1000, 640, 1400), fill=(18, 50, 74, 255))
hero.save(os.path.join(d, "hero.png"))

prop = Image.new("RGB", (1024, 1024), (255, 255, 255))
draw = ImageDraw.Draw(prop)
draw.rounded_rectangle((300, 250, 724, 850), 40, fill=(90, 90, 100))
draw.rectangle((340, 300, 684, 780), fill=(255, 255, 255))
prop.save(os.path.join(d, "prop.png"))


def tone(name, freq, seconds, channels, rate):
    subprocess.run([ff, "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"sine=frequency={freq}:duration={seconds}",
                    "-ac", str(channels), "-ar", str(rate), "-b:a", "96k", os.path.join(d, name)], check=True)


tone("narration-1.mp3", 440, 3, 1, 24000)
tone("narration-2.mp3", 523, 2, 1, 24000)
tone("music.mp3", 220, 4, 2, 44100)
print("fixtures written to", d)

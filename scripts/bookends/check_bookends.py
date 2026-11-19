"""Check that an intro and an outro are put around a finished video correctly.

Usage:
    python scripts/bookends/check_bookends.py MAIN.mp4 WORKDIR

Makes a red landscape intro with a tone (3 s, 640x360, 24 fps) and a blue
portrait outro with no sound (2 s), puts them around MAIN.mp4 with
scripts/bookends/bookends.py, and checks that:

  * the length is the three pieces added up, less one cross-fade per join
    (and with a cut, exactly their sum);
  * the picture is still MAIN's size and the result has sound throughout;
  * the first frame comes from the intro and the last from the outro, and the
    portrait outro is pillarboxed rather than stretched across the frame;
  * well inside the main video, a frame matches the same moment of MAIN.mp4
    shifted by the intro, so speech, captions and cues stay where they were.
"""
import io, json, os, re, subprocess, sys

import numpy as np
import imageio_ffmpeg
from PIL import Image

main, work = sys.argv[1], sys.argv[2]
os.makedirs(work, exist_ok=True)
ff = imageio_ffmpeg.get_ffmpeg_exe()
here = os.path.dirname(os.path.abspath(__file__))


def ffmpeg(*args):
    subprocess.run([ff, "-y", "-loglevel", "error", *args], check=True)


def info(path):
    err = subprocess.run([ff, "-hide_banner", "-i", path], capture_output=True, text=True, errors="replace").stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", err).groups()
    wh = re.search(r"Video:.*?[, ](\d{2,5})x(\d{2,5})", err)
    return {"duration": int(h) * 3600 + int(m) * 60 + float(s), "size": (int(wh.group(1)), int(wh.group(2))), "audio": "Audio:" in err}


def frame(path, t):
    r = subprocess.run([ff, "-v", "error", "-ss", f"{t:.3f}", "-i", path, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
                       stdout=subprocess.PIPE, check=True)
    return np.array(Image.open(io.BytesIO(r.stdout)).convert("RGB")).astype(int)


def fail(msg):
    sys.exit("FAIL  " + msg)


intro, outro = os.path.join(work, "intro.mp4"), os.path.join(work, "outro.mp4")
ffmpeg("-f", "lavfi", "-i", "color=c=0xE02020:size=640x360:rate=24:duration=3", "-f", "lavfi", "-i", "sine=frequency=880:duration=3",
       "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", intro)
ffmpeg("-f", "lavfi", "-i", "color=c=0x2040E0:size=360x640:rate=24:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", outro)

m = info(main)
W, H = m["size"]


def join(fade, name):
    out = os.path.join(work, name)
    cfg = os.path.join(work, "bookends.json")
    with open(cfg, "w") as fh:
        json.dump({"op": "concat", "main": main, "intro": intro, "outro": outro, "output": out, "fade": fade}, fh)
    subprocess.run([sys.executable, os.path.join(here, "bookends.py"), cfg], check=True, stdout=subprocess.DEVNULL)
    return out


for fade in (0.5, 0.0):
    out = join(fade, f"bookended-{fade}.mp4")
    o = info(out)
    want = m["duration"] + 5 - 2 * fade
    if abs(o["duration"] - want) > 0.2:
        fail(f"fade {fade}: the result is {o['duration']:.2f} s, expected {want:.2f} s")
    if o["size"] != (W, H):
        fail(f"fade {fade}: the result is {o['size']}, expected the main video's {(W, H)}")
    if not o["audio"]:
        fail(f"fade {fade}: the result has no sound")

    first = frame(out, 0.05)
    if not (first[..., 0].mean() > 150 and first[..., 2].mean() < 90):
        fail(f"fade {fade}: the first frame is not the red intro (mean RGB {first.reshape(-1, 3).mean(axis=0).round()})")

    last = frame(out, o["duration"] - 0.1)
    cx = last[:, W // 2 - 20 : W // 2 + 20]
    left = last[:, : W // 8]
    if not (cx[..., 2].mean() > 150 and cx[..., 0].mean() < 90):
        fail(f"fade {fade}: the last frame is not the blue outro")
    if left.mean() > 25:
        fail(f"fade {fade}: the portrait outro was stretched across the frame instead of pillarboxed")

    # Inside the main video, away from both joints, the picture is the main video's, later by the intro.
    offset = 3 - fade
    t = min(1.0 + fade, m["duration"] / 2)
    a, b = frame(out, offset + t), frame(main, t)
    diff = float(np.abs(a - b).mean())
    if diff > 12:
        fail(f"fade {fade}: at {t:.1f} s into the main video the picture differs by {diff:.1f}; it is out of step")
    print(f"ok    fade {fade}: {o['duration']:.2f} s, intro first, outro last (pillarboxed), main video in step (diff {diff:.1f})")

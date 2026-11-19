"""Helpers around the HyperFrames training renderer (src/lib/hyperframes.ts).

Usage:
    python scripts/training/hf_assist.py config.json

config.json is one of:

    {"op": "alpha", "clips": ["a.webm", ...], "result": "alpha.json"}
        Writes {"a.webm": true, ...}: whether each clip carries an alpha
        channel. HyperFrames lays clips over the stage as they are, so a clip
        that arrived opaque is left to render.py, which keys its background out.

    {"op": "finish", "input": "in.mp4", "output": "out.mp4", "duration": 83.2}
        Normalizes the render's loudness to -16 LUFS, as render.py does, and
        copies the picture untouched.

    {"op": "fitclip", "fps": 30, "items": [{"src": "in.mp4", "dest": "out.mp4", "seconds": 7.5, "fit": "hold"}]}
        Makes each generated clip exactly as long as the visual it plays in,
        without sound: a short one holds its last frame (or loops with
        "fit": "loop"), a long one is cut. HyperFrames plays the result as is.

Requires: numpy, imageio-ffmpeg  (python -m pip install numpy imageio-ffmpeg)
"""
import json, subprocess, sys

import numpy as np
import imageio_ffmpeg

cfg = json.load(open(sys.argv[1], encoding="utf-8"))
ff = imageio_ffmpeg.get_ffmpeg_exe()


def has_alpha(src):
    # The native VP9 decoder drops the alpha plane; libvpx keeps it.
    proc = subprocess.run(
        [ff, "-v", "error", "-c:v", "libvpx-vp9", "-i", src, "-an", "-frames:v", "1",
         "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
        stdout=subprocess.PIPE,
    )
    pixels = np.frombuffer(proc.stdout, np.uint8).reshape(-1, 4)
    # No transparent pixel at all means the service ignored the transparent background.
    return bool(len(pixels) and pixels[:, 3].min() < 255)


if cfg["op"] == "alpha":
    result = {src: has_alpha(src) for src in cfg["clips"]}
    with open(cfg["result"], "w", encoding="utf-8") as f:
        json.dump(result, f)
elif cfg["op"] == "finish":
    total = float(cfg["duration"])
    subprocess.run(
        [ff, "-y", "-loglevel", "error", "-i", cfg["input"], "-map", "0:v", "-map", "0:a", "-c:v", "copy",
         "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000", "-c:a", "aac", "-b:a", "160k",
         "-t", f"{total:.3f}", "-movflags", "+faststart", cfg["output"]],
        check=True,
    )
elif cfg["op"] == "fitclip":
    fps = int(cfg.get("fps", 30))
    for item in cfg["items"]:
        seconds = float(item["seconds"])
        loop = item.get("fit") == "loop"
        # Shorter than its visual: loop it, or hold the last frame. Longer: cut it. Never any sound.
        vf = f"fps={fps},scale=trunc(iw/2)*2:trunc(ih/2)*2"
        if not loop:
            vf += f",tpad=stop_mode=clone:stop_duration={seconds:.3f}"
        subprocess.run(
            [ff, "-y", "-loglevel", "error", *(["-stream_loop", "-1"] if loop else []), "-i", item["src"],
             "-an", "-vf", vf, "-t", f"{seconds:.3f}", "-c:v", "libx264", "-pix_fmt", "yuv420p",
             "-preset", "veryfast", "-crf", "18", "-movflags", "+faststart", item["dest"]],
            check=True,
        )
else:
    sys.exit(f"unknown op {cfg['op']!r}")

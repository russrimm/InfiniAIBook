"""
Mix a background-music bed under a narrated MP3 or MP4.

    python scripts/audio/mix.py config.json

config.json:
{
  "input": "path/to/voice.mp3 or video.mp4",
  "output": "path/to/output (same container as input)",
  "music": "path/to/track.mp3",
  "volume": 0.3,               # music gain before ducking
  "kind": "audio" | "video"    # video copies the picture and re-encodes only the sound
}

The track loops to the length of the voice, fades in and out, and is ducked
whenever the voice speaks (sidechain compression keyed off the voice itself).

Requires: imageio-ffmpeg  (python -m pip install imageio-ffmpeg)
"""
import json, os, re, subprocess, sys

import imageio_ffmpeg

cfg = json.load(open(sys.argv[1], encoding="utf-8"))
ff = imageio_ffmpeg.get_ffmpeg_exe()

SRC, OUT, MUSIC = cfg["input"], cfg["output"], cfg["music"]
VOLUME = float(cfg.get("volume", 0.3))
KIND = cfg.get("kind", "audio")

if not os.path.exists(SRC):
    sys.exit(f"input not found: {SRC}")
if not os.path.exists(MUSIC):
    sys.exit(f"music track not found: {MUSIC}")


def duration(path):
    err = subprocess.run([ff, "-i", path, "-f", "null", "-"], capture_output=True, text=True).stderr
    times = re.findall(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)", err)
    if times:
        h, m, s = times[-1]
        return int(h) * 3600 + int(m) * 60 + float(s)
    found = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", err)
    if not found:
        sys.exit("could not read the input duration")
    h, m, s = found.groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


TOTAL = duration(SRC)
fade_out = max(0.0, TOTAL - 3.0)
fmt = "aformat=sample_rates=48000:channel_layouts=stereo"

graph = ";".join([
    f"[0:a]{fmt},asplit=2[voice][key]",
    f"[1:a]{fmt},volume={VOLUME:.3f},atrim=0:{TOTAL:.3f},asetpts=PTS-STARTPTS,"
    f"afade=t=in:st=0:d=2,afade=t=out:st={fade_out:.3f}:d=3[mus]",
    "[mus][key]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=450[duck]",
    "[voice][duck]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[mix]",
])

cmd = [ff, "-y", "-loglevel", "error", "-i", SRC, "-stream_loop", "-1", "-i", MUSIC,
       "-filter_complex", graph, "-t", f"{TOTAL:.3f}"]
if KIND == "video":
    cmd += ["-map", "0:v:0", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
            "-movflags", "+faststart", OUT]
else:
    cmd += ["-map", "[mix]", "-c:a", "libmp3lame", "-b:a", "160k", OUT]

subprocess.run(cmd, check=True)
print("mixed", OUT, round(TOTAL, 1), "seconds")

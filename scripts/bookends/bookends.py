"""Put an intro and an outro clip around a finished video.

    python scripts/bookends/bookends.py config.json

config.json is:

    {"op": "concat", "main": "main.mp4", "output": "out.mp4",
     "intro": "intro.mp4", "outro": "outro.mp4",      # either may be absent
     "mute": {"intro": false, "outro": false},        # play a clip without its own sound
     "fade": 0.5,                                     # cross-fade at each joint; 0 for a cut
     "result": "result.json"}                         # optional: the lengths measured and the total

Every piece is brought to the main video's size and frame rate without
stretching: scaled to fit and padded with black. Sound is brought to 48 kHz
stereo; a clip's own sound is loudness-matched, and a piece with none is given
silence, so the joints never click or drop out. The result is the pieces end
to end, overlapping by the fade at each joint, so its length is their sum minus
one fade per joint. The main video is re-encoded (H.264, AAC), never stretched.

Requires: imageio-ffmpeg  (python -m pip install imageio-ffmpeg)
"""
import json, os, re, subprocess, sys

import imageio_ffmpeg

ff = imageio_ffmpeg.get_ffmpeg_exe()

# Inputs are opened as plain files only: FFmpeg otherwise follows playlists and
# other protocols named inside a file (http:, tcp:, concat:), which an uploaded
# clip must never be able to trigger. Uploads are checked on arrival as well.
FILE_ONLY = ["-protocol_whitelist", "file"]


def safe_path(p):
    """An absolute path, so a name that starts with "-" can never be read as an ffmpeg option."""
    return os.path.abspath(p)


def probe(path):
    r = subprocess.run([ff, "-hide_banner", *FILE_ONLY, "-i", safe_path(path)], capture_output=True, text=True, errors="replace")
    err = r.stderr
    dur = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", err)
    video = next((l for l in err.splitlines() if "Video:" in l), None)
    if not dur or not video:
        return None
    h, m, s = dur.groups()
    size = re.search(r"[,\s](\d{2,5})x(\d{2,5})[,\s\[]", video.split("Video:", 1)[1] + " ")
    fps = re.search(r"(\d+(?:\.\d+)?) fps", video)
    return {
        "duration": int(h) * 3600 + int(m) * 60 + float(s),
        "width": int(size.group(1)) if size else 0,
        "height": int(size.group(2)) if size else 0,
        "fps": float(fps.group(1)) if fps else 30.0,
        "audio": any("Audio:" in l for l in err.splitlines()),
    }


def concat(cfg):
    pieces = []
    if cfg.get("intro"):
        pieces.append(("intro", cfg["intro"]))
    pieces.append(("main", cfg["main"]))
    if cfg.get("outro"):
        pieces.append(("outro", cfg["outro"]))
    if len(pieces) == 1:
        sys.exit("nothing to add: no intro or outro was given")
    mute = cfg.get("mute") or {}
    infos = []
    for name, path in pieces:
        info = probe(path) if os.path.exists(path) else None
        if not info or info["duration"] <= 0:
            sys.exit(f"the {name} video could not be read: {path}")
        infos.append(info)

    main = infos[[n for n, _ in pieces].index("main")]
    W, H = main["width"] - main["width"] % 2, main["height"] - main["height"] % 2
    fps = round(main["fps"], 3) if main["fps"] > 0 else 30
    # The fade can never be more than half of the shortest piece.
    fade = float(cfg.get("fade", 0))
    room = min(i["duration"] for i in infos) / 2 - 0.05
    fade = round(min(fade, room), 2)
    if fade < 0.05:
        fade = 0.0

    cmd = [ff, "-y", "-loglevel", "error"]
    for _, path in pieces:
        cmd += [*FILE_ONLY, "-i", safe_path(path)]
    graph = []
    for i, ((name, _), info) in enumerate(zip(pieces, infos)):
        graph.append(
            f"[{i}:v]scale={W}:{H}:force_original_aspect_ratio=decrease:flags=bicubic,"
            f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps={fps},format=yuv420p[v{i}]"
        )
        fmt = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo"
        own = info["audio"] and not mute.get(name, False)
        if own and name != "main":
            # A clip's own sound is matched to the loudness the main video was normalized to.
            graph.append(f"[{i}:a]{fmt},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo[a{i}]")
        elif own:
            graph.append(f"[{i}:a]{fmt}[a{i}]")
        else:
            graph.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{info['duration']:.3f},asetpts=PTS-STARTPTS[a{i}]")

    n = len(pieces)
    total = sum(i["duration"] for i in infos) - fade * (n - 1)
    if fade > 0:
        vcur, acur, elapsed = "v0", "a0", infos[0]["duration"]
        for j in range(1, n):
            graph.append(f"[{vcur}][v{j}]xfade=transition=fade:duration={fade}:offset={elapsed - fade:.3f}[vx{j}]")
            graph.append(f"[{acur}][a{j}]acrossfade=d={fade}:c1=tri:c2=tri[ax{j}]")
            vcur, acur = f"vx{j}", f"ax{j}"
            elapsed += infos[j]["duration"] - fade
        vout, aout = vcur, acur
    else:
        inputs = "".join(f"[v{i}][a{i}]" for i in range(n))
        graph.append(f"{inputs}concat=n={n}:v=1:a=1[vo][ao]")
        vout, aout = "vo", "ao"

    cmd += ["-filter_complex", ";".join(graph), "-map", f"[{vout}]", "-map", f"[{aout}]", "-t", f"{total:.3f}",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", safe_path(cfg["output"])]
    subprocess.run(cmd, check=True)
    print("bookended", cfg["output"], round(total, 2), "seconds, fade", fade)
    if cfg.get("result"):
        with open(cfg["result"], "w", encoding="utf-8") as fh:
            json.dump({"total": total, "fade": fade, "durations": {n: i["duration"] for (n, _), i in zip(pieces, infos)}}, fh)


cfg = json.load(open(sys.argv[1], encoding="utf-8"))
if cfg["op"] == "concat":
    concat(cfg)
else:
    sys.exit(f"unknown op {cfg['op']!r}")

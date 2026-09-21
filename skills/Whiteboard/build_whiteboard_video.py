"""Build a narrated whiteboard-animation video from clean scene artwork + a hand cutout + narration clips.

Usage:
    python build_whiteboard_video.py config.json

config.json:
{
  "output": "working/my-video.mp4",
  "hand": "working/hand-marker.png",            # photo of a hand holding a marker on pure white, tip toward upper-left
  "width": 1920, "height": 1080, "fps": 24,
  "art_height": 820,                             # artwork area; the rest of the frame is the white caption band
  "scenes": [
    {"image": "working/scene-01.png", "caption": "Short caption text", "audio": "working/narration-01.mp3"},
    ...
  ]
}
"audio" is optional per scene (silent scenes get a fixed 6s draw + 2.5s hold).
Requires: numpy, Pillow, imageio_ffmpeg (all preinstalled in Cowork).
"""
import json, shutil, subprocess, sys, textwrap
from collections import deque
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

cfg = json.load(open(sys.argv[1]))
W, H, FPS = cfg.get("width", 1920), cfg.get("height", 1080), cfg.get("fps", 24)
ART_H = cfg.get("art_height", int(H * 0.76))
FADE_S, T = 0.4, 10
FONT = cfg.get("font", "/opt/venv/lib/python3.12/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans-Bold.ttf")
OUT = cfg["output"]
ff = imageio_ffmpeg.get_ffmpeg_exe()


def audio_len(path):
    err = subprocess.run([ff, "-i", path, "-f", "null", "-"], capture_output=True, text=True).stderr
    t = [l for l in err.splitlines() if "time=" in l][-1].split("time=")[1].split()[0]
    h, m, s = t.split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def load_hand():
    im = Image.open(cfg["hand"]).convert("RGB")
    a = np.asarray(im).astype(np.int32)
    nonwhite = (255 * 3 - a.sum(axis=2)) > 60
    alpha = np.asarray(Image.fromarray((nonwhite * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)))
    ys, xs = np.nonzero(nonwhite)
    i = np.argmin(xs + ys)  # marker tip = extreme upper-left point of the cutout
    hand = Image.fromarray(np.dstack([np.asarray(im), alpha]), "RGBA")
    scale = cfg.get("hand_scale", 0.62) * (H / 1080)
    hand = hand.resize((int(hand.width * scale), int(hand.height * scale)), Image.LANCZOS)
    return hand, (int(xs[i] * scale), int(ys[i] * scale))


HAND, TIP = load_hand()


def load_scene(path):
    im = Image.open(path).convert("RGB")
    s = min(W / im.width, ART_H / im.height)
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    canvas = Image.new("RGB", (W, H), (255, 255, 255))
    canvas.paste(im, ((W - im.width) // 2, 20))
    return np.asarray(canvas).astype(np.float32)


def stroke_order(img):
    """Ordinal at which each pixel gets drawn (-1 = blank). Titles left-to-right, shapes by nearest neighbour."""
    a = img.astype(np.int32)
    ink = (255 * 3 - a.sum(axis=2)) > 90
    th, tw = H // T, W // T
    tiles = ink[:th * T, :tw * T].reshape(th, T, tw, T).any(axis=(1, 3))
    comp = -np.ones((th, tw), np.int32); comps = []
    for y in range(th):
        for x in range(tw):
            if tiles[y, x] and comp[y, x] < 0:
                q = deque([(y, x)]); comp[y, x] = len(comps); members = []
                while q:
                    cy, cx = q.popleft(); members.append((cy, cx))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < th and 0 <= nx < tw and tiles[ny, nx] and comp[ny, nx] < 0:
                                comp[ny, nx] = len(comps); q.append((ny, nx))
                comps.append(members)
    comps.sort(key=lambda m: (min(c[0] for c in m) // 6, min(c[1] for c in m)))
    order = -np.ones((th, tw), np.int32); k = 0
    for members in comps:
        pts = np.array(members); remaining = np.ones(len(pts), bool)
        if pts[:, 1].max() - pts[:, 1].min() > tw * 0.3:
            for idx in np.lexsort((pts[:, 0], pts[:, 1] // 3)):
                order[pts[idx, 0], pts[idx, 1]] = k; k += 1
            continue
        cur = int(np.argmin(pts[:, 1] * 3 + pts[:, 0]))
        for _ in range(len(pts)):
            remaining[cur] = False
            order[pts[cur, 0], pts[cur, 1]] = k; k += 1
            if not remaining.any(): break
            d = np.abs(pts[:, 0] - pts[cur, 0]) + np.abs(pts[:, 1] - pts[cur, 1])
            d[~remaining] = 1 << 30
            cur = int(np.argmin(d))
    full = -np.ones((H, W), np.int32)
    full[:th * T, :tw * T] = np.repeat(np.repeat(order, T, 0), T, 1)
    full[~ink] = -1
    ys, xs = np.nonzero(order >= 0)
    path = np.zeros((max(k, 1), 2), np.float32)
    path[order[ys, xs]] = np.stack([xs * T + T / 2, ys * T + T / 2], 1)
    return full, path, max(k, 1)


def caption_layer(text):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    font = ImageFont.truetype(FONT, int(46 * H / 1080))
    lines = textwrap.wrap(text, width=70); lh = int(62 * H / 1080)
    band_top = ART_H + 20
    d.line([(W * 0.08, band_top + 6), (W * 0.92, band_top + 6)], fill=(30, 110, 220, 255), width=6)
    y0 = band_top + (H - band_top - lh * len(lines)) // 2
    for i, l in enumerate(lines):
        d.text(((W - d.textlength(l, font=font)) / 2, y0 + i * lh), l, font=font, fill=(30, 40, 60, 255))
    return np.asarray(layer).astype(np.float32)


def blend_caption(frame, cap, alpha):
    a = (cap[..., 3:4] / 255.0) * alpha
    return frame * (1 - a) + cap[..., :3] * a


def paste_hand(frame_u8, pos):
    im = Image.fromarray(frame_u8)
    im.paste(HAND, (int(pos[0] - TIP[0]), int(pos[1] - TIP[1])), HAND)
    return np.asarray(im)


silent = OUT.rsplit(".", 1)[0] + "-silent.mp4"
proc = subprocess.Popen([ff, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium",
                         "-crf", "20", "-movflags", "+faststart", silent], stdin=subprocess.PIPE)
white = np.full((H, W, 3), 255, np.float32)
n_fade = int(FADE_S * FPS)
scene_frames, offsets_ms, audio_files, t_frames = [], [], [], 0
for sc in cfg["scenes"]:
    audio = audio_len(sc["audio"]) if sc.get("audio") else None
    draw_s = max(5.0, min(audio - 0.8, 8.0)) if audio else 6.0
    hold_s = max(2.2, audio + 0.7 - draw_s) if audio else 2.5
    n_draw, n_hold = int(draw_s * FPS), int(hold_s * FPS)
    if audio:
        offsets_ms.append(int((t_frames / FPS + 0.35) * 1000)); audio_files.append(sc["audio"])
    t_frames += n_draw + n_hold + n_fade
    img = load_scene(sc["image"]); order, path, k = stroke_order(img); cap = caption_layer(sc["caption"])
    pen = np.array([W * 0.9, ART_H * 1.05], np.float32)
    park = np.array([W * 1.08, H * 1.15], np.float32)
    for f in range(n_draw + n_hold + n_fade):
        if f < n_draw:
            u = f / n_draw; p = u * u * (3 - 2 * u); kk = int(p * k)
            m = ((order >= 0) & (order < kk))[..., None]
            frame = np.where(m, img, white)
            pen += (path[min(max(kk - 1, 0), k - 1)] - pen) * (0.7 if f > 2 else 0.25)
            frame = blend_caption(frame, cap, np.clip((f - n_draw * 0.15) / (FPS * 0.5), 0, 1))
            out = paste_hand(np.clip(frame, 0, 255).astype(np.uint8), pen)
        elif f < n_draw + n_hold:
            pen += (park - pen) * 0.18
            out = np.clip(blend_caption(img, cap, 1.0), 0, 255).astype(np.uint8)
            if (f - n_draw) / (FPS * 0.6) < 1.4: out = paste_hand(out, pen)
        else:
            t = (f - n_draw - n_hold) / n_fade
            out = np.clip(blend_caption(img * (1 - t) + white * t, cap, 1 - t), 0, 255).astype(np.uint8)
        proc.stdin.write(out.tobytes())
proc.stdin.close(); proc.wait()

if audio_files:
    cmd = [ff, "-y", "-loglevel", "error", "-i", silent]
    for a in audio_files: cmd += ["-i", a]
    fc = "".join(f"[{i}]adelay={o}|{o}[a{i}];" for i, o in enumerate(offsets_ms, 1))
    fc += "".join(f"[a{i}]" for i in range(1, len(audio_files) + 1)) + f"amix=inputs={len(audio_files)}:normalize=0[mix]"
    cmd += ["-filter_complex", fc, "-map", "0:v", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
            "-shortest", "-movflags", "+faststart", OUT]
    subprocess.run(cmd, check=True)
else:
    shutil.copy(silent, OUT)
print("done", OUT, round(t_frames / FPS, 1), "seconds")

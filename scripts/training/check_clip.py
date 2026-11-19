"""Check that a generated clip shows in a composed video at its own aspect ratio.

Usage:
    python scripts/training/check_clip.py VIDEO.mp4 EXPECTED_ASPECT TIME [TIME ...]

The fixture clip is a flat orange picture with a white bar. At each TIME this
extracts a frame, finds the orange (or white) rectangle, and checks that its
width over its height is EXPECTED_ASPECT: a stretched clip would fill the panel
instead. The rectangle must also still be there at the later times, which is how
a clip shorter than its visual is seen to hold its last frame.
"""
import subprocess, sys
import numpy as np
import imageio_ffmpeg

video, expected = sys.argv[1], float(sys.argv[2])
times = [float(t) for t in sys.argv[3:]]
ff = imageio_ffmpeg.get_ffmpeg_exe()


def frame(t):
    r = subprocess.run([ff, "-v", "error", "-ss", f"{t:.3f}", "-i", video, "-frames:v", "1", "-f", "image2pipe",
                        "-vcodec", "png", "-"], stdout=subprocess.PIPE)
    from PIL import Image
    import io
    return np.array(Image.open(io.BytesIO(r.stdout)).convert("RGB")).astype(int)


for t in times:
    px = frame(t)
    orange = (abs(px[..., 0] - 255) < 40) & (abs(px[..., 1] - 128) < 40) & (px[..., 2] < 60)
    # The bar is white, and presenter skin and slide text are not, so count columns that are mostly the clip.
    ys, xs = np.where(orange)
    if len(xs) < 400:
        sys.exit(f"FAIL  no clip visible at {t:.2f} s ({len(xs)} orange pixels)")
    cols = np.where(orange.sum(axis=0) > 0.3 * orange.sum(axis=0).max())[0]
    rows = np.where(orange.sum(axis=1) > 0.3 * orange.sum(axis=1).max())[0]
    w, h = cols.max() - cols.min() + 1, rows.max() - rows.min() + 1
    ratio = w / h
    # The white bar covers a little of the rectangle, so allow some slack.
    if abs(ratio - expected) > 0.08:
        sys.exit(f"FAIL  at {t:.2f} s the clip is {w}x{h} (ratio {ratio:.3f}), not {expected:.3f}: it was stretched")
    print(f"ok    at {t:.2f} s the clip is {w}x{h} (ratio {ratio:.3f}) in its panel, not stretched")

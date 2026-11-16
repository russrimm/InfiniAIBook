"""Check that the presenter in a composed video keeps its shape.

Usage:
    python scripts/training/check_presenter.py VIDEO SECONDS EXPECTED_HEIGHT_PX [FRAME_PNG]

Grabs the frame at SECONDS, finds the magenta disk that `fixtures.py --head`
draws for the face, and fails when its width to height ratio is not about 1
(a stretched presenter) or its height is not within 20% of EXPECTED_HEIGHT_PX.
Saves the frame to FRAME_PNG when given. Needs numpy, Pillow and imageio-ffmpeg.
"""
import os, subprocess, sys, tempfile
import numpy as np
from PIL import Image
import imageio_ffmpeg

video, at, expected = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
out = sys.argv[4] if len(sys.argv) > 4 else os.path.join(tempfile.mkdtemp(), "frame.png")
subprocess.run(
    [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-v", "error", "-ss", f"{at:.3f}", "-i", video, "-frames:v", "1", out],
    check=True,
)
px = np.asarray(Image.open(out).convert("RGB")).astype(np.int16)
mask = (px[..., 0] > 180) & (px[..., 1] < 90) & (px[..., 2] > 180)
ys, xs = np.nonzero(mask)
if len(xs) < 50:
    sys.exit(f"FAIL  no presenter face found in the frame at {at:.2f} s")
w, h = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
ratio = w / h
print(f"presenter face {w}x{h}px (width/height {ratio:.2f}, expected height about {expected:.0f}px)")
if not 0.9 <= ratio <= 1.1:
    sys.exit(f"FAIL  the presenter is stretched: its face is {ratio:.2f} times as wide as it is tall")
if abs(h - expected) > 0.2 * expected:
    sys.exit(f"FAIL  the presenter is {h}px tall, not the {expected:.0f}px its layout calls for")
print("ok    presenter keeps its aspect ratio and size")

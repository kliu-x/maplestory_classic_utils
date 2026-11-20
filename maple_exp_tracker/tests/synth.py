"""Builds a fake inventory 'mesos box' picture out of the shipped digit examples (for tests)."""
import os
import cv2
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
_RAW = np.load(os.path.join(ROOT, "assets", "mesos_digits.npz"))
CANON = 24


def mesos_window(number, gh=14.0, pitch=0.447, comma=0.30, first=0.36):
    """A 1280x720 'screenshot' with a solid white mesos box (gold coin on the left) showing `number`."""
    h = int(round(1.86 * gh)); w = int(round(19.1 * gh)); x, y = 400, 300
    img = np.full((720, 1280, 3), (60, 50, 40), np.uint8)
    img[y:y + h, x:x + w] = 255
    cv2.circle(img, (x - int(0.8 * h), y + h // 2), int(0.35 * h), (0, 180, 255), -1)
    dh = 0.61 * h; k = 1.06 * dh / CANON            # drawn digits come out ~1 px shorter than the box rule says
    V = np.full((h, w), 255.0, np.float32)
    cx = w - 2 - first * h
    for ch in reversed(f"{number:,}"):
        if ch == ",":
            cx -= comma * h
            continue
        samples = _RAW["d" + ch]                      # the saved examples include faint see-through ones:
        best = samples[int(np.argmax(samples.reshape(len(samples), -1).max(axis=1)))]   # use the clearest
        p = cv2.resize(best, None, fx=k, fy=k, interpolation=cv2.INTER_LINEAR)
        ph, pw = p.shape
        ys, xs = np.where(p > 0.4 * p.max())                  # centre each digit on its drawn shape,
        shape_cx = (xs.min() + xs.max() + 1) / 2              # like a fixed-width font does
        x0, y0 = int(round(cx - shape_cx)), int(round(h / 2 - ph / 2))
        V[y0:y0 + ph, x0:x0 + pw] = np.clip(V[y0:y0 + ph, x0:x0 + pw] - p, 0, 255)
        cx -= pitch * h
    img[y:y + h, x:x + w] = np.clip(V, 0, 255).astype(np.uint8)[..., None]
    return img

#!/usr/bin/env python3
"""Generate the deterministic, non-biological KidneyQuant demonstration tile."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

WIDTH, HEIGHT = 1600, 1200
SEED = 20260831
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "synthetic-demo-tile.jpg"

rng = np.random.default_rng(SEED)
noise = Image.fromarray(rng.integers(0, 256, (HEIGHT, WIDTH), dtype=np.uint8), "L")
field = np.asarray(noise.filter(ImageFilter.GaussianBlur(70)), dtype=np.float32)
field = (field - field.min()) / max(float(field.max() - field.min()), 1.0)
mask = field > 0.34

base = np.full((HEIGHT, WIDTH, 3), 244, dtype=np.uint8)
texture = rng.normal(0, 8, (HEIGHT, WIDTH, 1))
tissue_color = np.array([219, 151, 166], dtype=np.float32)
base[mask] = np.clip(tissue_color + texture[mask], 0, 255).astype(np.uint8)
image = Image.fromarray(base, "RGB")
draw = ImageDraw.Draw(image, "RGBA")

# Synthetic tubular/luminal forms. They are geometric texture, not anatomy.
for _ in range(58):
    cx = int(rng.integers(60, WIDTH - 60))
    cy = int(rng.integers(60, HEIGHT - 60))
    rx = int(rng.integers(18, 65))
    ry = int(rng.integers(14, 48))
    bbox = (cx - rx, cy - ry, cx + rx, cy + ry)
    draw.ellipse(bbox, fill=(249, 238, 229, 235), outline=(157, 77, 109, 210), width=int(rng.integers(4, 11)))

# Synthetic Sirius-Red-like fibers for threshold/overlay demonstration.
for _ in range(145):
    points = []
    x = int(rng.integers(0, WIDTH))
    y = int(rng.integers(0, HEIGHT))
    for step in range(int(rng.integers(3, 8))):
        points.append((x + step * int(rng.integers(12, 32)), y + int(24 * np.sin(step + rng.random()))))
    draw.line(points, fill=(166, 30, 53, int(rng.integers(110, 220))), width=int(rng.integers(2, 8)))

image = image.filter(ImageFilter.GaussianBlur(0.6))
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
image.save(OUTPUT, format="JPEG", quality=92, optimize=True, progressive=True)
print(OUTPUT)

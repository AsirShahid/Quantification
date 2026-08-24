from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path

import nd2
import numpy as np
import tifffile
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image

app = FastAPI(title="KidneyQuant image companion", docs_url=None, redoc_url=None)
MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def normalized_uint8(array: np.ndarray) -> np.ndarray:
    data = np.asarray(array)
    while data.ndim > 3:
        data = data[0]
    if data.ndim == 3 and data.shape[-1] not in (3, 4) and data.shape[0] in (2, 3, 4):
        data = np.moveaxis(data, 0, -1)
    if data.ndim == 3 and data.shape[-1] not in (3, 4):
        data = data[0]
    if data.ndim not in (2, 3):
        raise ValueError(f"Unsupported first-plane shape: {data.shape}")

    data = data.astype(np.float32, copy=False)
    channels = [data] if data.ndim == 2 else [data[..., index] for index in range(min(data.shape[-1], 3))]
    scaled: list[np.ndarray] = []
    for channel in channels:
        finite = channel[np.isfinite(channel)]
        if finite.size == 0:
            scaled.append(np.zeros(channel.shape, dtype=np.uint8))
            continue
        low, high = np.percentile(finite, (0.2, 99.8))
        if high <= low:
            high = low + 1
        scaled.append(np.clip((channel - low) * 255.0 / (high - low), 0, 255).astype(np.uint8))

    if data.ndim == 2:
        return scaled[0]
    if len(scaled) == 2:
        scaled.append(np.zeros_like(scaled[0]))
    return np.stack(scaled[:3], axis=-1)


@app.post("/decode")
async def decode(file: UploadFile = File(...)) -> Response:
    suffix = Path(file.filename or "upload").suffix.lower()
    if suffix not in {".nd2", ".tif", ".tiff", ".jp2", ".j2k", ".jpx"}:
        raise HTTPException(status_code=415, detail="Use an ND2, TIFF, or JP2 file.")

    temporary_path = ""
    written = 0
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temporary:
            temporary_path = temporary.name
            while chunk := await file.read(8 * 1024 * 1024):
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="The file exceeds the 2 GB companion limit.")
                temporary.write(chunk)

        if suffix == ".nd2":
            array = nd2.imread(temporary_path)
        elif suffix in {".tif", ".tiff"}:
            array = tifffile.imread(temporary_path)
        else:
            with Image.open(temporary_path) as opened:
                array = np.asarray(opened.convert("RGB"))

        display = normalized_uint8(array)
        output = io.BytesIO()
        Image.fromarray(display).save(output, format="PNG", optimize=True)
        return Response(
            output.getvalue(),
            media_type="image/png",
            headers={
                "Cache-Control": "no-store",
                "X-KidneyQuant-Plane": "first-plane-normalized-to-8-bit",
            },
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"The first image plane could not be decoded: {error}") from error
    finally:
        if temporary_path and os.path.exists(temporary_path):
            os.unlink(temporary_path)

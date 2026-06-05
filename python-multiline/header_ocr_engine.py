import io
import re
from typing import Optional

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

try:
    import ollama
except Exception:
    ollama = None


MIN_DIM = 800
DEFAULT_MODEL = "qwen2.5vl:7b"
MODEL_OPTIONS = {
  "temperature": 0,
    "num_ctx": 4096,
    "num_predict": 2048,
}


WELL_LOG_HEADER_KEYS = [
    "FILING_NO", "LOG_TYPE", "TYPE_LOG", "COMPANY", "WELL", "FIELD",
    "COUNTY", "STATE", "LOCATION", "API", "SEC", "TWP", "RGE",
    "PERMANENT_DATUM", "LOG_MEASURED_FROM", "DRILLING_MEASURED_FROM",
    "GROUND_LEVEL", "ELEV_KF", "ELEV_KB", "ELEV_DF", "ELEV_GL", "DATE",
    "RUN_NO", "TYPE_LOG_RUN", "DEPTH_DRILLER", "DEPTH_LOGGER",
    "BOTTOM_LOGGED_INTERVAL", "TOP_LOGGED_INTERVAL", "TYPE_FLUID_IN_HOLE",
    "SALINITY_PPM_CL", "DENSITY", "LEVEL", "MAX_REC_TEMP_DEG_F",
    "OPERATING_RIG_TIME", "EQUIP_NO_LOCATION", "RECORDED_BY",
    "WITNESSED_BY", "RECEIVED_BY_AGENCY", "DATE_RECEIVED",
    "COMMISSION_NAME", "CONSERVATION_DIVISION", "CONSERVATION_OFFICER",
    "ADDITIONAL_STAMPS",
]


WELL_LOG_HEADER_OCR_PROMPT = """
You are an elite geophysical OCR engine specialized in oil and gas well log
header sheets. Extract every visible header field with exact value fidelity.
Preserve numbers, codes, dates, abbreviations, depth values, and units exactly
as printed or handwritten. If a field is blank, write BLANK. If uncertain, add
[?]. Extract rotated margin text and received/stamp boxes when present.

Return only KEY: VALUE lines using these keys when visible:
FILING_NO, LOG_TYPE, TYPE_LOG, COMPANY, WELL, FIELD, COUNTY, STATE, LOCATION,
API, SEC, TWP, RGE, PERMANENT_DATUM, LOG_MEASURED_FROM,
DRILLING_MEASURED_FROM, GROUND_LEVEL, ELEV_KF, ELEV_KB, ELEV_DF, ELEV_GL,
DATE, RUN_NO, TYPE_LOG_RUN, DEPTH_DRILLER, DEPTH_LOGGER,
BOTTOM_LOGGED_INTERVAL, TOP_LOGGED_INTERVAL, TYPE_FLUID_IN_HOLE,
SALINITY_PPM_CL, DENSITY, LEVEL, MAX_REC_TEMP_DEG_F, OPERATING_RIG_TIME,
EQUIP_NO_LOCATION, RECORDED_BY, WITNESSED_BY, RECEIVED_BY_AGENCY,
DATE_RECEIVED, COMMISSION_NAME, CONSERVATION_DIVISION, CONSERVATION_OFFICER,
ADDITIONAL_STAMPS.

Rules:
1. Start directly with FILING_NO: or the first visible key. No preamble.
2. Never normalize values. For example, keep 8/28/91 as 8/28/91.
3. Preserve township/range/section notation exactly as printed.
4. Capture all stamps, signatures, and handwritten marks.
5. Do not skip blank fields in a visible form; output BLANK.
6. Prefer exact transcription over guessing. Use [?] only for a single uncertain
   character or word, not for entire fields.
7. Return each key at most once. Keep values on the same line as their key.
"""


def _upscale_if_small(img: Image.Image) -> Image.Image:
    width, height = img.size
    if min(width, height) < MIN_DIM:
        scale = MIN_DIM / min(width, height)
        img = img.resize((int(width * scale), int(height * scale)), Image.LANCZOS)
    return img


def strategy_original(img: Image.Image) -> Image.Image:
    img = ImageOps.exif_transpose(img)
    img = _upscale_if_small(img)
    return img.convert("RGB")


def strategy_mild_enhance(img: Image.Image) -> Image.Image:
    img = ImageOps.exif_transpose(img)
    img = _upscale_if_small(img).convert("RGB")
    img = ImageEnhance.Sharpness(img).enhance(1.8)
    img = ImageEnhance.Contrast(img).enhance(1.5)
    return img


def strategy_grayscale_boost(img: Image.Image) -> Image.Image:
    img = ImageOps.exif_transpose(img)
    img = _upscale_if_small(img)
    gray = ImageEnhance.Contrast(img.convert("L")).enhance(1.8)
    gray = ImageEnhance.Sharpness(gray).enhance(2.0)
    return gray.convert("RGB")


def strategy_adaptive_threshold(img: Image.Image) -> Image.Image:
    img = ImageOps.exif_transpose(img)
    img = _upscale_if_small(img)
    gray = img.convert("L")
    arr = np.array(gray, dtype=np.float32)
    p2, p98 = np.percentile(arr, 2), np.percentile(arr, 98)
    if p98 > p2:
        arr = np.clip((arr - p2) / (p98 - p2) * 255, 0, 255)
    gray = Image.fromarray(arr.astype(np.uint8))
    gray = ImageEnhance.Contrast(gray).enhance(2.2)
    gray = gray.filter(ImageFilter.UnsharpMask(radius=1, percent=150, threshold=3))
    return gray.convert("RGB")


def strategy_denoised(img: Image.Image) -> Image.Image:
    img = ImageOps.exif_transpose(img)
    img = _upscale_if_small(img).convert("RGB")
    img = img.filter(ImageFilter.MedianFilter(size=3))
    img = ImageEnhance.Contrast(img).enhance(1.6)
    img = ImageEnhance.Sharpness(img).enhance(2.0)
    return img


STRATEGIES = [
    ("Original", strategy_original),
    ("Grayscale Boost", strategy_grayscale_boost),
]


def clean_output(raw: str) -> str:
    if not raw:
        return ""
    text = raw
    if "<|text|>" in text:
        text = text.split("<|text|>")[-1]
    if "</|text|>" in text:
        text = text.split("</|text|>")[0]
    text = re.sub(r'<\|think\|>.*?</\|think\|>', '', text, flags=re.DOTALL)
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    text = re.sub(r'```[a-z]*\n?', '', text)
    return text.replace("```", "").strip()


def _image_to_jpeg_bytes(img: Image.Image, quality: int = 92) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def _parse_key_values(text: str) -> dict:
    values = {}
    for raw_line in (text or "").splitlines():
        if ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        key = re.sub(r"[^A-Za-z0-9_]+", "_", key).upper().strip("_")
        if key in WELL_LOG_HEADER_KEYS:
            values[key] = value.strip()
    return values


def score_header_text(text: str) -> tuple[float, dict]:
    values = _parse_key_values(text)
    nonblank_values = {
        key: value for key, value in values.items()
        if value and value.upper() not in {"BLANK", "[BLANK]", "N/A", "NA"}
    }
    uncertain_marks = text.count("[?]")
    noisy_words = len(re.findall(r"\b[A-Za-z0-9]{18,}\b", text))
    score = (
        len(values) * 10.0
        + len(nonblank_values) * 4.0
        + min(len(text), 2500) / 250.0
        - uncertain_marks * 1.5
        - noisy_words * 2.0
    )
    return score, {
        "recognized_field_count": len(values),
        "nonblank_field_count": len(nonblank_values),
        "uncertain_mark_count": uncertain_marks,
        "score": round(score, 3),
    }


def extract_header_text_with_ollama(
    image_rgb,
    model_name: str = DEFAULT_MODEL,
    prompt: str = WELL_LOG_HEADER_OCR_PROMPT,
) -> tuple[str, dict]:
    if ollama is None:
        return "", {
            "engine": "ollama",
            "model": model_name,
            "strategy": None,
            "status": "unavailable",
            "error": "ollama package is not installed",
        }

    raw_img = Image.fromarray(image_rgb).convert("RGB")
    last_error: Optional[str] = None
    max_dim = 2560

    best_text = ""
    best_metadata = None

    for strategy_name, strategy_fn in STRATEGIES:
        try:
            candidate = raw_img
            width, height = candidate.size
            if max(width, height) > max_dim:
                scale = max_dim / max(width, height)
                candidate = candidate.resize((int(width * scale), int(height * scale)), Image.LANCZOS)

            processed = strategy_fn(candidate)
            response = ollama.chat(
                model=model_name,
                messages=[{
                    "role": "user",
                    "content": prompt,
                    "images": [_image_to_jpeg_bytes(processed)],
                }],
                options=MODEL_OPTIONS,
            )
            text = clean_output(response.get("message", {}).get("content", ""))
            if text and len(text.strip()) >= 5:
                score, score_metadata = score_header_text(text)
                metadata = {
                    "engine": "ollama",
                    "model": model_name,
                    "strategy": strategy_name,
                    "status": "success",
                    **score_metadata,
                }
                if best_metadata is None or score > best_metadata.get("score", float("-inf")):
                    best_text = text
                    best_metadata = metadata
        except Exception as e:
            last_error = str(e)
            continue

    if best_text:
        return best_text, best_metadata

    return "", {
        "engine": "ollama",
        "model": model_name,
        "strategy": None,
        "status": "failed",
        "error": last_error or "model returned no usable text",
    }

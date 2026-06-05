import io
import base64
import pickle
import cv2
import numpy as np
import torch
import tempfile
from PIL import Image
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from torchvision import transforms
import laspy
from helpers.train_with_config import UNet
import lasio
from ultralytics import YOLO
from google.genai import types
from google import genai
from pydantic import BaseModel
from typing import Optional, List
from openai import OpenAI
from scipy.interpolate import interp1d
import os
import json
from dotenv import load_dotenv
import easyocr
import re
from pathlib import Path
from boxRemoval import process_one_image
from tiff_chunk_detect import process_tiff_bytes_for_backend, process_image_for_backend
from header_ocr_engine import DEFAULT_MODEL as DEFAULT_HEADER_OCR_MODEL
from header_ocr_engine import extract_header_text_with_ollama
from curve_value_matcher import CurveValueMatcher, create_curve_info
from graph_vision_analyzer import GraphVisionAnalyzer

load_dotenv(".env")


app = FastAPI()

# Prepare the request
YOLO_MODEL_PATH=os.getenv("YOLO_MODEL_PATH")
GEMNI_KEY=os.getenv("GEMNI_KEY")
OPENAI_KEY=os.getenv("OPENAI_KEY")
TIFF_CHUNK_MODEL_PATH = os.getenv("TIFF_CHUNK_MODEL_PATH") or "best.pt"
HEADER_OCR_MODEL = os.getenv("HEADER_OCR_MODEL") or DEFAULT_HEADER_OCR_MODEL

# Pipeline mode: True = SVM+UNet, False = direct thresholding on cleaned image.
# The checked-in model files may be Git LFS pointers, so default to the
# deterministic tracker unless real weights are explicitly configured.
USE_UNET_PIPELINE = os.getenv("USE_UNET_PIPELINE", "false").lower() == "true"
USE_EASYOCR_GPU = os.getenv("EASYOCR_GPU", "false").lower() == "true"

# Load models on server startup
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

OCR_READER = None

WELL_LOG_HEADER_PROMPT = """
You are an elite geophysical OCR engine specialized in oil and gas well log
header sheets. Extract every visible header field with exact value fidelity.
Preserve numbers, codes, dates, abbreviations, depth values, and units exactly
as printed or handwritten. If a field is blank, write BLANK. If uncertain, add
[?]. Extract rotated margin text and received/stamp boxes when present.

Return only KEY: VALUE lines using these keys when visible:
FILING_NO, LOG_TYPE, TYPE_LOG, COMPANY, WELL, FIELD, COUNTY, STATE, LOCATION,
API, SEC, TWP, RGE, PERMANENT_DATUM, LOG_MEASURED_FROM,
DRILLING_MEASURED_FROM, GROUND_LEVEL, ELEV_KF, ELEV_KB, ELEV_DF, ELEV_GL,
DATE, RUN_NO, DEPTH_DRILLER, DEPTH_LOGGER, BOTTOM_LOGGED_INTERVAL,
TOP_LOGGED_INTERVAL, TYPE_FLUID_IN_HOLE, SALINITY_PPM_CL, DENSITY, LEVEL,
MAX_REC_TEMP_DEG_F, OPERATING_RIG_TIME, EQUIP_NO_LOCATION, RECORDED_BY,
WITNESSED_BY, RECEIVED_BY_AGENCY, DATE_RECEIVED, COMMISSION_NAME,
ADDITIONAL_STAMPS.
"""

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    print(f"[ERROR] Unhandled request error on {request.url.path}: {exc}")
    return JSONResponse(status_code=500, content={"detail": str(exc)})

class KalmanCurveTracker:
    """
    1D Kalman filter for row-by-row curve tracking.
    State is x-position and x-velocity while y increases.
    """
    def __init__(self, initial_x: float, process_noise: float = 18.0, measurement_noise: float = 5.0):
        self.kf = cv2.KalmanFilter(2, 1)
        self.kf.transitionMatrix = np.array([[1, 1], [0, 1]], dtype=np.float32)
        self.kf.measurementMatrix = np.array([[1, 0]], dtype=np.float32)
        self.kf.processNoiseCov = np.eye(2, dtype=np.float32) * process_noise
        self.kf.measurementNoiseCov = np.array([[measurement_noise]], dtype=np.float32)
        self.kf.errorCovPost = np.eye(2, dtype=np.float32)
        self.kf.statePost = np.array([[initial_x], [0.0]], dtype=np.float32)
        self.last_seen = 0
        self.max_gap = 120

    def predict(self) -> float:
        prediction = self.kf.predict()
        self.last_seen += 1
        return float(prediction[0])

    def update(self, measured_x: float) -> float:
        self.last_seen = 0
        corrected = self.kf.correct(np.array([[measured_x]], dtype=np.float32))
        return float(corrected[0])

    @property
    def is_lost(self) -> bool:
        return self.last_seen > self.max_gap


def separate_color_curves(bgr_image):
    """
    Separate red, green, and dark curve pixels with adaptive saturation.
    """
    hsv = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2HSV)
    _, saturation, value = cv2.split(hsv)

    non_white_saturation = saturation[value < 200]
    if non_white_saturation.size > 100:
        adaptive_s_min = max(25, int(np.percentile(non_white_saturation, 15)))
    else:
        adaptive_s_min = 35

    print(f"[INFO] Color separation: adaptive S_min = {adaptive_s_min}")

    red_mask = cv2.bitwise_or(
        cv2.inRange(
            hsv,
            np.array([0, adaptive_s_min, 40]),
            np.array([12, 255, 255]),
        ),
        cv2.inRange(
            hsv,
            np.array([163, adaptive_s_min, 40]),
            np.array([180, 255, 255]),
        ),
    )
    green_mask = cv2.inRange(
        hsv,
        np.array([32, adaptive_s_min, 35]),
        np.array([98, 255, 255]),
    )
    black_mask = cv2.inRange(
        hsv,
        np.array([0, 0, 0]),
        np.array([180, 80, 80]),
    )

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    return {
        "red": cv2.dilate(red_mask, kernel, iterations=1),
        "green": cv2.dilate(green_mask, kernel, iterations=1),
        "black": cv2.dilate(black_mask, kernel, iterations=1),
    }


def merge_color_masks(color_masks):
    """Merge binary color masks into one mask."""
    masks = list(color_masks.values())
    if not masks:
        raise ValueError("No color masks to merge")
    combined = np.zeros_like(masks[0])
    for mask in masks:
        combined = cv2.bitwise_or(combined, mask)
    return combined


def prepare_color_curve_mask(mask, dash_bridge_px=16):
    """Clean one color channel while preserving dashed curve fragments."""
    if cv2.countNonZero(mask) == 0:
        return mask

    small_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    closed_small = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, small_kernel, iterations=1)

    dash_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (dash_bridge_px, 1))
    closed_dash = cv2.morphologyEx(closed_small, cv2.MORPH_CLOSE, dash_kernel, iterations=1)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(closed_dash, connectivity=8)
    keep = np.zeros(num_labels, dtype=np.uint8)
    for label in range(1, num_labels):
        area = stats[label, cv2.CC_STAT_AREA]
        width = stats[label, cv2.CC_STAT_WIDTH]
        height = stats[label, cv2.CC_STAT_HEIGHT]
        long_side = max(width, height)
        short_side = max(1, min(width, height))
        aspect_ratio = long_side / short_side
        if area >= 6 or (aspect_ratio > 2.0 and long_side >= 8):
            keep[label] = 255

    result = keep[labels]
    erode_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 1))
    eroded = cv2.erode(result, erode_kernel, iterations=1)
    if cv2.countNonZero(eroded) < 10:
        return result
    return eroded


def apply_clahe(bgr_image):
    """Improve local contrast for faded or unevenly lit TIF scans."""
    lab = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_enhanced = clahe.apply(l_channel)
    enhanced_lab = cv2.merge([l_enhanced, a_channel, b_channel])
    return cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)


def extract_features(patch):
    if len(patch.shape) == 3:
        gray_patch = np.mean(patch, axis=2)
    else:
        gray_patch = patch
    gray_img = Image.fromarray(gray_patch.astype(np.uint8))
    gray_img = gray_img.resize((100, 100))
    gray_patch_resized = np.array(gray_img)
    features = gray_patch_resized.flatten()
    return features

def draw_horizontal_separators(image: np.ndarray, n_lines: int, threshold: int = 10) -> list:
    """
    Draw horizontal separator lines between graph lines in a binary image.
    
    Parameters:
        image (np.ndarray): Binary image (0 and 255) with white graph lines.
        n_lines (int): Number of graph lines (we will draw n_lines - 1 separators).
        threshold (int): Minimum vertical distance to consider for gap detection.

    Returns:
        np.ndarray: Image with horizontal separator lines drawn.
    """
    height, width = image.shape
    line_positions = []

    # Accumulate all valid vertical gaps between white pixels per column
    all_midpoints = []

    for x in range(width):
        y_indices = np.where(image[:, x] == 255)[0]
        if len(y_indices) < 2:
            continue
        # Check for vertical gaps
        for i in range(len(y_indices) - 1):
            y1, y2 = y_indices[i], y_indices[i + 1]
            if y2 - y1 > threshold:
                mid = (y1 + y2) // 2
                all_midpoints.append(mid)

    # Histogram of midpoints to find strong consistent gaps
    if not all_midpoints:
        print("No sufficient gaps found.")
        output_img = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        return output_img, []

    midpoint_counts = np.bincount(all_midpoints, minlength=height)
    top_midpoints = np.argsort(midpoint_counts)[::-1]  # sorted by frequency
    unique_lines = []

    # Filter to get top n_lines - 1 unique horizontal lines (well-separated)
    for y in top_midpoints:
        if len(unique_lines) == n_lines - 1:
            break
        # for u in unique_lines:
        #     print(abs(y - u))
        #     input()

        if all(abs(y - u) > threshold for u in unique_lines):
            unique_lines.append(y)

    # Convert to 3-channel for drawing
    output_img = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)

    # Draw lines in red
    for y in unique_lines:
        cv2.line(output_img, (0, y), (width - 1, y), (0, 0, 255), 3)

    return output_img, unique_lines

def patchify(img, patch_size):
    img = np.array(img)
    h, w, c = img.shape
    pad_h = (patch_size - h % patch_size) % patch_size
    pad_w = (patch_size - w % patch_size) % patch_size
    img_padded = np.pad(img, ((0, pad_h), (0, pad_w), (0, 0)), mode='reflect')
    H, W, _ = img_padded.shape
    patches = []
    patch_positions = []
    for i in range(0, H, patch_size):
        for j in range(0, W, patch_size):
            patch = img_padded[i:i+patch_size, j:j+patch_size, :]
            patches.append(patch)
            patch_positions.append((i, j))
    return patches, H, W, pad_h, pad_w, patch_positions

def refine_mask(image):
    """
    Remove noise while preserving dashed curves and thin curve fragments.
    """
    _, thresh = cv2.threshold(image, 127, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return image

    areas = [cv2.contourArea(contour) for contour in contours]
    total_area = sum(areas)
    area_factor = 0.0004
    filled_mask = np.zeros_like(image)

    for contour, area in zip(contours, areas):
        ratio = area / total_area if total_area > 0 else 0

        if ratio > area_factor:
            cv2.drawContours(filled_mask, [contour], -1, 255, thickness=cv2.FILLED)
            continue

        if len(contour) >= 5:
            _, _, w, h = cv2.boundingRect(contour)
            long_side = max(w, h)
            short_side = max(1, min(w, h))
            aspect_ratio = long_side / short_side

            if aspect_ratio > 2.5 and long_side > 12:
                cv2.drawContours(filled_mask, [contour], -1, 255, thickness=cv2.FILLED)
                continue

        if area > 150:
            cv2.drawContours(filled_mask, [contour], -1, 255, thickness=cv2.FILLED)

    return filled_mask

def extract_graphs(image, unique_lines):

    # Sort the separator line Y-values
    separator_ys = sorted(unique_lines)

    # Add top and bottom of the image to define full band ranges
    all_bounds = [0] + separator_ys + [image.shape[0]]

    # column wise sampling 
    lines_data = {}

    for i in range(len(all_bounds) - 1):
        y_start, y_end = all_bounds[i], all_bounds[i + 1]

        band = image[y_start:y_end, :]

        significant_points = []

        for x in range(band.shape[1]):
            # Get white pixels in this column
            ys = np.where(band[:, x] == 255)[0]

            if len(ys) == 0:
                continue

            # Take middle-most white pixel
            y = int(np.median(ys))
            original_y = y + y_start
            significant_points.append([int(x), int(original_y)])

        lines_data[f"line_{i+1}"] = significant_points
    
    return lines_data


def find_vertical_track_bounds(mask: np.ndarray, total_graphs: int) -> list[tuple[int, int]]:
    """
    Find vertical track boundaries from true low-density gap columns.
    Falls back to equal splits when the gaps are ambiguous.
    """
    _, width = mask.shape
    total_graphs = max(1, int(total_graphs))

    foreground = (mask == 255).astype(np.uint8)
    col_density = foreground.sum(axis=0).astype(float)

    window = max(15, min(61, width // 30))
    if window % 2 == 0:
        window += 1
    smooth = np.convolve(col_density, np.ones(window) / window, mode="same")

    max_density = float(smooth.max()) if smooth.size else 0.0
    if max_density == 0:
        step = width / total_graphs
        return [(int(round(i * step)), int(round((i + 1) * step))) for i in range(total_graphs)]

    gap_threshold = max(2.0, max_density * 0.03)
    gap_cols = np.where(smooth < gap_threshold)[0]

    if len(gap_cols) < total_graphs - 1:
        print(f"[WARN] Not enough gap columns found ({len(gap_cols)}), using equal splits")
        step = width / total_graphs
        return [(int(round(i * step)), int(round((i + 1) * step))) for i in range(total_graphs)]

    gap_groups = []
    group = [int(gap_cols[0])]
    for col in gap_cols[1:]:
        col = int(col)
        if col - group[-1] <= 3:
            group.append(col)
        else:
            gap_groups.append(group)
            group = [col]
    gap_groups.append(group)

    internal_gaps = []
    edge_margin = max(10, int(width * 0.02))
    for group in gap_groups:
        if len(group) < 2:
            continue
        midpoint = int(np.mean(group))
        if midpoint <= edge_margin or midpoint >= width - edge_margin:
            continue
        internal_gaps.append((midpoint, len(group)))

    internal_gaps.sort(key=lambda item: item[1], reverse=True)
    best_dividers = sorted(midpoint for midpoint, _ in internal_gaps[:total_graphs - 1])

    if len(best_dividers) < total_graphs - 1:
        step = width / total_graphs
        for i in range(total_graphs - 1):
            candidate = int(round((i + 1) * step))
            if candidate not in best_dividers:
                best_dividers.append(candidate)
            if len(best_dividers) >= total_graphs - 1:
                break
        best_dividers = sorted(best_dividers[:total_graphs - 1])

    bounds_x = [0] + best_dividers + [width]
    segments = [(bounds_x[i], bounds_x[i + 1]) for i in range(total_graphs)]
    trimmed_segments = []
    min_track_width = max(20, int(width * 0.08))
    for x1, x2 in segments:
        local_smooth = smooth[x1:x2]
        if local_smooth.size == 0:
            trimmed_segments.append((x1, x2))
            continue

        active_threshold = max(2.0, float(np.percentile(local_smooth, 65)) * 0.55)
        active_cols = np.where(local_smooth > active_threshold)[0]
        if len(active_cols) == 0:
            trimmed_segments.append((x1, x2))
            continue

        active_groups = []
        group = [int(active_cols[0])]
        for col in active_cols[1:]:
            col = int(col)
            if col - group[-1] <= 3:
                group.append(col)
            else:
                active_groups.append(group)
                group = [col]
        active_groups.append(group)

        best_group = max(active_groups, key=len)
        trim_start = max(x1, x1 + best_group[0] - 4)
        trim_end = min(x2, x1 + best_group[-1] + 5)
        if trim_end - trim_start >= min_track_width:
            trimmed_segments.append((trim_start, trim_end))
        else:
            trimmed_segments.append((x1, x2))

    segments = trimmed_segments
    print(f"[INFO] Track bounds found: {segments}")
    return segments


def extract_vertical_graph_tracks(mask: np.ndarray, total_graphs: int):
    """
    Extract vertical graph tracks with Kalman prediction through short gaps.
    """
    bounds = find_vertical_track_bounds(mask, int(total_graphs))
    lines_data = {}

    for idx, (x_start, x_end) in enumerate(bounds):
        track = mask[:, x_start:x_end]
        track_width = max(1, x_end - x_start)
        max_run_width = max(6, int(track_width * 0.18))
        max_jump = max(80, track_width * 0.55)
        max_row_ink = max(12, int(track_width * 0.35))
        border_margin = max(3, int(track_width * 0.02))
        points = []
        tracker = None

        def bounded_x(local_x: float) -> int:
            local_x = float(np.clip(local_x, 0, track_width - 1))
            return int(round(np.clip(local_x + x_start, x_start, max(x_start, x_end - 1))))

        def advance_prediction() -> bool:
            nonlocal tracker
            if tracker is None or tracker.is_lost:
                return False
            pred_x = tracker.predict()
            if pred_x < -max_jump or pred_x > (track_width - 1 + max_jump):
                tracker = None
                return False
            return True

        for y in range(track.shape[0]):
            xs = np.where(track[y, :] == 255)[0]
            if len(xs) == 0:
                advance_prediction()
                continue
            row_has_too_much_ink = len(xs) > max_row_ink

            runs = []
            run_start = int(xs[0])
            prev_x = int(xs[0])
            for raw_x in xs[1:]:
                raw_x = int(raw_x)
                if raw_x == prev_x + 1:
                    prev_x = raw_x
                else:
                    runs.append((run_start, prev_x))
                    run_start = raw_x
                    prev_x = raw_x
            runs.append((run_start, prev_x))

            candidates = []
            track_right_edge = track_width - 1
            for run_x1, run_x2 in runs:
                run_width = run_x2 - run_x1 + 1
                if (
                    row_has_too_much_ink
                    and run_x1 <= 2
                    and run_x2 >= track_right_edge - 2
                ):
                    continue

                if run_x2 >= track_right_edge - 2 and run_width > max_run_width:
                    if tracker is None or tracker.is_lost:
                        continue
                    trimmed_width = max(1, min(max_run_width, run_width // 2))
                    trimmed_center = run_x1 + trimmed_width / 2.0
                    candidates.append((trimmed_center, trimmed_width))
                    continue

                if run_x1 <= 2 and run_width > max_run_width:
                    if tracker is None or tracker.is_lost:
                        continue
                    trimmed_center = max(0.0, run_x2 - max_run_width / 2.0)
                    candidates.append((trimmed_center, max_run_width))
                    continue

                if run_width <= max_run_width:
                    candidates.append(((run_x1 + run_x2) / 2.0, run_width))

            if not candidates:
                advance_prediction()
                continue

            interior_candidates = [
                candidate
                for candidate in candidates
                if border_margin <= candidate[0] <= (track_width - 1 - border_margin)
            ]
            if interior_candidates:
                candidates = interior_candidates
            elif tracker is None or tracker.is_lost:
                continue

            if tracker is None or tracker.is_lost:
                x_local = float(np.median([center for center, _ in candidates]))
                tracker = KalmanCurveTracker(initial_x=x_local)
                measured = tracker.update(x_local)
            else:
                pred_x = tracker.predict()
                if pred_x < -max_jump or pred_x > (track_width - 1 + max_jump):
                    x_local = float(np.median([center for center, _ in candidates]))
                    tracker = KalmanCurveTracker(initial_x=x_local)
                    measured = tracker.update(x_local)
                    points.append([bounded_x(measured), int(y)])
                    continue

                x_local, _ = min(
                    candidates,
                    key=lambda candidate: abs(candidate[0] - pred_x) + candidate[1] * 0.2,
                )
                if abs(x_local - pred_x) > max_jump:
                    continue
                measured = tracker.update(x_local)

            points.append([bounded_x(measured), int(y)])

        smoothed = smooth_vertical_points(points, window=5)
        filled = fill_tracking_gaps(smoothed, max_gap_rows=120)
        cleaned = ransac_outlier_removal(filled, residual_threshold=40)
        refined = refine_tracked_points_with_mask(
            cleaned,
            mask_column=track,
            x_offset=x_start,
            search_radius=20,
        )
        lines_data[f"line_{idx+1}"] = [
            [bounded_x(x - x_start), int(y)]
            for x, y in refined
            if 0 <= int(y) < mask.shape[0]
        ]

    return lines_data, bounds


def smooth_vertical_points(points, window=5):
    if len(points) < 3:
        return points
    pts = sorted(points, key=lambda p: p[1])
    xs = np.asarray([p[0] for p in pts], dtype=float)
    ys = np.asarray([p[1] for p in pts], dtype=float)
    if len(xs) >= window:
        pad = window // 2
        padded = np.pad(xs, (pad, pad), mode="edge")
        xs = np.asarray([np.median(padded[i:i + window]) for i in range(len(xs))], dtype=float)
    return [[int(round(x)), int(round(y))] for x, y in zip(xs, ys)]


def fill_tracking_gaps(points, max_gap_rows=120):
    """Fill missing row gaps in tracked points using cubic interpolation."""
    if len(points) < 4:
        return points

    pts = sorted(points, key=lambda p: p[1])
    ys = np.array([p[1] for p in pts])
    xs = np.array([p[0] for p in pts], dtype=float)
    y_min, y_max = int(ys.min()), int(ys.max())
    existing_ys = set(int(y) for y in ys.tolist())

    gap_start = None
    gaps = []
    for y in range(y_min, y_max + 1):
        if y not in existing_ys:
            if gap_start is None:
                gap_start = y
        elif gap_start is not None:
            gap_len = y - gap_start
            if gap_len <= max_gap_rows:
                gaps.append((gap_start, y - 1))
            gap_start = None

    if not gaps:
        return points

    try:
        from scipy.interpolate import CubicSpline
        unique_y, unique_indices = np.unique(ys, return_index=True)
        unique_x = xs[unique_indices]
        if len(unique_y) < 4:
            return points
        spline = CubicSpline(unique_y, unique_x, extrapolate=False)
    except Exception as e:
        print(f"[WARN] Gap fill spline failed: {e}")
        return points

    filled = list(pts)
    for gap_y_start, gap_y_end in gaps:
        for y in range(gap_y_start, gap_y_end + 1):
            x_interp = spline(float(y))
            if not np.isnan(x_interp):
                filled.append([int(round(float(x_interp))), int(y)])

    return sorted(filled, key=lambda p: p[1])


def refine_tracked_points_with_mask(points, mask_column, x_offset=0, search_radius=25):
    """Snap tracked points back to nearby real mask pixels after Kalman smoothing."""
    if not points or mask_column is None:
        return points

    refined = []
    for gx, gy in sorted(points, key=lambda p: p[1]):
        gy = int(gy)
        lx = int(round(gx - x_offset))
        if gy < 0 or gy >= mask_column.shape[0]:
            refined.append([int(gx), gy])
            continue

        white_cols = np.where(mask_column[gy, :] == 255)[0]
        if len(white_cols) == 0:
            refined.append([int(gx), gy])
            continue

        nearby = white_cols[np.abs(white_cols.astype(int) - lx) <= search_radius]
        if len(nearby) == 0:
            refined.append([int(gx), gy])
            continue

        best_local = int(nearby[np.argmin(np.abs(nearby.astype(int) - lx))])
        refined.append([best_local + x_offset, gy])

    return refined


def ransac_outlier_removal(points, residual_threshold=40, min_samples=10):
    """Remove clear noise outliers while preserving legitimate curve spikes."""
    if len(points) < min_samples:
        return points

    try:
        from sklearn.linear_model import RANSACRegressor
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import PolynomialFeatures

        pts = sorted(points, key=lambda p: p[1])
        ys = np.array([p[1] for p in pts]).reshape(-1, 1)
        xs = np.array([p[0] for p in pts])

        ransac = make_pipeline(
            PolynomialFeatures(degree=2),
            RANSACRegressor(
                residual_threshold=residual_threshold,
                min_samples=max(0.5, min_samples / len(pts)),
                max_trials=200,
                random_state=42,
            ),
        )
        ransac.fit(ys, xs)
        inlier_mask = ransac.named_steps["ransacregressor"].inlier_mask_
        cleaned = [p for p, inlier in zip(pts, inlier_mask) if inlier]

        min_kept = int(len(pts) * 0.75)
        if len(cleaned) < min_kept:
            removed = len(pts) - len(cleaned)
            print(
                f"[WARN] RANSAC would remove {removed} pts "
                f"({removed / len(pts) * 100:.0f}%); keeping original"
            )
            return pts

        removed = len(pts) - len(cleaned)
        if removed > 0:
            print(f"[INFO] RANSAC removed {removed} outlier points ({removed / len(pts) * 100:.1f}%)")
        return cleaned
    except ImportError:
        print("[WARN] scikit-learn not installed; skipping RANSAC")
        return points
    except Exception as e:
        print(f"[WARN] RANSAC failed, keeping all points: {e}")
        return points

def _track_bounds_to_boundaries(track_bounds, image_height):
    return [
        {
            "left": int(x1),
            "right": int(x2),
            "top": 0,
            "bottom": int(image_height),
        }
        for x1, x2 in track_bounds
    ]


def _line_points_to_boundary(points, image_width, image_height, pad=8):
    if not points:
        return {"left": 0, "right": int(image_width), "top": 0, "bottom": int(image_height)}
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return {
        "left": int(max(0, min(xs) - pad)),
        "right": int(min(image_width, max(xs) + pad)),
        "top": int(max(0, min(ys) - pad)),
        "bottom": int(min(image_height, max(ys) + pad)),
    }


def _graph_points_to_boundaries(graph_points, image_width, image_height):
    return [
        _line_points_to_boundary(points, image_width, image_height)
        for points in graph_points.values()
    ]


def run_pipeline_and_graph(img_np, threshold, total_graphs, patch_size, batch_size):
    input_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
    cleaned_bgr = process_one_image(input_bgr, output_root=None, image_name='pipeline_input')
    if cleaned_bgr is None:
        raise ValueError('Grid removal failed in process_one_image')

    color_masks = separate_color_curves(cleaned_bgr)
    red_pixels = cv2.countNonZero(color_masks["red"])
    green_pixels = cv2.countNonZero(color_masks["green"])
    total_pixels = cleaned_bgr.shape[0] * cleaned_bgr.shape[1]
    use_color_separation = (red_pixels + green_pixels) > (total_pixels * 0.001)

    if use_color_separation:
        print(f"[INFO] Color separation active: red={red_pixels}px, green={green_pixels}px")

        red_refined = prepare_color_curve_mask(color_masks["red"])
        green_refined = prepare_color_curve_mask(color_masks["green"])
        black_refined = prepare_color_curve_mask(color_masks["black"])
        combined_for_bounds = cv2.bitwise_or(
            cv2.bitwise_or(red_refined, green_refined),
            black_refined,
        )

        if cv2.countNonZero(combined_for_bounds) < 25:
            print("[WARN] Color masks were too sparse; falling back to normal pipeline")
        else:
            track_bounds = find_vertical_track_bounds(combined_for_bounds, int(total_graphs))
            print(f"[INFO] Color track bounds: {track_bounds}")

            assigned_colors = {}
            for color_name, refined in (("red", red_refined), ("green", green_refined)):
                if cv2.countNonZero(refined) < 25:
                    continue

                best_track = None
                best_pixels = 0
                for track_idx, (x_start, x_end) in enumerate(track_bounds):
                    if track_idx in assigned_colors:
                        continue
                    pixel_count = cv2.countNonZero(refined[:, x_start:x_end])
                    if pixel_count > best_pixels:
                        best_pixels = pixel_count
                        best_track = track_idx

                if best_track is not None and best_pixels > 25:
                    assigned_colors[best_track] = color_name

            colored_combined = cv2.bitwise_or(red_refined, green_refined)
            black_only = cv2.bitwise_and(black_refined, cv2.bitwise_not(colored_combined))
            graph_points = {}

            for track_idx, (x_start, x_end) in enumerate(track_bounds):
                color_name = assigned_colors.get(track_idx)
                if color_name == "red":
                    track_mask = red_refined[:, x_start:x_end]
                elif color_name == "green":
                    track_mask = green_refined[:, x_start:x_end]
                else:
                    track_mask = black_only[:, x_start:x_end]

                if cv2.countNonZero(track_mask) < 25:
                    track_mask = combined_for_bounds[:, x_start:x_end]

                full_width_mask = np.zeros_like(combined_for_bounds)
                full_width_mask[:, x_start:x_end] = track_mask
                points, _ = extract_vertical_graph_tracks(full_width_mask, 1)
                line_key = f"line_{track_idx + 1}"
                graph_points[line_key] = points.get("line_1", [])
                print(
                    f"[INFO] Track {track_idx + 1} ({color_name or 'black'}): "
                    f"{len(graph_points[line_key])} points"
                )

            if graph_points:
                image_mask = cv2.cvtColor(combined_for_bounds, cv2.COLOR_GRAY2BGR)
                for track_idx, (x1, x2) in enumerate(track_bounds):
                    color = [(0, 0, 255), (0, 180, 0), (255, 165, 0)][track_idx % 3]
                    cv2.rectangle(image_mask, (x1, 0), (x2, image_mask.shape[0] - 1), color, 2)
                return image_mask, graph_points, _track_bounds_to_boundaries(track_bounds, image_mask.shape[0])

    cleaned_bgr = apply_clahe(cleaned_bgr)

    if USE_UNET_PIPELINE:
        print('[INFO] Using SVM+UNet pipeline')
        model_dir = os.path.join(os.path.dirname(__file__), 'models')
        model = UNet(n_channels=3, n_classes=1).to(device)
        candidate_weight_files = [
            os.path.join(model_dir, 'best_model.pth'),
            os.path.join(model_dir, 'checkpoint_epoch_9.pth'),
        ]
        load_errors = []
        weights_loaded = False

        for weight_path in candidate_weight_files:
            if not os.path.exists(weight_path):
                continue
            try:
                checkpoint = torch.load(weight_path, map_location=device)
                if isinstance(checkpoint, dict) and 'model_state_dict' in checkpoint:
                    state_dict = checkpoint['model_state_dict']
                else:
                    state_dict = checkpoint
                model.load_state_dict(state_dict)
                print(f"[INFO] Loaded UNet weights from: {weight_path}")
                weights_loaded = True
                break
            except Exception as e:
                load_errors.append(f"{os.path.basename(weight_path)} -> {e}")

        if not weights_loaded:
            raise RuntimeError(
                "Unable to load compatible UNet weights. Tried: "
                + ", ".join([os.path.basename(p) for p in candidate_weight_files])
                + " | Errors: "
                + " || ".join(load_errors)
            )
        model.eval()

        print('[INFO] Using cleaned image from boxRemoval as UNet input')

        cleaned_rgb = cv2.cvtColor(cleaned_bgr, cv2.COLOR_BGR2RGB)
        orig_image = Image.fromarray(cleaned_rgb).convert('RGB')
        orig_w, orig_h = orig_image.size
        patches, H, W, pad_h, pad_w, patch_positions = patchify(orig_image, patch_size)

        transform = transforms.Compose([
            transforms.Resize((patch_size, patch_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225])
        ])

        full_mask = np.zeros((H, W), dtype=np.uint8)
        pred_patches = []
        batch = []
        batch_indices = []

        def flush_unet_batch():
            nonlocal batch, batch_indices
            if not batch:
                return
            batch_tensor = torch.stack(batch).to(device)
            with torch.no_grad():
                output = model(batch_tensor)
                prediction = torch.sigmoid(output)
                prediction = (prediction > threshold).float()

            for j, pred in enumerate(prediction):
                pred_mask = pred.squeeze().cpu().numpy() * 255
                pred_mask = pred_mask.astype(np.uint8)
                pred_patches.append((batch_indices[j], pred_mask))

            batch = []
            batch_indices = []

        for i, patch in enumerate(patches):
            if np.mean(patch) > 250:
                continue

            patch_img = Image.fromarray(patch)
            input_tensor = transform(patch_img)
            batch.append(input_tensor)
            batch_indices.append(i)

            if len(batch) == batch_size:
                flush_unet_batch()

        flush_unet_batch()

        for idx, pred_mask in pred_patches:
            i, j = patch_positions[idx]
            full_mask[i:i+patch_size, j:j+patch_size] = pred_mask

        mask_full = full_mask[:orig_h, :orig_w]
        print('[INFO] Using UNet output mask for graph reconstruction')
    else:
        print('[INFO] Skipping SVM+UNet, using direct thresholding on cleaned image')
        cleaned_gray = cv2.cvtColor(cleaned_bgr, cv2.COLOR_BGR2GRAY)
        _, mask_full = cv2.threshold(cleaned_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        print('[INFO] Using thresholded mask for graph reconstruction')

    # Removing noise
    raw_mask_full = mask_full.copy()
    mask_full = refine_mask(mask_full)
    if cv2.countNonZero(mask_full) == 0 and cv2.countNonZero(raw_mask_full) > 0:
        print("[WARN] refine_mask removed all foreground; using raw mask")
        mask_full = raw_mask_full

    if mask_full.shape[0] > mask_full.shape[1] * 1.5:
        graph_points, track_bounds = extract_vertical_graph_tracks(
            mask_full,
            int(total_graphs),
        )
        image_mask = cv2.cvtColor(mask_full, cv2.COLOR_GRAY2BGR)
        for idx, (x1, x2) in enumerate(track_bounds):
            color = (0, 0, 255) if idx == 0 else (0, 180, 0)
            cv2.rectangle(image_mask, (x1, 0), (x2, mask_full.shape[0] - 1), color, 2)
        print('[INFO] Using vertical track extraction for portrait log image')
        graph_boundaries = _track_bounds_to_boundaries(track_bounds, mask_full.shape[0])
    else:
        # separating graphs
        image_mask, unique_lines = draw_horizontal_separators(image=mask_full, n_lines=total_graphs)

        # extract graph points
        graph_points = extract_graphs(image = mask_full, unique_lines=unique_lines)
        graph_boundaries = _graph_points_to_boundaries(graph_points, mask_full.shape[1], mask_full.shape[0])
    
    return image_mask, graph_points, graph_boundaries

class HeaderItem(BaseModel):
    Mnemonic: str
    Value: Optional[str]
    Unit: Optional[str] = None
    Description: Optional[str] = None

class LasHeader(BaseModel):
    las_version: Optional[List[HeaderItem]] = None
    las_well: Optional[List[HeaderItem]] = None

def convert_to_json_openai(ocr_text):
    try:
        client = OpenAI(api_key=OPENAI_KEY)
        response = client.responses.parse(
            model="gpt-4o-2024-08-06",
            input=[
                {
                    "role": "system",
                    "content": (
                        "You are a parser that extracts structured LAS header metadata from OCR-scanned well log text. "
                        "Return a JSON object with 'las_version' and 'las_well' as lists of items, where each item contains: "
                        "Mnemonic, Value, optional Unit, and Description if known."
                    ),
                },
                {"role": "user", "content": ocr_text},
            ],
            text_format=LasHeader,
        )

        las_header_json = {
            "las.version": [item.model_dump() for item in response.output_parsed.las_version or []],
            "las.well": [item.model_dump() for item in response.output_parsed.las_well or []],
        }
        # print(las_header_json)
        return las_header_json
    except Exception as e:
        print(f"[WARN] OpenAI API error ignored: {e}")
        return {}

def get_ocr_reader():
    global OCR_READER
    if OCR_READER is None:
        OCR_READER = easyocr.Reader(['en'], gpu=USE_EASYOCR_GPU and torch.cuda.is_available())
    return OCR_READER


HEADER_OCR_KEYWORDS = [
    "company",
    "well",
    "field",
    "county",
    "state",
    "location",
    "api",
    "sec",
    "twp",
    "rge",
    "permanent datum",
    "log measured from",
    "drilling measured from",
    "elevation",
    "ground level",
    "log type",
    "type log",
]


def score_header_ocr_text(text):
    normalized = re.sub(r"\s+", " ", (text or "")).strip().lower()
    if not normalized:
        return 0.0

    keyword_hits = sum(1 for keyword in HEADER_OCR_KEYWORDS if keyword in normalized)
    lines = [line for line in (text or "").splitlines() if line.strip()]
    alpha_ratio = sum(ch.isalnum() for ch in normalized) / max(1, len(normalized))
    punctuation_bonus = normalized.count(":") * 4 + normalized.count("/") * 2
    noise_penalty = sum(1 for ch in normalized if ch in "@#$%^*<>~") * 2

    return (
        keyword_hits * 120.0
        + len(lines) * 6.0
        + min(len(normalized), 4000) / 40.0
        + alpha_ratio * 10.0
        + punctuation_bonus
        - noise_penalty
    )


def extract_header_text_easyocr(image):
    """Extract raw header text locally so header OCR works without API keys."""
    try:
        reader = get_ocr_reader()
        base_image = Image.fromarray(image).convert("RGB")
        candidates = [
            ("rot90ccw", base_image.rotate(90, expand=True)),
            ("rot0", base_image),
            ("rot90cw", base_image.rotate(-90, expand=True)),
            ("rot180", base_image.rotate(180, expand=True)),
        ]

        best_text = ""
        best_score = float("-inf")
        best_orientation = None

        for orientation, candidate in candidates:
            results = reader.readtext(np.array(candidate), paragraph=True)
            lines = []
            seen = set()
            for result in results:
                if len(result) >= 2:
                    text = re.sub(r"\s+", " ", str(result[1]).strip())
                    if text and text not in seen:
                        seen.add(text)
                        lines.append(text)
            text = "\n".join(lines).strip()
            score = score_header_ocr_text(text)
            if score > best_score:
                best_text = text
                best_score = score
                best_orientation = orientation
            if score >= 350:
                break

        if best_orientation:
            print(f"[INFO] EasyOCR header orientation selected: {best_orientation} (score={best_score:.1f})")
        return best_text
    except Exception as e:
        print(f"[WARN] EasyOCR header extraction failed: {e}")
        return ""


def extract_las_header(image):
    raw_text = ""
    metadata = {
        "engine": "none",
        "model": None,
        "strategy": None,
        "status": "not_started",
    }
    try:
        raw_text, metadata = extract_header_text_with_ollama(
            image,
            model_name=HEADER_OCR_MODEL,
        )

        if not raw_text and GEMNI_KEY:
            client = genai.Client(api_key=GEMNI_KEY)
            byte_arr = io.BytesIO()
            image_pil = Image.fromarray(image)
            image_pil.save(byte_arr, format='JPEG')
            image_bytes = byte_arr.getvalue()

            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[
                    types.Part.from_bytes(
                        data=image_bytes,
                        mime_type='image/jpeg',
                    ),
                    WELL_LOG_HEADER_PROMPT
                ]
            )
            raw_text = response.text or ""
            metadata = {
                "engine": "gemini",
                "model": "gemini-2.5-flash",
                "strategy": None,
                "status": "success" if raw_text else "failed",
            }

        if not raw_text:
            raw_text = extract_header_text_easyocr(image)
            metadata = {
                "engine": "easyocr",
                "model": "easyocr.Reader(['en'])",
                "strategy": "retry",
                "status": "success" if raw_text else "failed",
                "fallback_from": metadata,
            }

        parsed_header = parse_well_log_ocr_to_las_header(raw_text)
        if not parsed_header and OPENAI_KEY and raw_text:
            parsed_header = convert_to_json_openai(raw_text)

        return parsed_header or {}, raw_text, metadata
    except Exception as e:
        print(f"[WARN] Header OCR failed, falling back to EasyOCR: {e}")
        raw_text = extract_header_text_easyocr(image)
        parsed_header = parse_well_log_ocr_to_las_header(raw_text)
        return parsed_header or {}, raw_text, {
            "engine": "easyocr",
            "model": "easyocr.Reader(['en'])",
            "strategy": None,
            "status": "success" if raw_text else "failed",
            "error": str(e),
        }


def parse_well_log_ocr_to_las_header(ocr_text):
    """Convert Drake OCR style KEY: VALUE output into LAS header sections."""
    if not ocr_text:
        return {}

    key_map = {
        "FILING_NO": ("FIL", "", "Filing number"),
        "LOG_TYPE": ("SRVC", "", "Log type"),
        "TYPE_LOG": ("SRVC", "", "Type log"),
        "COMPANY": ("COMP", "", "Company"),
        "WELL": ("WELL", "", "Well name"),
        "FIELD": ("FLD", "", "Field"),
        "COUNTY": ("CNTY", "", "County"),
        "STATE": ("STAT", "", "State"),
        "LOCATION": ("LOC", "", "Location"),
        "API": ("API", "", "API number"),
        "SEC": ("SEC", "", "Section"),
        "TWP": ("TWP", "", "Township"),
        "RGE": ("RGE", "", "Range"),
        "PERMANENT_DATUM": ("PDAT", "", "Permanent datum"),
        "LOG_MEASURED_FROM": ("LMF", "", "Log measured from"),
        "DRILLING_MEASURED_FROM": ("DMF", "", "Drilling measured from"),
        "GROUND_LEVEL": ("GL", "FT", "Ground level"),
        "ELEV_KF": ("EKF", "FT", "Elevation KF"),
        "ELEV_KB": ("EKB", "FT", "Elevation KB"),
        "ELEV_DF": ("EDF", "FT", "Elevation DF"),
        "ELEV_GL": ("EGL", "FT", "Elevation GL"),
        "DATE": ("DATE", "", "Log date"),
        "RUN_NO": ("RUN", "", "Run number"),
        "DEPTH_DRILLER": ("TDD", "FT", "Depth driller"),
        "DEPTH_LOGGER": ("TDL", "FT", "Depth logger"),
        "BOTTOM_LOGGED_INTERVAL": ("BLI", "FT", "Bottom logged interval"),
        "TOP_LOGGED_INTERVAL": ("TLI", "FT", "Top logged interval"),
        "TYPE_FLUID_IN_HOLE": ("FLUID", "", "Type fluid in hole"),
        "SALINITY_PPM_CL": ("SAL", "PPM", "Salinity PPM Cl"),
        "DENSITY": ("DENS", "", "Density"),
        "LEVEL": ("LVL", "FT", "Fluid level"),
        "MAX_REC_TEMP_DEG_F": ("MRT", "DEGF", "Maximum recorded temperature"),
        "OPERATING_RIG_TIME": ("RIGT", "", "Operating rig time"),
        "EQUIP_NO_LOCATION": ("EQNO", "", "Equipment number/location"),
        "RECORDED_BY": ("ENG", "", "Recorded by"),
        "WITNESSED_BY": ("WIT", "", "Witnessed by"),
        "RECEIVED_BY_AGENCY": ("RCBY", "", "Received by agency"),
        "DATE_RECEIVED": ("RCDT", "", "Date received"),
        "COMMISSION_NAME": ("COMM", "", "Commission name"),
        "ADDITIONAL_STAMPS": ("NOTE", "", "Additional stamps and notes"),
    }

    def normalize_value(value):
        return re.sub(r"\s+", " ", str(value or "")).strip(" -:;|")

    def extract_freeform_value(text, patterns):
        for pattern in patterns:
            match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
            if not match:
                continue
            value = match.group(1) if match.groups() else match.group(0)
            value = normalize_value(value)
            if value:
                return value
        return ""

    flat_text = normalize_value(ocr_text)

    freeform_fields = {
        "LOG_TYPE": extract_freeform_value(flat_text, [
            r"\b(microresistivity\s+log|digital\s+log|gamma\s+ray|micro\s+log|sp\s+log)\b",
        ]),
        "TYPE_LOG": extract_freeform_value(flat_text, [
            r"\b(microresistivity\s+log|digital\s+log|gamma\s+ray|micro\s+log|sp\s+log)\b",
        ]),
        "API": extract_freeform_value(flat_text, [
            r"\b(\d{2,3}-\d{3}-\d{2},\d{3}-\d{2}-\d{2})\b",
            r"\bapi(?:\s*no\.?|\s*number)?[:\s_]*([0-9,\-]{8,})",
        ]),
        "COMPANY": extract_freeform_value(flat_text, [
            r"\bcompany\b\s+(.+?)(?=\s+\bwell\b|\s+\bfield\b|\s+\bcounty\b|\s+\bstate\b|\s+\blocation\b|\s+\bapi\b|\s+\bsec\b|\s+\btwp\b|\s+\brge\b|\s+\belevation\b|\s+\bpermanent datum\b|\s+\blog measured from\b|\s+\bdrilling measured from\b|\s+\bdate\b|\s+\brun number\b)",
        ]),
        "WELL": extract_freeform_value(flat_text, [
            r"\bwell\b\s+(.+?)(?=\s+\bfield\b|\s+\bcounty\b|\s+\bstate\b|\s+\blocation\b|\s+\bapi\b|\s+\bsec\b|\s+\btwp\b|\s+\brge\b|\s+\belevation\b|\s+\bpermanent datum\b|\s+\blog measured from\b|\s+\bdrilling measured from\b|\s+\bdate\b|\s+\brun number\b)",
        ]),
        "FIELD": extract_freeform_value(flat_text, [
            r"\bfield\b\s+(.+?)(?=\s+\bcounty\b|\s+\bstate\b|\s+\blocation\b|\s+\bapi\b|\s+\bsec\b|\s+\btwp\b|\s+\brge\b|\s+\belevation\b|\s+\bpermanent datum\b|\s+\blog measured from\b|\s+\bdrilling measured from\b|\s+\bdate\b|\s+\brun number\b)",
        ]),
        "COUNTY": extract_freeform_value(flat_text, [
            r"\bcounty\b\s+(.+?)(?=\s+\bstate\b|\s+\blocation\b|\s+\bapi\b|\s+\bsec\b|\s+\btwp\b|\s+\brge\b|\s+\belevation\b|\s+\bpermanent datum\b|\s+\blog measured from\b|\s+\bdrilling measured from\b|\s+\bdate\b|\s+\brun number\b)",
        ]),
        "STATE": extract_freeform_value(flat_text, [
            r"\bstate\b\s+(.+?)(?=\s+\blocation\b|\s+\bapi\b|\s+\bsec\b|\s+\btwp\b|\s+\brge\b|\s+\belevation\b|\s+\bpermanent datum\b|\s+\blog measured from\b|\s+\bdrilling measured from\b|\s+\bdate\b|\s+\brun number\b)",
        ]),
        "LOCATION": extract_freeform_value(flat_text, [
            r"\blocation\b\s+(.+?)(?=\s+\bsec\b|\s+\btwp\b|\s+\brge\b|\s+\belevation\b|\s+\bpermanent datum\b|\s+\blog measured from\b|\s+\bdrilling measured from\b|\s+\bdate\b|\s+\brun number\b)",
        ]),
        "SEC": extract_freeform_value(flat_text, [
            r"\bsec[:\s]*([0-9A-Za-z\-]+)",
        ]),
        "TWP": extract_freeform_value(flat_text, [
            r"\btwp[:\s]*([0-9A-Za-z\- ]+?)(?=\s+\brge\b|\s+\belevation\b|\s+\bpermanent datum\b|\s+\blog measured from\b|\s+\bdrilling measured from\b|\s+\bdate\b|\s+\brun number\b)",
        ]),
        "RGE": extract_freeform_value(flat_text, [
            r"\brge[:\s]*([0-9A-Za-z\- ]+?)(?=\s+\belevation\b|\s+\bpermanent datum\b|\s+\blog measured from\b|\s+\bdrilling measured from\b|\s+\bdate\b|\s+\brun number\b)",
        ]),
        "PERMANENT_DATUM": extract_freeform_value(flat_text, [
            r"\bpermanent datum\b\s+(.+?)(?=\s+\bground level\b|\s+\belevation\b|\s+\blog measured from\b|\s+\bdrilling measured from\b|\s+\bdate\b|\s+\brun number\b)",
        ]),
        "LOG_MEASURED_FROM": extract_freeform_value(flat_text, [
            r"\blog measured from\b\s+(.+?)(?=\s+\bdrilling measured from\b|\s+\bdate\b|\s+\brun number\b|\s+\bdepth driller\b)",
        ]),
        "DRILLING_MEASURED_FROM": extract_freeform_value(flat_text, [
            r"\bdrilling measured from\b\s+(.+?)(?=\s+\bdate\b|\s+\brun number\b|\s+\bdepth driller\b|\s+\bdepth logged interval\b)",
        ]),
        "DATE": extract_freeform_value(flat_text, [
            r"\bdate\b[:\s]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})",
        ]),
        "RUN_NO": extract_freeform_value(flat_text, [
            r"\brun number\b\s+(.+?)(?=\s+\bdepth driller\b|\s+\bdepth logged interval\b|\s+\btop log interval\b|\s+\bbottom logged interval\b|\s+\bcasing driller\b)",
        ]),
        "DEPTH_DRILLER": extract_freeform_value(flat_text, [
            r"\bdepth driller\b\s+([0-9]+(?:\.[0-9]+)?)",
        ]),
        "DEPTH_LOGGER": extract_freeform_value(flat_text, [
            r"\bdepth logger\b\s+([0-9]+(?:\.[0-9]+)?)",
            r"\bdepth logged interval\b\s+([0-9]+(?:\.[0-9]+)?)",
        ]),
        "BOTTOM_LOGGED_INTERVAL": extract_freeform_value(flat_text, [
            r"\bbottom logged interval\b\s+([0-9]+(?:\.[0-9]+)?)",
        ]),
        "TOP_LOGGED_INTERVAL": extract_freeform_value(flat_text, [
            r"\btop log(?:ged)? interval\b\s+([0-9]+(?:\.[0-9]+)?)",
        ]),
        "TYPE_FLUID_IN_HOLE": extract_freeform_value(flat_text, [
            r"\btype fluid in hole\b\s+(.+?)(?=\s+\bsalinity\b|\s+\bdensity\b|\s+\blevel\b|\s+\bmax rec\b|\s+\boperating rig time\b|\s+\bequipment\b|\s+\brecorded by\b|\s+\bwitnessed by\b)",
        ]),
        "SALINITY_PPM_CL": extract_freeform_value(flat_text, [
            r"\bsalinity ppm cl\b\s+([0-9]+(?:\.[0-9]+)?)",
        ]),
        "DENSITY": extract_freeform_value(flat_text, [
            r"\bdensity\b\s+([0-9]+(?:\.[0-9]+)?)",
        ]),
        "LEVEL": extract_freeform_value(flat_text, [
            r"\blevel\b\s+([0-9]+(?:\.[0-9]+)?)",
        ]),
        "MAX_REC_TEMP_DEG_F": extract_freeform_value(flat_text, [
            r"\bmax rec(?:orded)? temp(?:\.|erature)?(?:\s*f|\s*degf)?\b\s+([0-9]+(?:\.[0-9]+)?)",
            r"\bmax rec\.?\s*temp\.?\s*f\b\s+([0-9]+(?:\.[0-9]+)?)",
        ]),
        "OPERATING_RIG_TIME": extract_freeform_value(flat_text, [
            r"\boperating rig time\b\s+(.+?)(?=\s+\bequipment\b|\s+\brecorded by\b|\s+\bwitnessed by\b|\s+\bsource of\b|\s+\bcomments\b)",
        ]),
        "EQUIP_NO_LOCATION": extract_freeform_value(flat_text, [
            r"\bequipment number(?:/| )?location\b\s+(.+?)(?=\s+\brecorded by\b|\s+\bwitnessed by\b|\s+\bsource of\b|\s+\bcomments\b)",
        ]),
        "RECORDED_BY": extract_freeform_value(flat_text, [
            r"\brecorded by\b\s+(.+?)(?=\s+\bwitnessed by\b|\s+\bsource of\b|\s+\bcomments\b|\s+\bdate received\b)",
        ]),
        "WITNESSED_BY": extract_freeform_value(flat_text, [
            r"\bwitnessed by\b\s+(.+?)(?=\s+\bsource of\b|\s+\bcomments\b|\s+\bdate received\b)",
        ]),
        "DATE_RECEIVED": extract_freeform_value(flat_text, [
            r"\bdate received\b\s+([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})",
        ]),
        "COMMISSION_NAME": extract_freeform_value(flat_text, [
            r"\bcommission name\b\s+(.+?)(?=\s+\bcomments\b|\s+\bdate received\b|\s+\breceived by\b)",
        ]),
        "ADDITIONAL_STAMPS": extract_freeform_value(flat_text, [
            r"\badditional stamps\b\s+(.+)$",
        ]),
    }

    well_items = []
    for raw_line in ocr_text.splitlines():
        line = raw_line.strip().strip("-")
        if not line or ":" not in line or line.startswith("|"):
            continue
        key, value = [part.strip() for part in line.split(":", 1)]
        key = re.sub(r"[^A-Za-z0-9_]+", "_", key).upper().strip("_")
        if key not in key_map:
            continue
        if value.upper() in ("[VALUE]", "[VALUE OR BLANK]", "BLANK", "[BLANK]"):
            continue
        mnemonic, unit, description = key_map[key]
        well_items.append({
            "Mnemonic": mnemonic,
            "Value": value,
            "Unit": unit,
            "Description": description,
            })

    if not well_items:
        for key, value in freeform_fields.items():
            if not value or value.upper() in ("BLANK", "[BLANK]", "N/A", "NA"):
                continue
            if key not in key_map:
                continue
            mnemonic, unit, description = key_map[key]
            well_items.append({
                "Mnemonic": mnemonic,
                "Value": value,
                "Unit": unit,
                "Description": description,
            })

    if not well_items:
        return {}

    return {
        "las.version": [
            {"Mnemonic": "VERS", "Value": "2.0", "Unit": "", "Description": "LAS version"},
            {"Mnemonic": "WRAP", "Value": "NO", "Unit": "", "Description": "One line per depth step"},
        ],
        "las.well": well_items,
    }

def extract_depth_ticks_ocr(graph_image):
    """
    Use local EasyOCR to extract depth tick numbers from the graph image.
    Scans the graph region for numeric text (depth axis labels) and returns
    their values along with pixel positions.

    Args:
        graph_image: numpy array (RGB) of the graph portion of the image

    Returns:
        list of dicts: [{"text": str, "value": float, "bbox": [[x1,y1],[x2,y2],[x3,y3],[x4,y4]], "center": [cx, cy]}]
    """
    global OCR_READER
    try:
        reader = get_ocr_reader()
        results = reader.readtext(graph_image)
        depth_ticks = []
        for (bbox, text, confidence) in results:
            cleaned = text.strip().replace(',', '').replace(' ', '')
            # Match numeric patterns: integers, decimals, negative numbers
            if re.match(r'^-?\d+\.?\d*$', cleaned):
                # Compute center of bounding box
                xs = [pt[0] for pt in bbox]
                ys = [pt[1] for pt in bbox]
                cx = int(sum(xs) / len(xs))
                cy = int(sum(ys) / len(ys))
                depth_ticks.append({
                    "text": cleaned,
                    "value": float(cleaned),
                    "confidence": round(float(confidence), 3),
                    "bbox": [[int(pt[0]), int(pt[1])] for pt in bbox],
                    "center": [cx, cy]
                })
        # Sort by vertical position (top to bottom)
        depth_ticks.sort(key=lambda d: d["center"][1])
        print(f"[INFO] OCR extracted {len(depth_ticks)} depth tick values from graph image")
        for tick in depth_ticks:
            print(f"  Depth: {tick['value']}  | Confidence: {tick['confidence']}  | Center pixel: {tick['center']}")
        return depth_ticks
    except Exception as e:
        print(f"[WARN] OCR depth extraction failed: {e}")
        return []


def _parse_numeric_header_value(value):
    match = re.search(r"-?\d+(?:\.\d+)?", str(value or ""))
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def _find_las_header_value(las_header, mnemonics):
    wanted = {str(item).upper() for item in mnemonics}
    for section_items in (las_header or {}).values():
        if not isinstance(section_items, list):
            continue
        for item in section_items:
            mnemonic = re.sub(
                r"[^A-Z0-9]",
                "",
                str(item.get("Mnemonic") or item.get("mnemonic") or "").upper(),
            )
            if mnemonic in wanted:
                return item.get("Value", item.get("value"))
    return None


def infer_depth_range_from_vision(graph_vision):
    if not graph_vision or graph_vision.get("status") != "success":
        return None
    y_axis = graph_vision.get("y_axis", {})
    if not y_axis:
        return None
    top = _parse_numeric_header_value(y_axis.get("min_value"))
    bottom = _parse_numeric_header_value(y_axis.get("max_value"))
    if top is None or bottom is None or top == bottom:
        return None
    return {
        "top": min(top, bottom),
        "bottom": max(top, bottom),
        "unit": y_axis.get("unit", "FT") or "FT",
        "source": "graph_vision",
        "confidence": "high",
        "tick_count": len(y_axis.get("tick_values", [])),
    }


def infer_depth_range_from_header(las_header):
    top = _parse_numeric_header_value(
        _find_las_header_value(las_header, ["TLI", "STRT", "TOP", "TOPLOGGEDINTERVAL"])
    )
    bottom = _parse_numeric_header_value(
        _find_las_header_value(las_header, ["BLI", "STOP", "BOTTOM", "BOTTOMLOGGEDINTERVAL"])
    )
    if top is None or bottom is None or top == bottom:
        return None
    return {
        "top": float(top),
        "bottom": float(bottom),
        "unit": "FT",
        "source": "header",
        "confidence": "high",
        "tick_count": 2,
    }


def infer_depth_range_from_ticks(depth_ticks):
    ticks = []
    for tick in depth_ticks or []:
        value = _parse_numeric_header_value(tick.get("value", tick.get("text")))
        center = tick.get("center") or []
        if value is None or len(center) < 2:
            continue
        try:
            x = float(center[0])
            y = float(center[1])
        except (TypeError, ValueError):
            continue
        ticks.append({"value": value, "x": x, "y": y})

    if len(ticks) < 2:
        return None

    columns = []
    for tick in ticks:
        column = next((candidate for candidate in columns if abs(candidate["x"] - tick["x"]) <= 60), None)
        if column is None:
            column = {"x": tick["x"], "ticks": []}
            columns.append(column)
        column["ticks"].append(tick)
        column["x"] = sum(item["x"] for item in column["ticks"]) / len(column["ticks"])

    def longest_sequence(column_ticks, direction):
        sorted_ticks = sorted(column_ticks, key=lambda item: item["y"])
        chains = [[tick] for tick in sorted_ticks]
        for idx, tick in enumerate(sorted_ticks):
            for prev in range(idx):
                if direction * (tick["value"] - sorted_ticks[prev]["value"]) > 0 and len(chains[prev]) + 1 > len(chains[idx]):
                    chains[idx] = [*chains[prev], tick]
        return max(chains, key=len)

    candidates = []
    for column in columns:
        for direction in (1, -1):
            sequence = longest_sequence(column["ticks"], direction)
            if len(sequence) >= 2:
                candidates.append(sequence)

    if not candidates:
        return None

    best = sorted(
        candidates,
        key=lambda sequence: (len(sequence), sequence[-1]["y"] - sequence[0]["y"]),
        reverse=True,
    )[0]
    top = float(best[0]["value"])
    bottom = float(best[-1]["value"])
    if top == bottom:
        return None
    return {
        "top": top,
        "bottom": bottom,
        "unit": "FT",
        "source": "depth_ticks",
        "confidence": "medium" if len(best) < 4 else "high",
        "tick_count": len(best),
    }


def infer_depth_range(las_header, depth_ticks, graph_vision=None):
    return (
        infer_depth_range_from_vision(graph_vision)
        or infer_depth_range_from_header(las_header)
        or infer_depth_range_from_ticks(depth_ticks)
    )


def match_graph_curves_to_values(graph_image, graph_points, graph_bounds):
    """
    Enhanced curve-to-value matching for multi-curve graphs.
    Automatically detects axis values and assigns them to curves.
    
    Args:
        graph_image: numpy array (RGB) of the graph
        graph_points: dict of curve point lists from extraction
        graph_bounds: dict with {"left", "right", "top", "bottom"} pixel coords
        
    Returns:
        dict with matched curves and their value ranges
    """
    try:
        h, w = graph_image.shape[:2]
        matcher = CurveValueMatcher((h, w))
        
        # Extract all OCR results
        reader = get_ocr_reader()
        ocr_results = reader.readtext(graph_image)
        
        # Separate X and Y axis labels
        x_labels = matcher.extract_x_axis_labels(graph_image, ocr_results)
        y_labels = matcher.extract_y_axis_labels(graph_image, ocr_results)
        
        print(f"[INFO] X-axis labels detected: {len(x_labels)}")
        for label in x_labels:
            print(f"  Value: {label.value} | Confidence: {label.confidence} | Pos: {label.position}")
        
        print(f"[INFO] Y-axis labels detected: {len(y_labels)}")
        for label in y_labels:
            print(f"  Value: {label.value} | Confidence: {label.confidence} | Pos: {label.position}")
        
        # Create CurveInfo objects from detected points
        curves = []
        for idx, (curve_name, points) in enumerate(graph_points.items()):
            if points:
                curve = create_curve_info(idx, points)
                curves.append(curve)
        
        # Match curves to values
        matched_curves = matcher.match_curves_to_values(
            curves, x_labels, y_labels, graph_bounds
        )
        
        # Detect curve colors for additional identification
        matched_curves = matcher.detect_curve_colors(graph_image, matched_curves)
        
        # Generate summary
        summary = matcher.generate_summary(matched_curves)
        print(summary)
        
        # Convert to JSON-serializable format
        matched_output = {
            "curves": [
                {
                    "id": c.curve_id,
                    "label": c.label or f"Curve {c.curve_id + 1}",
                    "points_count": len(c.points),
                    "bounds": c.bounds,
                    "x_range": list(c.x_range) if c.x_range else None,
                    "y_range": list(c.y_range) if c.y_range else None,
                    "color": list(c.color) if c.color else None
                }
                for c in matched_curves
            ],
            "x_labels": [
                {
                    "text": l.text,
                    "value": l.value,
                    "position": list(l.position),
                    "confidence": l.confidence
                }
                for l in x_labels
            ],
            "y_labels": [
                {
                    "text": l.text,
                    "value": l.value,
                    "position": list(l.position),
                    "confidence": l.confidence
                }
                for l in y_labels
            ],
            "summary": summary
        }
        
        return matched_output
        
    except Exception as e:
        print(f"[WARN] Curve-value matching failed: {e}")
        import traceback
        traceback.print_exc()
        return {"curves": [], "x_labels": [], "y_labels": [], "error": str(e)}


def resolve_local_path(path_value):
    if not path_value:
        return None
    path = Path(path_value)
    if path.is_absolute():
        return path
    return Path(__file__).resolve().parent / path


def is_git_lfs_pointer_file(path):
    try:
        if not path or not path.exists() or path.stat().st_size > 512:
            return False
        return path.read_text(errors="ignore").startswith("version https://git-lfs.github.com/spec/v1")
    except Exception:
        return False


def encode_png_base64(image_rgb):
    _, buffer = cv2.imencode('.png', cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR))
    return base64.b64encode(buffer).decode("ascii")


def decode_upload_image(data, ext):
    if ext in ("tif", "tiff"):
        try:
            with Image.open(io.BytesIO(data)) as image:
                return np.array(image.convert("RGB"))
        except Exception as e:
            print(f"[WARN] Pillow TIFF decode failed, trying OpenCV: {e}")

    np_arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_UNCHANGED)
    if img is None:
        return None
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB) if img.ndim == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)


def detect_layout_with_density(image_rgb):
    height, width = image_rgb.shape[:2]
    gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)

    # Report scans are mostly white. Row foreground density exposes the long
    # continuous graph body even when the detector misses the header.
    foreground = (gray < 245).astype(np.uint8)
    row_density = foreground.mean(axis=1)
    window = max(21, min(81, height // 200))
    if window % 2 == 0:
        window += 1
    smooth = np.convolve(row_density, np.ones(window) / window, mode="same")

    threshold = 0.025
    segments = []
    in_segment = False
    start = 0
    for y, value in enumerate(smooth):
        if value > threshold and not in_segment:
            start = y
            in_segment = True
        if (value <= threshold or y == height - 1) and in_segment:
            end = y
            in_segment = False
            if end - start > max(20, height * 0.01):
                segments.append((start, end))

    lower_segments = [seg for seg in segments if seg[0] > height * 0.18]
    if lower_segments:
        graph_y1, graph_y2 = max(lower_segments, key=lambda seg: seg[1] - seg[0])
        graph_y2 = min(height, max(graph_y2, height - int(height * 0.03)))
    else:
        graph_y1 = int(height * 0.28)
        graph_y2 = height

    graph_y1 = max(1, min(graph_y1, height - 1))
    graph_label_margin = int(np.clip(height * 0.04, 220, 420))
    header_y2 = max(1, min(graph_y1 - graph_label_margin, height - 1))
    return {
        "method": "density_fallback",
        "confidence": 0.0,
        "header_box": {"x1": 0, "y1": 0, "x2": width, "y2": header_y2},
        "graph_box": {"x1": 0, "y1": header_y2, "x2": width, "y2": graph_y2},
        "detections": [],
    }


def detect_layout_regions(image_rgb, model_path):
    height, width = image_rgb.shape[:2]
    fallback = detect_layout_with_density(image_rgb)
    resolved_model_path = resolve_local_path(model_path)

    if not resolved_model_path or not resolved_model_path.exists():
        print(f"[WARN] Header/graph layout model missing, using fallback: {resolved_model_path}")
        return fallback
    if is_git_lfs_pointer_file(resolved_model_path):
        print(f"[WARN] Header/graph layout model is a Git LFS pointer, using fallback: {resolved_model_path}")
        return fallback

    try:
        model = YOLO(str(resolved_model_path))
        results = model(image_rgb, conf=0.25, iou=0.45, max_det=50, verbose=False)
    except Exception as e:
        print(f"[WARN] Header/graph layout model failed, using fallback: {e}")
        return fallback

    detections = []
    header_boxes = []
    graph_boxes = []
    for result in results:
        boxes = result.boxes
        if boxes is None:
            continue
        xyxy = boxes.xyxy.cpu().numpy() if boxes.xyxy is not None else np.empty((0, 4))
        confs = boxes.conf.cpu().numpy() if boxes.conf is not None else np.empty((0,))
        classes = boxes.cls.cpu().numpy().astype(int) if boxes.cls is not None else np.empty((0,), dtype=int)
        for i, box in enumerate(xyxy):
            x1, y1, x2, y2 = [float(v) for v in box]
            cls_id = int(classes[i]) if i < len(classes) else -1
            cls_name = str(model.names.get(cls_id, f"cls_{cls_id}")).lower()
            conf = float(confs[i]) if i < len(confs) else 0.0
            detection = {
                "x1": max(0, x1),
                "y1": max(0, y1),
                "x2": min(width, x2),
                "y2": min(height, y2),
                "conf": conf,
                "class_id": cls_id,
                "class_name": cls_name,
            }
            detections.append(detection)
            if "header" in cls_name:
                header_boxes.append(detection)
            elif "graph" in cls_name or "body" in cls_name or "track" in cls_name:
                graph_boxes.append(detection)

    layout = dict(fallback)
    layout["detections"] = detections
    if graph_boxes:
        graph_y1 = int(min(box["y1"] for box in graph_boxes))
        graph_y2 = int(max(box["y2"] for box in graph_boxes))
        graph_label_margin = int(np.clip(height * 0.04, 220, 420))
        header_y2 = max(1, min(graph_y1 - graph_label_margin, height - 1))
        layout.update({
            "method": "yolo_graph",
            "confidence": max(box["conf"] for box in graph_boxes),
            "header_box": {"x1": 0, "y1": 0, "x2": width, "y2": header_y2},
            "graph_box": {"x1": 0, "y1": header_y2, "x2": width, "y2": min(height, graph_y2)},
        })
    elif header_boxes:
        header_y2 = int(max(box["y2"] for box in header_boxes))
        layout.update({
            "method": "yolo_header",
            "confidence": max(box["conf"] for box in header_boxes),
            "header_box": {"x1": 0, "y1": 0, "x2": width, "y2": max(1, header_y2)},
            "graph_box": {"x1": 0, "y1": max(1, header_y2), "x2": width, "y2": height},
        })

    return layout


def crop_box(image_rgb, box):
    h, w = image_rgb.shape[:2]
    x1 = max(0, min(w - 1, int(round(box["x1"]))))
    y1 = max(0, min(h - 1, int(round(box["y1"]))))
    x2 = max(x1 + 1, min(w, int(round(box["x2"]))))
    y2 = max(y1 + 1, min(h, int(round(box["y2"]))))
    return image_rgb[y1:y2, x1:x2]


def extract_header_info_and_graph_part(
    img_cv2,
    model_path,
    include_header_ocr=False,
    include_depth_ocr=False,
    manual_graph_box=None,
):
    layout = detect_layout_regions(img_cv2, model_path)
    if manual_graph_box:
        h, w = img_cv2.shape[:2]
        graph_box = {
            "x1": float(manual_graph_box.get("x1", 0)),
            "y1": float(manual_graph_box.get("y1", 0)),
            "x2": float(manual_graph_box.get("x2", w)),
            "y2": float(manual_graph_box.get("y2", h)),
        }
        graph_box = {
            "x1": max(0, min(w - 1, graph_box["x1"])),
            "y1": max(0, min(h - 1, graph_box["y1"])),
            "x2": max(1, min(w, graph_box["x2"])),
            "y2": max(1, min(h, graph_box["y2"])),
        }
        layout.update({
            "method": "manual_graph_box",
            "confidence": 1.0,
            "header_box": {"x1": 0, "y1": 0, "x2": w, "y2": max(1, graph_box["y1"])},
            "graph_box": graph_box,
        })
    header_image = crop_box(img_cv2, layout["header_box"])
    body_image = crop_box(img_cv2, layout["graph_box"])
    las_header = {}
    header_ocr_text = ""
    header_ocr_metadata = {
        "engine": "disabled",
        "model": HEADER_OCR_MODEL,
        "strategy": None,
        "status": "disabled",
    }
    if include_header_ocr:
        try:
            las_header, header_ocr_text, header_ocr_metadata = extract_las_header(image=header_image)
        except Exception as e:
            print(f"[WARN] Header extraction failed, continuing with empty headers: {e}")
            las_header = {}
            header_ocr_text = ""
            header_ocr_metadata = {
                "engine": "error",
                "model": HEADER_OCR_MODEL,
                "strategy": None,
                "status": "failed",
                "error": str(e),
            }

    depth_ticks = extract_depth_ticks_ocr(body_image) if include_depth_ocr else []
    return las_header, header_ocr_text, header_ocr_metadata, body_image, depth_ticks, layout

def clamp_float(value, low=0.0, high=1.0):
    return max(low, min(high, float(value)))


def pixel_x_to_physical(pixel_x, left_bound, right_bound, min_value, max_value):
    """Convert a pixel x-coordinate into the user-entered physical curve value."""
    left_bound = float(left_bound)
    right_bound = float(right_bound)
    min_value = float(min_value)
    max_value = float(max_value)
    if right_bound == left_bound:
        return min_value
    ratio = clamp_float((float(pixel_x) - left_bound) / (right_bound - left_bound))
    return min_value + ratio * (max_value - min_value)


def pixel_y_to_depth(pixel_y, top_pixel, bottom_pixel, top_depth, bottom_depth):
    """Convert a pixel y-coordinate into real well depth using the export bounds."""
    top_pixel = float(top_pixel)
    bottom_pixel = float(bottom_pixel)
    top_depth = float(top_depth)
    bottom_depth = float(bottom_depth)
    if bottom_pixel == top_pixel:
        return top_depth
    ratio = clamp_float((float(pixel_y) - top_pixel) / (bottom_pixel - top_pixel))
    return top_depth + ratio * (bottom_depth - top_depth)


def pixel_points_to_physical(points, pixel_bounds, x_range, y_range):
    """Convert tracked pixel points to [physical_value, real_depth] pairs."""
    if not pixel_bounds or len(pixel_bounds) != 4:
        raise ValueError("pixel_bounds must be [left, top, right, bottom]")
    if not x_range or len(x_range) != 2:
        raise ValueError("x_range must be [min_value, max_value]")
    if not y_range or len(y_range) != 2:
        raise ValueError("y_range must be [top_depth, bottom_depth]")

    left, top, right, bottom = [float(value) for value in pixel_bounds]
    min_value, max_value = [float(value) for value in x_range]
    top_depth, bottom_depth = [float(value) for value in y_range]

    converted = []
    for pixel_x, pixel_y in points:
        converted.append([
            pixel_x_to_physical(pixel_x, left, right, min_value, max_value),
            pixel_y_to_depth(pixel_y, top, bottom, top_depth, bottom_depth),
        ])
    return converted


def rescale_pixel_data(points, current_bounds, target_bounds, debug=True):
    """Backward-compatible wrapper for older callers."""
    return pixel_points_to_physical(
        points,
        pixel_bounds=current_bounds,
        x_range=(target_bounds[0], target_bounds[2]),
        y_range=(target_bounds[1], target_bounds[3]),
    )

def get_pixel_bounds(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return (min(xs), min(ys), max(xs), max(ys))  # (x_min, y_min, x_max, y_max)


PROTECTED_LAS_HEADER_FIELDS = {"STRT", "STOP", "STEP", "NULL", "VERS", "WRAP"}


def sanitize_las_field(value, max_len=60):
    """Remove OCR artifacts that commonly break LAS headers."""
    value = re.sub(r"[\x00-\x1f\x7f]", " ", str(value or ""))
    value = re.sub(r"\s+", " ", value).strip()
    return value[:max_len]

def populate_las_from_json(las, json_data):
    """Populate LAS file headers from JSON data"""
    
    # 1. Populate version section
    if 'las.version' in json_data:
        for item in json_data['las.version']:
            mnemonic = item['Mnemonic']
            value = item['Value']
            description = item.get('Description', '')

            # ✅ Patch missing values for mandatory version fields
            if mnemonic == "VERS":
                value = 2.0
            elif mnemonic == "WRAP" and value is None:
                value = "NO"

            las.version[mnemonic] = lasio.HeaderItem(mnemonic, value=value, descr=description)

    
    # 2. Populate well section
    if 'las.well' in json_data:
        for item in json_data['las.well']:
            mnemonic = normalize_header_text_key(item['Mnemonic'])
            if mnemonic in PROTECTED_LAS_HEADER_FIELDS:
                continue
            value = sanitize_las_field(item.get('Value', ''))
            unit = sanitize_las_field(item.get('Unit', ''), max_len=16)
            description = sanitize_las_field(item.get('Description', ''))
            
            # Handle multiple entries with same mnemonic (like DATE, TDD, etc.)
            if mnemonic in las.well:
                existing_value = clean_las_header_value(getattr(las.well[mnemonic], "value", ""))
                if not existing_value:
                    las.well[mnemonic] = lasio.HeaderItem(mnemonic, unit=unit, value=value, descr=description)
                    continue

                # If mnemonic already exists, create a unique one by appending number
                counter = 1
                original_mnemonic = mnemonic
                while mnemonic in las.well:
                    mnemonic = f"{original_mnemonic}_{counter}"
                    counter += 1
            
            las.well[mnemonic] = lasio.HeaderItem(mnemonic, unit=unit, value=value, descr=description)
    return las

def create_las_with_dict(json_data, curves_dict, curve_metadata=None, depth_unit="FT", depth_step=None):
    """Create LAS file from curves with interpolation to common depth."""
    curve_metadata = curve_metadata or {}
    depth_unit = depth_unit or "FT"
    
    all_depths = np.concatenate([np.asarray(depths, dtype=float) for depths, _ in curves_dict.values()])
    start_depth = float(np.nanmin(all_depths))
    stop_depth = float(np.nanmax(all_depths))
    try:
        depth_step = abs(float(depth_step)) if depth_step is not None else None
    except Exception:
        depth_step = None
    if not depth_step:
        unique_depths = np.unique(np.round(all_depths, 4))
        if len(unique_depths) > 1:
            diffs = np.diff(unique_depths)
            depth_step = float(np.nanmedian(diffs[diffs > 0])) if np.any(diffs > 0) else 0.5
        else:
            depth_step = 0.5
    ref_depth_array = np.arange(start_depth, stop_depth + depth_step * 0.5, depth_step, dtype=float)

    las = lasio.LASFile()
    las = populate_las_from_json(las, json_data)

    # Add well header
    las.well["STRT"] = lasio.HeaderItem("STRT", unit=depth_unit, value=float(ref_depth_array[0]), descr="Start depth")
    las.well["STOP"] = lasio.HeaderItem("STOP", unit=depth_unit, value=float(ref_depth_array[-1]), descr="Stop depth")
    las.well["STEP"] = lasio.HeaderItem("STEP", unit=depth_unit, value=float(depth_step), descr="Step size")
    las.well["NULL"] = lasio.HeaderItem("NULL", value=-999.25, descr="Null value")

    # Add depth curve
    las.curves.append(lasio.CurveItem("DEPT", depth_unit, "Depth"))
    data_cols = [ref_depth_array]

    # Interpolate each curve to the reference depth
    for idx, (line_name, (depths, values)) in enumerate(curves_dict.items(), start=1):
        try:
            depth_arr = np.asarray(depths, dtype=float)
            value_arr = np.asarray(values, dtype=float)
            valid = np.isfinite(depth_arr) & np.isfinite(value_arr)
            depth_arr = depth_arr[valid]
            value_arr = value_arr[valid]
            if depth_arr.size == 0:
                raise ValueError("curve has no finite samples")
            order = np.argsort(depth_arr)
            depth_arr = depth_arr[order]
            value_arr = value_arr[order]
            unique_depths, inverse = np.unique(np.round(depth_arr, 6), return_inverse=True)
            mean_values = np.zeros_like(unique_depths, dtype=float)
            for unique_idx in range(len(unique_depths)):
                mean_values[unique_idx] = float(np.nanmedian(value_arr[inverse == unique_idx]))
            if unique_depths.size == 1:
                interp_values = np.full_like(ref_depth_array, mean_values[0], dtype=float)
            else:
                f_interp = interp1d(unique_depths, mean_values, bounds_error=False, fill_value=-999.25)
                interp_values = f_interp(ref_depth_array)
        except Exception as e:
            print(f"⚠️ Interpolation failed for {line_name}: {e}")
            interp_values = np.full_like(ref_depth_array, -999.25)

        meta = curve_metadata.get(line_name, {})
        mnemonic = re.sub(r"[^A-Za-z0-9_]", "", str(meta.get("mnemonic") or line_name.upper()))[:8] or f"GPH{idx}"
        unit = str(meta.get("unit") or "NONE")
        descr = str(meta.get("description") or f"{line_name} curve")
        las.curves.append(lasio.CurveItem(mnemonic=mnemonic, unit=unit, descr=descr))
        data_cols.append(interp_values)

    # Stack data and assign
    las.set_data(np.column_stack(data_cols))
    return las


def _las_comment_lines(title, text):
    border = "#" + "=" * 78
    lines = [
        border,
        f"# {title}",
        border,
    ]
    clean_text = str(text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not clean_text:
        lines.append("# NO HEADER OCR TEXT AVAILABLE")
    else:
        for raw_line in clean_text.split("\n"):
            line = raw_line.strip()
            lines.append(f"# {line}" if line else "#")
    lines.extend([
        border,
        "# END HEADER OCR EXTRACTION TEXT",
        border,
    ])
    return lines


def format_las_header_json_as_text(json_data):
    lines = []
    for section_key, section_title in (
        ("las.version", "LAS VERSION"),
        ("las.well", "LAS WELL HEADER"),
    ):
        items = (json_data or {}).get(section_key, [])
        if not items:
            continue
        lines.append(section_title)
        for item in items:
            mnemonic = item.get("Mnemonic", "")
            value = item.get("Value", "BLANK")
            unit = item.get("Unit") or ""
            description = item.get("Description") or ""
            unit_text = f" {unit}" if unit else ""
            desc_text = f" : {description}" if description else ""
            lines.append(f"{mnemonic}: {value}{unit_text}{desc_text}")
    return "\n".join(lines)


def parse_header_key_values(header_text):
    fields = {}
    for raw_line in str(header_text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        key = re.sub(r"[^A-Za-z0-9_]+", "_", key).upper().strip("_")
        value = value.strip()
        if key and value:
            fields[key] = value
    return fields


def split_header_titles(value):
    titles = []
    for part in re.split(r"[,;/&]+|\s{2,}", str(value or "")):
        clean = part.strip(" -")
        if clean and clean.upper() not in {"BLANK", "N/A", "NA"}:
            titles.append(clean.upper())
    return titles


def format_header_text_for_las(header_text):
    fields = parse_header_key_values(header_text)
    if not fields:
        return str(header_text or "").strip()

    lines = []
    titles = []
    for key in ("LOG_TYPE", "TYPE_LOG", "TYPE_LOG_RUN"):
        titles.extend(split_header_titles(fields.get(key)))
    seen_titles = set()
    for title in titles:
        if title not in seen_titles:
            lines.append(title)
            lines.append("")
            seen_titles.add(title)

    def add_field(label, key):
        value = fields.get(key)
        if value and value.upper() != "BLANK":
            lines.append(f"{label}: {value}")

    add_field("Company", "COMPANY")
    add_field("Location", "LOCATION")
    if lines and lines[-1] != "":
        lines.append("")

    add_field("Company", "COMPANY")
    add_field("Well", "WELL")
    add_field("Field", "FIELD")
    add_field("County", "COUNTY")
    add_field("State", "STATE")
    if lines and lines[-1] != "":
        lines.append("")

    location_lines = []
    api = fields.get("API")
    if api and api.upper() != "BLANK":
        location_lines.append(f"- API #: {api}")
    location = fields.get("LOCATION")
    if location and location.upper() != "BLANK":
        location_lines.append(f"- {location}")
    section_bits = []
    for label, key in (("SEC", "SEC"), ("TWP", "TWP"), ("RGE", "RGE")):
        value = fields.get(key)
        if value and value.upper() != "BLANK":
            section_bits.append(f"{label} {value}")
    if section_bits:
        location_lines.append(f"- {' '.join(section_bits)}")
    if location_lines:
        lines.append("Location:")
        lines.extend(location_lines)
        lines.append("")

    add_field("Permanent Datum", "PERMANENT_DATUM")
    add_field("Log Measured From", "LOG_MEASURED_FROM")
    add_field("Drilling Measured From", "DRILLING_MEASURED_FROM")

    extras = []
    used_keys = {
        "LOG_TYPE", "TYPE_LOG", "TYPE_LOG_RUN", "COMPANY", "LOCATION", "WELL",
        "FIELD", "COUNTY", "STATE", "API", "SEC", "TWP", "RGE",
        "PERMANENT_DATUM", "LOG_MEASURED_FROM", "DRILLING_MEASURED_FROM",
    }
    for key, value in fields.items():
        if key not in used_keys and value and value.upper() != "BLANK":
            label = key.replace("_", " ").title()
            extras.append(f"{label}: {value}")
    if extras:
        if lines and lines[-1] != "":
            lines.append("")
        lines.extend(extras)

    return "\n".join(line for line in lines).strip()


LAS_EXPORT_VERSION_TEMPLATE = [
    {"Mnemonic": "VERS", "Value": "2.0", "Unit": "", "Description": "CWLS log ASCII Standard -VERSION 2.0"},
    {"Mnemonic": "WRAP", "Value": "NO", "Unit": "", "Description": "One line per depth step"},
]

LAS_EXPORT_WELL_TEMPLATE = [
    ("COMP", "", "COMPANY"),
    ("WELL", "", "WELL"),
    ("FLD", "", "FIELD"),
    ("LOC", "", "LOCATION"),
    ("PROV", "", "PROVINCE"),
    ("CNTY", "", "COUNTY"),
    ("STAT", "", "STATE"),
    ("CTRY", "", "COUNTRY"),
    ("SRVC", "", "SERVICE COMPANY"),
    ("DATE", "", "DATE"),
    ("UWI", "", "UNIQUE WELL ID"),
    ("API", "", "API NUMBER"),
]

HEADER_TEXT_KEY_TO_MNEMONIC = {
    "COMP": "COMP",
    "COMPANY": "COMP",
    "WELL": "WELL",
    "FLD": "FLD",
    "FIELD": "FLD",
    "LOC": "LOC",
    "LOCATION": "LOC",
    "PROV": "PROV",
    "PROVINCE": "PROV",
    "CNTY": "CNTY",
    "COUNTY": "CNTY",
    "STAT": "STAT",
    "STATE": "STAT",
    "CTRY": "CTRY",
    "COUNTRY": "CTRY",
    "SRVC": "SRVC",
    "SERVICE_COMPANY": "SRVC",
    "LOG_TYPE": "SRVC",
    "TYPE_LOG": "SRVC",
    "DATE": "DATE",
    "UWI": "UWI",
    "UNIQUE_WELL_ID": "UWI",
    "UNIQUE_WELL": "UWI",
    "API": "API",
    "API_NUMBER": "API",
}

LAS_EMPTY_VALUES = {"", "BLANK", "[BLANK]", "[VALUE]", "[VALUE OR BLANK]", "N/A", "NA", "NONE", "NULL"}


def clean_las_header_value(value):
    value = re.sub(r"\s+", " ", str(value or "")).strip(" -:;|")
    return "" if value.upper() in LAS_EMPTY_VALUES else value


def normalize_header_text_key(key):
    return re.sub(r"[^A-Za-z0-9_]+", "_", str(key or "")).upper().strip("_")


def extract_values_from_header_json(header_json):
    values = {}
    for item in (header_json or {}).get("las.well", []):
        mnemonic = normalize_header_text_key(item.get("Mnemonic", ""))
        value = clean_las_header_value(item.get("Value", ""))
        if mnemonic and value:
            values[mnemonic] = value
    return values


def extract_values_from_colon_header_text(header_text):
    values = {}
    for raw_line in str(header_text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw_line.strip()
        if not line or ":" not in line or re.match(r"^[A-Za-z][A-Za-z0-9_]{0,7}\s*\.", line):
            continue
        key, value = line.split(":", 1)
        mnemonic = HEADER_TEXT_KEY_TO_MNEMONIC.get(normalize_header_text_key(key))
        value = clean_las_header_value(value)
        if mnemonic and value:
            values[mnemonic] = value
    return values


def extract_values_from_las_style_header_text(header_text):
    values = {}
    for raw_line in str(header_text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw_line.strip()
        match = re.match(r"^([A-Za-z][A-Za-z0-9_]{0,7})\s*\.\s*([A-Za-z0-9/%]*)?\s*(.*?)\s*:", line)
        if not match:
            continue
        mnemonic = HEADER_TEXT_KEY_TO_MNEMONIC.get(normalize_header_text_key(match.group(1)))
        value = clean_las_header_value(match.group(3))
        if mnemonic and value:
            values[mnemonic] = value
    return values


def build_las_export_header_from_ocr(header_ocr_text):
    """Build a LAS header from OCR only; missing fields stay blank."""
    header_text = str(header_ocr_text or "")
    parsed_header = parse_well_log_ocr_to_las_header(header_text) if header_text.strip() else {}
    values = {}
    values.update(extract_values_from_header_json(parsed_header))
    values.update(extract_values_from_colon_header_text(header_text))
    values.update(extract_values_from_las_style_header_text(header_text))

    well_items = []
    for mnemonic, unit, description in LAS_EXPORT_WELL_TEMPLATE:
        well_items.append({
            "Mnemonic": mnemonic,
            "Value": values.get(mnemonic, ""),
            "Unit": unit,
            "Description": description,
        })

    standard_mnemonics = {mnemonic for mnemonic, _, _ in LAS_EXPORT_WELL_TEMPLATE}
    for item in (parsed_header or {}).get("las.well", []):
        mnemonic = normalize_header_text_key(item.get("Mnemonic", ""))
        value = clean_las_header_value(item.get("Value", ""))
        if not mnemonic or mnemonic in standard_mnemonics or not value:
            continue
        well_items.append({
            "Mnemonic": mnemonic,
            "Value": value,
            "Unit": item.get("Unit", "") or "",
            "Description": item.get("Description", "") or mnemonic,
        })

    return {
        "las.version": [dict(item) for item in LAS_EXPORT_VERSION_TEMPLATE],
        "las.well": well_items,
    }


def merge_las_header_overrides(base_header, override_header):
    """Apply frontend/manual LAS well-header values over OCR-derived headers."""
    if not override_header:
        return base_header

    merged = {
        "las.version": list(base_header.get("las.version", [])),
        "las.well": [dict(item) for item in base_header.get("las.well", [])],
    }
    override_rows = (override_header or {}).get("las.well", [])
    overrides_by_mnemonic = {}
    for item in override_rows:
        mnemonic = normalize_header_text_key(item.get("Mnemonic", ""))
        if not mnemonic:
            continue
        overrides_by_mnemonic[mnemonic] = {
            "Mnemonic": mnemonic,
            "Value": sanitize_las_field(item.get("Value", "")),
            "Unit": sanitize_las_field(item.get("Unit", ""), max_len=16),
            "Description": sanitize_las_field(item.get("Description", "") or mnemonic),
        }

    if not overrides_by_mnemonic:
        return merged

    seen = set()
    for item in merged["las.well"]:
        mnemonic = normalize_header_text_key(item.get("Mnemonic", ""))
        if mnemonic in overrides_by_mnemonic:
            item.update(overrides_by_mnemonic[mnemonic])
            seen.add(mnemonic)

    for mnemonic, item in overrides_by_mnemonic.items():
        if mnemonic not in seen:
            merged["las.well"].append(item)

    return merged


def prepend_las_header_comments(las_text, header_ocr_text=""):
    comment_lines = []
    comment_lines.extend(_las_comment_lines("HEADER OCR EXTRACTION TEXT", header_ocr_text))
    comment_lines.append("#")
    return "\n".join(comment_lines) + "\n" + las_text

@app.post("/segment-and-graph")
async def segment_and_graph(
    file: UploadFile = File(...),
    threshold: float = Form(0.5),
    total_graphs: float = Form(2),
    patch_size: int = Form(96),
    batch_size: int = Form(32),
    include_header_ocr: bool = Form(False),
    include_depth_ocr: bool = Form(False),
    include_graph_vision: bool = Form(False),
    manual_graph_box: Optional[str] = Form(None),
):
    ext = file.filename.lower().rsplit(".", 1)[-1]
    if ext not in ("tif", "tiff", "png", "jpg", "jpeg"):
        raise HTTPException(400, "Unsupported image format")

    data = await file.read()
    img = decode_upload_image(data, ext)
    if img is None:
        raise HTTPException(400, "Failed to decode image")

    manual_box = None
    if manual_graph_box:
        try:
            manual_box = json.loads(manual_graph_box)
        except Exception:
            raise HTTPException(400, "manual_graph_box must be valid JSON")

    try:
        # GET HEADER AND GRAPH PART FROM WHOLE IMAGE
        las_file_header, header_ocr_text, header_ocr_metadata, image_without_b, depth_ticks, layout_info = extract_header_info_and_graph_part(
            img_cv2=img,
            model_path=YOLO_MODEL_PATH,
            include_header_ocr=include_header_ocr,
            include_depth_ocr=include_depth_ocr,
            manual_graph_box=manual_box,
        )
        header_image = crop_box(img, layout_info["header_box"])
    except Exception as e:
        print(f"[WARN] Header/layout extraction failed, using full-page fallback: {e}")
        layout_info = detect_layout_with_density(img)
        header_image = crop_box(img, layout_info["header_box"])
        image_without_b = crop_box(img, layout_info["graph_box"])
        las_file_header = {}
        header_ocr_text = ""
        header_ocr_metadata = {
            "engine": "error",
            "model": HEADER_OCR_MODEL,
            "strategy": None,
            "status": "failed",
            "error": str(e),
        }
        depth_ticks = []

    image_for_curve_pipeline = image_without_b
    tiff_preprocessing_info = None

    if ext in ("tif", "tiff"):
        try:
            body_bgr = cv2.cvtColor(image_without_b, cv2.COLOR_RGB2BGR)
            result = process_image_for_backend(body_bgr, model_path=TIFF_CHUNK_MODEL_PATH)
            if result and result["cleaned_page_bgr"] is not None:
                image_for_curve_pipeline = cv2.cvtColor(result["cleaned_page_bgr"], cv2.COLOR_BGR2RGB)
                tiff_preprocessing_info = {
                    "model_path": TIFF_CHUNK_MODEL_PATH,
                    "detection_count": len(result["detections"]),
                    "cleaned_detection_count": result["cleaned_detection_count"],
                }
                print("[INFO] Applied TIFF chunk preprocessing on body image before SVM+UNet flow")
        except Exception as e:
            print(f"[WARN] TIFF preprocessing failed, continuing with original image: {e}")

    original_height, original_width = image_for_curve_pipeline.shape[:2]
    try:
        _, graph_points, graph_boundaries = run_pipeline_and_graph(
            image_for_curve_pipeline,
            threshold,
            total_graphs,
            patch_size,
            batch_size,
        )
    except Exception as e:
        print(f"[WARN] Primary graph pipeline failed, using fallback thresholding: {e}")
        fallback_input = image_for_curve_pipeline
        if fallback_input.ndim == 3:
            fallback_gray = cv2.cvtColor(fallback_input, cv2.COLOR_RGB2GRAY)
        else:
            fallback_gray = fallback_input
        _, mask_full = cv2.threshold(fallback_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        mask_full = refine_mask(mask_full)
        if mask_full.shape[0] > mask_full.shape[1] * 1.5:
            graph_points, track_bounds = extract_vertical_graph_tracks(mask_full, int(total_graphs))
            graph_boundaries = _track_bounds_to_boundaries(track_bounds, mask_full.shape[0])
        else:
            _, unique_lines = draw_horizontal_separators(image=mask_full, n_lines=total_graphs)
            graph_points = extract_graphs(image=mask_full, unique_lines=unique_lines)
            graph_boundaries = _graph_points_to_boundaries(graph_points, mask_full.shape[1], mask_full.shape[0])
        print("[INFO] Fallback graph extraction completed")

    # ──────── ENHANCED: Curve-to-Value Matching ────────
    graph_bounds = {
        "left": 0,
        "right": original_width,
        "top": 0,
        "bottom": original_height
    }
    curve_value_match = match_graph_curves_to_values(
        image_without_b,
        graph_points,
        graph_bounds
    )

    graph_vision = None
    if include_graph_vision:
        try:
            graph_vision = analyze_graph_array_with_vision(image_without_b)
        except Exception as e:
            graph_vision = {
                "status": "failed",
                "error": str(e),
            }

    depth_range = infer_depth_range(las_file_header, depth_ticks, graph_vision)
    if depth_range:
        print(
            f"[INFO] Depth range detected from {depth_range['source']}: "
            f"{depth_range['top']} {depth_range['unit']} -> {depth_range['bottom']} {depth_range['unit']}"
        )
    
    image_b64 = encode_png_base64(image_without_b)
    header_b64 = encode_png_base64(header_image)

    return JSONResponse({
        "overlay_png_base64": image_b64,
        "header_png_base64": header_b64,
        "graph_png_base64": image_b64,
        "graph_points": graph_points,
        "graph_boundaries": graph_boundaries,
        "curve_value_match": curve_value_match,
        "graph_vision": graph_vision,
        "image_dimensions": {
            "width": original_width,
            "height": original_height
        },
        "layout": layout_info,
        "las_headers": las_file_header,
        "header_ocr_text": header_ocr_text,
        "header_ocr": header_ocr_metadata,
        "depth_ticks": depth_ticks,
        "depth_range": depth_range,
        "tiff_preprocessing": tiff_preprocessing_info
    })


def analyze_graph_array_with_vision(
    image_rgb: np.ndarray,
    provider: Optional[str] = None,
    model: Optional[str] = None,
):
    """Run graph vision analysis on an RGB image array."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        Image.fromarray(image_rgb).save(tmp_path)
        analyzer = GraphVisionAnalyzer(provider=provider, model=model)
        analysis = analyzer.analyze_graph_image(str(tmp_path))
        result = analyzer.format_analysis_for_api(analysis)
        result["status"] = "success"
        result["provider"] = analyzer.provider
        result["model"] = analyzer.model
        return result
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass


@app.post("/analyze-graph-image")
async def analyze_graph_image_endpoint(
    file: UploadFile = File(...),
    provider: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
):
    ext = file.filename.lower().rsplit(".", 1)[-1]
    if ext not in ("png", "jpg", "jpeg", "webp", "gif", "tif", "tiff"):
        raise HTTPException(400, "Unsupported image format")

    data = await file.read()
    img = decode_upload_image(data, ext)
    if img is None:
        raise HTTPException(400, "Failed to decode image")

    try:
        return JSONResponse(analyze_graph_array_with_vision(img, provider=provider, model=model))
    except Exception as e:
        raise HTTPException(500, f"Graph vision analysis failed: {str(e)}")


@app.post("/tiff-chunk-detect")
async def tiff_chunk_detect(file: UploadFile = File(...)):
    ext = file.filename.lower().rsplit(".", 1)[-1]
    if ext not in ("tif", "tiff"):
        raise HTTPException(400, "Only TIFF files are supported")

    if not TIFF_CHUNK_MODEL_PATH:
        raise HTTPException(500, "TIFF chunk model path is not configured")

    tiff_bytes = await file.read()
    if not tiff_bytes:
        raise HTTPException(400, "Uploaded TIFF is empty")

    try:
        page_results = process_tiff_bytes_for_backend(tiff_bytes=tiff_bytes, model_path=TIFF_CHUNK_MODEL_PATH)
    except Exception as e:
        raise HTTPException(500, f"TIFF chunk detection failed: {str(e)}")

    response_pages = []
    for page in page_results:
        _, ann_buf = cv2.imencode('.png', page["annotated_page_bgr"])
        _, clean_buf = cv2.imencode('.png', page["cleaned_page_bgr"])

        response_pages.append({
            "page_index": page["page_index"],
            "width": page["width"],
            "height": page["height"],
            "detection_count": len(page["detections"]),
            "cleaned_detection_count": page["cleaned_detection_count"],
            "detections": page["detections"],
            "annotated_page_png_base64": base64.b64encode(ann_buf).decode("ascii"),
            "cleaned_page_png_base64": base64.b64encode(clean_buf).decode("ascii"),
        })

    return JSONResponse({
        "filename": file.filename,
        "model_path": TIFF_CHUNK_MODEL_PATH,
        "page_count": len(response_pages),
        "pages": response_pages,
    })


@app.post("/create-las-file")
async def create_las_file(
    graph_points: dict = Body(...),
    z_value: float = Body(0.0)
):
    """
    Create a LAS file from graph points.
    
    Args:
        graph_points: Dictionary containing nodes and edges from the graph
        z_value: Z coordinate value for all points (default: 0.0)
    
    Returns:
        Base64 encoded LAS file
    """
    try:
        # Extract coordinates from graph points
        nodes = graph_points.get("nodes", [])
        if not nodes:
            raise HTTPException(400, "No nodes found in graph_points")
        
        # Convert nodes to numpy array
        coords = np.array([[node["x"], node["y"]] for node in nodes])
        
        # Create LAS file
        header = laspy.LasHeader(point_format=1, version="1.2")
        las = laspy.LasData(header)
        las.x = coords[:, 0]
        las.y = coords[:, 1]
        las.z = np.full(len(coords), z_value)
        
        # Convert to bytes
        buf = io.BytesIO()
        las.write(buf)
        las_bytes = buf.getvalue()
        las_b64 = base64.b64encode(las_bytes).decode("ascii")
        
        return JSONResponse({
            "las_base64": las_b64,
            "num_points": len(coords),
            "z_value": z_value
        })
        
    except Exception as e:
        raise HTTPException(500, f"Failed to create LAS file: {str(e)}")


@app.post("/generate-las-base64")
async def generate_las(request: Request):
    try:
        data_received = await request.json()
        graph_info = data_received["graph_info"]
        las_file_header = data_received["las_file_header"]
        curve_metadata = data_received.get("curve_metadata", {})
        depth_unit = data_received.get("depth_unit", "FT")
        depth_step = data_received.get("depth_step", 0.5)
        header_ocr_text = data_received.get("header_ocr_text", "")
        las_header_for_export = merge_las_header_overrides(
            build_las_export_header_from_ocr(header_ocr_text),
            las_file_header,
        )
        # Rescale pixel data
        rescaled_data = {}
        for graph_name, graph in graph_info.items():
            x_range = graph["x_range"]
            y_range = graph["y_range"]
            pixel_bounds = graph.get("pixel_bounds")
            if not pixel_bounds:
                print(
                    f"[WARN] {graph_name} is missing pixel_bounds; "
                    "falling back to point bounds, which may stretch the curve."
                )

            for line_name, line_points in graph["lines"].items():
                current_pixel_bounds = tuple(pixel_bounds) if pixel_bounds else get_pixel_bounds(line_points)
                rescaled_data[line_name] = pixel_points_to_physical(
                    line_points,
                    current_pixel_bounds,
                    x_range,
                    y_range,
                )

        # Generate curves
        curves_dict = {}
        for line_name, points in rescaled_data.items():
            sorted_points = sorted(points, key=lambda p: p[1])  # sort by depth (y)
            depths = [pt[1] for pt in sorted_points]
            values = [pt[0] for pt in sorted_points]
            curves_dict[line_name] = (depths, values)

        # Create LAS object
        las = create_las_with_dict(
            las_header_for_export,
            curves_dict,
            curve_metadata=curve_metadata,
            depth_unit=depth_unit,
            depth_step=depth_step,
        )

        # Write LAS to memory
        buffer = io.StringIO()
        las.write(buffer)
        las_text = buffer.getvalue()
        las_text = "\n".join(
            line for line in las_text.splitlines()
            if not re.match(r"^\s*DLM\s*\.", line, flags=re.IGNORECASE)
        ) + ("\n" if las_text.endswith("\n") else "")
        las_text = las_text.replace(" -999.25 ", " -999.2500 ")
        las_content = las_text.encode("utf-8")
        base64_las = base64.b64encode(las_content).decode("utf-8")

        return JSONResponse(content={"las_file_base64": base64_las})

    except Exception as e:
        print("Error in generate_las:", e)
        raise HTTPException(status_code=500, detail=str(e))


# Alternative endpoint that accepts raw coordinates
@app.post("/create-las-from-coords")
async def create_las_from_coords(
    coordinates: list = Body(...),
    z_value: float = Body(0.0)
):
    """
    Create a LAS file from raw coordinates.
    
    Args:
        coordinates: List of [x, y] coordinates
        z_value: Z coordinate value for all points (default: 0.0)
    
    Returns:
        Base64 encoded LAS file
    """
    try:
        if not coordinates:
            raise HTTPException(400, "No coordinates provided")
        
        # Convert to numpy array
        coords = np.array(coordinates)
        if coords.shape[1] != 2:
            raise HTTPException(400, "Coordinates must be in [x, y] format")
        
        # Create LAS file
        header = laspy.LasHeader(point_format=1, version="1.2")
        las = laspy.LasData(header)
        las.x = coords[:, 0]
        las.y = coords[:, 1]
        las.z = np.full(len(coords), z_value)
        
        # Convert to bytes
        buf = io.BytesIO()
        las.write(buf)
        las_bytes = buf.getvalue()
        las_b64 = base64.b64encode(las_bytes).decode("ascii")
        
        return JSONResponse({
            "las_base64": las_b64,
            "num_points": len(coords),
            "z_value": z_value
        })
        
    except Exception as e:
        raise HTTPException(500, f"Failed to create LAS file: {str(e)}")

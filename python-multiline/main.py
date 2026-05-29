import io
import base64
import pickle
import cv2
import numpy as np
import torch
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

load_dotenv(".env")


app = FastAPI()

# Prepare the request
YOLO_MODEL_PATH=os.getenv("YOLO_MODEL_PATH")
GEMNI_KEY=os.getenv("GEMNI_KEY")
OPENAI_KEY=os.getenv("OPENAI_KEY")
TIFF_CHUNK_MODEL_PATH = os.getenv("TIFF_CHUNK_MODEL_PATH") or os.path.join("models", "best.pt")

# Pipeline mode: True = SVM+UNet, False = direct thresholding on cleaned image
USE_UNET_PIPELINE = os.getenv("USE_UNET_PIPELINE", "true").lower() == "true"

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
    # Read the image in grayscale
    _, thresh = cv2.threshold(image, 127, 255, cv2.THRESH_BINARY)

    # Find contours
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Print area of each contour
    # Calculate area of each contour and total area
    areas = [cv2.contourArea(contour) for contour in contours]
    total_area = sum(areas)

    # Set the factor threshold (e.g., 0.1 for 10%)
    factor = 0.001999

    # Convert grayscale image to BGR for coloring
    img_color = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)

    # Create a blank mask for filled contours
    filled_mask = np.zeros_like(image)

    centroids = []
    for i, (contour, area) in enumerate(zip(contours, areas)):
        ratio = area / total_area if total_area > 0 else 0
        M = cv2.moments(contour)
        if M["m00"] != 0:
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"])
        else:
            cx, cy = 0, 0
        centroids.append((cx, cy, i, area, ratio))
        if ratio > factor:
            cv2.drawContours(img_color, [contour], -1, (0, 0, 255), thickness=cv2.FILLED)  # Fill large contours with red
            cv2.drawContours(filled_mask, [contour], -1, 255, thickness=cv2.FILLED)  # Fill mask with white
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
    height, width = mask.shape
    foreground = (mask == 255).astype(np.uint8)
    col_density = foreground.mean(axis=0)
    window = max(15, min(61, width // 40))
    if window % 2 == 0:
        window += 1
    smooth = np.convolve(col_density, np.ones(window) / window, mode="same")
    threshold = max(0.003, float(np.percentile(smooth, 65)) * 0.55)

    segments = []
    in_segment = False
    start = 0
    for x, value in enumerate(smooth):
        if value > threshold and not in_segment:
            start = x
            in_segment = True
        if (value <= threshold or x == width - 1) and in_segment:
            end = x
            in_segment = False
            if end - start >= max(20, width * 0.08):
                segments.append((start, end))

    if len(segments) < total_graphs:
        step = width / max(1, total_graphs)
        return [
            (int(round(i * step)), int(round((i + 1) * step)))
            for i in range(total_graphs)
        ]

    segments = sorted(segments, key=lambda seg: seg[1] - seg[0], reverse=True)
    selected = sorted(segments[:total_graphs], key=lambda seg: seg[0])
    return selected


def extract_vertical_graph_tracks(mask: np.ndarray, total_graphs: int):
    bounds = find_vertical_track_bounds(mask, int(total_graphs))
    lines_data = {}

    for idx, (x_start, x_end) in enumerate(bounds):
        track = mask[:, x_start:x_end]
        track_width = max(1, x_end - x_start)
        points = []
        last_x = None

        for y in range(track.shape[0]):
            xs = np.where(track[y, :] == 255)[0]
            if len(xs) == 0:
                continue

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

            # Broad horizontal remnants are usually grid/labels, not the curve.
            max_run_width = max(4, int(track_width * 0.18))
            candidates = []
            for run_x1, run_x2 in runs:
                run_width = run_x2 - run_x1 + 1
                if run_width > max_run_width:
                    continue
                center = (run_x1 + run_x2) / 2.0
                candidates.append((center, run_width))
            if not candidates:
                continue

            if last_x is None:
                x_local = float(np.median([center for center, _ in candidates]))
            else:
                last_local = last_x - x_start
                x_local, _ = min(candidates, key=lambda item: abs(item[0] - last_local))
            x = x_local + x_start
            if last_x is not None:
                # Damp one-row jumps caused by small OCR/grid leftovers.
                max_jump = max(25, track_width * 0.18)
                if abs(x - last_x) > max_jump:
                    continue
            last_x = x
            points.append([int(round(x)), int(y)])

        lines_data[f"line_{idx+1}"] = smooth_vertical_points(points)

    return lines_data, bounds


def smooth_vertical_points(points, window=9):
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

def run_pipeline_and_graph(img_np, threshold, total_graphs, patch_size, batch_size):
    input_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
    cleaned_bgr = process_one_image(input_bgr, output_root=None, image_name='pipeline_input')
    if cleaned_bgr is None:
        raise ValueError('Grid removal failed in process_one_image')

    if USE_UNET_PIPELINE:
        print('[INFO] Using SVM+UNet pipeline')
        model_dir = os.path.join(os.path.dirname(__file__), 'models')
        with open(os.path.join(model_dir, 'svm_model.pkl'), 'rb') as model_file:
            loaded_model = pickle.load(model_file)
        with open(os.path.join(model_dir, 'scaler.pkl'), 'rb') as file:
            loaded_scaler = pickle.load(file)

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
        svm_predictions = []
        for patch in patches:
            features = extract_features(patch)
            features_scaled = loaded_scaler.transform([features])
            svm_pred = loaded_model.predict(features_scaled)[0]
            svm_predictions.append(svm_pred)

        pred_patches = []
        batch = []
        batch_indices = []

        for i, (patch, svm_pred) in enumerate(zip(patches, svm_predictions)):
            if svm_pred == 1:
                patch_img = Image.fromarray(patch)
                input_tensor = transform(patch_img)
                batch.append(input_tensor)
                batch_indices.append(i)

                if len(batch) == batch_size or i == len(patches) - 1:
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
    mask_full = refine_mask(mask_full)

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
    else:
        # separating graphs
        image_mask, unique_lines = draw_horizontal_separators(image=mask_full, n_lines=total_graphs)

        # extract graph points
        graph_points = extract_graphs(image = mask_full, unique_lines=unique_lines)
    
    return image_mask, graph_points

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

def extract_las_header(image):
    try:
        client = genai.Client(api_key=GEMNI_KEY)
        byte_arr = io.BytesIO()
        image_pil = Image.fromarray(image)
        image_pil.save(byte_arr, format='JPEG')
        image_bytes = byte_arr.getvalue()

        # Send the image and prompt to Gemini
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

        parsed_header = parse_well_log_ocr_to_las_header(response.text)
        if parsed_header:
            return parsed_header

        return convert_to_json_openai(response.text)
    except Exception as e:
        print(f"[WARN] Gemini API error ignored: {e}")
        return {}


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
        if OCR_READER is None:
            OCR_READER = easyocr.Reader(['en'], gpu=torch.cuda.is_available())
        results = OCR_READER.readtext(graph_image)
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


def resolve_local_path(path_value):
    if not path_value:
        return None
    path = Path(path_value)
    if path.is_absolute():
        return path
    return Path(__file__).resolve().parent / path


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
    if include_header_ocr:
        try:
            las_header = extract_las_header(image=header_image)
        except Exception as e:
            print(f"[WARN] Header extraction failed, continuing with empty headers: {e}")
            las_header = {}

    depth_ticks = extract_depth_ticks_ocr(body_image) if include_depth_ocr else []
    return las_header, body_image, depth_ticks, layout

def rescale_pixel_data(points, current_bounds, target_bounds, debug=True):
    """
    Rescale pixel coordinates while maintaining shape proportions.
    
    Args:
        points: List of [x, y] coordinates
        current_bounds: Tuple (min_x, min_y, max_x, max_y) of current coordinate system
        target_bounds: Tuple (min_x, min_y, max_x, max_y) of target coordinate system
        debug: Print scaling information
    
    Returns:
        List of rescaled [x, y] coordinates
    """
    curr_min_x, curr_min_y, curr_max_x, curr_max_y = current_bounds
    target_min_x, target_min_y, target_max_x, target_max_y = target_bounds
    
    # Calculate scaling factors
    scale_x = (target_max_x - target_min_x) / (curr_max_x - curr_min_x)
    scale_y = (target_max_y - target_min_y) / (curr_max_y - curr_min_y)
    
    # if debug:
    #     print(f"Current bounds: {current_bounds}")
    #     print(f"Target bounds: {target_bounds}")
    #     print(f"X scale factor: {scale_x:.4f}")
    #     print(f"Y scale factor: {scale_y:.4f}")
    #     print(f"Current width: {curr_max_x - curr_min_x}")
    #     print(f"Target width: {target_max_x - target_min_x}")
    
    rescaled_points = []
    for x, y in points:
        # Apply linear transformation
        new_x = target_min_x + (x - curr_min_x) * scale_x
        new_y = target_min_y + (y - curr_min_y) * scale_y
        rescaled_points.append([new_x, new_y])
        
        # if debug and len(rescaled_points) <= 3:  # Show first few transformations
            # print(f"({x}, {y}) → ({new_x:.2f}, {new_y:.2f})")
    
    return rescaled_points

def get_pixel_bounds(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return (min(xs), min(ys), max(xs), max(ys))  # (x_min, y_min, x_max, y_max)

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
            mnemonic = item['Mnemonic']
            value = item['Value']
            unit = item.get('Unit', '')
            description = item.get('Description', '')
            
            # Handle multiple entries with same mnemonic (like DATE, TDD, etc.)
            if mnemonic in las.well:
                # If mnemonic already exists, create a unique one by appending number
                counter = 1
                original_mnemonic = mnemonic
                while mnemonic in las.well:
                    mnemonic = f"{original_mnemonic}_{counter}"
                    counter += 1
            
            las.well[mnemonic] = lasio.HeaderItem(mnemonic, unit=unit, value=value, descr=description)
    return las

def create_las_with_dict(json_data, curves_dict, curve_metadata=None, depth_unit="F", depth_step=None):
    """Create LAS file from curves with interpolation to common depth."""
    curve_metadata = curve_metadata or {}
    depth_unit = depth_unit or "F"
    
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

@app.post("/segment-and-graph")
async def segment_and_graph(
    file: UploadFile = File(...),
    threshold: float = Form(0.5),
    total_graphs: float = Form(2),
    patch_size: int = Form(96),
    batch_size: int = Form(32),
    include_header_ocr: bool = Form(False),
    include_depth_ocr: bool = Form(False),
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

    # GET HEADER AND GRAPH PART FROM WHOLE IMAGE
    las_file_header, image_without_b, depth_ticks, layout_info = extract_header_info_and_graph_part(
        img_cv2=img,
        model_path=YOLO_MODEL_PATH,
        include_header_ocr=include_header_ocr,
        include_depth_ocr=include_depth_ocr,
        manual_graph_box=manual_box,
    )
    header_image = crop_box(img, layout_info["header_box"])

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
    _, graph_points = run_pipeline_and_graph(
        image_for_curve_pipeline,
        threshold,
        total_graphs,
        patch_size,
        batch_size,
    )

    image_b64 = encode_png_base64(image_without_b)
    header_b64 = encode_png_base64(header_image)

    return JSONResponse({
        "overlay_png_base64": image_b64,
        "header_png_base64": header_b64,
        "graph_png_base64": image_b64,
        "graph_points": graph_points,
        "image_dimensions": {
            "width": original_width,
            "height": original_height
        },
        "layout": layout_info,
        "las_headers": las_file_header,
        "depth_ticks": depth_ticks,
        "tiff_preprocessing": tiff_preprocessing_info
    })


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
        depth_unit = data_received.get("depth_unit", "F")
        depth_step = data_received.get("depth_step", 0.5)
        # Rescale pixel data
        rescaled_data = {}
        for graph_name, graph in graph_info.items():
            x_range = graph["x_range"]
            y_range = graph["y_range"]
            target_bounds = (x_range[0], y_range[0], x_range[1], y_range[1])
            pixel_bounds = graph.get("pixel_bounds")

            for line_name, line_points in graph["lines"].items():
                current_bounds = tuple(pixel_bounds) if pixel_bounds else get_pixel_bounds(line_points)
                rescaled_data[line_name] = rescale_pixel_data(line_points, current_bounds, target_bounds)

        # Generate curves
        curves_dict = {}
        for line_name, points in rescaled_data.items():
            sorted_points = sorted(points, key=lambda p: p[1])  # sort by depth (y)
            depths = [pt[1] for pt in sorted_points]
            values = [pt[0] for pt in sorted_points]
            curves_dict[line_name] = (depths, values)

        # Create LAS object
        las = create_las_with_dict(
            las_file_header,
            curves_dict,
            curve_metadata=curve_metadata,
            depth_unit=depth_unit,
            depth_step=depth_step,
        )

        # Write LAS to memory
        buffer = io.StringIO()
        las.write(buffer)
        las_content = buffer.getvalue().encode("utf-8")
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

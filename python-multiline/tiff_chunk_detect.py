import io
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageSequence
from ultralytics import YOLO
import boxRemoval as br

DATA_DIR = Path("demo dataset")
MODEL_PATH = Path(r"models/best.pt")
OUTPUT_DIR = Path("tiff_chunk_detection_output")

CHUNK_HEIGHT = 1536
CHUNK_OVERLAP = 256
CONF_THRESHOLD = 0.25
IOU_THRESHOLD = 0.45
MAX_DET = 300
MERGE_IOU_THRESHOLD = 0.15
MERGE_TOUCH_MARGIN = 20   # px margin: boxes within this distance count as touching
GRAPH_CLASS_NAME = "graph"
BOX_THICKNESS = 15
SAVE_CHUNK_DEBUG = False
SAVE_DETECTION_CROPS = False


# ═══════════════════════════════════════════════════════════════════════
# FIX 1 — Adaptive preprocessing threshold for gray/faint scans
#   Instead of a fixed KEEP_BLACK_THRESH=105, detect whether the image
#   is a gray scan (median gray < 200, or Otsu threshold > 140) and
#   raise the threshold so that gray curves are preserved.
# ═══════════════════════════════════════════════════════════════════════
ADAPTIVE_THRESH_ENABLED = True
ADAPTIVE_GRAY_MEDIAN_CUTOFF = 210   # if median gray < this → considered gray scan
ADAPTIVE_OTSU_FLOOR = 140           # if Otsu > this → image has mostly gray content
ADAPTIVE_FALLBACK_THRESH = 180      # threshold used for gray scans (keeps gray curves)
ADAPTIVE_MIN_CONTENT_RATIO = 0.02   # if <2% non-white after preprocess → skip cleaning


def _adaptive_black_thresh(crop_bgr: np.ndarray) -> int:
    """Return an appropriate keep-black threshold for this specific crop."""
    if not ADAPTIVE_THRESH_ENABLED:
        return br.KEEP_BLACK_THRESH

    gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
    med = float(np.median(gray))

    # Otsu gives us the "natural" split between foreground and background
    otsu_val, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    if med < ADAPTIVE_GRAY_MEDIAN_CUTOFF or otsu_val > ADAPTIVE_OTSU_FLOOR:
        # Gray/faint scan — use a more permissive threshold
        return ADAPTIVE_FALLBACK_THRESH
    else:
        # Normal dark-on-white scan — use default
        return br.KEEP_BLACK_THRESH


# ═══════════════════════════════════════════════════════════════════════
# FIX 2 — Filter contours: keep only grid/box-like structures
#   Grid/box lines are long, straight, and axis-aligned.  Graph curves
#   are wiggly.  Use minAreaRect aspect ratio + orientation to decide:
#   a contour is a "grid line" if its minAreaRect is elongated (aspect
#   ratio > threshold) AND nearly horizontal or vertical (angle within
#   tolerance of 0° or 90°).  Only these contours go into the box mask.
# ═══════════════════════════════════════════════════════════════════════
GRID_FILTER_ENABLED = True
GRID_FILTER_MIN_ASPECT = 5.0       # minAreaRect long/short must exceed this
GRID_FILTER_ANGLE_TOL = 15.0       # degrees from 0° or 90° to count as axis-aligned


def _is_grid_line_contour(cnt) -> bool:
    """Return True if contour looks like a straight grid/box line."""
    if not GRID_FILTER_ENABLED:
        return True

    rect = cv2.minAreaRect(cnt)
    (_, _), (rw, rh), angle = rect

    if rw < 1 or rh < 1:
        return False

    long_side = max(rw, rh)
    short_side = min(rw, rh)
    if short_side < 1:
        return True  # infinitely thin → line-like

    aspect = long_side / short_side
    if aspect < GRID_FILTER_MIN_ASPECT:
        return False  # too blobby, likely a curve segment

    # Check if nearly horizontal or vertical
    # cv2.minAreaRect angle is in [-90, 0) range
    # Normalize: if width < height, the angle is relative to vertical
    if rw < rh:
        effective_angle = abs(angle)          # angle from vertical
    else:
        effective_angle = abs(angle + 90)     # angle from horizontal

    # Accept if close to 0° (axis-aligned)
    if effective_angle <= GRID_FILTER_ANGLE_TOL:
        return True
    if abs(effective_angle - 90) <= GRID_FILTER_ANGLE_TOL:
        return True

    return False


# ═══════════════════════════════════════════════════════════════════════


def _find_grid_contours_and_mask(img_bgr: np.ndarray, filter_contours: bool = True):
    """Find contours on a preprocessed image and build a box mask.
    Returns (box_mask, all_cnts, grid_cnts, thresh, morph, auto_th_h, auto_th_v).
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    # Use Otsu thresholding to automatically remove gray background
    otsu_thresh, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # Invert for contour detection (foreground should be white)
    _, thresh = cv2.threshold(gray, otsu_thresh, 255, cv2.THRESH_BINARY_INV)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    morph = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=3)
    contours, _ = cv2.findContours(morph, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

    all_cnts, grid_cnts = [], []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        if w > 5 and h > 5:
            all_cnts.append(cnt)
            if filter_contours and _is_grid_line_contour(cnt):
                grid_cnts.append(cnt)

    if br.AUTO_BOX_THICKNESS:
        auto_th_h, auto_th_v = br.estimate_box_line_thickness(img_bgr)
    else:
        auto_th_h, auto_th_v = br.LINE_THICKNESS_H, br.LINE_THICKNESS_V

    mask_cnts = grid_cnts if (filter_contours and GRID_FILTER_ENABLED) else all_cnts

    if br.USE_CONTOUR_OUTLINE_MASK:
        box_mask = br.build_box_mask_from_contours(
            img_bgr.shape, mask_cnts,
            horiz_thickness_float=auto_th_h, vert_thickness_float=auto_th_v,
        )
    else:
        boxes = [cv2.boundingRect(c) for c in mask_cnts]
        box_mask = br.build_box_mask(
            img_bgr.shape, boxes,
            horiz_thickness_float=auto_th_h, vert_thickness_float=auto_th_v,
        )

    return box_mask, all_cnts, grid_cnts, thresh, morph, auto_th_h, auto_th_v


def clean_graph_crop_with_box_removal(crop_bgr: np.ndarray):
    """Two-pass contour-based box/grid detection and removal.

    Pass 1 (adaptive): uses a higher threshold to catch gray grid lines.
    Pass 2 (original): uses KEEP_BLACK_THRESH=105 on Pass 1's result to
    catch remaining black grid/box lines that the adaptive pass missed.
    """
    if crop_bgr is None or crop_bgr.size == 0:
        return crop_bgr, {}

    # ══════════════════════════════════════════════════════════════════
    # PASS 1 — adaptive threshold (catches gray grid lines)
    # ══════════════════════════════════════════════════════════════════
    adaptive_thresh = _adaptive_black_thresh(crop_bgr)
    p1_img, _, _, _ = br.preprocess_keep_black_drop_blue(
        crop_bgr, black_thresh=adaptive_thresh,
    )

    # Check if preprocessing left enough content to work with
    gray_check = cv2.cvtColor(p1_img, cv2.COLOR_BGR2GRAY)
    content_ratio = float(np.count_nonzero(gray_check < 250)) / float(gray_check.size)
    if content_ratio < ADAPTIVE_MIN_CONTENT_RATIO:
        debug = {"p1_preprocessed": p1_img, "skipped": True}
        return crop_bgr, debug

    # FIX 2: filter contours to grid-like shapes only
    p1_box_mask, p1_all, p1_grid, p1_thresh, p1_morph, _, _ = \
        _find_grid_contours_and_mask(p1_img, filter_contours=GRID_FILTER_ENABLED)

    p1_after = cv2.inpaint(p1_img, p1_box_mask, inpaintRadius=4, flags=cv2.INPAINT_TELEA)

    # ══════════════════════════════════════════════════════════════════
    # PASS 2 — original threshold (catches remaining black lines)
    #   Re-preprocess the raw image with the strict KEEP_BLACK_THRESH
    #   then find & inpaint any box/grid contours still present.
    # ══════════════════════════════════════════════════════════════════
    p2_img, _, _, _ = br.preprocess_keep_black_drop_blue(
        crop_bgr, black_thresh=br.KEEP_BLACK_THRESH,
    )

    # Use all contours (no grid filter) — the strict threshold already
    # eliminates gray content, so what remains is real black structure.
    p2_box_mask, p2_all, _, p2_thresh, p2_morph, _, _ = \
        _find_grid_contours_and_mask(p2_img, filter_contours=False)

    # Combine both masks: union of pass1 (gray grids) + pass2 (black grids)
    combined_box_mask = cv2.bitwise_or(p1_box_mask, p2_box_mask)

    # Apply the combined mask on the pass-2 preprocessed image
    # (pass 2 image is the "clean" strict-threshold version)
    after_boxes = cv2.inpaint(p2_img, combined_box_mask, inpaintRadius=4, flags=cv2.INPAINT_TELEA)

    # ── STEP 3: thin-dot removal ───────────────────────────────────────
    thin_dot_mask, thin_raw, _ = br.get_dot_mask_by_dilation_thinning(after_boxes)
    after_thin = after_boxes.copy()
    after_thin[thin_dot_mask > 0] = 255

    # ── STEP 4: small object + small line + isolated line cleanup ──────
    small_obj_mask, _, _ = br.get_small_object_mask(after_thin)
    small_line_mask, _, _ = br.get_small_axis_line_mask_morph(after_thin)
    iso_line_mask, _, _, _ = br.get_isolated_axis_line_mask_morph(after_thin)

    combined_mask = cv2.bitwise_or(small_obj_mask, small_line_mask)
    combined_mask = cv2.bitwise_or(combined_mask, iso_line_mask)
    num_labels, _, _, _ = cv2.connectedComponentsWithStats(combined_mask, connectivity=8)
    combined_count = max(0, int(num_labels) - 1)
    combined_coverage = float(np.count_nonzero(combined_mask)) / float(combined_mask.size)

    if combined_count == 0:
        result = after_thin.copy()
    elif combined_count > br.SMALL_OBJ_MAX_LABELS or combined_coverage > br.SMALL_OBJ_MAX_COVERAGE:
        result = after_thin.copy()
        result[combined_mask > 0] = 255
    else:
        result = cv2.inpaint(after_thin, combined_mask, br.SMALL_OBJ_INPAINT_R, cv2.INPAINT_TELEA)

    debug = {
        "p1_preprocessed": p1_img,
        "p1_box_mask": p1_box_mask,
        "p1_after_inpaint": p1_after,
        "p2_preprocessed": p2_img,
        "p2_box_mask": p2_box_mask,
        "combined_box_mask": combined_box_mask,
        "after_boxes": after_boxes,
        "thin_dot_mask": thin_dot_mask,
        "after_thin": after_thin,
        "small_obj_mask": small_obj_mask,
        "small_line_mask": small_line_mask,
        "iso_line_mask": iso_line_mask,
        "cleanup_mask": combined_mask,
        "result": result,
    }

    return result, debug


def load_tiff_pages(tiff_path: Path) -> list[np.ndarray]:
    pages = []
    with Image.open(tiff_path) as im:
        for frame in ImageSequence.Iterator(im):
            rgb = np.array(frame.convert("RGB"))
            bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            pages.append(bgr)
    return pages


def load_tiff_pages_from_bytes(tiff_bytes: bytes) -> list[np.ndarray]:
    pages = []
    with Image.open(io.BytesIO(tiff_bytes)) as im:
        for frame in ImageSequence.Iterator(im):
            rgb = np.array(frame.convert("RGB"))
            bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            pages.append(bgr)
    return pages


def get_class_names(model: YOLO) -> dict[int, str]:
    class_names_raw = model.names if hasattr(model, "names") else {}
    if not isinstance(class_names_raw, dict):
        return {}
    return {int(k): str(v) for k, v in dict(class_names_raw).items()}


def iter_chunk_ranges(height: int, chunk_height: int, overlap: int):
    if chunk_height <= 0:
        raise ValueError("chunk_height must be > 0")
    step = max(1, chunk_height - max(0, overlap))

    if height <= chunk_height:
        yield 0, height
        return

    y1 = 0
    while y1 < height:
        y2 = min(height, y1 + chunk_height)
        yield y1, y2
        if y2 >= height:
            break
        y1 += step


def run_detection_on_chunk(model: YOLO, chunk_bgr: np.ndarray) -> list[dict]:
    detections = []
    results = model(chunk_bgr, conf=CONF_THRESHOLD, iou=IOU_THRESHOLD, max_det=MAX_DET, verbose=False)

    if not results:
        return detections

    boxes = results[0].boxes
    if boxes is None:
        return detections

    xyxy = boxes.xyxy.cpu().numpy() if boxes.xyxy is not None else np.empty((0, 4))
    confs = boxes.conf.cpu().numpy() if boxes.conf is not None else np.empty((0,))
    classes = boxes.cls.cpu().numpy().astype(int) if boxes.cls is not None else np.empty((0,), dtype=int)

    for i in range(len(xyxy)):
        x1, y1, x2, y2 = [float(v) for v in xyxy[i]]
        detections.append(
            {
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "conf": float(confs[i]) if i < len(confs) else 0.0,
                "class_id": int(classes[i]) if i < len(classes) else -1,
            }
        )

    return detections


def detect_graph_regions_on_page(page_bgr: np.ndarray, model: YOLO, class_names: dict[int, str]) -> list[dict]:
    h, _ = page_bgr.shape[:2]
    all_dets = []

    for chunk_idx, (y1, y2) in enumerate(iter_chunk_ranges(h, CHUNK_HEIGHT, CHUNK_OVERLAP)):
        chunk = page_bgr[y1:y2, :]
        chunk_dets = run_detection_on_chunk(model, chunk)

        for d in chunk_dets:
            d["y1"] += y1
            d["y2"] += y1
            d["chunk_index"] = chunk_idx
            d["chunk_y1"] = y1
            d["chunk_y2"] = y2
            all_dets.append(d)

    merged_dets = nms_by_class(all_dets, iou_threshold=IOU_THRESHOLD)
    merged_dets = merge_overlapping_graph_detections(
        merged_dets,
        class_names=class_names,
        graph_class_name=GRAPH_CLASS_NAME,
    )
    merged_dets = [
        d for d in merged_dets
        if class_names.get(int(d["class_id"]), "") == GRAPH_CLASS_NAME
    ]
    return merged_dets


def clean_detected_graph_regions(page_bgr: np.ndarray, detections: list[dict]):
    h, w = page_bgr.shape[:2]
    page_cleaned = page_bgr.copy()
    cleaned_count = 0

    for d in detections:
        x1 = max(0, int(round(d["x1"])))
        y1 = max(0, int(round(d["y1"])))
        x2 = min(w, int(round(d["x2"])))
        y2 = min(h, int(round(d["y2"])))
        if x2 <= x1 or y2 <= y1:
            continue

        before_crop = page_bgr[y1:y2, x1:x2]
        if before_crop.size == 0:
            continue

        after_crop, _ = clean_graph_crop_with_box_removal(before_crop)
        page_cleaned[y1:y2, x1:x2] = after_crop
        cleaned_count += 1

    return page_cleaned, cleaned_count


def process_image_for_backend(image_bgr: np.ndarray, model_path: str | Path):
    model = YOLO(str(model_path))
    class_names = get_class_names(model)
    detections = detect_graph_regions_on_page(image_bgr, model, class_names)
    cleaned_page_bgr, cleaned_count = clean_detected_graph_regions(image_bgr, detections)
    annotated_page_bgr = annotate_page(image_bgr, detections, class_names)

    return {
        "width": int(image_bgr.shape[1]),
        "height": int(image_bgr.shape[0]),
        "detections": detections,
        "cleaned_detection_count": int(cleaned_count),
        "annotated_page_bgr": annotated_page_bgr,
        "cleaned_page_bgr": cleaned_page_bgr,
    }


def process_tiff_bytes_for_backend(tiff_bytes: bytes, model_path: str | Path):
    pages = load_tiff_pages_from_bytes(tiff_bytes)
    if not pages:
        return []

    model = YOLO(str(model_path))
    class_names = get_class_names(model)
    page_results = []

    for page_idx, page_bgr in enumerate(pages):
        detections = detect_graph_regions_on_page(page_bgr, model, class_names)
        cleaned_page_bgr, cleaned_count = clean_detected_graph_regions(page_bgr, detections)
        annotated_page_bgr = annotate_page(page_bgr, detections, class_names)

        page_results.append(
            {
                "page_index": page_idx,
                "width": int(page_bgr.shape[1]),
                "height": int(page_bgr.shape[0]),
                "detections": detections,
                "cleaned_detection_count": int(cleaned_count),
                "annotated_page_bgr": annotated_page_bgr,
                "cleaned_page_bgr": cleaned_page_bgr,
            }
        )

    return page_results


def nms_by_class(detections: list[dict], iou_threshold: float = 0.45) -> list[dict]:
    if not detections:
        return []

    kept = []
    class_ids = sorted({d["class_id"] for d in detections})

    for cls_id in class_ids:
        cls_dets = [d for d in detections if d["class_id"] == cls_id]
        boxes = []
        scores = []

        for d in cls_dets:
            x1 = float(d["x1"])
            y1 = float(d["y1"])
            w = max(1.0, float(d["x2"] - d["x1"]))
            h = max(1.0, float(d["y2"] - d["y1"]))
            boxes.append([x1, y1, w, h])
            scores.append(float(d["conf"]))

        idxs = cv2.dnn.NMSBoxes(boxes, scores, score_threshold=0.0, nms_threshold=iou_threshold)
        if len(idxs) == 0:
            continue

        for idx in np.array(idxs).reshape(-1):
            kept.append(cls_dets[int(idx)])

    return kept


def _boxes_touch(a: dict, b: dict, margin: float = 0.0) -> bool:
    """Return True if boxes overlap or are within `margin` px of each other."""
    ax1, ay1, ax2, ay2 = float(a["x1"]), float(a["y1"]), float(a["x2"]), float(a["y2"])
    bx1, by1, bx2, by2 = float(b["x1"]), float(b["y1"]), float(b["x2"]), float(b["y2"])
    return not (ax2 + margin < bx1 or bx2 + margin < ax1 or
                ay2 + margin < by1 or by2 + margin < ay1)


def merge_overlapping_graph_detections(
    detections: list[dict],
    class_names: dict[int, str],
    graph_class_name: str = "graph",
    touch_margin: float = None,
) -> list[dict]:
    """Merge graph detections that overlap or lightly touch into large patches."""
    if touch_margin is None:
        touch_margin = float(MERGE_TOUCH_MARGIN)
    if not detections:
        return []

    graph_dets = []
    other_dets = []
    for d in detections:
        cls_name = class_names.get(int(d["class_id"]), "")
        if cls_name == graph_class_name:
            graph_dets.append(dict(d))
        else:
            other_dets.append(d)

    if not graph_dets:
        return detections

    merged = []
    used = [False] * len(graph_dets)
    for i in range(len(graph_dets)):
        if used[i]:
            continue

        cluster = [graph_dets[i]]
        used[i] = True

        changed = True
        while changed:
            changed = False
            # build a single union bbox for the current cluster
            cx1 = min(d["x1"] for d in cluster)
            cy1 = min(d["y1"] for d in cluster)
            cx2 = max(d["x2"] for d in cluster)
            cy2 = max(d["y2"] for d in cluster)
            cluster_box = {"x1": cx1, "y1": cy1, "x2": cx2, "y2": cy2}
            for j in range(len(graph_dets)):
                if used[j]:
                    continue
                if _boxes_touch(graph_dets[j], cluster_box, margin=touch_margin):
                    used[j] = True
                    cluster.append(graph_dets[j])
                    changed = True

        x1 = min(d["x1"] for d in cluster)
        y1 = min(d["y1"] for d in cluster)
        x2 = max(d["x2"] for d in cluster)
        y2 = max(d["y2"] for d in cluster)
        conf = max(float(d["conf"]) for d in cluster)
        class_id = int(cluster[0]["class_id"])

        merged.append(
            {
                "x1": float(x1),
                "y1": float(y1),
                "x2": float(x2),
                "y2": float(y2),
                "conf": float(conf),
                "class_id": class_id,
            }
        )

    print(f"  Merge: {len(graph_dets)} graph dets -> {len(merged)} patches")
    return other_dets + merged


def color_for_class(class_id: int) -> tuple[int, int, int]:
    return (0, 0, 180)


def annotate_page(image_bgr: np.ndarray, detections: list[dict], class_names: dict[int, str]) -> np.ndarray:
    vis = image_bgr.copy()
    for d in detections:
        x1 = int(round(d["x1"]))
        y1 = int(round(d["y1"]))
        x2 = int(round(d["x2"]))
        y2 = int(round(d["y2"]))
        cls_id = int(d["class_id"])
        conf = float(d["conf"])

        color = color_for_class(cls_id)
        label_name = class_names.get(cls_id, f"cls_{cls_id}")
        label = f"{label_name} {conf:.2f}"

        cv2.rectangle(vis, (x1, y1), (x2, y2), color, BOX_THICKNESS)
        cv2.putText(
            vis,
            label,
            (x1, max(12, y1 - 6)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            color,
            1,
            cv2.LINE_AA,
        )
    return vis


def save_detection_crops(page_bgr: np.ndarray, detections: list[dict], out_dir: Path, page_idx: int):
    if not SAVE_DETECTION_CROPS:
        return

    crop_dir = out_dir / "crops"
    crop_dir.mkdir(parents=True, exist_ok=True)

    for i, d in enumerate(detections):
        x1 = max(0, int(round(d["x1"])))
        y1 = max(0, int(round(d["y1"])))
        x2 = min(page_bgr.shape[1], int(round(d["x2"])))
        y2 = min(page_bgr.shape[0], int(round(d["y2"])))
        if x2 <= x1 or y2 <= y1:
            continue
        crop = page_bgr[y1:y2, x1:x2]
        cls_id = int(d["class_id"])
        conf = float(d["conf"])
        cv2.imwrite(str(crop_dir / f"page_{page_idx:03d}_det_{i:03d}_c{cls_id}_{conf:.2f}.png"), crop)


def detect_tiff_chunks(tiff_path: Path, model: YOLO, class_names: dict):
    """Process a single TIFF file: detect graphs, clean, save outputs."""
    pages = load_tiff_pages(tiff_path)
    if not pages:
        print(f"  WARNING: No pages read from {tiff_path}, skipping.")
        return

    run_out_dir = OUTPUT_DIR / tiff_path.stem
    run_out_dir.mkdir(parents=True, exist_ok=True)

    summary = {
        "tiff_path": str(tiff_path),
        "model_path": str(MODEL_PATH),
        "chunk_height": CHUNK_HEIGHT,
        "chunk_overlap": CHUNK_OVERLAP,
        "conf_threshold": CONF_THRESHOLD,
        "iou_threshold": IOU_THRESHOLD,
        "pages": [],
    }

    for page_idx, page_bgr in enumerate(pages):
        h, w = page_bgr.shape[:2]
        all_dets = []

        for chunk_idx, (y1, y2) in enumerate(iter_chunk_ranges(h, CHUNK_HEIGHT, CHUNK_OVERLAP)):
            chunk = page_bgr[y1:y2, :]
            chunk_dets = run_detection_on_chunk(model, chunk)

            for d in chunk_dets:
                d["y1"] += y1
                d["y2"] += y1
                d["chunk_index"] = chunk_idx
                d["chunk_y1"] = y1
                d["chunk_y2"] = y2
                all_dets.append(d)

            if SAVE_CHUNK_DEBUG:
                chunk_vis = annotate_page(chunk, chunk_dets, class_names)
                cv2.imwrite(str(run_out_dir / f"page_{page_idx:03d}_chunk_{chunk_idx:03d}.png"), chunk_vis)

        merged_dets = nms_by_class(all_dets, iou_threshold=IOU_THRESHOLD)
        merged_dets = merge_overlapping_graph_detections(
            merged_dets,
            class_names=class_names,
            graph_class_name=GRAPH_CLASS_NAME,
        )
        merged_dets = [
            d for d in merged_dets
            if class_names.get(int(d["class_id"]), "") == GRAPH_CLASS_NAME
        ]

        page_cleaned = page_bgr.copy()
        det_out_dir = run_out_dir / f"page_{page_idx:03d}_detections"
        det_out_dir.mkdir(parents=True, exist_ok=True)
        cleaned_count = 0

        for det_idx, d in enumerate(merged_dets):
            x1 = max(0, int(round(d["x1"])))
            y1 = max(0, int(round(d["y1"])))
            x2 = min(w, int(round(d["x2"])))
            y2 = min(h, int(round(d["y2"])))
            if x2 <= x1 or y2 <= y1:
                continue

            before_crop = page_bgr[y1:y2, x1:x2]
            if before_crop.size == 0:
                continue

            after_crop, debug = clean_graph_crop_with_box_removal(before_crop)

            page_cleaned[y1:y2, x1:x2] = after_crop
            cleaned_count += 1

            cv2.imwrite(str(det_out_dir / f"det_{det_idx:03d}_before.png"), before_crop)
            cv2.imwrite(str(det_out_dir / f"det_{det_idx:03d}_after.png"), after_crop)
            for key, val in debug.items():
                if val is None:
                    continue
                if isinstance(val, np.ndarray) and val.ndim >= 2:
                    cv2.imwrite(str(det_out_dir / f"det_{det_idx:03d}_{key}.png"), val)
            br.save_comparison_image(before_crop, after_crop,
                                     det_out_dir / f"det_{det_idx:03d}_comparison.png")

        page_vis = annotate_page(page_bgr, merged_dets, class_names)

        vis_path = run_out_dir / f"page_{page_idx:03d}_detections.png"
        cleaned_page_path = run_out_dir / f"page_{page_idx:03d}_cleaned_graph_regions.png"
        comparison_page_path = run_out_dir / f"page_{page_idx:03d}_page_comparison.png"
        cv2.imwrite(str(vis_path), page_vis)
        cv2.imwrite(str(cleaned_page_path), page_cleaned)
        br.save_comparison_image(page_bgr, page_cleaned, comparison_page_path)
        save_detection_crops(page_bgr, merged_dets, run_out_dir, page_idx)

        page_info = {
            "page_index": page_idx,
            "width": w,
            "height": h,
            "detections": merged_dets,
            "annotated_image": vis_path.name,
            "cleaned_page_image": cleaned_page_path.name,
            "page_comparison_image": comparison_page_path.name,
            "cleaned_detection_count": cleaned_count,
        }
        summary["pages"].append(page_info)

        print(f"Page {page_idx}: chunks processed, detections={len(merged_dets)}")

    summary_path = run_out_dir / "detections.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"  Saved to: {run_out_dir}")


def detect_all_tiffs():
    """Run detection + cleaning on every .tif in DATA_DIR."""
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

    tiff_files = sorted(DATA_DIR.glob("*.tif"))
    if not tiff_files:
        raise FileNotFoundError(f"No .tif files found in {DATA_DIR}")

    print(f"Found {len(tiff_files)} TIFF files in {DATA_DIR}")

    model = YOLO(str(MODEL_PATH))
    class_names_raw = model.names if hasattr(model, "names") else {}
    class_names = {int(k): str(v) for k, v in dict(class_names_raw).items()} if isinstance(class_names_raw, dict) else {}

    for idx, tiff_path in enumerate(tiff_files, 1):
        print(f"\n[{idx}/{len(tiff_files)}] Processing {tiff_path.name}")
        try:
            detect_tiff_chunks(tiff_path, model, class_names)
        except Exception as e:
            print(f"  ERROR processing {tiff_path.name}: {e}")

    print(f"\nDone. All outputs in: {OUTPUT_DIR}")


if __name__ == "__main__":
    detect_all_tiffs()

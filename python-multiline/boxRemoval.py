import cv2
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

INPUT_DIR = Path('data')
OUTPUT_DIR = Path('output')

PARALLELISM_ANGLE_TOL = 2.0
LINE_THICKNESS_H      = 2.8
LINE_THICKNESS_V      = 3.4
AUTO_BOX_THICKNESS    = True
AUTO_THICK_MIN        = 1.2
AUTO_THICK_MAX        = 6.5
AUTO_THICK_SCALE_H    = 0.78
AUTO_THICK_SCALE_V    = 0.82
BOX_MASK_SUPERSAMPLE  = 4
BOX_MASK_BIN_THRESH   = 127
BOX_CONTOUR_THRESH    = 200
USE_CONTOUR_OUTLINE_MASK = True
USE_COMBINED_BOX_MASK = True
GRID_LINE_CLUSTER_TOL = 8
KEEP_BLACK_THRESH     = 105
DROP_BLUE_H_LOW       = 85
DROP_BLUE_H_HIGH      = 140
DROP_BLUE_S_MIN       = 50
DROP_BLUE_V_MIN       = 30
SMALL_OBJ_THRESH      = 180
SMALL_OBJ_MAX_AREA    = 320
SMALL_OBJ_MAX_LEN     = 45
SMALL_OBJ_INPAINT_R   = 3
SMALL_OBJ_MAX_COVERAGE = 0.08
SMALL_OBJ_MAX_LABELS   = 50000
MORPH_LINE_THRESH      = 180
MORPH_LINE_MIN_LEN     = 5
MORPH_LINE_MAX_LEN     = 70
MORPH_LINE_MAX_THICK   = 5
THIN_DILATE_KSIZE      = 3
THIN_DILATE_ITERS      = 1
THIN_DOT_MAX_AREA      = 42
THIN_DOT_MAX_LEN       = 10
ISO_LINE_MIN_LEN       = 18
ISO_LINE_MAX_LEN       = 140
ISO_LINE_MAX_THICK     = 5
ISO_NEIGHBOR_RADIUS    = 2
RECONSTRUCT_GRID_INTERSECTIONS = False

# ── helpers ────────────────────────────────────────────────────────────────────
def cluster_1d_values(values, tolerance=5):
    if not values:
        return []
    sorted_vals = sorted(set(values))
    clusters, current = [], [sorted_vals[0]]
    for v in sorted_vals[1:]:
        if v - current[-1] <= tolerance:
            current.append(v)
        else:
            clusters.append(np.mean(current))
            current = [v]
    clusters.append(np.mean(current))
    return clusters

def is_parallel_box(cnt, angle_tol=PARALLELISM_ANGLE_TOL):
    if len(cnt) < 4:
        return False
    rect  = cv2.minAreaRect(cnt)
    angle = rect[2]
    if angle < -45:
        angle += 90
    return abs(angle) <= angle_tol

def _thickness_from_mask(mask_u8, default_value, min_value=AUTO_THICK_MIN, max_value=AUTO_THICK_MAX):
    if mask_u8 is None or mask_u8.size == 0:
        return float(default_value)
    if np.count_nonzero(mask_u8) < 50:
        return float(default_value)

    dist = cv2.distanceTransform(mask_u8, cv2.DIST_L2, 3)
    vals = dist[mask_u8 > 0]
    if vals.size < 50:
        return float(default_value)

    radius = float(np.percentile(vals, 80))
    thickness = 2.0 * radius
    return float(np.clip(thickness, min_value, max_value))

def estimate_box_line_thickness(image_bgr,
                                default_h=LINE_THICKNESS_H,
                                default_v=LINE_THICKNESS_V,
                                scale_h=AUTO_THICK_SCALE_H,
                                scale_v=AUTO_THICK_SCALE_V):
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _, bw = cv2.threshold(blur, 180, 255, cv2.THRESH_BINARY_INV)

    h, w = gray.shape[:2]
    h_len = max(20, int(round(w * 0.06)))
    v_len = max(20, int(round(h * 0.06)))

    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (h_len, 1))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, v_len))

    horiz_mask = cv2.morphologyEx(bw, cv2.MORPH_OPEN, h_kernel)
    vert_mask = cv2.morphologyEx(bw, cv2.MORPH_OPEN, v_kernel)

    th_h = _thickness_from_mask(horiz_mask, default_h) * float(scale_h)
    th_v = _thickness_from_mask(vert_mask, default_v) * float(scale_v)

    th_h = float(np.clip(th_h, AUTO_THICK_MIN, AUTO_THICK_MAX))
    th_v = float(np.clip(th_v, AUTO_THICK_MIN, AUTO_THICK_MAX))
    return th_h, th_v

def build_box_mask(image_shape, boxes,
                   horiz_thickness_float=LINE_THICKNESS_H,
                   vert_thickness_float=LINE_THICKNESS_V,
                   supersample=BOX_MASK_SUPERSAMPLE,
                   bin_thresh=BOX_MASK_BIN_THRESH):
    h, w = image_shape[:2]
    if supersample <= 1:
        mask = np.zeros((h, w), dtype=np.uint8)
        th = max(1, int(round(horiz_thickness_float)))
        tv = max(1, int(round(vert_thickness_float)))
        for (bx, by, bw, bh) in boxes:
            x0, y0 = bx, by
            x1, y1 = bx + bw, by + bh
            cv2.line(mask, (x0, y0), (x1, y0), 255, thickness=th)
            cv2.line(mask, (x0, y1), (x1, y1), 255, thickness=th)
            cv2.line(mask, (x0, y0), (x0, y1), 255, thickness=tv)
            cv2.line(mask, (x1, y0), (x1, y1), 255, thickness=tv)
        return mask

    hs, ws = h * supersample, w * supersample
    mask_hi = np.zeros((hs, ws), dtype=np.uint8)
    th_hi = max(1, int(round(horiz_thickness_float * supersample)))
    tv_hi = max(1, int(round(vert_thickness_float * supersample)))

    for (bx, by, bw, bh) in boxes:
        x0 = int(round(bx * supersample))
        y0 = int(round(by * supersample))
        x1 = int(round((bx + bw) * supersample))
        y1 = int(round((by + bh) * supersample))
        cv2.line(mask_hi, (x0, y0), (x1, y0), 255, thickness=th_hi, lineType=cv2.LINE_AA)
        cv2.line(mask_hi, (x0, y1), (x1, y1), 255, thickness=th_hi, lineType=cv2.LINE_AA)
        cv2.line(mask_hi, (x0, y0), (x0, y1), 255, thickness=tv_hi, lineType=cv2.LINE_AA)
        cv2.line(mask_hi, (x1, y0), (x1, y1), 255, thickness=tv_hi, lineType=cv2.LINE_AA)

    mask_soft = cv2.resize(mask_hi, (w, h), interpolation=cv2.INTER_AREA)
    _, mask = cv2.threshold(mask_soft, bin_thresh, 255, cv2.THRESH_BINARY)
    return mask

def build_box_mask_from_contours(image_shape, contours,
                                 horiz_thickness_float=LINE_THICKNESS_H,
                                 vert_thickness_float=LINE_THICKNESS_V,
                                 supersample=BOX_MASK_SUPERSAMPLE,
                                 bin_thresh=BOX_MASK_BIN_THRESH):
    h, w = image_shape[:2]
    avg_thickness = max(1.0, 0.5 * (float(horiz_thickness_float) + float(vert_thickness_float)))

    if supersample <= 1:
        mask = np.zeros((h, w), dtype=np.uint8)
        th = max(1, int(round(avg_thickness)))
        for cnt in contours:
            rect = cv2.minAreaRect(cnt)
            box_pts = cv2.boxPoints(rect)
            box_pts = np.int32(np.round(box_pts))
            cv2.drawContours(mask, [box_pts], -1, 255, thickness=th, lineType=cv2.LINE_AA)
        return mask

    hs, ws = h * supersample, w * supersample
    mask_hi = np.zeros((hs, ws), dtype=np.uint8)
    th_hi = max(1, int(round(avg_thickness * supersample)))

    for cnt in contours:
        rect = cv2.minAreaRect(cnt)
        box_pts = cv2.boxPoints(rect)
        box_pts_hi = np.int32(np.round(box_pts * supersample))
        cv2.drawContours(mask_hi, [box_pts_hi], -1, 255, thickness=th_hi, lineType=cv2.LINE_AA)

    mask_soft = cv2.resize(mask_hi, (w, h), interpolation=cv2.INTER_AREA)
    _, mask = cv2.threshold(mask_soft, bin_thresh, 255, cv2.THRESH_BINARY)
    return mask

def get_dot_mask_by_dilation_thinning(image_bgr,
                                      threshold=SMALL_OBJ_THRESH,
                                      ksize=THIN_DILATE_KSIZE,
                                      iterations=THIN_DILATE_ITERS,
                                      max_area=THIN_DOT_MAX_AREA,
                                      max_len=THIN_DOT_MAX_LEN):
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    _, bw = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)

    ksize = max(1, int(ksize))
    if ksize % 2 == 0:
        ksize += 1

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ksize, ksize))
    bg_dilated = cv2.dilate(bw, kernel, iterations=max(1, int(iterations)))
    thin_raw = np.where((bw == 0) & (bg_dilated == 255), 255, 0).astype(np.uint8)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(thin_raw, connectivity=8)
    keep = np.zeros(num_labels, dtype=np.uint8)

    for label in range(1, num_labels):
        x, y, w, h, area = stats[label]
        if area <= max_area and max(w, h) <= max_len:
            keep[label] = 255

    dot_mask = keep[labels]
    removed = int(np.count_nonzero(keep))
    return dot_mask, thin_raw, removed

def get_small_object_mask(image_bgr,
                          threshold=SMALL_OBJ_THRESH,
                          max_area=SMALL_OBJ_MAX_AREA,
                          max_len=SMALL_OBJ_MAX_LEN):
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    _, bw = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY_INV)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(bw, connectivity=8)

    areas = stats[:, cv2.CC_STAT_AREA]
    widths = stats[:, cv2.CC_STAT_WIDTH]
    heights = stats[:, cv2.CC_STAT_HEIGHT]
    max_dims = np.maximum(widths, heights)

    selected = (areas <= max_area) & (max_dims <= max_len)
    selected[0] = False
    selected_labels = np.flatnonzero(selected)

    lut = np.zeros(num_labels, dtype=np.uint8)
    lut[selected_labels] = 255
    small_mask = lut[labels]

    removed = int(selected_labels.size)
    mask_pixels = int(np.count_nonzero(small_mask))
    mask_coverage = mask_pixels / float(small_mask.size)

    return small_mask, removed, mask_coverage

def get_small_axis_line_mask_morph(image_bgr,
                                   threshold=MORPH_LINE_THRESH,
                                   min_len=MORPH_LINE_MIN_LEN,
                                   max_len=MORPH_LINE_MAX_LEN,
                                   max_thick=MORPH_LINE_MAX_THICK):
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _, bw = cv2.threshold(blur, threshold, 255, cv2.THRESH_BINARY_INV)

    h_min_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (min_len, 1))
    v_min_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, min_len))

    horiz = cv2.morphologyEx(bw, cv2.MORPH_OPEN, h_min_kernel)
    vert = cv2.morphologyEx(bw, cv2.MORPH_OPEN, v_min_kernel)

    if max_len > min_len:
        h_long_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max_len + 1, 1))
        v_long_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max_len + 1))
        horiz_long = cv2.morphologyEx(bw, cv2.MORPH_OPEN, h_long_kernel)
        vert_long = cv2.morphologyEx(bw, cv2.MORPH_OPEN, v_long_kernel)
        horiz = cv2.subtract(horiz, horiz_long)
        vert = cv2.subtract(vert, vert_long)

    raw_mask = cv2.bitwise_or(horiz, vert)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(raw_mask, connectivity=8)

    widths = stats[:, cv2.CC_STAT_WIDTH]
    heights = stats[:, cv2.CC_STAT_HEIGHT]

    horiz_like = (heights <= max_thick) & (widths >= min_len) & (widths <= (max_len + max_thick * 2))
    vert_like = (widths <= max_thick) & (heights >= min_len) & (heights <= (max_len + max_thick * 2))
    selected = horiz_like | vert_like
    selected[0] = False
    selected_labels = np.flatnonzero(selected)

    lut = np.zeros(num_labels, dtype=np.uint8)
    lut[selected_labels] = 255
    small_line_mask = lut[labels]

    return small_line_mask, horiz, vert

def get_isolated_axis_line_mask_morph(image_bgr,
                                      threshold=MORPH_LINE_THRESH,
                                      min_len=ISO_LINE_MIN_LEN,
                                      max_len=ISO_LINE_MAX_LEN,
                                      max_thick=ISO_LINE_MAX_THICK,
                                      neighbor_radius=ISO_NEIGHBOR_RADIUS):
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _, bw = cv2.threshold(blur, threshold, 255, cv2.THRESH_BINARY_INV)

    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (min_len, 1))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, min_len))
    horiz = cv2.morphologyEx(bw, cv2.MORPH_OPEN, h_kernel)
    vert = cv2.morphologyEx(bw, cv2.MORPH_OPEN, v_kernel)

    if max_len > min_len:
        h_long = cv2.getStructuringElement(cv2.MORPH_RECT, (max_len + 1, 1))
        v_long = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max_len + 1))
        horiz = cv2.subtract(horiz, cv2.morphologyEx(bw, cv2.MORPH_OPEN, h_long))
        vert = cv2.subtract(vert, cv2.morphologyEx(bw, cv2.MORPH_OPEN, v_long))

    candidate = cv2.bitwise_or(horiz, vert)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(candidate, connectivity=8)

    widths = stats[:, cv2.CC_STAT_WIDTH]
    heights = stats[:, cv2.CC_STAT_HEIGHT]
    line_like = ((heights <= max_thick) & (widths >= min_len)) | ((widths <= max_thick) & (heights >= min_len))
    line_like[0] = False
    keep = np.zeros(num_labels, dtype=np.uint8)
    keep[np.flatnonzero(line_like)] = 255
    line_mask = keep[labels]

    num_line_labels, line_labels, line_stats, _ = cv2.connectedComponentsWithStats(line_mask, connectivity=8)
    
    if num_line_labels <= 1:
        return np.zeros_like(line_mask), line_mask, candidate, 0

    fg = bw > 0
    fg_minus_lines = fg & (line_mask == 0)

    neigh = max(1, int(neighbor_radius))
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (2 * neigh + 1, 2 * neigh + 1))

    near_fg = cv2.dilate((fg_minus_lines.astype(np.uint8) * 255), k, iterations=1) > 0
    touched_pixels = near_fg & (line_labels > 0)
    touched_labels = np.unique(line_labels[touched_pixels])

    isolated_lut = np.ones(num_line_labels, dtype=np.uint8)
    isolated_lut[0] = 0
    isolated_lut[touched_labels] = 0

    iso_mask = (isolated_lut[line_labels] * 255).astype(np.uint8)
    isolated_count = int(np.count_nonzero(isolated_lut[1:]))

    return iso_mask, line_mask, candidate, isolated_count

def save_comparison_image(original_bgr, cleaned_bgr, out_path):
    if original_bgr.shape[:2] != cleaned_bgr.shape[:2]:
        cleaned_bgr = cv2.resize(cleaned_bgr, (original_bgr.shape[1], original_bgr.shape[0]), interpolation=cv2.INTER_LINEAR)
    diff = cv2.absdiff(original_bgr, cleaned_bgr)
    diff_gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    diff_vis = cv2.applyColorMap(diff_gray, cv2.COLORMAP_JET)
    comparison = cv2.hconcat([original_bgr, cleaned_bgr, diff_vis])
    cv2.imwrite(str(out_path), comparison)

def preprocess_keep_black_drop_blue(image_bgr,
                                    black_thresh=KEEP_BLACK_THRESH,
                                    blue_h_low=DROP_BLUE_H_LOW,
                                    blue_h_high=DROP_BLUE_H_HIGH,
                                    blue_s_min=DROP_BLUE_S_MIN,
                                    blue_v_min=DROP_BLUE_V_MIN):
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    black_mask = gray <= int(black_thresh)

    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    red_mask = (
        (cv2.inRange(hsv, np.array([0, 45, 35], dtype=np.uint8), np.array([12, 255, 255], dtype=np.uint8)) > 0)
        | (cv2.inRange(hsv, np.array([165, 45, 35], dtype=np.uint8), np.array([180, 255, 255], dtype=np.uint8)) > 0)
    )
    green_mask = cv2.inRange(
        hsv,
        np.array([35, 45, 35], dtype=np.uint8),
        np.array([95, 255, 255], dtype=np.uint8),
    ) > 0
    blue_mask = cv2.inRange(
        hsv,
        np.array([blue_h_low, blue_s_min, blue_v_min], dtype=np.uint8),
        np.array([blue_h_high, 255, 255], dtype=np.uint8),
    ) > 0

    keep_mask = (black_mask | red_mask | green_mask) & (~blue_mask)

    out = np.full_like(image_bgr, 255)
    out[keep_mask] = image_bgr[keep_mask]

    return out, (black_mask.astype(np.uint8) * 255), (blue_mask.astype(np.uint8) * 255), (keep_mask.astype(np.uint8) * 255)

def build_grid_line_mask(image_bgr):
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    _, gray_inv = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY_INV)
    h, w = gray.shape[:2]
    h_lines = cv2.morphologyEx(
        gray_inv,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (max(20, w // 15), 1)),
    )
    v_lines = cv2.morphologyEx(
        gray_inv,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(20, h // 15))),
    )
    grid_mask = cv2.add(h_lines, v_lines)
    _, grid_mask_bin = cv2.threshold(grid_mask, 10, 255, cv2.THRESH_BINARY)
    return grid_mask_bin

def inpaint_grid_intersections(bgr_image, grid_mask):
    """
    Reconstruct thin curve fragments across removed grid-line locations.
    Uses an adaptive radius based on grid thickness.
    """
    if grid_mask is None or np.count_nonzero(grid_mask) == 0:
        return bgr_image

    dist = cv2.distanceTransform(grid_mask, cv2.DIST_L2, 3)
    if dist.max() > 0:
        radius = int(np.percentile(dist[dist > 0], 80) * 1.5) + 2
        radius = max(4, min(radius, 10))
    else:
        radius = 5

    print(f"[boxRemoval] inpaint radius = {radius}")

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    dilated_mask = cv2.dilate(grid_mask, kernel, iterations=1)
    inpainted = cv2.inpaint(bgr_image, dilated_mask, radius, cv2.INPAINT_TELEA)

    gray = cv2.cvtColor(inpainted, cv2.COLOR_BGR2GRAY)
    _, bin_img = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 1))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 5))
    closed_h = cv2.morphologyEx(bin_img, cv2.MORPH_CLOSE, h_kernel, iterations=1)
    closed_v = cv2.morphologyEx(bin_img, cv2.MORPH_CLOSE, v_kernel, iterations=1)
    merged = cv2.bitwise_or(closed_h, closed_v)
    gap_region = cv2.bitwise_and(merged, dilated_mask)

    result = inpainted.copy()
    result[gap_region > 0] = 0
    return result

def process_one_image(image_input, output_root=None, image_name=None):
    is_array_input = isinstance(image_input, np.ndarray)

    if is_array_input:
        img = image_input.copy()
        safe_name = str(image_name or 'image')
    else:
        image_path = Path(image_input)
        img = cv2.imread(str(image_path))
        if img is None:
            print(f'Skipping unreadable image: {image_path}')
            return None
        safe_name = str(image_name or image_path.stem)

    image_out_dir = None
    if output_root is not None:
        output_root = Path(output_root)
        image_out_dir = output_root / safe_name
        image_out_dir.mkdir(parents=True, exist_ok=True)

    step0_img, step0_black_mask, step0_blue_mask, step0_keep_mask = preprocess_keep_black_drop_blue(img)
    if image_out_dir is not None:
        cv2.imwrite(str(image_out_dir / 'step0_black_only.png'), step0_img)
        cv2.imwrite(str(image_out_dir / 'step0_black_mask.png'), step0_black_mask)
        cv2.imwrite(str(image_out_dir / 'step0_blue_mask.png'), step0_blue_mask)
        cv2.imwrite(str(image_out_dir / 'step0_keep_mask.png'), step0_keep_mask)

    black_px = int(np.count_nonzero(step0_black_mask))
    blue_px = int(np.count_nonzero(step0_blue_mask))
    keep_px = int(np.count_nonzero(step0_keep_mask))
    print(f'[{safe_name}] Step0 keep-black/drop-blue -> black_px: {black_px}, blue_px: {blue_px}, kept_px: {keep_px}')

    gray = cv2.cvtColor(step0_img, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, BOX_CONTOUR_THRESH, 255, cv2.THRESH_BINARY_INV)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    morph = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=3)
    contours, _ = cv2.findContours(morph, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

    all_boxes, all_cnts = [], []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        if w > 5 and h > 5:
            all_boxes.append((x, y, w, h))
            all_cnts.append(cnt)

    parallel_boxes = [b for b, c in zip(all_boxes, all_cnts) if is_parallel_box(c)]
    boxes_for_mask = all_boxes
    print(f'[{safe_name}] All boxes             : {len(all_boxes)}')
    print(f'[{safe_name}] Parallel boxes (debug): {len(parallel_boxes)}')
    print(f'[{safe_name}] Boxes used for mask   : {len(boxes_for_mask)}')

    if AUTO_BOX_THICKNESS:
        auto_th_h, auto_th_v = estimate_box_line_thickness(step0_img)
        print(f'[{safe_name}] Auto box line thickness -> H: {auto_th_h:.2f}, V: {auto_th_v:.2f}')

    else:
        auto_th_h, auto_th_v = LINE_THICKNESS_H, LINE_THICKNESS_V

    if USE_CONTOUR_OUTLINE_MASK:
        box_mask = build_box_mask_from_contours(
            step0_img.shape,
            all_cnts,
            horiz_thickness_float=auto_th_h,
            vert_thickness_float=auto_th_v,
        )
        print(f'[{safe_name}] Box mask mode: contour-outline')

    else:
        box_mask = build_box_mask(
            step0_img.shape,
            boxes_for_mask,
            horiz_thickness_float=auto_th_h,
            vert_thickness_float=auto_th_v,
        )
        print(f'[{safe_name}] Box mask mode: axis-aligned-rect')

    if image_out_dir is not None:
        cv2.imwrite(str(image_out_dir / 'step1_box_mask.png'), box_mask)

    after_boxes = cv2.inpaint(step0_img, box_mask, inpaintRadius=4, flags=cv2.INPAINT_TELEA)
    if image_out_dir is not None:
        cv2.imwrite(str(image_out_dir / 'step2_after_boxes.png'), after_boxes)
    print(f'[{safe_name}] Box borders inpainted')

    thin_dot_mask, thin_raw_mask, thin_dot_count = get_dot_mask_by_dilation_thinning(after_boxes)
    if image_out_dir is not None:
        cv2.imwrite(str(image_out_dir / 'step2b_thin_raw_mask.png'), thin_raw_mask)
        cv2.imwrite(str(image_out_dir / 'step2b_thin_dot_mask.png'), thin_dot_mask)

    after_thin = after_boxes.copy()
    after_thin[thin_dot_mask > 0] = 255
    if image_out_dir is not None:
        cv2.imwrite(str(image_out_dir / 'step2c_after_thinning.png'), after_thin)
    print(f'[{safe_name}] Thinning-dot components removed: {thin_dot_count}')

    small_obj_mask, removed_count, _ = get_small_object_mask(after_thin)
    if image_out_dir is not None:
        cv2.imwrite(str(image_out_dir / 'step3_small_object_mask.png'), small_obj_mask)
    print(f'[{safe_name}] Small object components removed: {removed_count}')

    small_line_mask, horiz_dbg, vert_dbg = get_small_axis_line_mask_morph(after_thin)
    if image_out_dir is not None:
        cv2.imwrite(str(image_out_dir / 'step3_small_line_mask.png'), small_line_mask)
        cv2.imwrite(str(image_out_dir / 'step3_horiz_candidates.png'), horiz_dbg)
        cv2.imwrite(str(image_out_dir / 'step3_vert_candidates.png'), vert_dbg)
    print(f'[{safe_name}] Small line components removed: {removed_count}')

    iso_line_mask, line_mask_dbg, iso_candidates_dbg, iso_count = get_isolated_axis_line_mask_morph(after_thin)
    if image_out_dir is not None:
        cv2.imwrite(str(image_out_dir / 'step3_iso_line_candidates.png'), iso_candidates_dbg)
        cv2.imwrite(str(image_out_dir / 'step3_iso_line_filtered.png'), line_mask_dbg)
        cv2.imwrite(str(image_out_dir / 'step3_isolated_line_mask.png'), iso_line_mask)
    print(f'[{safe_name}] Isolated line components removed: {iso_count}')

    combined_mask = cv2.bitwise_or(small_obj_mask, small_line_mask)
    combined_mask = cv2.bitwise_or(combined_mask, iso_line_mask)
    if image_out_dir is not None:
        cv2.imwrite(str(image_out_dir / 'step3_combined_cleanup_mask.png'), combined_mask)

    num_cleanup_labels, _, _, _ = cv2.connectedComponentsWithStats(combined_mask, connectivity=8)
    combined_count = max(0, int(num_cleanup_labels) - 1)
    combined_coverage = float(np.count_nonzero(combined_mask)) / float(combined_mask.size)
    print(f'[{safe_name}] Combined cleanup components: {combined_count}, coverage: {combined_coverage:.3f}')

    if combined_count == 0:
        result = after_thin.copy()
    elif combined_count > SMALL_OBJ_MAX_LABELS or combined_coverage > SMALL_OBJ_MAX_COVERAGE:
        result = after_thin.copy()
        result[combined_mask > 0] = 255
        print(f'[{safe_name}] Step 3 used fast fill (mask too dense for inpaint)')

    else:
        result = cv2.inpaint(after_thin, combined_mask, SMALL_OBJ_INPAINT_R, cv2.INPAINT_TELEA)

    if RECONSTRUCT_GRID_INTERSECTIONS:
        grid_mask = cv2.bitwise_or(build_grid_line_mask(step0_img), box_mask)
        result = inpaint_grid_intersections(result, grid_mask)

    if image_out_dir is not None:
        cv2.imwrite(str(image_out_dir / 'step4_after_small_object_removal.png'), result)
        final_path = image_out_dir / 'result_clean.png'
        cv2.imwrite(str(final_path), result)
        save_comparison_image(step0_img, result, image_out_dir / 'comparison_before_after_diff.png')
        print(f'[{safe_name}] Saved: {final_path}')

    return result

def run_batch(input_dir=INPUT_DIR, output_dir=OUTPUT_DIR):
    output_dir.mkdir(parents=True, exist_ok=True)
    exts = {'.tif', '.tiff', '.png', '.jpg', '.jpeg', '.bmp', '.webp'}
    image_paths = sorted([p for p in input_dir.iterdir() if p.is_file() and p.suffix.lower() in exts])

    if not image_paths:
        print(f'No input images found in: {input_dir}')
        return

    print(f'Found {len(image_paths)} images in {input_dir}')
    for image_path in image_paths:
        process_one_image(image_path, output_dir)


if __name__ == '__main__':
    run_batch()

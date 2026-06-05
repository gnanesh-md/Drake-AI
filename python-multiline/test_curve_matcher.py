#!/usr/bin/env python3
"""
Quick test script for the Curve-to-Value Matcher
Run this to validate the matching system with a sample graph image
"""

import cv2
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from curve_value_matcher import CurveValueMatcher, create_curve_info, AxisLabel
from main import get_ocr_reader


def test_matcher_with_image(image_path: str):
    """
    Test the curve-value matcher with a real graph image
    
    Usage:
        python test_curve_matcher.py path/to/graph.png
    """
    
    print(f"\n{'='*70}")
    print("CURVE-VALUE MATCHER TEST")
    print(f"{'='*70}\n")
    
    # Load image
    img_bgr = cv2.imread(image_path)
    if img_bgr is None:
        print(f"❌ ERROR: Could not load image: {image_path}")
        return False
    
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    h, w = img_rgb.shape[:2]
    
    print(f"✓ Image loaded: {w}x{h} pixels")
    print(f"  Path: {image_path}\n")
    
    # Initialize matcher
    matcher = CurveValueMatcher((h, w))
    print("✓ CurveValueMatcher initialized\n")
    
    # Run OCR
    print("Running EasyOCR...")
    try:
        reader = get_ocr_reader()
        ocr_results = reader.readtext(img_rgb)
        print(f"✓ OCR completed: {len(ocr_results)} text regions detected\n")
    except Exception as e:
        print(f"❌ OCR failed: {e}")
        return False
    
    # Extract axis labels
    print("Extracting axis labels...")
    x_labels = matcher.extract_x_axis_labels(img_rgb, ocr_results)
    y_labels = matcher.extract_y_axis_labels(img_rgb, ocr_results)
    
    print(f"✓ X-axis labels: {len(x_labels)}")
    for i, label in enumerate(x_labels[:5]):  # Show first 5
        print(f"    {i+1}. Value={label.value:8.2f} | Conf={label.confidence:.2f} | Pos={label.position}")
    if len(x_labels) > 5:
        print(f"    ... and {len(x_labels)-5} more")
    
    print(f"\n✓ Y-axis labels: {len(y_labels)}")
    for i, label in enumerate(y_labels[:5]):  # Show first 5
        print(f"    {i+1}. Value={label.value:8.2f} | Conf={label.confidence:.2f} | Pos={label.position}")
    if len(y_labels) > 5:
        print(f"    ... and {len(y_labels)-5} more")
    
    # Infer axis ranges
    print(f"\n{'─'*70}")
    print("Inferring axis ranges...")
    
    if x_labels:
        x_min, x_max = matcher.infer_axis_ranges(
            x_labels,
            0,  # left pixel
            w,  # right pixel
            axis_type="x"
        )
        print(f"✓ X-axis range: {x_min:.2f} → {x_max:.2f}")
    else:
        print(f"⚠ No X-axis labels found (will use default range)")
        x_min, x_max = matcher.infer_axis_ranges([], 0, w, "x")
    
    if y_labels:
        y_min, y_max = matcher.infer_axis_ranges(
            y_labels,
            0,  # top pixel
            h,  # bottom pixel
            axis_type="y"
        )
        print(f"✓ Y-axis range: {y_min:.2f} → {y_max:.2f}")
    else:
        print(f"⚠ No Y-axis labels found (will use default range)")
        y_min, y_max = matcher.infer_axis_ranges([], 0, h, "y")
    
    # Demonstrate curve matching
    print(f"\n{'─'*70}")
    print("Example: Matching sample curves...\n")
    
    # Create sample curves (in a real scenario, these come from detection)
    sample_curves = [
        create_curve_info(0, [(100, 200), (200, 250), (300, 150)]),  # Curve 1
        create_curve_info(1, [(350, 300), (450, 200), (550, 250)]),  # Curve 2
    ]
    
    print(f"Created {len(sample_curves)} sample curves for matching demo\n")
    
    # Match curves
    graph_bounds = {
        "left": 50,
        "right": w - 50,
        "top": 50,
        "bottom": h - 50
    }
    
    matched = matcher.match_curves_to_values(
        sample_curves,
        x_labels,
        y_labels,
        graph_bounds
    )
    
    for curve in matched:
        print(f"Curve {curve.curve_id}:")
        print(f"  Points: {len(curve.points)}")
        print(f"  Bounds: L={curve.bounds['left']} R={curve.bounds['right']} " +
              f"T={curve.bounds['top']} B={curve.bounds['bottom']}")
        if curve.x_range:
            print(f"  X-Range: {curve.x_range[0]:.2f} → {curve.x_range[1]:.2f}")
        if curve.y_range:
            print(f"  Y-Range: {curve.y_range[0]:.2f} → {curve.y_range[1]:.2f}")
        print()
    
    # Color detection
    print(f"{'─'*70}")
    print("Detecting curve colors...\n")
    
    colored_curves = matcher.detect_curve_colors(img_rgb, matched)
    for curve in colored_curves:
        if curve.color:
            print(f"Curve {curve.curve_id}: RGB{curve.color}")
        else:
            print(f"Curve {curve.curve_id}: Color detection failed")
    
    # Summary
    print(f"\n{'='*70}")
    print("SUMMARY")
    print(f"{'='*70}\n")
    print(matcher.generate_summary(matched))
    
    print(f"\n✅ TEST COMPLETED SUCCESSFULLY\n")
    return True


def test_label_extraction():
    """Test axis label detection on a dummy image"""
    
    print(f"\n{'='*70}")
    print("AXIS LABEL EXTRACTION TEST (Dummy Image)")
    print(f"{'='*70}\n")
    
    # Create a dummy test image with text
    import numpy as np
    
    img = np.ones((400, 600, 3), dtype=np.uint8) * 255
    
    # Write test text
    cv2.putText(img, "0", (50, 380), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    cv2.putText(img, "50", (250, 380), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    cv2.putText(img, "100", (500, 380), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    
    cv2.putText(img, "1000", (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    cv2.putText(img, "2000", (10, 200), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    cv2.putText(img, "3000", (10, 350), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    
    print("Created dummy image with test labels")
    print("  X-axis (bottom): 0, 50, 100")
    print("  Y-axis (left): 1000, 2000, 3000\n")
    
    # Test matcher
    h, w = img.shape[:2]
    matcher = CurveValueMatcher((h, w))
    
    reader = get_ocr_reader()
    ocr_results = reader.readtext(img)
    
    x_labels = matcher.extract_x_axis_labels(img, ocr_results)
    y_labels = matcher.extract_y_axis_labels(img, ocr_results)
    
    print(f"✓ Extracted {len(x_labels)} X-axis labels:")
    for label in x_labels:
        print(f"    {label.text:6s} | Value={label.value:6.1f} | Confidence={label.confidence:.2f}")
    
    print(f"\n✓ Extracted {len(y_labels)} Y-axis labels:")
    for label in y_labels:
        print(f"    {label.text:6s} | Value={label.value:6.1f} | Confidence={label.confidence:.2f}")
    
    print(f"\n✅ LABEL EXTRACTION TEST COMPLETED\n")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Test with provided image
        image_path = sys.argv[1]
        success = test_matcher_with_image(image_path)
        sys.exit(0 if success else 1)
    else:
        # Run dummy test
        print("Usage: python test_curve_matcher.py <path_to_graph_image>")
        print("\nRunning dummy label extraction test instead...\n")
        test_label_extraction()

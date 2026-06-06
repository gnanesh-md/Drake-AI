"""
Advanced curve-to-value matcher for multi-curve graphs.
Automatically detects and matches curve data with their corresponding axis values.
"""

import cv2
import numpy as np
from typing import List, Dict, Tuple, Optional
import re
from dataclasses import dataclass


@dataclass
class CurveInfo:
    """Information about a detected curve"""
    curve_id: int
    points: List[Tuple[int, int]]  # (x, y) pixel coordinates
    bounds: Dict[str, int]  # {"left": x1, "right": x2, "top": y1, "bottom": y2}
    color: Optional[Tuple[int, int, int]] = None
    x_range: Optional[Tuple[float, float]] = None  # (min_value, max_value)
    y_range: Optional[Tuple[float, float]] = None  # (top_value, bottom_value)
    label: Optional[str] = None


@dataclass
class AxisLabel:
    """OCR-detected axis label/value"""
    text: str
    value: float
    position: Tuple[int, int]  # (x, y) center pixel
    confidence: float
    bbox: List[List[int]]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
    axis_type: str  # "x" or "y"


class CurveValueMatcher:
    """
    Intelligently matches detected curves with their corresponding axis values.
    """

    def __init__(self, image_shape: Tuple[int, int], margin: int = 50):
        """
        Initialize the matcher.
        
        Args:
            image_shape: (height, width) of the graph image
            margin: pixel margin to search for labels around graph bounds
        """
        self.height, self.width = image_shape
        self.margin = margin

    def extract_x_axis_labels(
        self, 
        graph_image: np.ndarray,
        ocr_results: List[Tuple[List[List[int]], str, float]],
        bottom_margin: int = 100
    ) -> List[AxisLabel]:
        """
        Extract X-axis labels from OCR results.
        Identifies numeric values in the bottom region of the graph.
        
        Args:
            graph_image: Image array (H, W, 3)
            ocr_results: List of tuples (bbox, text, confidence) from EasyOCR
            bottom_margin: Pixel distance from bottom where X-axis labels appear
            
        Returns:
            List of AxisLabel objects for X-axis
        """
        h, w = graph_image.shape[:2]
        x_labels = []
        
        for bbox, text, confidence in ocr_results:
            # Clean text
            cleaned = text.strip().replace(',', '').replace(' ', '')
            
            # Check if numeric
            if not re.match(r'^-?\d+\.?\d*([eE]-?\d+)?$', cleaned):
                continue
            
            # Compute center
            xs = [pt[0] for pt in bbox]
            ys = [pt[1] for pt in bbox]
            cx, cy = int(sum(xs) / len(xs)), int(sum(ys) / len(ys))
            
            # Filter for bottom region (X-axis labels)
            if cy > (h - bottom_margin):
                try:
                    x_labels.append(AxisLabel(
                        text=cleaned,
                        value=float(cleaned),
                        position=(cx, cy),
                        confidence=round(float(confidence), 3),
                        bbox=[[int(pt[0]), int(pt[1])] for pt in bbox],
                        axis_type="x"
                    ))
                except ValueError:
                    continue
        
        # Sort by X position (left to right)
        x_labels.sort(key=lambda l: l.position[0])
        return x_labels

    def extract_y_axis_labels(
        self,
        graph_image: np.ndarray,
        ocr_results: List[Tuple[List[List[int]], str, float]],
        left_margin: int = 100
    ) -> List[AxisLabel]:
        """
        Extract Y-axis labels (depth values).
        
        Args:
            graph_image: Image array (H, W, 3)
            ocr_results: List of tuples (bbox, text, confidence) from EasyOCR
            left_margin: Pixel distance from left where Y-axis labels appear
            
        Returns:
            List of AxisLabel objects for Y-axis
        """
        h, w = graph_image.shape[:2]
        y_labels = []
        
        for bbox, text, confidence in ocr_results:
            cleaned = text.strip().replace(',', '').replace(' ', '')
            
            if not re.match(r'^-?\d+\.?\d*([eE]-?\d+)?$', cleaned):
                continue
            
            xs = [pt[0] for pt in bbox]
            ys = [pt[1] for pt in bbox]
            cx, cy = int(sum(xs) / len(xs)), int(sum(ys) / len(ys))
            
            # Filter for left region (Y-axis labels)
            if cx < left_margin:
                try:
                    y_labels.append(AxisLabel(
                        text=cleaned,
                        value=float(cleaned),
                        position=(cx, cy),
                        confidence=round(float(confidence), 3),
                        bbox=[[int(pt[0]), int(pt[1])] for pt in bbox],
                        axis_type="y"
                    ))
                except ValueError:
                    continue
        
        # Sort by Y position (top to bottom)
        y_labels.sort(key=lambda l: l.position[1])
        return y_labels

    def infer_axis_ranges(
        self,
        labels: List[AxisLabel],
        pixel_min: int,
        pixel_max: int,
        axis_type: str = "x"
    ) -> Tuple[float, float]:
        """
        Infer min/max physical values from detected labels and pixel bounds.
        
        Args:
            labels: List of AxisLabel objects
            pixel_min: Minimum pixel coordinate (left for X, top for Y)
            pixel_max: Maximum pixel coordinate (right for X, bottom for Y)
            axis_type: "x" or "y"
            
        Returns:
            Tuple of (min_value, max_value)
        """
        if len(labels) < 2:
            # Not enough labels to infer - return generic range
            return (0.0, 100.0)
        
        # Use first and last labels to establish mapping
        first_label = labels[0]
        last_label = labels[-1]
        
        if axis_type == "x":
            pixel_pos_first = first_label.position[0]
            pixel_pos_last = last_label.position[0]
        else:  # "y"
            pixel_pos_first = first_label.position[1]
            pixel_pos_last = last_label.position[1]
        
        value_first = first_label.value
        value_last = last_label.value
        
        # Linear interpolation to estimate min/max values at pixel bounds
        if pixel_pos_last != pixel_pos_first:
            slope = (value_last - value_first) / (pixel_pos_last - pixel_pos_first)
            
            # Extrapolate to pixel bounds
            min_value = value_first + slope * (pixel_min - pixel_pos_first)
            max_value = value_first + slope * (pixel_max - pixel_pos_first)
            
            # Ensure min < max
            if min_value > max_value:
                min_value, max_value = max_value, min_value
            
            return (float(round(min_value, 3)), float(round(max_value, 3)))
            
        return (float(value_first), float(value_last))

    def match_curves_to_values(
        self,
        curves: List[CurveInfo],
        x_labels: List[AxisLabel],
        y_labels: List[AxisLabel],
        graph_bounds: Dict[str, int]  # {"left": x1, "right": x2, "top": y1, "bottom": y2}
    ) -> List[CurveInfo]:
        """
        Match detected curves to their corresponding axis value ranges.
        
        Args:
            curves: List of detected CurveInfo objects
            x_labels: List of X-axis AxisLabel objects
            y_labels: List of Y-axis AxisLabel objects
            graph_bounds: Pixel bounds of the graph area
            
        Returns:
            List of CurveInfo objects with populated x_range and y_range
        """
        matched_curves = []
        
        # Infer global Y-axis range from depth labels
        global_y_min, global_y_max = self.infer_axis_ranges(
            y_labels,
            graph_bounds["top"],
            graph_bounds["bottom"],
            axis_type="y"
        )
        
        for curve in curves:
            matched_curve = curve
            
            # All curves share the same Y-axis (depth axis)
            matched_curve.y_range = (global_y_min, global_y_max)
            
            # Try to infer X-axis range for this specific curve
            # Look at curve bounds and find corresponding labels
            curve_x_labels = self._find_labels_for_curve(
                x_labels,
                curve.bounds,
                graph_bounds
            )
            
            if curve_x_labels:
                # Use labels specific to this curve
                x_min, x_max = self.infer_axis_ranges(
                    curve_x_labels,
                    curve.bounds["left"],
                    curve.bounds["right"],
                    axis_type="x"
                )
                matched_curve.x_range = (x_min, x_max)
            else:
                # Fall back to global X-axis range
                x_min, x_max = self.infer_axis_ranges(
                    x_labels,
                    graph_bounds["left"],
                    graph_bounds["right"],
                    axis_type="x"
                )
                matched_curve.x_range = (x_min, x_max)
            
            matched_curves.append(matched_curve)
        
        return matched_curves

    def _find_labels_for_curve(
        self,
        labels: List[AxisLabel],
        curve_bounds: Dict[str, int],
        graph_bounds: Dict[str, int],
        x_threshold: int = 150
    ) -> List[AxisLabel]:
        """
        Find labels that are closest to a specific curve.
        
        Args:
            labels: List of axis labels
            curve_bounds: Bounds of the curve
            graph_bounds: Bounds of the entire graph
            x_threshold: Pixel threshold for horizontal proximity
            
        Returns:
            List of relevant labels for this curve
        """
        curve_center_x = (curve_bounds["left"] + curve_bounds["right"]) / 2
        relevant_labels = []
        
        for label in labels:
            # Check if label is horizontally close to curve
            distance_x = abs(label.position[0] - curve_center_x)
            
            if distance_x < x_threshold:
                relevant_labels.append(label)
        
        return relevant_labels

    def detect_curve_colors(
        self,
        graph_image: np.ndarray,
        curves: List[CurveInfo]
    ) -> List[CurveInfo]:
        """
        Detect the color of each curve to help with identification.
        
        Args:
            graph_image: Image array (H, W, 3) in RGB
            curves: List of CurveInfo objects
            
        Returns:
            List of CurveInfo objects with populated color field
        """
        for curve in curves:
            if len(curve.points) == 0:
                continue
            
            # Sample middle point of curve
            mid_idx = len(curve.points) // 2
            x, y = curve.points[mid_idx]
            
            # Get color at that position with some smoothing
            x, y = max(0, min(self.width - 1, x)), max(0, min(self.height - 1, y))
            
            # Sample a small region around the point
            y1, y2 = max(0, y - 2), min(self.height, y + 3)
            x1, x2 = max(0, x - 2), min(self.width, x + 3)
            
            region = graph_image[y1:y2, x1:x2]
            
            if region.size > 0:
                avg_color = tuple(int(region.mean(axis=(0, 1))[i]) for i in range(3))
                curve.color = avg_color
        
        return curves

    def generate_summary(self, curves: List[CurveInfo]) -> str:
        """Generate a human-readable summary of matched curves and values."""
        summary = f"\n{'='*70}\n"
        summary += f"CURVE-TO-VALUE MATCHING SUMMARY ({len(curves)} curves)\n"
        summary += f"{'='*70}\n\n"
        
        for i, curve in enumerate(curves):
            summary += f"Curve {i + 1}:\n"
            if curve.label:
                summary += f"  Label: {curve.label}\n"
            if curve.color:
                summary += f"  Color: RGB{curve.color}\n"
            summary += f"  Points: {len(curve.points)}\n"
            if curve.x_range:
                summary += f"  X-Range (values): {curve.x_range[0]:.2f} → {curve.x_range[1]:.2f}\n"
            if curve.y_range:
                summary += f"  Y-Range (depth): {curve.y_range[0]:.2f} → {curve.y_range[1]:.2f}\n"
            summary += "\n"
        
        return summary


# Helper function to create CurveInfo from graph points
def create_curve_info(
    curve_id: int,
    points: List[Tuple[int, int]]
) -> CurveInfo:
    """Create CurveInfo object with computed bounds."""
    if not points:
        return CurveInfo(
            curve_id=curve_id,
            points=points,
            bounds={"left": 0, "right": 0, "top": 0, "bottom": 0}
        )
    
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    
    return CurveInfo(
        curve_id=curve_id,
        points=points,
        bounds={
            "left": min(xs),
            "right": max(xs),
            "top": min(ys),
            "bottom": max(ys)
        }
    )

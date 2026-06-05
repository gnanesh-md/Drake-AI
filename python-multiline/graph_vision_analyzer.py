"""Local Ollama-based graph understanding and value extraction."""

import io
import json
import os
import re
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

from dotenv import load_dotenv
from PIL import Image, ImageEnhance, ImageOps

try:
    import ollama
except Exception:
    ollama = None

load_dotenv(".env")

DEFAULT_GRAPH_VISION_MODEL = os.getenv("GRAPH_VISION_MODEL") or "qwen2.5vl:32b"
OLLAMA_OPTIONS = {
    "temperature": 0,
    "num_ctx": 8192,
    "num_predict": 4096,
}


@dataclass
class AxisInfo:
    """Axis information extracted from graph"""
    name: str
    label: str
    min_value: float
    max_value: float
    unit: str
    tick_values: List[float]
    tick_labels: List[str]


@dataclass
class DataSeries:
    """Individual data series/curve in graph"""
    name: str
    type: str  # "line", "bar", "scatter", "area", etc.
    color: Optional[str]
    values: List[float]
    labels: List[str]
    points: List[Dict[str, Any]] = field(default_factory=list)
    confidence: str = "medium"


@dataclass
class GraphAnalysis:
    """Complete graph analysis result"""
    graph_type: str  # "line", "bar", "scatter", "multi-line", "histogram", etc.
    title: Optional[str]
    x_axis: AxisInfo
    y_axis: AxisInfo
    series: List[DataSeries]
    legend: Optional[Dict[str, str]]
    summary: str
    raw_response: str


class GraphVisionAnalyzer:
    """
    Uses a local Ollama vision model to intelligently analyze graph images.

    Unlike traditional CV approaches that just detect pixels, this reads
    graphs the way humans do - understanding structure, content, and meaning.
    """

    def __init__(
        self,
        provider: Optional[str] = None,
        model: Optional[str] = None,
    ):
        """Initialize local Ollama graph vision.

        `provider` is accepted only for backward compatibility with the API
        endpoint; the implementation is local-only and never uses API keys.
        """
        if provider and provider.lower() != "ollama":
            raise ValueError("Only local Ollama graph vision is supported; API providers are disabled.")
        if ollama is None:
            raise ImportError("ollama package is not installed")

        self.provider = "ollama"
        self.model = model or DEFAULT_GRAPH_VISION_MODEL

    def analyze_graph_image(self, image_path: str) -> GraphAnalysis:
        """
        Analyze a graph image and extract all structured data.
        
        Args:
            image_path: Path to graph image file
            
        Returns:
            GraphAnalysis object with complete graph understanding
        """
        
        analysis_prompt = self._create_analysis_prompt()
        response_text = self._call_vision_model(image_path, analysis_prompt)

        # Parse response into structured data
        analysis = self._parse_vision_response(response_text)
        analysis.raw_response = response_text

        return analysis

    def _call_vision_model(self, image_path: str, prompt: str) -> str:
        """Call local Ollama vision and return text."""
        image_bytes = self._prepare_image_bytes(image_path)
        response = ollama.chat(
            model=self.model,
            messages=[{
                "role": "user",
                "content": prompt,
                "images": [image_bytes],
            }],
            options=OLLAMA_OPTIONS,
        )
        return self._clean_model_output(response.get("message", {}).get("content", ""))

    def _prepare_image_bytes(self, image_path: str) -> bytes:
        image = ImageOps.exif_transpose(Image.open(image_path)).convert("RGB")
        max_dim = 2560
        width, height = image.size
        if max(width, height) > max_dim:
            scale = max_dim / max(width, height)
            image = image.resize((int(width * scale), int(height * scale)), Image.LANCZOS)

        image = ImageEnhance.Contrast(image).enhance(1.25)
        image = ImageEnhance.Sharpness(image).enhance(1.35)

        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=92)
        return buffer.getvalue()

    def _clean_model_output(self, raw: str) -> str:
        text = raw or ""
        text = re.sub(r"<\|think\|>.*?</\|think\|>", "", text, flags=re.DOTALL)
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
        text = re.sub(r"```(?:json|JSON)?\n?", "", text)
        return text.replace("```", "").strip()

    def _create_analysis_prompt(self) -> str:
        """Create detailed prompt for graph analysis"""
        return """You are an expert at analyzing and understanding graph images. 
        
ANALYZE THIS GRAPH COMPLETELY and provide a detailed JSON response.

For the graph shown, identify and extract:

1. GRAPH TYPE: What kind of graph is this? (line, bar, scatter, histogram, multi-line, pie, etc.)

2. TITLE: What is the title/heading of the graph?

3. X-AXIS (Horizontal Axis):
   - Axis name/label
   - What it represents
   - Min and max values
   - Unit of measurement (if any)
   - All tick values and labels visible on axis
   
4. Y-AXIS (Vertical Axis):
   - Axis name/label
   - What it represents
   - Min and max values
   - Unit of measurement (if any)
   - All tick values and labels visible on axis

5. DATA SERIES (For each curve/line/bar group):
   - Name/label of the series
   - Type (line, bar, area, scatter point, etc.)
   - Color if visible
   - ALL data values shown
   - Data points as x/y pairs when the chart supports it
   - For bar charts, each bar's category label and estimated/read value
   - Labels for each data point if available
   - Confidence in extracted values (high/medium/low)

6. LEGEND: If present, map each label to what it represents

7. DATA SUMMARY: In natural language, what does this graph show? What are the key values and trends?

IMPORTANT RULES:
- Extract ALL numerical values you can see
- Include axis labels, tick values, bar heights, point values
- If you see bar graphs, extract the height/value of EACH bar
- List every axis label and its numerical value
- For line graphs, identify all plotted points and their values as x/y pairs
- For well-log/depth tracks, describe depth axis direction and estimate curve values at visible depth ticks where possible
- Do NOT invent data points. If exact point/bar values cannot be read from the image, use an empty points array and explain the limitation in summary.
- For dense well-log tracks, do not output repeated placeholder points. Only output points if you can visually estimate specific curve values.
- Be precise with numbers - don't round unless the graph shows rounded values
- If you cannot read a value clearly, mark confidence as "low"
- Include ALL curves/lines/bars shown, don't skip any

Return response as valid JSON with this exact structure:
{
  "graph_type": "string",
  "title": "string or null",
  "x_axis": {
    "name": "string",
    "label": "string",
    "min_value": number,
    "max_value": number,
    "unit": "string",
    "tick_values": [numbers],
    "tick_labels": [strings]
  },
  "y_axis": {
    "name": "string",
    "label": "string",
    "min_value": number,
    "max_value": number,
    "unit": "string",
    "tick_values": [numbers],
    "tick_labels": [strings]
  },
  "series": [
    {
      "name": "string",
      "type": "string",
      "color": "string or null",
      "values": [numbers],
      "points": [
        {"x": number or string, "y": number, "label": "string or null", "value": number or null}
      ],
      "labels": [strings],
      "confidence": "high|medium|low"
    }
  ],
  "legend": {"label": "description"} or null,
  "summary": "natural language summary of what the graph shows"
}"""
    
    def _parse_vision_response(self, response_text: str) -> GraphAnalysis:
        """Parse the local vision model response into structured data."""
        
        try:
            # Extract JSON from response
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if not json_match:
                raise ValueError("No JSON found in response")
            
            json_str = json_match.group(0)
            data = json.loads(json_str)
            
            # Parse X-axis
            x_axis_data = data.get("x_axis", {})
            x_axis = AxisInfo(
                name=x_axis_data.get("name", "X"),
                label=x_axis_data.get("label", ""),
                min_value=self._coerce_float(x_axis_data.get("min_value"), 0.0),
                max_value=self._coerce_float(x_axis_data.get("max_value"), 100.0),
                unit=x_axis_data.get("unit", ""),
                tick_values=self._coerce_float_list(x_axis_data.get("tick_values", [])),
                tick_labels=x_axis_data.get("tick_labels", [])
            )
            
            # Parse Y-axis
            y_axis_data = data.get("y_axis", {})
            y_axis = AxisInfo(
                name=y_axis_data.get("name", "Y"),
                label=y_axis_data.get("label", ""),
                min_value=self._coerce_float(y_axis_data.get("min_value"), 0.0),
                max_value=self._coerce_float(y_axis_data.get("max_value"), 100.0),
                unit=y_axis_data.get("unit", ""),
                tick_values=self._coerce_float_list(y_axis_data.get("tick_values", [])),
                tick_labels=y_axis_data.get("tick_labels", [])
            )
            
            # Parse data series
            series_list = []
            for series_data in data.get("series", []):
                series = DataSeries(
                    name=series_data.get("name", "Series"),
                    type=series_data.get("type", "line"),
                    color=series_data.get("color"),
                    values=self._coerce_float_list(series_data.get("values", [])),
                    labels=series_data.get("labels", []),
                    points=self._filter_unusable_points(
                        series_data.get("type", "line"),
                        self._coerce_points(series_data.get("points", [])),
                    ),
                    confidence=series_data.get("confidence", "medium")
                )
                series_list.append(series)
            
            # Create analysis object
            analysis = GraphAnalysis(
                graph_type=data.get("graph_type", "unknown"),
                title=data.get("title"),
                x_axis=x_axis,
                y_axis=y_axis,
                series=series_list,
                legend=data.get("legend"),
                summary=data.get("summary", ""),
                raw_response=""
            )
            
            return analysis
            
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            # Fallback if JSON parsing fails
            print(f"Warning: Could not parse vision response: {e}")
            return self._create_fallback_analysis(response_text)

    def _coerce_float_list(self, values: List[Any]) -> List[float]:
        result = []
        for value in values or []:
            coerced = self._coerce_float(value)
            if coerced is not None:
                result.append(coerced)
        return result

    def _coerce_float(self, value: Any, default: Optional[float] = None) -> Optional[float]:
        if value is None:
            return default
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    def _coerce_points(self, points: List[Any]) -> List[Dict[str, Any]]:
        clean_points = []
        for point in points or []:
            if not isinstance(point, dict):
                continue
            clean_point = {
                "x": point.get("x"),
                "y": point.get("y"),
                "label": point.get("label"),
                "value": point.get("value"),
            }
            for key in ("y", "value"):
                if clean_point[key] is None:
                    continue
                try:
                    clean_point[key] = float(clean_point[key])
                except (TypeError, ValueError):
                    clean_point[key] = None
            clean_points.append(clean_point)
        return clean_points

    def _filter_unusable_points(self, series_type: str, points: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Drop obvious placeholder points from local vision output."""
        if len(points) < 5 or (series_type or "").lower() in {"bar", "histogram"}:
            return points

        numeric_y = [point.get("y") for point in points if isinstance(point.get("y"), (int, float))]
        has_values = any(point.get("value") is not None for point in points)
        has_labels = any(point.get("label") for point in points)
        if not numeric_y or has_values or has_labels:
            return points

        most_common_count = max(numeric_y.count(value) for value in set(numeric_y))
        if most_common_count / len(numeric_y) >= 0.8:
            return []
        return points
    
    def _create_fallback_analysis(self, response_text: str) -> GraphAnalysis:
        """Create a fallback analysis if JSON parsing fails"""
        return GraphAnalysis(
            graph_type="unknown",
            title=None,
            x_axis=AxisInfo("X", "", 0, 100, "", [], []),
            y_axis=AxisInfo("Y", "", 0, 100, "", [], []),
            series=[],
            legend=None,
            summary=response_text[:500],
            raw_response=response_text
        )
    
    def format_analysis_for_api(self, analysis: GraphAnalysis) -> Dict[str, Any]:
        """
        Format analysis for API response.
        
        Returns JSON-serializable dict with all extracted graph data.
        """
        return {
            "graph_type": analysis.graph_type,
            "title": analysis.title,
            "x_axis": {
                "name": analysis.x_axis.name,
                "label": analysis.x_axis.label,
                "min_value": analysis.x_axis.min_value,
                "max_value": analysis.x_axis.max_value,
                "unit": analysis.x_axis.unit,
                "tick_values": analysis.x_axis.tick_values,
                "tick_labels": analysis.x_axis.tick_labels
            },
            "y_axis": {
                "name": analysis.y_axis.name,
                "label": analysis.y_axis.label,
                "min_value": analysis.y_axis.min_value,
                "max_value": analysis.y_axis.max_value,
                "unit": analysis.y_axis.unit,
                "tick_values": analysis.y_axis.tick_values,
                "tick_labels": analysis.y_axis.tick_labels
            },
            "series": [
                {
                    "name": s.name,
                    "type": s.type,
                    "color": s.color,
                    "values": s.values,
                    "points": s.points,
                    "labels": s.labels,
                    "confidence": s.confidence
                }
                for s in analysis.series
            ],
            "legend": analysis.legend,
            "summary": analysis.summary
        }
    
    def print_analysis(self, analysis: GraphAnalysis) -> None:
        """Print analysis in human-readable format"""
        
        print("\n" + "="*70)
        print("GRAPH VISION ANALYSIS")
        print("="*70)
        
        print(f"\nGraph Type: {analysis.graph_type}")
        if analysis.title:
            print(f"Title: {analysis.title}")
        
        print(f"\nX-Axis: {analysis.x_axis.name}")
        print(f"  Label: {analysis.x_axis.label}")
        print(f"  Range: {analysis.x_axis.min_value} to {analysis.x_axis.max_value} {analysis.x_axis.unit}")
        print(f"  Ticks: {list(zip(analysis.x_axis.tick_values, analysis.x_axis.tick_labels))}")
        
        print(f"\nY-Axis: {analysis.y_axis.name}")
        print(f"  Label: {analysis.y_axis.label}")
        print(f"  Range: {analysis.y_axis.min_value} to {analysis.y_axis.max_value} {analysis.y_axis.unit}")
        print(f"  Ticks: {list(zip(analysis.y_axis.tick_values, analysis.y_axis.tick_labels))}")
        
        print(f"\nData Series ({len(analysis.series)}):")
        for i, series in enumerate(analysis.series, 1):
            print(f"\n  {i}. {series.name}")
            print(f"     Type: {series.type}")
            if series.color:
                print(f"     Color: {series.color}")
            print(f"     Values: {series.values}")
            if series.labels:
                print(f"     Labels: {series.labels}")
            print(f"     Confidence: {series.confidence}")
        
        if analysis.legend:
            print(f"\nLegend: {analysis.legend}")
        
        print(f"\nSummary:\n{analysis.summary}")
        print("\n" + "="*70)


def analyze_graph_file(image_path: str, model: Optional[str] = None) -> Dict[str, Any]:
    """
    Convenience function to analyze a graph file and return data as dict.
    
    Args:
        image_path: Path to graph image
        model: Optional local Ollama vision model name
        
    Returns:
        Dict with complete graph analysis
    """
    analyzer = GraphVisionAnalyzer(model=model)
    analysis = analyzer.analyze_graph_image(image_path)
    analyzer.print_analysis(analysis)
    return analyzer.format_analysis_for_api(analysis)


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python graph_vision_analyzer.py <image_path>")
        print("Example: python graph_vision_analyzer.py my_graph.png")
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    if not Path(image_path).exists():
        print(f"Error: File not found: {image_path}")
        sys.exit(1)
    
    # Analyze and print results
    analyze_graph_file(image_path)

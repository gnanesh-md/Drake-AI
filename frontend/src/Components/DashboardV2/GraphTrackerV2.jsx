import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import GraphLoadingSpinner from './GraphLoadingSpinner';
import drakeAiLogo from "../../assets/logo.png";

// Export Modal for editing boundaries before export
function ExportModal({ open, onClose, boundaries, onExport, graphLabels, autoDepthRange, graphScales }) {
  const buildRows = useCallback(() => boundaries.map((b, idx) => ({
    ...b,
    curveName: graphLabels[idx] || `G${idx + 1}`,
    curveUnit: "NONE",
    minValue: graphScales[idx]?.minValue ?? 0,
    maxValue: graphScales[idx]?.maxValue ?? 100,
    topDepth: graphScales[idx]?.topDepth ?? autoDepthRange?.top ?? DEFAULT_Y_RANGE[0],
    bottomDepth: graphScales[idx]?.bottomDepth ?? autoDepthRange?.bottom ?? DEFAULT_Y_RANGE[1],
    depthUnit: "FT",
    depthStep: 0.5,
  })), [boundaries, graphLabels, autoDepthRange, graphScales]);
  const [editedBounds, setEditedBounds] = useState(buildRows);
  useEffect(() => { setEditedBounds(buildRows()); }, [buildRows]);
  const handleChange = (idx, field, val) => {
    const numericFields = new Set(["left", "right", "top", "bottom", "minValue", "maxValue", "topDepth", "bottomDepth", "depthStep"]);
    const nextValue = numericFields.has(field) ? Number(val) : val;
    if (numericFields.has(field) && !Number.isFinite(nextValue)) return;
    setEditedBounds(prev => prev.map((b, i) => i === idx ? { ...b, [field]: nextValue } : b));
  };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[720px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">LAS Export</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-3">
            {editedBounds.map((b, idx) => (
              <div key={idx} className="rounded-xl border border-gray-200 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-800">Graph {graphLabels[idx]}</span>
                  <span className="text-[10px] text-gray-400">set pixel bounds, curve scale, and depth scale</span>
                </div>
                <div className="grid grid-cols-8 gap-2">
                  {[
                    ["left", "Left px"],
                    ["right", "Right px"],
                    ["top", "Top px"],
                    ["bottom", "Bottom px"],
                    ["minValue", "Min val"],
                    ["maxValue", "Max val"],
                    ["topDepth", "Top depth"],
                    ["bottomDepth", "Bot depth"],
                  ].map(([field, label]) => (
                    <label key={field} className="text-[10px] font-semibold text-gray-500">
                      {label}
                      <input type="number" className="mt-1 w-full border rounded px-1.5 py-1 text-xs text-gray-800" value={b[field]} onChange={e => handleChange(idx, field, e.target.value)} />
                    </label>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  <label className="text-[10px] font-semibold text-gray-500">
                    Curve mnemonic
                    <input className="mt-1 w-full border rounded px-1.5 py-1 text-xs text-gray-800" value={b.curveName} onChange={e => handleChange(idx, 'curveName', e.target.value)} />
                  </label>
                  <label className="text-[10px] font-semibold text-gray-500">
                    Curve unit
                    <input className="mt-1 w-full border rounded px-1.5 py-1 text-xs text-gray-800" value={b.curveUnit} onChange={e => handleChange(idx, 'curveUnit', e.target.value)} />
                  </label>
                  <label className="text-[10px] font-semibold text-gray-500">
                    Depth unit
                    <input className="mt-1 w-full border rounded px-1.5 py-1 text-xs text-gray-800" value={b.depthUnit} onChange={e => handleChange(idx, 'depthUnit', e.target.value)} />
                  </label>
                  <label className="text-[10px] font-semibold text-gray-500">
                    Depth step
                    <input type="number" step="0.1" className="mt-1 w-full border rounded px-1.5 py-1 text-xs text-gray-800" value={b.depthStep} onChange={e => handleChange(idx, 'depthStep', e.target.value)} />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-300 transition-colors">Cancel</button>
            <button onClick={() => onExport(editedBounds)} className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">Run LAS Export</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScaleEntryModal({ open, graphLabels, defaults, onSubmit, onCancel }) {
  const initial = useMemo(() => ({
    graphA_curveName: defaults?.curveNames?.[0] || "",
    graphA_xLeft: defaults?.graphs?.[0]?.minValue ?? "",
    graphA_xRight: defaults?.graphs?.[0]?.maxValue ?? "",
    graphB_curveName: defaults?.curveNames?.[1] || "",
    graphB_xLeft: defaults?.graphs?.[1]?.minValue ?? "",
    graphB_xRight: defaults?.graphs?.[1]?.maxValue ?? "",
    depth_top: defaults?.depth?.top ?? "",
    depth_bottom: defaults?.depth?.bottom ?? "",
  }), [defaults]);
  const [formData, setFormData] = useState(initial);

  useEffect(() => {
    if (open) setFormData(initial);
  }, [open, initial]);

  if (!open) return null;

  const handleChange = field => event => {
    setFormData(prev => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = () => {
    const nameA = formData.graphA_curveName.trim();
    const nameB = formData.graphB_curveName.trim();
    if (!nameA) {
      alert("Please enter a curve name for Graph A (e.g. SP, GR, CALI).");
      return;
    }
    if (!nameB) {
      alert("Please enter a curve name for Graph B (e.g. MNOR, ILD, MSFL).");
      return;
    }
    if (nameA.toUpperCase() === nameB.toUpperCase()) {
      alert("Graph A and Graph B curve names must be different from each other.");
      return;
    }
    const parsed = {
      graphA_curveName: nameA,
      graphA_xLeft: parseFloat(formData.graphA_xLeft),
      graphA_xRight: parseFloat(formData.graphA_xRight),
      graphB_curveName: nameB,
      graphB_xLeft: parseFloat(formData.graphB_xLeft),
      graphB_xRight: parseFloat(formData.graphB_xRight),
      depth_top: parseFloat(formData.depth_top),
      depth_bottom: parseFloat(formData.depth_bottom),
    };
    const numericFields = [
      "graphA_xLeft",
      "graphA_xRight",
      "graphB_xLeft",
      "graphB_xRight",
      "depth_top",
      "depth_bottom",
    ];
    const invalid = numericFields.filter(field => !Number.isFinite(parsed[field]));
    if (invalid.length) {
      alert(`Please fill in all fields with valid numbers.\nMissing: ${invalid.join(", ")}`);
      return;
    }
    if (parsed.graphA_xLeft === parsed.graphA_xRight) {
      alert("Graph A left and right X values cannot be equal.");
      return;
    }
    if (parsed.graphB_xLeft === parsed.graphB_xRight) {
      alert("Graph B left and right X values cannot be equal.");
      return;
    }
    if (parsed.depth_top >= parsed.depth_bottom) {
      alert("Top depth must be less than Bottom depth.");
      return;
    }
    onSubmit(parsed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm">
      <div className="w-[640px] max-w-[92vw] rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-bold text-gray-900">Enter Axis Scale Values</h2>
          <p className="mt-1 text-xs font-medium text-gray-500">
            Enter the physical values printed at each graph edge. Export will use 0.50 ft depth rows.
          </p>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div className="rounded-xl border border-red-100 bg-red-50/60 p-3">
            <h3 className="mb-2 text-xs font-bold text-red-700">Graph {graphLabels[0] || "A"}</h3>
            <label className="mb-3 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Curve name
              <input type="text" maxLength={20} value={formData.graphA_curveName} onChange={handleChange("graphA_curveName")} className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-800" placeholder="e.g. SP, GR, CALI" />
              <span className="mt-1 block normal-case tracking-normal text-gray-400">Used as the LAS column header.</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Left edge value
                <input type="number" value={formData.graphA_xLeft} onChange={handleChange("graphA_xLeft")} className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-800" placeholder="e.g. -200" />
              </label>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Right edge value
                <input type="number" value={formData.graphA_xRight} onChange={handleChange("graphA_xRight")} className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-800" placeholder="e.g. 0" />
              </label>
            </div>
          </div>
          <div className="rounded-xl border border-green-100 bg-green-50/60 p-3">
            <h3 className="mb-2 text-xs font-bold text-green-700">Graph {graphLabels[1] || "B"}</h3>
            <label className="mb-3 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Curve name
              <input type="text" maxLength={20} value={formData.graphB_curveName} onChange={handleChange("graphB_curveName")} className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-800" placeholder="e.g. MNOR, ILD, MSFL" />
              <span className="mt-1 block normal-case tracking-normal text-gray-400">Used as the LAS column header.</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Left edge value
                <input type="number" value={formData.graphB_xLeft} onChange={handleChange("graphB_xLeft")} className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-800" placeholder="e.g. 0" />
              </label>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Right edge value
                <input type="number" value={formData.graphB_xRight} onChange={handleChange("graphB_xRight")} className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-800" placeholder="e.g. 15000" />
              </label>
            </div>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
            <h3 className="mb-2 text-xs font-bold text-blue-700">Depth Axis - Shared</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Top depth ft
                <input type="number" value={formData.depth_top} onChange={handleChange("depth_top")} className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-800" placeholder="e.g. 250" />
              </label>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Bottom depth ft
                <input type="number" value={formData.depth_bottom} onChange={handleChange("depth_bottom")} className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-800" placeholder="e.g. 800" />
              </label>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button onClick={onCancel} className="rounded-lg bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200">Cancel</button>
          <button onClick={handleSubmit} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">Apply Scale & Detect Grid</button>
        </div>
      </div>
    </div>
  );
}

function CompanyNameModal({ open, initialCompany, format, onSubmit, onCancel }) {
  const [companyName, setCompanyName] = useState(initialCompany || "");

  useEffect(() => {
    if (open) setCompanyName(initialCompany || "");
  }, [open, initialCompany]);

  if (!open) return null;

  const handleSubmit = () => {
    const value = companyName.trim();
    if (!value) {
      toast.error("Company name is required to download the header.");
      return;
    }
    onSubmit(value);
  };

  const formatLabel = {
    pdf: "PDF",
    docx: "Word",
    xlsx: "Excel",
  }[format] || "file";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm">
      <div className="w-[520px] max-w-[92vw] rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-bold text-gray-900">Enter Company Name</h2>
          <p className="mt-1 text-xs font-medium text-gray-500">
            This company name will be used in the downloaded header {formatLabel} file.
          </p>
        </div>
        <div className="px-6 py-5">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Company name
            <input
              type="text"
              value={companyName}
              onChange={event => setCompanyName(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Enter company name"
              autoFocus
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button onClick={onCancel} className="rounded-lg bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200">Cancel</button>
          <button onClick={handleSubmit} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">Download Header</button>
        </div>
      </div>
    </div>
  );
}
import toast from "react-hot-toast";

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const API_URL =
  import.meta.env.VITE_GRAPH_API_URL ||
  "/segment-and-graph";

const GRAPH_COLORS = [
  "#EF4444", "#22C55E", "#3B82F6", "#F59E0B",
  "#8B5CF6", "#06B6D4", "#F43F5E", "#84CC16",
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const LAS_API_URL =
  import.meta.env.VITE_GRAPH_LAS ||
  import.meta.env.VITE_GRAPH_Las ||
  "/generate-las-base64";

const normBoundary = (b, W, H) => {
  const l = clamp(+b.left || 0, 0, W);
  const r = clamp(+b.right || W, 0, W);
  const t = clamp(+b.top || 0, 0, H);
  const bt = clamp(+b.bottom || H, 0, H);
  return {
    left: Math.min(l, r),
    right: Math.max(l, r),
    top: Math.min(t, bt),
    bottom: Math.max(t, bt),
  };
};

const lineBounds = (line, W, H) => {
  if (!line?.length) return { left: 0, right: W, top: 0, bottom: H };
  const xs = line.map(p => p[0]);
  const ys = line.map(p => p[1]);
  return normBoundary(
    { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) },
    W, H
  );
};

const inferDepthRange = (rawTicks) => {
  const ticks = (rawTicks || [])
    .map(tick => ({
      value: Number(tick?.value),
      x: Number(tick?.center?.[0]),
      y: Number(tick?.center?.[1]),
    }))
    .filter(tick => Number.isFinite(tick.value) && Number.isFinite(tick.x) && Number.isFinite(tick.y));
  const columns = [];
  ticks.forEach(tick => {
    let column = columns.find(candidate => Math.abs(candidate.x - tick.x) <= 60);
    if (!column) {
      column = { x: tick.x, ticks: [] };
      columns.push(column);
    }
    column.ticks.push(tick);
    column.x = column.ticks.reduce((sum, item) => sum + item.x, 0) / column.ticks.length;
  });

  const longestSequence = (columnTicks, direction) => {
    const sorted = [...columnTicks].sort((a, b) => a.y - b.y);
    const chains = sorted.map(tick => [tick]);
    sorted.forEach((tick, idx) => {
      for (let prev = 0; prev < idx; prev += 1) {
        if (direction * (tick.value - sorted[prev].value) > 0 && chains[prev].length + 1 > chains[idx].length) {
          chains[idx] = [...chains[prev], tick];
        }
      }
    });
    return chains.reduce((best, chain) => chain.length > best.length ? chain : best, []);
  };

  const candidates = columns.flatMap(column => [
    longestSequence(column.ticks, 1),
    longestSequence(column.ticks, -1),
  ]).filter(sequence => sequence.length >= 2);
  const best = candidates.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return (b[b.length - 1].y - b[0].y) - (a[a.length - 1].y - a[0].y);
  })[0];
  if (!best) return null;
  return { top: best[0].value, bottom: best[best.length - 1].value, count: best.length };
};

const gLabel = (i) => {
  let s = "", v = i;
  do { s = String.fromCharCode(65 + (v % 26)) + s; v = Math.floor(v / 26) - 1; } while (v >= 0);
  return s;
};

const COLORS_NAMED = ["Red", "Green", "Blue", "Orange", "Purple", "Cyan", "Rose", "Lime"];
const DEFAULT_Y_RANGE = [0, 1000];

const formatNumber = (value, digits = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return Number(number.toFixed(digits)).toString();
};

const pixelToValue = (px, pxMin, pxMax, valueAtMin, valueAtMax) => {
  if (pxMax === pxMin) return valueAtMin;
  const ratio = (px - pxMin) / (pxMax - pxMin);
  return valueAtMin + ratio * (valueAtMax - valueAtMin);
};

const valueToPixel = (value, valueMin, valueMax, pxMin, pxMax) => {
  if (valueMax === valueMin) return pxMin;
  const ratio = (value - valueMin) / (valueMax - valueMin);
  return pxMin + ratio * (pxMax - pxMin);
};

const mapPointToGraphValues = (point, boundary, scale) => {
  if (!point || !boundary) return null;
  const width = boundary.right - boundary.left;
  const height = boundary.bottom - boundary.top;
  if (width <= 0 || height <= 0) return null;

  const minValue = Number(scale?.minValue ?? 0);
  const maxValue = Number(scale?.maxValue ?? 100);
  const topDepth = Number(scale?.topDepth ?? DEFAULT_Y_RANGE[0]);
  const bottomDepth = Number(scale?.bottomDepth ?? DEFAULT_Y_RANGE[1]);
  const xFraction = clamp((point.x - boundary.left) / width, 0, 1);
  const yFraction = clamp((point.y - boundary.top) / height, 0, 1);

  return {
    value: pixelToValue(point.x, boundary.left, boundary.right, minValue, maxValue),
    depth: pixelToValue(point.y, boundary.top, boundary.bottom, topDepth, bottomDepth),
    xFraction,
    yFraction,
  };
};

const countDistinctLines = (positions, minGap) => {
  if (!positions.length) return 0;
  const sorted = [...positions].sort((a, b) => a - b);
  let count = 1;
  let last = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - last > minGap) {
      count += 1;
      last = sorted[i];
    }
  }
  return count;
};

const detectGrid = (imageData, bounds, imageWidth) => {
  const left = Math.max(0, Math.floor(bounds.left));
  const top = Math.max(0, Math.floor(bounds.top));
  const right = Math.min(imageWidth, Math.ceil(bounds.right));
  const bottom = Math.min(imageData.height, Math.ceil(bounds.bottom));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const data = imageData.data;
  const vLineCandidates = [];
  const hLineCandidates = [];

  for (let x = left; x < right; x += 1) {
    let darkCount = 0;
    for (let y = top; y < bottom; y += 1) {
      const idx = (y * imageWidth + x) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (brightness < 180) darkCount += 1;
    }
    if (darkCount / height > 0.4) vLineCandidates.push(x);
  }

  for (let y = top; y < bottom; y += 1) {
    let darkCount = 0;
    for (let x = left; x < right; x += 1) {
      const idx = (y * imageWidth + x) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (brightness < 180) darkCount += 1;
    }
    if (darkCount / width > 0.4) hLineCandidates.push(y);
  }

  return {
    hDivisions: Math.max(1, countDistinctLines(hLineCandidates, height * 0.02) - 1),
    vDivisions: Math.max(1, countDistinctLines(vLineCandidates, width * 0.02) - 1),
  };
};

const detectGridDivisions = (imageData, width, height) => {
  const data = imageData.data;
  const darkThreshold = 160;
  const lineCoverage = 0.35;
  const horizontalRows = [];
  const verticalCols = [];
  const mergeLines = (positions, minGap = 3) => {
    if (!positions.length) return [];
    const groups = [[positions[0]]];
    for (let i = 1; i < positions.length; i += 1) {
      if (positions[i] - positions[i - 1] <= minGap) {
        groups[groups.length - 1].push(positions[i]);
      } else {
        groups.push([positions[i]]);
      }
    }
    return groups.map(group => Math.round((group[0] + group[group.length - 1]) / 2));
  };

  for (let y = 0; y < height; y += 1) {
    let darkPixels = 0;
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const brightness = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      if (brightness < darkThreshold) darkPixels += 1;
    }
    if (darkPixels / width > lineCoverage) horizontalRows.push(y);
  }

  for (let x = 0; x < width; x += 1) {
    let darkPixels = 0;
    for (let y = 0; y < height; y += 1) {
      const idx = (y * width + x) * 4;
      const brightness = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      if (brightness < darkThreshold) darkPixels += 1;
    }
    if (darkPixels / height > lineCoverage) verticalCols.push(x);
  }

  const hLinePositions = mergeLines(horizontalRows);
  const vLinePositions = mergeLines(verticalCols);
  return {
    hDivisions: Math.max(1, hLinePositions.length > 1 ? hLinePositions.length - 1 : 10),
    vDivisions: Math.max(1, vLinePositions.length > 1 ? vLinePositions.length - 1 : 10),
    hLinePositions,
    vLinePositions,
  };
};

const curvePointToValues = (point, croppedRegion, xScale, depthScaleObj) => {
  const sourcePoint = Array.isArray(point) ? { x: Number(point[0]), y: Number(point[1]) } : point;
  const localX = Number(sourcePoint.x) - Number(croppedRegion.bounds.left);
  const localY = Number(sourcePoint.y) - Number(croppedRegion.bounds.top);
  if (!Number.isFinite(localX) || !Number.isFinite(localY)) return null;
  if (localX < 0 || localX > croppedRegion.width || localY < 0 || localY > croppedRegion.height) return null;
  return {
    depth: pixelToValue(localY, 0, croppedRegion.height, depthScaleObj.top, depthScaleObj.bottom),
    value: pixelToValue(localX, 0, croppedRegion.width, xScale.xLeft, xScale.xRight),
  };
};

const resampleAt0_50 = (rawPoints, croppedRegion, xScale, depthScaleObj) => {
  const nullValue = -9999.25;
  const step = 0.5;
  const physicalPoints = (rawPoints || [])
    .map(point => curvePointToValues(point, croppedRegion, xScale, depthScaleObj))
    .filter(Boolean)
    .sort((a, b) => a.depth - b.depth);

  if (!physicalPoints.length) return [];

  const result = [];
  const totalSteps = Math.round((depthScaleObj.bottom - depthScaleObj.top) / step);
  for (let i = 0; i <= totalSteps; i += 1) {
    const targetDepth = Number((depthScaleObj.top + i * step).toFixed(4));
    let before = null;
    let after = null;
    for (const point of physicalPoints) {
      if (point.depth <= targetDepth) before = point;
      if (point.depth >= targetDepth) {
        after = point;
        break;
      }
    }
    let value = nullValue;
    if (before && after && Math.abs(before.depth - after.depth) < 0.0001) {
      value = before.value;
    } else if (before && after) {
      const ratio = (targetDepth - before.depth) / (after.depth - before.depth);
      value = before.value + ratio * (after.value - before.value);
    } else if (before) {
      value = before.value;
    } else if (after) {
      value = after.value;
    }
    result.push({ depth: targetDepth, value: Number(value.toFixed(5)) });
  }
  return result;
};

const resampleCurveToDepth = (curvePoints, bounds, xScale, depthScale) => {
  const pxTop = Number(bounds.top);
  const pxBottom = Number(bounds.bottom);
  const pxLeft = Number(bounds.left);
  const pxRight = Number(bounds.right);
  const depthTop = Number(depthScale.top);
  const depthBottom = Number(depthScale.bottom);
  const step = Math.abs(Number(depthScale.step));
  if (![pxTop, pxBottom, pxLeft, pxRight, depthTop, depthBottom, step].every(Number.isFinite) || step <= 0) {
    return [];
  }

  const sorted = (curvePoints || [])
    .map(pt => Array.isArray(pt) ? { x: Number(pt[0]), y: Number(pt[1]) } : { x: Number(pt.x), y: Number(pt.y) })
    .filter(pt =>
      Number.isFinite(pt.x) && Number.isFinite(pt.y) &&
      pt.x >= pxLeft && pt.x <= pxRight &&
      pt.y >= pxTop && pt.y <= pxBottom
    )
    .sort((a, b) => a.y - b.y);

  const results = [];
  const tolerance = Math.max(2, Math.abs(pxBottom - pxTop) * 0.02);
  for (let depth = depthTop; depth <= depthBottom + step * 0.001; depth = Number((depth + step).toFixed(10))) {
    const targetPxY = valueToPixel(depth, depthTop, depthBottom, pxTop, pxBottom);
    let closest = null;
    let minDist = Infinity;
    for (const pt of sorted) {
      const dist = Math.abs(pt.y - targetPxY);
      if (dist < minDist) {
        minDist = dist;
        closest = pt;
      }
    }
    const value = closest && minDist <= tolerance
      ? pixelToValue(closest.x, pxLeft, pxRight, Number(xScale.min), Number(xScale.max))
      : -9999.25;
    results.push({
      depth: Number(depth.toFixed(4)),
      value: Number(value.toFixed(4)),
    });
  }
  return results;
};

const buildLASString = ({ wellName, field, date, depthTop, depthBottom, depthStep, curves, depthUnit = "FT" }) => {
  const nullValue = -9999.25;
  const curveList = curves || [];
  const depthValues = curveList[0]?.data?.map(pt => pt.depth) || [];
  const versionSection = [
    "~VERSION INFORMATION",
    " VERS.                 2.0   : CWLS LOG ASCII STANDARD - VERSION 2.0",
    " WRAP.                  NO   : ONE LINE PER DEPTH STEP",
    "",
  ].join("\n");
  const wellSection = [
    "~WELL INFORMATION",
    ` STRT.${depthUnit.padEnd(8)}${Number(depthTop).toFixed(4).padStart(12)}  : START DEPTH`,
    ` STOP.${depthUnit.padEnd(8)}${Number(depthBottom).toFixed(4).padStart(12)}  : STOP DEPTH`,
    ` STEP.${depthUnit.padEnd(8)}${Number(depthStep).toFixed(4).padStart(12)}  : STEP`,
    ` NULL.        ${nullValue.toFixed(2).padStart(12)}  : NULL VALUE`,
    ` COMP.        ${(field || "UNKNOWN").toString()}  : COMPANY`,
    ` WELL.        ${(wellName || "UNKNOWN").toString()}  : WELL NAME`,
    ` FLD .        ${(field || "UNKNOWN").toString()}  : FIELD`,
    ` DATE.        ${(date || new Date().toLocaleDateString()).toString()}  : LOG DATE`,
    " UWI .                    : UNIQUE WELL ID",
    "",
  ].join("\n");
  const curveSection = [
    "~CURVE INFORMATION",
    ` DEPT.${depthUnit.padEnd(8)}              : DEPTH`,
    ...curveList.map((curve, idx) => {
      const name = String(curve.name || `G${idx + 1}`).trim().toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "").slice(0, 6) || `G${idx + 1}`;
      const unit = String(curve.unit ?? "").replace(/\s+/g, "").slice(0, 8);
      return ` ${name.padEnd(6)}.${unit.padEnd(8)}              : ${curve.description || curve.name || name}`;
    }),
    "",
  ].join("\n");
  const paramSection = [
    "~PARAMETER INFORMATION",
    ` MRT .${depthUnit.padEnd(8)}${Number(depthBottom).toFixed(4).padStart(12)}  : MAXIMUM RECORDED DEPTH`,
    "",
  ].join("\n");
  const curveNames = curveList.map((curve, idx) => (
    String(curve.name || `G${idx + 1}`).trim().toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "").slice(0, 6) || `G${idx + 1}`
  ));
  const dataLines = [
    "~ASCII LOG DATA",
    ["DEPTH", ...curveNames].map(value => value.padStart(12)).join(""),
  ];
  depthValues.forEach((depth, rowIdx) => {
    const cols = [Number(depth).toFixed(4)];
    curveList.forEach(curve => {
      const value = curve.data?.[rowIdx]?.value;
      const numeric = Number.isFinite(Number(value)) ? Number(value) : nullValue;
      cols.push(numeric === nullValue ? nullValue.toFixed(2) : numeric.toFixed(5));
    });
    dataLines.push(cols.map(value => String(value).padStart(12)).join(""));
  });
  return [versionSection, wellSection, curveSection, paramSection, dataLines.join("\n"), ""].join("\n");
};

const drawDebugOverlay = (ctx, curvePoints, croppedRegion, xScale, depthScale, zoomValue) => {
  const sampled = resampleAt0_50(curvePoints, croppedRegion, xScale, depthScale)
    .filter(pt => pt.value !== -9999.25);
  if (!sampled.length) return;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 145, 0, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  sampled.forEach((pt, idx) => {
    const px = (croppedRegion.bounds.left + valueToPixel(pt.value, xScale.xLeft, xScale.xRight, 0, croppedRegion.width)) * zoomValue;
    const py = (croppedRegion.bounds.top + valueToPixel(pt.depth, depthScale.top, depthScale.bottom, 0, croppedRegion.height)) * zoomValue;
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();
};

const buildGraphScalesFromMatch = (curveValueMatch, count, fallbackDepthRange) => {
  const curves = curveValueMatch?.curves || [];
  return Array.from({ length: count }, (_, idx) => {
    const curve = curves.find(item => Number(item?.id) === idx) || curves[idx] || {};
    return {
      minValue: Array.isArray(curve.x_range) && Number.isFinite(Number(curve.x_range[0])) ? Number(curve.x_range[0]) : 0,
      maxValue: Array.isArray(curve.x_range) && Number.isFinite(Number(curve.x_range[1])) ? Number(curve.x_range[1]) : 100,
      topDepth: Array.isArray(curve.y_range) && Number.isFinite(Number(curve.y_range[0])) ? Number(curve.y_range[0]) : fallbackDepthRange.top,
      bottomDepth: Array.isArray(curve.y_range) && Number.isFinite(Number(curve.y_range[1])) ? Number(curve.y_range[1]) : fallbackDepthRange.bottom,
    };
  });
};

const formatLasHeadersAsText = (headers) => {
  if (!headers || typeof headers !== "object") return "";
  const lines = [];
  Object.entries(headers).forEach(([section, items]) => {
    if (!Array.isArray(items) || !items.length) return;
    lines.push(section.replace(/^las\./i, "").toUpperCase());
    items.forEach(item => {
      const key = String(item?.Mnemonic || item?.mnemonic || "").trim();
      const value = String(item?.Value || item?.value || "").trim();
      const unit = String(item?.Unit || item?.unit || "").trim();
      if (!key && !value) return;
      lines.push(`${key}${unit ? ` (${unit})` : ""}: ${value || "-"}`);
    });
    lines.push("");
  });
  return lines.join("\n").trim();
};

const getLasHeaderValue = (headers, mnemonics, fallback = "") => {
  const wanted = new Set(mnemonics.map(item => String(item).toUpperCase()));
  const sections = Object.values(headers || {});
  for (const items of sections) {
    if (!Array.isArray(items)) continue;
    const match = items.find(entry => wanted.has(String(entry?.Mnemonic || entry?.mnemonic || "").toUpperCase()));
    const value = match?.Value ?? match?.value;
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return fallback;
};

const getHeaderTextValue = (text, labels, fallback = "") => {
  const raw = String(text || "");
  for (const label of labels) {
    const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = raw.match(new RegExp(`${escaped}\\s*[:=]?\\s*([^\\n\\r]+)`, "i"));
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return fallback;
};

const firstHeaderValue = (headers, text, mnemonicGroups, textLabels, fallback = "") => (
  getLasHeaderValue(headers, mnemonicGroups, "") ||
  getHeaderTextValue(text, textLabels, "") ||
  fallback
);

const HEADER_TEXT_LABELS = [
  "Company", "Well", "Field", "County", "State", "Location", "API No", "API",
  "Survey", "Sec", "Permanent Datum", "Elevation", "Ground Level", "Kelly Bushing",
  "Date", "Run Number", "Bottom Log Interval", "Bottom Log Int", "Casing Size",
  "Bit Size", "Depth Range", "Scale", "Driller", "Logger",
];

const cleanHeaderValue = (value, fallback = "") => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  const markerHits = HEADER_TEXT_LABELS.reduce((count, marker) => {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return count + (new RegExp(`\\b${escaped}\\b`, "i").test(text) ? 1 : 0);
  }, 0);
  if (text.length > 180 && markerHits >= 3) return fallback;
  return text.length > 260 ? `${text.slice(0, 257).trim()}...` : text;
};

const parseHeaderOCR = (rawOCR) => {
  const text = String(rawOCR || "").replace(/\s+/g, " ").trim();
  if (!text) return {};

  const extract = (startLabels, endLabels = []) => {
    const starts = Array.isArray(startLabels) ? startLabels : [startLabels];
    const ends = Array.isArray(endLabels) ? endLabels : [endLabels];
    let best = null;
    starts.forEach(label => {
      const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b\\s*[:#]?\\s*`, "i");
      const match = regex.exec(text);
      if (match && (!best || match.index < best.index)) {
        best = { index: match.index, end: match.index + match[0].length };
      }
    });
    if (!best) return "";

    const afterStart = text.slice(best.end);
    let endIndex = afterStart.length;
    ends.filter(Boolean).forEach(label => {
      const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b\\s*[:#]?`, "i");
      const match = regex.exec(afterStart);
      if (match && match.index > 0 && match.index < endIndex) endIndex = match.index;
    });
    return cleanHeaderValue(afterStart.slice(0, endIndex));
  };

  return {
    company: extract("Company", ["Well", "Field", "County"]),
    well: extract("Well", ["Field", "County", "State"]),
    field: extract("Field", ["County", "State", "Location"]),
    county: extract("County", ["State", "Location", "API"]),
    state: extract("State", ["Location", "API", "Permanent Datum"]),
    location: extract("Location", ["API", "Permanent Datum", "Elevation"]),
    api: extract(["API No", "API"], ["Other Services", "Permanent Datum", "Elevation", "Company"]),
    survey: extract(["Survey", "Sec"], ["Permanent Datum", "Elevation"]),
    permanentDatum: extract("Permanent Datum", ["Ground Level", "Kelly Bushing", "Date"]),
    elevation: extract("Elevation", ["Permanent Datum", "Ground Level", "Kelly Bushing"]),
    groundLevel: extract("Ground Level", ["Kelly Bushing", "Date", "Run Number"]),
    kellyBushing: extract("Kelly Bushing", ["Date", "Run Number", "Bottom"]),
    date: extract("Date", ["Run Number", "Depth Driller", "Bottom"]),
    runNumber: extract("Run Number", ["Depth Driller", "Bottom Log", "Top Log"]),
    bottomLog: extract(["Bottom Log Interval", "Bottom Log Int", "Bottom Logged Interval"], ["Fluid Level", "Casing Size", "Bit Size", "Scale"]),
    casingSize: extract(["Casing Size", "Production Casing"], ["Bit Size", "Depth Range", "Scale"]),
    bitSize: extract("Bit Size", ["Depth Range", "Scale", "Drilling Contractor"]),
    depthRange: extract("Depth Range", ["Scale", "Date"]),
    scale: extract("Scale", ["Date", "Run Number"]),
    driller: extract(["Depth Driller", "Driller"], ["Depth Logger", "Top Log", "Bottom Log"]),
    logger: extract(["Depth Logger", "Logger", "Recorded By"], ["Top Log", "Bottom Log", "Witnessed By"]),
  };
};

const buildHeaderDownloadData = ({ lasHeaders, headerText }) => {
  const parsed = parseHeaderOCR(headerText);
  const pick = (mnemonics, parsedKey, textLabels, fallback = "") => cleanHeaderValue(
    getLasHeaderValue(lasHeaders, mnemonics, "") ||
    parsed[parsedKey] ||
    getHeaderTextValue(headerText, textLabels, "") ||
    fallback,
    fallback
  );

  return {
    company: pick(["COMP", "COMPANY", "SRVC", "SERVICE"], "company", ["Company", "Service Company"]),
    well: pick(["WELL", "WN", "WELLNAME"], "well", ["Well", "Well Name"]),
    field: pick(["FLD", "FIELD"], "field", ["Field", "Field Name"]),
    county: pick(["CNTY", "COUNTY"], "county", ["County"]),
    state: pick(["STAT", "STATE"], "state", ["State"]),
    location: pick(["LOC", "LOCATION"], "location", ["Location"]),
    api: pick(["API", "APIN", "API NO", "API_NO"], "api", ["API", "API No", "API Number"]),
    logType: pick(["LOG", "LOGT", "TYPE"], "logType", ["Log Type", "Type"]),
    date: pick(["DATE", "RDATE"], "date", ["Date", "Run Date"]),
    scale: pick(["SCAL", "SCALE"], "scale", ["Scale"]),
    depthRange: pick(["TDEP", "DEPTH", "RANGE"], "depthRange", ["Depth Range"]),
    elevation: pick(["ELEV", "ELEVATION", "EKB", "EDF"], "elevation", ["Elevation"]),
    permanentDatum: pick(["PDAT", "DATUM"], "permanentDatum", ["Permanent Datum", "Datum"]),
    groundLevel: pick(["GL", "GLEV"], "groundLevel", ["Ground Level", "Ground Elevation"]),
    kellyBushing: pick(["KB", "KELLY", "KELLYBUSHING"], "kellyBushing", ["Kelly Bushing", "KB"]),
    driller: pick(["DRILLER", "DRLR"], "driller", ["Driller"]),
    logger: pick(["LOGGER", "ENG"], "logger", ["Logger", "Engineer"]),
    runNumber: pick(["RUN", "RUNNO", "RUNNUMBER"], "runNumber", ["Run Number", "Run No"]),
    bottomLog: pick(["BLI", "STOP", "BHT"], "bottomLog", ["Bottom Log Interval", "Bottom Log Int"]),
    casingSize: pick(["CSG", "CSGS", "CASING"], "casingSize", ["Casing Size", "Casing"]),
    bitSize: pick(["BS", "BITS", "BIT"], "bitSize", ["Bit Size", "Bit"]),
    township: pick(["TWP", "TOWNSHIP"], "township", ["Township", "Twp"]),
    range: pick(["RANGE", "RNG"], "range", ["Range", "Rng"]),
    section: pick(["SEC", "SECTION"], "section", ["Section", "Sec"]),
    survey: cleanHeaderValue(parsed.survey || ""),
  };
};

const triggerSaveAs = (blob, suggestedFilename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const HEADER_DOWNLOAD_TITLE = "Well Log Digitization";
const isHeaderValuePresent = value => {
  const text = String(value ?? "").trim();
  return Boolean(text) && !["-", "N/A", "NA", "NULL", "UNDEFINED"].includes(text.toUpperCase());
};
const buildHeaderDownloadSections = (header) => {
  const sections = [
    {
      title: "WELL IDENTIFICATION",
      rows: [
        ["Company", header.company],
        ["Well", header.well],
        ["Field", header.field],
        ["County", header.county],
        ["State", header.state],
        ["Location", header.location],
        ["API No.", header.api],
      ],
    },
    {
      title: "SURVEY",
      rows: [
        ["Survey", header.survey],
        ["Section", header.section],
        ["Township", header.township],
        ["Range", header.range],
      ],
    },
    {
      title: "DEPTH & SCALE",
      rows: [
        ["Permanent Datum", header.permanentDatum],
        ["Elevation", header.elevation],
        ["Ground Level", header.groundLevel],
        ["Kelly Bushing", header.kellyBushing],
        ["Depth Range", header.depthRange],
        ["Scale", header.scale],
      ],
    },
    {
      title: "DRILLING INFORMATION",
      rows: [
        ["Date", header.date],
        ["Run Number", header.runNumber],
        ["Bottom Log Int.", header.bottomLog],
        ["Casing Size", header.casingSize],
        ["Bit Size", header.bitSize],
        ["Driller", header.driller],
        ["Logger", header.logger],
      ],
    },
  ];

  return sections
    .map(section => ({
      ...section,
      rows: section.rows.filter(([, value]) => isHeaderValuePresent(value)),
    }))
    .filter(section => section.rows.length);
};

const downloadHeaderAsPDF = async (header, filename) => {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const sections = buildHeaderDownloadSections(header);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;
  const labelWidth = 140;
  const valueWidth = contentWidth - labelWidth;
  const labelX = margin;
  const valueX = margin + labelWidth;
  const footerY = pageHeight - 24;
  const bottomLimit = pageHeight - 54;
  const cellPad = 6;
  const lineHeight = 13;
  let y = 122;

  const addFooter = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("Generated by Well Log Digitization - Header OCR Export", pageWidth / 2, footerY, { align: "center" });
  };

  const addPageIfNeeded = (height = 24) => {
    if (y + height <= bottomLimit) return;
    addFooter();
    doc.addPage();
    y = margin;
  };

  const drawTopHeader = () => {
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(HEADER_DOWNLOAD_TITLE, margin, 52);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const subtitle = isHeaderValuePresent(header.logType) ? header.logType : "Header OCR Export";
    doc.text(doc.splitTextToSize(subtitle, contentWidth), margin, 72);
    doc.line(margin, 114, pageWidth - margin, 114);
  };

  const section = (title) => {
    addPageIfNeeded(22);
    doc.setFillColor(48, 48, 48);
    doc.rect(margin, y, contentWidth, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(title, margin + cellPad, y + 12);
    y += 18;
  };

  const row = (label, value) => {
    if (!isHeaderValuePresent(value)) return;
    const safeValue = String(value).trim();
    doc.setFontSize(9);
    const valueLines = doc.splitTextToSize(safeValue, valueWidth - cellPad * 2);
    const labelLines = doc.splitTextToSize(label, labelWidth - cellPad * 2);
    const rowHeight = Math.max(24, Math.max(valueLines.length, labelLines.length) * lineHeight + cellPad * 2);
    addPageIfNeeded(rowHeight);

    doc.setDrawColor(185, 185, 185);
    doc.setFillColor(242, 242, 242);
    doc.rect(labelX, y, labelWidth, rowHeight, "FD");
    doc.setFillColor(255, 255, 255);
    doc.rect(valueX, y, valueWidth, rowHeight, "FD");

    doc.setTextColor(45, 45, 45);
    doc.setFont("helvetica", "bold");
    doc.text(labelLines, labelX + cellPad, y + cellPad + 9);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.text(valueLines, valueX + cellPad, y + cellPad + 9);
    y += rowHeight;
  };

  drawTopHeader();
  sections.forEach(item => {
    section(item.title);
    item.rows.forEach(([label, value]) => row(label, value));
  });

  addFooter();

  triggerSaveAs(doc.output("blob"), `${filename}.pdf`);
};

const downloadHeaderAsWord = async (header, filename) => {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    BorderStyle, WidthType, ShadingType, AlignmentType,
  } = await import("docx");
  const sections = buildHeaderDownloadSections(header);

  const border = { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const margins = { top: 80, bottom: 80, left: 120, right: 120 };
  const infoRow = (label, value) => new TableRow({
    children: [
      new TableCell({
        borders,
        width: { size: 2200, type: WidthType.DXA },
        margins,
        shading: { fill: "F0F0F0", type: ShadingType.CLEAR },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18 })] })],
      }),
      new TableCell({
        borders,
        width: { size: 7160, type: WidthType.DXA },
        margins,
        children: [new Paragraph({ children: [new TextRun({ text: String(value).trim(), size: 18 })] })],
      }),
    ],
  });
  const sectionRows = sections.flatMap(section => [
    new TableRow({
      children: [
        new TableCell({
          borders,
          columnSpan: 2,
          margins,
          shading: { fill: "303030", type: ShadingType.CLEAR },
          children: [new Paragraph({ children: [new TextRun({ text: section.title, bold: true, size: 18, color: "FFFFFF" })] })],
        }),
      ],
    }),
    ...section.rows.map(([label, value]) => infoRow(label, value)),
  ]);

  const doc = new Document({
    sections: [{
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [new TextRun({ text: HEADER_DOWNLOAD_TITLE, bold: true, size: 32 })],
        }),
        new Paragraph({
          children: [new TextRun({ text: isHeaderValuePresent(header.logType) ? header.logType : "Header OCR Export", bold: true, size: 24, color: "444444" })],
        }),
        new Paragraph({ children: [new TextRun({ text: " " })] }),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2200, 7160],
          rows: sectionRows,
        }),
        new Paragraph({ children: [new TextRun({ text: " " })] }),
        new Paragraph({ children: [new TextRun({ text: "Generated by Well Log Digitization", italics: true, size: 16, color: "888888" })] }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  triggerSaveAs(blob, `${filename}.docx`);
};

const downloadHeaderAsExcel = async (header, filename) => {
  const XLSX = await import("xlsx");
  const sections = buildHeaderDownloadSections(header);
  const rows = [
    [HEADER_DOWNLOAD_TITLE, ""],
    [isHeaderValuePresent(header.logType) ? header.logType : "Header OCR Export", ""],
    ["", ""],
    ...sections.flatMap(section => [
      [section.title, ""],
      ["FIELD", "VALUE"],
      ...section.rows.map(([label, value]) => [label, String(value).trim()]),
      ["", ""],
    ]),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [{ wch: 28 }, { wch: 42 }];
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Header OCR");
  const workbookArray = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([workbookArray], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerSaveAs(blob, `${filename}.xlsx`);
};

/* ─── Modals ─────────────────────────────────────────────────────────────────── */
function HeaderOcrModal({ open, text, accuracy, onTextChange, onClose, onSave }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm">
      <div className="w-[760px] max-w-[92vw] max-h-[90vh] rounded-2xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Header OCR Content</h2>
            <p className="mt-0.5 text-[11px] font-medium text-gray-500">
              Accuracy: <span className="text-blue-700">{accuracy}</span>
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Close">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <textarea
            value={text}
            onChange={e => onTextChange(e.target.value)}
            spellCheck={false}
            className="min-h-[430px] w-full resize-y rounded-xl border border-gray-200 bg-gray-50 p-4 font-mono text-xs leading-5 text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder="Header OCR text will appear here. You can edit/correct it and save before LAS export."
          />
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          <p className="text-[11px] font-medium text-gray-500">Saved content is exported at the top of the LAS file.</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={onSave} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">Save Header</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ onClose }) {
  const [numGraphs, setNumGraphs] = useState("2");
  const [threshold, setThreshold] = useState("0.5");
  const [minDist, setMinDist] = useState("10");
  const [darkMode, setDarkMode] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[460px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-gray-900">Settings</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-6">
          {/* Detection Settings */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Detection Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Default Number of Graphs</label>
                <input type="number" min="1" max="10" value={numGraphs} onChange={e => setNumGraphs(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-xs text-gray-400 mt-1">Used as default when running Smart Detection</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Detection Threshold <span className="font-normal text-gray-400">(0.0 – 1.0)</span></label>
                <div className="flex gap-3 items-center">
                  <input type="range" min="0" max="1" step="0.05" value={threshold} onChange={e => setThreshold(e.target.value)} className="flex-1 accent-blue-600" />
                  <span className="text-sm font-semibold text-gray-700 w-10 text-right">{threshold}</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Near-Point Min Distance <span className="font-normal text-gray-400">(px)</span></label>
                <div className="flex gap-3 items-center">
                  <input type="range" min="1" max="50" value={minDist} onChange={e => setMinDist(e.target.value)} className="flex-1 accent-blue-600" />
                  <span className="text-sm font-semibold text-gray-700 w-10 text-right">{minDist} px</span>
                </div>
              </div>
            </div>
          </div>
          {/* Appearance */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Appearance</h3>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div>
                <p className="text-sm font-medium text-gray-700">Dark Mode</p>
                <p className="text-xs text-gray-400">Toggle canvas dark background</p>
              </div>
              <button onClick={() => setDarkMode(d => !d)} className={`w-11 h-6 rounded-full transition-colors ${darkMode ? "bg-blue-600" : "bg-gray-300"} relative`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${darkMode ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
          </div>
          {/* Version */}
          <div className="pt-2 border-t border-gray-100 flex justify-between items-center text-xs text-gray-400">
            <span>Well Log Digitization v2.1.0</span>
            <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">Save & Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HelpModal({ onClose }) {
  const shortcuts = [
    ["Ctrl+Z", "Undo last action"],
    ["Ctrl+Shift+Z", "Redo last action"],
    ["P", "Switch to Pan mode"],
    ["I", "Switch to Insert mode"],
    ["D", "Switch to Delete mode"],
    ["+  /  -", "Zoom in / Zoom out"],
    ["R", "Reset view"],
    ["Click + Drag", "Move points (Select mode)"],
    ["Scroll Wheel", "Zoom in/out on canvas"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[480px]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-gray-900">Help & Keyboard Shortcuts</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Keyboard Shortcuts</h3>
            <div className="divide-y divide-gray-100">
              {shortcuts.map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-gray-600">{desc}</span>
                  <kbd className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-mono rounded border border-gray-200">{key}</kbd>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-blue-50 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-blue-900 mb-1">Curve Tracking</h4>
            <p className="text-xs text-blue-700 leading-relaxed">Upload a TIFF file, enter the number of curves to detect, and click <strong>Smart Detection AI</strong>. The AI will automatically trace the curves in the image. You can then edit them using Insert/Delete mode.</p>
          </div>
          <div className="pt-2 flex justify-end">
            <button onClick={onClose} className="px-4 py-2 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-800 transition-colors">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowInstructionsModal({ onClose }) {
  const sections = [
    {
      title: "Upload And Detect Curves",
      steps: [
        "Click Upload File and select a TIFF file.",
        "Enter the total number of curves in Total Curves.",
        "Click Submit & Start to run the detection.",
      ],
    },
    {
      title: "Apply Boundaries",
      steps: [
        "Adjust the dotted boundary lines so they correctly fit around the graph area.",
        "Check each curve or graph boundary before applying.",
        "Click Apply Boundaries.",
        "Enter the scale data in the popup and click Apply Scale & Detect Grid.",
      ],
    },
    {
      title: "Export LAS",
      steps: [
        "After the scale data is applied, click Export LAS.",
        "The LAS file will be generated using the adjusted boundaries and scale data.",
      ],
    },
    {
      title: "Download Header",
      steps: [
        "Click Download Header.",
        "Choose PDF, Word, or Excel.",
        "Enter the company name in the popup.",
        "Click Download Header to create the selected file.",
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm">
      <div className="w-[640px] max-w-[92vw] max-h-[88vh] rounded-2xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Workflow Instructions</h2>
            <p className="mt-1 text-xs font-medium text-gray-500">
              Follow these steps to process the TIFF, apply boundaries, export LAS, and download the header.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {sections.map((section) => (
            <div key={section.title} className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-blue-700">{section.title}</h3>
              <ol className="space-y-2">
                {section.steps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-xs leading-relaxed text-gray-700">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t border-gray-100 px-6 py-4">
          <button onClick={onClose} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">Got it</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────────── */
export default function GraphTrackerV2() {
  const [showExport, setShowExport] = useState(false);
  const [showHeaderOcrModal, setShowHeaderOcrModal] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [pendingHeaderDownload, setPendingHeaderDownload] = useState(null);
  const [showWorkflowInstructions, setShowWorkflowInstructions] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    document.title = "Well Log Digitization";
  }, []);
  /* ── File & Image ── */
  const [uploadedFile, setUploadedFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const uploadInputRef = useRef(null);
  const [threshold, setThreshold] = useState("0.5");

  /* ── Graph Data ── */
  const [sourceGraphLines, setSourceGraphLinesRaw] = useState([]);
  const [visibleGraphMap, setVisibleGraphMap] = useState({});
  const [graphBoundaries, setGraphBoundariesRaw] = useState([]);
  const [graphScales, setGraphScales] = useState([]);
  const [manualGraphCrop, setManualGraphCrop] = useState(null);
  const [autoDepthRange, setAutoDepthRange] = useState({
    top: DEFAULT_Y_RANGE[0],
    bottom: DEFAULT_Y_RANGE[1],
  });
  const sourceGraphLinesRef = useRef([]);
  const graphBoundariesRef = useRef([]);
  const boundaryDraftRef = useRef(null);

  useEffect(() => {
    sourceGraphLinesRef.current = sourceGraphLines;
  }, [sourceGraphLines]);

  useEffect(() => {
    graphBoundariesRef.current = graphBoundaries;
  }, [graphBoundaries]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!event.target.closest(".download-header-wrapper")) {
        setShowDownloadMenu(false);
      }
      if (!event.target.closest(".user-menu-wrapper")) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const setSourceGraphLines = useCallback((value) => {
    setSourceGraphLinesRaw(prev => {
      const next = typeof value === "function" ? value(prev) : value;
      return next;
    });
  }, []);

  const setGraphBoundaries = useCallback((value) => {
    setGraphBoundariesRaw(prev => {
      const next = typeof value === "function" ? value(prev) : value;
      return next;
    });
  }, []);

  /* ── Undo / Redo ── */
  const [history, setHistory] = useState([]);  // [{lines, bounds}]
  const [historyIdx, setHistoryIdx] = useState(-1);
  const historyIdxRef = useRef(-1);

  useEffect(() => {
    historyIdxRef.current = historyIdx;
  }, [historyIdx]);

  const pushHistory = useCallback((lines, bounds) => {
    setHistory(prevHistory => {
      const indexed = prevHistory.slice(0, historyIdxRef.current + 1);
      return [...indexed, { lines: JSON.parse(JSON.stringify(lines)), bounds: JSON.parse(JSON.stringify(bounds)) }];
    });
    historyIdxRef.current += 1;
    setHistoryIdx(historyIdxRef.current);
  }, []);

  const handleUndo = () => {
    if (historyIdxRef.current <= 0) return;
    const prev = history[historyIdxRef.current - 1];
    setSourceGraphLines(prev.lines);
    setGraphBoundaries(prev.bounds);
    historyIdxRef.current -= 1;
    setHistoryIdx(historyIdxRef.current);
  };

  const handleRedo = () => {
    if (historyIdxRef.current >= history.length - 1) return;
    const next = history[historyIdxRef.current + 1];
    setSourceGraphLines(next.lines);
    setGraphBoundaries(next.bounds);
    historyIdxRef.current += 1;
    setHistoryIdx(historyIdxRef.current);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.clear();
    window.location.href = "/";
  };

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;

  /* ── Modals ── */
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  /* ── Preview / OCR ── */
  const [headerImageUrl, setHeaderImageUrl] = useState(null);
  const [layoutInfo, setLayoutInfo] = useState(null);
  const [lasHeaders, setLasHeaders] = useState(null);
  const [headerOcrText, setHeaderOcrText] = useState("");
  const [headerOcrInfo, setHeaderOcrInfo] = useState(null);
  const [editableHeaderText, setEditableHeaderText] = useState("");
  const [savedHeaderText, setSavedHeaderText] = useState("");
  const [activeViewTab, setActiveViewTab] = useState("graph");
  const [rightPanelTab, setRightPanelTab] = useState("header");
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const [showScaleModal, setShowScaleModal] = useState(false);
  const [appliedGraphBoundaries, setAppliedGraphBoundaries] = useState([]);
  const [croppedGraphRegions, setCroppedGraphRegions] = useState([]);
  const [axisScales, setAxisScales] = useState([]);
  const [curveNames, setCurveNames] = useState([]);
  const [depthScale, setDepthScale] = useState(null);
  const [gridInfo, setGridInfo] = useState([]);

  /* ── Analyzing ── */
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [numGraphsInput, setNumGraphsInput] = useState("2");

  /* ── Canvas ── */
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState("pan"); // pan | insert | delete | bounds
  const [isPanning, setIsPanning] = useState(false);
  const lastPan = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState({ lineIdx: null, ptIdx: null, ox: 0, oy: 0 });
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [boundaryDrag, setBoundaryDrag] = useState({ graphIdx: null, edge: null });
  const [selectionDrag, setSelectionDrag] = useState(null);
  const [activeBoundaryIdx, setActiveBoundaryIdx] = useState(0);
  const BDGE_TOL = 8;

  /* ── Curve Tracking State ── */
  const [trackingGraph, setTrackingGraph] = useState(null); // idx of graph being hovered
  const [trackPoints, setTrackPoints] = useState([]); // points clicked for tracking seed
  const [hoverCardPos, setHoverCardPos] = useState({ x: 0, y: 0 });
  const [hoveredPlot, setHoveredPlot] = useState(null);
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [smartCursorView, setSmartCursorView] = useState(false);

  /* ── Graph Boundary View ── */
  const graphBoundaryView = useMemo(() =>
    sourceGraphLines.map((line, i) =>
      graphBoundaries[i]
        ? normBoundary(graphBoundaries[i], imageDimensions.width, imageDimensions.height)
        : lineBounds(line, imageDimensions.width, imageDimensions.height)
    ), [sourceGraphLines, graphBoundaries, imageDimensions]);

  const headerPreviewFields = useMemo(() => {
    const wellItems = lasHeaders?.["las.well"] || [];
    const pick = (mnemonics, fallback = "-") => {
      const item = wellItems.find(entry => mnemonics.includes(String(entry?.Mnemonic || "").toUpperCase()));
      return item?.Value || fallback;
    };
    return [
      ["Well Name", pick(["WELL", "WN"])],
      ["Field Name", pick(["FLD", "FIELD"])],
      ["Location", pick(["LOC", "LOCATION"])],
      ["Depth Range", `${DEFAULT_Y_RANGE[0]} - ${DEFAULT_Y_RANGE[1]} ft`],
      ["Scale", "1:200"],
      ["Date", pick(["DATE"])],
    ];
  }, [lasHeaders]);

  const completeHeaderText = useMemo(() => (
    savedHeaderText || headerOcrText || ""
  ), [savedHeaderText, headerOcrText]);

  const headerAccuracyLabel = useMemo(() => {
    if (!headerOcrInfo) return "Not available";
    const rawScore = Number(headerOcrInfo.score ?? headerOcrInfo.confidence ?? headerOcrInfo.accuracy);
    if (Number.isFinite(rawScore)) {
      const pct = rawScore <= 1 ? rawScore * 100 : rawScore;
      return `${Math.round(pct)}%`;
    }
    const recognized = Number(headerOcrInfo.recognized_field_count);
    const total = Number(headerOcrInfo.nonblank_field_count || headerOcrInfo.total_field_count);
    if (Number.isFinite(recognized) && Number.isFinite(total) && total > 0) {
      return `${Math.round((recognized / total) * 100)}%`;
    }
    return "Not available";
  }, [headerOcrInfo]);

  const openHeaderOcrViewer = () => {
    setEditableHeaderText(completeHeaderText || "");
    setShowHeaderOcrModal(true);
  };

  const graphSummaryItems = useMemo(() =>
    sourceGraphLines.map((line, idx) => ({
      index: idx,
      label: `Graph ${gLabel(idx)}`,
      color: GRAPH_COLORS[idx % GRAPH_COLORS.length],
      points: line.length,
      bounds: graphBoundaryView[idx],
    })), [sourceGraphLines, graphBoundaryView]);

  /* ══════════════════════════════════════════════ DRAW ══════════════════════════════════════════════ */
  useEffect(() => {
    if (!imageUrl || !imageDimensions.width) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = imageDimensions.width * zoom;
    const H = imageDimensions.height * zoom;
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      ctx.drawImage(img, 0, 0, W, H);

      // Draw curves
      sourceGraphLines.forEach((line, idx) => {
        if (visibleGraphMap[idx] === false || !line?.length) return;
        const col = GRAPH_COLORS[idx % GRAPH_COLORS.length];
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;

        if (line.length > 1) {
          ctx.beginPath();
          ctx.moveTo(line[0][0] * zoom, line[0][1] * zoom);
          for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0] * zoom, line[i][1] * zoom);
          ctx.stroke();
        }

        line.forEach(([x, y]) => {
          ctx.beginPath();
          ctx.arc(x * zoom, y * zoom, 3, 0, 2 * Math.PI);
          ctx.fillStyle = col;
          ctx.fill();
        });

        // Label
        if (line[0]) {
          const [lx, ly] = line[0];
          ctx.font = "bold 13px Inter, sans-serif";
          ctx.strokeStyle = "rgba(0,0,0,0.7)";
          ctx.lineWidth = 3;
          ctx.strokeText(`Graph ${gLabel(idx)}`, lx * zoom + 8, ly * zoom - 6);
          ctx.fillStyle = "#fff";
          ctx.fillText(`Graph ${gLabel(idx)}`, lx * zoom + 8, ly * zoom - 6);
        }
      });

      // Draw boundaries
      graphBoundaryView.forEach((b, idx) => {
        if (visibleGraphMap[idx] === false || !b) return;
        const col = GRAPH_COLORS[idx % GRAPH_COLORS.length];
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(b.left * zoom, b.top * zoom, (b.right - b.left) * zoom, (b.bottom - b.top) * zoom);
        ctx.setLineDash([]);
      });

      if (showDebugOverlay) {
        sourceGraphLines.forEach((line, idx) => {
          const region = croppedGraphRegions[idx];
          const scale = axisScales[idx];
          if (visibleGraphMap[idx] === false || !line?.length || !region || !scale || !depthScale) return;
          drawDebugOverlay(
            ctx,
            line,
            region,
            scale,
            depthScale,
            zoom
          );
        });
      }

      if (manualGraphCrop && sourceGraphLines.length === 0) {
        const b = normBoundary(manualGraphCrop, imageDimensions.width, imageDimensions.height);
        ctx.strokeStyle = "#2563EB";
        ctx.fillStyle = "rgba(37, 99, 235, 0.08)";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 5]);
        ctx.fillRect(b.left * zoom, b.top * zoom, (b.right - b.left) * zoom, (b.bottom - b.top) * zoom);
        ctx.strokeRect(b.left * zoom, b.top * zoom, (b.right - b.left) * zoom, (b.bottom - b.top) * zoom);
        ctx.setLineDash([]);
      }

      if (selectionDrag) {
        const b = normBoundary(
          { left: selectionDrag.x0, right: selectionDrag.x1, top: selectionDrag.y0, bottom: selectionDrag.y1 },
          imageDimensions.width,
          imageDimensions.height
        );
        ctx.strokeStyle = "#111827";
        ctx.fillStyle = "rgba(37, 99, 235, 0.08)";
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 5]);
        ctx.fillRect(b.left * zoom, b.top * zoom, (b.right - b.left) * zoom, (b.bottom - b.top) * zoom);
        ctx.strokeRect(b.left * zoom, b.top * zoom, (b.right - b.left) * zoom, (b.bottom - b.top) * zoom);
        ctx.setLineDash([]);
      }

      // Track seed points
      if (trackPoints.length > 0) {
        trackPoints.forEach(([x, y]) => {
          ctx.beginPath();
          ctx.arc(x * zoom, y * zoom, 6, 0, 2 * Math.PI);
          ctx.strokeStyle = "#FBBF24";
          ctx.lineWidth = 2;
          ctx.fillStyle = "rgba(251,191,36,0.3)";
          ctx.fill();
          ctx.stroke();
        });
      }
    };
  }, [imageUrl, imageDimensions, zoom, sourceGraphLines, visibleGraphMap, graphBoundaryView, trackPoints, selectionDrag, manualGraphCrop, showDebugOverlay, graphScales, croppedGraphRegions, axisScales, depthScale]);

  /* ══════════════════════════════════════════════ KEYBOARD ══════════════════════════════════════════ */
  // Push initial state to history on first load
  useEffect(() => {
    if (sourceGraphLines.length && history.length === 0) {
      pushHistory(sourceGraphLines, graphBoundaries);
    }
  }, [sourceGraphLines, graphBoundaries, history.length, pushHistory]);

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.ctrlKey && e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if (e.ctrlKey && e.key === "z" && e.shiftKey) { e.preventDefault(); handleRedo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); handleRedo(); }
      if (e.key === "p" || e.key === "P") setMode("pan");
      if (e.key === "i" || e.key === "I") setMode("insert");
      if (e.key === "d" || e.key === "D") setMode("delete");
      if (e.key === "r" || e.key === "R") { setZoom(1); setPanOffset({ x: 0, y: 0 }); }
      if (e.key === "+" || e.key === "=") setZoom(z => Math.min(z + 0.15, 5));
      if (e.key === "-") setZoom(z => Math.max(z - 0.15, 0.2));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [historyIdx, history, handleUndo, handleRedo]);

  /* ══════════════════════════════════════════════ FILE ══════════════════════════════════════════════ */
  const handleFileUpload = (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["tif", "tiff"].includes(ext)) { toast.error("Please upload a .tif or .tiff file."); return; }
    setUploadedFile(file);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImageDimensions({ width: img.width, height: img.height });
      setImageUrl(url);
      setHeaderImageUrl(null);
      setLayoutInfo(null);
      setLasHeaders(null);
      setHeaderOcrText("");
      setHeaderOcrInfo(null);
      setEditableHeaderText("");
      setSavedHeaderText("");
      setActiveViewTab("graph");
      setRightPanelTab("header");
      setSourceGraphLines([]);
      setGraphBoundaries([]);
      setGraphScales([]);
      setAppliedGraphBoundaries([]);
      setCroppedGraphRegions([]);
      setAxisScales([]);
      setCurveNames([]);
      setDepthScale(null);
      setGridInfo([]);
      setShowScaleModal(false);
      setManualGraphCrop(null);
      setVisibleGraphMap({});
      setHistory([]);
      setHistoryIdx(-1);
      historyIdxRef.current = -1;
      sourceGraphLinesRef.current = [];
      graphBoundariesRef.current = [];
      pushHistory([], []);
      setTrackingGraph(null);
      setHoveredPlot(null);
      setSelectedPlot(null);
      setTrackPoints([]);
    };
    img.src = url;
    toast.success("File uploaded.");
  };

  /* ══════════════════════════════════════════════ AI DETECTION ══════════════════════════════════════ */
  const handleRunAI = async () => {
    if (!uploadedFile) { toast.error("Please upload a TIFF file first."); return; }
    if (!numGraphsInput || +numGraphsInput < 1) { toast.error("Enter number of curves (≥1)."); return; }

    setIsAnalyzing(true);
    try {
      const form = new FormData();
      form.append("file", uploadedFile);
      form.append("threshold", threshold);
      form.append("total_graphs", numGraphsInput);
      form.append("include_header_ocr", "true");
      form.append("include_depth_ocr", "true");
      if (manualGraphCrop) {
        form.append("manual_graph_box", JSON.stringify({
          x1: manualGraphCrop.left,
          y1: manualGraphCrop.top,
          x2: manualGraphCrop.right,
          y2: manualGraphCrop.bottom,
        }));
      }

      const res = await fetch(API_URL, { method: "POST", body: form });
      if (!res.ok) {
        let detail = "";
        try {
          const errorText = await res.text();
          const errorBody = errorText ? JSON.parse(errorText) : null;
          detail = errorBody?.detail || errorText;
        } catch {
          detail = "";
        }
        throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
      }
      const data = await res.json();

      const lines = Object.values(data.graph_points || {}).map(l => l.map(([x, y]) => [x, y]));
      const W = data.image_dimensions?.width || imageDimensions.width;
      const H = data.image_dimensions?.height || imageDimensions.height;
      const responseBounds = Array.isArray(data.graph_boundaries)
        ? data.graph_boundaries.map(boundary => normBoundary(boundary, W, H))
        : [];
      const bounds = lines.map((line, idx) => responseBounds[idx] || lineBounds(line, W, H));

      setSourceGraphLines(lines);
      setGraphBoundaries(bounds);
      if (data.image_dimensions) setImageDimensions(data.image_dimensions);
      const depthRange = inferDepthRange(data.depth_ticks);
      if (depthRange && depthRange.top !== depthRange.bottom) {
        setAutoDepthRange({ top: depthRange.top, bottom: depthRange.bottom });
        console.log(`[AUTO DEPTH] OCR detected: ${depthRange.top} FT -> ${depthRange.bottom} FT (${depthRange.count} ticks)`);
      }
      const fallbackDepthRange = depthRange && depthRange.top !== depthRange.bottom
        ? { top: depthRange.top, bottom: depthRange.bottom }
        : autoDepthRange;
      setGraphScales(buildGraphScalesFromMatch(data.curve_value_match, lines.length, fallbackDepthRange));
      setAppliedGraphBoundaries([]);
      setCroppedGraphRegions([]);
      setAxisScales([]);
      setCurveNames([]);
      setDepthScale(null);
      setGridInfo([]);
      setShowScaleModal(false);
      const vm = {};
      lines.forEach((_, i) => vm[i] = true);
      setVisibleGraphMap(vm);
      const overlay = data.overlay_png_base64 || data.graph_png_base64;
      if (overlay) setImageUrl(`data:image/png;base64,${overlay}`);
      if (data.header_png_base64) setHeaderImageUrl(`data:image/png;base64,${data.header_png_base64}`);
      if (data.layout) setLayoutInfo(data.layout);
      if (data.las_headers) setLasHeaders(data.las_headers);
      const extractedHeaderText = data.header_ocr_text || "";
      setHeaderOcrText(extractedHeaderText || "");
      setHeaderOcrInfo(data.header_ocr || null);
      setEditableHeaderText(extractedHeaderText || "");
      setSavedHeaderText("");
      setActiveViewTab("graph");
      setRightPanelTab("header");
      setTrackingGraph(null);
      setHoveredPlot(null);
      setSelectedPlot(null);
      setTrackPoints([]);
      pushHistory(lines, bounds);
      toast.success(`Detected ${lines.length} curve${lines.length !== 1 ? "s" : ""}.`);
    } catch (err) {
      console.error(err);
      toast.error("Detection failed: " + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  /* ══════════════════════════════════════════════ CANVAS INTERACTIONS ═══════════════════════════════ */
  const canvasCoords = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  };

  const segDist = (p, v, w) => {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (!l2) return Math.hypot(p.x - v.x, p.y - v.y);
    const t = Math.max(0, Math.min(1, ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2));
    return Math.hypot(p.x - v.x - t * (w.x - v.x), p.y - v.y - t * (w.y - v.y));
  };

  const findNearestPlot = useCallback((x, y) => {
    let nearest = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    sourceGraphLines.forEach((line, idx) => {
      if (visibleGraphMap[idx] === false) return;
      const boundary = graphBoundaryView[idx];
      if (!boundary) return;
      const insideBoundary =
        x >= boundary.left && x <= boundary.right &&
        y >= boundary.top && y <= boundary.bottom;
      if (!insideBoundary) return;

      line.forEach((pt, ptIdx) => {
        const dist = Math.hypot(pt[0] - x, pt[1] - y);
        if (dist < nearestDist && dist < 16 / zoom) {
          const point = { x: pt[0], y: pt[1] };
          nearestDist = dist;
          nearest = {
            graphIdx: idx,
            pointIdx: ptIdx,
            x: pt[0],
            y: pt[1],
            distance: dist,
            mapped: mapPointToGraphValues(point, boundary, graphScales[idx]),
          };
        }
      });
    });
    return nearest;
  }, [sourceGraphLines, visibleGraphMap, graphBoundaryView, graphScales, zoom]);

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    const { x, y } = canvasCoords(e);

    if (smartCursorView) {
      const nearest = findNearestPlot(x, y);
      if (nearest) {
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (containerRect) {
          setHoverCardPos({
            x: Math.min(Math.max(e.clientX - containerRect.left, 12), containerRect.width - 260),
            y: Math.min(Math.max(e.clientY - containerRect.top, 12), containerRect.height - 150),
          });
        }
        setSelectedPlot(nearest);
        setHoveredPlot(nearest);
        setTrackingGraph(nearest.graphIdx);
        return;
      }
      setSelectedPlot(null);
    }

    if (mode === "bounds") {
      setSelectionDrag({ x0: x, y0: y, x1: x, y1: y });
      return;
    }

    const edgeTol = BDGE_TOL / zoom;
    for (let idx = 0; idx < graphBoundaryView.length; idx += 1) {
      const b = graphBoundaryView[idx];
      if (!b || visibleGraphMap[idx] === false) continue;
      const nearY = y >= b.top - edgeTol && y <= b.bottom + edgeTol;
      const nearX = x >= b.left - edgeTol && x <= b.right + edgeTol;
      if (nearY && Math.abs(x - b.left) <= edgeTol) {
        boundaryDraftRef.current = { graphIdx: idx, bounds: b };
        setBoundaryDrag({ graphIdx: idx, edge: "left" });
        return;
      }
      if (nearY && Math.abs(x - b.right) <= edgeTol) {
        boundaryDraftRef.current = { graphIdx: idx, bounds: b };
        setBoundaryDrag({ graphIdx: idx, edge: "right" });
        return;
      }
      if (nearX && Math.abs(y - b.top) <= edgeTol) {
        boundaryDraftRef.current = { graphIdx: idx, bounds: b };
        setBoundaryDrag({ graphIdx: idx, edge: "top" });
        return;
      }
      if (nearX && Math.abs(y - b.bottom) <= edgeTol) {
        boundaryDraftRef.current = { graphIdx: idx, bounds: b };
        setBoundaryDrag({ graphIdx: idx, edge: "bottom" });
        return;
      }
    }

    if (mode === "pan") {
      setIsPanning(true);
      lastPan.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (mode === "delete") {
      const tol = 10 / zoom;
      let found = false;
      const newLines = sourceGraphLines.map((line, li) => {
        if (visibleGraphMap[li] === false || found) return line;
        const pi = line.findIndex(([px, py]) => Math.hypot(px - x, py - y) < tol);
        if (pi !== -1) { found = true; return line.filter((_, i) => i !== pi); }
        return line;
      });
      if (found) {
        setSourceGraphLines(newLines);
        pushHistory(newLines, graphBoundaries);
      }
      return;
    }

    if (mode === "insert") {
      // Find nearest segment across all visible graphs
      let best = { d: Infinity, li: -1, si: -1 };
      sourceGraphLines.forEach((line, li) => {
        if (visibleGraphMap[li] === false) return;
        for (let i = 0; i < line.length - 1; i++) {
          const d = segDist({ x, y }, { x: line[i][0], y: line[i][1] }, { x: line[i + 1][0], y: line[i + 1][1] });
          if (d < best.d) best = { d, li, si: i };
        }
      });
      if (best.li !== -1) {
        const newLines = sourceGraphLines.map((line, li) => {
          if (li !== best.li) return line;
          const nl = [...line];
          nl.splice(best.si + 1, 0, [x, y]);
          return nl;
        });
        setSourceGraphLines(newLines);
        pushHistory(newLines, graphBoundaries);
      }
      return;
    }
  };

  const onMouseMove = (e) => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (smartCursorView && containerRect) {
      setHoverCardPos({
        x: Math.min(Math.max(e.clientX - containerRect.left, 12), containerRect.width - 220),
        y: Math.min(Math.max(e.clientY - containerRect.top, 12), containerRect.height - 120),
      });
    }

    const { x, y } = canvasCoords(e);
    setCursorPos({ x: Math.round(x), y: Math.round(y) });

    if (selectionDrag) {
      setSelectionDrag(prev => prev ? { ...prev, x1: x, y1: y } : prev);
    }

    if (!smartCursorView) {
      setHoveredPlot(null);
      setTrackingGraph(null);
    } else {
      const nearest = findNearestPlot(x, y);
      setHoveredPlot(nearest);
      setTrackingGraph(nearest ? nearest.graphIdx : null);
    }

    if (mode === "pan" && isPanning) {
      const dx = e.clientX - lastPan.current.x;
      const dy = e.clientY - lastPan.current.y;
      setPanOffset(p => ({ x: p.x + dx, y: p.y + dy }));
      lastPan.current = { x: e.clientX, y: e.clientY };
    }

    // Boundary drag
    if (boundaryDrag.graphIdx !== null) {
      const { graphIdx, edge } = boundaryDrag;
      const W = imageDimensions.width, H = imageDimensions.height;
      const cur = boundaryDraftRef.current?.bounds || graphBoundariesRef.current[graphIdx] || graphBoundaryView[graphIdx];
      const upd = { ...cur, [edge]: edge === "left" || edge === "right" ? x : y };
      boundaryDraftRef.current = { graphIdx, bounds: normBoundary(upd, W, H) };
    }

    // Point drag
    if (dragging.lineIdx !== null) {
      setSourceGraphLines(prev =>
        prev.map((line, li) => li !== dragging.lineIdx ? line :
          line.map((pt, pi) => pi !== dragging.ptIdx ? pt : [x + dragging.ox, y + dragging.oy])
        )
      );
    }
  };

  const onMouseUp = () => {
    if (selectionDrag) {
      const selected = normBoundary(
        { left: selectionDrag.x0, right: selectionDrag.x1, top: selectionDrag.y0, bottom: selectionDrag.y1 },
        imageDimensions.width,
        imageDimensions.height
      );
      if ((selected.right - selected.left) > 10 && (selected.bottom - selected.top) > 10) {
        if (sourceGraphLines.length) {
          const idx = clamp(activeBoundaryIdx, 0, sourceGraphLines.length - 1);
          setGraphBoundaries(prev => {
            const next = [...prev];
            next[idx] = selected;
            return next;
          });
          pushHistory(sourceGraphLines, graphBoundariesRef.current.map((b, i) => i === idx ? selected : b));
          toast.success(`Updated Graph ${gLabel(idx)} boundary.`);
        } else {
          setManualGraphCrop(selected);
          toast.success("Manual graph area selected. Submit will use this crop.");
        }
      }
      setSelectionDrag(null);
      return;
    }
    if (dragging.lineIdx !== null) {
      pushHistory(sourceGraphLines, graphBoundaries);
      setDragging({ lineIdx: null, ptIdx: null, ox: 0, oy: 0 });
    }
    if (boundaryDrag.graphIdx !== null) {
      const draft = boundaryDraftRef.current;
      if (draft?.bounds && draft.graphIdx !== null) {
        const baseBounds = sourceGraphLines.map((line, idx) =>
          graphBoundariesRef.current[idx] || lineBounds(line, imageDimensions.width, imageDimensions.height)
        );
        const committedBounds = baseBounds.map((b, idx) => idx === draft.graphIdx ? draft.bounds : b);
        setGraphBoundaries(committedBounds);
        pushHistory(sourceGraphLines, committedBounds);
      } else {
        pushHistory(sourceGraphLines, graphBoundaries);
      }
      boundaryDraftRef.current = null;
      setBoundaryDrag({ graphIdx: null, edge: null });
    }
    setIsPanning(false);
  };

  const handleCanvasLeave = () => {
    setHoveredPlot(null);
    setTrackingGraph(null);
    onMouseUp();
  };

  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    setZoom(z => clamp(z + delta, 0.15, 5));
  };

  /* ══════════════════════════════════════════════ BOUNDARY ACTIONS ══════════════════════════════════ */
  const cropGraphRegions = async (boundsList) => {
    if (!imageUrl || !imageDimensions.width || !imageDimensions.height) {
      throw new Error("Image is not ready for cropping.");
    }
    const img = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not load image for cropping."));
      element.src = imageUrl;
    });
    const offscreen = document.createElement("canvas");
    offscreen.width = imageDimensions.width;
    offscreen.height = imageDimensions.height;
    const ctx = offscreen.getContext("2d");
    ctx.drawImage(img, 0, 0, imageDimensions.width, imageDimensions.height);
    return boundsList.map((bounds, idx) => {
      const normalized = normBoundary(bounds, imageDimensions.width, imageDimensions.height);
      const left = Math.max(0, Math.round(normalized.left));
      const top = Math.max(0, Math.round(normalized.top));
      const right = Math.min(imageDimensions.width, Math.round(normalized.right));
      const bottom = Math.min(imageDimensions.height, Math.round(normalized.bottom));
      const width = right - left;
      const height = bottom - top;
      if (width <= 0 || height <= 0) {
        throw new Error(`Graph ${gLabel(idx)} crop is invalid.`);
      }
      return {
        imageData: ctx.getImageData(left, top, width, height),
        bounds: { left, top, right, bottom },
        width,
        height,
      };
    });
  };

  const handleBoundaryChange = (idx, field, val) => {
    const n = parseFloat(val);
    if (!isFinite(n)) return;
    setGraphBoundaries(prev => {
      const next = [...prev];
      const cur = next[idx] || graphBoundaryView[idx];
      next[idx] = normBoundary({ ...cur, [field]: n }, imageDimensions.width, imageDimensions.height);
      return next;
    });
  };

  const handleApplyBoundaries = async () => {
    if (!sourceGraphLines.length) { toast.error("No graphs loaded."); return; }
    try {
      const applied = graphBoundaryView.map(bounds => ({ ...bounds }));
      const cropped = await cropGraphRegions(applied);
      const grids = cropped.map(region => detectGridDivisions(region.imageData, region.width, region.height));
      setAppliedGraphBoundaries(applied);
      setCroppedGraphRegions(cropped);
      setGridInfo(grids);
      setShowScaleModal(true);
      console.log("Applied graph crops:", cropped.map(region => ({ width: region.width, height: region.height, bounds: region.bounds })));
      console.log("Detected grids:", grids.map((grid, idx) => ({ graph: gLabel(idx), hDivisions: grid.hDivisions, vDivisions: grid.vDivisions })));
      toast.success("Boundaries frozen. Enter graph scales next.");
    } catch (err) {
      console.error("Apply boundaries failed:", err);
      toast.error(err.message || "Could not crop graph boundaries.");
    }
  };

  const handleScaleSubmit = (parsed) => {
    const nextScales = sourceGraphLines.map((_, idx) => {
      if (idx === 0) return { xLeft: parsed.graphA_xLeft, xRight: parsed.graphA_xRight };
      if (idx === 1) return { xLeft: parsed.graphB_xLeft, xRight: parsed.graphB_xRight };
      return {
        xLeft: graphScales[idx]?.minValue ?? 0,
        xRight: graphScales[idx]?.maxValue ?? 100,
      };
    });
    const nextCurveNames = sourceGraphLines.map((_, idx) => {
      if (idx === 0) return parsed.graphA_curveName;
      if (idx === 1) return parsed.graphB_curveName;
      return `G${gLabel(idx)}`;
    });
    const nextDepthScale = { top: parsed.depth_top, bottom: parsed.depth_bottom, step: 0.5 };
    setAxisScales(nextScales);
    setCurveNames(nextCurveNames);
    setDepthScale(nextDepthScale);
    setGraphScales(sourceGraphLines.map((_, idx) => ({
      minValue: nextScales[idx]?.xLeft ?? 0,
      maxValue: nextScales[idx]?.xRight ?? 100,
      topDepth: nextDepthScale.top,
      bottomDepth: nextDepthScale.bottom,
    })));
    setShowScaleModal(false);
    toast.success("Scale and curve names applied. LAS export is ready.");
  };

  /* ══════════════════════════════════════════════ EXPORT ══════════════════════════════════════════ */
  const base64ToBlob = (base64, mimeType) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  const exportAs = () => {
    if (!sourceGraphLines.length) {
      toast.error("No data to export.");
      return;
    }
    if (!appliedGraphBoundaries.length || !croppedGraphRegions.length) {
      alert('Please click "Apply Boundaries" first before exporting.');
      return;
    }
    if (!axisScales.length || !depthScale) {
      alert("Please enter axis scale values first.");
      setShowScaleModal(true);
      return;
    }
    if (!curveNames[0] || !curveNames[1]) {
      alert("Curve names are missing. Please click Apply Boundaries and enter Graph A / Graph B names.");
      setShowScaleModal(true);
      return;
    }

    const errors = [];
    const sampledCurves = sourceGraphLines.map((line, idx) => {
      const croppedRegion = croppedGraphRegions[idx];
      const scale = axisScales[idx];
      if (!line?.length) {
        errors.push(`No curve points detected for Graph ${gLabel(idx)}.`);
        return null;
      }
      if (!croppedRegion) {
        errors.push(`Cropped image data is missing for Graph ${gLabel(idx)}.`);
        return null;
      }
      if (!scale || !Number.isFinite(scale.xLeft) || !Number.isFinite(scale.xRight) || scale.xLeft === scale.xRight) {
        errors.push(`Scale values are invalid for Graph ${gLabel(idx)}.`);
        return null;
      }
      const data = resampleAt0_50(line, croppedRegion, scale, depthScale);
      if (!data.length) {
        errors.push(`No valid curve points found inside Graph ${gLabel(idx)} boundary.`);
        return null;
      }
      const nonNullCount = data.filter(point => point.value !== -9999.25).length;
      if (!nonNullCount) {
        errors.push(`Graph ${gLabel(idx)} sampled values are all null; check the crop boundary.`);
        return null;
      }
      return {
        name: curveNames[idx] || `G${gLabel(idx)}`,
        unit: "",
        description: `${curveNames[idx] || `Graph ${gLabel(idx)}`} - Graph ${gLabel(idx)}`,
        data,
      };
    }).filter(Boolean);

    if (!Number.isFinite(depthScale.top) || !Number.isFinite(depthScale.bottom) || depthScale.top >= depthScale.bottom) {
      errors.push("Depth scale is invalid.");
    }
    if (errors.length) {
      alert(`Cannot export LAS:\n\n${errors.join("\n")}`);
      return;
    }

    const headerText = completeHeaderText || formatLasHeadersAsText(lasHeaders);
    const header = buildHeaderDownloadData({ lasHeaders, headerText, uploadedFile, autoDepthRange });
    const lasText = buildLASString({
      wellName: header.well || uploadedFile?.name?.replace(/\.[^/.]+$/, "") || "UNKNOWN",
      field: header.field || header.company || "UNKNOWN",
      date: header.date || "",
      depthTop: depthScale.top,
      depthBottom: depthScale.bottom,
      depthStep: 0.5,
      depthUnit: "FT",
      curves: sampledCurves,
    });
    const baseName = (header.well || uploadedFile?.name || "export").replace(/\.[^/.]+$/, "").replace(/[\s/\\:*?"<>|]/g, "_");
    triggerSaveAs(new Blob([lasText], { type: "text/plain;charset=utf-8" }), `${baseName}.las`);
    toast.success("LAS file exported at 0.50 ft step.");
  };

  const handleDownloadHeader = async (format) => {
    setShowDownloadMenu(false);
    const headerText = completeHeaderText || formatLasHeadersAsText(lasHeaders);
    if (!headerText && !lasHeaders) {
      toast.error("No header OCR data available to download.");
      return;
    }

    const header = buildHeaderDownloadData({
      lasHeaders,
      headerText,
      uploadedFile,
      autoDepthRange,
    });
    const baseName = (uploadedFile?.name || "header").replace(/\.[^/.]+$/, "");
    const suggestedName = `${baseName}_header`;
    setPendingHeaderDownload({ format, header, suggestedName });
  };

  const handleCompanyHeaderDownload = async (companyName) => {
    if (!pendingHeaderDownload) return;
    const { format, suggestedName } = pendingHeaderDownload;
    const header = {
      ...pendingHeaderDownload.header,
      company: companyName,
    };
    if (!buildHeaderDownloadSections(header).length) {
      toast.error("No detected header fields available to download.");
      return;
    }
    try {
      if (format === "pdf") await downloadHeaderAsPDF(header, suggestedName);
      if (format === "docx") await downloadHeaderAsWord(header, suggestedName);
      if (format === "xlsx") await downloadHeaderAsExcel(header, suggestedName);
      setPendingHeaderDownload(null);
      toast.success("Header download created.");
    } catch (err) {
      console.error("Header download failed:", err);
      toast.error("Failed to generate header file.");
    }
  };

  const handleExportModal = async (editedBounds) => {
    setShowExport(false);

    const normalizedBounds = editedBounds.map(b => normBoundary(b, imageDimensions.width, imageDimensions.height));

    const errors = [];
    const sampledCurves = [];
    const exportBounds = [];
    sourceGraphLines.forEach((line, idx) => {
      const row = editedBounds[idx];
      if (!line?.length) {
        errors.push(`Graph ${gLabel(idx)} has no curve points.`);
        return;
      }
      const boundary = normalizedBounds[idx] || graphBoundaryView[idx] || lineBounds(line, imageDimensions.width, imageDimensions.height);
      exportBounds[idx] = boundary;
      const filteredLine = line.filter(([x, y]) => x >= boundary.left && x <= boundary.right && y >= boundary.top && y <= boundary.bottom);
      if (boundary.right <= boundary.left || boundary.bottom <= boundary.top) {
        errors.push(`Graph ${gLabel(idx)} boundary is invalid.`);
        return;
      }
      if (!filteredLine.length) {
        errors.push(`Graph ${gLabel(idx)} has no points inside its boundary.`);
        return;
      }
      const minValue = Number(row.minValue);
      const maxValue = Number(row.maxValue);
      const topDepth = Number(row.topDepth);
      const bottomDepth = Number(row.bottomDepth);
      const depthStep = Math.abs(Number(row.depthStep || editedBounds[0]?.depthStep || 0.5));
      if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
        errors.push(`Graph ${gLabel(idx)} X-axis scale must be numeric.`);
        return;
      }
      if (minValue === maxValue) {
        errors.push(`Graph ${gLabel(idx)} X-axis min and max cannot be equal.`);
        return;
      }
      if (!Number.isFinite(topDepth) || !Number.isFinite(bottomDepth) || topDepth >= bottomDepth) {
        errors.push(`Graph ${gLabel(idx)} depth top must be less than depth bottom.`);
        return;
      }
      if (!Number.isFinite(depthStep) || depthStep <= 0) {
        errors.push(`Graph ${gLabel(idx)} depth step must be a positive number.`);
        return;
      }
      const curveName = String(row.curveName || gLabel(idx)).trim() || gLabel(idx);
      const data = resampleCurveToDepth(
        filteredLine,
        boundary,
        { min: minValue, max: maxValue },
        { top: topDepth, bottom: bottomDepth, step: depthStep }
      );
      if (!data.length) {
        errors.push(`Graph ${gLabel(idx)} could not be resampled.`);
        return;
      }
      sampledCurves.push({
        name: curveName,
        unit: row.curveUnit || "NONE",
        description: `Graph ${gLabel(idx)} curve`,
        data,
      });
    });

    if (errors.length) {
      alert(`Cannot export LAS:\n\n${errors.join("\n")}`);
      return;
    }

    if (!sampledCurves.length) {
      toast.error("No sampled curve data available for LAS export.");
      return;
    }

    try {
      setGraphBoundaries(prev => sourceGraphLines.map((line, idx) =>
        exportBounds[idx] || prev[idx] || lineBounds(line, imageDimensions.width, imageDimensions.height)
      ));
      const headerText = completeHeaderText || formatLasHeadersAsText(lasHeaders);
      const header = buildHeaderDownloadData({ lasHeaders, headerText, uploadedFile, autoDepthRange });
      const firstRow = editedBounds[0] || {};
      const depthTop = Number(firstRow.topDepth ?? autoDepthRange.top);
      const depthBottom = Number(firstRow.bottomDepth ?? autoDepthRange.bottom);
      const depthStep = Math.abs(Number(firstRow.depthStep || 0.5));
      const lasText = buildLASString({
        wellName: header.well || uploadedFile?.name?.replace(/\.[^/.]+$/, "") || "UNKNOWN",
        field: header.field || header.company || "",
        date: header.date || "",
        depthTop,
        depthBottom,
        depthStep,
        depthUnit: firstRow.depthUnit || "FT",
        curves: sampledCurves,
      });
      const baseName = (uploadedFile?.name || "graph").replace(/\.[^/.]+$/, "");
      triggerSaveAs(new Blob([lasText], { type: "text/plain;charset=utf-8" }), `${baseName}_all_curves.las`);
      toast.success("LAS file exported successfully.");
    } catch (err) {
      toast.error("Error exporting LAS file.");
      console.error("LAS export error:", err);
    }
  };

  /* ══════════════════════════════════════════════ RENDER ═══════════════════════════════════════════ */
  const totalPoints = sourceGraphLines.reduce((s, l) => s + l.length, 0);
  const activePlot = selectedPlot || hoveredPlot;
  const activePlotScale = activePlot ? graphScales[activePlot.graphIdx] : null;
  const activePlotBoundary = activePlot ? graphBoundaryView[activePlot.graphIdx] : null;

  return (
    <div className="flex flex-col h-screen w-screen bg-white overflow-hidden select-none font-sans text-gray-800">
      {/* MODALS */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showWorkflowInstructions && <WorkflowInstructionsModal onClose={() => setShowWorkflowInstructions(false)} />}
      <HeaderOcrModal
        open={showHeaderOcrModal}
        text={editableHeaderText}
        accuracy={headerAccuracyLabel}
        onTextChange={setEditableHeaderText}
        onClose={() => setShowHeaderOcrModal(false)}
        onSave={() => {
          setSavedHeaderText(editableHeaderText.trim());
          setHeaderOcrText(editableHeaderText.trim());
          setShowHeaderOcrModal(false);
          toast.success("Header OCR content saved for LAS export.");
        }}
      />
      <ScaleEntryModal
        open={showScaleModal}
        graphLabels={sourceGraphLines.map((_, i) => gLabel(i))}
        defaults={{
          graphs: graphScales,
          curveNames,
          depth: {
            top: autoDepthRange.top,
            bottom: autoDepthRange.bottom,
          },
        }}
        onSubmit={handleScaleSubmit}
        onCancel={() => setShowScaleModal(false)}
      />
      <CompanyNameModal
        open={Boolean(pendingHeaderDownload)}
        initialCompany={pendingHeaderDownload?.header?.company || ""}
        format={pendingHeaderDownload?.format}
        onSubmit={handleCompanyHeaderDownload}
        onCancel={() => setPendingHeaderDownload(null)}
      />

      {/* ══ TOP BAR ══════════════════════════════════════════════════════════════ */}
      <div className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-4 shrink-0 z-10">
        {/* LEFT */}
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src={drakeAiLogo} alt="Drake AI" className="h-14 w-auto object-contain" />
            <span className="font-bold text-base text-gray-900 tracking-tight">Well Log Digitization</span>
          </div>
          {/* Divider */}
          <div className="w-px h-5 bg-gray-200" />
          {/* File pill */}
          {uploadedFile && (
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full py-0.5 px-3">
              <span className="text-xs font-semibold text-gray-800 max-w-[120px] truncate">{uploadedFile.name}</span>
              <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            </div>
          )}
        </div>

        {/* RIGHT: undo/redo + icons */}
        <div className="flex items-center gap-1 text-gray-500">
          {/* Undo */}
          <button onClick={handleUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${!canUndo ? "opacity-30 cursor-not-allowed" : ""}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 010 16H3m0-16l4-4m-4 4l4 4" /></svg>
          </button>
          {/* Redo */}
          <button onClick={handleRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${!canRedo ? "opacity-30 cursor-not-allowed" : ""}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 000 16h10m0-16l-4-4m4 4l-4 4" /></svg>
          </button>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          {/* Help */}
          <button onClick={() => setShowHelp(true)} title="Help" className="p-1.5 rounded hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
          {/* Settings */}
          <button onClick={() => setShowSettings(true)} title="Settings" className="p-1.5 rounded hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
          {/* User menu */}
          <div className="user-menu-wrapper relative ml-2">
            <button
              type="button"
              onClick={() => setShowUserMenu(prev => !prev)}
              title="User menu"
              className="w-7 h-7 bg-blue-600 rounded-full text-white flex items-center justify-center text-xs font-bold hover:bg-blue-700 transition-colors">
              B
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-36 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="block w-full px-3 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-50">
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ CANVAS TOOLBAR ═══════════════════════════════════════════════════════ */}
      <div className="h-10 border-b border-gray-200 bg-white flex items-center px-3 gap-2 shrink-0 overflow-x-auto">
        {/* Zoom controls */}
        <div className="flex items-center bg-gray-50 border border-gray-200 rounded divide-x divide-gray-200">
          {[
            { label: "+ Zoom In", action: () => setZoom(z => Math.min(z + 0.15, 5)) },
            { label: "− Zoom Out", action: () => setZoom(z => Math.max(z - 0.15, 0.2)) },
            { label: "⊡ Fit", action: () => { setZoom(1); setPanOffset({ x: 0, y: 0 }); } },
            { label: `${Math.round(zoom * 100)}%`, action: null },
            { label: "↺ Reset", action: () => { setZoom(1); setPanOffset({ x: 0, y: 0 }); } },
          ].map(({ label, action }) => (
            <button key={label} onClick={action}
              disabled={!action}
              className={`px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-white transition-colors ${!action ? "cursor-default" : ""}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* Mode buttons */}
        {[
          { m: "pan", icon: "✋", label: "Pan" },
          { m: "insert", icon: "+", label: "Insert Pt." },
          { m: "delete", icon: "🗑", label: "Delete Pt." },
        ].map(({ m, icon, label }) => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border transition-all ${mode === m
              ? m === "pan" ? "bg-blue-50 border-blue-300 text-blue-700"
                : m === "insert" ? "bg-green-50 border-green-300 text-green-700"
                  : "bg-red-50 border-red-300 text-red-700"
              : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}>
            <span>{icon}</span>{label}
          </button>
        ))}

        <button onClick={() => setMode("bounds")}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border transition-all ${mode === "bounds"
            ? "bg-amber-50 border-amber-300 text-amber-700"
            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}>
          <span>□</span>Select Bounds
        </button>

        <button
          onClick={() => {
            setSmartCursorView(prev => {
              const next = !prev;
              if (!next) {
                setHoveredPlot(null);
                setTrackingGraph(null);
              }
              return next;
            });
          }}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border transition-all ${smartCursorView
            ? "bg-purple-50 border-purple-300 text-purple-700"
            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}>
          <span>🧭</span>
          AI Curve Tracking
        </button>

        <div className="w-px h-5 bg-gray-200" />

        {/* Preview tabs */}
        <div className="flex items-center bg-gray-50 border border-gray-200 rounded divide-x divide-gray-200">
          {[
            { key: "graph", label: "Graph View" },
            { key: "header", label: "Header OCR" },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveViewTab(tab.key)}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${activeViewTab === tab.key ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-white"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* Undo / Redo in toolbar too */}
        <button onClick={handleUndo} disabled={!canUndo} title="Undo"
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 rounded border border-gray-200 hover:bg-gray-50 transition-colors ${!canUndo ? "opacity-30 cursor-not-allowed" : ""}`}>
          ↩ Undo
        </button>
        <button onClick={handleRedo} disabled={!canRedo} title="Redo"
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 rounded border border-gray-200 hover:bg-gray-50 transition-colors ${!canRedo ? "opacity-30 cursor-not-allowed" : ""}`}>
          ↪ Redo
        </button>
      </div>

      {/* ══ MAIN CONTENT AREA ═══════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────────── */}
        <div className="w-56 bg-white border-r border-gray-200 flex flex-col overflow-y-auto shrink-0">
          {/* FILE UPLOAD */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">File</p>
            {!uploadedFile ? (
              <label
                className="border-2 border-dashed border-blue-200 rounded-lg p-4 flex flex-col items-center cursor-pointer hover:bg-blue-50 transition-colors"
                onDrop={e => { e.preventDefault(); handleFileUpload(e.dataTransfer.files[0]); }}
                onDragOver={e => e.preventDefault()}>
                <svg className="w-7 h-7 text-blue-400 mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                <span className="text-xs font-semibold text-gray-700">Upload File</span>
                <span className="text-[10px] text-gray-400 text-center">Drag & drop or <span className="text-blue-600">browse</span></span>
                <input ref={uploadInputRef} type="file" className="hidden" accept=".tif,.tiff" onChange={e => handleFileUpload(e.target.files[0])} />
              </label>
            ) : (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 flex items-center gap-2">
                <div className="bg-blue-600 text-white p-1.5 rounded-md shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <div className="overflow-hidden flex-1">
                  <p className="text-xs font-semibold text-gray-800 truncate">{uploadedFile.name}</p>
                  <p className="text-[10px] text-gray-400">{(uploadedFile.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <svg className="w-4 h-4 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              </div>
            )}
          </div>

          {/* PROCESS SETUP */}
          <div className="px-4 pt-3 pb-3 border-b border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Process Setup</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Total Curves</label>
                <input type="number" min="1" max="10" value={numGraphsInput} onChange={e => setNumGraphsInput(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              {manualGraphCrop && sourceGraphLines.length === 0 && (
                <div className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1.5 text-[10px] font-medium text-blue-700">
                  Manual graph crop selected: Y {Math.round(manualGraphCrop.top)} to {Math.round(manualGraphCrop.bottom)}
                </div>
              )}
              <button onClick={handleRunAI} disabled={!uploadedFile || isAnalyzing}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
                <svg className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                {isAnalyzing ? "Starting…" : "Submit & Start"}
              </button>
              <p className="text-[10px] text-gray-400">Enter total curves, submit, and the process will start automatically.</p>
            </div>
          </div>

          {/* GRAPHS DETECTED */}
          <div className="px-4 pt-3 pb-2 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Curves Detected</p>
              <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded-full">{sourceGraphLines.length}</span>
            </div>
            {sourceGraphLines.length === 0 ? (
              <p className="text-[10px] text-gray-400 italic">Run Smart Detection to detect curves.</p>
            ) : (
              <div className="space-y-1.5">
                {sourceGraphLines.map((line, idx) => {
                  const vis = visibleGraphMap[idx] !== false;
                  const lb = lineBounds(line, imageDimensions.width, imageDimensions.height);
                  return (
                    <div key={idx} className={`flex items-center justify-between py-1.5 px-2 rounded-lg border ${vis ? "border-gray-200 bg-gray-50" : "border-transparent"}`}>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: GRAPH_COLORS[idx % GRAPH_COLORS.length] }} />
                        <div>
                          <p className="text-xs font-semibold text-gray-800">Graph {gLabel(idx)}</p>
                          <p className="text-[10px] text-gray-400">{line.length.toLocaleString()} pts</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="space-y-1 text-[10px] text-gray-500">
                          <div className="flex items-center justify-between">
                            <span>Points</span>
                            <span className="font-semibold text-gray-700">{line.length.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Bounds</span>
                            <span className="font-semibold text-gray-700">{Math.round(lb.left)} × {Math.round(lb.top)}</span>
                          </div>
                        </div>

                        <button onClick={() => setVisibleGraphMap(p => ({ ...p, [idx]: p[idx] === false }))}
                          className="text-gray-400 hover:text-gray-700 p-0.5">
                          {vis
                            ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                          }
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* IMAGE DETAILS */}
          <div className="px-4 pt-3 pb-3 flex-grow">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Image Details</p>
            <div className="space-y-2 text-[11px]">
              {[
                ["File Name", uploadedFile?.name ?? "–"],
                ["Dimensions", imageDimensions.width ? `${imageDimensions.width}×${imageDimensions.height}px` : "–"],
                ["File Size", uploadedFile ? `${(uploadedFile.size / 1024 / 1024).toFixed(2)} MB` : "–"],
                ["Total Points", totalPoints.toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-400">{k}</span>
                  <span className="text-gray-700 font-medium truncate max-w-[90px]" title={v}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── CANVAS AREA ──────────────────────────────────────────────────────── */}
        <div className="flex-1 relative overflow-hidden bg-gray-100"
          ref={containerRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={handleCanvasLeave}
          onWheel={onWheel}
          style={{ cursor: mode === "pan" ? (isPanning ? "grabbing" : "grab") : mode === "insert" ? "crosshair" : "default" }}>
          {imageUrl ? (
            activeViewTab === "header" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                <div className="relative max-w-4xl max-h-full p-4 bg-white rounded-xl shadow-lg">
                  <div className="absolute top-2 left-2 bg-white/90 backdrop-blur px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-blue-600 border border-blue-100">
                    Header OCR Preview
                  </div>
                  <img src={headerImageUrl || imageUrl} alt="Detected header preview" className="max-w-full max-h-[calc(100vh-140px)] object-contain rounded-md" />
                </div>
              </div>
            ) : (
              <div style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}>
                <canvas ref={canvasRef} className="shadow-lg block" />
              </div>
            )
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
              <svg className="w-16 h-16 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <p className="text-sm font-medium">Upload a TIFF file to get started</p>
              <p className="text-xs mt-1 text-gray-300">Supports .tif and .tiff formats</p>
            </div>
          )}

          {/* Hover curve card */}
          {smartCursorView && imageUrl && activePlot && (
            <div
              className="absolute z-10 w-60 rounded-xl border border-blue-200 bg-white/95 p-3 shadow-xl backdrop-blur"
              style={{ left: hoverCardPos.x, top: hoverCardPos.y }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Curve Tracking</p>
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[8px] font-bold text-blue-700">
                  {selectedPlot ? "Click" : "Hover"}
                </span>
              </div>
              <div className="mt-2 space-y-1 text-[10px] text-gray-700">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Graph</span>
                  <span className="font-semibold text-gray-800">{gLabel(activePlot.graphIdx)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Point</span>
                  <span className="font-semibold text-gray-800">#{activePlot.pointIdx + 1}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Depth</span>
                  <span className="font-semibold text-gray-900">
                    {activePlot.mapped ? `${formatNumber(activePlot.mapped.depth, 2)} FT` : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Curve value</span>
                  <span className="font-semibold text-blue-700">
                    {activePlot.mapped ? formatNumber(activePlot.mapped.value, 3) : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">X range</span>
                  <span className="font-semibold text-gray-800">
                    {activePlotScale ? `${formatNumber(activePlotScale.minValue, 2)} - ${formatNumber(activePlotScale.maxValue, 2)}` : "0 - 100"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Depth range</span>
                  <span className="font-semibold text-gray-800">
                    {activePlotScale ? `${formatNumber(activePlotScale.topDepth, 1)} - ${formatNumber(activePlotScale.bottomDepth, 1)}` : "-"}
                  </span>
                </div>
                <div className="border-t border-gray-100 pt-1 mt-1 grid grid-cols-2 gap-2 text-[9px] text-gray-500">
                  <span>Px {Math.round(activePlot.x)}, {Math.round(activePlot.y)}</span>
                  <span>
                    Box {activePlotBoundary
                      ? `${Math.round(activePlotBoundary.left)}-${Math.round(activePlotBoundary.right)}`
                      : "-"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Status bar */}
          {imageUrl && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 px-5 py-2 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-full shadow-sm text-xs text-gray-600">
              <span className="font-semibold text-blue-600 capitalize">{mode} Mode</span>
              <div className="w-px h-3 bg-gray-300" />
              <span>X: {cursorPos.x} &nbsp; Y: {cursorPos.y}</span>
              <div className="w-px h-3 bg-gray-300" />
              <span>Zoom: {Math.round(zoom * 100)}%</span>
            </div>
          )}

          {isAnalyzing && <GraphLoadingSpinner />}
        </div>

        {/* ── RIGHT SIDEBAR ─────────────────────────────────────────────────────── */}
        <div className="w-72 bg-white border-l border-gray-200 flex flex-col overflow-y-auto shrink-0">

          {/* EXTRACTED CONTENT */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Extracted Content</p>
              <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded-full">{sourceGraphLines.length} graphs</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {[
                { key: "header", label: "Header" },
                { key: "graphs", label: "Graphs" },
              ].map(tab => (
                <button key={tab.key} onClick={() => setRightPanelTab(tab.key)}
                  className={`px-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-colors ${rightPanelTab === tab.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                  {tab.label}
                </button>
              ))}
            </div>

            {rightPanelTab === "header" ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                  {headerImageUrl ? (
                    <img src={headerImageUrl} alt="Header preview" className="w-full rounded-md object-contain max-h-40" />
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-gray-300 text-[10px] text-gray-400 text-center px-3">
                      Header OCR preview will appear here after detection.
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-blue-100 bg-blue-50 p-2.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Header OCR</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      {headerAccuracyLabel}
                    </span>
                  </div>
                  <button
                    onClick={openHeaderOcrViewer}
                    className="w-full rounded-md bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700">
                    View / Edit Header Content
                  </button>
                  <p className="mt-1.5 text-[10px] font-medium text-blue-700">
                    {savedHeaderText ? "Saved header text will be used in LAS export." : "Open to verify OCR text before LAS export."}
                  </p>
                </div>

                <div className="space-y-1.5">
                  {headerPreviewFields.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 rounded-md bg-gray-50 px-2.5 py-1.5">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
                      <span className="text-[10px] font-medium text-gray-800 text-right truncate max-w-[130px]" title={value}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {graphSummaryItems.length === 0 ? (
                  <p className="text-[10px] text-gray-400 italic">No graphs detected yet.</p>
                ) : (
                  graphSummaryItems.map(item => (
                    <div key={item.label} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <p className="text-xs font-semibold text-gray-800">{item.label}</p>
                        </div>
                        <button onClick={() => setVisibleGraphMap(p => ({ ...p, [item.index]: p[item.index] === false }))} className="text-gray-400 hover:text-gray-700">
                          {visibleGraphMap[item.index] !== false
                            ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                          }
                        </button>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-gray-500">
                          <span>Points</span>
                          <span className="font-semibold text-gray-700">{item.points.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-gray-500">
                          <span>Bounds</span>
                          <span className="font-semibold text-gray-700">{Math.round(item.bounds.left)} × {Math.round(item.bounds.top)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* GRAPH BOUNDARIES */}
          <div className="px-4 pt-3 pb-3 border-b border-gray-100 flex-grow">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Graph Boundaries</p>
              <button onClick={() => setShowHelp(true)}>
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </button>
            </div>
            <label className="mb-3 flex items-center gap-2 rounded-md bg-gray-50 px-2.5 py-2 text-[10px] font-semibold text-gray-600">
              <input
                type="checkbox"
                checked={showDebugOverlay}
                onChange={e => setShowDebugOverlay(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Show debug overlay
            </label>

            {sourceGraphLines.length === 0
              ? <p className="text-[10px] text-gray-400 italic">Detect graphs to set boundaries.</p>
              : (
                <div className="space-y-4">
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    Mouse selection target
                    <select
                      value={activeBoundaryIdx}
                      onChange={e => setActiveBoundaryIdx(Number(e.target.value))}
                      className="mt-1 w-full border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400">
                      {sourceGraphLines.map((_, i) => (
                        <option key={i} value={i}>Graph {gLabel(i)}</option>
                      ))}
                    </select>
                  </label>
                  {sourceGraphLines.map((_, idx) => {
                    if (visibleGraphMap[idx] === false) return null;
                    const b = graphBoundaryView[idx] || {};
                    return (
                      <div key={idx}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: GRAPH_COLORS[idx % GRAPH_COLORS.length] }} />
                          <span className="text-xs font-bold text-gray-700">Graph {gLabel(idx)} <span className="font-normal text-gray-400">({COLORS_NAMED[idx] ?? ""})</span></span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { field: "left", label: "Left X" },
                            { field: "top", label: "Top Y" },
                            { field: "right", label: "Right X" },
                            { field: "bottom", label: "Bot. Y" },
                          ].map(({ field, label }) => (
                            <div key={field} className="flex flex-col gap-0.5">
                              <label className="text-[9px] text-gray-400 font-medium uppercase">{label}</label>
                              <input
                                type="number"
                                value={Math.round(b[field] ?? 0)}
                                onChange={e => handleBoundaryChange(idx, field, e.target.value)}
                                className="border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  <button onClick={handleApplyBoundaries}
                    className="w-full py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                    Apply Boundaries
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowWorkflowInstructions(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                    title="How to use Apply Boundaries">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 21a9 9 0 100-18 9 9 0 000 18z" />
                    </svg>
                    How to use Apply Boundaries
                  </button>
                  <div className="rounded-md bg-gray-50 px-2.5 py-2 text-[10px] font-medium text-gray-500">
                    {depthScale ? (
                      <div className="space-y-1">
                        <div className="font-bold text-green-700">Scale applied. Export step: 0.50 ft</div>
                        {gridInfo.slice(0, 2).map((grid, idx) => (
                          <div key={idx}>Graph {gLabel(idx)} grid: {grid.hDivisions} rows x {grid.vDivisions} cols</div>
                        ))}
                      </div>
                    ) : appliedGraphBoundaries.length ? (
                      "Boundaries are frozen. Complete the scale modal to enable LAS export."
                    ) : (
                      "Click Apply Boundaries to freeze/crop graph regions before export."
                    )}
                  </div>
                </div>
              )
            }
          </div>

          {/* EXPORT */}
          <div className="px-4 pt-3 pb-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">LAS Export</p>
            <button onClick={exportAs}
              disabled={!appliedGraphBoundaries.length || !axisScales.length || !depthScale}
              className={`w-full flex items-center justify-center gap-2 py-2 px-3 border rounded-lg transition-colors text-xs font-semibold ${
                appliedGraphBoundaries.length && axisScales.length && depthScale
                  ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                  : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
              }`}>
              <span className="text-base">📦</span>
              Export LAS
            </button>
            <div className="download-header-wrapper relative mt-2">
              <button
                type="button"
                onClick={() => setShowDownloadMenu(prev => !prev)}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-gray-900 text-white border border-gray-900 rounded-lg hover:bg-gray-800 transition-colors text-xs font-semibold">
                Download Header
                <span className="text-[10px]">{showDownloadMenu ? "▲" : "▼"}</span>
              </button>
              {showDownloadMenu && (
                <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
                  <button
                    type="button"
                    onClick={() => handleDownloadHeader("pdf")}
                    className="block w-full px-3 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadHeader("docx")}
                    className="block w-full border-t border-gray-100 px-3 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    Word (.docx)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadHeader("xlsx")}
                    className="block w-full border-t border-gray-100 px-3 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    Excel (.xlsx)
                  </button>
                </div>
              )}
            </div>
            <p className="mt-2 text-[10px] text-gray-400">Boundary points can be edited before generating the LAS file.</p>
          </div>

        </div>
      </div>
    </div>
  );
}

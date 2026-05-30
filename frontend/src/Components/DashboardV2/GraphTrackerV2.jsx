import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import GraphLoadingSpinner from './GraphLoadingSpinner';

// Export Modal for editing boundaries before export
function ExportModal({ open, onClose, boundaries, onExport, graphLabels }) {
  const buildRows = useCallback(() => boundaries.map((b, idx) => ({
    ...b,
    curveName: graphLabels[idx] || `G${idx + 1}`,
    curveUnit: "NONE",
    minValue: 0,
    maxValue: 100,
    topDepth: DEFAULT_Y_RANGE[0],
    bottomDepth: DEFAULT_Y_RANGE[1],
    depthUnit: "F",
    depthStep: 0.5,
  })), [boundaries, graphLabels]);
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
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
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
import toast from "react-hot-toast";

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const API_URL =
  import.meta.env.VITE_GRAPH_API_URL ||
  "https://python-curvetracking.thedrake.ai/segment-and-graph";

const GRAPH_COLORS = [
  "#EF4444", "#22C55E", "#3B82F6", "#F59E0B",
  "#8B5CF6", "#06B6D4", "#F43F5E", "#84CC16",
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const LAS_API_URL =
  import.meta.env.VITE_GRAPH_LAS ||
  import.meta.env.VITE_GRAPH_Las ||
  "https://python-curvetracking.thedrake.ai/generate-las-base64";

const normBoundary = (b, W, H) => {
  const l = clamp(+b.left   || 0, 0, W);
  const r = clamp(+b.right  || W, 0, W);
  const t = clamp(+b.top    || 0, 0, H);
  const bt = clamp(+b.bottom || H, 0, H);
  return {
    left:   Math.min(l, r),
    right:  Math.max(l, r),
    top:    Math.min(t, bt),
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

const gLabel = (i) => {
  let s = "", v = i;
  do { s = String.fromCharCode(65 + (v % 26)) + s; v = Math.floor(v / 26) - 1; } while (v >= 0);
  return s;
};

const COLORS_NAMED = ["Red", "Green", "Blue", "Orange", "Purple", "Cyan", "Rose", "Lime"];
const DEFAULT_Y_RANGE = [0, 12000];

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
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
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
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
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
            <span>Graph Tracker v2.1.0</span>
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
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
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
            <p className="text-xs text-blue-700 leading-relaxed">Upload a TIFF file, enter the number of graphs to detect, and click <strong>Smart Detection AI</strong>. The AI will automatically trace the curves in the image. You can then edit them using Insert/Delete mode.</p>
          </div>
          <div className="pt-2 flex justify-end">
            <button onClick={onClose} className="px-4 py-2 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-800 transition-colors">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────────── */
export default function GraphTrackerV2() {
  const [showExport, setShowExport] = useState(false);
  const [showHeaderOcrModal, setShowHeaderOcrModal] = useState(false);
  /* ── File & Image ── */
  const [uploadedFile, setUploadedFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const uploadInputRef = useRef(null);

  /* ── Graph Data ── */
  const [sourceGraphLines, setSourceGraphLinesRaw] = useState([]);
  const [visibleGraphMap, setVisibleGraphMap] = useState({});
  const [graphBoundaries, setGraphBoundariesRaw] = useState([]);
  const [manualGraphCrop, setManualGraphCrop] = useState(null);
  const sourceGraphLinesRef = useRef([]);
  const graphBoundariesRef = useRef([]);

  useEffect(() => {
    sourceGraphLinesRef.current = sourceGraphLines;
  }, [sourceGraphLines]);

  useEffect(() => {
    graphBoundariesRef.current = graphBoundaries;
  }, [graphBoundaries]);

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
    savedHeaderText || headerOcrText || formatLasHeadersAsText(lasHeaders)
  ), [savedHeaderText, headerOcrText, lasHeaders]);

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
  }, [imageUrl, imageDimensions, zoom, sourceGraphLines, visibleGraphMap, graphBoundaryView, trackPoints, selectionDrag, manualGraphCrop]);

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
      if (e.ctrlKey && e.key === "z" &&  e.shiftKey) { e.preventDefault(); handleRedo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); handleRedo(); }
      if (e.key === "p" || e.key === "P") setMode("pan");
      if (e.key === "i" || e.key === "I") setMode("insert");
      if (e.key === "d" || e.key === "D") setMode("delete");
      if (e.key === "r" || e.key === "R") { setZoom(1); setPanOffset({ x: 0, y: 0 }); }
      if (e.key === "+" || e.key === "=") setZoom(z => Math.min(z + 0.15, 5));
      if (e.key === "-")                  setZoom(z => Math.max(z - 0.15, 0.2));
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
      setTrackPoints([]);
    };
    img.src = url;
    toast.success("File uploaded.");
  };

  /* ══════════════════════════════════════════════ AI DETECTION ══════════════════════════════════════ */
  const handleRunAI = async () => {
    if (!uploadedFile) { toast.error("Please upload a TIFF file first."); return; }
    if (!numGraphsInput || +numGraphsInput < 1) { toast.error("Enter number of graphs (≥1)."); return; }

    setIsAnalyzing(true);
    try {
      const form = new FormData();
      form.append("file", uploadedFile);
      form.append("threshold", "0.5");
      form.append("total_graphs", numGraphsInput);
      form.append("include_header_ocr", "true");
      form.append("include_depth_ocr", "false");
      if (manualGraphCrop) {
        form.append("manual_graph_box", JSON.stringify({
          x1: manualGraphCrop.left,
          y1: manualGraphCrop.top,
          x2: manualGraphCrop.right,
          y2: manualGraphCrop.bottom,
        }));
      }

      const res = await fetch(API_URL, { method: "POST", body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const lines = Object.values(data.graph_points || {}).map(l => l.map(([x, y]) => [x, y]));
      const W = data.image_dimensions?.width || imageDimensions.width;
      const H = data.image_dimensions?.height || imageDimensions.height;
      const bounds = lines.map(l => lineBounds(l, W, H));

      setSourceGraphLines(lines);
      setGraphBoundaries(bounds);
      if (data.image_dimensions) setImageDimensions(data.image_dimensions);
      const vm = {};
      lines.forEach((_, i) => vm[i] = true);
      setVisibleGraphMap(vm);
      const overlay = data.overlay_png_base64 || data.graph_png_base64;
      if (overlay) setImageUrl(`data:image/png;base64,${overlay}`);
      if (data.header_png_base64) setHeaderImageUrl(`data:image/png;base64,${data.header_png_base64}`);
      if (data.layout) setLayoutInfo(data.layout);
      if (data.las_headers) setLasHeaders(data.las_headers);
      const extractedHeaderText = data.header_ocr_text || formatLasHeadersAsText(data.las_headers);
      setHeaderOcrText(extractedHeaderText || "");
      setHeaderOcrInfo(data.header_ocr || null);
      setEditableHeaderText(extractedHeaderText || "");
      setSavedHeaderText("");
      setActiveViewTab("graph");
      setRightPanelTab("header");
      setTrackingGraph(null);
      setHoveredPlot(null);
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

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    const { x, y } = canvasCoords(e);

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
        setBoundaryDrag({ graphIdx: idx, edge: "left" });
        return;
      }
      if (nearY && Math.abs(x - b.right) <= edgeTol) {
        setBoundaryDrag({ graphIdx: idx, edge: "right" });
        return;
      }
      if (nearX && Math.abs(y - b.top) <= edgeTol) {
        setBoundaryDrag({ graphIdx: idx, edge: "top" });
        return;
      }
      if (nearX && Math.abs(y - b.bottom) <= edgeTol) {
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
      let nearest = null;
      let nearestDist = Number.POSITIVE_INFINITY;
      sourceGraphLines.forEach((line, idx) => {
        if (visibleGraphMap[idx] === false) return;
        line.forEach((pt, ptIdx) => {
          const dist = Math.hypot(pt[0] - x, pt[1] - y);
          if (dist < nearestDist && dist < 12 / zoom) {
            nearestDist = dist;
            nearest = { graphIdx: idx, pointIdx: ptIdx, x: pt[0], y: pt[1], distance: dist };
          }
        });
      });

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
      setGraphBoundaries(prev => {
        const next = [...prev];
        const cur = next[graphIdx] || graphBoundaryView[graphIdx];
        const upd = { ...cur, [edge]: edge === "left" || edge === "right" ? x : y };
        next[graphIdx] = normBoundary(upd, W, H);
        return next;
      });
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
      pushHistory(sourceGraphLines, graphBoundaries);
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

  const handleApplyBoundaries = () => {
    if (!sourceGraphLines.length) { toast.error("No graphs loaded."); return; }
    const W = imageDimensions.width, H = imageDimensions.height;
    const newLines = sourceGraphLines.map((line, idx) => {
      const b = graphBoundaryView[idx];
      return line.filter(([x, y]) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom);
    });
    setSourceGraphLines(newLines);
    pushHistory(newLines, graphBoundaries);
    toast.success("Boundaries applied.");
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
    if (!sourceGraphLines.length) { toast.error("No data to export."); return; }
    setShowExport(true);
  };

  const handleExportModal = async (editedBounds) => {
    setShowExport(false);

    const normalizedBounds = editedBounds.map((b, idx) => normBoundary(b, imageDimensions.width, imageDimensions.height));
    setGraphBoundaries(normalizedBounds);

    const graphInfo = {};
    const curveMetadata = {};
    sourceGraphLines.forEach((line, idx) => {
      const row = editedBounds[idx];
      const boundary = normalizedBounds[idx];
      const filteredLine = line.filter(([x, y]) => x >= boundary.left && x <= boundary.right && y >= boundary.top && y <= boundary.bottom);
      if (!filteredLine.length) return;
      const curveName = String(row.curveName || gLabel(idx)).trim() || gLabel(idx);

      graphInfo[`graph_${gLabel(idx)}`] = {
        x_range: [Number(row.minValue), Number(row.maxValue)],
        y_range: [Number(row.topDepth), Number(row.bottomDepth)],
        pixel_bounds: [boundary.left, boundary.top, boundary.right, boundary.bottom],
        lines: {
          [curveName]: filteredLine,
        },
      };
      curveMetadata[curveName] = {
        mnemonic: curveName,
        unit: row.curveUnit || "NONE",
        description: `Graph ${gLabel(idx)} curve`,
      };
    });

    if (!Object.keys(graphInfo).length) {
      toast.error("No points remain inside the selected boundaries.");
      return;
    }

    try {
      const response = await fetch(LAS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          graph_info: graphInfo,
          las_file_header: lasHeaders || {},
          header_ocr_text: completeHeaderText || "",
          curve_metadata: curveMetadata,
          depth_unit: editedBounds[0]?.depthUnit || "F",
          depth_step: editedBounds[0]?.depthStep || 0.5,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to export LAS file.");
      }

      const data = await response.json();
      if (!data.las_file_base64) {
        throw new Error("LAS file was not returned by the server.");
      }

      const baseName = (uploadedFile?.name || "graph").replace(/\.[^/.]+$/, "");
      const blob = base64ToBlob(data.las_file_base64, "application/octet-stream");
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${baseName}_all_curves.las`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("LAS file exported successfully.");
    } catch (err) {
      toast.error("Error exporting LAS file.");
      console.error("LAS export error:", err);
    }
  };

  /* ══════════════════════════════════════════════ RENDER ═══════════════════════════════════════════ */
  const totalPoints = sourceGraphLines.reduce((s, l) => s + l.length, 0);

  return (
    <div className="flex flex-col h-screen w-screen bg-white overflow-hidden select-none font-sans text-gray-800">
      {/* MODALS */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
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

      {/* ══ TOP BAR ══════════════════════════════════════════════════════════════ */}
      <div className="h-11 border-b border-gray-200 bg-white flex items-center justify-between px-4 shrink-0 z-10">
        {/* LEFT */}
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-1.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 12C3 12 5.5 5 9 5C12.5 5 13.5 15 17 15C20.5 15 21 12 21 12" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="9" cy="5" r="2.5" fill="#2563EB"/>
              <circle cx="17" cy="15" r="2.5" fill="#2563EB"/>
            </svg>
            <span className="font-bold text-sm text-gray-900 tracking-tight">Graph Tracker</span>
          </div>
          {/* Divider */}
          <div className="w-px h-5 bg-gray-200" />
          {/* File pill */}
          {uploadedFile && (
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full py-0.5 px-3">
              <span className="text-xs font-semibold text-gray-800 max-w-[120px] truncate">{uploadedFile.name}</span>
              <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
            </div>
          )}
        </div>

        {/* RIGHT: undo/redo + icons */}
        <div className="flex items-center gap-1 text-gray-500">
          {/* Undo */}
          <button onClick={handleUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${!canUndo ? "opacity-30 cursor-not-allowed" : ""}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 010 16H3m0-16l4-4m-4 4l4 4"/></svg>
          </button>
          {/* Redo */}
          <button onClick={handleRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${!canRedo ? "opacity-30 cursor-not-allowed" : ""}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 000 16h10m0-16l-4-4m4 4l-4 4"/></svg>
          </button>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          {/* Help */}
          <button onClick={() => setShowHelp(true)} title="Help" className="p-1.5 rounded hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </button>
          {/* Settings */}
          <button onClick={() => setShowSettings(true)} title="Settings" className="p-1.5 rounded hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </button>
          {/* Avatar */}
          <div className="ml-2 w-7 h-7 bg-blue-600 rounded-full text-white flex items-center justify-center text-xs font-bold">B</div>
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
          { m: "pan",    icon: "✋", label: "Pan" },
          { m: "insert", icon: "+",  label: "Insert Pt." },
          { m: "delete", icon: "🗑", label: "Delete Pt." },
        ].map(({ m, icon, label }) => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border transition-all ${
              mode === m
                ? m === "pan"    ? "bg-blue-50 border-blue-300 text-blue-700"
                : m === "insert" ? "bg-green-50 border-green-300 text-green-700"
                :                  "bg-red-50 border-red-300 text-red-700"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}>
            <span>{icon}</span>{label}
          </button>
        ))}

        <button onClick={() => setMode("bounds")}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border transition-all ${
            mode === "bounds"
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
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border transition-all ${
            smartCursorView
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
                <svg className="w-7 h-7 text-blue-400 mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                <span className="text-xs font-semibold text-gray-700">Upload File</span>
                <span className="text-[10px] text-gray-400 text-center">Drag & drop or <span className="text-blue-600">browse</span></span>
                <input ref={uploadInputRef} type="file" className="hidden" accept=".tif,.tiff" onChange={e => handleFileUpload(e.target.files[0])} />
              </label>
            ) : (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 flex items-center gap-2">
                <div className="bg-blue-600 text-white p-1.5 rounded-md shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                </div>
                <div className="overflow-hidden flex-1">
                  <p className="text-xs font-semibold text-gray-800 truncate">{uploadedFile.name}</p>
                  <p className="text-[10px] text-gray-400">{(uploadedFile.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <svg className="w-4 h-4 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
              </div>
            )}
          </div>

          {/* PROCESS SETUP */}
          <div className="px-4 pt-3 pb-3 border-b border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Process Setup</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Total Graphs</label>
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
                <svg className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                {isAnalyzing ? "Starting…" : "Submit & Start"}
              </button>
              <p className="text-[10px] text-gray-400">Enter total graphs, submit, and the process will start automatically.</p>
            </div>
          </div>

          {/* GRAPHS DETECTED */}
          <div className="px-4 pt-3 pb-2 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Graphs Detected</p>
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
                            ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
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
              <svg className="w-16 h-16 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              <p className="text-sm font-medium">Upload a TIFF file to get started</p>
              <p className="text-xs mt-1 text-gray-300">Supports .tif and .tiff formats</p>
            </div>
          )}

          {/* Hover curve card */}
          {smartCursorView && imageUrl && hoveredPlot && (
            <div
              className="absolute z-10 w-52 rounded-xl border border-blue-200 bg-white/95 p-3 shadow-xl backdrop-blur"
              style={{ left: hoverCardPos.x, top: hoverCardPos.y }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Curve Tracking</p>
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[8px] font-bold text-blue-700">Hover</span>
              </div>
              <div className="mt-2 space-y-1 text-[10px] text-gray-700">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Graph</span>
                  <span className="font-semibold text-gray-800">{gLabel(hoveredPlot.graphIdx)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Point</span>
                  <span className="font-semibold text-gray-800">#{hoveredPlot.pointIdx + 1}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">X</span>
                  <span className="font-semibold text-gray-800">{Math.round(hoveredPlot.x)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Y</span>
                  <span className="font-semibold text-gray-800">{Math.round(hoveredPlot.y)}</span>
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
                            ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
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
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </button>
            </div>

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
                </div>
              )
            }
          </div>

          {/* EXPORT */}
          <div className="px-4 pt-3 pb-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">LAS Export</p>
            <button onClick={exportAs}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-blue-600 text-white border border-blue-600 rounded-lg hover:bg-blue-700 transition-colors text-xs font-semibold">
              <span className="text-base">📦</span>
              Export LAS
            </button>
            <p className="mt-2 text-[10px] text-gray-400">Boundary points can be edited before generating the LAS file.</p>
            <ExportModal
              open={showExport}
              onClose={() => setShowExport(false)}
              boundaries={graphBoundaryView}
              onExport={handleExportModal}
              graphLabels={sourceGraphLines.map((_, i) => gLabel(i))}
            />
          </div>

        </div>
      </div>
    </div>
  );
}

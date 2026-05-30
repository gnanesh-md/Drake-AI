import { useState, useRef, useEffect, useMemo } from "react";
import Navbar from "./navbar";
import toast, { Toaster } from "react-hot-toast";
import AITrackPrediction from "./AITrackPrediction";
import SmartCursorViewer from "./SmartCursorViewer";
import oilRefineryLoading from "../../assets/oil_refinery_loading_animation.svg";
import {
  FiChevronDown,
  FiDownload,
  FiEye,
  FiFile,
  FiHelpCircle,
  FiMenu,
  FiMinus,
  FiMove,
  FiPlus,
  FiRefreshCw,
  FiSettings,
  FiTrash2,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";

const apiUrl =
  import.meta.env.VITE_GRAPH_API_URL ||
  "https://python-curvetracking.thedrake.ai/segment-and-graph";
const lasApiUrl =
  import.meta.env.VITE_GRAPH_LAS ||
  import.meta.env.VITE_GRAPH_Las ||
  "https://python-curvetracking.thedrake.ai/generate-las-base64";
const GRAPH_COLORS = [
  "#FF0000",
  "#00FF00",
  "#0000FF",
  "#FFA500",
  "#800080",
  "#00FFFF",
  "#FFC0CB",
  "#FFFF00",
  "#A52A2A",
  "#008000",
];
const GRAPH_COLOR_NAMES = [
  "Red", "Green", "Blue", "Orange", "Purple",
  "Cyan", "Pink", "Yellow", "Brown", "Dark Green",
];
const BOUNDARY_EDGE_HIT_TOLERANCE_PX = 8;
const NEAR_POINT_MIN_DISTANCE_PX = 10;
const DEFAULT_X_RANGE = [0, 100];
const DEFAULT_Y_RANGE = [0, 12000];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const OilRefineryLoader = ({ compact = false, overlay = false }) => (
  <div className="flex flex-col items-center justify-center text-center">
    <img
      src={oilRefineryLoading}
      alt="Loading"
      className={compact ? "h-44 w-44 object-contain" : "h-72 w-72 object-contain"}
    />
    <p className={`mt-3 font-semibold ${overlay ? "text-white" : "text-slate-800"}`}>Processing image...</p>
    <p className={`mt-1 text-sm ${overlay ? "text-white/80" : "text-slate-500"}`}>Extracting graph curves and header OCR.</p>
  </div>
);

const getGraphLabel = (index) => {
  let label = "";
  let value = index;
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
};

const normalizeBoundary = (boundary, width, height) => {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 0;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 0;
  const leftRaw = Number(boundary?.left ?? 0);
  const rightRaw = Number(boundary?.right ?? safeWidth);
  const topRaw = Number(boundary?.top ?? 0);
  const bottomRaw = Number(boundary?.bottom ?? safeHeight);

  let left = clamp(Number.isFinite(leftRaw) ? leftRaw : 0, 0, safeWidth);
  let right = clamp(
    Number.isFinite(rightRaw) ? rightRaw : safeWidth,
    0,
    safeWidth
  );
  let top = clamp(Number.isFinite(topRaw) ? topRaw : 0, 0, safeHeight);
  let bottom = clamp(
    Number.isFinite(bottomRaw) ? bottomRaw : safeHeight,
    0,
    safeHeight
  );

  if (left > right) [left, right] = [right, left];
  if (top > bottom) [top, bottom] = [bottom, top];

  return { left, right, top, bottom };
};

const getLineBoundary = (line, width, height) => {
  if (!line || !line.length) {
    return normalizeBoundary(
      { left: 0, right: width, top: 0, bottom: height },
      width,
      height
    );
  }
  const xs = line.map(([x]) => x);
  const ys = line.map(([, y]) => y);
  return normalizeBoundary(
    {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    },
    width,
    height
  );
};

const dedupeLinePoints = (
  line,
  { precision = 3, minDistance = NEAR_POINT_MIN_DISTANCE_PX } = {}
) => {
  const seenExact = new Set();
  const unique = [];
  const spatialBuckets = new Map();
  const safeDistance = Math.max(0, minDistance);
  const cellSize = safeDistance > 0 ? safeDistance : 1;
  const distanceSqThreshold = safeDistance * safeDistance;
  const getCellKey = (cellX, cellY) => `${cellX}:${cellY}`;

  (line || []).forEach((point) => {
    const [x, y] = point || [];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const key = `${x.toFixed(precision)}:${y.toFixed(precision)}`;
    if (seenExact.has(key)) return;

    if (safeDistance > 0) {
      const cellX = Math.floor(x / cellSize);
      const cellY = Math.floor(y / cellSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const neighborPoints =
            spatialBuckets.get(getCellKey(cellX + dx, cellY + dy)) || [];
          for (let i = 0; i < neighborPoints.length; i++) {
            const [nx, ny] = neighborPoints[i];
            const dxVal = x - nx;
            const dyVal = y - ny;
            if (dxVal * dxVal + dyVal * dyVal <= distanceSqThreshold) {
              return;
            }
          }
        }
      }

      const ownKey = getCellKey(cellX, cellY);
      const ownBucket = spatialBuckets.get(ownKey) || [];
      ownBucket.push([x, y]);
      spatialBuckets.set(ownKey, ownBucket);
    }

    seenExact.add(key);
    unique.push([x, y]);
  });

  return unique;
};

// ─── Settings Modal ─────────────────────────────────────────────────────────
function SettingsModal({ onClose }) {
  const [threshold, setThreshold] = useState("0.5");
  const [minDist, setMinDist] = useState("10");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[440px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
              <FiSettings className="text-gray-600" size={16} />
            </div>
            <h2 className="text-base font-bold text-gray-900">Settings</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><FiX size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Detection</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Detection Threshold <span className="text-gray-400 font-normal">(0.0 – 1.0)</span></label>
                <div className="flex gap-3 items-center">
                  <input type="range" min="0" max="1" step="0.05" value={threshold} onChange={e => setThreshold(e.target.value)} className="flex-1 accent-blue-600" />
                  <span className="text-sm font-semibold text-gray-700 w-10 text-right">{threshold}</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Near-Point Min Distance <span className="text-gray-400 font-normal">(px)</span></label>
                <div className="flex gap-3 items-center">
                  <input type="range" min="1" max="50" value={minDist} onChange={e => setMinDist(e.target.value)} className="flex-1 accent-blue-600" />
                  <span className="text-sm font-semibold text-gray-700 w-12 text-right">{minDist} px</span>
                </div>
              </div>
            </div>
          </div>
          <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
            <span className="text-xs text-gray-400">Graph Tracker v2.1.0</span>
            <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">Save & Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Help Modal ───────────────────────────────────────────────────────────────
function HelpModal({ onClose }) {
  const shortcuts = [
    ["Submit button", "Run AI curve tracking on uploaded TIFF"],
    ["Ctrl+Z", "Undo last edit"],
    ["Ctrl+Y", "Redo last undone edit"],
    ["Insert Mode", "Click on canvas to add a point between segments"],
    ["Delete Mode", "Click on a point to remove it"],
    ["Zoom In / Out", "Change canvas magnification"],
    ["Apply Boundaries", "Clip graph points to the selected X/Y boundary box"],
    ["AI Track Prediction", "Automated log type & scale classification module"],
    ["Smart Cursor Viewer", "Real-time depth tracking crosshair on graph image"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[480px]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <FiHelpCircle className="text-blue-600" size={16} />
            </div>
            <h2 className="text-base font-bold text-gray-900">Help & Keyboard Shortcuts</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><FiX size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="divide-y divide-gray-100">
            {shortcuts.map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-gray-600">{desc}</span>
                <kbd className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-mono rounded border border-gray-200 whitespace-nowrap ml-3">{key}</kbd>
              </div>
            ))}
          </div>
          <div className="bg-blue-50 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-blue-900 mb-1">Curve Tracking</h4>
            <p className="text-xs text-blue-700 leading-relaxed">Upload a TIFF, enter the number of graphs, then click <strong>Submit</strong>. The AI backend will automatically trace the curves and render them on the canvas.</p>
          </div>
          <div className="flex justify-end">
            <button onClick={onClose} className="px-4 py-2 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-800">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar nav button ───────────────────────────────────────────────────────
function SidebarModuleButton({ icon, label, active, activeColor = "blue", onClick }) {
  const colorMap = {
    blue: {
      active: "bg-blue-900 border-blue-600 text-blue-200",
      dot: "bg-blue-400",
    },
    purple: {
      active: "bg-purple-900 border-purple-600 text-purple-200",
      dot: "bg-purple-400",
    },
  };
  const colors = colorMap[activeColor] || colorMap.blue;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-all duration-200 select-none ${
        active
          ? `${colors.active}`
          : "bg-[#1F2937] border-gray-600 text-gray-300 hover:bg-gray-700 hover:border-gray-500 hover:text-white"
      }`}
    >
      {active && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors.dot}`} />
      )}
      {!active && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-gray-600" />}
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

const Canvas = () => {
  // ── NEW: active module state ──────────────────────────────────────────────
  const [activeModule, setActiveModule] = useState(null); // null | 'ai-prediction' | 'smart-cursor'

  // ── Settings / Help modals ────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // ── Undo / Redo history ──────────────────────────────────────────────────
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const pushHistory = (lines, bounds) => {
    setHistory(prev => {
      const next = prev.slice(0, historyIdx + 1);
      return [...next, { lines: JSON.parse(JSON.stringify(lines)), bounds: JSON.parse(JSON.stringify(bounds)) }];
    });
    setHistoryIdx(i => i + 1);
  };

  const handleUndo = () => {
    if (historyIdx <= 0) return;
    const prev = history[historyIdx - 1];
    setSourceGraphLines(prev.lines);
    setGraphBoundaries(prev.bounds);
    setHistoryIdx(i => i - 1);
  };

  const handleRedo = () => {
    if (historyIdx >= history.length - 1) return;
    const next = history[historyIdx + 1];
    setSourceGraphLines(next.lines);
    setGraphBoundaries(next.bounds);
    setHistoryIdx(i => i + 1);
  };

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;

  const [uploadedFile, setUploadedFile] = useState(null);
  const [threshold] = useState("0.5"); // default, hidden from user
  const [imageUrl, setImageUrl] = useState(null); // Original image URL
  const [headerImageUrl, setHeaderImageUrl] = useState(null);
  const [graphImageUrl, setGraphImageUrl] = useState(null);
  const [layoutInfo, setLayoutInfo] = useState(null);
  const [activeViewTab, setActiveViewTab] = useState("graph");
  const [rightPanelTab, setRightPanelTab] = useState("header");
  const [selectedGraphIdx, setSelectedGraphIdx] = useState(null);
  const [visibleGraphMap, setVisibleGraphMap] = useState({});
  const [nodes, setNodes] = useState([]); // Array of {x, y}
  const [edges, setEdges] = useState([]); // Array of {from: {x, y}, to: {x, y}}
  const [imageDimensions, setImageDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [zoom, setZoom] = useState(0.5);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isExportPopupOpen, setIsExportPopupOpen] = useState(false);
  const [isHeaderContentOpen, setIsHeaderContentOpen] = useState(false);
  const [imageName, setImageName] = useState("");
  const canvasRef = useRef(null);
  const [isInserting, setIsInserting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [numGraphs, setNumGraphs] = useState("");
  const [sourceGraphLines, setSourceGraphLines] = useState([]);
  const [graphBoundaries, setGraphBoundaries] = useState([]);
  const [exportXMinMax, setExportXMinMax] = useState([]);
  const [sharedExportYRange, setSharedExportYRange] = useState({
    yMin: "",
    yMax: "",
  });
  const [nearPointMinDistance, setNearPointMinDistance] = useState(
    NEAR_POINT_MIN_DISTANCE_PX
  );
  const [dragging, setDragging] = useState({
    lineIdx: null,
    pointIdx: null,
    offsetX: 0,
    offsetY: 0,
  });
  const [boundaryDragging, setBoundaryDragging] = useState({
    graphIdx: null,
    edge: null,
  });
  const [lasHeaders, setLasHeaders] = useState(null);
  const [headerOcrText, setHeaderOcrText] = useState("");
  const [headerOcrInfo, setHeaderOcrInfo] = useState(null);
  const uploadInputRef = useRef(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(250);
  const [rightPanelWidth, setRightPanelWidth] = useState(410);
  const [rightPanelVisible, setRightPanelVisible] = useState(true);
  const [viewerHeight, setViewerHeight] = useState(620);
  const [resizeDrag, setResizeDrag] = useState(null);
  const [dataPreviewLimit, setDataPreviewLimit] = useState(6);

  const graphBoundaryView = useMemo(() => {
    const width = imageDimensions.width;
    const height = imageDimensions.height;
    return sourceGraphLines.map((line, idx) => {
      if (graphBoundaries[idx]) {
        return normalizeBoundary(graphBoundaries[idx], width, height);
      }
      return getLineBoundary(line, width, height);
    });
  }, [
    sourceGraphLines,
    graphBoundaries,
    imageDimensions.width,
    imageDimensions.height,
  ]);

  const graphLegendItems = useMemo(
    () =>
      sourceGraphLines.map((line, idx) => ({
        label: getGraphLabel(idx),
        color: GRAPH_COLORS[idx % GRAPH_COLORS.length],
        points: (line || []).length,
      })),
    [sourceGraphLines]
  );

  const visibleGraphLines = useMemo(
    () =>
      sourceGraphLines.map((line, idx) =>
        visibleGraphMap[idx] === false ? [] : line
      ),
    [sourceGraphLines, visibleGraphMap]
  );

  const formatLasHeadersAsText = (headers) => {
    const sections = [
      ["las.version", "LAS VERSION"],
      ["las.well", "LAS WELL HEADER"],
    ];
    return sections
      .flatMap(([sectionKey, sectionTitle]) => {
        const rows = headers?.[sectionKey] || [];
        if (!rows.length) return [];
        return [
          sectionTitle,
          ...rows.map((item) => {
            const mnemonic = item?.Mnemonic || "";
            const value = item?.Value ?? "BLANK";
            const unit = item?.Unit ? ` ${item.Unit}` : "";
            const description = item?.Description ? ` : ${item.Description}` : "";
            return `${mnemonic}: ${value}${unit}${description}`;
          }),
        ];
      })
      .join("\n");
  };

  const completeHeaderText = useMemo(() => {
    const rawText = String(headerOcrText || "").trim();
    if (rawText) return rawText;
    return formatLasHeadersAsText(lasHeaders);
  }, [headerOcrText, lasHeaders]);

  const graphVisibilityCount = useMemo(
    () =>
      sourceGraphLines.filter((_, idx) => visibleGraphMap[idx] !== false)
        .length,
    [sourceGraphLines, visibleGraphMap]
  );

  const headerPreviewFields = useMemo(() => {
    const wellItems = lasHeaders?.["las.well"] || [];
    const pick = (mnemonics, fallback = "-") => {
      const item = wellItems.find((entry) =>
        mnemonics.includes(String(entry?.Mnemonic || "").toUpperCase())
      );
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

  const imageFileSize = uploadedFile
    ? `${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB`
    : "-";
  const statusLabel = isLoading
    ? "Processing..."
    : imageUrl
      ? "Processed Successfully"
      : uploadedFile
        ? "Uploaded Successfully"
        : "No File Uploaded";
  const hasGraphData = sourceGraphLines.some((line) => line && line.length > 0);

  const resetLayout = () => {
    setLeftPanelWidth(250);
    setRightPanelWidth(410);
    setRightPanelVisible(true);
    setViewerHeight(620);
    toast.success("Layout reset.");
  };

  const startResize = (target, event) => {
    event.preventDefault();
    setResizeDrag({
      target,
      startX: event.clientX,
      startY: event.clientY,
      leftPanelWidth,
      rightPanelWidth,
      viewerHeight,
    });
  };

  // Handle image upload
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setUploadedFile(file);
    setImageName(file.name);
    setHeaderOcrText("");
    setHeaderOcrInfo(null);
    // No image display or dimension logic here; only after backend processing
  };

  const handleDroppedFile = (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const extension = file.name.toLowerCase().split(".").pop();
    if (!["tif", "tiff"].includes(extension)) {
      toast.error("Please upload a .tif or .tiff file.");
      return;
    }
    setUploadedFile(file);
    setImageName(file.name);
    setHeaderOcrText("");
    setHeaderOcrInfo(null);
  };

  const openFilePicker = () => {
    uploadInputRef.current?.click();
  };

  // Handle threshold submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Submitting form");
    if (!uploadedFile) {
      toast.error("Please upload a .tiff file first.");
      return;
    }
    if (!threshold) {
      toast.error("Please enter a threshold value.");
      return;
    }
    if (!numGraphs) {
      toast.error("Please enter the number of graphs.");
      return;
    }
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadedFile);
      formData.append("threshold", threshold);
      formData.append("total_graphs", numGraphs);
      formData.append("include_header_ocr", "true");
      formData.append("include_depth_ocr", "false");
      const response = await fetch(apiUrl, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("API error");
      const data = await response.json();
      console.log("API response:", data);
      setNodes([]);
      setEdges([]);
      const nextLines = Object.values(data.graph_points || {}).map((line) =>
        line.map(([x, y]) => [x, y])
      );
      setSourceGraphLines(nextLines);
      setSelectedGraphIdx(nextLines.length ? 0 : null);
      setVisibleGraphMap(
        nextLines.reduce((acc, _line, idx) => {
          acc[idx] = true;
          return acc;
        }, {})
      );
      setGraphBoundaries(
        nextLines.map((line) =>
          getLineBoundary(
            line,
            data.image_dimensions?.width || 0,
            data.image_dimensions?.height || 0
          )
        )
      );
      setExportXMinMax([]);
      setImageDimensions(data.image_dimensions || { width: 0, height: 0 });
      setLayoutInfo(data.layout || null);
      if (data.overlay_png_base64) {
        setImageUrl(`data:image/png;base64,${data.overlay_png_base64}`);
      }
      if (data.header_png_base64) {
        setHeaderImageUrl(`data:image/png;base64,${data.header_png_base64}`);
      }
      if (data.graph_png_base64) {
        setGraphImageUrl(`data:image/png;base64,${data.graph_png_base64}`);
      }
      if (data.las_headers) {
        setLasHeaders(data.las_headers);
        console.log("lasHeaders set:", data.las_headers);
      }
      setHeaderOcrText(data.header_ocr_text || "");
      setHeaderOcrInfo(data.header_ocr || null);
      setActiveViewTab("graph");
      setRightPanelTab("header");
      // Push initial history snapshot for undo/redo
      pushHistory(nextLines, nextLines.map((line) =>
        getLineBoundary(line, data.image_dimensions?.width || 0, data.image_dimensions?.height || 0)
      ));
      toast.success("Image processed successfully!");
    } catch (err) {
      console.error("Error in handleSubmit:", err);
      toast.error("Error processing image.");
    } finally {
      setIsLoading(false);
    }
  };

  // Debug drawing data
  useEffect(() => {
    console.log("imageUrl:", imageUrl);
    console.log("imageDimensions:", imageDimensions);
    console.log("nodes:", nodes);
    console.log("edges:", edges);
  }, [imageUrl, imageDimensions, nodes, edges]);

  useEffect(() => {
    if (!resizeDrag) return;

    const handleMove = (event) => {
      if (resizeDrag.target === "left") {
        setLeftPanelWidth(clamp(event.clientX, 220, 420));
      }
      if (resizeDrag.target === "right") {
        const nextWidth = window.innerWidth - event.clientX;
        setRightPanelWidth(clamp(nextWidth, 320, 560));
      }
      if (resizeDrag.target === "viewer") {
        const deltaY = event.clientY - resizeDrag.startY;
        setViewerHeight(clamp(resizeDrag.viewerHeight + deltaY, 360, 900));
      }
    };

    const handleUp = () => setResizeDrag(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    document.body.style.cursor =
      resizeDrag.target === "viewer" ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizeDrag]);

  // Draw image, edges, and nodes
  useEffect(() => {
    if (activeModule !== null) return; // skip drawing when a module is open
    if (activeViewTab !== "graph") return;
    if (!imageUrl || !imageDimensions.width || !imageDimensions.height) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const displayWidth = imageDimensions.width * zoom;
    const displayHeight = imageDimensions.height * zoom;
    canvas.width = displayWidth;
    canvas.height = displayHeight;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    const img = new window.Image();
    img.src = imageUrl;
    img.onload = () => {
      ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
      sourceGraphLines.forEach((line, idx) => {
        if (visibleGraphMap[idx] === false) return;
        if (!line || line.length === 0) return;
        ctx.strokeStyle = GRAPH_COLORS[idx % GRAPH_COLORS.length];
        ctx.lineWidth = selectedGraphIdx === idx ? 3 : 2;
        if (line.length > 1) {
          ctx.beginPath();
          const [x0, y0] = line[0];
          ctx.moveTo(x0 * zoom, y0 * zoom);
          for (let i = 1; i < line.length; i++) {
            const [x, y] = line[i];
            ctx.lineTo(x * zoom, y * zoom);
          }
          ctx.stroke();
        }
        for (let i = 0; i < line.length; i++) {
          const [x, y] = line[i];
          ctx.beginPath();
          ctx.arc(x * zoom, y * zoom, selectedGraphIdx === idx ? 4 : 3, 0, 2 * Math.PI);
          ctx.fillStyle = GRAPH_COLORS[idx % GRAPH_COLORS.length];
          ctx.fill();
        }

        const [labelX, labelY] = line[0];
        const label = getGraphLabel(idx);
        ctx.save();
        ctx.font = "bold 16px sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
        ctx.lineWidth = 4;
        ctx.strokeText(label, labelX * zoom + 8, labelY * zoom - 8);
        ctx.fillText(label, labelX * zoom + 8, labelY * zoom - 8);
        ctx.restore();
      });

      if (graphBoundaryView.length > 0) {
        ctx.save();
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        graphBoundaryView.forEach((boundary, idx) => {
          if (visibleGraphMap[idx] === false) return;
          if (!boundary) return;
          ctx.strokeStyle = GRAPH_COLORS[idx % GRAPH_COLORS.length];
          const width = (boundary.right - boundary.left) * zoom;
          const height = (boundary.bottom - boundary.top) * zoom;
          ctx.strokeRect(boundary.left * zoom, boundary.top * zoom, width, height);
        });
        ctx.restore();
      }
      ctx.restore();
    };
  }, [imageUrl, imageDimensions, zoom, sourceGraphLines, graphBoundaryView, activeModule, activeViewTab, selectedGraphIdx, visibleGraphMap]);

  const getDistanceToSegment = (p, v, w) => {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return Math.sqrt((p.x - v.x) ** 2 + (p.y - v.y) ** 2);
    const t = Math.max(
      0,
      Math.min(1, ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2)
    );
    const projection = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
    return Math.sqrt((p.x - projection.x) ** 2 + (p.y - projection.y) ** 2);
  };

  const handleCanvasMouseDown = (event) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / zoom;
    const y = (event.clientY - rect.top) / zoom;

    if (isDeleting) {
      for (let lineIdx = 0; lineIdx < sourceGraphLines.length; lineIdx++) {
        if (visibleGraphMap[lineIdx] === false) continue;
        const line = sourceGraphLines[lineIdx];
        for (let pointIdx = 0; pointIdx < line.length; pointIdx++) {
          const [px, py] = line[pointIdx];
          const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
          if (dist < 10 / zoom) {
            const newGraphLines = sourceGraphLines.map((l, idx) => {
              if (idx !== lineIdx) return l;
              return l.filter((_, pIdx) => pIdx !== pointIdx);
            });
            setSourceGraphLines(newGraphLines);
            return;
          }
        }
      }
    }

    if (isInserting) {
      let minDist = Infinity;
      let bestLineIdx = -1;
      let bestSegIdx = -1;
      for (let lineIdx = 0; lineIdx < sourceGraphLines.length; lineIdx++) {
        if (visibleGraphMap[lineIdx] === false) continue;
        const line = sourceGraphLines[lineIdx];
        for (let i = 0; i < line.length - 1; i++) {
          const v = { x: line[i][0], y: line[i][1] };
          const w = { x: line[i + 1][0], y: line[i + 1][1] };
          const p = { x, y };
          const dist = getDistanceToSegment(p, v, w);
          if (dist < minDist) {
            minDist = dist;
            bestLineIdx = lineIdx;
            bestSegIdx = i;
          }
        }
      }
      if (bestLineIdx !== -1 && bestSegIdx !== -1) {
        const newGraphLines = sourceGraphLines.map((line, idx) => {
          if (idx !== bestLineIdx) return line;
          const newLine = [...line];
          newLine.splice(bestSegIdx + 1, 0, [x, y]);
          return newLine;
        });
        setSourceGraphLines(newGraphLines);
      }
      return;
    }

    if (!isInserting && !isDeleting) {
      const tolerance = BOUNDARY_EDGE_HIT_TOLERANCE_PX / zoom;
      let bestBoundaryEdge = null;
      let minDist = Infinity;
      graphBoundaryView.forEach((boundary, graphIdx) => {
        if (!boundary) return;
        const inVerticalSpan = y >= boundary.top - tolerance && y <= boundary.bottom + tolerance;
        const inHorizontalSpan = x >= boundary.left - tolerance && x <= boundary.right + tolerance;
        if (inVerticalSpan) {
          const leftDist = Math.abs(x - boundary.left);
          if (leftDist <= tolerance && leftDist < minDist) {
            minDist = leftDist;
            bestBoundaryEdge = { graphIdx, edge: "left" };
          }
          const rightDist = Math.abs(x - boundary.right);
          if (rightDist <= tolerance && rightDist < minDist) {
            minDist = rightDist;
            bestBoundaryEdge = { graphIdx, edge: "right" };
          }
        }
        if (inHorizontalSpan) {
          const topDist = Math.abs(y - boundary.top);
          if (topDist <= tolerance && topDist < minDist) {
            minDist = topDist;
            bestBoundaryEdge = { graphIdx, edge: "top" };
          }
          const bottomDist = Math.abs(y - boundary.bottom);
          if (bottomDist <= tolerance && bottomDist < minDist) {
            minDist = bottomDist;
            bestBoundaryEdge = { graphIdx, edge: "bottom" };
          }
        }
      });
      if (bestBoundaryEdge) {
        setBoundaryDragging(bestBoundaryEdge);
        return;
      }

      for (let lineIdx = 0; lineIdx < sourceGraphLines.length; lineIdx++) {
        if (visibleGraphMap[lineIdx] === false) continue;
        if (selectedGraphIdx !== null && selectedGraphIdx !== lineIdx) continue;
        const line = sourceGraphLines[lineIdx];
        for (let pointIdx = 0; pointIdx < line.length; pointIdx++) {
          const [px, py] = line[pointIdx];
          const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
          if (dist < 10 / zoom) {
            setDragging({
              lineIdx,
              pointIdx,
              offsetX: px - x,
              offsetY: py - y,
            });
            return;
          }
        }
      }
    }
  };

  const handleCanvasMouseMove = (event) => {
    if (boundaryDragging.graphIdx !== null && boundaryDragging.edge) {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (event.clientX - rect.left) / zoom;
      const y = (event.clientY - rect.top) / zoom;
      const width = imageDimensions.width || 0;
      const height = imageDimensions.height || 0;

      setGraphBoundaries((prev) => {
        const next = [...prev];
        const graphIdx = boundaryDragging.graphIdx;
        const current =
          next[graphIdx] ||
          graphBoundaryView[graphIdx] ||
          getLineBoundary(sourceGraphLines[graphIdx], width, height);
        const updated = { ...current };

        if (boundaryDragging.edge === "left" || boundaryDragging.edge === "right") {
          updated[boundaryDragging.edge] = x;
        } else {
          updated[boundaryDragging.edge] = y;
        }

        next[graphIdx] = normalizeBoundary(updated, width, height);
        return next;
      });
      return;
    }

    if (dragging.lineIdx === null || dragging.pointIdx === null) return;
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / zoom;
    const y = (event.clientY - rect.top) / zoom;
    setSourceGraphLines((prevLines) => {
      return prevLines.map((line, lIdx) => {
        if (lIdx !== dragging.lineIdx) return line;
        return line.map((pt, pIdx) => {
          if (pIdx !== dragging.pointIdx) return pt;
          return [x + dragging.offsetX, y + dragging.offsetY];
        });
      });
    });
  };

  const handleCanvasMouseUp = () => {
    if (boundaryDragging.graphIdx !== null) {
      setBoundaryDragging({ graphIdx: null, edge: null });
    }
    if (dragging.lineIdx !== null && dragging.pointIdx !== null) {
      setDragging({ lineIdx: null, pointIdx: null, offsetX: 0, offsetY: 0 });
    }
  };

  const handleZoomIn = () => {
    setZoom((prevZoom) => Math.min(prevZoom + 0.1, 3));
  };
  const handleZoomOut = () => {
    setZoom((prevZoom) => Math.max(prevZoom - 0.1, 0.3));
  };
  const togglePopup = () => setIsPopupOpen(!isPopupOpen);
  const toggleExportPopup = () => setIsExportPopupOpen((prev) => !prev);
  const handleBoundaryChange = (graphIndex, field, value) => {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) return;
    const width = imageDimensions.width || 0;
    const height = imageDimensions.height || 0;

    setGraphBoundaries((prev) => {
      const next = [...prev];
      const current =
        next[graphIndex] ||
        getLineBoundary(sourceGraphLines[graphIndex], width, height);
      const updated = { ...current, [field]: parsedValue };
      const normalized = normalizeBoundary(updated, width, height);
      next[graphIndex] = normalized;
      return next;
    });
  };

  const handleApplyBoundaries = () => {
    if (!sourceGraphLines.length) {
      toast.error("Please process an image first.");
      return;
    }

    const width = imageDimensions.width || 0;
    const height = imageDimensions.height || 0;
    const boundaries = sourceGraphLines.map((line, idx) =>
      normalizeBoundary(
        graphBoundaries[idx] || getLineBoundary(line, width, height),
        width,
        height
      )
    );
    setGraphBoundaries(boundaries);

    const emptiedGraphs = [];
    let overlapAndNearRemovedCount = 0;
    const clippedGraphLines = sourceGraphLines.map((line, idx) => {
      const boundary = boundaries[idx];
      const clipped = (line || []).filter(
        ([x, y]) =>
          x >= boundary.left &&
          x <= boundary.right &&
          y >= boundary.top &&
          y <= boundary.bottom
      );
      const deduped = dedupeLinePoints(clipped, {
        minDistance: nearPointMinDistance,
      });
      overlapAndNearRemovedCount += clipped.length - deduped.length;

      if ((line || []).length > 0 && deduped.length === 0) {
        emptiedGraphs.push(getGraphLabel(idx));
      }
      return deduped;
    });

    setSourceGraphLines(clippedGraphLines);
    if (emptiedGraphs.length > 0) {
      toast.error(`No points remain for graph(s): ${emptiedGraphs.join(", ")}`);
    } else if (overlapAndNearRemovedCount > 0) {
      toast.success(
        `Boundaries applied. Removed ${overlapAndNearRemovedCount} overlapping/nearby point(s).`
      );
    } else {
      toast.success("Boundaries applied.");
    }
  };

  function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  const handleExportPoints = async (graph_info, lasHeaders) => {
    console.log("graph_info in handleExportPoints:", graph_info);

    const graphEntries = Object.entries(graph_info || {});
    if (
      graphEntries.length === 0 ||
      !sourceGraphLines.some((line) => line && line.length > 0)
    ) {
      toast.error("No points to export.");
      return;
    }

    try {
      if (!completeHeaderText.trim()) {
        toast.error("No header OCR content found. Process the image again before exporting LAS.");
        return;
      }
      const imageBaseName = (imageName || "graph").replace(/\.[^/.]+$/, "");
      const payload = {
        graph_info,
        las_file_header: lasHeaders,
        header_ocr_text: completeHeaderText,
      };
      console.log("PAYLOAD", payload);

      const response = await fetch(lasApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to export LAS file.");
      }

      const data = await response.json();
      if (!data.las_file_base64) {
        throw new Error("LAS file was not returned by the server.");
      }

      const blob = base64ToBlob(
        data.las_file_base64,
        "application/octet-stream"
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${imageBaseName}_all_curves.las`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("LAS file with all curves exported successfully!");
    } catch (err) {
      toast.error("Error exporting LAS file.");
      console.log("Export error:", err);
      if (err instanceof Error) {
        console.error("Error details:", err);
      } else {
        console.error("Unknown error:", err);
      }
    }
  };

  const buildGraphInfoForExport = () => {
    const graph_info = {};
    sourceGraphLines.forEach((line, idx) => {
      const cleanedLine = dedupeLinePoints(line, {
        minDistance: nearPointMinDistance,
      });
      if (!cleanedLine || cleanedLine.length === 0) return;
      const graphLabel = getGraphLabel(idx);
      graph_info[`graph_${graphLabel}`] = {
        x_range: DEFAULT_X_RANGE,
        y_range: DEFAULT_Y_RANGE,
        lines: {
          [graphLabel]: cleanedLine,
        },
      };
    });
    return graph_info;
  };

  const handleQuickExportLas = () => {
    const graphInfo = buildGraphInfoForExport();
    if (!Object.keys(graphInfo).length) {
      toast.error("Process an image before exporting LAS.");
      return;
    }
    handleExportPoints(graphInfo, lasHeaders || {});
  };

  const requireProcessedImage = () => {
    if (!hasGraphData) {
      toast.error("Upload a TIFF and click Submit first.");
      return false;
    }
    return true;
  };

  const toggleGraphVisibility = (idx) => {
    setVisibleGraphMap((prev) => ({
      ...prev,
      [idx]: prev[idx] === false,
    }));
  };

  const selectGraph = (idx) => {
    if (!requireProcessedImage()) return;
    setSelectedGraphIdx((prev) => (prev === idx ? null : idx));
    setActiveViewTab("graph");
  };

  const showAllGraphs = () => {
    if (!requireProcessedImage()) return;
    setVisibleGraphMap(
      sourceGraphLines.reduce((acc, _line, idx) => {
        acc[idx] = true;
        return acc;
      }, {})
    );
    setSelectedGraphIdx(null);
    setActiveViewTab("graph");
  };

  const togglePreviewTarget = () => {
    setActiveViewTab((prev) => {
      const next = prev === "graph" ? "header" : "graph";
      toast.success(`Showing ${next === "graph" ? "graph" : "header"} bar.`);
      return next;
    });
  };

  const toggleRightPanel = () => {
    setRightPanelVisible((prev) => {
      const next = !prev;
      toast.success(next ? "Extracted content shown." : "Extracted content hidden.");
      return next;
    });
  };

  const toggleFullDataPreview = () => {
    if (!hasGraphData) {
      toast.error("Process an image before viewing data.");
      return;
    }
    setDataPreviewLimit((prev) => {
      const selectedLine = sourceGraphLines[selectedGraphIdx ?? 0] || [];
      return prev >= selectedLine.length ? 6 : selectedLine.length;
    });
  };

  // ─── Module toggle helper ────────────────────────────────────────────────────
  const toggleModule = (moduleName) => {
    setActiveModule((prev) => (prev === moduleName ? null : moduleName));
  };

  return (
    <div className="min-h-screen bg-[#F7FAFF] text-slate-900">
      <Toaster />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      <header className="h-[52px] border-b border-slate-200 bg-white flex items-center justify-between px-6">
        <div className="flex items-center gap-4 min-w-[260px]">
          <div className="flex items-center gap-3">
            <div className="relative h-9 w-9 text-blue-600">
              <span className="absolute left-1 top-5 h-2 w-2 rounded-full bg-blue-600" />
              <span className="absolute left-3 top-2 h-2 w-2 rounded-full bg-blue-600" />
              <span className="absolute left-5 top-4 h-2 w-2 rounded-full bg-blue-600" />
              <span className="absolute left-7 top-1 h-2 w-2 rounded-full bg-blue-600" />
              <span className="absolute left-[7px] top-[21px] h-[2px] w-7 -rotate-45 bg-blue-600" />
              <span className="absolute left-[16px] top-[12px] h-[2px] w-5 rotate-45 bg-blue-600" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Graph Tracker</h1>
          </div>
          <button
            onClick={resetLayout}
            className="ml-8 grid h-10 w-10 place-items-center rounded-md text-slate-700 hover:bg-slate-100"
            title="Reset layout"
          >
            <FiMenu size={22} />
          </button>
          <button
            type="button"
            onClick={() => setIsHeaderContentOpen(true)}
            className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          >
            View Header OCR
          </button>
        </div>
        <div className="flex min-w-[220px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{imageName || "No file selected"}</p>
            <p className="text-xs text-slate-500">{statusLabel}</p>
          </div>
          <span className={`ml-auto h-3 w-3 rounded-full ${isLoading ? "bg-amber-400" : uploadedFile ? "bg-emerald-500" : "bg-slate-300"}`} />
        </div>
        <div className="flex items-center gap-3 text-slate-700">
          <button onClick={handleUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-slate-200 hover:bg-slate-50 transition-colors ${!canUndo ? 'opacity-30 cursor-not-allowed' : ''}`}>
            ↩ Undo
          </button>
          <button onClick={handleRedo} disabled={!canRedo} title="Redo (Ctrl+Y)"
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-slate-200 hover:bg-slate-50 transition-colors ${!canRedo ? 'opacity-30 cursor-not-allowed' : ''}`}>
            ↪ Redo
          </button>
          <div className="w-px h-4 bg-slate-200" />
          <button onClick={() => setShowHelp(true)} title="Help" className="grid h-8 w-8 place-items-center rounded-md hover:bg-slate-100 transition-colors">
            <FiHelpCircle size={18} />
          </button>
          <button onClick={() => setShowSettings(true)} title="Settings" className="grid h-8 w-8 place-items-center rounded-md hover:bg-slate-100 transition-colors">
            <FiSettings size={18} />
          </button>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-600 font-semibold text-white text-sm">B</span>
            <span className="text-sm font-medium">Work</span>
            <FiChevronDown size={14} />
          </div>
        </div>
      </header>

      <main
        className="grid h-[calc(100vh-52px)] overflow-hidden"
        style={{
          gridTemplateColumns: `${leftPanelWidth}px 8px minmax(520px,1fr) ${
            rightPanelVisible ? `8px ${rightPanelWidth}px` : "0px 0px"
          }`,
        }}
      >
        <aside className="h-full overflow-y-auto overscroll-contain border-r border-slate-200 bg-white p-5">
          <p className="mb-3 text-xs font-bold tracking-widest text-slate-500">FILE</p>
          <label
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDroppedFile}
            className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center hover:border-blue-400 hover:bg-blue-50"
          >
            <FiUploadCloud className="mb-3 text-blue-600" size={32} />
            <span className="text-sm font-semibold">Upload File</span>
            <span className="mt-1 text-xs text-slate-500">Drag & drop or browse</span>
            <input
              ref={uploadInputRef}
              type="file"
              accept=".tiff,.tif"
              className="hidden"
              onChange={handleImageUpload}
            />
          </label>

          {uploadedFile && (
            <div className="mt-3 flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <FiFile className="text-blue-600" size={22} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{uploadedFile.name}</p>
                <p className="text-xs text-slate-500">{imageFileSize}</p>
              </div>
              <span className="grid h-5 w-5 place-items-center rounded-full border border-emerald-500 text-xs text-emerald-600">✓</span>
            </div>
          )}

          <div className="my-5 border-t border-slate-200" />
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-bold tracking-widest text-slate-500">GRAPHS DETECTED</p>
            <button
              type="button"
              onClick={showAllGraphs}
              className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 hover:bg-slate-50"
              title="Show all graphs"
            >
              <FiPlus />
            </button>
          </div>
          <div className="min-h-[210px] max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {graphLegendItems.length === 0 && (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                No graphs processed yet.
              </p>
            )}
            {graphLegendItems.map((item, idx) => (
              <div
                key={item.label}
                className={`flex items-center gap-3 rounded-md border p-3 ${
                  selectedGraphIdx === idx
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                <button type="button" onClick={() => selectGraph(idx)} className="flex-1 text-left">
                  <p className="text-sm font-semibold">Graph {item.label}</p>
                  <p className="text-xs text-slate-500">{item.points.toLocaleString()} points</p>
                </button>
                <button
                  type="button"
                  onClick={() => toggleGraphVisibility(idx)}
                  className={`grid h-8 w-8 place-items-center rounded-md ${
                    visibleGraphMap[idx] === false
                      ? "text-slate-300"
                      : "text-blue-600 hover:bg-blue-100"
                  }`}
                  title={visibleGraphMap[idx] === false ? "Show graph" : "Hide graph"}
                >
                  <FiEye />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
            <label className="block text-sm font-bold text-slate-900">Graphs Detected</label>
            <input
              type="number"
              value={numGraphs}
              onChange={(e) => setNumGraphs(e.target.value)}
              className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
              placeholder="Enter number of graphs"
              min={1}
              required
            />
            <button type="submit" className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-600 font-semibold text-white hover:bg-blue-700 disabled:opacity-60" disabled={isLoading}>
              <FiRefreshCw className={isLoading ? "animate-spin" : ""} />
              {isLoading ? "Processing Image" : "Submit"}
            </button>
            <p className="text-xs text-slate-500">
              Upload a TIFF, confirm the graph count, then submit to start detection.
            </p>
          </form>

          <div className="my-5 border-t border-slate-200" />
          <p className="mb-3 text-xs font-bold tracking-widest text-slate-500">IMAGE DETAILS</p>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Dimensions</span><span>{imageDimensions.width || "-"} × {imageDimensions.height || "-"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Color Mode</span><span>Grayscale</span></div>
            <div className="flex justify-between"><span className="text-slate-500">File Size</span><span>{imageFileSize}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Split</span><span>{layoutInfo?.method || "-"}</span></div>
          </div>
          <button
            type="button"
            onClick={() => setIsHeaderContentOpen(true)}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-600 font-semibold text-white hover:bg-blue-700"
          >
            <FiEye />
            View Header OCR
          </button>
          <button onClick={handleQuickExportLas} disabled={!hasGraphData} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-blue-600 bg-white font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-45">
            <FiDownload />
            Export LAS
          </button>
        </aside>

        <div
          onMouseDown={(event) => startResize("left", event)}
          className="h-full cursor-col-resize bg-slate-100 transition hover:bg-blue-200"
          title="Drag to resize sidebar"
        />

        <section className="flex min-w-0 flex-col p-6 overflow-hidden">
          <div className="mb-2 flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
            <button onClick={handleZoomIn} disabled={!imageUrl} className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"><FiPlus size={12} /> Zoom In</button>
            <button onClick={handleZoomOut} disabled={!imageUrl} className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"><FiMinus size={12} /> Zoom Out</button>
            <button onClick={() => setZoom(0.5)} disabled={!imageUrl} className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"><FiRefreshCw size={12} /> Reset</button>
            <div className="w-px h-4 bg-slate-200 mx-0.5" />
            <button onClick={() => requireProcessedImage() && setIsInserting((prev) => !prev)} disabled={!hasGraphData} className={`flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45 ${isInserting ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 hover:bg-slate-50"}`}><FiPlus size={12} /> Insert</button>
            <button onClick={() => requireProcessedImage() && setIsDeleting((prev) => !prev)} disabled={!hasGraphData} className={`flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45 ${isDeleting ? "border-red-500 bg-red-50 text-red-600" : "border-slate-200 hover:bg-slate-50"}`}><FiTrash2 size={12} /> Delete</button>
            <div className="w-px h-4 bg-slate-200 mx-0.5" />
            <button onClick={handleUndo} disabled={!canUndo} title="Undo" className={`flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium hover:bg-slate-50 transition-colors ${!canUndo ? 'opacity-30 cursor-not-allowed' : ''}`}>↩ Undo</button>
            <button onClick={handleRedo} disabled={!canRedo} title="Redo" className={`flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium hover:bg-slate-50 transition-colors ${!canRedo ? 'opacity-30 cursor-not-allowed' : ''}`}>↪ Redo</button>
            {!rightPanelVisible && (
              <button onClick={toggleRightPanel} className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium hover:bg-slate-50"><FiEye size={12} /> Content</button>
            )}
            <button onClick={handleQuickExportLas} disabled={!hasGraphData} className="ml-auto flex h-7 items-center gap-1 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"><FiDownload size={12} /> Export LAS</button>
          </div>

          <div className="mb-2 grid grid-cols-2 gap-2">
            <button onClick={() => setActiveViewTab("header")} className={`h-8 rounded-md border text-xs font-semibold ${activeViewTab === "header" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>
              Header Bar {layoutInfo?.header_box ? `Y ${Math.round(layoutInfo.header_box.y1)}-${Math.round(layoutInfo.header_box.y2)}` : ""}
            </button>
            <button onClick={() => setActiveViewTab("graph")} className={`h-8 rounded-md border text-xs font-semibold ${activeViewTab === "graph" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>
              Graph Bar {layoutInfo?.graph_box ? `Y ${Math.round(layoutInfo.graph_box.y1)}-${Math.round(layoutInfo.graph_box.y2)}` : ""}
            </button>
          </div>
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => setIsHeaderContentOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <FiEye className="h-3.5 w-3.5" />
              View Header OCR
            </button>
          </div>

          <div
            className="overflow-auto rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            style={{ height: viewerHeight }}
          >
            {isLoading && (
              <div className="grid h-full min-h-[520px] place-items-center text-slate-500">
                <OilRefineryLoader compact />
              </div>
            )}
            {!isLoading && !imageUrl && (
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDroppedFile}
                className="grid h-full min-h-[520px] place-items-center text-slate-500"
              >
                <div className="text-center">
                  <FiUploadCloud className="mx-auto mb-3 text-blue-600" size={42} />
                  <p className="font-semibold">Upload a TIFF and process it.</p>
                  <p className="mt-1 text-sm">Drop the file here or use the button below.</p>
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <FiUploadCloud />
                    Upload TIFF
                  </button>
                </div>
              </div>
            )}
            {!isLoading && imageUrl && activeViewTab === "header" && (
              <img src={headerImageUrl || imageUrl} alt="Header crop" className="mx-auto max-w-full rounded border border-slate-200" />
            )}
            {!isLoading && imageUrl && activeViewTab === "graph" && (
              <canvas
                ref={canvasRef}
                className="block bg-white"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
              />
            )}
          </div>

          <div
            onMouseDown={(event) => startResize("viewer", event)}
            className="my-2 flex h-4 cursor-row-resize items-center justify-center rounded bg-slate-100 hover:bg-blue-100"
            title="Drag up or down to resize graph screen"
          >
            <span className="h-1 w-12 rounded-full bg-slate-300" />
          </div>

          <div className="mt-4 flex items-center rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <FiMove className="mr-2" />
            <span className="font-semibold text-slate-800">Pan Mode</span>
            <span className="ml-6">Zoom: {Math.round(zoom * 100)}%</span>
            <span className="ml-auto">{graphVisibilityCount} visible / {sourceGraphLines.length} graph(s), {visibleGraphLines.reduce((sum, line) => sum + line.length, 0).toLocaleString()} visible point(s)</span>
          </div>
        </section>

        <div
          onMouseDown={(event) => rightPanelVisible && startResize("right", event)}
          className={`h-full transition ${
            rightPanelVisible
              ? "cursor-col-resize bg-slate-100 hover:bg-blue-200"
              : "pointer-events-none bg-transparent"
          }`}
          title="Drag to resize extracted content"
        />

        <aside className={`${rightPanelVisible ? "block" : "hidden"} border-l border-slate-200 bg-white p-5 overflow-auto`}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Extracted Content</h2>
            <div className="flex gap-2">
              <button
                onClick={togglePreviewTarget}
                className="grid h-9 w-9 place-items-center rounded-md bg-blue-50 text-blue-600"
                title="Switch header/graph preview"
              >
                <FiEye />
              </button>
              <button
                onClick={toggleRightPanel}
                className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-50"
                title="Hide extracted content"
              >
                <FiX />
              </button>
            </div>
          </div>
          <div className="mb-4 grid grid-cols-3 overflow-hidden rounded-md border border-slate-200 text-sm">
            {["header", "summary", "data"].map((tab) => (
              <button key={tab} onClick={() => setRightPanelTab(tab)} className={`h-10 border-r border-slate-200 last:border-r-0 ${rightPanelTab === tab ? "bg-blue-50 text-blue-700" : "bg-white text-slate-600"}`}>
                {tab === "header" ? "Header Info" : tab === "summary" ? "Graphs Summary" : "Data Preview"}
              </button>
            ))}
          </div>

          {rightPanelTab === "header" && (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold">Header Information</h3>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">OCR enabled</span>
            </div>
            {headerOcrInfo && (
              <div className="mb-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                OCR model: <span className="font-semibold">{headerOcrInfo.model || "unknown"}</span>
                {headerOcrInfo.strategy ? <span> · Strategy: <span className="font-semibold">{headerOcrInfo.strategy}</span></span> : null}
                {headerOcrInfo.engine ? <span> · Engine: <span className="font-semibold">{headerOcrInfo.engine}</span></span> : null}
                {headerOcrInfo.recognized_field_count !== undefined ? <span> · Fields: <span className="font-semibold">{headerOcrInfo.recognized_field_count}</span></span> : null}
                {headerOcrInfo.score !== undefined ? <span> · Score: <span className="font-semibold">{headerOcrInfo.score}</span></span> : null}
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsHeaderContentOpen(true)}
              className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <FiEye />
              View Header OCR
            </button>
            <div className="space-y-3">
              {headerPreviewFields.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-slate-500">{label}</span>
                  <span className="text-right font-medium">{value}</span>
                </div>
              ))}
            </div>
            {completeHeaderText ? (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase text-slate-500">Extracted Header Text</span>
                  <button
                    type="button"
                    onClick={() => setIsHeaderContentOpen(true)}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-white px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    <FiEye className="h-3.5 w-3.5" />
                    View complete
                  </button>
                </div>
                <pre className="max-h-44 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{completeHeaderText}</pre>
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                Header text extraction will appear here after processing.
              </div>
            )}
            <button
              onClick={() => toast.success("Header OCR text is now connected.")}
              className="mt-4 h-9 w-full rounded-md border border-blue-500 text-sm font-semibold text-blue-600 hover:bg-blue-50"
            >
              Edit Header Information
            </button>
          </section>
          )}

          {isHeaderContentOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6">
              <div className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Complete Header Extraction</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      This same header content is included at the top of the exported LAS file.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsHeaderContentOpen(false)}
                    className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                  >
                    <FiX />
                  </button>
                </div>
                <pre className="overflow-auto whitespace-pre-wrap break-words p-5 text-xs leading-6 text-slate-800">
                  {completeHeaderText || "No header text extracted yet."}
                </pre>
              </div>
            </div>
          )}

          {rightPanelTab === "summary" && (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-bold">Graphs Information</h3>
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Graph</th>
                    <th className="px-3 py-2">Color</th>
                    <th className="px-3 py-2">Points</th>
                    <th className="px-3 py-2">Range</th>
                  </tr>
                </thead>
                <tbody>
                  {graphLegendItems.map((item) => (
                    <tr key={`row-${item.label}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium">Graph {item.label}</td>
                      <td className="px-3 py-2"><span className="block h-3 w-3 rounded-sm" style={{ backgroundColor: item.color }} /></td>
                      <td className="px-3 py-2">{item.points.toLocaleString()}</td>
                      <td className="px-3 py-2">0 - 100</td>
                    </tr>
                  ))}
                  {graphLegendItems.length === 0 && (
                    <tr><td className="px-3 py-4 text-slate-500" colSpan="4">No graph data yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          )}

          {rightPanelTab === "data" && (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold">Data Preview</h3>
              <button onClick={toggleFullDataPreview} className="text-xs font-semibold text-blue-600">
                {dataPreviewLimit > 6 ? "Show Less" : "View Full Data"}
              </button>
            </div>
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">X</th><th className="px-3 py-2">Y</th></tr></thead>
                <tbody>
                  {(sourceGraphLines[selectedGraphIdx ?? 0] || []).slice(0, dataPreviewLimit).map(([x, y], idx) => (
                    <tr key={`pt-${idx}`} className="border-t border-slate-100">
                      <td className="px-3 py-2">{idx + 1}</td>
                      <td className="px-3 py-2">{Number(x).toFixed(2)}</td>
                      <td className="px-3 py-2">{Number(y).toFixed(2)}</td>
                    </tr>
                  ))}
                  {!(sourceGraphLines[selectedGraphIdx ?? 0] || []).length && <tr><td className="px-3 py-4 text-slate-500" colSpan="3">No points yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <button onClick={handleQuickExportLas} disabled={!hasGraphData} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-600 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45">
              <FiDownload /> Export LAS
            </button>
          </section>
          )}
        </aside>
      </main>
      {isLoading && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/35 backdrop-blur-[2px]">
          <div className="p-6">
            <OilRefineryLoader overlay />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Navbar />
      <Toaster />
      <div className="flex h-screen overflow-hidden">
        {/* ── Left Section ─────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-shrink-0 w-[18%] min-w-[220px] p-2 overflow-auto h-full">

          {/* ── NEW: Module Navigation ── */}
          <div className="mb-4">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest px-1 mb-2">
              AI Modules
            </div>
            <div className="flex flex-col gap-1.5">
              <SidebarModuleButton
                activeColor="blue"
                active={activeModule === "ai-prediction"}
                onClick={() => toggleModule("ai-prediction")}
                label="AI Track Prediction"
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                }
              />
              <SidebarModuleButton
                activeColor="purple"
                active={activeModule === "smart-cursor"}
                onClick={() => toggleModule("smart-cursor")}
                label="Smart Cursor Viewer"
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
                    <path d="M13 13l6 6"/>
                  </svg>
                }
              />
            </div>
            <div className="mt-3 border-t border-gray-700" />
          </div>
          {/* ── END Module Navigation ── */}

          <span>
            <input
              type="file"
              accept=".tiff,.tif"
              className="text-sm rounded-lg text-white bg-cursor-pointer dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400"
              onChange={handleImageUpload}
            />
          </span>
          {/* Total Graphs input section */}
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg mt-8 w-full max-w-xs sm:max-w-sm mx-auto flex flex-col items-center">
            <h2 className="text-2xl text-white font-bold mb-6 tracking-wide text-center">
              Total Graphs
            </h2>
            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-4 w-full items-center"
            >
              <input
                type="number"
                value={numGraphs}
                onChange={(e) => setNumGraphs(e.target.value)}
                className="w-full p-3 rounded-lg bg-gray-700 text-white text-lg mb-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter number of graphs"
                min={1}
                required
              />
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-700 to-blue-900 text-white py-2 rounded-lg text-lg font-semibold shadow hover:from-blue-800 hover:to-blue-950 transition"
              >
                Submit
              </button>
            </form>
          </div>
        </div>

        {/* ── Middle Section ────────────────────────────────────────────────── */}
        <div className="flex-1 px-2 py-2 flex flex-col overflow-hidden">

          {/* ── NEW MODULE: AI Track Prediction ── */}
          {activeModule === "ai-prediction" && (
            <AITrackPrediction
              uploadedFile={uploadedFile}
              imageUrl={imageUrl}
              imageDimensions={imageDimensions}
              sourceGraphLines={sourceGraphLines}
            />
          )}

          {/* ── NEW MODULE: Smart Cursor Viewer ── */}
          {activeModule === "smart-cursor" && (
            <SmartCursorViewer
              imageUrl={imageUrl}
              imageDimensions={imageDimensions}
              sourceGraphLines={sourceGraphLines}
              graphBoundaryView={graphBoundaryView}
            />
          )}

          {/* ── DEFAULT: Existing Canvas View ── */}
          {activeModule === null && (
            <>
              {/* Zoom Controls */}
              <div className="flex items-center justify-center bg-gray-800 border-b border-gray-700 px-1.5 h-[3.5rem] select-none mb-1">
                <div className="flex items-center pr-1.5 mr-1.5 space-x-4">
                  <div
                    aria-label="zoom in"
                    onClick={handleZoomIn}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-center rounded-full transition-transform duration-300 mx-0.5 w-7 h-7">
                      <img
                        alt="zoom-in"
                        src="https://www.makesense.ai/ico/zoom-in.png"
                        className="filter brightness-0 invert max-w-8 max-h-8"
                      />
                    </div>
                  </div>
                  <div
                    aria-label="zoom out"
                    onClick={handleZoomOut}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-center rounded-full transition-transform duration-300 mx-0.5 w-7 h-7">
                      <img
                        alt="zoom-out"
                        src="https://www.makesense.ai/ico/zoom-out.png"
                        className="filter brightness-0 invert max-w-8 max-h-8"
                      />
                    </div>
                  </div>
                </div>
              </div>
              {/* Image Panel */}
              <div
                className="flex-1 border border-gray-700 bg-black rounded-lg mt-2 overflow-auto max-h-[calc(100vh-120px)] w-full"
                style={{ minHeight: "520px", minWidth: "420px" }}
              >
                {isLoading && (
                  <div className="flex justify-center items-center h-full w-full">
                    <div className="loader"></div>
                  </div>
                )}
                {!isLoading && !imageUrl && (
                  <div className="flex flex-col items-center justify-center h-full w-full py-16 text-gray-400 select-none">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="64"
                      height="64"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="mb-4"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                      />
                      <line
                        x1="12"
                        y1="8"
                        x2="12"
                        y2="16"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <line
                        x1="8"
                        y1="12"
                        x2="16"
                        y2="12"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-lg text-center max-w-md">
                      <span className="font-semibold text-gray-300">
                        No image loaded.
                      </span>
                      <br />
                      Please{" "}
                      <span className="font-semibold text-blue-400">
                        upload a .tiff file
                      </span>{" "}
                      and{" "}
                      <span className="font-semibold text-blue-400">
                        enter the number of graphs
                      </span>{" "}
                      to process the image...
                    </span>
                  </div>
                )}
                {!isLoading && imageUrl && (
                  <canvas
                    ref={canvasRef}
                    style={{
                      display: "block",
                      background: "#000",
                    }}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Right Section: unchanged ─────────────────────────────────────── */}
        <div className="flex-shrink-0 w-[22%] min-w-[280px] p-2 overflow-auto mr-2">
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <div className="flex flex-col space-y-4">
                <h1 className="text-white text-xl text-center font-medium">
                  Buttons and Modes
                </h1>
                {graphLegendItems.length > 0 && (
                  <div className="text-white bg-[#111827] border border-gray-600 rounded-md p-3 w-full max-w-md">
                    <h2 className="text-sm font-semibold mb-2">Graph Name Mapping</h2>
                    <div className="space-y-1.5 max-h-32 overflow-auto pr-1">
                      {graphLegendItems.map((item) => (
                        <div
                          key={`legend-${item.label}`}
                          className="flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block w-3 h-3 rounded-sm border border-white/30"
                              style={{ backgroundColor: item.color }}
                            />
                            <span>
                              Graph <strong>{item.label}</strong>
                            </span>
                          </div>
                          <span className="text-gray-400">{item.points} pts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setIsInserting((prev) => !prev)}
                  className={`text-white px-8 py-2 rounded-md border border-gray-400 flex gap-2 ${
                    isInserting
                      ? "bg-blue-900"
                      : "bg-[#1F2937] hover:bg-gray-900"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="icon icon-tabler icon-tabler-point-filled"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="#ffffff"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path
                      d="M12 7a5 5 0 1 1 -4.995 5.217l-.005 -.217l.005 -.217a5 5 0 0 1 4.995 -4.783z"
                      strokeWidth="0"
                      fill="currentColor"
                    />
                  </svg>
                  {isInserting
                    ? "Disable Insertion Mode"
                    : "Enable Insertion Mode"}
                </button>
                <button
                  onClick={() => setIsDeleting((prev) => !prev)}
                  className={`text-white px-8 py-2 rounded-md border border-gray-400 flex gap-2 ${
                    isDeleting ? "bg-red-900" : "bg-[#1F2937] hover:bg-gray-900"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="icon icon-tabler icon-tabler-trash"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="#ff2825"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M4 7l16 0" />
                    <path d="M10 11l0 6" />
                    <path d="M14 11l0 6" />
                    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
                    <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
                  </svg>
                  {isDeleting ? "Exit Delete Mode" : "Delete Points"}
                </button>
                <div className="bg-white border border-gray-200 rounded-xl p-4 w-full">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Graph Boundaries</h2>
                      <button
                        onClick={togglePopup}
                        className="w-5 h-5 rounded-full border border-gray-300 text-gray-400 hover:text-gray-600 flex items-center justify-center"
                        title="Boundary help"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                      </button>
                    </div>
                  </div>

                  {graphBoundaryView.length === 0 && (
                    <p className="text-xs text-gray-400 italic">Process an image to edit graph boundaries.</p>
                  )}

                  {graphBoundaryView.length > 0 && (
                    <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
                      {graphBoundaryView.map((boundary, idx) => (
                        <div key={`boundary-${idx}`}>
                          {/* Graph label row */}
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: GRAPH_COLORS[idx % GRAPH_COLORS.length] }}
                            />
                            <span className="text-sm font-semibold text-gray-800">
                              Graph {getGraphLabel(idx)}{" "}
                              <span className="font-normal text-gray-500">({GRAPH_COLOR_NAMES[idx % GRAPH_COLOR_NAMES.length]})</span>
                            </span>
                          </div>
                          {/* 2×2 input grid */}
                          <div className="grid grid-cols-2 gap-2">
                            {/* Left */}
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                              </span>
                              <input
                                type="number" step="any"
                                className="w-full pl-6 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                value={Math.round(boundary.left)}
                                onChange={(e) => handleBoundaryChange(idx, "left", e.target.value)}
                                placeholder="Left"
                              />
                            </div>
                            {/* Right */}
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                              </span>
                              <input
                                type="number" step="any"
                                className="w-full pl-6 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                value={Math.round(boundary.right)}
                                onChange={(e) => handleBoundaryChange(idx, "right", e.target.value)}
                                placeholder="Right"
                              />
                            </div>
                            {/* Top */}
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
                              </span>
                              <input
                                type="number" step="any"
                                className="w-full pl-6 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                value={Math.round(boundary.top)}
                                onChange={(e) => handleBoundaryChange(idx, "top", e.target.value)}
                                placeholder="Top"
                              />
                            </div>
                            {/* Bottom */}
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
                              </span>
                              <input
                                type="number" step="any"
                                className="w-full pl-6 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                value={Math.round(boundary.bottom)}
                                onChange={(e) => handleBoundaryChange(idx, "bottom", e.target.value)}
                                placeholder="Bottom"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Near Point Min Distance */}
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-gray-700 font-medium">Near Point Min Distance</span>
                      <span className="text-gray-500 font-semibold">{nearPointMinDistance.toFixed(1)} px</span>
                    </div>
                    <input
                      type="range" min="0" max="25" step="0.5"
                      value={nearPointMinDistance}
                      onChange={(e) => setNearPointMinDistance(Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </div>

                  {/* Apply button */}
                  <button
                    onClick={handleApplyBoundaries}
                    className="mt-3 w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    Apply Boundaries
                  </button>
                </div>
                <button
                  onClick={toggleExportPopup}
                  className="text-white bg-[#1F2937] px-8 py-2 rounded-md border border-gray-400 flex items-center gap-2 hover:bg-gray-900"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="icon icon-tabler icon-tabler-file-export"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="#ffffff"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                    <path d="M11.5 21h-4.5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v5m-5 6h7m-3 -3l3 3l-3 3" />
                  </svg>
                  Export Points
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <div className="bg-gray-800 text-white p-2 rounded-lg max-w-[300px] fixed bottom-[2.5rem]">
                <button
                  onClick={togglePopup}
                  className="text-white bg-gray-900 px-4 py-2 rounded-md flex gap-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="icon icon-tabler icon-tabler-info-triangle"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="#ffffff"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" />
                    <path d="M12 9h.01" />
                    <path d="M11 12h1v4h1" />
                  </svg>
                  Tooltip Guide
                </button>
                {isPopupOpen && (
                  <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
                    <div className="bg-gray-800 text-white p-6 rounded-lg max-w-[700px] shadow-lg z-20">
                      <h3 className="text-2xl font-semibold mb-4">
                        Tooltip Information
                      </h3>
                      <ul className="list-disc pl-5 space-y-2">
                        <li>
                          <strong>Zoom In/Out</strong>:{" "}
                          <span className="text-gray-300">
                            Allows you to zoom in and out of the canvas using
                            the zoom buttons. The &quot;+&quot; icon zooms in,
                            while the &quot;-&quot; icon zooms out.
                          </span>
                        </li>
                        <li>
                          <strong>Canvas Interaction</strong>:{" "}
                          <span className="text-gray-300">
                            You have two separate canvases that can be
                            interacted with. You can click and drag points or
                            perform actions based on the mode selected (e.g.,
                            insertion or deletion).
                          </span>
                        </li>
                        <li>
                          <strong>Insertion Mode</strong>:{" "}
                          <span className="text-gray-300">
                            Enables you to insert points on the canvas. When
                            insertion mode is active, clicking on the canvas
                            adds new points between existing ones.
                          </span>
                        </li>
                        <li>
                          <strong>Export Points</strong>:{" "}
                          <span className="text-gray-300">
                            This button exports the current points from all
                            detected curves into a single LAS file for
                            download.
                          </span>
                        </li>
                        <li>
                          <strong>Delete Mode</strong>:{" "}
                          <span className="text-gray-300">
                            Allows you to delete points from the canvas when
                            active. If enabled, points can be clicked to remove
                            them. Exit delete mode to stop deleting points.
                          </span>
                        </li>
                        <li>
                          <strong>AI Track Prediction</strong>:{" "}
                          <span className="text-gray-300">
                            Opens the AI module to detect log types, scale, and
                            confidence scores from the processed graph data.
                          </span>
                        </li>
                        <li>
                          <strong>Smart Cursor Viewer</strong>:{" "}
                          <span className="text-gray-300">
                            Opens the smart cursor view with real-time depth
                            tracking, crosshair, and tooltip on the graph image.
                          </span>
                        </li>
                      </ul>
                      <button
                        onClick={togglePopup}
                        className="mt-4 text-gray-300 px-4 py-1 hover:text-gray-300 bg-gray-900 border border-gray-300 rounded-md"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Export Modal */}
      {isExportPopupOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Export Points</h3>
                <p className="text-sm text-gray-500 mt-0.5">Review and edit boundary values before exporting.</p>
              </div>
              <button onClick={toggleExportPopup} className="text-gray-400 hover:text-gray-700 transition-colors">
                <FiX size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Y Range — shared */}
              <div className="bg-gray-50 rounded-xl p-4">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-3">All Graphs — Y Range</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Y Min (top depth)</label>
                    <input
                      type="number" step="any" placeholder="yMin"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={sharedExportYRange.yMin}
                      onChange={(e) => setSharedExportYRange(prev => ({ ...prev, yMin: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Y Max (bottom depth)</label>
                    <input
                      type="number" step="any" placeholder="yMax"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={sharedExportYRange.yMax}
                      onChange={(e) => setSharedExportYRange(prev => ({ ...prev, yMax: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Per-graph: xMin, xMax + editable boundary L/R/T/B */}
              {graphBoundaryView.length > 0 && (
                <div className="space-y-4">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Per-Graph Settings &amp; Boundaries</label>
                  {graphBoundaryView.map((boundary, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden">
                      {/* Graph label bar */}
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: GRAPH_COLORS[idx % GRAPH_COLORS.length] }}
                        />
                        <span className="text-sm font-bold text-gray-800">
                          Graph {getGraphLabel(idx)}{" "}
                          <span className="font-normal text-gray-500">({GRAPH_COLOR_NAMES[idx % GRAPH_COLOR_NAMES.length]})</span>
                        </span>
                      </div>

                      <div className="px-4 py-3 space-y-3">
                        {/* X Range */}
                        <div>
                          <label className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2 block">X Range (value axis)</label>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">X Min</label>
                              <input
                                type="number" step="any" placeholder="xMin"
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                value={exportXMinMax[idx]?.xMin !== undefined ? exportXMinMax[idx].xMin : ""}
                                onChange={(e) => setExportXMinMax(prev => { const arr = [...prev]; arr[idx] = { ...arr[idx], xMin: e.target.value }; return arr; })}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400 mb-1 block">X Max</label>
                              <input
                                type="number" step="any" placeholder="xMax"
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                value={exportXMinMax[idx]?.xMax !== undefined ? exportXMinMax[idx].xMax : ""}
                                onChange={(e) => setExportXMinMax(prev => { const arr = [...prev]; arr[idx] = { ...arr[idx], xMax: e.target.value }; return arr; })}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Boundary L/R/T/B — editable */}
                        <div>
                          <label className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2 block">Boundary (pixel coords) — editable</label>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { field: "left",   label: "Left (L)",   icon: "←" },
                              { field: "right",  label: "Right (R)",  icon: "→" },
                              { field: "top",    label: "Top (T)",    icon: "↑" },
                              { field: "bottom", label: "Bottom (B)", icon: "↓" },
                            ].map(({ field, label, icon }) => (
                              <div key={field}>
                                <label className="text-[10px] text-gray-400 mb-0.5 block">{icon} {label}</label>
                                <input
                                  type="number" step="any"
                                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                                  value={Math.round(boundary[field] ?? 0)}
                                  onChange={(e) => handleBoundaryChange(idx, field, e.target.value)}
                                />
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1.5">
                            Current: L {boundary.left.toFixed(1)}  R {boundary.right.toFixed(1)}  T {boundary.top.toFixed(1)}  B {boundary.bottom.toFixed(1)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={() => {
                  try {
                    const graph_info = {};
                    const parseUserValue = (val) => {
                      if (val === undefined || val === null || val === "")
                        return null;
                      const num = Number(val);
                      return Number.isFinite(num) ? num : null;
                    };
                    const sharedYMin = parseUserValue(sharedExportYRange.yMin);
                    const sharedYMax = parseUserValue(sharedExportYRange.yMax);

                    if (sharedYMin === null || sharedYMax === null) {
                      throw new Error(
                        "Please fill yMin and yMax once for all graphs."
                      );
                    }
                    if (sharedYMin > sharedYMax) {
                      throw new Error(
                        "Invalid Y range: min must be <= max."
                      );
                    }

                    sourceGraphLines.forEach((line, idx) => {
                      const cleanedLine = dedupeLinePoints(line, {
                        minDistance: nearPointMinDistance,
                      });
                      if (!cleanedLine || cleanedLine.length === 0) return;
                      const graphLabel = getGraphLabel(idx);
                      const graphKey = `graph_${graphLabel}`;
                      const xMin = parseUserValue(exportXMinMax[idx]?.xMin);
                      const xMax = parseUserValue(exportXMinMax[idx]?.xMax);

                      if (xMin === null || xMax === null) {
                        throw new Error(
                          `Please fill xMin and xMax for graph ${graphLabel}.`
                        );
                      }
                      if (xMin > xMax) {
                        throw new Error(
                          `Invalid X range for graph ${graphLabel}: min must be <= max.`
                        );
                      }

                      graph_info[graphKey] = {
                        x_range: [xMin, xMax],
                        y_range: [sharedYMin, sharedYMax],
                        lines: {
                          [graphLabel]: cleanedLine,
                        },
                      };
                    });
                    if (!Object.keys(graph_info).length) {
                      toast.error("No points to export.");
                      return;
                    }
                    console.log("graph_info", graph_info);
                    handleExportPoints(graph_info, lasHeaders);
                    toggleExportPopup();
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "Invalid export inputs."
                    );
                  }
                }}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
              >
                Yes, Export
              </button>
              <button
                onClick={toggleExportPopup}
                className="px-5 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Canvas;

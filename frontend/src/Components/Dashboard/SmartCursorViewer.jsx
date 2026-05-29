import { useState, useRef, useEffect, useCallback } from "react";

const GRAPH_COLORS = [
  "#FF0000","#00FF00","#0000FF","#FFA500","#800080",
  "#00FFFF","#FFC0CB","#FFFF00","#A52A2A","#008000",
];

const getGraphLabel = (index) => {
  let label = "";
  let value = index;
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
};

export default function SmartCursorViewer({
  imageUrl,
  imageDimensions,
  sourceGraphLines,
  graphBoundaryView,
}) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const containerRef = useRef(null);
  const animFrameRef = useRef(null);

  const [zoom, setZoom] = useState(0.5);
  const [cursor, setCursor] = useState(null); // {x, y} in canvas px
  const [hoveredTrack, setHoveredTrack] = useState(null);
  const [yRange, setYRange] = useState({ min: "7500", max: "8200" });
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [showTooltip, setShowTooltip] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef(null);

  const hasImage = !!(imageUrl && imageDimensions?.width && imageDimensions?.height);

  // Draw base image + graph lines on main canvas
  useEffect(() => {
    if (!hasImage || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dW = imageDimensions.width * zoom;
    const dH = imageDimensions.height * zoom;
    canvas.width = dW;
    canvas.height = dH;
    ctx.clearRect(0, 0, dW, dH);

    const img = imgRef.current || new window.Image();
    imgRef.current = img;
    img.src = imageUrl;
    const draw = () => {
      ctx.drawImage(img, 0, 0, dW, dH);
      (sourceGraphLines || []).forEach((line, idx) => {
        if (!line || line.length === 0) return;
        ctx.strokeStyle = GRAPH_COLORS[idx % GRAPH_COLORS.length];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(line[0][0] * zoom, line[0][1] * zoom);
        for (let i = 1; i < line.length; i++) {
          ctx.lineTo(line[i][0] * zoom, line[i][1] * zoom);
        }
        ctx.stroke();
        line.forEach(([x, y]) => {
          ctx.beginPath();
          ctx.arc(x * zoom, y * zoom, 2.5, 0, 2 * Math.PI);
          ctx.fillStyle = GRAPH_COLORS[idx % GRAPH_COLORS.length];
          ctx.fill();
        });
      });
      setImageLoaded(true);
    };
    if (img.complete && img.naturalWidth > 0) draw();
    else { img.onload = draw; }
  }, [imageUrl, imageDimensions, zoom, sourceGraphLines, hasImage]);

  // Draw overlay (crosshair) on separate canvas
  const drawOverlay = useCallback(() => {
    if (!overlayRef.current || !canvasRef.current) return;
    const overlay = overlayRef.current;
    const base = canvasRef.current;
    overlay.width = base.width;
    overlay.height = base.height;
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!cursor || !showCrosshair) return;

    const { x, y } = cursor;
    // Vertical line
    ctx.save();
    ctx.strokeStyle = "rgba(0,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, overlay.height);
    ctx.stroke();
    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(overlay.width, y);
    ctx.stroke();
    ctx.restore();

    // Crosshair center dot
    ctx.save();
    ctx.fillStyle = "rgba(0,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();

    // Track boundary highlights
    if (graphBoundaryView) {
      graphBoundaryView.forEach((boundary, idx) => {
        if (!boundary) return;
        const bL = boundary.left * zoom;
        const bR = boundary.right * zoom;
        const bT = boundary.top * zoom;
        const bB = boundary.bottom * zoom;
        if (x >= bL && x <= bR && y >= bT && y <= bB) {
          ctx.save();
          ctx.strokeStyle = GRAPH_COLORS[idx % GRAPH_COLORS.length];
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.5;
          ctx.strokeRect(bL, bT, bR - bL, bB - bT);
          ctx.restore();
        }
      });
    }
  }, [cursor, showCrosshair, zoom, graphBoundaryView]);

  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(drawOverlay);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [drawOverlay]);

  // Map pixel to depth / value
  const getDepth = (yPx) => {
    if (!imageDimensions?.height) return null;
    const yMin = parseFloat(yRange.min);
    const yMax = parseFloat(yRange.max);
    if (!isFinite(yMin) || !isFinite(yMax)) return null;
    const fraction = yPx / (imageDimensions.height * zoom);
    return (yMin + fraction * (yMax - yMin)).toFixed(1);
  };

  const getTrackAndValue = (xPx, yPx) => {
    if (!graphBoundaryView || !sourceGraphLines) return null;
    for (let idx = 0; idx < graphBoundaryView.length; idx++) {
      const b = graphBoundaryView[idx];
      if (!b) continue;
      if (xPx >= b.left * zoom && xPx <= b.right * zoom &&
          yPx >= b.top * zoom && yPx <= b.bottom * zoom) {
        // Find nearest line point
        const line = sourceGraphLines[idx] || [];
        let minDist = Infinity;
        let nearestVal = null;
        line.forEach(([lx, ly]) => {
          const dx = lx * zoom - xPx;
          const dy = ly * zoom - yPx;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            minDist = dist;
            // Normalize x within boundary
            const bW = (b.right - b.left) * zoom;
            const frac = bW > 0 ? ((lx * zoom) - b.left * zoom) / bW : 0;
            nearestVal = frac;
          }
        });
        return { trackIdx: idx, trackLabel: getGraphLabel(idx), nearestVal, color: GRAPH_COLORS[idx % GRAPH_COLORS.length] };
      }
    }
    return null;
  };

  const handleMouseMove = useCallback((e) => {
    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCursor({ x, y });
    const track = getTrackAndValue(x, y);
    setHoveredTrack(track);
  }, [graphBoundaryView, sourceGraphLines, zoom]);

  const handleMouseLeave = () => {
    setCursor(null);
    setHoveredTrack(null);
  };

  const depth = cursor ? getDepth(cursor.y) : null;
  const xPct = cursor && imageDimensions?.width
    ? ((cursor.x / (imageDimensions.width * zoom)) * 100).toFixed(1)
    : null;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#0d1117] text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-700 bg-[#111827] flex-shrink-0">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-900 border border-purple-700">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
            <path d="M13 13l6 6"/>
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-wide text-white">Smart Hover Cursor Viewer</h2>
          <p className="text-xs text-gray-400">Real-time depth tracking · Synchronized crosshair · Track value display</p>
        </div>
        {/* Controls */}
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer select-none">
            <input type="checkbox" checked={showCrosshair} onChange={e => setShowCrosshair(e.target.checked)} className="accent-cyan-500" />
            Crosshair
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer select-none">
            <input type="checkbox" checked={showTooltip} onChange={e => setShowTooltip(e.target.checked)} className="accent-purple-500" />
            Tooltip
          </label>
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom(z => Math.min(z + 0.1, 3))} className="w-7 h-7 flex items-center justify-center rounded bg-gray-800 border border-gray-600 text-white hover:bg-gray-700 text-sm">+</button>
            <span className="text-xs text-gray-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.max(z - 0.1, 0.2))} className="w-7 h-7 flex items-center justify-center rounded bg-gray-800 border border-gray-600 text-white hover:bg-gray-700 text-sm">−</button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas Area */}
        <div className="flex-1 overflow-auto bg-black relative" ref={containerRef}>
          {!hasImage && (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-16 h-16 mb-4 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#4b5563" strokeWidth="1.5">
                  <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M13 13l6 6" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="text-gray-400 text-sm mb-1">No graph loaded yet.</p>
              <p className="text-gray-500 text-xs max-w-xs">Process a TIFF file first using the main controls. The Smart Cursor will activate automatically once the image is loaded.</p>
            </div>
          )}

          {hasImage && (
            <div className="relative inline-block">
              {/* Base canvas (image + lines) */}
              <canvas ref={canvasRef} style={{ display: "block", background: "#000" }} />
              {/* Overlay canvas (crosshair) */}
              <canvas
                ref={overlayRef}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  cursor: "none",
                  pointerEvents: "all",
                }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              />

              {/* Floating Tooltip */}
              {showTooltip && cursor && (
                <div
                  style={{
                    position: "absolute",
                    left: cursor.x + 16,
                    top: cursor.y - 10,
                    pointerEvents: "none",
                    zIndex: 20,
                    transform:
                      cursor.x > (imageDimensions.width * zoom) - 200
                        ? "translateX(-110%)"
                        : "none",
                  }}
                >
                  <div className="bg-gray-900 border border-cyan-700 rounded-lg shadow-2xl px-3 py-2.5 min-w-[160px]">
                    <div className="text-xs font-semibold text-cyan-400 mb-1.5 pb-1 border-b border-gray-700">
                      ⊕ Cursor Info
                    </div>
                    <div className="space-y-1 text-xs">
                      {depth && (
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-400">Depth</span>
                          <span className="text-cyan-300 font-mono font-semibold">{depth} ft</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-400">X Pos</span>
                        <span className="text-gray-200 font-mono">{cursor.x.toFixed(0)}px</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-400">Y Pos</span>
                        <span className="text-gray-200 font-mono">{cursor.y.toFixed(0)}px</span>
                      </div>
                      {hoveredTrack && (
                        <>
                          <div className="border-t border-gray-700 my-1" />
                          <div className="flex justify-between gap-4">
                            <span className="text-gray-400">Track</span>
                            <span className="font-semibold" style={{ color: hoveredTrack.color }}>
                              {hoveredTrack.trackLabel}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-gray-400">Value</span>
                            <span className="text-yellow-300 font-mono">
                              {(hoveredTrack.nearestVal * 100).toFixed(1)}%
                            </span>
                          </div>
                        </>
                      )}
                      {!hoveredTrack && (
                        <div className="text-gray-600 text-xs italic">Not on a track</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Info Panel */}
        <div className="w-64 flex-shrink-0 border-l border-gray-700 bg-[#111827] px-4 py-4 flex flex-col gap-4 overflow-auto">
          {/* Depth Range Config */}
          <div>
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-widest mb-3">Depth Range (ft)</h3>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Top Depth</label>
                <input
                  type="number"
                  value={yRange.min}
                  onChange={e => setYRange(p => ({ ...p, min: e.target.value }))}
                  className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-600 text-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                  placeholder="e.g. 7500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Bottom Depth</label>
                <input
                  type="number"
                  value={yRange.max}
                  onChange={e => setYRange(p => ({ ...p, max: e.target.value }))}
                  className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-600 text-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                  placeholder="e.g. 8200"
                />
              </div>
            </div>
          </div>

          {/* Live Cursor Stats */}
          <div className="border border-gray-700 rounded-lg p-3">
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-widest mb-2">Live Cursor</h3>
            {cursor ? (
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">X (px)</span>
                  <span className="text-cyan-400 font-mono">{cursor.x.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Y (px)</span>
                  <span className="text-cyan-400 font-mono">{cursor.y.toFixed(1)}</span>
                </div>
                {depth && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Depth</span>
                    <span className="text-green-400 font-mono font-semibold">{depth} ft</span>
                  </div>
                )}
                {xPct && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">X %</span>
                    <span className="text-yellow-400 font-mono">{xPct}%</span>
                  </div>
                )}
                {hoveredTrack ? (
                  <>
                    <div className="border-t border-gray-700 mt-1 pt-1">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Track</span>
                        <span className="font-semibold" style={{ color: hoveredTrack.color }}>
                          {hoveredTrack.trackLabel}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Rel. Value</span>
                        <span className="text-yellow-300 font-mono">{(hoveredTrack.nearestVal * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-gray-600 italic text-xs pt-1">Not over a track</div>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-600 italic">Move cursor over the graph</p>
            )}
          </div>

          {/* Track Legend */}
          {sourceGraphLines && sourceGraphLines.length > 0 && (
            <div className="border border-gray-700 rounded-lg p-3">
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-widest mb-2">Track Legend</h3>
              <div className="space-y-1.5">
                {sourceGraphLines.map((line, idx) => (
                  <div key={idx} className={`flex items-center gap-2 px-1.5 py-1 rounded transition-colors text-xs ${hoveredTrack?.trackIdx === idx ? "bg-gray-800" : ""}`}>
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: GRAPH_COLORS[idx % GRAPH_COLORS.length] }} />
                    <span className="text-gray-300">Track {getGraphLabel(idx)}</span>
                    <span className="ml-auto text-gray-500">{(line || []).length} pts</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Usage Tips */}
          <div className="border border-gray-700 rounded-lg p-3">
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-widest mb-2">Tips</h3>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>· Hover over graph to see depth</li>
              <li>· Crosshair shows X/Y position</li>
              <li>· Set depth range for accurate ft values</li>
              <li>· Track boundary highlights on hover</li>
              <li>· Toggle crosshair or tooltip above</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

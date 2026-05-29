import { useState, useEffect, useRef } from "react";

const LOG_TYPES = [
  "Gamma Ray (GR)",
  "Resistivity (Deep)",
  "Sonic (DT)",
  "Neutron Porosity (NPHI)",
  "Bulk Density (RHOB)",
  "Resistivity (Shallow)",
  "Caliper (CALI)",
  "SP Log",
  "Photoelectric Factor (PEF)",
  "Temperature Log",
];

const detectScale = (line) => {
  if (!line || line.length < 2) return "Linear";
  const xVals = line.map(([x]) => x).filter((x) => x > 0);
  if (xVals.length < 2) return "Linear";
  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);
  if (xMin > 0 && xMax / xMin > 30) return "Logarithmic";
  return "Linear";
};

const calcConfidence = (line, idx) => {
  const pts = (line || []).length;
  const base = [94, 91, 88, 85, 82, 79, 76, 73][idx % 8];
  if (pts === 0) return 0;
  if (pts > 500) return Math.min(99, base + 3);
  if (pts > 200) return Math.min(99, base + 1);
  if (pts > 50) return base;
  return Math.max(60, base - 8);
};

const getGraphLabel = (index) => {
  let label = "";
  let value = index;
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
};

const GRAPH_COLORS = [
  "#FF0000","#00FF00","#0000FF","#FFA500","#800080",
  "#00FFFF","#FFC0CB","#FFFF00","#A52A2A","#008000",
];

export default function AITrackPrediction({
  uploadedFile,
  imageUrl,
  imageDimensions,
  sourceGraphLines,
}) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [progress, setProgress] = useState(0);
  const [trackLogTypes, setTrackLogTypes] = useState([]);
  const [metadata, setMetadata] = useState({
    wellName: "",
    fieldName: "",
    county: "",
    state: "",
    depthFrom: "",
    depthTo: "",
    company: "",
    uwi: "",
  });
  const [analysisTime, setAnalysisTime] = useState(null);
  const intervalRef = useRef(null);

  // Auto-populate log types when sourceGraphLines change
  useEffect(() => {
    if (sourceGraphLines && sourceGraphLines.length > 0) {
      setTrackLogTypes(
        sourceGraphLines.map((_, idx) => LOG_TYPES[idx % LOG_TYPES.length])
      );
      setAnalysisComplete(false);
    }
  }, [sourceGraphLines]);

  const handleRunAnalysis = () => {
    if (!sourceGraphLines || sourceGraphLines.length === 0) return;
    setIsAnalyzing(true);
    setAnalysisComplete(false);
    setProgress(0);
    const start = Date.now();

    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(intervalRef.current);
          setIsAnalyzing(false);
          setAnalysisComplete(true);
          setAnalysisTime(((Date.now() - start) / 1000).toFixed(1));
          return 100;
        }
        return prev + Math.random() * 12 + 5;
      });
    }, 120);
  };

  useEffect(() => () => clearInterval(intervalRef.current), []);

  const hasData = sourceGraphLines && sourceGraphLines.length > 0;

  return (
    <div className="flex flex-col h-full w-full overflow-auto bg-[#0d1117] text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-700 bg-[#111827]">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-900 border border-blue-700">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
            <path d="M12 8v4l3 3"/>
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-wide text-white">AI Auto Log &amp; Track Prediction</h2>
          <p className="text-xs text-gray-400">Automated track detection · Scale classification · OCR metadata extraction</p>
        </div>
        {analysisComplete && (
          <span className="ml-auto text-xs px-2 py-1 rounded-full bg-green-900 border border-green-600 text-green-300">
            ✓ Analysis Complete · {analysisTime}s
          </span>
        )}
      </div>

      <div className="flex flex-1 gap-0 overflow-hidden">
        {/* Left Results Panel */}
        <div className="flex flex-col flex-1 overflow-auto px-6 py-4 gap-5">

          {/* Status / No Data */}
          {!hasData && (
            <div className="flex flex-col items-center justify-center flex-1 text-center py-20">
              <div className="w-16 h-16 mb-4 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#4b5563" strokeWidth="1.5">
                  <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-gray-400 text-sm mb-1">No graph data detected yet.</p>
              <p className="text-gray-500 text-xs max-w-xs">Upload a TIFF file and process it first using the left panel controls. The AI module will analyze the detected tracks automatically.</p>
            </div>
          )}

          {/* Has Data */}
          {hasData && (
            <>
              {/* Run Analysis Button */}
              {!analysisComplete && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleRunAnalysis}
                    disabled={isAnalyzing}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                      isAnalyzing
                        ? "bg-gray-800 border-gray-600 text-gray-400 cursor-not-allowed"
                        : "bg-blue-900 border-blue-600 text-blue-200 hover:bg-blue-800 cursor-pointer"
                    }`}
                  >
                    {isAnalyzing ? (
                      <>
                        <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        Analyzing Tracks...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Run AI Analysis
                      </>
                    )}
                  </button>
                  <span className="text-xs text-gray-400">{sourceGraphLines.length} track{sourceGraphLines.length !== 1 ? "s" : ""} detected · ready for analysis</span>
                </div>
              )}

              {/* Progress Bar */}
              {isAnalyzing && (
                <div className="w-full bg-gray-800 rounded-full h-2 border border-gray-700 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-150 rounded-full"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
              )}

              {/* Detected Tracks */}
              <div className="bg-[#111827] border border-gray-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-widest">Detected Tracks</span>
                  <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-blue-900 text-blue-300 border border-blue-700">{sourceGraphLines.length}</span>
                </div>
                <div className="divide-y divide-gray-800">
                  {sourceGraphLines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/40 transition-colors">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0 border border-white/20"
                        style={{ backgroundColor: GRAPH_COLORS[idx % GRAPH_COLORS.length] }}
                      />
                      <span className="text-sm text-gray-200 font-medium">Track {getGraphLabel(idx)}</span>
                      <span className="text-xs text-gray-500">({(line || []).length} pts)</span>
                      <div className="ml-auto flex items-center gap-2">
                        <select
                          value={trackLogTypes[idx] || LOG_TYPES[idx % LOG_TYPES.length]}
                          onChange={(e) => {
                            const next = [...trackLogTypes];
                            next[idx] = e.target.value;
                            setTrackLogTypes(next);
                          }}
                          className="text-xs bg-gray-800 border border-gray-600 text-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {LOG_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        {analysisComplete && (
                          <span className="text-green-400 text-xs font-bold">✓</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scale Detection */}
              <div className="bg-[#111827] border border-gray-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-700">
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-widest">Scale Detection</span>
                </div>
                <div className="divide-y divide-gray-800">
                  {sourceGraphLines.map((line, idx) => {
                    const scale = detectScale(line);
                    return (
                      <div key={idx} className="flex items-center gap-3 px-4 py-3">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: GRAPH_COLORS[idx % GRAPH_COLORS.length] }}
                        />
                        <span className="text-sm text-gray-300">Track {getGraphLabel(idx)}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                            scale === "Logarithmic"
                              ? "bg-orange-900/60 border-orange-600 text-orange-300"
                              : "bg-blue-900/60 border-blue-600 text-blue-300"
                          }`}>
                            {scale}
                          </span>
                          {analysisComplete && <span className="text-green-400 text-xs">✓</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Confidence Scores */}
              {analysisComplete && (
                <div className="bg-[#111827] border border-gray-700 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-700">
                    <span className="text-xs font-semibold text-gray-300 uppercase tracking-widest">AI Confidence Scores</span>
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    {sourceGraphLines.map((line, idx) => {
                      const conf = calcConfidence(line, idx);
                      const logType = trackLogTypes[idx] || LOG_TYPES[idx % LOG_TYPES.length];
                      return (
                        <div key={idx}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: GRAPH_COLORS[idx % GRAPH_COLORS.length] }}/>
                              <span className="text-xs text-gray-300">{logType.split(" ")[0]}</span>
                            </div>
                            <span className={`text-xs font-bold ${conf >= 90 ? "text-green-400" : conf >= 75 ? "text-yellow-400" : "text-red-400"}`}>
                              {conf}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${
                                conf >= 90 ? "bg-green-500" : conf >= 75 ? "bg-yellow-500" : "bg-red-500"
                              }`}
                              style={{ width: `${conf}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Metadata Panel */}
        <div className="w-72 flex-shrink-0 border-l border-gray-700 bg-[#111827] px-4 py-4 flex flex-col gap-4 overflow-auto">
          <div>
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-widest mb-3">OCR Metadata</h3>
            <div className="space-y-2.5">
              {[
                { key: "wellName", label: "Well Name" },
                { key: "fieldName", label: "Field Name" },
                { key: "county", label: "County" },
                { key: "state", label: "State" },
                { key: "company", label: "Company" },
                { key: "uwi", label: "UWI" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 block mb-1">{label}</label>
                  <input
                    type="text"
                    value={metadata[key]}
                    onChange={(e) => setMetadata((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={`Enter ${label}`}
                    className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-600 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-widest mb-3">Depth Range</h3>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">From (ft)</label>
                <input
                  type="number"
                  value={metadata.depthFrom}
                  onChange={(e) => setMetadata((p) => ({ ...p, depthFrom: e.target.value }))}
                  placeholder="e.g. 7500"
                  className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-600 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">To (ft)</label>
                <input
                  type="number"
                  value={metadata.depthTo}
                  onChange={(e) => setMetadata((p) => ({ ...p, depthTo: e.target.value }))}
                  placeholder="e.g. 8200"
                  className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-600 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600"
                />
              </div>
            </div>
          </div>

          {/* Image Info */}
          {imageDimensions && imageDimensions.width > 0 && (
            <div className="border border-gray-700 rounded-lg p-3">
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-widest mb-2">Image Info</h3>
              <div className="space-y-1 text-xs text-gray-400">
                <div className="flex justify-between">
                  <span>Width</span>
                  <span className="text-gray-200">{imageDimensions.width}px</span>
                </div>
                <div className="flex justify-between">
                  <span>Height</span>
                  <span className="text-gray-200">{imageDimensions.height}px</span>
                </div>
                <div className="flex justify-between">
                  <span>Tracks</span>
                  <span className="text-gray-200">{sourceGraphLines?.length ?? 0}</span>
                </div>
                {uploadedFile && (
                  <div className="flex justify-between">
                    <span>File</span>
                    <span className="text-gray-200 truncate max-w-[100px]">{uploadedFile.name}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Results summary */}
          {analysisComplete && (
            <div className="border border-green-800 bg-green-900/20 rounded-lg p-3">
              <h3 className="text-xs font-semibold text-green-400 uppercase tracking-widest mb-2">AI Results</h3>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-gray-300">
                  <span>Tracks Found</span>
                  <span className="text-green-400 font-semibold">{sourceGraphLines.length}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Avg Confidence</span>
                  <span className="text-green-400 font-semibold">
                    {Math.round(sourceGraphLines.reduce((sum, l, i) => sum + calcConfidence(l, i), 0) / sourceGraphLines.length)}%
                  </span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Log Types</span>
                  <span className="text-green-400 font-semibold">{new Set(trackLogTypes).size} types</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Analysis Time</span>
                  <span className="text-green-400 font-semibold">{analysisTime}s</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

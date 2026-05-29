from pathlib import Path
path = Path(r'c:\Users\HP\Desktop\Proj-GraphTrackerTiff-main\frontend\src\Components\DashboardV2\GraphTrackerV2.jsx')
text = path.read_text(encoding='utf-8')
needle = """        <div className=\"w-px h-5 bg-gray-200\" />

        {/* Preview tabs */}
"""
replacement = """        <button
          onClick={() => {
            setSmartCursorView(v => !v);
            if (smartCursorView) {
              setHoveredPlot(null);
              setTrackingGraph(null);
            }
          }}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border transition-all ${
            smartCursorView
              ? \"bg-purple-50 border-purple-300 text-purple-700\"
              : \"bg-white border-gray-200 text-gray-600 hover:bg-gray-50\"
          }`}>
          <span>🧭</span>
          AI Curve Tracking
        </button>

        <div className=\"w-px h-5 bg-gray-200\" />

        {/* Preview tabs */}
"""
if needle not in text:
    raise SystemExit('needle not found')
path.write_text(text.replace(needle, replacement, 1), encoding='utf-8')

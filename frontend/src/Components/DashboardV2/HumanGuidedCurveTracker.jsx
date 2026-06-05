import React, { useState, useRef, useEffect, useCallback } from 'react';

// Helper: Catmull-Rom interpolation for smooth curves
function catmullRomSpline(points, numSegments = 20) {
  if (points.length < 2) return points;
  
  // Pad points to simplify loop
  const p = [points[0], ...points, points[points.length - 1]];
  const result = [];
  
  for (let i = 1; i < p.length - 2; i++) {
    const p0 = p[i - 1];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2];
    
    for (let t = 0; t < 1; t += 1 / numSegments) {
      const t2 = t * t;
      const t3 = t2 * t;
      
      const x = 0.5 * (
        (2 * p1[0]) +
        (-p0[0] + p2[0]) * t +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
      );
      
      const y = 0.5 * (
        (2 * p1[1]) +
        (-p0[1] + p2[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
      );
      
      result.push([Math.round(x), Math.round(y)]);
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

const HumanGuidedCurveTracker = ({ imageUrl, onCurveTracked }) => {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  
  const [points, setPoints] = useState([]); // Array of [x, y]
  const [trackedCurve, setTrackedCurve] = useState([]);
  const [mousePos, setMousePos] = useState(null); // For the magnifying loupe

  // Load image onto canvas
  useEffect(() => {
    if (!imageUrl) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imageUrl;
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      imageRef.current = img;
      redraw();
    };
  }, [imageUrl]);

  // Enhanced Feature 1: Sub-pixel snapping to the darkest area (curve line)
  const snapToDarkestPixel = (x, y, radius = 8) => {
    if (!canvasRef.current) return [x, y];
    const ctx = canvasRef.current.getContext('2d');
    
    const startX = Math.max(0, x - radius);
    const startY = Math.max(0, y - radius);
    const width = Math.min(canvasRef.current.width - startX, radius * 2);
    const height = Math.min(canvasRef.current.height - startY, radius * 2);
    
    // Need to avoid error if bounds are 0
    if (width <= 0 || height <= 0) return [x, y];

    const imageData = ctx.getImageData(startX, startY, width, height);
    const data = imageData.data;
    
    let darkestVal = 255 * 3; // Max white value
    let bestX = x;
    let bestY = y;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      const sum = r + g + b;
      
      if (sum < darkestVal) {
        darkestVal = sum;
        const pixelIdx = i / 4;
        const dx = pixelIdx % width;
        const dy = Math.floor(pixelIdx / width);
        bestX = startX + dx;
        bestY = startY + dy;
      }
    }
    return [bestX, bestY];
  };

  const handleCanvasClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    
    let x = Math.round((e.clientX - rect.left) * scaleX);
    let y = Math.round((e.clientY - rect.top) * scaleY);
    
    // Snap the user's click to the actual curve pixel
    const [snappedX, snappedY] = snapToDarkestPixel(x, y, 10);
    
    setPoints(prev => [...prev, [snappedX, snappedY]]);
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    setMousePos({
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      rawX: e.clientX,
      rawY: e.clientY
    });
  };

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current) return;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageRef.current, 0, 0);
    
    // Draw tracked curve
    if (trackedCurve.length > 0) {
      ctx.beginPath();
      ctx.moveTo(trackedCurve[0][0], trackedCurve[0][1]);
      for (let i = 1; i < trackedCurve.length; i++) {
        ctx.lineTo(trackedCurve[i][0], trackedCurve[i][1]);
      }
      ctx.strokeStyle = '#00FF00'; // Neon Green
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    
    // Draw anchor points
    points.forEach((p, idx) => {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 4, 0, 2 * Math.PI);
      // First point is green, last is red, middle points are blue
      ctx.fillStyle = idx === 0 ? '#10B981' : idx === points.length - 1 ? '#EF4444' : '#3B82F6';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }, [points, trackedCurve]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // The Process Button action
  const handleTrackCurve = () => {
    if (points.length < 2) return;
    
    // Enhanced Feature 2: Sort points by Y-axis to ensure valid interpolation for vertical well logs
    const sortedPoints = [...points].sort((a, b) => a[1] - b[1]);
    
    // Enhanced Feature 3: Mathematical Spline interpolation
    const spline = catmullRomSpline(sortedPoints, 50); // High density
    setTrackedCurve(spline);
    
    if (onCurveTracked) {
      onCurveTracked(spline);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-gray-800 text-lg">Guided Tracking Mode</h3>
          <p className="text-sm text-gray-500">Click to add anchor points. Points automatically snap to the darkest curve pixel.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => { setPoints([]); setTrackedCurve([]); }} 
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded text-gray-700 font-medium transition"
          >
            Clear All
          </button>
          <button 
            onClick={handleTrackCurve} 
            disabled={points.length < 2}
            className={`px-4 py-2 text-sm rounded font-medium transition flex items-center gap-2 ${
              points.length >= 2 
                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <span>🪄</span> Track Curve
          </button>
        </div>
      </div>

      <div className="relative overflow-auto border border-gray-300 rounded cursor-crosshair max-h-[700px] w-full">
        <canvas 
          ref={canvasRef} 
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setMousePos(null)}
          className="max-w-none shadow-inner"
        />
        
        {/* Enhanced Feature 4: Magnifying Loupe for precision clicking */}
        {mousePos && imageUrl && (
          <div 
            className="fixed pointer-events-none border-2 border-blue-500 rounded-full overflow-hidden shadow-2xl z-50 bg-white"
            style={{
              left: mousePos.rawX + 20,
              top: mousePos.rawY + 20,
              width: 120,
              height: 120,
              backgroundImage: `url(${imageUrl})`,
              // Render the background 3x zoomed relative to the mouse position
              backgroundPosition: `-${mousePos.x * 3 - 60}px -${mousePos.y * 3 - 60}px`,
              backgroundSize: `${canvasRef.current?.width * 3 || 0}px ${canvasRef.current?.height * 3 || 0}px`,
              backgroundRepeat: 'no-repeat',
            }}
          >
            <div className="absolute top-1/2 left-0 w-full h-[1px] bg-red-500 opacity-60"></div>
            <div className="absolute left-1/2 top-0 w-[1px] h-full bg-red-500 opacity-60"></div>
            <div className="absolute top-1/2 left-1/2 w-2 h-2 border border-red-500 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
          </div>
        )}
      </div>
      
      {/* Stats Readout */}
      {trackedCurve.length > 0 && (
        <div className="text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200">
          ✓ Successfully generated <strong>{trackedCurve.length}</strong> precise data points.
        </div>
      )}
    </div>
  );
};

export default HumanGuidedCurveTracker;

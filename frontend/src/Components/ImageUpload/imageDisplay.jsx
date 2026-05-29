import React, { useState, useRef, useEffect } from 'react';

const ImageAnnotationApp = () => {
  const [imageFile, setImageFile] = useState(null); // Store uploaded image file
  const [points, setPoints] = useState([]); // Store points clicked on canvas
  const [isDragging, setIsDragging] = useState(false); // Track if a point is being dragged
  const [draggedPointIndex, setDraggedPointIndex] = useState(null); // Store index of the dragged point
  const [drawMode, setDrawMode] = useState(true); // Toggle between draw mode and drag mode
  const [insertMode, setInsertMode] = useState(false); // Toggle between normal and insert point modes
  const [activeMode, setActiveMode] = useState('draw'); // Track the active mode
  const [zoom, setZoom] = useState(0.2); // Zoom level (default 100%)

  const imageCanvasRef = useRef(null);

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(URL.createObjectURL(file));
      setPoints([]); // Reset points when a new image is uploaded
    } else {
      alert('Please upload a valid image.');
    }
  };

  const handleCanvasClick = (event) => {
    if (isDragging || !drawMode || insertMode) return; // Prevent adding points if dragging or not in draw mode

    const canvas = imageCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / zoom; // Adjust for zoom
    const y = (event.clientY - rect.top) / zoom; // Adjust for zoom

    // Add new point to the points array
    setPoints([...points, { x, y }]);

    // Redraw the canvas to include the new point and lines
    renderImage();
  };

  const handleMouseDown = (event) => {
    if (drawMode || insertMode) return; // Do not allow dragging in draw or insert modes

    const canvas = imageCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / zoom; // Adjust for zoom
    const y = (event.clientY - rect.top) / zoom; // Adjust for zoom

    // Check if user clicked on an existing point to drag it
    const clickedPointIndex = points.findIndex(
      (point) => Math.abs(point.x - x) < 10 / zoom && Math.abs(point.y - y) < 10 / zoom
    );

    if (clickedPointIndex !== -1) {
      setIsDragging(true);
      setDraggedPointIndex(clickedPointIndex);
    }
  };

  const handleMouseMove = (event) => {
    if (!isDragging) return;

    const canvas = imageCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / zoom; // Adjust for zoom
    const y = (event.clientY - rect.top) / zoom; // Adjust for zoom

    const newPoints = [...points];
    newPoints[draggedPointIndex] = { x, y };
    setPoints(newPoints);

    renderImage();
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      setDraggedPointIndex(null);
      renderImage(); // Redraw after dragging ends
    }
  };

  const handleInsertPointClick = (event) => {
    if (!insertMode || points.length < 2) return;

    const canvas = imageCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / zoom; // Adjust for zoom
    const y = (event.clientY - rect.top) / zoom; // Adjust for zoom

    let closestSegmentIndex = -1;
    let minDist = Infinity;

    // Helper function to calculate the distance from a point to a line segment
    const distanceToSegment = (px, py, ax, ay, bx, by) => {
      const abx = bx - ax;
      const aby = by - ay;
      const t = ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby);
      const clampT = Math.max(0, Math.min(1, t));
      const closestX = ax + clampT * abx;
      const closestY = ay + clampT * aby;
      return Math.hypot(px - closestX, py - closestY);
    };

    for (let i = 0; i < points.length - 1; i++) {
      const dist = distanceToSegment(x, y, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
      if (dist < minDist) {
        minDist = dist;
        closestSegmentIndex = i;
      }
    }

    const newPoints = [...points];
    if (closestSegmentIndex !== -1) {
      newPoints.splice(closestSegmentIndex + 1, 0, { x, y });
      setPoints(newPoints);
      renderImage();
    }
  };

  const renderImage = () => {
    const canvas = imageCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = imageFile;

    img.onload = () => {
      canvas.width = img.width * zoom; // Adjust width based on zoom
      canvas.height = img.height * zoom; // Adjust height based on zoom

      // Scale the context to zoom
      ctx.scale(zoom, zoom);

      // Draw the image on the canvas
      ctx.drawImage(img, 0, 0, img.width, img.height);

      // Redraw the points and lines connecting them
      if (points.length > 0) {
        ctx.strokeStyle = 'red'; // Line color
        ctx.lineWidth = 2 / zoom; // Adjust line width for zoom

        points.forEach((point, index) => {
          ctx.fillStyle = 'red'; // Point color
          ctx.beginPath();
          ctx.arc(point.x, point.y, 5 / zoom, 0, 2 * Math.PI); // Adjust point size for zoom
          ctx.fill();

          if (index > 0) {
            const prevPoint = points[index - 1];
            ctx.beginPath();
            ctx.moveTo(prevPoint.x, prevPoint.y);
            ctx.lineTo(point.x, point.y);
            ctx.stroke();
          }
        });
      }
    };
  };

  const toggleDrawMode = () => {
    setDrawMode(true);
    setInsertMode(false);
    setActiveMode('draw');
  };

  const toggleDragMode = () => {
    setDrawMode(false);
    setInsertMode(false);
    setActiveMode('drag');
  };

  const toggleInsertMode = () => {
    setInsertMode(true);
    setDrawMode(false);
    setIsDragging(false);
    setActiveMode('insert');
  };

  const handleZoomIn = () => {
    setZoom(prevZoom => Math.min(prevZoom + 0.1, 3)); // Limit max zoom to 3x
  };

  const handleZoomOut = () => {
    setZoom(prevZoom => Math.max(prevZoom - 0.1, 0.2)); // Limit min zoom to 0.5x
  };

  const buttonStyle = (mode) => ({
    backgroundColor: activeMode === mode ? 'blue' : 'transparent',
    color: activeMode === mode ? 'white' : 'black',
    border: '1px solid black',
    padding: '10px',
    margin: '5px',
  });

  useEffect(() => {
    if (imageFile) {
      renderImage(); // Re-render the image whenever zoom or points change
    }
  }, [imageFile, points, zoom]);

  return (
    <div>
      <input type="file" onChange={handleImageUpload} />
      <br />
      <button style={buttonStyle('draw')} onClick={toggleDrawMode}>Enable Draw Mode</button>
      <button className="cursor-pointer" style={buttonStyle('drag')} onClick={toggleDragMode}>Enable Drag Mode</button>
      <button style={buttonStyle('insert')} onClick={toggleInsertMode}>Enable Insert Point Mode</button>
      <br />
      <button onClick={handleZoomIn}>Zoom In</button>
      <button onClick={handleZoomOut}>Zoom Out</button>
      <br />
      <canvas
        ref={imageCanvasRef}
        onClick={insertMode ? handleInsertPointClick : handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ border: '1px solid black', marginTop: '20px' }}
      />
    </div>
  );
};

export default ImageAnnotationApp;

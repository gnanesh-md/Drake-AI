import React, { useState, useRef, useEffect } from "react";
import * as TIFF from "tiff.js";
import axios from "axios";
import Navbar from "./navbar";
import { useNavigate } from "react-router-dom";

const ImageSplitter = () => {
  const [imageFiles, setImageFiles] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [pointsGraph1, setPointsGraph1] = useState([]);
  const [pointsGraph2, setPointsGraph2] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedPointIndex, setDraggedPointIndex] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [isInserting, setIsInserting] = useState(false); // New state for insertion mode
  const imageCanvasRef = useRef(null);
  const imageCanvasRef2 = useRef(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageUrl2, setImageUrl2] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch user data, handle token, etc.
  }, [navigate]);

  const handleImageUpload2 = async (event) => {
    const file = event.target.files[0];
  
    if (file && file.name.endsWith(".tif")) {
      const formData = new FormData();
      formData.append("file", file);
  
      try {
        const response = await axios.post("/api", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
  
        const { images, las, curves_boxes } = response.data;
  
        const img1 = new Image();
        const img2 = new Image();
  
        img1.src = `data:image/png;base64,${images[0]}`;
        img2.src = `data:image/png;base64,${images[1]}`;
  
        img1.onload = () => {
          const curveboxes1 = curves_boxes[0];
          const [x1, y1, x2, y2] = curveboxes1;
          const imgxdiff1 = x2 - x1;
  
          const xValues1 = las[0][0].map(x => -x + imgxdiff1);
          const yValues1 = las[0][1].map(y => y + 500);
  
          // Create (x, y) pairs for Graph 1, skipping every 10 points
          const pointsGraph1 = xValues1
            .map((x, index) => ({
              x: x,
              y: yValues1[index]
            }))
            .filter((_, index) => index % 11 === 0); // Keep every 11th point (skip 10)
  
          setPointsGraph1(pointsGraph1);
          setImageUrl(img1.src);
          setCurvesBox1(curves_boxes[0]);
        };
  
        img2.onload = () => {
          const curveboxes2 = curves_boxes[1];
          const [x1, y1, x2, y2] = curveboxes2;
          const imgxdiff2 = x2 - x1;
  
          const xValues2 = las[1][0].map(x => -x + imgxdiff2);
          const yValues2 = las[1][1].map(y => y + 500);
  
          // Create (x, y) pairs for Graph 2, skipping every 10 points
          const pointsGraph2 = xValues2
            .map((x, index) => ({
              x: x,
              y: yValues2[index]
            }))
            .filter((_, index) => index % 11 === 0); // Keep every 11th point (skip 10)
  
          setPointsGraph2(pointsGraph2);
          setImageUrl2(img2.src);
          setCurvesBox2(curves_boxes[1]);
        };
  
      } catch (error) {
        console.error("Error uploading the image:", error);
      }
    }
  };
  

  const handleMouseDown = (event, graphIndex) => {
  const canvas = graphIndex === 1 ? imageCanvasRef.current : imageCanvasRef2.current;
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / zoom;
  const y = (event.clientY - rect.top) / zoom;

  const points = graphIndex === 1 ? pointsGraph1 : pointsGraph2;

  if (isInserting) {
    // Check for insertion point by calculating the distance between the clicked point and the line segment
    const clickedIndex = points.findIndex((point, index) => {
      if (index === points.length - 1) return false; // Don't check last point
      const nextPoint = points[index + 1];

      // Check if the clicked point is near the line between point and nextPoint
      const distanceToSegment = getDistanceToSegment({ x, y }, point, nextPoint);
      return distanceToSegment < 10 / zoom; // Adjust the threshold for clicking near a line
    });

    if (clickedIndex !== -1) {
      // Insert a new point between clickedIndex and clickedIndex + 1
      const newPoint = {
        x: (points[clickedIndex].x + points[clickedIndex + 1].x) / 2,
        y: (points[clickedIndex].y + points[clickedIndex + 1].y) / 2,
      };
      const newPoints = [
        ...points.slice(0, clickedIndex + 1),
        newPoint,
        ...points.slice(clickedIndex + 1),
      ];

      if (graphIndex === 1) {
        setPointsGraph1(newPoints);
      } else {
        setPointsGraph2(newPoints);
      }
    }
  } else {
    // Handle dragging points
    const clickedPointIndex = points.findIndex(
      (point) => Math.abs(point.x - x) < 10 / zoom && Math.abs(point.y - y) < 10 / zoom
    );

    if (clickedPointIndex !== -1) {
      setIsDragging(true);
      setDraggedPointIndex(clickedPointIndex);
    }
  }
};

// Helper function to calculate the distance from a point to a line segment
const getDistanceToSegment = (p, v, w) => {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2; // Length squared of the segment
  if (l2 === 0) return Math.sqrt((p.x - v.x) ** 2 + (p.y - v.y) ** 2); // v == w case
  const t = Math.max(0, Math.min(1, ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2));
  const projection = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) }; // Projection on the segment
  return Math.sqrt((p.x - projection.x) ** 2 + (p.y - projection.y) ** 2);
};



  const handleMouseMove = (event, graphIndex) => {
    if (!isDragging || draggedPointIndex === null) return;

    const canvas = graphIndex === 1 ? imageCanvasRef.current : imageCanvasRef2.current;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / zoom;
    const y = (event.clientY - rect.top) / zoom;

    const newPoints = graphIndex === 1 ? [...pointsGraph1] : [...pointsGraph2];
    newPoints[draggedPointIndex] = { x, y };

    if (graphIndex === 1) {
      setPointsGraph1(newPoints);
    } else {
      setPointsGraph2(newPoints);
    }

    renderImage(graphIndex);
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      setDraggedPointIndex(null);
    }
  };

  const toggleInsertMode = () => {
    setIsInserting(!isInserting);
  };

  const renderImage = (graphIndex) => {
    const canvas = graphIndex === 1 ? imageCanvasRef.current : imageCanvasRef2.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    const imageSrc = graphIndex === 1 ? imageUrl : imageUrl2;
  
    img.src = imageSrc;
  
    img.onload = () => {
      canvas.width = img.width * zoom;
      canvas.height = img.height * zoom;
  
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(zoom, zoom);
      ctx.drawImage(img, 0, 0, img.width, img.height);
  
      const points = graphIndex === 1 ? pointsGraph1 : pointsGraph2;
      renderPoints(ctx, points, graphIndex === 1 ? "red" : "blue");
      drawLines(ctx, points); // Call the new function to draw lines
    };
  };
// New function to draw lines between points
const drawLines = (ctx, points) => {
  ctx.strokeStyle = "rgba(0, 0, 0, 0.5)"; // Color for the lines
  ctx.lineWidth = 2; // Line width

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y); // Move to the first point
    } else {
      ctx.lineTo(point.x, point.y); // Draw line to the next point
    }
  });
  ctx.stroke(); // Render the lines
};
const renderPoints = (ctx, points, color) => {
  ctx.fillStyle = color;

  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5 / zoom, 0, 2 * Math.PI);
    ctx.fill();
  });
};

  useEffect(() => {
    if (imageUrl) {
      renderImage(1);
    }
    if (imageUrl2) {
      renderImage(2);
    }
  }, [imageUrl, imageUrl2, pointsGraph1, pointsGraph2, zoom]);


  const zoomIn = () => {
    setZoom((prevZoom) => Math.min(prevZoom + 0.1, 3)); // Max zoom level of 3x
  };
  
  const zoomOut = () => {
    setZoom((prevZoom) => Math.max(prevZoom - 0.1, 0.5)); // Min zoom level of 0.5x
  };
  

  return (
    <div className="text-white">
  <input type="file" onChange={handleImageUpload2} />
  <button onClick={toggleInsertMode}>
    {isInserting ? "Disable Insertion Mode" : "Enable Insertion Mode"}
  </button>
  <button onClick={zoomIn}>
    zoomIn
  </button>
  <button onClick={zoomOut}>
    zoomOut
  </button>

  {/* Flex Container for Parallel Canvases */}
  <div className="flex space-x-2 overflow-auto">
    {/* Scrollable Container for Canvas 1 */}
    <div className="h-screen border border-gray-600">
      <canvas
        ref={imageCanvasRef}
        onMouseDown={(event) => handleMouseDown(event, 1)}
        onMouseMove={(event) => handleMouseMove(event, 1)}
        onMouseUp={handleMouseUp}
        className="block"
        style={{ border: "1px solid black" }}
      />
    </div>

    {/* Scrollable Container for Canvas 2 */}
    <div className="h-screen border border-gray-600">
      <canvas
        ref={imageCanvasRef2}
        onMouseDown={(event) => handleMouseDown(event, 2)}
        onMouseMove={(event) => handleMouseMove(event, 2)}
        onMouseUp={handleMouseUp}
        className="block"
        style={{ border: "1px solid black" }}
      />
    </div>
  </div>

  {/* Add zoom buttons and other controls as needed */}
</div>
  );
};
export default ImageSplitter;

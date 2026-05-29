import React, { useState, useRef, useEffect } from "react";import * as TIFF from 'tiff.js';import axios from 'axios';
import { NODE_API } from "../../config/constants";

const Canvas = () => {
    const [imageFiles, setImageFiles] = useState([]);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [pointsGraph1, setPointsGraph1] = useState([]);
    const [pointsGraph2, setPointsGraph2] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [draggedPoint, setDraggedPoint] = useState(null);
    const [draggedPointGraph, setDraggedPointGraph] = useState(null); // Which graph's point is being dragged
    const [activeGraph, setActiveGraph] = useState(null); // 'graph1' or 'graph2'
    const [isDragMode, setIsDragMode] = useState(false)
    const [draggedPointIndex, setDraggedPointIndex] = useState(null);
    const [drawMode, setDrawMode] = useState(true);
    const [insertMode, setInsertMode] = useState(false);
    const [activeMode, setActiveMode] = useState(null);
    const [activeModeGraph1, setActiveModeGraph1] = useState("draw");
    const [activeModeGraph2, setActiveModeGraph2] = useState("draw");
    const [zoom, setZoom] = useState(0.2); 
    const [imageName, setImageName] = useState('');
    const imageCanvasRef = useRef(null);
    const [imageUrl, setImageUrl] = useState(null);
    const [curvesBoxes, setCurvesBoxes] = useState({ boxes0: [], boxes1: [] });

  // const handleImageUpload2 = async (event) => {
  //   const file = event.target.files[0];

  //   if (file && file.name.endsWith(".tif")) {
  //     const formData = new FormData();
  //     formData.append('image', file);

  //     try {
  //       const response = await axios.post('http://localhost:5000/upload', formData, {
  //         headers: {
  //           'Content-Type': 'multipart/form-data',
  //         },
  //       });

  //       setImageUrl(`http://localhost:5000${response.data.imageUrl}`);
  //       setImageName(file.name);
  //       console.log(setImageName);
        
  //       console.log(`http://localhost:5000${response.data.imageUrl}`);
        
  //     } catch (error) {
  //       console.error('Error uploading the image:', error);
  //     }
  //   }
  // };


  const handleImageUpload2 = async (event) => {
    const file = event.target.files[0];

    if (file && file.name.endsWith(".tif")) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        // First, upload the image to get the imageUrl
        const response = await axios.post(NODE_API + '/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        setImageUrl(`${NODE_API}${response.data.imageUrl}`);
        setImageName(file.name);
        console.log(setImageName);
        
        console.log(`${NODE_API}${response.data.imageUrl}`);
        setImageUrl(file);
        // Now call the second API to get the curves_boxes
        const apiResponse = await axios.post("/api", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });

        const { curves_boxes } = apiResponse.data;

         // Separate curves_boxes[0] and curves_boxes[1]
         setCurvesBoxes({
          boxes0: curves_boxes[0], // For green color
          boxes1: curves_boxes[1], // For orange color
        });

        // Extract the bounding box dimensions from curves_boxes[0]
        const [box0] = curves_boxes[0]; // Assuming curves_boxes[0] has one bounding box

        if (box0) {
          const graphBoundingBox1 = {
            x: box0.x,
            y: box0.y,
            width: box0.width,
            height: box0.height
          };

          // Transform LAS data to points based on the bounding box
          const xValues1 = las[0][0].map(x => graphBoundingBox1.x + x * graphBoundingBox1.width);
          const yValues1 = las[0][1].map(y => graphBoundingBox1.y + (1 - y) * graphBoundingBox1.height);

          const pointsGraph1 = xValues1.map((x, index) => ({
            x: x,
            y: yValues1[index]
          }));

          // Set the transformed points for Graph 1
          setPointsGraph1(pointsGraph1);
          console.log(pointsGraph1);
        }
      } catch (error) {
        console.error("Error uploading the image or fetching data:", error);
      }
    }
  };

  // Function to draw the image and curve boxes on the canvas
  const drawImageWithBoxes = () => {
    const { boxes0, boxes1 } = curvesBoxes;
    if (imageUrl && (boxes0.length > 0 || boxes1.length > 0)) {
      const canvas = imageCanvasRef.current;
      const ctx = canvas.getContext("2d");

      // Load the image from the file URL
      const img = new Image();
      img.src = imageUrl;

      img.onload = () => {
        // Set canvas dimensions based on the image size
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // Draw the image on the canvas
        ctx.drawImage(img, 0, 0);

        // Draw the transformed points from Graph 1
        pointsGraph1.forEach((point) => {
          ctx.strokeStyle = "green";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
          ctx.stroke();
        });

        // Draw boxes from curves_boxes[0] with green color
        boxes0.forEach((box) => {
          ctx.strokeStyle = "green";
          ctx.lineWidth = 2;
          ctx.strokeRect(box.x, box.y, box.width, box.height);
        });

        // Draw boxes from curves_boxes[1] with orange color
        boxes1.forEach((box) => {
          ctx.strokeStyle = "orange";
          ctx.lineWidth = 2;
          ctx.strokeRect(box.x, box.y, box.width, box.height);
        });
      };
    }
  };
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
  
    if (file && file.name.endsWith(".tif")) {
        const formData = new FormData();
        formData.append('file', file);
  
        try {
            const response = await axios.post('/api', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
  
            const { images, las } = response.data;
  
            // Decode the first image and LAS data
            const imageBase64 = images[0];
            const lasBase64 = las[0];
            const lasBase642 = las[1];
            console.log("length: ",las.length);
            
  
            // Set the image URL
            setImageUrl(`data:image/png;base64,${images[0]}`);
            setImageUrl2(`data:image/png;base64,${images[1]}`);
  
            // // Decode the Base64 LAS data into a binary buffer
            // const binaryString = atob(lasBase64);
            // const lasBinary = new Uint8Array(binaryString.length);
  
            // for (let i = 0; i < binaryString.length; i++) {
            //     lasBinary[i] = binaryString.charCodeAt(i);
            // }
  
            // // Send the binary LAS data to another API for decoding
            // const lasResponse = await axios.post('http://localhost:5000/api/decode-las', lasBinary, {
            //     headers: {
            //         'Content-Type': 'application/octet-stream',
            //     },
            // });
  
            // const points = lasResponse.data;
            // console.log("LAS Points:", points);
            // setPointsGraph1(points);
            // setLasData(points);

            // const binaryString2 = atob(lasBase642);
            // const lasBinary2 = new Uint8Array(binaryString2.length);
  
            // for (let i = 0; i < binaryString2.length; i++) {
            //     lasBinary2[i] = binaryString2.charCodeAt(i);
            // }
  
            // // Send the binary LAS data to another API for decoding
            // const lasResponse2 = await axios.post('http://localhost:5000/api/decode-las', lasBinary2, {
            //     headers: {
            //         'Content-Type': 'application/octet-stream',
            //     },
            // });
  
            // const points2 = lasResponse2.data;
            // console.log("LAS Points:", points2);
            // setPointsGraph2(points2);
            // setLasData(points2);
  
        } catch (error) {
            console.error('Error uploading the image:', error);
        }
    }
};

  const handleSavePoints = async () => {
    if (!imageName) {
      alert("No image uploaded!");
      return;
    }

    try {
      await axios.post(NODE_API + '/api/points/save-points', {
        imageName: imageName,
        points: points
      });
      console.log(imageName,points)
      alert('Points saved successfully!');
    } catch (error) {
      console.error('Error saving points:', error);
    }
  };

  const handleExportPoints = async () => {
    if (!imageName) {
      alert("No image uploaded!");
      return;
    }

    try {
      const response = await axios.get(`${NODE_API}/api/points/export-points/${imageName}`, {
        responseType: 'blob'
      });
      console.log(imageName);
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${imageName}.las`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error exporting points:', error);
    }
  };
  
    // const handleCanvasClick = (event) => {
    //   if (isDragging || !drawMode || insertMode) return;
  
    //   const canvas = imageCanvasRef.current;
    //   const rect = canvas.getBoundingClientRect();
    //   const x = (event.clientX - rect.left) / zoom;
    //   const y = (event.clientY - rect.top) / zoom;
  
    //   setPoints([...points, { x, y }]);
    //   renderImage();
    // };

    const handleCanvasClick = (event) => {
      const canvas = imageCanvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / zoom;
      const y = (event.clientY - rect.top) / zoom;
  
      if (!isDragMode && !insertMode) {
        // Draw mode is active
        if (activeGraph === "graph1") {
          setPointsGraph1([...pointsGraph1, { x, y }]);
        } else if (activeGraph === "graph2") {
          setPointsGraph2([...pointsGraph2, { x, y }]);
        }
      } else if (insertMode) {
        handleInsertPointClick(x, y);
      }
      renderImage();
    };

    const findDraggedPoint = (x, y) => {
      // Check Graph 1 points
      for (let i = 0; i < pointsGraph1.length; i++) {
        const point = pointsGraph1[i];
        if (Math.abs(point.x - x) < 10 / zoom && Math.abs(point.y - y) < 10 / zoom) {
          return { point, index: i, graph: "graph1" };
        }
      }
  
      // Check Graph 2 points
      for (let i = 0; i < pointsGraph2.length; i++) {
        const point = pointsGraph2[i];
        if (Math.abs(point.x - x) < 10 / zoom && Math.abs(point.y - y) < 10 / zoom) {
          return { point, index: i, graph: "graph2" };
        }
      }
  
      return null;
    };
    const setDrawModeGraph1 = () => {
      setIsDragMode(false); // Disable drag mode
      setActiveGraph("graph1");
      console.log('graph1');
      
    };
  
    const setDrawModeGraph2 = () => {
      setIsDragMode(false); // Disable drag mode
      setActiveGraph("graph2");
    };
  
    const setDragMode = () => {
      setIsDragMode(true); // Enable drag mode for both graphs
      setActiveGraph(null); // Disable drawing
    };
  const handleMouseDown = (event) => {
    if (isDragMode) {
      const canvas = imageCanvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / zoom;
      const y = (event.clientY - rect.top) / zoom;

      const foundPoint = findDraggedPoint(x, y);
      if (foundPoint) {
        setDraggedPoint(foundPoint.index);
        setDraggedPointGraph(foundPoint.graph);
        setIsDragging(true);
      }
    }
  };

  const handleMouseMove = (event) => {
    if (isDragging && isDragMode) {
      const canvas = imageCanvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / zoom;
      const y = (event.clientY - rect.top) / zoom;

      if (draggedPointGraph === "graph1") {
        const updatedPoints = [...pointsGraph1];
        updatedPoints[draggedPoint] = { x, y };
        setPointsGraph1(updatedPoints);
      } else if (draggedPointGraph === "graph2") {
        const updatedPoints = [...pointsGraph2];
        updatedPoints[draggedPoint] = { x, y };
        setPointsGraph2(updatedPoints);
      }

      renderImage();
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggedPoint(null);
    setDraggedPointGraph(null);
  };
  
  const handleInsertPointClick = (x, y) => {
    const canvas = imageCanvasRef.current;

    let points;
    let setPoints;
    const canvasMiddle = canvas.width / 2;

    // Determine which graph was clicked
    if (x < canvasMiddle) {
      points = pointsGraph1;
      setPoints = setPointsGraph1;
    } else {
      points = pointsGraph2;
      setPoints = setPointsGraph2;
    }

    if (points.length < 2) return;

    let closestSegmentIndex = -1;
    let minDist = Infinity;

    const distanceToSegment = (px, py, ax, ay, bx, by) => {
      const abx = bx - ax;
      const aby = by - ay;
      const t = ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby);
      const clampT = Math.max(0, Math.min(1, t));
      const closestX = ax + clampT * abx;
      const closestY = ay + clampT * aby;
      return Math.hypot(px - closestX, py - closestY);
    };

    // Find the closest segment
    for (let i = 0; i < points.length - 1; i++) {
      const dist = distanceToSegment(
        x,
        y,
        points[i].x,
        points[i].y,
        points[i + 1].x,
        points[i + 1].y
      );
      if (dist < minDist) {
        minDist = dist;
        closestSegmentIndex = i;
      }
    }

    // Insert the new point in the closest segment
    const newPoints = [...points];
    if (closestSegmentIndex !== -1) {
      newPoints.splice(closestSegmentIndex + 1, 0, { x, y });
      setPoints(newPoints);
      renderImage();
    }
  };
  
    const renderImage = () => {
      const canvas = imageCanvasRef.current;
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.src = imageUrl;
  
      img.onload = () => {
        canvas.width = img.width * zoom;
        canvas.height = img.height * zoom;
  
        ctx.scale(zoom, zoom);
        ctx.drawImage(img, 0, 0, img.width, img.height);
  
        // Draw points on Graph 1
        renderPoints(ctx, pointsGraph1, "red");
        // Draw points on Graph 2
        renderPoints(ctx, pointsGraph2, "blue");
        if (curvesBoxes) {
          drawImageWithBoxes(ctx, curvesBoxes);
        }
      };
    };
    
    const renderPoints = (ctx, points, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 / zoom;
  
      points.forEach((point, index) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5 / zoom, 0, 2 * Math.PI);
        ctx.fill();
  
        if (index > 0) {
          const prevPoint = points[index - 1];
          ctx.beginPath();
          ctx.moveTo(prevPoint.x, prevPoint.y);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
        }
      });
    };
    const toggleDrawMode = () => {
      setDrawMode(true);
      setInsertMode(false);
      setActiveMode("draw");
    };
  
    const toggleDragMode = () => {
      setDrawMode(false);
      setInsertMode(false);
      setActiveMode("drag");
    };
  
    const toggleInsertMode = () => {
      setInsertMode(true);
      setDrawMode(false);
      setIsDragging(false);
      setActiveMode("insert");
    };
    const setPointMode = () => {
      setIsDragMode(false);
      setInsertMode(true);
      setActiveGraph(null);
    };
    const handleZoomIn = () => {
      setZoom((prevZoom) => Math.min(prevZoom + 0.1, 3));
    };
  
    const handleZoomOut = () => {
      setZoom((prevZoom) => Math.max(prevZoom - 0.1, 0.2));
    };
  
    const handlePrevImage = () => {
      setCurrentImageIndex((prevIndex) =>
        Math.max(prevIndex - 1, 0)
      );
    };
  
    const handleNextImage = () => {
      setCurrentImageIndex((prevIndex) =>
        Math.min(prevIndex + 1, imageFiles.length - 1)
      );
    };
  
    const buttonStyle = (mode) => ({
      backgroundColor: activeMode === mode ? "#1F2937" : "transparent",
      color: activeMode === mode ? "white" : "white",
      border: "1px solid black",
      padding: "10px",
      margin: "5px",
    });
  
    useEffect(() => {
      if (imageUrl) {
        renderImage();
        drawImageWithBoxes();
      }
    }, [imageUrl, pointsGraph1, pointsGraph2, zoom,curvesBoxes]);

  return (
    <>
      <div className="flex h-screen overflow-hidden">
        {/* Left Section */}
        <div className="flex flex-shrink-0 w-[21%] text-white p-2 overflow-y-auto no-scrollbar">
          <div><h3>Select an Image</h3>
        <input
          type="file"
          multiple
          className="text-white"
          onChange={handleImageUpload2}
        /><h3>Select an Image for AI</h3>
        <input
          type="file"
          multiple
          className="text-white"
          onChange={handleImageUpload}
        /></div>
       
        {imageUrl && <img src={imageUrl} alt="Uploaded" className="bg-white"/>}
        {/* <div className="mt-2"> {imageUrl && <img src={imageUrl} alt="Uploaded" className="bg-white p-4"/>} */}
          {/* {imageFiles.map((src, index) => (
            <img
              key={index}
              src={src}
              alt={`Preview ${index}`}
              className={`w-full mb-2 cursor-pointer ${index === currentImageIndex ? "border-2 border-blue-500" : ""}`}
              onClick={() => setCurrentImageIndex(index)}
            />
          ))} */}

        {/* </div> */}
          <br />
        </div>

        {/* Middle Section */}
      <div className="flex-1 p-4 flex flex-col overflow-hidden">
        {/* Zoom Controls */}
        <div className="flex items-center bg-gray-800 border-b border-gray-700 px-1.5 h-10 select-none mb-1">
          <div className="flex items-center border-r border-gray-700 pr-1.5 mr-1.5">
            <div
              aria-label="zoom in"
              onClick={handleZoomIn}
              className="cursor-pointer"
            >
              <div className="flex items-center justify-center rounded-full transition-transform duration-300 mx-0.5 w-7 h-7">
                <img
                  alt="zoom-in"
                  src="https://www.makesense.ai/ico/zoom-in.png"
                  className="filter brightness-0 invert max-w-5 max-h-5"
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
                  className="filter brightness-0 invert max-w-5 max-h-5"
                />
              </div>
            </div>
          </div>
          <button onClick={handleSavePoints} className="text-white bg-blue-800 px-2 py-1 rounded-md">Save Points</button>
          <button onClick={handleExportPoints} className="text-white bg-blue-800 px-2 py-1 ml-2 rounded-md">Export Points</button>
        </div>

        {/* Canvas Container */}
        <div className="flex-1 overflow-auto max-w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <canvas
            ref={imageCanvasRef}
            width={1292}
            height={796}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{ border: "1px solid black", cursor: "crosshair" }}
          />
        </div>
        {/* Navigation Buttons */}
        {/* <div className="flex justify-between">
          <button
            onClick={handlePrevImage}
            disabled={currentImageIndex === 0}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Previous
          </button>
          <button
            onClick={handleNextImage}
            disabled={currentImageIndex === imageFiles.length - 1}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Next
          </button>
        </div> */}
      </div>

        {/* Right Section */}
        <div className="flex-shrink-0 w-1/4 p-2 overflow-auto">
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
            <button onClick={setDrawModeGraph1} className="text-white">Draw Mode (Graph 1)</button>
            <button onClick={setDrawModeGraph2} className="text-white">Draw Mode (Graph 2)</button>
            {/* <button onClick={setDragMode} className="text-white">Drag Mode (Both Graphs)</button> */}
            <button onClick={setPointMode} className="text-white">Insert Point Mode (Both Graphs)</button>
              <div
                className="relative flex items-center justify-between p-6 bg-black text-white text-sm cursor-pointer w-full max-w-[300px]"
                style={buttonStyle("draw")}
                onClick={toggleDrawMode}
              >
                <div className="absolute top-1 left-[-18px] transform translate-x-5 h-[calc(100%-4px)] w-1 bg-blue-500 transition-colors duration-300 ease-in-out" />
                <div className="flex items-center">
                  <img
                    className="mr-5 max-w-[20px] max-h-[20px] filter invert"
                    alt="rectangle"
                    src="https://www.makesense.ai/ico/rectangle.png"
                  />
                  Draw Mode
                </div>
                <div className="flex items-center">
                  <img
                    className="max-w-[12px] max-h-[12px] filter invert rotate-180"
                    alt="down_arrow"
                    src="https://www.makesense.ai/ico/down.png"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                className="relative flex items-center justify-between p-6 bg-black text-white text-sm cursor-pointer w-full max-w-[300px]"
                style={buttonStyle("drag")}
                onClick={setDragMode}
              >
                <div className="absolute top-1 left-[-18px] transform translate-x-5 h-[calc(100%-4px)] w-1 bg-blue-500 transition-colors duration-300 ease-in-out" />
                <div className="flex items-center">
                  <img
                    className="mr-5 max-w-[20px] max-h-[20px] filter invert"
                    alt="rectangle"
                    src="https://www.makesense.ai/ico/rectangle.png"
                  />
                  Drag Mode
                </div>
                <div className="flex items-center">
                  <img
                    className="max-w-[12px] max-h-[12px] filter invert rotate-180"
                    alt="down_arrow"
                    src="https://www.makesense.ai/ico/down.png"
                  />
                </div>
              </button>
            </div>
            <div className="flex justify-end">
              <button
                className="relative flex items-center justify-between p-6 bg-black text-white text-sm cursor-pointer w-full max-w-[300px]"
                style={buttonStyle("insert")}
                // onClick={setPointMode}
              >
                <div className="absolute top-1 left-[-18px] transform translate-x-5 h-[calc(100%-4px)] w-1 bg-blue-500 transition-colors duration-300 ease-in-out" />
                <div className="flex items-center">
                  <img
                    className="mr-5 max-w-[20px] max-h-[20px] filter invert"
                    alt="rectangle"
                    src="https://www.makesense.ai/ico/rectangle.png"
                  />
                  Insert Point Mode
                </div>
                <div className="flex items-center">
                  <img
                    className="max-w-[12px] max-h-[12px] filter invert rotate-180"
                    alt="down_arrow"
                    src="https://www.makesense.ai/ico/down.png"
                  />
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Canvas;

// controllers/pointController.js
const Point = require('../models/pointsModel');
const fs = require('fs');
const path = require('path');
const { parse } = require('json2csv');

// Save points for a specific image
exports.savePoints = async (req, res) => {
  const { imageName, points } = req.body;

  try {
    const pointData = await Point.findOneAndUpdate(
      { imageName },
      { points },
      { upsert: true, new: true }
    );

    res.status(200).json({ message: 'Points saved successfully', data: pointData });
  } catch (error) {
    console.error('Error saving points:', error);
    res.status(500).json({ message: 'Error saving points' });
  }
};

exports.exportPoints = async (req, res) => {
  const { pointsGraph1, pointsGraph2 } = req.body;
  console.log(pointsGraph1);
  
  const imageName = req.params.imageName;

  // Validate input
  if (!Array.isArray(pointsGraph1) || !Array.isArray(pointsGraph2)) {
      return res.status(400).json({ error: 'Invalid points data' });
  }

  // Create LAS data
  let lasData = 'X,Y,Z\n'; // Header
  const createLASData = (points) => {
      return points.map(point => `${point.x},${point.y},0`).join('\n');
  };

  lasData += createLASData(pointsGraph1) + '\n';
  lasData += createLASData(pointsGraph2) + '\n';

  // Create a filename
  const filename = `${imageName}.las`;
  const filePath = path.join(__dirname, 'exports', filename);

  try {
      // Write the LAS data to a file
      await fs.writeFile(filePath, lasData);
      
      // Send the file for download
      res.download(filePath, filename, async (err) => {
          if (err) {
              console.error('Error sending the file:', err);
              return res.status(500).json({ error: 'Error sending the file' });
          }
          // Delete the file after sending it
          try {
              await fs.unlink(filePath);
          } catch (unlinkErr) {
              console.error('Error deleting the file:', unlinkErr);
          }
      });
  } catch (err) {
      console.error('Error saving the file:', err);
      return res.status(500).json({ error: 'Error saving the file' });
  }
};


// models/PointModel.js
const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema({
  imageName: { type: String, required: true },
  points: [{ x: Number, y: Number }]
});

const Point = mongoose.model('Point', pointSchema);

module.exports = Point;

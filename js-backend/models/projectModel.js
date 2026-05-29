const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  images: [String], // Array of image file names
});

const Project = mongoose.model('Project', projectSchema);

module.exports = Project;

const express = require('express');
const multer = require('multer');
const path = require('path');
const projectController = require('../controllers/projectController');

const router = express.Router();

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../public/uploads/')); // Temporarily upload to 'temp'
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext); // Create a unique filename
  },
});

const upload = multer({ storage });

// POST route to create project and upload images
router.post('/projects', upload.array('images', 10), projectController.createProject); // max 10 files

// Add this to your existing routes
router.get('/projects/:id', projectController.getProjectById);

module.exports = router;

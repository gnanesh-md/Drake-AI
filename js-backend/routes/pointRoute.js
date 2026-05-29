// routes/pointRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { savePoints, exportPoints } = require('../controllers/pointsController');

// Multer setup for file uploads
const upload = multer({ dest: 'uploads/' });

router.post('/save-points', savePoints);
router.get('/export-points/:imageName', exportPoints);

module.exports = router;

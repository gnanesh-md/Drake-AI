const express = require('express');
require('dotenv').config();
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const axios = require('axios');

const connectDB = require('./routes/db'); 
const authRoutes = require('./routes/users');
const protectedRoutes = require('./routes/protected');
const projectRoutes = require('./routes/projectRoutes');
const pointRoutes = require('./routes/pointRoute');
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8123';
const defaultAllowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'https://curvetracking.thedrake.ai',
    'https://www.curvetracking.thedrake.ai',
];
const allowedOrigins = (
    process.env.CORS_ALLOWED_ORIGINS ||
    defaultAllowedOrigins.join(',')
)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const corsOptions = {
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'x-auth-token', 'Accept'],
    exposedHeaders: ['x-auth-token'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
};

const app = express();
connectDB();

// Middleware
app.use(logger('dev')); // Log requests to the console
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.raw({ type: 'application/octet-stream', limit: '10mb' })); // Adjust limit as needed

const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const filePath = path.join(__dirname, req.file.path);
        const outputFilePath = path.join(__dirname, 'uploads', `${Date.now()}.png`);

        await sharp(filePath).toFile(outputFilePath);
        fs.unlinkSync(filePath);

        res.json({ imageUrl: `/uploads/${path.basename(outputFilePath)}` });
    } catch (error) {
        console.error('Error in /upload:', error);
        res.status(500).send(error.message);
    }
});

// Serve static files
app.use('/uploads', express.static('uploads'));

// API Routes
app.use('/api/points', pointRoutes);
app.use('/api', projectRoutes);
app.use('/auth', authRoutes);
app.use('/protected', protectedRoutes);

app.post('/api/decode-las', async (req, res) => {
    try {
        const lasBinary = req.body;
        console.log('Received LAS binary data:', lasBinary);

        // Send binary data to Python service
        const pythonResponse = await axios.post(`${PYTHON_SERVICE_URL}/decode-las`, lasBinary, {
            headers: { 'Content-Type': 'application/octet-stream' },
        });

        console.log('Raw Python Response Data:', pythonResponse.data);

        if (!pythonResponse.data || !pythonResponse.data.points || !Array.isArray(pythonResponse.data.points)) {
            throw new Error('Unexpected response format from Python service');
        }

        const transformedData = pythonResponse.data.points.map(point => {
            if (Array.isArray(point) && point.length >= 2) {
                return { x: point[0], y: point[1] };
            }
            console.warn('Unexpected point format:', point);
            return null;
        }).filter(point => point !== null);

        const reversedData = transformedData.reverse();
        res.json(reversedData);
    } catch (error) {
        console.error('Error decoding LAS file:', error);
        res.status(500).send('Error decoding LAS file');
    }
});

module.exports = app;

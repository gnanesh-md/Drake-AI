const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    // Use environment variable or default to local MongoDB
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/graphocr';
    
    await mongoose.connect(mongoURI, {
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully to:', mongoURI.includes('localhost') ? 'localhost' : 'cloud');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    console.log('Make sure MongoDB is running locally or set MONGODB_URI in .env file');
    process.exit(1);
  }
};

module.exports = connectDB;
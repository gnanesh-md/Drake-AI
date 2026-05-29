const express = require('express');
const router = express.Router();
const User = require('../models/user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const validator = require('validator'); // Import validator for email validation
require('dotenv').config();

// Register
router.post('/register', async (req, res) => {
  const { fullname, email, password, confirmPassword } = req.body;

  // Check if email is valid
  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  try {
    // Check if the user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const user = new User({ fullname, email, password });
    await user.save();
    res.status(201).json({ message: 'User created' });
  } catch (err) {
    console.error('Error registering user:', err);
    res.status(500).json({ error: 'Failed to register user' });
  }
});



// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log(req.body);

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found with email:', email);
      return res.status(400).json({ error: 'Invalid Email' });
    }

    console.log('Stored hashed password from DB:', user.password);

    // Use the comparePassword method from the User model
    const isMatch = await user.comparePassword(password);
    console.log('Password match result:', isMatch);

    if (!isMatch) {
      console.log('Password does not match');
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'your_jwt_secret', { expiresIn: '1h' });

    res.json({ token, user: { id: user._id, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});




// Function to generate a random OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
};

// Function to send OTP to user's email
const sendOtpEmail = async (email, otp) => {
  const transporter = nodemailer.createTransport({
    service: 'Gmail', // Replace with your email service
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Password Reset OTP',
    text: `Your OTP for password reset is: ${otp}`,
  };

  await transporter.sendMail(mailOptions);
};

// Forgot Password - Step 1: Generate and send OTP
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }
    console.log(email);
    
    // Generate OTP and set expiry time (e.g., 10 minutes)
    const otp = generateOtp();
    user.resetPasswordOtp = otp;
    user.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes from now
    console.log(otp);
    
    // Save the OTP and expiry time to the user's record
    await user.save();

    // Send OTP to user's email
    await sendOtpEmail(email, otp);

    res.status(200).json({ message: 'OTP sent to email' });
  } catch (err) {
    console.error('Error generating OTP:', err);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Forgot Password - Step 2: Verify OTP and Reset Password
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || user.resetPasswordOtp !== otp || user.otpExpiry < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    console.log('User before update:', user);

    // Hash the new password before saving
    const salt = await bcrypt.genSalt(10);
    const updatedpass = await bcrypt.hash(newPassword, salt);
    // Directly update the user's password and other fields
    await User.updateOne(
      { email }, // Query to match the document
      { 
        password: updatedpass, 
        resetPasswordOtp: undefined, 
        otpExpiry: undefined 
      }
    );

    const updatedUser = await User.findOne({ email });
    console.log('User after update:', updatedUser);

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Error resetting password:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});


module.exports = router;
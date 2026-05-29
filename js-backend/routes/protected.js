const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/user'); // Replace with your actual User model

router.get('/dashboard', auth, async (req, res) => {
  try {
    // Find the user by ID
    const user = await User.findById(req.user.id).select('_id email'); // Adjust the fields as needed

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Respond with user details
    res.json({ _id: user._id, email: user.email });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
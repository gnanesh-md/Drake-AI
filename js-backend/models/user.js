const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');


const UserSchema = new mongoose.Schema({
  fullname: { type: String, required: true }, // Add fullname field
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  resetPasswordOtp: String, // Field to store OTP
  otpExpiry: Date, // Field to store OTP expiry time
});

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next(); // Only hash if password is modified
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare input password with stored hashed password
UserSchema.methods.comparePassword = async function (inputPassword) {
  return await bcrypt.compare(inputPassword, this.password);
};


module.exports = mongoose.model('User', UserSchema);
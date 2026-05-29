# Authentication API Testing Guide

## Base URL
```
http://localhost:5000
```

## Endpoints

### 1. Register (Sign Up)
**POST** `/auth/register`

**Request Body:**
```json
{
  "fullname": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "confirmPassword": "password123"
}
```

**Success Response (201):**
```json
{
  "message": "User created"
}
```

**Error Responses:**
- 400: Invalid email, passwords don't match, or user already exists
- 500: Server error

---

### 2. Login
**POST** `/auth/login`

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Success Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "john@example.com"
  }
}
```

**Error Responses:**
- 400: Invalid email or password
- 500: Server error

---

### 3. Forgot Password (Send OTP)
**POST** `/auth/forgot-password`

**Request Body:**
```json
{
  "email": "john@example.com"
}
```

**Success Response (200):**
```json
{
  "message": "OTP sent to email"
}
```

**Error Responses:**
- 400: User not found
- 500: Failed to send OTP

---

### 4. Reset Password (Verify OTP)
**POST** `/auth/reset-password`

**Request Body:**
```json
{
  "email": "john@example.com",
  "otp": "123456",
  "newPassword": "newpassword123"
}
```

**Success Response (200):**
```json
{
  "message": "Password updated successfully"
}
```

**Error Responses:**
- 400: Invalid or expired OTP
- 500: Failed to reset password

---

## Testing with cURL

### Register
```bash
curl -X POST http://localhost:5000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullname": "Test User",
    "email": "test@example.com",
    "password": "test123",
    "confirmPassword": "test123"
  }'
```

### Login
```bash
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123"
  }'
```

---

## Testing with Postman

1. **Create a new request**
2. **Set method to POST**
3. **Enter URL:** `http://localhost:5000/auth/register` or `/auth/login`
4. **Go to Body tab**
5. **Select "raw" and "JSON"**
6. **Paste the JSON request body**
7. **Click Send**

---

## Common Issues

### Issue: "User already exists"
**Solution:** Use a different email or delete the existing user from MongoDB

### Issue: "Invalid credentials"
**Solution:** 
- Check if the email is correct
- Verify the password matches what was used during registration
- Check MongoDB to confirm user exists

### Issue: "MongoDB connection error"
**Solution:**
- Ensure MongoDB is running: `mongod` or `net start MongoDB`
- Check connection string in `.env` file

### Issue: "Failed to send OTP"
**Solution:**
- Verify EMAIL_USER and EMAIL_PASS in `.env` file
- Check if Gmail allows "Less secure app access" or use App Password

---

## Environment Variables Required

Create `.env` file in `js-backend/` directory:

```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
MONGODB_URI=mongodb://localhost:27017/graphocr
JWT_SECRET=your_jwt_secret_key_change_this_in_production
```

---

## Checking MongoDB Data

Connect to MongoDB and check users:

```bash
mongosh
use graphocr
db.users.find().pretty()
```

Or use MongoDB Compass GUI to view the database.

// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const passport = require('passport');
const authController = require('../controllers/authController');
const { ensureLoggedIn } = require('../middleware/auth'); // Import middleware chặn nếu cần

// --- 1. Giao diện (GET) ---
// Gọi controller để trả về file HTML
router.get('/login', authController.getAuthPage);
router.get('/register', authController.getAuthPage);

// Trang setup nickname (Cần đăng nhập mới vào được)
router.get('/setup-nickname', ensureLoggedIn, authController.getSetupNicknamePage);

// --- 2. Xử lý Logic (POST) ---
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

// API lấy lỗi để hiển thị lên form (Fetch từ JS frontend)
router.get('/login-error', authController.getAuthMessage);
router.get('/register-error', authController.getAuthMessage);

// --- 3. Google Auth ---
router.get('/auth/google', 
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login' }),
    authController.googleCallback
);

module.exports = router;
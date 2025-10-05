// chat_app/routes/userRoutes.js
const express = require('express');
const router  = express.Router();
const { ensureLoggedInJSON } = require('../middleware/auth')
const userController = require('../controllers/userController');
const upload = require('../config/multer');


// Lấy thông tin profile người dùng
router.get(
  '/profile',
  ensureLoggedInJSON,
  userController.getProfile
);

// Cập nhật nickname
router.post(
  '/update-nickname',
  ensureLoggedInJSON,
  userController.updateNickname
);

// Cập nhật avatar
router.post(
  '/update-avatar',
  ensureLoggedInJSON,
  upload.single('avatar'),
  userController.updateAvatar
);

// Route đổi mật khẩu
router.post(
  '/update-password',       // 1st arg: đường dẫn (string)
  ensureLoggedInJSON,       // 2nd arg: middleware (function)
  userController.updatePassword  // 3rd arg: handler chính (function)
);

module.exports = router;

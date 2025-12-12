const express = require('express');
const router = express.Router();
const { ensureLoggedInJSON } = require('../middleware/auth')
const userController = require('../controllers/userController');
const upload = require('../config/multer');

//========================================================
// Các Route Profile & Cơ bản 
//========================================================

// Lấy thông tin profile người dùng
router.get('/profile', ensureLoggedInJSON, userController.getProfile);

// Lấy thông tin profile người dùng khác
router.get('/info/:userId', ensureLoggedInJSON, userController.getUserProfile);

// ✅ Cập nhật toàn bộ profile (nickname, avatar, ngày sinh, giới tính)
router.post('/update-profile', ensureLoggedInJSON, userController.updateProfile);

// Route đổi mật khẩu
router.post('/update-password', ensureLoggedInJSON, userController.updatePassword);

//========================================================
// ⚙️ Các Route CÀI ĐẶT MỚI (Từ mục Setting)
//========================================================

// 1. Trạng thái hoạt động (Bật/Tắt hiển thị online)
router.post(
  '/settings/update-status',
  ensureLoggedInJSON,
  userController.updateIncomingStatus
);

// 2. Giao diện (Cập nhật hình nền)
// Sử dụng middleware upload file cho trường 'background'
router.post(
  '/settings/update-background',
  ensureLoggedInJSON,
  upload.single('background'),
  userController.updateBackground
);

// 3. Quản lý tin nhắn (Xóa lịch sử chat với 1 người bạn)
router.post(
  '/settings/delete-history',
  ensureLoggedInJSON,
  userController.deleteChatHistory
);

// 4. Tài khoản & Bảo mật (Cập nhật thông tin cá nhân: ngày sinh, giới tính)
router.post(
  '/settings/update-personal-info',
  ensureLoggedInJSON,
  userController.updatePersonalInfo
);


module.exports = router;
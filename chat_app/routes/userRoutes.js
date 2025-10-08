// chat_app/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const { ensureLoggedInJSON } = require('../middleware/auth')
const userController = require('../controllers/userController');
const upload = require('../config/multer');
const mongoose = require('mongoose');
const User = require('../models/User')

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


// GET user theo ID
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  // Kiểm tra ID có phải là ObjectId hợp lệ không
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    // ✅ Sửa: Dùng 400 Bad Request và định dạng lỗi 'error'
    return res.status(400).json({ error: 'ID người dùng không hợp lệ' });
  }

  try {
    // ✅ Lỗi logic cũ đã được sửa: dùng userId
    const user = await User.findById(userId).select('_id nickname avatar online'); // Chỉ lấy các trường cần thiết

    if (!user) {
      // ✅ Tối ưu: Dùng định dạng lỗi 'error'
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }

    // ✅ Tối ưu: Trả về đối tượng user trực tiếp
    res.json(user);

  } catch (err) {
    console.error('❌ GET /:userId error:', err);
    // ✅ Tối ưu: Dùng định dạng lỗi 'error'
    res.status(500).json({ error: 'Lỗi server khi truy vấn người dùng' });
  }
});


module.exports = router;
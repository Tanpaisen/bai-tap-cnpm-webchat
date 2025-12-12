// controllers/uploadController.js
const User = require('../models/User');

function uploadImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No image file provided' });
  }
  res.json({ success: true, url: `/uploads/images/${req.file.filename}` });
}

function uploadFile(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file provided' });
  }
  res.json({ success: true, url: `/uploads/files/${req.file.filename}` });
}

async function uploadAvatar(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Không có file avatar' });
  }

  const avatarUrl = `/uploads/avatars/${req.file.filename}`;

  // ✅ Nếu user đã đăng nhập (có session), cập nhật DB
  if (req.session?.user && req.session.user._id) {
    try {
      await User.updateOne(
        { _id: req.session.user._id },
        { avatar: avatarUrl }
      );
      req.session.user.avatar = avatarUrl; // cập nhật lại session luôn
    } catch (dbErr) {
      console.error('Lỗi cập nhật DB avatar:', dbErr);
      return res.status(500).json({ success: false, error: 'Lỗi cập nhật avatar trong DB' });
    }
  }

  // ✅ Trả về đúng định dạng mà frontend mong đợi
  return res.json({ success: true, url: avatarUrl });
}

async function updateBackground(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Không có file background' });
  }

  const bgUrl = `/uploads/images/${req.file.filename}`;

  // Nếu user đang login
  if (req.session?.user && req.session.user._id) {
    try {
      await User.updateOne(
        { _id: req.session.user._id },
        { background: bgUrl } // Lưu vào DB
      );
      req.session.user.background = bgUrl; // Cập nhật luôn session
    } catch (err) {
      console.error('Lỗi cập nhật DB background:', err);
      return res.status(500).json({ success: false, error: 'Lỗi cập nhật background trong DB' });
    }
  }

  return res.json({ success: true, url: bgUrl });
}

module.exports = {
  uploadImage,
  uploadFile,
  uploadAvatar,
  updateBackground
};

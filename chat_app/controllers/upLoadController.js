// controllers/uploadController.js
const User = require('../models/User')

function uploadImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }
  res.json({ url: `/uploads/images/${req.file.filename}` });
}

function uploadFile(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }
  res.json({ url: `/uploads/files/${req.file.filename}` });
}

async function uploadAvatar(req, res) { // Lưu ý: Cần thêm 'async'
  if (!req.file) {
    return res.status(400).json({ error: 'Không có file avatar' });
  }

  const avatarUrl = `/uploads/avatars/${req.file.filename}`;

  if (req.session?.user && req.session.user._id) {
    req.session.user.avatar = avatarUrl;
    
    // 💡 BƯỚC KHẮC PHỤC: Cập nhật vào Database
    try {
        // Giả định User model đã được import và Mongoose đã kết nối
        await User.updateOne(
            { _id: req.session.user._id }, 
            { avatar: avatarUrl }
        );
    } catch (dbErr) {
        console.error('Lỗi cập nhật DB avatar:', dbErr);
        // Có thể chọn trả về lỗi 500 nếu cập nhật DB thất bại
    }
  }

  return res.json({ avatar: avatarUrl });
}

module.exports = {
  uploadImage,
  uploadFile,
  uploadAvatar
};

// controllers/uploadController.js
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

function uploadAvatar(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'Không có file avatar' });
  }

  // Đường dẫn public để frontend hiển thị
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;

  // Nếu bạn có session user, cập nhật vào session
  if (req.session?.user) {
    req.session.user.avatar = avatarUrl;
  }

  // Nếu bạn có DB, có thể cập nhật vào DB tại đây
  // await User.updateOne({ _id: req.session.user._id }, { avatar: avatarUrl });

  return res.json({ avatar: avatarUrl });
}

module.exports = {
  uploadImage,
  uploadFile,
  uploadAvatar
};

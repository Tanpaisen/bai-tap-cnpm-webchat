//routes/uploadRoutes.js
const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { ensureLoggedInJSON } = require('../middleware/auth');
const User = require('../models/User');

// Tạo thư mục nếu chưa có
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Cấu hình lưu file
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const folder = file.fieldname === 'avatar' ? 'avatars'
                : /^image\//.test(file.mimetype) ? 'images'
                : 'files';
    const dir = path.resolve(process.cwd(), 'chat_app', 'uploads', folder);
    ensureDir(dir);
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = `upload_${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({ storage });


// ✅ Upload avatar và cập nhật vào DB + session
router.post('/avatar', ensureLoggedInJSON, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file || !req.file.mimetype.startsWith('image/')) {
      console.log('❌ File không phải ảnh');
      return res.status(400).json({ error: 'Chỉ được upload ảnh làm avatar' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.session.user._id,
      { avatar: avatarUrl },
      { new: true }
    );

    req.session.user.avatar = user.avatar;
    console.log('📦 Avatar đã lưu:', avatarUrl);

    res.json({ success: true, avatar: user.avatar });
  } catch (err) {
    console.error('❌ Lỗi upload avatar:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});



// ✅ Upload ảnh trong chat
router.post('/image', ensureLoggedInJSON, upload.single('image'), (req, res) => {
  if (!req.file || !req.file.mimetype.startsWith('image/')) {
  return res.status(400).json({ error: 'File không phải ảnh' });
}

  const url = `/uploads/images/${req.file.filename}`;
  res.json({ success: true, url });
});


// ✅ Upload file trong chat
router.post('/file', ensureLoggedInJSON, upload.single('file'), (req, res) => {
  if (!req.file) {
  return res.status(400).json({ error: 'Không có file được upload' });
}

  const url = `/uploads/files/${req.file.filename}`;
  res.json({ success: true, url });
});

// ✅ Upload background + lưu vào DB
router.post('/background', ensureLoggedInJSON, upload.single('background'), async (req, res) => {
  try {
    if (!req.file || !req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Chỉ được upload ảnh làm background' });
    }

    const backgroundUrl = `/uploads/images/${req.file.filename}`;
    
    // Cập nhật vào DB
    const user = await User.findByIdAndUpdate(
      req.session.user._id,
      { background: backgroundUrl },
      { new: true }
    );

    // Cập nhật session luôn
    req.session.user.background = user.background;

    console.log('📦 Background đã lưu:', backgroundUrl);
    res.json({ success: true, background: user.background });
  } catch (err) {
    console.error('❌ Lỗi upload background:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});


module.exports = router;

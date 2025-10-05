//btl/routes/auth.js
const express = require('express');
const path    = require('path');
const router  = express.Router();
const User    = require('../../chat_app/models/User');

// Serve trang đăng ký
router.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/register.html'));
});

// Serve trang đăng nhập
router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/login.html'));
});

// Serve trang setup nickname
router.get('/setup-nickname', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/setup-nickname.html'));
});

// Xử lý đăng ký
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = new User({ username, password });
    await user.save();

    // ✅ Không lưu session, chỉ chuyển về login
    return res.redirect('/login');
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).send('Tên đăng nhập đã tồn tại');
    }
    console.error(err);
    return res.status(500).send('Lỗi server');
  }
});

// Xử lý đăng nhập
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).send('Sai tên đăng nhập');
    }

    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).send('Sai mật khẩu');
    }

    // ✅ Nếu chưa có nickname → chuyển sang setup
    if (!user.nickname?.trim()) {
      req.session.tempUserId = user._id;
      delete req.session.user;
      return res.redirect('/setup-nickname');
    }

    // ✅ Nếu đã có nickname → vào chat
    req.session.user = {
      _id:      user._id,
      nickname: user.nickname,
      avatar:   user.avatar
    };
    return res.redirect('/chat');
  } catch (err) {
    console.error(err);
    return res.status(500).send('Lỗi server');
  }
});

// Xử lý logout
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('Logout error:', err);
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

module.exports = router;

const express = require('express');
const path = require('path');
const passport = require('passport'); // 🌟 QUAN TRỌNG: Phải có dòng này để chạy Google Login
const router = express.Router();
// Đảm bảo đường dẫn này trỏ đúng tới model User của bạn
// Nếu auth.js nằm ở btl/auth_app/routes/ thì ../../chat_app/models/User là chính xác
const User = require('../../chat_app/models/User'); 

// =======================================================
// 1. SERVE GIAO DIỆN (GỘP CHUNG LOGIN & REGISTER)
// =======================================================

// Hàm helper để trả về file HTML giao diện mới
const serveAuthPage = (req, res) => {
  // Trỏ về file giao diện 3D bạn đã tạo (đảm bảo tên file html đúng và nằm trong folder views cùng cấp cha)
  res.sendFile(path.join(__dirname, '../views/login.html')); 
};

// Cả 2 đường dẫn đều trỏ về cùng 1 giao diện
router.get('/login', serveAuthPage);
router.get('/register', serveAuthPage);

// Serve trang setup nickname (giữ nguyên)
router.get('/setup-nickname', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/setup-nickname.html'));
});

// =======================================================
// 🌟 2. GOOGLE AUTH ROUTES (ĐẦY ĐỦ)
// =======================================================

// A. Route kích hoạt đăng nhập Google
// Khi user bấm nút "Continue with Google", trình duyệt sẽ nhảy vào đây
router.get('/auth/google', 
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// B. Route Google gọi lại (Callback)
// Sau khi login xong trên Google, nó sẽ chuyển hướng user về đây
router.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Đăng nhập thành công, passport đã lưu user vào req.user
    const user = req.user;

    // --- Logic Kiểm tra Ban (Tương tự login thường) ---
    if (user.isBanned) {
        req.session.errorMessage = `Tài khoản bị khóa. Lý do: ${user.banReason || 'Vi phạm'}`;
        req.logout(() => {}); 
        return res.redirect('/login');
    }

    // --- TẠO SESSION CHO APP CHAT ---
    // Copy thông tin từ Passport User sang Session User của App
    req.session.user = {
      _id: user._id.toString(),
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      role: user.role || 'user',
      isBanned: user.isBanned,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      isIncomingEnabled: user.isIncomingEnabled,
      mainBackground: user.mainBackground
    };

    // --- ĐIỀU HƯỚNG ---
    if (user.role === 'admin' || user.role === 'superadmin') {
      return res.redirect('/admin');
    }

    // Nếu là user mới chưa có nickname (hoặc nickname mặc định) -> qua trang setup
    if (!user.nickname?.trim() || user.nickname === "New User") {
       return res.redirect('/setup-nickname');
    }

    // Vào trang chat chính
    return res.redirect('/chat');
  }
);

// =======================================================
// 3. XỬ LÝ ĐĂNG KÝ THƯỜNG (POST)
// =======================================================
router.post('/register', async (req, res) => {
  const { username, password, confirmPassword } = req.body;

  // Validate cơ bản
  if (password !== confirmPassword) {
    req.session.errorMessage = 'Mật khẩu và xác nhận mật khẩu không khớp.';
    return res.redirect('/register'); // Redirect để frontend bắt lỗi và chuyển tab
  }

  try {
    const user = new User({ username, password });
    await user.save();

    // Đăng ký thành công -> Chuyển sang login
    return res.redirect('/login'); 
  } catch (err) {
    // Xử lý lỗi validation từ Mongoose
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message).join(', ');
      req.session.errorMessage = `Dữ liệu không hợp lệ: ${messages}`;
      return res.redirect('/register');
    }

    // Xử lý trùng tên đăng nhập
    if (err.code === 11000) {
      req.session.errorMessage = 'Tên đăng nhập đã tồn tại.';
      return res.redirect('/register');
    }

    console.error('Lỗi đăng ký:', err);
    req.session.errorMessage = 'Lỗi hệ thống. Vui lòng thử lại sau.';
    return res.redirect('/register');
  }
});

// =======================================================
// 4. XỬ LÝ ĐĂNG NHẬP THƯỜNG (POST)
// =======================================================
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const user = await User.findOne({ username });

    // --- CHECK USERNAME ---
    if (!user) {
      req.session.errorMessage = 'Sai tên đăng nhập hoặc mật khẩu.';
      return res.redirect('/login'); 
    }

    // --- CHECK PASSWORD ---
    const match = await user.comparePassword(password);
    if (!match) {
      req.session.errorMessage = 'Sai tên đăng nhập hoặc mật khẩu.';
      return res.redirect('/login');
    }

    // --- CHECK BANNED ---
    if (user.isBanned) {
      const reason = user.banReason || 'Vi phạm tiêu chuẩn cộng đồng.';
      const expires = user.banExpires ? `Đến ngày: ${user.banExpires.toLocaleString('vi-VN')}` : 'Vĩnh viễn.';
      
      req.session.errorMessage = `Tài khoản bị khóa. Lý do: ${reason} (${expires})`;
      console.warn(`🔒 User banned tried to login: ${username}`);
      return res.redirect('/login');
    }

    // --- CHECK NICKNAME (SETUP) ---
    if (!user.nickname?.trim()) {
      req.session.user = { _id: user._id.toString() };
      req.session.tempUserId = user._id.toString();
      return res.redirect('/setup-nickname');
    }

    // --- CREATE SESSION ---
    req.session.user = {
      _id: user._id.toString(),
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      role: user.role || 'user',
      isBanned: user.isBanned,
      // Các trường phụ
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      isIncomingEnabled: user.isIncomingEnabled,
      mainBackground: user.mainBackground
    };

    // --- REDIRECT BASED ON ROLE ---
    if (user.role === 'admin' || user.role === 'superadmin') {
      return res.redirect('/admin');
    }

    return res.redirect('/chat');

  } catch (err) {
    console.error('Login Error:', err);
    req.session.errorMessage = 'Lỗi server khi đăng nhập.';
    return res.redirect('/login');
  }
});

// =======================================================
// 5. API LẤY LỖI CHO FRONTEND (AJAX)
// =======================================================

// Frontend gọi cái này để hiển thị lỗi Đăng Nhập
router.get('/login-error', (req, res) => {
    const error = req.session.errorMessage;
    delete req.session.errorMessage; // Xóa ngay sau khi lấy (Flash message)
    res.json({ error });
});

// Frontend gọi cái này để hiển thị lỗi Đăng Ký
router.get('/register-error', (req, res) => {
  const error = req.session.errorMessage;
  delete req.session.errorMessage;
  res.json({ error });
});

// =======================================================
// 6. LOGOUT
// =======================================================
router.get('/logout', (req, res) => {
  // Logout cả passport và session thường
  req.logout(() => { // Hàm logout của Passport
    req.session.destroy(err => {
      if (err) console.error('Logout error:', err);
      res.clearCookie('connect.sid');
      res.redirect('/login');
    });
  });
});

module.exports = router;
const express = require('express');
const path = require('path');
const passport = require('passport'); 
const router = express.Router();

// ✅ ĐƯỜNG DẪN IMPORT MODEL
// Từ src/routes/ -> lùi 1 cấp ra src/ -> vào models/User
const User = require('../models/User');

// =======================================================
// 1. SERVE GIAO DIỆN (PATH.JOIN CHUẨN)
// =======================================================

const serveAuthPage = (req, res) => {
    // 🛠️ SỬA LẠI ĐƯỜNG DẪN TẠI ĐÂY
    // __dirname = .../src/routes
    // ../..     = .../btl (Root)
    // views/html/login.html = File đích
    const filePath = path.join(__dirname, '../../views/html/login.html');
    
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`❌ Lỗi không tìm thấy file tại: ${filePath}`);
            // Fallback để debug: In ra đường dẫn server đang cố tìm
            res.status(404).send(`Server tìm file thất bại tại: ${filePath}`);
        }
    });
};

router.get('/login', serveAuthPage);
router.get('/register', serveAuthPage);

// ✅ SETUP NICKNAME
router.get('/setup-nickname', (req, res) => {
    // Tương tự, lùi 2 cấp
    const filePath = path.join(__dirname, '../../views/html/setup-nickname.html');
    res.sendFile(filePath);
});

// =======================================================
// 2. GOOGLE AUTH ROUTES
// =======================================================
router.get('/auth/google', 
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        const user = req.user;

        if (user.isBanned) {
            req.session.errorMessage = `Tài khoản bị khóa. Lý do: ${user.banReason || 'Vi phạm'}`;
            req.logout(() => {}); 
            return res.redirect('/login');
        }

        // Tạo Session
        req.session.user = {
            _id: user._id.toString(),
            username: user.username,
            nickname: user.nickname,
            avatar: user.avatar,
            role: user.role || 'user',
            isBanned: user.isBanned,
            // Các trường phụ khác nếu cần
            mainBackground: user.mainBackground
        };

        if (['admin', 'superadmin'].includes(user.role)) {
            return res.redirect('/admin');
        }

        // Logic điều hướng User mới
        if (!user.nickname?.trim() || user.nickname === "New User") {
             return res.redirect('/setup-nickname');
        }

        return res.redirect('/chat');
    }
);

// =======================================================
// 3. XỬ LÝ ĐĂNG KÝ (POST)
// =======================================================
router.post('/register', async (req, res) => {
    const { username, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        req.session.errorMessage = 'Mật khẩu xác nhận không khớp.';
        return res.redirect('/register');
    }

    try {
        const user = new User({ username, password });
        await user.save();
        
        req.session.errorMessage = 'Đăng ký thành công! Hãy đăng nhập.'; 
        return res.redirect('/login'); 

    } catch (err) {
        if (err.name === 'ValidationError') {
            const msg = Object.values(err.errors).map(e => e.message)[0]; 
            req.session.errorMessage = msg;
        } else if (err.code === 11000) {
            req.session.errorMessage = 'Tên đăng nhập đã tồn tại.';
        } else {
            console.error(err);
            req.session.errorMessage = 'Lỗi hệ thống.';
        }
        return res.redirect('/register');
    }
});

// =======================================================
// 4. XỬ LÝ ĐĂNG NHẬP (POST)
// =======================================================
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });

        if (!user || !(await user.comparePassword(password))) {
            req.session.errorMessage = 'Tài khoản hoặc mật khẩu không đúng.';
            return res.redirect('/login');
        }

        if (user.isBanned) {
            req.session.errorMessage = `Tài khoản bị khóa. Lý do: ${user.banReason}`;
            return res.redirect('/login');
        }

        if (!user.nickname?.trim()) {
            req.session.tempUserId = user._id.toString(); 
            return res.redirect('/setup-nickname');
        }

        req.session.user = {
            _id: user._id.toString(),
            username: user.username,
            nickname: user.nickname,
            avatar: user.avatar,
            role: user.role || 'user'
        };

        if (['admin', 'superadmin'].includes(user.role)) {
            return res.redirect('/admin');
        }

        return res.redirect('/chat');

    } catch (err) {
        console.error("Lỗi Login:", err);
        req.session.errorMessage = 'Lỗi server.';
        return res.redirect('/login');
    }
});

// =======================================================
// 5. API LẤY LỖI
// =======================================================
// Gộp chung API lấy lỗi cho gọn
router.get(['/login-error', '/register-error', '/auth-message'], (req, res) => {
    const error = req.session.errorMessage;
    delete req.session.errorMessage; 
    res.json({ error });
});

// =======================================================
// 6. LOGOUT
// =======================================================
router.get('/logout', (req, res) => {
    req.logout(() => {
        req.session.destroy();
        res.redirect('/login');
    });
});

module.exports = router;
// src/controllers/authController.js
const path = require('path');
const User = require('../models/User');

module.exports = {
    // --- GET: Hiển thị trang Login/Register ---
    getAuthPage: (req, res) => {
        // Trỏ đúng về file html trong views
        res.sendFile(path.join(__dirname, '../../views/html/login.html'));
    },

    // --- GET: Hiển thị trang Setup Nickname ---
    getSetupNicknamePage: (req, res) => {
        res.sendFile(path.join(__dirname, '../../views/html/setup-nickname.html'));
    },

    // --- POST: Xử lý Đăng ký ---
    register: async (req, res) => {
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
            // Xử lý lỗi đơn giản cho khung sườn
            console.error(err);
            req.session.errorMessage = 'Lỗi đăng ký (Trùng tên hoặc lỗi DB).';
            return res.redirect('/register');
        }
    },

    // --- POST: Xử lý Đăng nhập ---
    login: async (req, res) => {
        const { username, password } = req.body;
        try {
            const user = await User.findOne({ username });
            
            // Logic check pass đơn giản (Nhóm 1 sẽ hoàn thiện thêm)
            if (!user || !(await user.comparePassword(password))) {
                req.session.errorMessage = 'Sai tài khoản hoặc mật khẩu.';
                return res.redirect('/login');
            }

            // Lưu session
            req.session.user = {
                _id: user._id.toString(),
                username: user.username,
                nickname: user.nickname,
                avatar: user.avatar,
                role: user.role || 'user'
            };

            return res.redirect('/chat');
        } catch (err) {
            console.error(err);
            req.session.errorMessage = 'Lỗi server.';
            return res.redirect('/login');
        }
    },

    // --- GET: Đăng xuất ---
    logout: (req, res) => {
        req.logout(() => {
            req.session.destroy();
            res.redirect('/login');
        });
    },

    // --- API: Lấy thông báo lỗi (Cho Frontend JS gọi) ---
    getAuthMessage: (req, res) => {
        const error = req.session.errorMessage;
        delete req.session.errorMessage;
        res.json({ error });
    },

    // --- CALLBACK: Xử lý sau khi Google Login thành công ---
    googleCallback: (req, res) => {
        const user = req.user;
        // Tạo session từ user passport
        req.session.user = {
            _id: user._id.toString(),
            username: user.username,
            nickname: user.nickname,
            avatar: user.avatar,
            role: user.role || 'user'
        };

        if (!user.nickname || user.nickname === "New User") {
            return res.redirect('/setup-nickname');
        }
        res.redirect('/chat');
    }
};
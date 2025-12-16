const path = require('path');
const User = require('../models/User');

module.exports = {
    // --- GET: Hiển thị trang Login/Register ---
    getAuthPage: (req, res) => {
        res.sendFile(path.join(__dirname, '../../views/html/login.html'));
    },

    // --- GET: Hiển thị trang Setup Nickname ---
    getSetupNicknamePage: (req, res) => {
        res.sendFile(path.join(__dirname, '../../views/html/setup-nickname.html'));
    },

    // --- POST: Xử lý Đăng ký ---
    register: async (req, res) => {
        const { username, password, confirmPassword } = req.body;
        //Mật khẩu k đc để trống
        if (!password || password.trim().length === 0) {
            req.session.errorMessage = 'Mật khẩu không được để trống.';
            return res.redirect('/register');
        }
        
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

            //Mật khẩu k đc để trống
            if (!password || password.trim().length === 0) {
            req.session.errorMessage = 'Mật khẩu không được để trống.';
            return res.redirect('/register');
        }
            
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

            // Kiểm tra quyền để điều hướng đúng trang
            const adminRoles = ['admin', 'superadmin'];
            if (adminRoles.includes(user.role)) {
                return res.redirect('/admin'); // Chuyển đến trang Dashboard
            }

            return res.redirect('/chat'); // User thường về trang Chat
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

    // --- API: Lấy thông báo lỗi ---
    getAuthMessage: (req, res) => {
        const error = req.session.errorMessage;
        delete req.session.errorMessage;
        res.json({ error });
    },

    // --- CALLBACK: Google Login ---
    googleCallback: (req, res) => {
        const user = req.user;
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

        //  Kiểm tra quyền Admin cho Google Login
        const adminRoles = ['admin', 'superadmin', 'super_admin'];
        if (adminRoles.includes(user.role)) {
            return res.redirect('/admin');
        }

        res.redirect('/chat');
    }
};
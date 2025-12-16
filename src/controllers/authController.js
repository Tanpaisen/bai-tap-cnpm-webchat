const path = require('path');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const { getOtpEmailTemplate } = require('../../public/frontend/emailTemplates');

//Cấu hình gửi mail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Tự động lấy từ .env
        pass: process.env.EMAIL_PASS  // Tự động lấy từ .env
    }
});

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
    googleCallback: async (req, res) => {
        try {
            const user = req.user; // User đã được tạo/tìm thấy từ passport.js
            
            // Tạo mã OTP 6 số ngẫu nhiên
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            
            // Lưu OTP vào DB (Hết hạn sau 5 phút)
            user.otp = otpCode;
            user.otpExpires = Date.now() + 5 * 60 * 1000; 
            await user.save();

            // Gửi Email
            await transporter.sendMail({
                from: '"Evelyn Chat Security" <no-reply@evelyn.com>', 
                to: user.username, 
                subject: `🔑 ${otpCode} là mã xác thực của bạn`, 
                
                // Thay vì 'text', ta dùng 'html' và gọi hàm template
                html: getOtpEmailTemplate(otpCode, user.nickname) 
            });

            // ⚠️ QUAN TRỌNG: Chỉ lưu ID tạm vào session, CHƯA cấp quyền user thật
            req.session.tempUserId = user._id;
            
            // Chuyển sang trang nhập OTP
            res.redirect('/verify-otp');

        } catch (err) {
            console.error(err);
            res.redirect('/login');
        }
    },

    // 2. THÊM HÀM: Hiển thị trang OTP
    getOtpPage: (req, res) => {
        if (!req.session.tempUserId) return res.redirect('/login');
        const path = require('path');
        res.sendFile(path.join(__dirname, '../../views/html/confirmOTP.html'));
    },

    // 3. THÊM HÀM: Xử lý xác thực OTP
    verifyOtp: async (req, res) => {
        const { otp } = req.body;
        const tempUserId = req.session.tempUserId;

        if (!tempUserId) return res.json({ success: false, error: 'Phiên hết hạn.' });

        try {
            const user = await User.findById(tempUserId);
            
            // Kiểm tra OTP
            if (!user || user.otp !== otp || user.otpExpires < Date.now()) {
                return res.json({ success: false, error: 'Mã OTP sai hoặc đã hết hạn.' });
            }

            // ✅ OTP ĐÚNG: Cấp quyền đăng nhập chính thức
            req.session.user = {
                _id: user._id.toString(),
                username: user.username,
                nickname: user.nickname,
                avatar: user.avatar,
                role: user.role
            };

            // Xóa OTP trong DB và session tạm
            user.otp = undefined;
            user.otpExpires = undefined;
            await user.save();
            delete req.session.tempUserId;

            // Kiểm tra quyền để điều hướng
            const redirectUrl = ['admin', 'superadmin', 'super_admin'].includes(user.role) ? '/admin' : '/chat';
            
            // Nếu chưa có nickname thì về trang setup
            if (!user.nickname || user.nickname === "New User") {
                return res.json({ success: true, redirect: '/setup-nickname' });
            }

            return res.json({ success: true, redirect: redirectUrl });

        } catch (err) {
            console.error(err);
            res.json({ success: false, error: 'Lỗi server.' });
        }
    }

    

};
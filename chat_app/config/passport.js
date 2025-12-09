const GoogleStrategy = require('passport-google-oauth20').Strategy;
const mongoose = require('mongoose');
// Đảm bảo đường dẫn tới model User là chính xác
const User = require('../models/User'); 

module.exports = function(passport) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,         // Lấy từ file .env
        clientSecret: process.env.GOOGLE_CLIENT_SECRET, // Lấy từ file .env
        
        // 🌟 CẬP NHẬT QUAN TRỌNG: Sử dụng Full URL từ biến môi trường
        // Nếu không có biến GOOGLE_CALLBACK_URL, mặc định dùng localhost:3000
        callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            // 1. Tìm xem user đã tồn tại bằng googleId chưa
            let user = await User.findOne({ googleId: profile.id });

            if (user) {
                return done(null, user);
            } else {
                // 2. Nếu chưa, kiểm tra xem email đã có trong hệ thống chưa
                // (Để tránh tạo 2 nick nếu user đã đăng ký bằng email này trước đó)
                const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;

                // Nếu Google không trả về email (hiếm), fallback sang ID
                const searchCriteria = email ? { username: email } : { googleId: profile.id };
                
                let existingUser = await User.findOne(searchCriteria);

                if (existingUser) {
                    // Nếu đã có email, ta cập nhật thêm googleId vào user đó
                    existingUser.googleId = profile.id;
                    // Nếu chưa có avatar, lấy avatar từ Google
                    if (!existingUser.avatar || existingUser.avatar.includes('default')) {
                        existingUser.avatar = profile.photos && profile.photos[0] ? profile.photos[0].value : 'https://i.pinimg.com/originals/8d/a5/c3/8da5c3a06407303694d6381b23368f02.png';
                    }
                    await existingUser.save();
                    return done(null, existingUser);
                }

                // 3. Nếu chưa có gì cả, tạo User mới
                const newUser = new User({
                    username: email || `google_${profile.id}`, // Fallback nếu không có email
                    googleId: profile.id,
                    // Tạo mật khẩu ngẫu nhiên phức tạp vì login GG không cần pass
                    password: 'google_auth_' + Math.random().toString(36).slice(-8) + Date.now(), 
                    nickname: profile.displayName || "New User",
                    avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : 'https://i.pinimg.com/originals/8d/a5/c3/8da5c3a06407303694d6381b23368f02.png',
                    role: 'user'
                });

                await newUser.save();
                return done(null, newUser);
            }
        } catch (err) {
            console.error(err);
            return done(err, null);
        }
    }));

    // Hàm serialize để lưu user id vào session của Passport
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser((id, done) => {
        User.findById(id, (err, user) => done(err, user));
    });
};
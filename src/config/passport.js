const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

module.exports = function(passport) {
    // 1. Hàm Serialize: Lưu ID user vào session sau khi đăng nhập thành công
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    // 2. Hàm Deserialize: Lấy thông tin user từ session dựa vào ID
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    });

    // 3. Cấu hình chiến lược Google
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback", // Phải khớp với Google Cloud Console
        proxy: true // Hỗ trợ nếu bạn deploy lên host (Render/Heroku/Vercel)
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            // a. Kiểm tra xem user này đã tồn tại trong DB chưa (theo googleId)
            let existingUser = await User.findOne({ googleId: profile.id });

            if (existingUser) {
                // -> Đã tồn tại -> Cho đăng nhập
                return done(null, existingUser);
            }

            // b. Nếu chưa tồn tại -> Tạo user mới
            // Lưu ý: Username phải unique, nên ta lấy email hoặc tạo random
            const newUserData = {
                googleId: profile.id,
                username: profile.emails[0].value, // Dùng email làm username
                nickname: profile.displayName,     // Lấy tên hiển thị từ Google
                avatar: profile.photos[0].value,   // Lấy ảnh đại diện từ Google
                role: 'user'
            };

            const newUser = await User.create(newUserData);
            return done(null, newUser);

        } catch (err) {
            console.error(err);
            return done(err, null);
        }
    }));
};
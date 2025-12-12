// src/app.js

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
require('dotenv').config();
const passport = require('passport');

// ✅ 1. IMPORT MODELS & CONFIG
const AccessLog = require('./models/AccessLog');
require('./config/passport')(passport); // Load cấu hình Passport

// ✅ 2. IMPORT ROUTES
const authRoutes = require('./routes/authRoutes'); 
const chatRoutes = require('./routes/chatRoutes');
const userRoutes = require('./routes/userRoutes');
const friendRoutes = require('./routes/friendRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const adminRoutes = require('./routes/adminRoutes');

// ✅ 3. IMPORT MIDDLEWARE
const { ensureLoggedIn, ensureLoggedInJSON, ensureAdmin } = require('./middleware/auth');

const app = express();

// ====================================
// 1️⃣ CORS CONFIGURATION
// ====================================
const allowedOrigins = [
    'http://localhost:3000',
    process.env.DEVTUNNEL_URL // Nên thêm biến này trong .env
];

app.use(cors({
    origin: (origin, callback) => {
        // Cho phép request không có origin (như mobile app hoặc curl)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin) || origin.endsWith('.devtunnels.ms')) {
            callback(null, true);
        } else {
            // callback(new Error('❌ CORS blocked for origin: ' + origin)); // Bỏ comment nếu muốn chặn chặt
            callback(null, true); // Tạm thời cho phép tất cả để dev dễ dàng
        }
    },
    credentials: true
}));

// ====================================
// 2️⃣ Body & Cookie Parser
// ====================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ====================================
// 3️⃣ Session Middleware
// ====================================
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'secret_key_nhom_6',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24, // 1 ngày
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// ====================================
// 4️⃣ Anti-Cache (Tránh lỗi quay lại trang sau khi logout)
// ====================================
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    next();
});

// ====================================
// ✅ 5️⃣ STATIC FILES
// ====================================
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// ====================================
// 6️⃣ ROUTES MOUNTING
// ====================================
// // 🚧 DEV MODE ONLY: GIẢ LẬP ĐĂNG NHẬP ĐỂ TEST CHAT
// // Bật cái này lên thì không cần Login cũng vào được Chat
// // Nhớ COMMENT lại khi merge code với Nhóm 1
// const FAKE_LOGIN_MODE = true; 

// app.use((req, res, next) => {
//     // Nếu đang bật chế độ Test -> Ghi đè luôn session (Bất chấp cookie cũ)
//     if (FAKE_LOGIN_MODE) {
        
//         // Check trên thanh địa chỉ: localhost:3000/chat?user=b
//         const isUserB = req.query.user === 'b'; 

//         if (isUserB) {
//             // Giả lập User B (Firefox/Tab 2)
//             req.session.user = {
//                 _id: "65f2d6c12345678912349999", 
//                 username: "tester_b",
//                 nickname: "Tester B (User 2)",
//                 avatar: "https://ui-avatars.com/api/?name=User+B&background=0D8ABC&color=fff",
//                 role: "user"
//             };
//         } else {
//             // Giả lập User A (Chrome/Tab 1)
//             req.session.user = {
//                 _id: "65f2d6c12345678912345678",
//                 username: "tester_a",
//                 nickname: "Tester A (User 1)",
//                 avatar: "https://ui-avatars.com/api/?name=User+A&background=random",
//                 role: "user"
//             };
//         }
        
//         // console.log(`⚠️ FAKE LOGIN ACTIVE: ${req.session.user.nickname}`);
//     }
//     next();
// });

// A. Auth Routes (Login, Register, Setup Nickname, Google)
// Route này trả về cả Giao diện (HTML) và Logic
app.use('/', authRoutes);

// B. API Routes (Trả về JSON data)
app.use('/api/chat', chatRoutes);     // API lấy tin nhắn, nhóm
app.use('/api/users', userRoutes);    // API tìm user, profile
app.use('/api/friends', friendRoutes);// API kết bạn
app.use('/api/upload', uploadRoutes); // API upload file
app.use('/api/admin', adminRoutes);   // API thống kê admin

// ====================================
// 7️⃣ VIEW ROUTES (Core Application Flow)
// ====================================
// Các route dưới đây giữ lại ở app.js để điều hướng chính xác luồng ứng dụng

const viewsPath = path.join(__dirname, '../views/html');

// --- Trang Chat (Main App) ---
app.get('/chat', ensureLoggedIn, async (req, res) => {
    const user = req.session.user;
    
    // Nếu user chưa có nickname -> Đá về trang setup
    // (Trang setup-nickname đã được xử lý trong authRoutes)
    if (!user?.nickname?.trim() || user.nickname === "New User") {
        req.session.tempUserId = user._id.toString();
        return res.redirect('/setup-nickname');
    }

    // Ghi log truy cập
    try { await AccessLog.logAccess(user._id); } catch(e) { console.error("Log Error:", e.message); }
    
    res.sendFile(path.join(viewsPath, 'chat.html'));
});

// --- Trang Admin ---
app.get('/admin', ensureLoggedIn, ensureAdmin, (req, res) => {
    res.sendFile(path.join(viewsPath, 'admin-dashboard.html'));
});

// --- Trang Chủ (Điều hướng thông minh) ---
app.get('/', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    // Nếu là admin -> vào dashboard
    if (['admin', 'superadmin'].includes(req.session.user.role)) {
        return res.redirect('/admin');
    }
    // User thường -> vào chat
    res.redirect('/chat');
});

// ====================================
// 8️⃣ Helper API
// ====================================
// API để frontend lấy thông tin user hiện tại (Dùng cho core.js)
app.get('/api/me', ensureLoggedInJSON, (req, res) => {
    const { _id, nickname, avatar, role, username } = req.session.user;
    res.json({ _id, nickname, avatar, role, username });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).send('<h1>404 - Not Found</h1>');
});

// Export cả app và sessionMiddleware để dùng bên server.js (Socket.IO)
module.exports = { app, sessionMiddleware };
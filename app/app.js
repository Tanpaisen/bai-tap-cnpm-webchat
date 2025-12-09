// btl/app/app.js

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
require('dotenv').config();
const passport = require('passport');
const AccessLog = require('../chat_app/models/AccessLog');

// import routes & middleware
const authRoutes = require('../auth_app/routes/auth');
const chatRoutes = require('../chat_app/routes/chatRoutes');
const userRoutes = require('../chat_app/routes/userRoutes');
const friendRoutes = require('../chat_app/routes/friendRoutes');
const uploadRoutes = require('../chat_app/routes/uploadRoutes');
const adminRoutes = require('../chat_app/routes/adminRoutes'); // ✅ 1. IMPORT ADMIN ROUTES

require('../chat_app/config/passport')(passport);

const { ensureLoggedIn, ensureLoggedInJSON, ensureAdmin } = require('../chat_app/middleware/auth'); // ✅ CẦN ensureAdmin CHO ROUTE ADMIN UI

const app = express();

// ====================================
// 1️⃣ CORS — cho phép cả localhost & devtunnel
// ====================================
const allowedOrigins = [
    'http://localhost:3000',
    'https://n7421zlm-3000.asse.devtunnels.ms'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('❌ CORS blocked for origin: ' + origin));
        }
    },
    credentials: true
}));

// ====================================
// 2️⃣ Body & cookie parser
// ====================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ====================================
// 3️⃣ Session lưu MongoDB (share giữa Express & Socket.IO)
// ====================================
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }

});

app.use(sessionMiddleware);

// ====================================
// ✅ PASSPORT MIDDLEWARE 
// ====================================
app.use(passport.initialize());
app.use(passport.session());


// ====================================
// 4️⃣ Chống cache cho /api
// ====================================
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

// ====================================
// 5️⃣ Routes API & Auth
// ====================================
app.use('/', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/upload', uploadRoutes);

// ====================================
// ✅ 6️⃣ ADMIN ROUTES (UI & API)
// ====================================
// Route API (ví dụ: /api/admin/users)
app.use('/api/admin', adminRoutes);

// Route UI GET /admin
// Vì route GET /admin nằm trong file adminRoutes.js, ta phải gắn kết nó ở cấp độ gốc ('/')
app.use('/', adminRoutes);


// ====================================
// 7️⃣ Static assets (no cache)
// ====================================
const noCacheStatic = {
    etag: false,
    lastModified: false,
    maxAge: 0,
    setHeaders: res => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
};

app.use('/chat',
    express.static(path.join(__dirname, '..', 'chat_app', 'views', 'chat'), noCacheStatic)
);
app.use('/chat/js',
    express.static(path.join(__dirname, '..', 'chat_app', 'views', 'frontend'), noCacheStatic)
);

app.use('/uploads',
    express.static(path.join(__dirname, '..', 'chat_app', 'uploads'), noCacheStatic)
);
console.log('📂 Static uploads served from:', path.join(__dirname, '..', 'chat_app', 'uploads'));

// ====================================
// 8️⃣ Chat UI
// ====================================
app.get('/chat', ensureLoggedIn, async (req, res) => { // ✅ THÊM ASYNC
    const user = req.session.user;
    if (!user?.nickname?.trim()) {
        req.session.tempUserId = user._id.toString();
        return res.redirect('/setup-nickname');
    }
    if (!user?.dateOfBirth || !user?.gender) {
        return res.redirect('/setup-nickname');
    }

    // ✅ GHI LOG TRUY CẬP (SAU KHI XÁC THỰC THÀNH CÔNG)
    try {
        await AccessLog.logAccess(user._id);
    } catch(e) {
        console.error('Lỗi khi ghi Access Log:', e);
    }
    
    res.sendFile(path.join(__dirname, '..', 'chat_app', 'views', 'chat', 'html', 'chat.html'));
});

// ====================================
// 9️⃣ Lấy user hiện tại
// ====================================
app.get('/api/me', ensureLoggedInJSON, (req, res) => {
    const { _id, nickname, avatar } = req.session.user;
    res.json({ _id, nickname, avatar });
});
app.get('/api/admin/me', (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.json({ success: false, message: 'Chưa đăng nhập' });
  }

  res.json({
    success: true,
    user: {
      _id: user._id,
      username: user.username,
      role: user.role
    }
  });
});



// ====================================
// 🔟 Trang chủ
// ====================================
app.get('/', (req, res) => {
    if (!req.session.user) {
        return res.sendFile(path.join(__dirname, '..', 'auth_app', 'views', 'login.html'));
    }
    // kiểm tra cả vai trò tại đây
    if (req.session.user.role === 'admin' || req.session.user.role === 'superadmin') {
        return res.redirect('/admin');
    }
    res.redirect('/chat');
});

module.exports = { app, sessionMiddleware };
// src/app.js

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
require('dotenv').config();
const passport = require('passport');

// ✅ 1. IMPORT MODELS & CONFIG (Đường dẫn mới trong src)
const AccessLog = require('./models/AccessLog');
require('./config/passport')(passport);

// ✅ 2. IMPORT ROUTES (Đường dẫn mới trong src)
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
// 1️⃣ CORS
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
// 2️⃣ Body & Cookie Parser
// ====================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ====================================
// 3️⃣ Session Middleware
// ====================================
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'secret_key',
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
app.use(passport.initialize());
app.use(passport.session());

// ====================================
// 4️⃣ Anti-Cache for API
// ====================================
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    next();
});

// ====================================
// ✅ 5️⃣ STATIC FILES (QUAN TRỌNG NHẤT)
// ====================================
// Vì app.js nằm trong /src, ta phải nhảy ra ngoài (..) để tìm folder public
app.use(express.static(path.join(__dirname, '../public')));

// Mapping riêng cho uploads để đảm bảo load ảnh avatar/file
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));


// ====================================
// 6️⃣ API Routes
// ====================================
app.use('/', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);

// ====================================
// 7️⃣ HTML Views Routes
// ====================================
// Định nghĩa đường dẫn tới folder views/html
const viewsPath = path.join(__dirname, '../views/html');

// Trang Login
app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.sendFile(path.join(viewsPath, 'login.html'));
});

// Trang Setup Nickname
app.get('/setup-nickname', ensureLoggedIn, (req, res) => {
    res.sendFile(path.join(viewsPath, 'setup-nickname.html'));
});

// Trang Admin (Load Dashboard)
app.get('/admin', ensureLoggedIn, ensureAdmin, (req, res) => {
    res.sendFile(path.join(viewsPath, 'admin-dashboard.html'));
});

// Trang Chat (Gốc)
app.get('/chat', ensureLoggedIn, async (req, res) => {
    const user = req.session.user;
    
    // Check nickname & info
    if (!user?.nickname?.trim() || !user?.dateOfBirth || !user?.gender) {
        req.session.tempUserId = user._id.toString();
        return res.redirect('/setup-nickname');
    }

    // Ghi Log Access
    try { await AccessLog.logAccess(user._id); } catch(e) { console.error(e); }
    
    res.sendFile(path.join(viewsPath, 'chat.html'));
});

// Trang Chủ (Redirect Logic)
app.get('/', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    if (req.session.user.role === 'admin' || req.session.user.role === 'superadmin') {
        return res.redirect('/admin');
    }
    res.redirect('/chat');
});

// ====================================
// 8️⃣ User API Helper
// ====================================
app.get('/api/me', ensureLoggedInJSON, (req, res) => {
    const { _id, nickname, avatar, role } = req.session.user;
    res.json({ _id, nickname, avatar, role });
});

module.exports = { app, sessionMiddleware };
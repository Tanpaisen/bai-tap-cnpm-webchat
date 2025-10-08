// btl/app/app.js
const express       = require('express');
const path          = require('path');
const cookieParser  = require('cookie-parser');
const session       = require('express-session');
const MongoStore    = require('connect-mongo');
require('dotenv').config();


// import routes & middleware
const authRoutes    = require('../auth_app/routes/auth');
const chatRoutes    = require('../chat_app/routes/chatRoutes');
const userRoutes    = require('../chat_app/routes/userRoutes');
const friendRoutes  = require('../chat_app/routes/friendRoutes');
const uploadRoutes  = require('../chat_app/routes/uploadRoutes');
const { ensureLoggedIn, ensureLoggedInJSON } =
  require('../chat_app/middleware/auth');

const app = express();

// 1. Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Cookie parser
app.use(cookieParser());

// 3. Session (MongoDB-backed)
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI
  }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
});


app.use(sessionMiddleware);

const cors = require('cors');
app.use(cors({
  origin: 'http://localhost:3000', 
  credentials: true
}));


// 6. Disable cache for all /api
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// 7. Chat UI page entry
app.get('/chat', ensureLoggedIn, (req, res) => {
  const user = req.session.user;
  if (!user?.nickname?.trim()) {
    req.session.tempUserId = user._id.toString();
    return res.redirect('/setup-nickname');
  }
  res.sendFile(
    path.join(__dirname, '..', 'chat_app', 'views', 'chat', 'html', 'chat.html')
  );
});

// 8. Get current user info
app.get('/api/me', ensureLoggedInJSON, (req, res) => {
  const { _id, nickname, avatar } = req.session.user;
  res.json({ _id, nickname, avatar });
});

// 4. Static file serving (no-cache)
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

// Chat UI
app.use(
  '/chat',
  express.static(
    path.join(__dirname, '..', 'chat_app', 'views', 'chat'),
    noCacheStatic
  )
);
app.use(
  '/chat/js',
  express.static(
    path.join(__dirname, '..', 'chat_app', 'views', 'frontend'),
    noCacheStatic
  )
);

// Uploaded files
app.use(
  '/uploads',
  express.static(
    path.join(__dirname, '..', 'chat_app', 'uploads'),
    noCacheStatic
  )
);
console.log('📂 Static uploads served from:', path.join(__dirname, '..', 'chat_app', 'uploads'));
app.use(
  '/uploads/avatars',
  express.static(
    path.join(__dirname, '..', 'chat_app', 'uploads', 'avatars'),
    noCacheStatic
  )
);
app.use(
  '/uploads/images',
  express.static(
    path.join(__dirname, '..', 'chat_app', 'uploads', 'images'),
    noCacheStatic
  )
);
app.use(
  '/uploads/files',
  express.static(
    path.join(__dirname, '..', 'chat_app', 'uploads', 'files'),
    noCacheStatic
  )
);


// 5. API routes
app.use('/',           authRoutes);
app.use('/api/chat',   chatRoutes);
app.use('/api/users',  userRoutes);
app.use('/api/friends',friendRoutes);
app.use('/api/upload', uploadRoutes);




module.exports = { app, sessionMiddleware };
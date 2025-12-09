// btl/server.js
const http = require('http');
const mongoose = require('mongoose');
// const { Server } = require('socket.io'); // ❌ XÓA DÒNG NÀY
const { app, sessionMiddleware } = require('./app/app');
const User = require('./chat_app/models/User');
const socketManager = require('./chat_app/socket/socketManager'); // ✅ IMPORT MỚI

const server = http.createServer(app);

// ⚙️ Cho phép cả localhost và DevTunnel
const allowedOrigins = [
    'http://localhost:3000',
    'https://n7421zlm-3000.asse.devtunnels.ms'
];

// ✅ Khởi tạo IO bằng socketManager
const io = socketManager.init(server, { 
    cors: {
        origin: allowedOrigins,
        credentials: true
    },
    pingInterval: 25000,
    pingTimeout: 60000
});

// Gắn socket.io vào app để có thể emit từ controller (Giữ nguyên)
app.set('io', io);

// 🧩 Dùng chung session giữa Express & Socket.IO
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// 🧠 Logic Socket.IO
io.on('connection', socket => {
    const sess = socket.request.session?.user;
    if (!sess) {
        socket.emit('unauthorized');
        return socket.disconnect();
    }

    const userId = sess._id.toString();
    const avatar = sess.avatar;
    const nickname = sess.nickname || 'Ẩn danh';

    socket.userId = userId;
    socket.avatar = avatar;
    socket.nickname = nickname;

    // ✅ GHI NHẬN USER ONLINE VÀO MANAGER
    socketManager.addOnlineUser(userId, socket.id); 

    // Đánh dấu online trong DB
    User.findByIdAndUpdate(userId, { online: true }).catch(console.error);

    // Gắn listener typing một lần duy nhất
    socket.on('typing', () => {
        if (!socket.currentRoomId) return;
        socket.to(socket.currentRoomId).emit('typing', {
            roomId: socket.currentRoomId,
            from: socket.userId,
            senderAvatar: socket.avatar,
            senderNickname: socket.nickname
        });
    });

    socket.on('stopTyping', () => {
        if (!socket.currentRoomId) return;
        socket.to(socket.currentRoomId).emit('stopTyping', {
            roomId: socket.currentRoomId,
            from: socket.userId
        });
    });

    // Người dùng join room
    socket.on('joinRoom', async roomId => {
        if (!roomId) return;
        socket.join(roomId);
        socket.currentRoomId = roomId;
        console.log(`✅ ${nickname} joined room ${roomId}`);
    });

    socket.on('newMessage', fullMsg => {
        if (!fullMsg || !fullMsg.roomId || !fullMsg.sender) {
            return console.warn('⚠️ Invalid message payload.');
        }
        socket.to(fullMsg.roomId).emit('newMessage', fullMsg);
        console.log(`📩 Broadcast message to room ${fullMsg.roomId}`);
    });

    socket.on('disconnect', () => {
        console.log(`🔴 ${nickname} disconnected`);
        // ✅ XÓA USER KHỎI MANAGER KHI DISCONNECT
        socketManager.removeOnlineUser(userId); 

        // Đánh dấu offline trong DB
        User.findByIdAndUpdate(userId, { online: false }).catch(console.error);
    });
});

// 🚀 Kết nối MongoDB và khởi động server
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB Atlas connected');
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`🚀 Server running at: http://localhost:${PORT}`);
            console.log(`🌐 Tunnel: https://n7421zlm-3000.asse.devtunnels.ms`);
        });
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
    });
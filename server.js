// btl/server.js
require('dotenv').config(); // Đảm bảo load biến môi trường đầu tiên
const http = require('http');
const mongoose = require('mongoose');
const { app, sessionMiddleware } = require('./src/app');
const User = require('./src/models/User');
const socketManager = require('./src/socket/socketManager');

const server = http.createServer(app);

// ⚙️ Cấu hình CORS linh hoạt hơn
const allowedOrigins = [
    'http://localhost:3000',
    process.env.DEVTUNNEL_URL // Nên để trong .env
].filter(Boolean); // Loại bỏ giá trị undefined nếu không có env

const io = socketManager.init(server, { 
    cors: {
        origin: allowedOrigins,
        credentials: true
    },
    pingInterval: 25000,
    pingTimeout: 60000
});

app.set('io', io);

// 🧩 Middleware Session cho Socket
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// 🧠 Logic Socket
io.on('connection', async (socket) => { // Thêm async để xử lý DB an toàn hơn
    const sess = socket.request.session?.user;
    
    // Bảo vệ chặt chẽ hơn: Check cả session và ID
    if (!sess || !sess._id) {
        socket.emit('unauthorized');
        return socket.disconnect();
    }

    const userId = sess._id.toString();
    const { avatar, nickname = 'Ẩn danh' } = sess;

    // Gán thông tin vào socket instance để dùng lại
    socket.userData = { userId, avatar, nickname };
    socket.join(userId); // Mẹo: Join room theo UserID để gửi noti cá nhân dễ hơn

    // ✅ Thêm vào Manager
    socketManager.addOnlineUser(userId, socket.id); 
    
    // Chỉ update DB thành Online nếu đây là connection đầu tiên của user
    // (Cần logic check trong socketManager, hoặc update "đè" lên cũng không sao)
    await User.findByIdAndUpdate(userId, { online: true });
    console.log(`✅ ${nickname} (${userId}) connected`);

    // --- CÁC EVENTS ---

    socket.on('typing', ({ roomId }) => {
        if (!roomId) return;
        socket.to(roomId).emit('typing', {
            roomId,
            from: userId,
            senderAvatar: avatar,
            senderNickname: nickname
        });
    });

    socket.on('stopTyping', ({ roomId }) => {
        if (!roomId) return;
        socket.to(roomId).emit('stopTyping', { roomId, from: userId });
    });

    socket.on('joinRoom', roomId => {
        if (!roomId) return;
        socket.join(roomId);
        console.log(`👥 ${nickname} joined room ${roomId}`);
    });

    socket.on('newMessage', fullMsg => {
        // Validation kỹ hơn
        if (!fullMsg?.roomId || !fullMsg?.sender) {
            return console.warn('⚠️ Invalid message payload from', userId);
        }
        // Gửi cho tất cả trong phòng TRỪ người gửi (socket.to)
        // Hoặc gửi cho tất cả bao gồm người gửi (io.in) tùy logic FE
        io.in(fullMsg.roomId).emit('newMessage', fullMsg);
    });

    socket.on('disconnect', async () => {
        console.log(`🔴 ${nickname} disconnected`);
        
        socketManager.removeOnlineUser(userId, socket.id);
        
        // Cải thiện logic offline: Check xem user còn kết nối nào khác không?
        // Giả sử socketManager có hàm check (nếu không có thì nên thêm vào)
        const isUserStillOnline = socketManager.isUserOnline(userId); 

        if (!isUserStillOnline) {
            await User.findByIdAndUpdate(userId, { online: false });
        }
    });
});

// 🚀 Start Server
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB Connected');
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    })
    .catch(err => console.error('❌ MongoDB Error:', err));
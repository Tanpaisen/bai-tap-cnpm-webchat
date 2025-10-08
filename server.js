//btl/server.js
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { app, sessionMiddleware } = require('./app/app');
const chatController = require('./chat_app/controllers/chatController');
const User = require('./chat_app/models/User');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    credentials: true
  },
  pingInterval: 25000,
  pingTimeout: 60000,
});

app.set('io', io);

// 🔗 Share session giữa Express & Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// 🧠 Socket.IO logic
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

  // Cập nhật trạng thái online
  User.findByIdAndUpdate(userId, { online: true }).catch(console.error);

  // Join room
  socket.on('joinRoom', async roomId => {
    if (!roomId) return;
    socket.join(roomId);
    console.log(`${nickname} joined room ${roomId}`);

    /// ==========================================
    // [THÊM MỚI] Xử lý Typing Indicator
    // ========================================
    socket.on('typing', data => {
      if (!data.roomId) return;

      // ✅ 1. SỬ DỤNG PAYLOAD VÀ GÁN ID/AVATAR
      const payload = {
        roomId: data.roomId,
        from: socket.userId,
        senderAvatar: socket.avatar,
        // Bạn có thể thêm cả nickname nếu muốn
        // senderNickname: socket.nickname
      };
      // ✅ 2. Phát sóng đối tượng payload
      socket.to(data.roomId).emit('typing', payload);
    });

    socket.on('stopTyping', data => {
      if (!data.roomId) return;

      // ✅ SỬA LỖI: Tạo payload để gửi ID người gửi
      const payload = {
        roomId: data.roomId,
        from: socket.userId // Vẫn nên truyền 'from' để client biết ai đang dừng gõ (nếu cần)
      };

      // Phát sóng TỚI TẤT CẢ mọi người TRONG PHÒNG, TRỪ chính người gửi
      socket.to(data.roomId).emit('stopTyping', payload);
    });

  });


  // Nhận tin nhắn
  socket.on('newMessage', fullMsg => {
    // fullMsg là tin nhắn đã được lưu vào DB và gửi từ Client
    if (!fullMsg || !fullMsg.roomId || !fullMsg.sender) {
      return console.warn('Invalid newMessage broadcast payload. Missing roomId or sender.');
    }

    // Phát sóng đến TẤT CẢ client TRONG PHÒNG, TRỪ CHÍNH NGƯỜI GỬI (socket.to)
    socket.to(fullMsg.roomId).emit('newMessage', fullMsg);
    console.log(`📤 [Broadcast] Tin nhắn mới đã được phát sóng tới phòng ${fullMsg.roomId}`);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`🔴 ${nickname} disconnected`);
    User.findByIdAndUpdate(userId, { online: false }).catch(console.error);
  });

});

// 🚀 Kết nối Mongo và khởi động server

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Atlas connected');
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
  });
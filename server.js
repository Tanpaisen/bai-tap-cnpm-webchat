//btl/server.js
const http       = require('http');
const mongoose   = require('mongoose');
const { Server } = require('socket.io');
const { app, sessionMiddleware } = require('./app/app');
const chatController = require('./chat_app/controllers/chatController');
const User = require('./chat_app/models/User');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    credentials: true
  }
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

  const userId   = sess._id.toString();
  const avatar   = sess.avatar;
  const nickname = sess.nickname || 'Ẩn danh';
  console.log(`🟢 ${nickname} connected: ${socket.id}`);

  // Cập nhật trạng thái online
  User.findByIdAndUpdate(userId, { online: true }).catch(console.error);

  // Join room
  socket.on('joinRoom', async roomId => {
    if (!roomId) return;
    socket.join(roomId);
    console.log(`${nickname} joined room ${roomId}`);

    // Nếu muốn gửi lịch sử:
    // const msgs = await chatController.getMessages(roomId);
    // socket.emit('history', msgs);
  });

  // Nhận tin nhắn
  socket.on('sendMessage', async payload => {
    const { to, roomId, content, file, image } = payload;
    if (!to || !roomId || (!content && !file && !image)) {
      return console.warn('Invalid sendMessage payload', payload);
    }

    try {//lưu tin vào mongo
      const msgDoc = await chatController.saveMessage({
        sender: userId,
        receiver: to,
        room: roomId,
        content,
        file,
        image
      });

      await msgDoc.populate('sender', '_id avatar nickname online');
      const fullMsg = msgDoc.toObject();

      //tất cả thành viên trong room
      io.in(roomId).emit('newMessage', fullMsg);
      console.log('📤 newMessage broadcasted:', fullMsg);
    } catch (err) {
      console.error('saveMessage error:', err);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`🔴 ${nickname} disconnected`);
    User.findByIdAndUpdate(userId, { online: false }).catch(console.error);
  });
});

// 🚀 Kết nối Mongo và khởi động server
mongoose
  .connect('mongodb://tancan7:taaiv007@127.0.0.1:27017/authDB?authSource=authDB')
  .then(() => {
    console.log('✅ MongoDB connected');
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
  });

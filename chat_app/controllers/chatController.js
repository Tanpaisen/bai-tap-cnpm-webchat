// btl/chat_app/controllers/chatController.js
const Message = require('../models/Message');
const mongoose = require('mongoose');

async function getHistory(req, res) {
  try {
    const { user1, user2, limit = 50, skip = 0 } = req.query;
    const sessionUser = req.session?.user?._id;

    const sessionUserIdStr = sessionUser ? sessionUser.toString() : null;

    if (!user1 || !user2) {
      return res.status(400).json({ error: 'Thiếu user1 hoặc user2' });
    }
    if (!mongoose.isValidObjectId(user1) || !mongoose.isValidObjectId(user2)) {
      return res.status(400).json({ error: 'ID người dùng không hợp lệ' });
    }
    if (!sessionUser || (sessionUser !== user1 && sessionUser !== user2)) {
      return res.status(403).json({ error: 'Không có quyền truy cập đoạn chat này' });
    }

    const roomId = [user1, user2].sort().join('_');
    const parsedLimit = Number.isFinite(Number(limit)) ? Math.min(Number(limit), 100) : 50;
    const parsedSkip = Number.isFinite(Number(skip)) ? Math.max(Number(skip), 0) : 0;

    const messages = await Message.find({ room: roomId })
      .sort({ createdAt: -1 })
      .skip(parsedSkip)
      .limit(parsedLimit)
      .populate('sender', '_id avatar nickname online')
      .lean();

    return res.json(messages);
  } catch (err) {
    console.error('❌ getHistory error:', err);
    return res.status(500).json({ error: 'Lỗi khi tải lịch sử tin nhắn' });
  }
}

async function sendMessageREST(req, res) {
  try {
    const sessionUser = req.session?.user;
    if (!sessionUser || !sessionUser._id) {
      return res.status(401).json({ error: 'Chưa đăng nhập' });
    }

    const from = sessionUser._id.toString();
    const { receiver, roomId, text, image, file } = req.body;

    if (!receiver || !roomId || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Thiếu hoặc không hợp lệ receiver/roomId/text' });
    }

    if (!mongoose.isValidObjectId(from) || !mongoose.isValidObjectId(receiver)) {
      return res.status(400).json({ error: 'ID người gửi/nhận không hợp lệ' });
    }

    if (image && !/^\/uploads\/images\//.test(image)) {
      return res.status(400).json({ error: 'Đường dẫn ảnh không hợp lệ' });
    }
    if (file && !/^\/uploads\/files\//.test(file)) {
      return res.status(400).json({ error: 'Đường dẫn file không hợp lệ' });
    }

    const msgDoc = await Message.create({
      sender: from,
      receiver,
      room: roomId,
      content: text.trim(),
      ...(image && { image }),
      ...(file && { file }),
      createdAt: new Date()
    });

    await msgDoc.populate('sender', '_id avatar nickname online');
    const saved = msgDoc.toObject();

    const io = req.app.get('io');
    if (io && io.in) io.in(roomId).emit('newMessage', saved);

    return res.json(saved);
  } catch (err) {
    console.error('❌ sendMessageREST error:', err);
    return res.status(500).json({ error: 'Lỗi khi gửi tin nhắn' });
  }
}

async function saveMessage({ sender, receiver, room, content, file, image }) {
  try {
    const msgDoc = await Message.create({
      sender,
      receiver,
      room,
      content: content?.trim(),
      ...(image && { image }),
      ...(file && { file }),
      createdAt: new Date()
    });
    return msgDoc;
  } catch (err) {
    console.error('❌ saveMessage error:', err);
    return null;
  }
}

module.exports = { 
  getHistory, 
  sendMessageREST, 
  saveMessage 
};

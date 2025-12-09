const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  isGroup: { type: Boolean, default: false }, // Đánh dấu là nhóm hay chat riêng
  name: { type: String }, // Tên nhóm (nếu là nhóm)
  avatar: { type: String }, // Avatar nhóm
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Admin nhóm
  
  // Danh sách thành viên trong cuộc trò chuyện
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  memberNicknames: {  type: Map,  of: String, default: {}  },
  
  // Tin nhắn cuối cùng để hiển thị ở sidebar
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' }
}, { timestamps: true });

module.exports = mongoose.models.Chat || mongoose.model('Chat', chatSchema);
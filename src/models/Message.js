const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  content: { type: String, maxlength: 5000 },
  image: { type: String },
  file: { type: String },
  
  // Loại tin nhắn: text, image, file, hoặc system (thông báo hệ thống)
  type: { type: String, default: 'text' } 
}, { timestamps: true });

module.exports = mongoose.models.Message || mongoose.model('Message', messageSchema);
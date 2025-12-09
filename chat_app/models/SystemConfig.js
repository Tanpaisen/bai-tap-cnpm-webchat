// chat_app/models/SystemConfig.js

const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
    // Lưu danh sách từ cấm dưới dạng chuỗi (phân cách bằng dấu phẩy, ví dụ: "ngu, dot,...")
    profanityBlacklist: { 
        type: String, 
        default: '',
        trim: true
    }, 
    
    // Cấu hình khác (ví dụ: độ dài tin nhắn tối đa)
    maxMessageLength: { 
        type: Number, 
        default: 250 
    },

    // Trường khóa để đảm bảo chỉ có một document CONFIG duy nhất
    key: { 
        type: String, 
        default: 'CONFIG', 
        unique: true 
    } 
}, { 
    timestamps: true // Thêm createdAt và updatedAt
});

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
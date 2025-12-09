// chat_app/models/AccessLog.js

const mongoose = require('mongoose');

const accessLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true // Đánh index để truy vấn theo user nhanh hơn
    },
    // Ghi lại thời điểm truy cập
    accessedAt: {
        type: Date,
        default: Date.now,
        index: true // Đánh index để truy vấn theo thời gian nhanh hơn
    },
    // Trường này giúp phân biệt các lần truy cập trong cùng một ngày
    dateString: {
        type: String,
        required: true,
        // Định dạng YYYY-MM-DD
    }
}, { 
    // Không cần timestamps (createdAt, updatedAt) mặc định
    timestamps: false 
});

// Đảm bảo không ghi lại quá nhiều log nếu người dùng refresh liên tục
// Chỉ ghi lại một bản ghi mới nếu lần truy cập cuối cùng là cách đây ít nhất 5 phút
accessLogSchema.statics.logAccess = async function(userId) {
    const cutoffTime = new Date(Date.now() - 5 * 60 * 1000); // 5 phút trước
    const today = new Date().toISOString().split('T')[0]; // Định dạng YYYY-MM-DD

    const lastLog = await this.findOne({ user: userId })
        .sort({ accessedAt: -1 }) // Sắp xếp giảm dần theo thời gian
        .select('accessedAt');
    
    // Nếu chưa có log, hoặc log gần nhất cách đây hơn 5 phút
    if (!lastLog || lastLog.accessedAt < cutoffTime) {
        await this.create({ 
            user: userId, 
            dateString: today, 
            accessedAt: new Date()
        });
        console.log(`[AccessLog] Ghi log truy cập cho User: ${userId}`);
    }
};

module.exports = mongoose.model('AccessLog', accessLogSchema);
// chat_app/models/AdminLog.js

const mongoose = require('mongoose');

const AdminLogSchema = new mongoose.Schema({
    // 1. NGƯỜI THỰC HIỆN HÀNH ĐỘNG
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Tham chiếu đến Admin (người đã đăng nhập)
        required: true
    },

    // 2. LOẠI HÀNH ĐỘNG
    action: {
        type: String,
        enum: ['BAN', 'UNBAN', 'DELETE_MESSAGE', 'DELETE_USER', 'CHANGE_ROLE', 'SYSTEM_CONFIG'],
        required: true,
        index: true // Tạo chỉ mục để truy vấn nhanh chóng
    },

    // 3. ĐỐI TƯỢNG BỊ ẢNH HƯỞNG
    targetUser: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        default: null 
    },
    targetMessage: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Message', 
        default: null 
    },
    targetRoom: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Room', 
        default: null 
    },

    // 4. THÔNG TIN BỔ SUNG (Ví dụ: lý do ban, xóa, v.v.)
    reason: {
        type: String,
        maxlength: 500,
        default: null
    },

}, { 
    timestamps: true // Sử dụng timestamps để có createdAt và updatedAt tự động
});

// Đổi tên trường createdAt thành 'time' trong frontend để dễ đọc hơn
AdminLogSchema.virtual('time').get(function() {
    return this.createdAt;
});

// Tạo chỉ mục bổ sung để tối ưu hóa truy vấn theo thời gian và hành động (nếu cần)
AdminLogSchema.index({ admin: 1, createdAt: -1 }); // Có thể tùy chỉnh thêm nếu cần

// Expose schema như là model
module.exports = mongoose.model('AdminLog', AdminLogSchema);

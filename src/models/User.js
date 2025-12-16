// chat_app/models/User.js (Phiên bản ĐÃ CẬP NHẬT)

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true, index:true, minlength: 6, maxlength: 50},
    password: { type: String,}, //required: true, minlength: 6, maxlength: 75 },
    googleId: { type: String, unique: true, sparse: true },
    otp: { type: String }, 
    otpExpires: { type: Date },

    nickname: { type: String, minlength: 1, maxlength: 50 },
    avatar: { type: String, default: 'https://i.pinimg.com/originals/8d/a5/c3/8da5c3a06407303694d6381b23368f02.png' },

    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other'], default: 'other' },

    isIncomingEnabled: { type: Boolean, default: true },
    mainBackground: { type: String, default: '' },

    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    lastPasswordChange: { type: Date, default: Date.now },
    online: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    
    // =======================================================
    // ✅ BỔ SUNG TRƯỜNG QUẢN TRỊ ADMIN CHO CHỨC NĂNG CẤM (BAN)
    // =======================================================
    role: { 
        type: String, 
        enum: ['user', 'admin', 'superadmin'], 
        default: 'user' 
    },
    isBanned: {
        type: Boolean,
        default: false,
        index: true // Giúp tìm kiếm nhanh người dùng bị khóa
    },
    banReason: {
        type: String,
        default: null,
        maxlength: 255
    },
    bannedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Tham chiếu đến Admin đã thực hiện lệnh cấm
        default: null
    },
    bannedAt: {
        type: Date,
        default: null
    },
    banExpires: {
        type: Date,
        default: null // Nếu là null, cấm vĩnh viễn
    }
});

// ✅ Hash password trước khi lưu
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// ✅ So sánh mật khẩu
userSchema.methods.comparePassword = function (candidate) {
    return bcrypt.compare(candidate, this.password);
};

// ✅ Ẩn mật khẩu và thông tin quản trị nhạy cảm khi trả về JSON cho người dùng thường
userSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.password;
        // 💡 Giữ lại isBanned để client biết tài khoản bị khóa
        // delete ret.banReason; 
        // delete ret.bannedBy; 
        // delete ret.bannedAt; 
        // delete ret.banExpires; 
        return ret;
    }
});

module.exports = mongoose.model('User', userSchema);
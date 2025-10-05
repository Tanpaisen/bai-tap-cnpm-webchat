//models/User.js
const mongoose = require('mongoose');
const bcrypt   = require('bcrypt');

const userSchema = new mongoose.Schema({
  username:           { type: String, unique: true, required: true },
  password:           { type: String, required: true, minlength: 6, maxlength: 100 },
  nickname:           { type: String, default: '', maxlength: 50 },
  avatar:             { type: String, default: 'https://i.pinimg.com/originals/8d/a5/c3/8da5c3a06407303694d6381b23368f02.png' },
  friends:            [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastPasswordChange: { type: Date, default: Date.now },
  online:             { type: Boolean, default: false },
  createdAt:          { type: Date, default: Date.now }
});

// ✅ Hash password trước khi lưu
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// ✅ So sánh mật khẩu
userSchema.methods.comparePassword = function(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// ✅ Ẩn mật khẩu khi trả về JSON
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
